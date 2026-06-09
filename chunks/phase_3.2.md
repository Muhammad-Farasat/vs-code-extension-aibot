
You are continuing to build Codex Local, a VS Code extension.

OllamaProvider.ts now has a working streamChat() async generator and a static buildSystemPrompt(). ChatPanel.ts has the full chat UI built in Phase 2.

Your job in this prompt is to update ChatPanel.ts only. Do not touch any other file.

---

Update ChatPanel.ts with the following:

**Constructor**
- Accept OllamaProvider as a second constructor argument
- Store it as a private property: private ollama: OllamaProvider

**Update resolveWebviewView() message handler**
- Remove the placeholder response for { type: 'sendMessage' }
- Replace it with a call to a new private async method: handleUserMessage(text: string)

**New private method: handleUserMessage(text: string)**
- If ollama.streaming is true, return immediately — do not queue messages
- Run checkConnection() before every stream attempt
- If not ok: post { type: 'appendAssistant', content: '⚠️ ' + error } and { type: 'doneAssistant' } and return
- Post { type: 'startAssistant' } to the webview to open a new assistant bubble
- Iterate over ollama.streamChat(messages) — for now messages is just [{ role: 'user', content: text }], history comes in Phase 5
- For each chunk: post { type: 'appendAssistant', content: chunk.content }
- When done: post { type: 'doneAssistant' }

**Update webview JS to handle streaming messages**
- { type: 'startAssistant' }: create a new assistant bubble div, add class 'cursor' to it, append to messages, store reference as currentAssistantEl, set streaming = true, disable send button
- { type: 'appendAssistant', content }: append content as raw text to currentAssistantEl.innerText, scroll to bottom
- { type: 'doneAssistant' }: remove 'cursor' class from currentAssistantEl, set currentAssistantEl = null, set streaming = false, re-enable send button

**Blinking cursor CSS**
- Add to the existing CSS in getHtml():
- .cursor::after { content: '▋'; animation: blink 0.9s step-end infinite; color: var(--vscode-editor-foreground); opacity: 0.8; }
- @keyframes blink { 0%, 100% { opacity: 0.8 } 50% { opacity: 0 } }

**Send button behaviour update**
- sendMessage() must check the local streaming boolean before sending — if true, do nothing
- Send button must be disabled (sendBtn.disabled = true) the moment sendMessage() fires
- Send button re-enables only when { type: 'doneAssistant' } is received

---

Do not add history, sessions, or file context — those come in later phases.
All TypeScript must compile without errors under strict mode.
Do not touch OllamaProvider.ts.