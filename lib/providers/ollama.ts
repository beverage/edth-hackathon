/**
 * Ollama's own chat endpoint, for local mode [254]. Ollama maps its OpenAI-compatible
 * /v1/chat/completions onto the same handler, but that endpoint takes no context size, so the
 * server's default applied. With 4,096 tokens, Ollama cut the 4,560-token extraction prompt to
 * 2,051 without an error: it keeps the first 5 tokens and the end, and drops the rules between.
 * Here each request names its context, whoever started Ollama and however.
 */

/**
 * Tokens of context for every local call. The extraction prompt is about 4,560 tokens, a report
 * under 100 and the answer at most 400; this leaves about 3,000 for the prompt to grow.
 * docs/setup.md starts Ollama with the same value, so no call reloads the model at another size.
 */
export const LOCAL_NUM_CTX = 8192;

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

/** The request body: what /v1 sends for temperature, max_tokens and a JSON schema, plus num_ctx. */
export function ollamaChatBody(model: string, messages: ChatMessage[], schema: object, maxTokens: number) {
  return {
    model,
    messages,
    stream: false,
    format: schema,
    options: { temperature: 0, num_predict: maxTokens, num_ctx: LOCAL_NUM_CTX },
  };
}

/** The model's answer from an /api/chat reply. */
export function ollamaChatContent(reply: unknown): string | undefined {
  return (reply as { message?: { content?: string } } | null)?.message?.content;
}
