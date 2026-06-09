
You are continuing to build Codex Local, a VS Code extension.

ContextBuilder.ts is now fully built with buildContext(), formatContext(), getWorkspaceTree(), and readFileByPath().
OllamaProvider.ts has streamChat() and buildSystemPrompt().
ChatPanel.ts has the full streaming UI.

Your job in this prompt is to update OllamaProvider.ts and ChatPanel.ts. Do not touch any other file.

---

**Updates to OllamaProvider.ts**

Update buildSystemPrompt():
- Accept an optional fileContext: string parameter
- If fileContext is provided, append it to the end of the static system prompt under the heading:
  "--- ACTIVE FILE CONTEXT ---\n{fileContext}\n--- END CONTEXT ---"
- If not provided, the system prompt remains static as before

Update streamChat():
- Accept a second parameter: fileContext?: string
- Pass it through to buildSystemPrompt()

Add a new public async method: detectTargetFile()
- Accepts two parameters: userMessage: string, workspaceTree: string
- Calls this.client.chat() with stream: false
- Uses this exact prompt as the full user message:

"You are a file router. Your only job is to identify which file in the project the user's request is about.

Here is the project file tree:
{workspaceTree}

Here is the user's message:
{userMessage}

Rules:
- If the user explicitly names a file or path, return that exact path.
- If the user describes a feature, component, or behaviour, return the single most likely file path that owns that concern.
- If you cannot determine a file with reasonable confidence, return: NONE
- Return only the file path or NONE. No explanation. No punctuation. Nothing else."

- Returns the response string trimmed
- If the response is "NONE" or empty or throws, return null

---

**Updates to ChatPanel.ts**

Constructor:
- Accept ContextBuilder as a third constructor argument
- Store as private property: private ctxBuilder: ContextBuilder

Update handleUserMessage():
- Call ctxBuilder.buildContext() to get the current context
- Check if the user message contains any file path or filename reference (simple check: does the message contain a dot followed by a known extension like .ts .js .py .json .md .css .html)
- If NO file reference detected:
  - Call ctxBuilder.getWorkspaceTree()
  - Call ollama.detectTargetFile(text, workspaceTree)
  - If a path is returned and is not null: call ctxBuilder.readFileByPath(path) and use that as fileContext
  - If null: fall back to the active file context from buildContext()
- If file reference detected: use the active file context from buildContext() as normal
- Format the context using ctxBuilder.formatContext() before passing to streamChat()
- Pass the formatted context as the second argument to ollama.streamChat()

Update webview JS:
- On every { type: 'activeFile', name } message received: update the ctx-file span text to the filename
- Post { type: 'ready' } on init as before — the extension host responds with the active file name

Update resolveWebviewView():
- Listen to vscode.window.onDidChangeActiveTextEditor
- On every editor change: post { type: 'activeFile', name: relativePath } to the webview
- On webview { type: 'ready' }: also post the current active file name if an editor is open

---

All TypeScript must compile without errors under strict mode.
Do not add file creation logic yet — that is the next prompt.
