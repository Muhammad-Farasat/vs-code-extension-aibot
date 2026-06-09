You are continuing to build Codex Local, a VS Code extension.

Phases 1 through 6 are complete. The extension is fully functional.
Currently errors from Ollama only show a red dot or a plain ⚠️ message.
There is no way to stop a stream mid-response.

Your job in this prompt is to update OllamaProvider.ts and ChatPanel.ts only.
Do not touch any other file.

---

**Updates to OllamaProvider.ts**

Update checkConnection() error messages to be exact and actionable:
- If Ollama is unreachable (fetch/network error):
  Return: { ok: false, error: "Ollama is not running.\n\nFix: open a terminal and run:\n  ollama serve\n\nThen try again." }
- If Ollama is reachable but the model is not in the list:
  Return: { ok: false, error: "Model \"{modelName}\" is not installed.\n\nFix: open a terminal and run:\n  ollama pull {modelName}\n\nAvailable models: {available.join(', ') || 'none'}" }
- If Ollama is reachable and the model exists:
  Return: { ok: true }

Update streamChat():
- Add a private cancellation flag: private cancelStream: boolean = false
- At the start of streamChat(): set this.cancelStream = false
- After each chunk yield: check if this.cancelStream is true — if so, break out of the loop and yield { content: '\n\n⛔ Response stopped.', done: true } then return
- Add a public method: stopStream() — sets this.cancelStream = true

---

**Updates to ChatPanel.ts**

Update handleUserMessage() error display:
- When checkConnection() returns ok: false, do not just append the raw error string
- Post { type: 'startAssistant' } first to open an assistant bubble
- Then post { type: 'appendAssistant', content: '⚠️ ' + error } so it renders in the chat as a proper message
- Then post { type: 'doneAssistant' }
- This ensures the error is visible in chat history, not just a flash notification

Add stop button to the HTML:
- Add a stop button (id="stop-btn", symbol ⏹, title "Stop response") next to the send button in the input row
- Display none by default
- Show it (display inline-block) when streaming starts
- Hide it again when streaming ends

Add to CSS:
- #stop-btn: same base styling as send button but background --vscode-button-secondaryBackground, color --vscode-button-secondaryForeground
- #stop-btn:hover: background --vscode-button-secondaryHoverBackground

Add to webview JS:
- Stop button click: post { type: 'stopStream' } to extension host, hide stop button, re-enable send button immediately
- On { type: 'startAssistant' }: show stop button, hide send button
- On { type: 'doneAssistant' }: hide stop button, show send button

Add to onDidReceiveMessage in resolveWebviewView():
- { type: 'stopStream' }: call ollama.stopStream()

---

All TypeScript must compile without errors under strict mode.
Do not touch MemoryManager.ts, ContextBuilder.ts, or extension.ts.

