import * as path from "path";
import * as vscode from "vscode";
import { Message as MemoryMessage } from "../memory/MemoryManager";
import type MemoryManager from "../memory/MemoryManager";
import { Message, OllamaProvider } from "../providers/OllamaProvider";
import ContextBuilder from "../tools/ContextBuilder";

interface WebviewMessage {
  type: string;
  text?: string;
  sessionId?: string;
}

const KNOWN_EXTENSIONS = new Set([".ts", ".js", ".py", ".json", ".md", ".css", ".html"]);

function hasFileReference(text: string): boolean {
  const match = text.match(/\.[a-zA-Z0-9]{1,6}\b/g);

  if (!match) {
    return false;
  }

  return match.some((ext) => KNOWN_EXTENSIONS.has(ext.toLowerCase()));
}

function getActiveFileName(): string | undefined {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    return undefined;
  }

  const folders = vscode.workspace.workspaceFolders;
  const filePath = editor.document.fileName;

  if (folders && folders.length > 0) {
    return path.relative(folders[0].uri.fsPath, filePath);
  }

  return path.basename(filePath);
}

export class ChatPanel implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private streaming: boolean = false;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly ollama: OllamaProvider,
    private readonly ctxBuilder: ContextBuilder,
    private readonly onSendMessage?: (text: string) => Promise<boolean>,
    private readonly memoryPromise?: Promise<MemoryManager>,
  ) { }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = this.getHtml();

    webviewView.onDidDispose(() => { /* cleanup handled by VS Code */ });

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        return;
      }

      const name = getActiveFileName();

      if (name) {
        void this.postMessage({ type: "activeFile", name });
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "ready") {
        const status = await this.ollama.checkConnection();
        const model = vscode.workspace.getConfiguration("codexLocal").get<string>("model", "gemma4:e2b");

        await this.postMessage({ type: "status", ok: status.ok, model });

        const name = getActiveFileName();

        if (name) {
          await this.postMessage({ type: "activeFile", name });
        }

        // Load history from the most recent session
        const memory = await this.memoryPromise;

        if (memory) {
          const messages = memory.getRecentMessages();
          await this.postMessage({ type: "loadHistory", messages });
        }

        return;
      }

      if (message.type === "sendMessage") {
        if (typeof message.text === "string") {
          if (this.onSendMessage) {
            const intercepted = await this.onSendMessage(message.text);

            if (intercepted) {
              return;
            }
          }

          await this.handleUserMessage(message.text);
        }

        return;
      }

      if (message.type === "newSession") {
        const memory = await this.memoryPromise;

        if (memory) {
          memory.newSession();
        }

        await this.postMessage({ type: "clearChat" });
        return;
      }

      if (message.type === "clearHistory") {
        const memory = await this.memoryPromise;

        if (memory) {
          memory.clearCurrentSession();
        }

        await this.postMessage({ type: "clearChat" });
        return;
      }

      if (message.type === "loadSessions") {
        const memory = await this.memoryPromise;
        const sessions = memory ? memory.getSessions() : [];

        await this.postMessage({ type: "sessions", data: sessions });
        return;
      }

      if (message.type === "loadSession") {
        if (typeof message.sessionId === "string") {
          const memory = await this.memoryPromise;
          const messages = memory ? memory.loadSession(message.sessionId) : [];

          await this.postMessage({ type: "loadHistory", messages });
        }

        return;
      }

      if (message.type === "clearChat") {
        await this.postMessage({ type: "clearChat" });
      }

      if (message.type === "stopStream") {
        this.ollama.stopStream();
      }

      if (message.type === "analyzeProject") {
        await vscode.commands.executeCommand("codexLocal.analyzeProject");
      }
    });
  }

  private async postMessage(message: unknown): Promise<void> {
    await this.view?.webview.postMessage(message);
  }

  public async sendToWebview(message: unknown): Promise<void> {
    await this.postMessage(message);
  }

  public sendPrefilled(text: string): void {
    void this.postMessage({ type: "prefill", text });
  }

  private async handleUserMessage(text: string): Promise<void> {
    if (this.ollama.streaming) {
      return;
    }

    const connection = await this.ollama.checkConnection();

    if (!connection.ok) {
      await this.postMessage({ type: "startAssistant" });
      await this.postMessage({ type: "appendAssistant", content: "⚠️ " + (connection.error ?? "Ollama is not available") });
      await this.postMessage({ type: "doneAssistant" });
      return;
    }

    await this.postMessage({ type: "startAssistant" });

    // Save user message to memory
    const memory = await this.memoryPromise;

    if (memory) {
      memory.saveMessage("user", text);
    }

    // Build file context
    let fileContext: string | undefined;

    if (hasFileReference(text)) {
      const ctx = this.ctxBuilder.buildContext();
      fileContext = ctx ? this.ctxBuilder.formatContext(ctx) : undefined;
    } else {
      const workspaceTree = this.ctxBuilder.getWorkspaceTree();
      const detectedPath = await this.ollama.detectTargetFile(text, workspaceTree);

      if (detectedPath !== null) {
        const content = this.ctxBuilder.readFileByPath(detectedPath);

        if (content !== null) {
          fileContext = `File: ${path.basename(detectedPath)}\n\nFile contents:\n\`\`\`\n${content}\n\`\`\``;
        }
      }

      if (fileContext === undefined) {
        const ctx = this.ctxBuilder.buildContext();
        fileContext = ctx ? this.ctxBuilder.formatContext(ctx) : undefined;
      }
    }

    // Append any @mentioned files to context
    const mentionedPaths = this.ctxBuilder.extractMentions(text);

    if (mentionedPaths.length > 0) {
      const mentionedFiles = this.ctxBuilder.readMultipleFiles(mentionedPaths);

      if (mentionedFiles.length > 0) {
        const mentionedContext = this.ctxBuilder.formatMultipleFiles(mentionedFiles);
        fileContext = (fileContext ?? "") + "\n\n--- MENTIONED FILES ---\n" + mentionedContext;
      }
    }

    // Auto-inject local imports of the active file (skip if @mentions already filled the budget)
    if (mentionedPaths.length < 3) {
      const activeCtx = this.ctxBuilder.buildContext();

      if (activeCtx) {
        const importedPaths = this.ctxBuilder.extractLocalImports(activeCtx.fileContent, activeCtx.filePath);

        // Exclude any paths already included via @mentions
        const mentionedSet = new Set(mentionedPaths);
        const newImports = importedPaths.filter((p) => !mentionedSet.has(p));

        if (newImports.length > 0) {
          const importedFiles = this.ctxBuilder.readMultipleFiles(newImports);

          if (importedFiles.length > 0) {
            const importedContext = this.ctxBuilder.formatMultipleFiles(importedFiles);
            fileContext = (fileContext ?? "") + "\n\n--- IMPORTED FILES ---\n" + importedContext;
          }
        }
      }
    }

    // Use full session history as messages array, with summarization if needed
    const allHistory: Message[] = memory
      ? memory.getRecentMessages(50).map((m: MemoryMessage) => ({
        role: m.role,
        content: m.content,
      }))
      : [{ role: "user", content: text }];

    let historyMessages: Message[];

    if (memory && memory.getMessageCount() > 30) {
      const liveMessages = allHistory.slice(-6);
      const olderMessages = allHistory.slice(0, -6);
      const summary = await this.ollama.summarizeHistory(olderMessages);

      if (summary !== null) {
        historyMessages = [
          { role: "system", content: "Previous conversation summary: " + summary },
          ...liveMessages,
        ];
      } else {
        historyMessages = allHistory;
      }
    } else {
      historyMessages = allHistory;
    }

    let fullResponse = "";

    for await (const chunk of this.ollama.streamChat(historyMessages, fileContext)) {
      fullResponse += chunk.content;
      await this.postMessage({ type: "appendAssistant", content: chunk.content });
    }

    // Save completed assistant response to memory
    if (memory && fullResponse.length > 0) {
      memory.saveMessage("assistant", fullResponse);
    }

    await this.postMessage({ type: "doneAssistant" });
  }

  private getHtml(): string {
    const html = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * {
      box-sizing: border-box;
    }

    body {
      display: flex;
      flex-direction: column;
      height: 100vh;
      margin: 0;
      overflow: hidden;
      background: var(--vscode-sideBar-background);
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
      background: var(--vscode-sideBarSectionHeader-background);
      flex: 0 0 auto;
    }

    .header-left,
    .header-actions,
    .input-row {
      display: flex;
      align-items: center;
    }

    .header-left {
      min-width: 0;
      gap: 6px;
    }

    .header-actions {
      gap: 2px;
    }

    #status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      transition: background 0.3s;
      flex: 0 0 auto;
    }

    #status-dot.ok {
      background: #4ec94e;
    }

    #status-dot.err {
      background: var(--vscode-errorForeground);
    }

    #model-badge {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 2px 7px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 11px;
    }

    .icon-btn {
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: var(--vscode-icon-foreground);
      cursor: pointer;
      opacity: 0.7;
    }

    .icon-btn:hover {
      background: var(--vscode-toolbar-hoverBackground);
      opacity: 1;
    }

    #history-panel {
      display: none;
      flex-direction: column;
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
      max-height: 180px;
      overflow-y: auto;
    }

    #history-panel.open {
      display: flex;
    }

    .session-item {
      padding: 6px 10px;
      cursor: pointer;
      font-size: 11px;
      border-bottom: 1px solid var(--vscode-list-inactiveSelectionBackground);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .session-item:hover {
      background: var(--vscode-list-hoverBackground);
    }

    .session-label {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .session-count {
      opacity: 0.5;
      font-size: 10px;
    }

    #messages {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: 10px;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 10px;
    }

    .message {
      line-height: 1.45;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }

    .message.user {
      align-self: flex-end;
      max-width: 90%;
      padding: 8px 10px;
      border: 1px solid var(--vscode-inputOption-activeBorder);
      border-radius: 8px;
      background: var(--vscode-inputOption-activeBackground);
    }

    .message.assistant {
      align-self: flex-start;
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 8px;
      background: var(--vscode-editor-background);
    }

    .message.system {
      align-self: center;
      padding: 8px 10px;
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 8px;
      background: transparent;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-align: center;
    }

    .input-area {
      display: flex;
      flex: 0 0 auto;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      border-top: 1px solid var(--vscode-sideBarSectionHeader-border);
    }

    #ctx-file,
    .hint {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .input-row {
      gap: 6px;
    }

    #input {
      flex: 1;
      min-height: 36px;
      max-height: 120px;
      padding: 7px 10px;
      resize: none;
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
      outline: none;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.4;
    }

    #input:focus {
      border-color: var(--vscode-focusBorder);
    }

    #send-btn {
      height: 36px;
      padding: 7px 12px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      cursor: pointer;
    }

    #send-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    #send-btn:disabled {
      cursor: default;
      opacity: 0.5;
    }

    #stop-btn {
      height: 36px;
      padding: 7px 12px;
      border: none;
      border-radius: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      cursor: pointer;
      display: none;
    }

    #stop-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    .cursor::after {
      content: '▌';
      animation: blink 0.9s step-end infinite;
      color: var(--vscode-editor-foreground);
      opacity: 0.8;
    }

    @keyframes blink {
      0%, 100% {
        opacity: 0.8;
      }

      50% {
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="header-left">
      <span id="status-dot"></span>
      <span id="model-badge">gemma4:e2b</span>
    </div>
    <div class="header-actions">
      <button class="icon-btn" id="history-btn" type="button" title="History">🕓</button>
      <button class="icon-btn" id="new-session-btn" type="button" title="New session">＋</button>
      <button class="icon-btn" id="clear-chat-btn" type="button" title="Clear chat">🗑</button>
      <button class="icon-btn" id="btn-analyze" type="button" title="Analyze Project">🔍</button>
    </div>
  </header>

  <div id="history-panel">
    <div id="session-list"></div>
  </div>

  <div id="messages"></div>

  <div class="input-area">
    <div id="ctx-file">📄 No file open</div>
    <div class="input-row">
      <textarea id="input" rows="1" placeholder="Ask about your code... (Enter to send, Shift+Enter for newline)"></textarea>
      <button id="send-btn" type="button" title="Send">➤</button>
      <button id="stop-btn" type="button" title="Stop response">⏹</button>
    </div>
    <div class="hint">Shift+Enter for newline</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let streaming = false;
    const messages = document.getElementById("messages");
    const input = document.getElementById("input");
    const sendBtn = document.getElementById("send-btn");
    const stopBtn = document.getElementById("stop-btn");
    const statusDot = document.getElementById("status-dot");
    const modelBadge = document.getElementById("model-badge");
    const ctxFile = document.getElementById("ctx-file");
    const clearChatBtn = document.getElementById("clear-chat-btn");
    const historyBtn = document.getElementById("history-btn");
    const newSessionBtn = document.getElementById("new-session-btn");
    const historyPanel = document.getElementById("history-panel");
    const sessionList = document.getElementById("session-list");
    const btnAnalyze = document.getElementById("btn-analyze");
    let currentAssistantEl = null;

    function appendMessage(role, text) {
      const el = document.createElement("div");
      el.className = "message " + role;
      el.textContent = text;
      messages.appendChild(el);
      scrollToBottom();
      return el;
    }

    function renderWelcome() {
      messages.textContent = "";
      appendMessage("system", "👋 Codex Local is ready. Ask anything about your code.");
    }

    function scrollToBottom() {
      messages.scrollTop = messages.scrollHeight;
    }

    function resizeInput() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    }

    function sendMessage() {
      if (streaming) {
        return;
      }

      const text = input.value.trim();

      if (!text) {
        return;
      }

      sendBtn.disabled = true;
      appendMessage("user", text);
      input.value = "";
      resizeInput();
      vscode.postMessage({ type: "sendMessage", text });
    }

    historyBtn.addEventListener("click", () => {
      const isOpen = historyPanel.classList.toggle("open");

      if (isOpen) {
        vscode.postMessage({ type: "loadSessions" });
      }
    });

    newSessionBtn.addEventListener("click", () => {
      historyPanel.classList.remove("open");
      vscode.postMessage({ type: "newSession" });
    });

    sendBtn.addEventListener("click", sendMessage);

    stopBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "stopStream" });
      stopBtn.style.display = "none";
      sendBtn.disabled = false;
    });

    clearChatBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "clearHistory" });
    });

    btnAnalyze.addEventListener("click", () => {
      vscode.postMessage({ type: "analyzeProject" });
    });

    input.addEventListener("input", resizeInput);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    window.addEventListener("message", (event) => {
      const message = event.data;

      if (message.type === "status") {
        statusDot.className = message.ok ? "ok" : "err";
        modelBadge.textContent = message.model;
        return;
      }

      if (message.type === "clearChat") {
        renderWelcome();
        return;
      }

      if (message.type === "activeFile") {
        ctxFile.textContent = "📄 " + message.name;
        return;
      }

      if (message.type === "sessions") {
        sessionList.textContent = "";

        if (!message.data || message.data.length === 0) {
          const placeholder = document.createElement("div");
          placeholder.className = "session-item";
          placeholder.textContent = "No history yet";
          sessionList.appendChild(placeholder);
          return;
        }

        message.data.forEach((session) => {
          const item = document.createElement("div");
          item.className = "session-item";

          const labelEl = document.createElement("span");
          labelEl.className = "session-label";
          labelEl.textContent = session.label;

          const countEl = document.createElement("span");
          countEl.className = "session-count";
          countEl.textContent = session.messageCount + " msgs";

          item.appendChild(labelEl);
          item.appendChild(countEl);

          item.addEventListener("click", () => {
            historyPanel.classList.remove("open");
            vscode.postMessage({ type: "loadSession", sessionId: session.id });
          });

          sessionList.appendChild(item);
        });

        return;
      }

      if (message.type === "loadHistory") {
        messages.textContent = "";

        if (!message.messages || message.messages.length === 0) {
          renderWelcome();
          return;
        }

        message.messages.forEach((msg) => {
          appendMessage(msg.role, msg.content);
        });

        return;
      }

      if (message.type === "startAssistant") {
        currentAssistantEl = appendMessage("assistant", "");
        currentAssistantEl.classList.add("cursor");
        streaming = true;
        sendBtn.disabled = true;
        stopBtn.style.display = "inline-block";
        return;
      }

      if (message.type === "appendAssistant") {
        if (!currentAssistantEl) {
          currentAssistantEl = appendMessage("assistant", "");
        }

        currentAssistantEl.innerText += message.content;
        scrollToBottom();
        return;
      }

      if (message.type === "doneAssistant") {
        if (currentAssistantEl) {
          currentAssistantEl.classList.remove("cursor");
        }

        currentAssistantEl = null;
        streaming = false;
        sendBtn.disabled = false;
        stopBtn.style.display = "none";
        return;
      }

      if (message.type === "prefill") {
        input.value = message.text ?? "";
        resizeInput();
        input.focus();
        return;
      }
    });

    renderWelcome();
    resizeInput();
    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;

    return html;
  }
}
