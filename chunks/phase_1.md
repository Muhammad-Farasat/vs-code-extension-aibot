You are building a VS Code extension called Codex Local from scratch.

Project summary:
- A local AI coding assistant running inside the VS Code sidebar
- Uses Ollama (local) with gemma4:e2b model
- No cloud, no external APIs, no authentication
- Stack: TypeScript + VS Code Extension API + Ollama npm package + better-sqlite3

Your job in this prompt is to scaffold the entire project skeleton. Nothing should have real logic yet except the Ollama ping.

---

Create the following files exactly as described:

**package.json**
- name: codex-local
- displayName: Codex Local
- engines.vscode: ^1.85.0
- activationEvents: onStartupFinished
- main: ./out/extension.js
- Contributes:
  - One sidebar view container in the activitybar with id "codexLocalSidebar"
  - One webview view inside it with id "codexLocal.chatView"
  - Commands: codexLocal.openChat, codexLocal.explainCode, codexLocal.fixCode, codexLocal.clearHistory
  - Configuration keys: ollamaHost (default: http://localhost:11434), model (default: gemma4:e2b), maxHistoryMessages (default: 50), contextLines (default: 200)
- Dependencies: ollama, better-sqlite3
- DevDependencies: @types/vscode, @types/node, @types/better-sqlite3, typescript

**tsconfig.json**
- module: commonjs, target: ES2020, outDir: ./out, rootDir: ./src, strict: true, esModuleInterop: true

**Folder structure**
Create empty placeholder files (export {} only) at:
- src/providers/OllamaProvider.ts
- src/memory/MemoryManager.ts
- src/tools/ContextBuilder.ts
- src/webview/ChatPanel.ts

**src/providers/OllamaProvider.ts**
- Import Ollama from the ollama npm package
- Read ollamaHost from VS Code configuration
- Implement one method only: checkConnection()
  - Calls ollama.list() to get available models
  - Checks if the configured model name exists in the list
  - Returns { ok: true } if found
  - Returns { ok: false, error: string } if Ollama is unreachable or model is missing
  - The error string must be human-readable and include the exact ollama command to fix it

**src/extension.ts**
- Import OllamaProvider
- In the activate() function:
  - Instantiate OllamaProvider
  - Call checkConnection()
  - Show vscode.window.showInformationMessage if ok
  - Show vscode.window.showErrorMessage with the error string if not ok
  - Register all four commands as stubs (they do nothing yet except show a "coming soon" message)
  - Register the webview view provider as a stub (renders a plain div with the text "Codex Local loading...")
- Export an empty deactivate() function

---

Rules:
- No logic beyond what is described above
- No placeholder comments like // TODO
- All files must compile without TypeScript errors
- Do not install packages — only create the files