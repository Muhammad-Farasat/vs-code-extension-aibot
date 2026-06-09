# Progress Tracker

Update this file after every meaningful implementation
change.

## Current Phase

- Phase 07.2 complete

## Current Goal

- Done — all phases complete.

## Completed

- Created the Phase 00 package manifest with sidebar, commands, configuration, and declared dependencies.
- Added strict TypeScript configuration targeting CommonJS and ES2020 output to `out`.
- Added the requested source folder skeleton.
- Added a narrow local Ollama type declaration so the scaffold compiles before dependencies are installed.
- Implemented the initial Ollama connection check for the configured host and model.
- Registered startup connection reporting, stub commands, and the stub sidebar webview.
- Built the sidebar chat panel with VS Code themed header, status badge, messages area, and input controls.
- Added webview message handling for ready, status, send, clear chat, and active file updates.
- Wired the extension sidebar registration to use `ChatPanel`.
- Added the static Codex Local system prompt builder in `OllamaProvider`.
- Added typed Ollama streaming via `streamChat()` with provider-level streaming state.
- Replaced the placeholder assistant response with live `streamChat()` consumption in `ChatPanel`.
- Added assistant streaming bubble updates, completion handling, and send-button locking.
- Implemented `ContextBuilder` with `buildContext()`, `formatContext()`, `getWorkspaceTree()`, `readFileByPath()`, and private `getDiagnostics()`. Exported `CodeContext` interface.
- Updated `OllamaProvider`: `buildSystemPrompt()` accepts optional `fileContext` appended under `--- ACTIVE FILE CONTEXT ---` markers; `streamChat()` forwards `fileContext`; added `detectTargetFile()` using non-streaming chat to route user messages to a file path.
- Updated `ChatPanel`: accepts `ContextBuilder` as third constructor argument; `handleUserMessage()` detects file references in the user message, calls `detectTargetFile()` when none found, falls back to active editor context; webview JS updates `#ctx-file` span on `activeFile` messages; `resolveWebviewView()` posts current active file on `ready` and on every editor change.
- Extended `ollama.d.ts` to declare a non-streaming `chat()` overload returning `OllamaChatResponse`.
- Updated `extension.ts` to instantiate `ContextBuilder` and pass it to `ChatPanel`.
- Added `detectFileCreationIntent()` and `handleFileCreationIntent()` to `OllamaProvider`. The latter calls the model with a JSON-only prompt, strips markdown fences, validates the parsed shape, and returns `{ path, content }` or throws.
- Added optional `onSendMessage` interceptor callback to `ChatPanel` constructor and a public `sendToWebview()` method so `extension.ts` can post messages back to the webview.
- Wired file creation in `extension.ts`: the interceptor checks intent, calls `handleFileCreationIntent`, writes the file via `vscode.workspace.fs`, opens it, and posts success/error messages back to the chat panel.
- Implemented `MemoryManager` using `sql.js` (WASM SQLite, already declared in `package.json`). Implements the full schema (sessions + messages tables, two indexes), all required public methods, and exports `Message` and `Session` interfaces. The `better-sqlite3` library specified in the phase prompt was not used — it is absent from `package.json` and requires native compilation; `sql.js` satisfies all behavioural requirements without native dependencies.
- Wired `MemoryManager` into `ChatPanel` and `extension.ts` (Phase 05.2): memory is created as `Promise<MemoryManager>` in `activate()` and passed to `ChatPanel` as a fifth constructor argument, awaited lazily per operation. `handleUserMessage()` saves user and assistant messages, uses full session history as the Ollama messages array. Added `newSession`, `clearHistory`, `loadSessions`, `loadSession` message handlers. Added history panel UI with session list, toggle, and session-switching. `loadHistory` and `clearChat` webview message types render history or reset to welcome message.
- Added session summarizer (Phase 05.3): `summarizeHistory()` in `OllamaProvider` compresses a message array to ≤150-word summary via non-streaming chat. `handleUserMessage()` in `ChatPanel` checks message count — if >30, splits history into oldest and 6 most-recent messages, summarises the older portion, and prepends a system summary message; falls back to full history if summarisation fails or count ≤30.
- Implemented Explain Code and Fix Code commands (Phase 06): replaced stubs in `extension.ts` with real handlers that check for an active selection, build a language-aware prompt, open the sidebar, and call `chatPanel.sendPrefilled()`. Fix Code also collects VS Code diagnostics intersecting the selection. Added `sendPrefilled()` public method to `ChatPanel` and `prefill` message handler in the webview JS. Added `editor/context` menu entries to `package.json` gated on `editorHasSelection`.
- Improved error messages and added stream cancellation (Phase 07.1): `checkConnection()` now returns exact, actionable error strings distinguishing "Ollama not running" from "model not installed". Added `cancelStream` flag and `stopStream()` to `OllamaProvider`; the stream loop checks the flag after each chunk and yields a `⛔ Response stopped.` terminator. `ChatPanel` now wraps connection errors in a proper assistant bubble. Added a stop button (⏹) to the input row — shown during streaming, hidden otherwise — that posts `stopStream` to the extension host.
- Polished configuration, reload, and clear history (Phase 07.2): updated all four `package.json` config descriptions to be actionable; added `minimum`/`maximum` constraints to numeric settings. Added `reload()` to `OllamaProvider` (resets cancel flag; `createClient()` already reads config at call time so no client caching is needed). Wired `onDidChangeConfiguration` in `extension.ts` to call `ollama.reload()` silently. Replaced `clearHistory` stub with a real implementation that calls `memory.clearCurrentSession()` and shows a confirmation message.

