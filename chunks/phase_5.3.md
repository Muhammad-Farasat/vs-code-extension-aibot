
You are continuing to build Codex Local, a VS Code extension.

MemoryManager.ts is fully built. ChatPanel.ts saves and loads messages correctly. History and sessions work end to end.

Your job in this prompt is to add the session summarizer. You will update OllamaProvider.ts and ChatPanel.ts only. Do not touch any other file.

---

**Updates to OllamaProvider.ts**

Add a new public async method: summarizeHistory()
- Accepts: messages: Message[]
- Calls this.client.chat() with stream: false
- Uses this exact prompt as the full user message:

"You are summarizing a coding conversation to save context space.
Below is a conversation between a developer and an AI assistant.
Write a compact summary (max 150 words) covering:
- What files or code were discussed
- What problems were identified
- What solutions or decisions were reached
- Any important facts about the project mentioned

Be factual. No commentary. This summary will replace the full conversation history.

CONVERSATION:
{formatted conversation — each message as ROLE: content, joined by double newline}"

- Formats the messages array as: messages.map(m => m.role.toUpperCase() + ': ' + m.content).join('\n\n')
- Returns the summary string trimmed
- If it throws, returns null

---

**Updates to ChatPanel.ts**

Update handleUserMessage():
- After calling memory.getRecentMessages(50) and before passing to streamChat():
  - Call memory.getMessageCount()
  - If count exceeds 30:
    - Take all messages except the last 6 (keep the 6 most recent as live context)
    - Call ollama.summarizeHistory() with the older messages
    - If summary is not null:
      - Build a new messages array: [{ role: 'system', content: 'Previous conversation summary: ' + summary }, ...last 6 messages]
      - Use this compressed array as the messages passed to streamChat()
    - If summary is null: fall back to the full getRecentMessages(50) array as before
  - If count is 30 or under: pass getRecentMessages(50) directly as before

---

All TypeScript must compile without errors under strict mode.
Do not touch MemoryManager.ts, ContextBuilder.ts, or extension.ts.