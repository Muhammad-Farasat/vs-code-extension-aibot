You are continuing to build Codex Local, a VS Code extension.

Phases 1, 2, and 3 are complete. ContextBuilder.ts currently exists as an empty placeholder (export {} only).

Your job in this prompt is to build ContextBuilder.ts only. Do not touch any other file.

---

Build the ContextBuilder class with the following methods:

**buildContext(): CodeContext | null**
- Returns null if no active text editor is open
- Reads the active document's full text, splits by newline
- Truncates to the line count set in VS Code configuration key contextLines (default 200)
- If truncated, appends: "\n... (N more lines)" where N is the remaining line count
- Returns a CodeContext object with:
  - fileContent: string — the truncated file text
  - fileName: string — basename only, not full path
  - filePath: string — full absolute path
  - language: string — VS Code languageId
  - cursorLine: number — 1-indexed current cursor line
  - selection: string | undefined — selected text if selection is non-empty, otherwise undefined
  - diagnostics: string | undefined — formatted diagnostics string if any exist, otherwise undefined

**formatContext(ctx: CodeContext): string**
- Returns a formatted string ready to append to the system prompt
- Format exactly as:
  "File: {fileName} ({language})\nCursor at line {cursorLine}\n\n{if selection}Selected code:\n```{language}\n{selection}\n```\n\n{end if}File contents:\n```{language}\n{fileContent}\n```{if diagnostics}\n\nCurrent errors and warnings:\n{diagnostics}{end if}"

**getDiagnostics(uri: vscode.Uri): string | undefined**
- Private method used internally by buildContext()
- Calls vscode.languages.getDiagnostics(uri)
- If no diagnostics, returns undefined
- Maps the first 10 diagnostics only to: "  [ERROR] Line N: message" or "  [WARNING] Line N: message"
- Joins with newline and returns

**getWorkspaceTree(maxFiles?: number): string**
- maxFiles defaults to 50
- Reads the first workspace folder root synchronously using fs.readdirSync
- Walks up to 3 levels deep
- Skips: dot folders, node_modules, out, dist, .git
- Prefix directories with 📁 and indent files under them
- Returns the tree as a single string
- If no workspace folder is open, returns empty string

**readFileByPath(relativePath: string): string | null**
- Resolves the relative path against the first workspace folder root
- Reads and returns the file content as utf-8 string
- Returns null on any error (file not found, permission denied, etc.)

---

Export the CodeContext interface from this file.
Export the ContextBuilder class as default export.
All TypeScript must compile without errors under strict mode.
Use only: vscode, path, fs — no other imports.
