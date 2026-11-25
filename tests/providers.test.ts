import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Each test loads the providers afresh, because they cache their choice.
async function providers() {
  vi.resetModules();
  const extractor = await import("../lib/providers/extractor");
  const transcriber = await import("../lib/providers/transcriber");
  return { ...extractor, ...transcriber };
}

describe("provider mode", () => {
  beforeEach(() => {
    vi.stubEnv("PROVIDER_MODE", "");
    vi.stubEnv("MISTRAL_API_KEY", "");
    vi.stubEnv("MISTRAL_EXTRACT_MODEL", "");
    vi.stubEnv("LOCAL_EXTRACT_MODEL", "");
    vi.stubEnv("OLLAMA_URL", "");
    vi.stubEnv("WHISPER_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is hosted by default", async () => {
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    const { getExtractor } = await providers();
    expect(getExtractor().name).toBe("mistral:mistral-small-latest");
  });

  it("extracts with Ollama in local mode, with no key", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    const { getExtractor } = await providers();
    expect(getExtractor().name).toBe("ollama:ministral-3:3b");
  });

  it("takes the local model from LOCAL_EXTRACT_MODEL", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    vi.stubEnv("LOCAL_EXTRACT_MODEL", "ministral-3:8b");
    const { getExtractor } = await providers();
    expect(getExtractor().name).toBe("ollama:ministral-3:8b");
  });

  it("never sends audio to Mistral in local mode, even with a key", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ language: "english", text: " I'm at Bérault." })));
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    expect(getTranscriber().name).toBe("whisper-server");
    await getTranscriber().transcribe(new Blob([new Uint8Array(8)]), "audio/webm", ["Bérault"]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://127.0.0.1:3118/inference");
  });

  it("sends the same schema request to Ollama on this computer, with a context the whole prompt fits in [254]", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    const reply = { kind: "position", landmark_text: "the town hall", landmark_name: null, landmark_name_lemma: null, landmark_category: "town_hall", relation: "at", distance_m: null, direction: null, language: "en", confidence: 0.9 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: { role: "assistant", content: JSON.stringify(reply) } })));
    vi.stubGlobal("fetch", fetchMock);
    const { getExtractor, INTENT_SCHEMA, systemPrompt } = await providers();
    const { LOCAL_NUM_CTX } = await import("../lib/providers/ollama");
    const intent = await getExtractor().extract("I'm at the town hall.", { place: "Vincennes, France" });

    expect(intent.landmark_category).toBe("town_hall");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("ministral-3:3b");
    expect(body.stream).toBe(false);
    expect(body.format).toEqual(INTENT_SCHEMA);
    expect(body.options).toEqual({ temperature: 0, num_predict: 400, num_ctx: LOCAL_NUM_CTX });
    // Measured 4,556 tokens for 15,721 characters: about 3.5 a token. Fewer than 3 would be a very different text.
    const { AREAS } = await import("../lib/geo/areas");
    const longest = Math.max(...Object.values(AREAS).map((a) => systemPrompt(a.place).length));
    expect(longest / 3 + 100 + 400).toBeLessThan(LOCAL_NUM_CTX);
  });

  it("reads replies to a question with Ollama at the same context, so the model is not reloaded [254]", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ kind: "pick", choice: 2 }) } })));
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
    const { getReplyReader } = await import("../lib/providers/replies");
    const { LOCAL_NUM_CTX } = await import("../lib/providers/ollama");
    const question = { about: "self" as const, text: "Which one?", choices: [{ name: "Château de Vincennes", kind: "metro station" }, { name: "Château de Vincennes", kind: "castle" }] };
    expect(await getReplyReader().read("the castle", question)).toEqual({ kind: "pick", choice: 2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(init.body as string).options).toEqual({ temperature: 0, num_predict: 60, num_ctx: LOCAL_NUM_CTX });
  });

  it("starts Ollama in the setup steps at the context the requests name [254]", async () => {
    const { readFileSync } = await import("node:fs");
    const { LOCAL_NUM_CTX } = await import("../lib/providers/ollama");
    expect(readFileSync("docs/setup.md", "utf8")).toContain(`OLLAMA_CONTEXT_LENGTH=${LOCAL_NUM_CTX} ollama serve`);
  });

  it("takes the language the device pinned over the model's label (decision 106)", async () => {
    vi.stubEnv("PROVIDER_MODE", "local");
    // What the local 3B model answered for an English report in Kyiv
    const reply = { kind: "position", landmark_text: "Khreshchatyk", landmark_name: "Хрещатик", landmark_name_lemma: "Хрещатик", landmark_category: null, relation: "at", distance_m: null, direction: null, language: "uk", confidence: 0.9 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: { content: JSON.stringify(reply) } }))));
    const { getExtractor, pinnedLanguage } = await providers();
    const place = "central Kyiv, Ukraine";
    expect((await getExtractor().extract("I'm at Хрещатик.", { place, language: "en" })).language).toBe("en");
    expect((await getExtractor().extract("I'm at Хрещатик.", { place, language: "fr" })).language).toBe("fr");
    // Not pinned: the model's label, checked against the letters (mixed here, so it stands)
    expect((await getExtractor().extract("I'm at Хрещатик.", { place })).language).toBe("uk");
    expect([pinnedLanguage("uk"), pinnedLanguage("ru"), pinnedLanguage(null), pinnedLanguage("")]).toEqual(["uk", null, null, null]);
  });
});

