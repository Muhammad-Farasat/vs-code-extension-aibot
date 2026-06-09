
You are continuing to build Codex Local, a VS Code extension.

MemoryManager.ts is fully built with all session and message methods.
ChatPanel.ts has the full streaming UI and context injection from Phase 4.
extension.ts instantiates OllamaProvider and ContextBuilder.

Your job in this prompt is to update ChatPanel.ts and extension.ts only.

---

**Updates to extension.ts**

- Import MemoryManager
- Instantiate it in activate(): const memory = new MemoryManager(context.globalStorageUri.fsPath)
- Pass it as the fourth constructor argument to ChatPanel
- Push memory.close() to context.subscriptions disposables

---

**Updates to ChatPanel.ts**

Constructor:
- Accept MemoryManager as a fourth constructor argument
- Store as private property: private memory: MemoryManager

Update resolveWebviewView():
- After the webview is set up, on { type: 'ready' } from the webview:
  - Load the most recent session's messages via memory.getRecentMessages()
  - Post { type: 'loadHistory', messages } to the webview to render them on load

Update handleUserMessage():
- After assembling the user message and before calling streamChat():
  - Call memory.saveMessage('user', text)
  - Replace the hardcoded single-message array with memory.getRecentMessages(50) as the full messages history passed to streamChat()
- After streaming completes and fullResponse is assembled:
  - Call memory.saveMessage('assistant', fullResponse)
- Track fullResponse by concatenating each chunk.content as it streams

Update onDidReceiveMessage handler — add new message types:
- { type: 'newSession' }: call memory.newSession(), post { type: 'clearChat' } back to webview
- { type: 'clearHistory' }: call memory.clearCurrentSession(), post { type: 'clearChat' } back to webview
- { type: 'loadSessions' }: call memory.getSessions(), post { type: 'sessions', data: sessions } back to webview
- { type: 'loadSession', sessionId }: call memory.loadSession(sessionId), post { type: 'loadHistory', messages } back to webview

---

**Updates to webview JS in ChatPanel.ts**

History panel behaviour:
- History toggle button (🕓): toggles class 'open' on #history-panel, if opening post { type: 'loadSessions' } to extension host
- New session button (＋): post { type: 'newSession' } to extension host, remove 'open' class from history panel
- Clear chat button (🗑): post { type: 'clearHistory' } to extension host

Add to CSS:
- #history-panel: display none by default, flex-direction column, border-bottom 1px solid --vscode-sideBarSectionHeader-border, max-height 180px, overflow-y auto
- #history-panel.open: display flex
- .session-item: padding 6px 10px, cursor pointer, font-size 11px, border-bottom 1px solid --vscode-list-inactiveSelectionBackground, display flex, align-items center, gap 6px
- .session-item:hover: background --vscode-list-hoverBackground
- .session-label: flex 1, white-space nowrap, overflow hidden, text-overflow ellipsis
- .session-count: opacity 0.5, font-size 10px

Add history panel div to HTML between header and messages:
- <div id="history-panel"><div id="session-list"></div></div>

Handle new message types in webview JS:
- { type: 'sessions', data }: render session items into #session-list. Each item shows label and messageCount. Clicking posts { type: 'loadSession', sessionId } and removes 'open' class from panel. If data is empty show "No history yet" placeholder.
- { type: 'loadHistory', messages }: clear #messages, render each message as its correct bubble type (user or assistant), scroll to bottom
- { type: 'clearChat' }: reset #messages to welcome message only

---

All TypeScript must compile without errors under strict mode.
Do not touch MemoryManager.ts, OllamaProvider.ts, or ContextBuilder.ts.

