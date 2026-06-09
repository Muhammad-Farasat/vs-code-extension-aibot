# Codex Local

## Overview

Codex Local is a VS Code extension that brings a fully local, privacy-first AI coding assistant directly into the editor sidebar. It is built for developers who want Codex-style code intelligence — reading, editing, explaining, and fixing code — without sending a single line of code to the cloud. Powered by Ollama and the Gemma 3 4B model running on the user's own machine, it maintains full conversation history across sessions so the assistant remembers context, decisions, and project patterns over time.

## Goals

1. Deliver a working chat-based coding assistant inside VS Code that responds using a locally running Gemma 3 4B model with zero external API calls.
2. Persist conversation history across VS Code restarts so the assistant retains project context over time without manual re-explanation.
3. Automatically inject the active file, selected code, and editor diagnostics into every request so the assistant is always aware of what the developer is looking at.

## Core User Flow

1. Developer installs the extension and pulls the Gemma model via `ollama pull gemma4:e2b`
2. Developer opens a project in VS Code — the Codex Local sidebar activates automatically
3. The sidebar shows a green status dot confirming Ollama is running and the model is ready
4. Developer asks a question or describes a problem in the chat input
5. The extension assembles context from the active file, selection, and diagnostics and sends it to Ollama
6. Gemma streams a response token by token into the assistant bubble in the chat panel
7. Developer selects broken code, right-clicks, and chooses Explain or Fix — a prefilled prompt appears in the input
8. The conversation is saved to SQLite automatically — next session it loads where it left off

## Features

### Chat Interface

- Streaming chat panel in the VS Code sidebar with user and assistant message bubbles
- Blinking cursor while the model is generating, disabled input while streaming
- Context bar above the input showing the currently active filename
- Status indicator showing Ollama connection state at all times

### Code Context

- Active file content automatically injected into every request (configurable line limit)
- Selected code detected and highlighted separately in the context
- VS Code diagnostics (errors and warnings) included in the prompt when present
- Context updates live as the developer switches between files
- The extension automatically scans the workspace tree on every request to identify the most relevant file — no need to mention a filename

### History and Memory

- All conversations saved to a local SQLite database
- Sessions persist across VS Code restarts and workspace reopens
- Session browser in the sidebar to load and resume any past conversation
- New session button to start fresh without losing old history
- Automatic summarization of long sessions to stay within the model's context window

### Editor Commands

- Right-click → Explain: prefills chat with a prompt to explain the selected code
- Right-click → Fix: prefills chat with a prompt to fix the selection, including any diagnostics
- Command palette entry to open the chat panel from anywhere in VS Code
- AI creates new files directly in the workspace when the intent requires it — no explicit instruction needed

### Configuration

- Ollama host URL (default: localhost:11434)
- Model name (default: gemma4:e2b)
- Max history messages included in context
- Max file lines included in context

## Scope

### In Scope

- Sidebar chat panel with streaming responses from a local Ollama model
- Automatic file and diagnostics context injection per request
- SQLite-backed conversation history with session management
- Explain and Fix right-click commands on selected code
- Graceful error handling for Ollama offline and model not found states
- VS Code settings entries for all configurable values
- Automatic file creation in the workspace via VS Code's file system API
- Workspace-aware file detection when the user's prompt doesn't reference a specific file

### Out of Scope

- Inline ghost-text or autocomplete suggestions (requires a separate VS Code CompletionItemProvider)
- Codebase-wide semantic search or embeddings over the full project
- Multi-file simultaneous editing or applying diffs directly to files
- Any cloud API, telemetry, or external network communication
- Support for models other than Ollama-hosted models in v1.0

## Success Criteria

1. A developer can install the extension, run `ollama pull gemma4:e2b`, and receive a streaming response in the sidebar within five minutes of setup
2. The assistant's response references the correct active file content without the developer copy-pasting anything
3. Closing and reopening VS Code loads the previous session's conversation automatically
4. Selecting code and triggering the Fix command produces a prefilled prompt that includes the selected code and any VS Code diagnostics on that selection
5. When Ollama is not running, the extension displays a human-readable error with the exact command needed to fix it — it does not crash or show a blank panel