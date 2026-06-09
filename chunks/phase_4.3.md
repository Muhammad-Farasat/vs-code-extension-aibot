
You are continuing to build Codex Local, a VS Code extension.

ContextBuilder.ts, OllamaProvider.ts, and ChatPanel.ts are all updated from the previous prompts.
extension.ts currently has stub command registrations and the ChatPanel webview provider registration.

Your job in this prompt is to update extension.ts and OllamaProvider.ts only.

---

**Updates to OllamaProvider.ts**

Add a new public async method: handleFileCreationIntent()
- Accepts: userMessage: string, workspaceTree: string, primaryLanguage: string, workspaceName: string
- Calls this.client.chat() with stream: false
- Uses this exact prompt as the full user message:

"You are a code generator. The user wants to create a new file in their project.

Project context:
- Workspace: {workspaceName}
- Language: {primaryLanguage}
- Existing file tree:
{workspaceTree}

User request: {userMessage}

Your response must be a valid JSON object with exactly these keys:
{
  path: relative path from workspace root where the file should be created,
  content: the complete file content as a string
}

Rules:
- The path must follow the naming conventions visible in the existing file tree.
- The content must be complete and immediately usable — no placeholders, no TODOs.
- Match the code style, imports, and patterns of the existing files shown in the tree.
- Return only the JSON object. No explanation. No markdown fences. Nothing else."

- Strips any ```json fences from the response before parsing
- Parses the JSON and returns { path: string, content: string }
- If parsing fails or response is malformed, throws an Error with message: "File creation failed: could not parse AI response"

Add a new public method: detectFileCreationIntent()
- Accepts: userMessage: string
- Returns boolean
- Returns true if the message contains any of these signals (case-insensitive): "create a file", "create file", "new file", "add a file", "add file", "make a file", "generate a file", "write a file"
- Returns false otherwise

---

**Updates to extension.ts**

In the activate() function, after registering ChatPanel:

Add a listener on the webview panel for { type: 'sendMessage', text } messages — intercept before ChatPanel handles them:
- Call ollama.detectFileCreationIntent(text)
- If true:
  - Get workspace name from vscode.workspace.name ?? 'project'
  - Get primary language from the active editor's languageId ?? 'typescript'
  - Get workspace tree from ctxBuilder.getWorkspaceTree()
  - Call ollama.handleFileCreationIntent(text, workspaceTree, primaryLanguage, workspaceName)
  - Resolve the returned path against the first workspace folder root
  - Write the file using vscode.workspace.fs.writeFile() with Buffer.from(content, 'utf-8')
  - Open the file in the editor using vscode.window.showTextDocument()
  - Show vscode.window.showInformationMessage: "Created: {relativePath}"
  - Post to the webview: { type: 'appendAssistant', content: '✅ Created file: ' + relativePath }
  - Post { type: 'doneAssistant' }
  - If anything throws: post { type: 'appendAssistant', content: '❌ ' + error.message } and { type: 'doneAssistant' }
- If false: let ChatPanel handle it normally as before

---

All TypeScript must compile without errors under strict mode.
Do not touch ContextBuilder.ts or ChatPanel.ts.