describe("Mistral speech-to-text with speakers told apart", () => {
  beforeEach(() => {
    vi.stubEnv("PROVIDER_MODE", "");
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    vi.stubEnv("MISTRAL_STT_DIARIZE", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const clip = new Blob([new Uint8Array(8)], { type: "audio/webm" });
  const segments = [
    { text: " I'm at Bérault.", speaker_id: "speaker_0", start: 0, end: 1.2 },
    { text: " Going to the castle.", speaker_id: "speaker_1", start: 1.3, end: 2.5 },
    { text: " Now.", speaker_id: "speaker_1", start: 2.5, end: 2.9 },
  ];

  it("marks a change of speaker with >>, the mark voices are split at", async () => {
    const { joinSpeakers } = await providers();
    expect(joinSpeakers(segments)).toBe("I'm at Bérault. >> Going to the castle. Now.");
    expect(joinSpeakers([{ text: "One voice." }, { text: "Still one." }])).toBe("One voice. Still one.");
    expect(joinSpeakers([{ text: "A", speaker_id: "s0" }, { text: " " }, { text: "B", speaker_id: null }, { text: "C", speaker_id: "s1" }])).toBe("A B >> C");
  });

  it("asks for speakers and segment timestamps, and joins the segments", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "I'm at Bérault. Going to the castle. Now.", language: "en", segments })));
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    const r = await getTranscriber().transcribe(clip, "audio/webm", ["Bérault"]);
    expect(r).toEqual({ text: "I'm at Bérault. >> Going to the castle. Now.", language: "en" });
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get("diarize")).toBe("true");
    expect(form.get("timestamp_granularities")).toBe("segment");
    expect(form.getAll("context_bias")).toEqual(["Bérault"]);
  });

  it("transcribes again without speakers when Mistral refuses the option", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("diarize not supported", { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: "I'm at Bérault.", language: "en" })));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getTranscriber } = await providers();
    expect((await getTranscriber().transcribe(clip, "audio/webm", [])).text).toBe("I'm at Bérault.");
    const second = (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as FormData;
    expect(second.get("diarize")).toBeNull();
  });

  it("does not drop diarization for an outage: it is tried again, then reported", async () => {
    const fetchMock = vi.fn(async () => new Response("down", { status: 503, headers: { "retry-after": "0" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getTranscriber } = await providers();
    await expect(getTranscriber().transcribe(clip, "audio/webm", [])).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const call of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect((call[1].body as FormData).get("diarize")).toBe("true");
  });

  it("can be turned off", async () => {
    vi.stubEnv("MISTRAL_STT_DIARIZE", "0");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text: "I'm at Bérault.", language: "en" })));
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    await getTranscriber().transcribe(clip, "audio/webm", []);
    const form = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get("diarize")).toBeNull();
  });
});

