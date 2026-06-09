import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

export interface CodeContext {
  fileContent: string;
  fileName: string;
  filePath: string;
  language: string;
  cursorLine: number;
  selection: string | undefined;
  diagnostics: string | undefined;
}

export default class ContextBuilder {
  public buildContext(): CodeContext | null {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return null;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration("codexLocal");
    const maxLines = config.get<number>("contextLines", 200);

    const allLines = document.getText().split("\n");
    const truncated = allLines.length > maxLines;
    const visibleLines = truncated ? allLines.slice(0, maxLines) : allLines;
    let fileContent = visibleLines.join("\n");

    if (truncated) {
      const remaining = allLines.length - maxLines;
      fileContent += `\n... (${remaining} more lines)`;
    }

    const selectionRange = editor.selection;
    const selectedText = document.getText(selectionRange);
    const selection = selectedText.length > 0 ? selectedText : undefined;

    return {
      fileContent,
      fileName: path.basename(document.fileName),
      filePath: document.fileName,
      language: document.languageId,
      cursorLine: editor.selection.active.line + 1,
      selection,
      diagnostics: this.getDiagnostics(document.uri),
    };
  }

  public formatContext(ctx: CodeContext): string {
    let result = `File: ${ctx.fileName} (${ctx.language})\nCursor at line ${ctx.cursorLine}\n\n`;

    if (ctx.selection !== undefined) {
      result += `Selected code:\n\`\`\`${ctx.language}\n${ctx.selection}\n\`\`\`\n\n`;
    }

    result += `File contents:\n\`\`\`${ctx.language}\n${ctx.fileContent}\n\`\`\``;

    if (ctx.diagnostics !== undefined) {
      result += `\n\nCurrent errors and warnings:\n${ctx.diagnostics}`;
    }

    return result;
  }

  public getWorkspaceTree(maxFiles: number = 50): string {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      return "";
    }

    const rootPath = folders[0].uri.fsPath;
    const lines: string[] = [];
    let fileCount = 0;

    const SKIPPED_DIRS = new Set(["node_modules", "out", "dist", ".git"]);

    const walk = (dirPath: string, depth: number, indent: string): void => {
      if (depth > 3 || fileCount >= maxFiles) {
        return;
      }

      let entries: fs.Dirent[];

      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (fileCount >= maxFiles) {
          break;
        }

        if (entry.name.startsWith(".") || SKIPPED_DIRS.has(entry.name)) {
          continue;
        }

        if (entry.isDirectory()) {
          lines.push(`${indent}📁 ${entry.name}`);
          walk(path.join(dirPath, entry.name), depth + 1, indent + "  ");
        } else if (entry.isFile()) {
          lines.push(`${indent}${entry.name}`);
          fileCount++;
        }
      }
    };

    walk(rootPath, 1, "");

    return lines.join("\n");
  }

  public readFileByPath(relativePath: string): string | null {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      return null;
    }

    const rootPath = folders[0].uri.fsPath;
    const absolutePath = path.resolve(rootPath, relativePath);

    try {
      return fs.readFileSync(absolutePath, "utf-8");
    } catch {
      return null;
    }
  }

  private getDiagnostics(uri: vscode.Uri): string | undefined {
    const diagnostics = vscode.languages.getDiagnostics(uri);

    if (diagnostics.length === 0) {
      return undefined;
    }

    const lines = diagnostics.slice(0, 10).map((diag) => {
      const severity
        = diag.severity === vscode.DiagnosticSeverity.Error
          ? "ERROR"
          : "WARNING";
      const line = diag.range.start.line + 1;

      return `  [${severity}] Line ${line}: ${diag.message}`;
    });

    return lines.join("\n");
  }
}