## In Progress

- None.

## Next Up

- None — all planned phases complete.

## Open Questions

- None for Phase 03.2.

## Architecture Decisions

- Ollama access is isolated in `src/providers/OllamaProvider.ts` so extension activation can report local model readiness without mixing provider logic into the webview.
- VS Code configuration is read at call time from the `codexLocal` namespace to keep settings current and scoped to this extension.
- Sidebar UI logic lives in `src/webview/ChatPanel.ts`; extension activation only wires the provider into VS Code.
- Ollama chat requests prepend a fresh system prompt per request and keep model settings read at call time.
- Chat streaming starts only after a fresh Ollama connection check and is blocked while another stream is active.
- `ContextBuilder` is a plain class (no static members) so it can be instantiated wherever context is needed. `getDiagnostics` is private because it is only meaningful as part of `buildContext`.
- File routing in `ChatPanel` uses a lightweight regex check before spending a model call on `detectTargetFile()` — explicit file references skip routing entirely.
- `ollama.d.ts` uses overloaded signatures to keep `stream: true` and `stream: false` return types distinct without widening to `unknown`.
- File creation is handled in `extension.ts` via an interceptor callback rather than inside `ChatPanel`, keeping file I/O and VS Code workspace commands out of the panel layer. `ChatPanel` stays focused on streaming chat; `extension.ts` owns side effects.
- `sendToWebview()` is a thin public wrapper around the private `postMessage()` so external callers don't bypass the panel's internal posting logic.
- `MemoryManager` uses `sql.js` (pure WASM) rather than `better-sqlite3` (native). This avoids native compilation requirements and keeps the extension purely JS. The `sql.js` database is persisted to disk on every write via `fs.writeFileSync`.
- `MemoryManager` is created as a `Promise` in `activate()` and passed into `ChatPanel` as a lazy dependency. This avoids making `activate()` async (which VS Code doesn't require) while still allowing `ChatPanel` to await it before first use.
- History summarisation fires only when message count exceeds 30, keeping the 6 most-recent messages as uncompressed live context. This preserves immediate conversational coherence while staying within the model's context window.
- `sendPrefilled()` is synchronous (fire-and-forget `void`) because it only posts to the webview — no awaitable work needed. The webview fills the input and focuses it without auto-sending, so the user reviews the prompt before submitting.
- Stream cancellation uses a boolean flag rather than an `AbortController` because the Ollama JS client does not expose an abort signal on its streaming API. The flag is checked after each yielded chunk, so the last in-flight token always completes before the stop message is appended.

## Session Notes

- Phase 00 intentionally contains no chat, memory, context building, or command behavior beyond the requested stubs and Ollama ping.
- Packages were declared in `package.json` only; dependencies were not installed during this phase.
- Phase 02 adds UI and placeholder assistant responses only; real streaming, history, and sessions remain for later phases.
- Phase 03.1 updates only the provider layer; the chat UI still needs a later phase to consume streamed chunks.
- Phase 03.2 streams only the current user message; history, sessions, and file context remain for later phases.
