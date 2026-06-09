You are continuing to build Codex Local, a VS Code extension.

Phase 7 Prompt 1 is complete. Error handling and stream cancellation are working.
The clear chat button (🗑) already exists in the UI from Phase 2 and already posts
{ type: 'clearHistory' } which clears the current session via MemoryManager.
package.json already has configuration keys declared for ollamaHost, model,
maxHistoryMessages, and contextLines from Phase 1.

Your job in this prompt is to update package.json, OllamaProvider.ts, and
extension.ts only. Do not touch any other file.

---

**Updates to package.json**

The configuration keys already exist. Update each one to add:
- A clear description that tells the user exactly what it does and what the default is
- A markdownDescription where helpful (for the host URL and model name)

ollamaHost:
- description: "URL where Ollama is running. Default: http://localhost:11434. Change this only if you are running Ollama on a different port or a remote machine."

model:
- description: "Ollama model name to use. Default: gemma4:e2b. Must match exactly what you see in: ollama list"

maxHistoryMessages:
- description: "Number of past messages included in each request for conversation context. Default: 50. Lower this if responses are slow."
- minimum: 5
- maximum: 200

contextLines:
- description: "Maximum lines of the active file included as context in each request. Default: 200. Lower this for large files."
- minimum: 10
- maximum: 1000

---

**Updates to OllamaProvider.ts**

Add a public method: reload()
- Re-reads ollamaHost from VS Code configuration
- Creates a new Ollama client instance with the updated host
- Resets this.cancelStream to false
- Does not affect any active stream — only applies to the next call

---

**Updates to extension.ts**

Add a configuration change listener in activate():
- vscode.workspace.onDidChangeConfiguration(e => { ... })
- Push it to context.subscriptions
- Inside the handler:
  - Check e.affectsConfiguration('codexLocal')
  - If true: call ollama.reload()
  - No restart message, no notification — it reloads silently

Verify the clear chat command (codexLocal.clearHistory) is fully wired:
- It should call memory.clearCurrentSession()
- Then show vscode.window.showInformationMessage: "Codex Local: Chat cleared."
- If it was previously a stub, replace it with this implementation now

---

All TypeScript must compile without errors under strict mode.
Do not touch MemoryManager.ts, ContextBuilder.ts, or ChatPanel.ts.