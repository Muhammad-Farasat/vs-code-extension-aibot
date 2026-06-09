You are continuing to build Codex Local, a VS Code extension.

Phases 1 and 2 are complete. OllamaProvider.ts currently has one method: checkConnection(). ChatPanel.ts is fully built with the chat UI.

Your job in this prompt is to update OllamaProvider.ts only. Do not touch any other file.

---

Add the following to OllamaProvider.ts:

**Private method: buildSystemPrompt()**
- Returns a static string — no file context injected yet, that comes in Phase 4
- The prompt must say exactly this, word for word:

"You are Codex Local, an expert AI coding assistant embedded inside VS Code.
You are running locally on the user's machine using Ollama.

Your job:
- Read, understand, and explain code
- Suggest fixes based on errors and diagnostics shown to you
- Write new code that fits the existing style
- Answer questions about the active project

Rules:
- Be concise. Developers do not want essays.
- Always use fenced code blocks with the correct language tag.
- When suggesting edits, show the corrected snippet, not just a description.
- If you are unsure about something, say so. Do not hallucinate file contents.
- Never refuse a coding task. If it is ambiguous, make a reasonable assumption and state it."

**Public async generator method: streamChat()**
- Signature: async *streamChat(messages: Message[]): AsyncGenerator<{ content: string, done: boolean }>
- Message interface: { role: 'user' | 'assistant' | 'system', content: string }
- Calls this.client.chat() with stream: true
- Passes the system prompt as the first message with role 'system'
- Passes the full messages array after the system message
- Model name read from VS Code configuration at call time — never cached
- options: { num_ctx: 8192, temperature: 0.3 }
- For each chunk yielded by the Ollama stream: yield { content: chunk.message.content, done: chunk.done }
- If Ollama throws any error: yield { content: '\n\n❌ Error: ' + error.message, done: true } and return

**Private property**
- Add isStreaming: boolean = false as a class property
- Set to true when streamChat() starts, false when it ends or errors
- Expose a public getter: get streaming(): boolean

---

The Message interface must be exported from OllamaProvider.ts so ChatPanel.ts can import it.
All TypeScript must compile without errors under strict mode.
Do not add any other methods or properties.
