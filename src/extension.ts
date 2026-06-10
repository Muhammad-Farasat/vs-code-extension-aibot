import * as path from "path";
import * as vscode from "vscode";
import MemoryManager from "./memory/MemoryManager";
import { OllamaProvider } from "./providers/OllamaProvider";
import ContextBuilder from "./tools/ContextBuilder";
import { ChatPanel } from "./webview/ChatPanel";

function registerComingSoonCommand(context: vscode.ExtensionContext, command: string): void {
  const disposable = vscode.commands.registerCommand(command, async () => {
    await vscode.window.showInformationMessage("Codex Local coming soon");
  });

  context.subscriptions.push(disposable);
}

async function checkOllamaConnection(ollamaProvider: OllamaProvider): Promise<void> {
  const connection = await ollamaProvider.checkConnection();

  if (connection.ok) {
    await vscode.window.showInformationMessage("Codex Local connected to Ollama");
  } else {
    await vscode.window.showErrorMessage(connection.error ?? "Codex Local could not connect to Ollama");
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const ollamaProvider = new OllamaProvider();
  const contextBuilder = new ContextBuilder();

  // Create memory asynchronously; pass the promise so ChatPanel can await it lazily
  const memoryPromise = MemoryManager.create(context.globalStorageUri.fsPath);

  // Register disposable to close DB on deactivate
  context.subscriptions.push({
    dispose: () => {
      void memoryPromise.then((memory) => memory.close()).catch(() => { /* ignore */ });
    },
  });

  const chatPanel = new ChatPanel(
    context.extensionUri,
    ollamaProvider,
    contextBuilder,
    async (text: string): Promise<boolean> => {
      if (!ollamaProvider.detectFileCreationIntent(text)) {
        return false;
      }

      const workspaceName = vscode.workspace.name ?? "project";
      const primaryLanguage = vscode.window.activeTextEditor?.document.languageId ?? "typescript";
      const workspaceTree = contextBuilder.getWorkspaceTree();
      const folders = vscode.workspace.workspaceFolders;

      try {
        const result = await ollamaProvider.handleFileCreationIntent(
          text,
          workspaceTree,
          primaryLanguage,
          workspaceName,
        );

        if (!folders || folders.length === 0) {
          throw new Error("No workspace folder open");
        }

        const rootPath = folders[0].uri.fsPath;
        const absolutePath = path.resolve(rootPath, result.path);
        const fileUri = vscode.Uri.file(absolutePath);
        const relativePath = path.relative(rootPath, absolutePath);

        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(result.content, "utf-8"));
        await vscode.window.showTextDocument(fileUri);
        await vscode.window.showInformationMessage(`Created: ${relativePath}`);

        await chatPanel.sendToWebview({ type: "startAssistant" });
        await chatPanel.sendToWebview({ type: "appendAssistant", content: `✅ Created file: ${relativePath}` });
        await chatPanel.sendToWebview({ type: "doneAssistant" });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Unknown error";

        await chatPanel.sendToWebview({ type: "startAssistant" });
        await chatPanel.sendToWebview({ type: "appendAssistant", content: `❌ ${message}` });
        await chatPanel.sendToWebview({ type: "doneAssistant" });
      }

      return true;
    },
    memoryPromise,
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codexLocal.chatView", chatPanel),
  );

  registerComingSoonCommand(context, "codexLocal.openChat");

  context.subscriptions.push(
    vscode.commands.registerCommand("codexLocal.explainCode", async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.selection.isEmpty) {
        await vscode.window.showWarningMessage("Codex Local: Select some code first.");
        return;
      }

      const selectedCode = editor.document.getText(editor.selection);
      const language = editor.document.languageId;
      const prompt = `Explain what this ${language} code does, step by step. Be clear enough for someone unfamiliar with this codebase:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``;

      await vscode.commands.executeCommand("workbench.view.extension.codexLocalSidebar");
      chatPanel.sendPrefilled(prompt);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexLocal.fixCode", async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor || editor.selection.isEmpty) {
        await vscode.window.showWarningMessage("Codex Local: Select some code first.");
        return;
      }

      const selectedCode = editor.document.getText(editor.selection);
      const language = editor.document.languageId;

      const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri);
      const selectionDiagnostics = allDiagnostics
        .filter((d) => d.range.intersection(editor.selection) !== undefined)
        .map((d) => d.message)
        .join("; ");

      const prompt = selectionDiagnostics.length > 0
        ? `Fix this ${language} code. Errors reported by VS Code: ${selectionDiagnostics}\n\nShow the corrected version with a brief explanation of what was wrong:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``
        : `Fix this ${language} code. Show the corrected version with a brief explanation of what was wrong:\n\n\`\`\`${language}\n${selectedCode}\n\`\`\``;

      await vscode.commands.executeCommand("workbench.view.extension.codexLocalSidebar");
      chatPanel.sendPrefilled(prompt);
    }),
  );

  registerComingSoonCommand(context, "codexLocal.clearHistory");

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("codexLocal")) {
        ollamaProvider.reload();
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexLocal.clearHistory", async () => {
      const memory = await memoryPromise;
      memory.clearCurrentSession();
      await vscode.window.showInformationMessage("Codex Local: Chat cleared.");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codexLocal.analyzeProject", async () => {
      const memory = await memoryPromise;
      const THIRTY_MINUTES = 30 * 60 * 1000;

      const cached = memory.getProjectSummary();
      const isFresh = cached !== null && (Date.now() - cached.scannedAt) < THIRTY_MINUTES;

      let summary;

      if (isFresh && cached !== null) {
        summary = cached;
      } else {
        await vscode.window.showInformationMessage("Codex Local: Scanning project files...");
        summary = await contextBuilder.summarizeProject();
        memory.saveProjectSummary(summary);
      }

      const formatted = contextBuilder.formatProjectSummary(summary);
      const result = await ollamaProvider.analyzeProject(formatted);

      await chatPanel.sendToWebview({ type: "startAssistant" });
      await chatPanel.sendToWebview({ type: "appendAssistant", content: result });
      await chatPanel.sendToWebview({ type: "doneAssistant" });
    }),
  );

  void checkOllamaConnection(ollamaProvider).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup error";

    void vscode.window.showErrorMessage(`Codex Local startup error: ${message}`);
  });
}

export function deactivate(): void {}
