You are continuing to build Codex Local, a VS Code extension.

Phases 1 through 5 are complete. extension.ts already has stub registrations for
codexLocal.explainCode and codexLocal.fixCode that show a "coming soon" message.
ChatPanel.ts already handles { type: 'prefill', text } — it puts the text into the
input box without sending. package.json already has both commands declared under
contributes.commands.

Your job in this prompt is to update extension.ts and package.json only.
Do not touch any other file.

---

**Updates to package.json**

Under contributes.menus, add an "editor/context" entry:
- Two items, one per command
- codexLocal.explainCode: when clause is "editorHasSelection", group "codexLocal@1"
- codexLocal.fixCode: when clause is "editorHasSelection", group "codexLocal@2"
- Neither item appears when no text is selected

---

**Updates to extension.ts**

Replace the stub registration for codexLocal.explainCode with:
- Check if an active text editor exists and has a non-empty selection
- If not: show vscode.window.showWarningMessage "Codex Local: Select some code first."
- If yes:
  - Get selected text: editor.document.getText(editor.selection)
  - Get language: editor.document.languageId
  - Build this exact prompt string:
    "Explain what this {language} code does, step by step. Be clear enough for someone unfamiliar with this codebase:\n\n```{language}\n{selectedCode}\n```"
  - Open the sidebar: vscode.commands.executeCommand('workbench.view.extension.codexLocalSidebar')
  - Post to the webview via chatPanel.sendPrefilled(prompt)

Replace the stub registration for codexLocal.fixCode with:
- Check if an active text editor exists and has a non-empty selection
- If not: show vscode.window.showWarningMessage "Codex Local: Select some code first."
- If yes:
  - Get selected text: editor.document.getText(editor.selection)
  - Get language: editor.document.languageId
  - Get diagnostics on the selection range: vscode.languages.getDiagnostics(editor.document.uri)
    filtered to only those whose range intersects the selection
    mapped to their message strings joined by "; "
  - Build this exact prompt string:
    - If diagnostics exist:
      "Fix this {language} code. Errors reported by VS Code: {diagnostics}\n\nShow the corrected version with a brief explanation of what was wrong:\n\n```{language}\n{selectedCode}\n```"
    - If no diagnostics:
      "Fix this {language} code. Show the corrected version with a brief explanation of what was wrong:\n\n```{language}\n{selectedCode}\n```"
  - Open the sidebar: vscode.commands.executeCommand('workbench.view.extension.codexLocalSidebar')
  - Post to the webview via chatPanel.sendPrefilled(prompt)

**Add public method to ChatPanel.ts**
- public sendPrefilled(text: string): void
- Posts { type: 'prefill', text } to the webview
- If the webview is not yet resolved, does nothing silently

---

All TypeScript must compile without errors under strict mode.
chatPanel must be accessible in the activate() scope where commands are registered —
make sure it is declared before the command registrations, not inside them.
Do not touch MemoryManager.ts, OllamaProvider.ts, or ContextBuilder.ts.