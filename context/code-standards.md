# Code Standards

## General

- Keep every module single-purpose — each file owns exactly one concern and nothing else
- Fix root causes, never layer workarounds on top of broken behaviour
- Do not mix extension host logic with webview logic in the same file
- Every function does one thing — if you need "and" to describe it, split it
- No dead code, no commented-out blocks, no placeholder TODOs in committed files
- If a behaviour is not described in the chunks or prompts, do not build it

## TypeScript

- Strict mode is required throughout — no exceptions
- Never use `any` — use explicit interfaces, union types, or `unknown` with narrowing
- All Ollama API responses must be typed before use — never trust raw response shapes
- All SQLite query results must be cast to a defined interface immediately after the query
- All VS Code configuration reads must have a typed default — never assume a value exists
- Use `async/await` throughout — no raw `.then()` chains
- Export only what other modules need — keep internals unexported

## VS Code Extension

- The extension host and the webview are two separate environments — never treat them as one
- All communication between extension host and webview goes through `postMessage` only
- Never access the filesystem, VS Code API, or Ollama from inside the webview JS
- Register all commands in `extension.ts` only — no other file registers commands
- All disposables must be pushed to `context.subscriptions` — nothing is left unregistered
- Configuration is always read at call time via `vscode.workspace.getConfiguration` — never cached at startup

## Styling

- Use VS Code CSS variables only — no hardcoded hex values except `#4ec94e` for the status dot
- Never import external fonts, icon libraries, or CSS frameworks into the webview
- All layout is flex-based — no floats, no CSS grid unless explicitly required
- Follow the border radius scale defined in ui-context.md exactly
- All interactive elements must have a hover state using `--vscode-toolbar-hoverBackground` or equivalent

## Ollama Communication

- All Ollama calls live in `OllamaProvider.ts` only — no other file calls Ollama directly
- Always call `checkConnection()` before attempting a stream — never assume Ollama is running
- Every Ollama error must produce a human-readable string with the exact fix command
- Streaming must be cancellable — always check a `isStreaming` flag between chunks
- The system prompt is always built fresh per request — never reuse a cached prompt object

## Data and Storage

- All database reads and writes live in `MemoryManager.ts` only — no other file touches SQLite
- Messages are saved after every completed exchange — never batch or defer saves
- Session history passed to Ollama is always fetched fresh from SQLite per request — never from in-memory state
- When a session exceeds 30 messages, summarize before the next Ollama call — never send the full raw history beyond that limit
- Never store file contents in the database — only conversation messages and session metadata

## File Organization

- `src/extension.ts` — Activation, command registration, and service wiring only. No business logic.
- `src/providers/` — All Ollama communication, prompt building, and streaming. No VS Code UI calls.
- `src/memory/` — All SQLite operations, session management, and history summarization. No Ollama or UI calls.
- `src/tools/` — All workspace introspection, file reading, context formatting, and file creation. No Ollama calls.
- `src/webview/` — All sidebar HTML, CSS, and JS. No filesystem access, no Ollama, no SQLite.