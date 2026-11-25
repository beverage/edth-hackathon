/**
 * Speech-to-text seam.
 *   hosted  Mistral, with MISTRAL_API_KEY. Mistral is asked to tell speakers apart (diarization):
 *           where the speaker changes, the transcript gets a ">>" mark, the same mark
 *           lib/geo/voices.ts splits voice turns at. MISTRAL_STT_DIARIZE=0 turns it off.
 *   local   Whisper in whisper-server (whisper.cpp) on this computer, at WHISPER_URL
 *           (decisions 195, 215). Audio never leaves the computer. It does not tell speakers apart.
 * GRADIUM_API_KEY is recognised but its transcriber is not built in stage 1.
 */
import { providerMode, whisperUrl } from "./mode";
import { fetchRetrying } from "./retry";

export interface TranscribeResult {
  text: string;
  /** ISO 639-1 if the provider reports it */
  language: string | null;
}

export interface TranscribeOptions {
  /** The language the device is set to (en, fr, uk). Without it, the model detects the language. Mistral ignores it. */
  language?: string | null;
  /** Text for Whisper to read as what came before the clip: call signs and place names [247]. Mistral takes the bias terms instead. */
  prompt?: string | null;
}

export interface Transcriber {
  name: string;
  transcribe(audio: Blob, mime: string, biasTerms: string[], opts?: TranscribeOptions): Promise<TranscribeResult>;
}

/** A stretch of speech as Mistral returns it with segment timestamps. */
export interface SpeakerSegment {
  text: string;
  speaker_id?: string | null;
  start?: number;
  end?: number;
}

/**
 * One transcript from diarized segments: consecutive segments of one speaker are joined with a
 * space, and a change of speaker is marked ">>". A segment with no speaker label joins the one before.
 */
export function joinSpeakers(segments: SpeakerSegment[]): string {
  let out = "";
  let last: string | null | undefined;
  for (const seg of segments) {
    const text = (seg.text ?? "").trim();
    if (!text) continue;
    const who = seg.speaker_id ?? last;
    if (out && who != null && last != null && who !== last) out += " >> ";
    else if (out) out += " ";
    out += text;
    last = who;
  }
  return out;
}

const diarizeOn = () => process.env.MISTRAL_STT_DIARIZE !== "0";

/** Mistral refused the diarization options (400 or 422); a timeout or an outage is not this. */
class DiarizeRefused extends Error {}

function extFor(mime: string): string {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  return "webm";
}

class MistralTranscriber implements Transcriber {
  name: string;
  constructor(
    private apiKey: string,
    private model = process.env.MISTRAL_STT_MODEL || "voxtral-mini-transcribe-3",
  ) {
    this.name = `mistral:${this.model}`;
  }

  async transcribe(audio: Blob, mime: string, biasTerms: string[]): Promise<TranscribeResult> {
    if (diarizeOn()) {
      try {
        return await this.request(audio, mime, biasTerms, true);
      } catch (err) {
        if (!(err instanceof DiarizeRefused)) throw err;
        // A refused option must not cost the report: transcribe again as before.
        console.warn(`[stt] diarization refused, transcribing without it: ${err.message}`);
      }
    }
    return this.request(audio, mime, biasTerms, false);
  }

  private async request(audio: Blob, mime: string, biasTerms: string[], diarize: boolean): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new File([audio], `clip.${extFor(mime)}`, { type: mime.split(";")[0] }));
    form.append("model", this.model);
    form.append("return_language", "true");
    if (diarize) {
      // Diarization labels segments, so it needs segment timestamps (Mistral docs, 21 Nov 2026).
      form.append("diarize", "true");
      form.append("timestamp_granularities", "segment");
    }
    // Repeated field, one entry per term (checked against Mistral docs and live API, 20 Nov 2026).
    for (const t of biasTerms.slice(0, 100)) form.append("context_bias", t);
    const res = await fetchRetrying("https://api.mistral.ai/v1/audio/transcriptions", () => ({
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    }));
    if (!res.ok) {
      const msg = `Mistral STT ${res.status}: ${(await res.text()).slice(0, 200)}`;
      throw diarize && (res.status === 400 || res.status === 422) ? new DiarizeRefused(msg) : new Error(msg);
    }
    const j = (await res.json()) as { text?: string; language?: string | null; segments?: SpeakerSegment[] };
    const text = diarize && j.segments?.length ? joinSpeakers(j.segments) : (j.text ?? "");
    return { text: text.trim(), language: j.language ?? null };
  }
}