describe("a busy Mistral is tried again [191]", () => {
  beforeEach(() => {
    vi.stubEnv("PROVIDER_MODE", "");
    vi.stubEnv("MISTRAL_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const busy = () => new Response("rate limited", { status: 429, headers: { "retry-after": "0" } });

  it("transcribes after a rate limit", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(new Response(JSON.stringify({ text: "I'm at Bérault.", language: "en" })));
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    const r = await getTranscriber().transcribe(new Blob([new Uint8Array(8)], { type: "audio/webm" }), "audio/webm", []);
    expect(r.text).toBe("I'm at Bérault.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("extracts after a rate limit, and gives up after two more tries", async () => {
    const reply = { kind: "position", landmark_text: "Bérault", landmark_name: "Bérault", landmark_category: "metro_station", relation: "at", distance_m: null, direction: null, language: "en", confidence: 0.9 };
    const ok = () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }));
    const once = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", once);
    const { getExtractor } = await providers();
    expect((await getExtractor().extract("I'm at Bérault.")).landmark_name).toBe("Bérault");
    expect(once).toHaveBeenCalledTimes(2);

    const always = vi.fn(async () => busy());
    vi.stubGlobal("fetch", always);
    const again = await providers();
    await expect(again.getExtractor().extract("I'm at Bérault.")).rejects.toThrow(/429/);
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("does not retry a refused request", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { getExtractor } = await providers();
    await expect(getExtractor().extract("I'm at Bérault.")).rejects.toThrow(/400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits as Retry-After asks, at most 2 s", async () => {
    const { retryWaitMs } = await import("../lib/providers/retry");
    expect(retryWaitMs(new Response("", { status: 429, headers: { "retry-after": "1" } }), 1)).toBe(1000);
    expect(retryWaitMs(new Response("", { status: 429, headers: { "retry-after": "30" } }), 1)).toBe(2000);
    expect(retryWaitMs(new Response("", { status: 429 }), 1)).toBe(500);
    expect(retryWaitMs(new Response("", { status: 429 }), 2)).toBe(1000);
  });
});

describe("Whisper on this computer in offline mode (decision 195)", () => {
  beforeEach(() => {
    vi.stubEnv("PROVIDER_MODE", "local");
    vi.stubEnv("WHISPER_URL", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const clip = new Blob([new Uint8Array(8)], { type: "audio/webm" });
  const reply = (body: object, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
  const formOf = (fetchMock: ReturnType<typeof vi.fn>) => (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;

  it("sends the prompt it is given, and only that [247]", async () => {
    const fetchMock = reply({ text: " Alpha 1 at the Château de Vincennes." });
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    await getTranscriber().transcribe(clip, "audio/mp4", ["Bérault", "Château de Vincennes"], { language: "en", prompt: "ALPHA 1, Bérault" });
    expect(formOf(fetchMock).get("prompt")).toBe("ALPHA 1, Bérault");
  });

  it("listens for the device's language, with no prompt when none is given", async () => {
    // Plain json names no language: the device's is kept, and the server skips scoring every language.
    const fetchMock = reply({ text: " Я біля Центральної районної лікарні." });
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    const r = await getTranscriber().transcribe(clip, "audio/webm", ["Ізюм"], { language: "uk" });
    expect(r).toEqual({ text: "Я біля Центральної районної лікарні.", language: "uk" });
    const form = formOf(fetchMock);
    expect(form.get("language")).toBe("uk");
    expect(form.get("response_format")).toBe("json");
    expect(form.get("prompt")).toBeNull();
    expect((form.get("file") as File).name).toBe("clip.webm");
  });

  it("detects the language when the device names none, and reports it as ISO 639-1", async () => {
    const fetchMock = reply({ language: "french", text: "Je suis à Bérault." });
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    expect((await getTranscriber().transcribe(clip, "audio/mp4", [])).language).toBe("fr");
    expect(formOf(fetchMock).get("language")).toBe("auto");
    expect(formOf(fetchMock).get("response_format")).toBe("verbose_json");
  });

  it("returns no words for silence, so the speaker is asked to repeat", async () => {
    vi.stubGlobal("fetch", reply({ language: "english", text: " [BLANK_AUDIO]" }));
    const { getTranscriber, withoutSoundMarks } = await providers();
    expect((await getTranscriber().transcribe(clip, "audio/webm", [], { language: "en" })).text).toBe("");
    expect(withoutSoundMarks("I'm at [MUSIC] Bérault.")).toBe("I'm at Bérault.");
  });

  it("takes its address from WHISPER_URL", async () => {
    vi.stubEnv("WHISPER_URL", "http://10.0.0.5:9000/");
    const fetchMock = reply({ language: "english", text: "I'm at Bérault." });
    vi.stubGlobal("fetch", fetchMock);
    const { getTranscriber } = await providers();
    await getTranscriber().transcribe(clip, "audio/webm", []);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("http://10.0.0.5:9000/inference");
  });

  it("says the server is down when nothing answers or the model is still loading", async () => {
    const { getTranscriber, LocalTranscriberDownError } = await providers();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed", { cause: new Error("connect ECONNREFUSED 127.0.0.1:3118") }); }));
    await expect(getTranscriber().transcribe(clip, "audio/webm", [])).rejects.toThrow(LocalTranscriberDownError);
    vi.stubGlobal("fetch", reply({ status: "loading model" }, 503));
    await expect(getTranscriber().transcribe(clip, "audio/webm", [])).rejects.toThrow(/still loading/);
  });

  it("treats a failed transcription as a failure, not as a server that is down", async () => {
    const { getTranscriber, LocalTranscriberDownError } = await providers();
    vi.stubGlobal("fetch", reply({ error: "failed to read audio data" }, 400));
    const err = await getTranscriber().transcribe(clip, "audio/webm", []).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(LocalTranscriberDownError);
  });
});
