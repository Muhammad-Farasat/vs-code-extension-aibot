import { Ollama } from "ollama";
import * as vscode from "vscode";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface ConnectionResult {
  ok: boolean;
  error?: string;
}

interface OllamaModel {
  name: string;
}

interface OllamaListResponse {
  models: OllamaModel[];
}

interface OllamaChatChunk {
  message: {
    content: string;
  };
  done: boolean;
}

function isOllamaListResponse(value: unknown): value is OllamaListResponse {
  if (typeof value !== "object" || value === null || !("models" in value)) {
    return false;
  }

  const response = value as { models: unknown };

  return Array.isArray(response.models)
    && response.models.every((model) => (
      typeof model === "object"
      && model !== null
      && "name" in model
      && typeof (model as { name: unknown }).name === "string"
    ));
}

function isOllamaChatChunk(value: unknown): value is OllamaChatChunk {
  if (typeof value !== "object" || value === null || !("message" in value) || !("done" in value)) {
    return false;
  }

  const chunk = value as { message: unknown; done: unknown };

  if (typeof chunk.message !== "object" || chunk.message === null || !("content" in chunk.message)) {
    return false;
  }

  return typeof (chunk.message as { content: unknown }).content === "string"
    && typeof chunk.done === "boolean";
}

function createClient(): { client: Ollama; model: string } {
  const config = vscode.workspace.getConfiguration("codexLocal");
  const ollamaHost = config.get<string>("ollamaHost", "http://localhost:11434");
  const model = config.get<string>("model", "gemma4:e2b");

  return { client: new Ollama({ host: ollamaHost }), model };
}

export class OllamaProvider {
  private isStreaming: boolean = false;
  private cancelStream: boolean = false;

  public get streaming(): boolean {
    return this.isStreaming;
  }

  public stopStream(): void {
    this.cancelStream = true;
  }

  public reload(): void {
    this.cancelStream = false;
  }

  public async checkConnection(): Promise<ConnectionResult> {
    const { client, model } = createClient();

    try {
      const response = await client.list();

      if (!isOllamaListResponse(response)) {
        return {
          ok: false,
          error: `Ollama is not running.\n\nFix: open a terminal and run:\n  ollama serve\n\nThen try again.`,
        };
      }

      const hasModel = response.models.some((availableModel) => availableModel.name === model);

      if (hasModel) {
        return { ok: true };
      }

      const available = response.models.map((m) => m.name).join(", ") || "none";

      return {
        ok: false,
        error: `Model "${model}" is not installed.\n\nFix: open a terminal and run:\n  ollama pull ${model}\n\nAvailable models: ${available}`,
      };
    } catch {
      return {
        ok: false,
        error: `Ollama is not running.\n\nFix: open a terminal and run:\n  ollama serve\n\nThen try again.`,
      };
    }
  }

