You are continuing to build Codex Local, a VS Code extension.

Phase 1 is already complete. The following exists:
- package.json, tsconfig.json, and folder structure are in place
- OllamaProvider.ts has a working checkConnection() method
- extension.ts activates, runs the ping, and has stub command registrations
- ChatPanel.ts currently exists as an empty placeholder (export {} only)

Your job in this prompt is to build the full ChatPanel.ts — the sidebar webview UI.

---

Rules before you start:
- ChatPanel.ts is the only file you touch in this prompt
- Follow ui-context.md exactly: VS Code CSS variables only, no hardcoded colors except #4ec94e for the status dot, no external fonts, no frameworks, no Tailwind, plain HTML + CSS + Vanilla JS
- The webview communicates with the extension host via postMessage only — no direct API calls
- All layout is a flex column: header fixed top, messages area scrollable and flex-growing, input area fixed bottom

---

Build ChatPanel.ts with the following:

**Class: ChatPanel**
- Implements vscode.WebviewViewProvider
- Constructor accepts extensionUri: vscode.Uri
- Implements resolveWebviewView() which sets webview options and assigns the HTML

**HTML Structure**
- Header bar: left side has a status dot (7px circle, id="status-dot") and a model badge (id="model-badge", default text "gemma4:e2b"). Right side has three icon buttons: history toggle (🕓), new session (＋), clear chat (🗑). Use unicode symbols only — no icon libraries.
- Messages area: scrollable div (id="messages") with a single welcome message rendered on load: "👋 Codex Local is ready. Ask anything about your code." styled as a centered system message with a dashed border.
- Input area: a context bar showing "📄 No file open" (id="ctx-file"), a row with a textarea (id="input", auto-resizing up to 120px, placeholder: "Ask about your code… (Enter to send, Shift+Enter for newline)") and a send button (id="send-btn", symbol ➤), and a hint line "Shift+Enter for newline".

**CSS**
- body: flex column, height 100vh, overflow hidden, use --vscode-font-family and --vscode-font-size
- Header: flex row, space-between, padding 8px 10px, border-bottom using --vscode-sideBarSectionHeader-border, background --vscode-sideBarSectionHeader-background
- Status dot: 7px circle, default background #666, class "ok" sets #4ec94e, class "err" sets #f14c4c, transition 0.3s
- Icon buttons: no background, no border, cursor pointer, color --vscode-icon-foreground, hover background --vscode-toolbar-hoverBackground, opacity 0.7 default, 1 on hover
- Messages area: flex 1, overflow-y auto, padding 10px, flex column, gap 10px
- User bubble: background --vscode-inputOption-activeBackground, border --vscode-inputOption-activeBorder, align-self flex-end, max-width 90%, padding 8px 10px, border-radius 8px
- Assistant bubble: background --vscode-editor-background, border --vscode-panel-border, align-self flex-start, width 100%, padding 8px 10px, border-radius 8px
- System message: transparent background, dashed border --vscode-panel-border, color --vscode-descriptionForeground, font-size 11px, text-align center, align-self center
- Input area: border-top --vscode-sideBarSectionHeader-border, padding 8px, flex column, gap 6px
- Textarea: flex 1, resize none, min-height 36px, max-height 120px, background --vscode-input-background, border --vscode-input-border, color --vscode-input-foreground, border-radius 4px, padding 7px 10px, focus border --vscode-focusBorder
- Send button: background --vscode-button-background, color --vscode-button-foreground, border none, border-radius 4px, padding 7px 12px, height 36px, disabled opacity 0.5

**Webview JS behaviour**
- Send button click and Enter key (without Shift) both trigger sendMessage()
- sendMessage() reads the textarea value, trims it, does nothing if empty
- On send: append a user bubble to the messages area with the text, clear the textarea, scroll to bottom
- Textarea auto-resizes on input up to 120px max height
- postMessage to extension host with { type: 'sendMessage', text } on every send
- Listen for messages from the extension host:
  - { type: 'status', ok: boolean, model: string } → set status dot class to 'ok' or 'err', update model badge text
  - { type: 'clearChat' } → reset messages area to the welcome message only
  - { type: 'activeFile', name: string } → update ctx-file span text
  - { type: 'ready' } → post back { type: 'ready' } to signal the webview has loaded
- On init: post { type: 'ready' } to the extension host

**Extension host message handling (still in ChatPanel.ts)**
- In resolveWebviewView(), listen to webview.onDidReceiveMessage
- On { type: 'ready' }: call checkConnection on OllamaProvider and post back the status message
- On { type: 'sendMessage' }: post back a placeholder { type: 'startAssistant' } for now — streaming comes in Phase 3
- On { type: 'clearChat' }: post { type: 'clearChat' } back to the webview

---

Do not build streaming, history, or session logic — that comes in later phases.
All TypeScript must compile without errors under strict mode.