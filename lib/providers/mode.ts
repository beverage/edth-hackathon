/**
 * Where the models run.
 *   hosted  (default) Mistral for speech-to-text and extraction
 *   local   nothing leaves this computer: speech-to-text through whisper-server, extraction through Ollama
 */
export type ProviderMode = "hosted" | "local";

export function providerMode(): ProviderMode {
  return process.env.PROVIDER_MODE?.trim().toLowerCase() === "local" ? "local" : "hosted";
}

/** Ollama's address in local mode. */
export function ollamaUrl(): string {
  return (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

/** whisper-server's address in local mode: whisper.cpp on this computer, started with `npm run stt`. */
export function whisperUrl(): string {
  return (process.env.WHISPER_URL || "http://127.0.0.1:3118").replace(/\/+$/, "");
}
