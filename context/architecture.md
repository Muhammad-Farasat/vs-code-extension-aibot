# Architecture Context

## Stack

| Layer     | Technology                  | Role   |
| --------- | --------------------------- | ------ |
| Framework | VS Code Extension API + TypeScript | Hosts the extension, registers commands, manages the sidebar webview lifecycle |
| UI        | Webview (HTML + CSS + Vanilla JS) | Renders the chat panel inside the VS Code sidebar using theme variables |
| AI        | Ollama (local) + gemma4:e2b | Runs the language model entirely on-device, exposes a local REST API for chat and streaming |
| Database  | better-sqlite3 (SQLite) | Persists conversation history and session metadata across VS Code restarts |
| Context   | VS Code TextEditor + Diagnostics API | Reads the active file, selection, cursor position, error diagnostics, and workspace file tree. Detects the relevant file automatically when none is specified |

## System Boundaries

- `src/extension.ts` — Entry point. Owns activation, command registration, and wiring all services together. Nothing else imports this file.
- `src/providers/` — Owns all communication with Ollama. Builds system prompts, manages streaming, and handles connection errors. No VS Code UI logic lives here.
- `src/memory/` — Owns SQLite read/write. Manages sessions, message persistence, and history summarization. Has no knowledge of the webview or Ollama.
- `src/tools/` — Owns workspace introspection. Reads files, selections, and diagnostics from the VS Code API. Formats context strings for injection into prompts. Does not call Ollama directly.
- `src/webview/` — Owns the sidebar panel HTML, CSS, and JS. Communicates with the extension host only via postMessage. Has no direct access to the filesystem or Ollama.

## Storage Model

- **SQLite (local, globalStoragePath)**: Conversation messages (role, content, timestamp, session ID) and session metadata (label, created at, last active). Lives on disk at the user's VS Code global storage path. Never leaves the machine.
- **In-memory (runtime only)**: The active context window sent to Ollama on each request — assembled fresh each time from SQLite history + live file context. Not persisted anywhere.

## Auth and Access Model

- No authentication. The extension runs entirely local — no accounts, no cloud, no tokens.
- Ollama is accessed via localhost only (`http://localhost:11434`). No external network calls are made.
- The VS Code extension host enforces workspace trust. The extension only reads files inside the open workspace folder. It does not traverse outside the workspace root.

## Invariants

1. The extension never sends any data outside the local machine. All AI inference happens via Ollama on localhost.
2. The webview never reads files or calls Ollama directly. All side effects go through the extension host via postMessage.
3. SQLite is the only persistence layer. Nothing is written to the workspace files unless the user explicitly triggers an edit command.
4. The context window sent to Ollama is always assembled fresh per request — history from SQLite plus live context from the editor, never cached state from a previous request.
5. Nothing is written to the workspace files unless the AI determines a file creation or edit is required by the user's intent