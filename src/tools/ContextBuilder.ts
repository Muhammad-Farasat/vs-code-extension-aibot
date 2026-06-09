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

  public extractLocalImports(fileContent: string, currentFilePath: string): string[] {
    const dir = path.dirname(currentFilePath);
    const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];
    const seen = new Set<string>();
    const resolved: string[] = [];

    const importRe = /from\s+['"]([^'"]+)['"]/g;
    const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    const tryResolve = (specifier: string): void => {
      if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
        return;
      }

      const base = path.resolve(dir, specifier);

      // Try as-is first (already has extension)
      if (fs.existsSync(base) && !fs.statSync(base).isDirectory()) {
        if (!seen.has(base)) {
          seen.add(base);
          resolved.push(base);
        }

        return;
      }

      // Try with each extension
      for (const ext of EXTENSIONS) {
        const candidate = base + ext;

        if (fs.existsSync(candidate)) {
          if (!seen.has(candidate)) {
            seen.add(candidate);
            resolved.push(candidate);
          }

          return;
        }
      }
    };

    let match: RegExpExecArray | null;

    while ((match = importRe.exec(fileContent)) !== null) {
      if (resolved.length >= 3) {
        break;
      }

      tryResolve(match[1]);
    }

    if (resolved.length < 3) {
      while ((match = requireRe.exec(fileContent)) !== null) {
        if (resolved.length >= 3) {
          break;
        }

        tryResolve(match[1]);
      }
    }

    return resolved;
  }

  public extractMentions(userMessage: string): string[] {
    const folders = vscode.workspace.workspaceFolders;

    if (!folders || folders.length === 0) {
      return [];
    }

    const rootPath = folders[0].uri.fsPath;
    const regex = /@([\w./\\-]+)/g;
    const resolved: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(userMessage)) !== null) {
      const mention = match[1];
      const candidates = [
        path.resolve(rootPath, mention),
        path.resolve(rootPath, "src", mention),
        path.resolve(rootPath, "src", "lib", mention),
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          resolved.push(candidate);
          break;
        }
      }
    }

    return resolved;
  }

  public readMultipleFiles(filePaths: string[]): Array<{ path: string; relativePath: string; language: string; content: string }> {
    const folders = vscode.workspace.workspaceFolders;
    const rootPath = folders && folders.length > 0 ? folders[0].uri.fsPath : "";

    const EXT_LANGUAGE: Record<string, string> = {
      ".ts": "typescript",
      ".tsx": "typescript",
      ".js": "javascript",
      ".jsx": "javascript",
      ".py": "python",
      ".json": "json",
      ".md": "markdown",
      ".css": "css",
    };

    const results: Array<{ path: string; relativePath: string; language: string; content: string }> = [];
    const capped = filePaths.slice(0, 5);

    for (const filePath of capped) {
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const ext = path.extname(filePath).toLowerCase();
        const language = EXT_LANGUAGE[ext] ?? "plaintext";
        const relativePath = rootPath ? path.relative(rootPath, filePath) : path.basename(filePath);

        results.push({ path: filePath, relativePath, language, content });
      } catch {
        // skip unreadable files
      }
    }

    return results;
  }

  public formatMultipleFiles(files: Array<{ path: string; relativePath: string; language: string; content: string }>): string {
    return files
      .map((f) => `--- FILE: ${f.relativePath} ---\n\`\`\`${f.language}\n${f.content}\n\`\`\`\n--- END ${f.relativePath} ---`)
      .join("\n\n");
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