  public async *streamChat(messages: Message[], fileContext?: string): AsyncGenerator<{ content: string; done: boolean }> {
    const { client, model } = createClient();

    this.isStreaming = true;
    this.cancelStream = false;

    try {
      const stream = await client.chat({
        model,
        messages: [
          { role: "system", content: this.buildSystemPrompt(fileContext) },
          ...messages,
        ],
        stream: true,
        options: {
          num_ctx: 8192,
          temperature: 0.3,
        },
      });

      for await (const chunk of stream) {
        if (isOllamaChatChunk(chunk)) {
          yield { content: chunk.message.content, done: chunk.done };

          if (this.cancelStream) {
            yield { content: "\n\n⛔ Response stopped.", done: true };
            return;
          }
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown Ollama error";

      yield { content: `\n\n❌ Error: ${message}`, done: true };
      return;
    } finally {
      this.isStreaming = false;
    }
  }

  public async detectTargetFile(userMessage: string, workspaceTree: string): Promise<string | null> {
    const { client, model } = createClient();

    const prompt = `You are a file router. Your only job is to identify which file in the project the user's request is about.

Here is the project file tree:
${workspaceTree}

Here is the user's message:
${userMessage}

Rules:
- If the user explicitly names a file or path, return that exact path.
- If the user describes a feature, component, or behaviour, return the single most likely file path that owns that concern.
- If you cannot determine a file with reasonable confidence, return: NONE
- Return only the file path or NONE. No explanation. No punctuation. Nothing else.`;

    try {
      const response = await client.chat({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: {
          num_ctx: 4096,
          temperature: 0.0,
        },
      });

      const result = response.message.content.trim();

      if (!result || result === "NONE") {
        return null;
      }

      return result;
    } catch {
      return null;
    }
  }

  public async summarizeHistory(messages: Message[]): Promise<string | null> {
    const { client, model } = createClient();

    const conversation = messages
      .map((m) => m.role.toUpperCase() + ": " + m.content)
      .join("\n\n");

    const prompt = `You are summarizing a coding conversation to save context space.
Below is a conversation between a developer and an AI assistant.
Write a compact summary (max 150 words) covering:
- What files or code were discussed
- What problems were identified
- What solutions or decisions were reached
- Any important facts about the project mentioned

Be factual. No commentary. This summary will replace the full conversation history.

CONVERSATION:
${conversation}`;

    try {
      const response = await client.chat({
        model,
        messages: [{ role: "user", content: prompt }],
        stream: false,
        options: {
          num_ctx: 4096,
          temperature: 0.2,
        },
      });

      return response.message.content.trim();
    } catch {
      return null;
    }
  }

  public detectFileCreationIntent(userMessage: string): boolean {
    const signals = [
      "create a file",
      "create file",
      "new file",
      "add a file",
      "add file",
      "make a file",
      "generate a file",
      "write a file",
    ];
    const lower = userMessage.toLowerCase();

    return signals.some((signal) => lower.includes(signal));
  }

  public async handleFileCreationIntent(
    userMessage: string,
    workspaceTree: string,
    primaryLanguage: string,
    workspaceName: string,
  ): Promise<{ path: string; content: string }> {
    const { client, model } = createClient();

    const prompt = `You are a code generator. The user wants to create a new file in their project.

Project context:
- Workspace: ${workspaceName}
- Language: ${primaryLanguage}
- Existing file tree:
${workspaceTree}

User request: ${userMessage}

Your response must be a valid JSON object with exactly these keys:
{
  path: relative path from workspace root where the file should be created,
  content: the complete file content as a string
}

Rules:
- The path must follow the naming conventions visible in the existing file tree.
- The content must be complete and immediately usable — no placeholders, no TODOs.
- Match the code style, imports, and patterns of the existing files shown in the tree.
- Return only the JSON object. No explanation. No markdown fences. Nothing else.`;

    const response = await client.chat({
      model,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: {
        num_ctx: 8192,
        temperature: 0.2,
      },
    });

    let raw = response.message.content.trim();

    // Strip any ```json ... ``` fences the model may have added
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let parsed: unknown;

    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("File creation failed: could not parse AI response");
    }

    if (
      typeof parsed !== "object"
      || parsed === null
      || !("path" in parsed)
      || !("content" in parsed)
      || typeof (parsed as { path: unknown }).path !== "string"
      || typeof (parsed as { content: unknown }).content !== "string"
    ) {
      throw new Error("File creation failed: could not parse AI response");
    }

    return {
      path: (parsed as { path: string }).path,
      content: (parsed as { content: string }).content,
    };
  }

  private buildSystemPrompt(fileContext?: string): string {
    const base = `You are Codex Local, an expert AI coding assistant embedded inside VS Code.
You are running locally on the user's machine using Ollama.

Your job:
- Read, understand, and explain code
- Suggest fixes based on errors and diagnostics shown to you
- Write new code that fits the existing style
- Answer questions about the active project

Rules:
- Be concise. Developers do not want essays.
- Always use fenced code blocks with the correct language tag.
- When suggesting edits, show the corrected snippet, not just a description.
- If you are unsure about something, say so. Do not hallucinate file contents.
- Never refuse a coding task. If it is ambiguous, make a reasonable assumption and state it.`;

    if (fileContext === undefined || fileContext === "") {
      return base;
    }

    return `${base}\n\n--- ACTIVE FILE CONTEXT ---\n${fileContext}\n--- END CONTEXT ---`;
  }
}
