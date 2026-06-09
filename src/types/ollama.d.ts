declare module "ollama" {
  type OllamaRole = "user" | "assistant" | "system";

  interface OllamaChatMessage {
    role: OllamaRole;
    content: string;
  }

  interface OllamaChatOptions {
    num_ctx: number;
    temperature: number;
  }

  interface OllamaChatRequestStream {
    model: string;
    messages: OllamaChatMessage[];
    stream: true;
    options: OllamaChatOptions;
  }

  interface OllamaChatRequestSync {
    model: string;
    messages: OllamaChatMessage[];
    stream: false;
    options: OllamaChatOptions;
  }

  interface OllamaChatResponse {
    message: {
      role: OllamaRole;
      content: string;
    };
    done: boolean;
  }

  export class Ollama {
    public constructor(options: { host: string });
    public list(): Promise<unknown>;
    public chat(request: OllamaChatRequestStream): Promise<AsyncIterable<unknown>>;
    public chat(request: OllamaChatRequestSync): Promise<OllamaChatResponse>;
  }
}
