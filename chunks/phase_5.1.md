You are continuing to build Codex Local, a VS Code extension.

Phases 1 through 4 are complete. MemoryManager.ts currently exists as an empty placeholder (export {} only).

Your job in this prompt is to build MemoryManager.ts only. Do not touch any other file.

---

Build the MemoryManager class with the following:

**Constructor**
- Accepts storagePath: string
- Creates the directory at storagePath if it does not exist using fs.mkdirSync with recursive: true
- Opens a SQLite database at path.join(storagePath, 'codex-local.db') using better-sqlite3
- Calls initSchema() immediately after opening

**Private method: initSchema()**
- Creates two tables if they do not exist:

sessions table:
  - id: TEXT PRIMARY KEY
  - label: TEXT NOT NULL
  - created_at: INTEGER NOT NULL
  - last_active: INTEGER NOT NULL

messages table:
  - id: INTEGER PRIMARY KEY AUTOINCREMENT
  - session_id: TEXT NOT NULL (FOREIGN KEY → sessions.id)
  - role: TEXT NOT NULL
  - content: TEXT NOT NULL
  - timestamp: INTEGER NOT NULL

- Creates two indexes if they do not exist:
  - idx_messages_session on messages(session_id)
  - idx_messages_timestamp on messages(timestamp)

- After creating tables, calls ensureActiveSession()

**Private method: ensureActiveSession()**
- Checks if any session exists in the database
- If none: calls newSession() to create the first one
- If sessions exist: sets this.currentSessionId to the most recently active session's id

**Private method: generateSessionId(): string**
- Returns: "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)

**Public method: newSession(): string**
- Generates a new session id
- Inserts into sessions with label "Session {new Date().toLocaleString()}", created_at and last_active both set to Date.now()
- Sets this.currentSessionId to the new id
- Returns the new session id

**Public method: saveMessage(role: 'user' | 'assistant', content: string): void**
- Inserts into messages with the current session id, role, content, and Date.now() as timestamp
- Updates sessions.last_active to Date.now() for the current session

**Public method: getRecentMessages(limit: number = 50): Message[]**
- Selects messages for the current session ordered by timestamp DESC, limited to limit
- Reverses the result before returning so messages are in chronological order
- Returns array of Message objects

**Public method: getMessageCount(): number**
- Returns the count of messages in the current session

**Public method: getSessions(): Session[]**
- Joins sessions and messages
- Returns up to 30 sessions ordered by last_active DESC
- Each result includes: id, label, createdAt, lastActive, messageCount

**Public method: loadSession(sessionId: string): Message[]**
- Sets this.currentSessionId to sessionId
- Returns getRecentMessages(100)

**Public method: clearCurrentSession(): void**
- Deletes all messages where session_id = currentSessionId

**Public method: renameSession(sessionId: string, label: string): void**
- Updates sessions.label for the given sessionId

**Public method: deleteSession(sessionId: string): void**
- Deletes all messages for sessionId
- Deletes the session row
- If sessionId === currentSessionId: calls newSession()

**Public getter: sessionId: string**
- Returns this.currentSessionId

**Public method: close(): void**
- Calls this.db.close()

---

Export the following interfaces from this file:
- Message: { id?: number, role: 'user' | 'assistant', content: string, timestamp?: number, sessionId?: string }
- Session: { id: string, label: string, createdAt: number, lastActive: number, messageCount: number }

Export MemoryManager as default export.
All TypeScript must compile without errors under strict mode.
Use only: better-sqlite3, path, fs — no vscode imports in this file.