/** Thrown in local mode when whisper-server does not answer: not started, or still loading its model. */
export class LocalTranscriberDownError extends Error {
  constructor(url: string, why: string) {
    super(`speech-to-text on this computer (whisper-server at ${url}) is not answering: ${why}`);
    this.name = "LocalTranscriberDownError";
  }
}

/** whisper.cpp names the language in full; the rest of the app uses ISO 639-1. */
const WHISPER_LANGUAGES: Record<string, string> = {
  english: "en", french: "fr", ukrainian: "uk", russian: "ru", german: "de", polish: "pl", spanish: "es", italian: "it",
};

/**
 * Whisper's marks for sounds that are not words, such as "[BLANK_AUDIO]" for silence. Removed, so a
 * clip with no speech comes back empty and the speaker is asked to repeat.
 */
export function withoutSoundMarks(text: string): string {
  return text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Whisper in whisper-server (whisper.cpp) on this computer. It is started with --convert, so it takes
 * the browser's webm and the phone's m4a through ffmpeg. Each request carries its own language and
 * prompt; the server keeps nothing between requests. The prompt is short, call signs and ten place
 * names [247]: a real English voice's "Château de Vincennes" came back "Château de Vonsen" without
 * one. Decision 195 had dropped it after synthetic voices gained nothing from a long list.
 * Light mode uses base with the same request format; its accuracy is not remeasured.
 */
class WhisperServerTranscriber implements Transcriber {
  name = "whisper-server";
  constructor(private url = whisperUrl()) {}

  async transcribe(audio: Blob, mime: string, _biasTerms: string[], opts: TranscribeOptions = {}): Promise<TranscribeResult> {
    const form = new FormData();
    form.append("file", new File([audio], `clip.${extFor(mime)}`, { type: mime.split(";")[0] }));
    // Only verbose_json names the language, but it also runs a second pass to score every language,
    // about 0.9 s on the M1 Pro. So it is asked for only when the device names no language.
    form.append("response_format", opts.language ? "json" : "verbose_json");
    form.append("language", opts.language || "auto");
    if (opts.prompt) form.append("prompt", opts.prompt);
    let res: Response;
    try {
      res = await fetch(`${this.url}/inference`, { method: "POST", body: form, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") throw new Error("whisper-server took over 20 s");
      throw new LocalTranscriberDownError(this.url, err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err));
    }
    // 503: the server is up but still loading its model.
    if (res.status === 503) throw new LocalTranscriberDownError(this.url, "still loading its model");
    if (!res.ok) throw new Error(`whisper-server ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { text?: string; language?: string; error?: string };
    if (j.error) throw new Error(`whisper-server: ${j.error.slice(0, 200)}`);
    const language = opts.language || WHISPER_LANGUAGES[(j.language ?? "").toLowerCase()] || null;
    return { text: withoutSoundMarks(j.text ?? ""), language };
  }
}

let cached: Transcriber | null = null;

export function getTranscriber(): Transcriber {
  if (cached) return cached;
  // Local mode never sends audio to Mistral, even with a key set.
  if (providerMode() === "local") cached = new WhisperServerTranscriber();
  else if (process.env.MISTRAL_API_KEY) cached = new MistralTranscriber(process.env.MISTRAL_API_KEY);
  else if (process.env.GRADIUM_API_KEY) throw new Error("GRADIUM_API_KEY is set but the Gradium transcriber is not built in stage 1");
  else throw new Error("No speech-to-text key: set MISTRAL_API_KEY, or run offline with PROVIDER_MODE=local (docs/setup.md, part 3)");
  return cached;
}

/** Says at start-up whether whisper-server answers, so a missing one shows before the first spoken report. */
export async function checkLocalTranscriber(): Promise<boolean> {
  const url = whisperUrl();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3_000) });
    if (res.ok) console.log(`[stt] whisper-server ready at ${url}`);
    else console.warn(`[stt] whisper-server at ${url} is still loading its model`);
    return res.ok;
  } catch {
    console.warn(`[stt] No whisper-server at ${url}: spoken reports will fail until it runs. Start it with \`npm run stt\` (\`npm run stt:prepare\` once first); typed reports still work without it.`);
    return false;
  }
}
