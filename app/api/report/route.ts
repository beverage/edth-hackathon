import { NextResponse } from "next/server";
import { LocalTranscriberDownError, getTranscriber } from "@/lib/providers/transcriber";
import { pinnedLanguage } from "@/lib/providers/extractor";
import { biasTerms, loadGazetteer } from "@/lib/geo/gazetteer";
import { withTrackNumber, type KnownTrack } from "@/lib/geo/tracks";
import { clipSegments, keepClip, keepingClips, type ClipRecord } from "@/lib/reports/clips";
import { AREAS, DEFAULT_AREA, isAreaId, speechHints, whisperPrompt, WHISPER_PROMPT_PLACES, type AreaId } from "@/lib/geo/areas";
import type { GazetteerFeature, LastPosition, Resolution } from "@/lib/geo/types";
import { missionRoster } from "@/lib/reports/mission";
import { ANSWER_HEARD, answerHeard, readHeldAhead, readTranscript, REQUEST_ONLY, type Readings } from "@/lib/reports/pipeline";
import { splitRequest, type Split } from "@/lib/geo/requests";
import { positionFromReport } from "@/lib/reports/position";
import { afterCallsign, farMove, findSender, type SenderFound } from "@/lib/reports/radio";
import { openMissionLog, reportContext, saveHeld, saveReply, saveReport, saveRequest, type HeldInput, type ReportInput, type RequestInput } from "@/lib/reports/record";
import { callsignGiven, callsignOf, sessionCode, type HeardReply, type RequestReply, type Sender } from "@/lib/reports/types";

export const maxDuration = 30;

const MAX_AUDIO_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 500;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

const AREA_DATA = Object.fromEntries(
  (Object.keys(AREAS) as AreaId[]).map((id) => {
    const gazetteer = loadGazetteer(id);
    // The report words first, so the 100 always hold them.
    const words = AREAS[id].speechWords;
    return [id, { gazetteer, bias: [...words, ...biasTerms(gazetteer, 100 - words.length)], places: biasTerms(gazetteer, WHISPER_PROMPT_PLACES) }];
  }),
) as Record<AreaId, { gazetteer: GazetteerFeature[]; bias: string[]; places: string[] }>;

const NO_WORDS: Record<string, string> = {
  // Bangs, rain or a phone held away gave empty transcripts in the noise tests: say what helps [192].
  uk: "Не розчув. Говоріть ближче до мікрофона і повторіть.",
  fr: "Je n'ai rien entendu. Parlez plus près du micro et répétez.",
  en: "I didn't catch that. Speak closer to the microphone and try again.",
};

// Per-instance, best effort. Enough to stop a runaway loop in stage 1.
const hits = new Map<string, number[]>();
function rateLimited(ip: string, now: number): boolean {
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_MAX;
}

function parseLastPosition(v: FormDataEntryValue | null): LastPosition | null {
  if (typeof v !== "string" || !v) return null;
  try {
    const o = JSON.parse(v);
    if ([o.lat, o.lon, o.ts].every((x) => typeof x === "number" && Number.isFinite(x))) {
      const metres = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : undefined);
      return { lat: o.lat, lon: o.lon, ts: o.ts, uncertainty_m: metres(o.uncertainty_m), radius_m: metres(o.radius_m) };
    }
  } catch {}
  return null;
}

/**
 * Saves the report when the transmitter named a session, and returns its id for the reply. A
 * failure to save is logged and does not cost the speaker their answer.
 * A report about a track gets its number on saving, so the resolution comes back too: with the
 * number and the words to say back, or, when nothing was saved, with words that say it has none.
 */
async function save(session: string | null, input: Omit<ReportInput, "session">): Promise<{ report_id?: string; resolution: Resolution; request?: RequestReply }> {
  // Without words there is no track to number.
  const unsaved = { resolution: input.intent ? withTrackNumber(input.resolution, null, input.intent, input.read ?? input.transcript) : input.resolution };
  if (!session) return unsaved;
  try {
    const saved = await saveReport({ session, ...input });
    return saved ? { report_id: saved.id, resolution: saved.resolution, ...(saved.request ? { request: saved.request } : {}) } : unsaved;
  } catch (err) {
    console.error("saving the report failed", err);
    return unsaved;
  }
}

/** A request for recon cut out of the words, for `save()`: the request, and the words read for saying back [234]. */
function asked(heard: Split): Pick<ReportInput, "request" | "read"> {
  return heard.request ? { request: heard.request, read: heard.text } : {};
}

/** Saves a call that was only a request for recon [234]. A failure to save is logged; the reply says nothing was asked. */
async function saveAsked(session: string | null, input: Omit<RequestInput, "session">): Promise<{ request?: RequestReply }> {
  if (!session) return {};
  try {
    const e = await saveRequest({ session, ...input });
    return e ? { request: { id: e.id, n: e.n } } : {};
  } catch (err) {
    console.error("saving the request failed", err);
    return {};
  }
}

/** The recording's extension, for keeping it beside a held report. */
function extOf(audio: Blob): string {
  const name = (audio as File).name ?? "";
  const m = name.match(/\.(wav|m4a|mp4|aac|caf|webm|ogg|mp3)$/i);
  if (m) return m[1].toLowerCase();
  const t = audio.type;
  return t.includes("wav") ? "wav" : t.includes("mp4") || t.includes("m4a") || t.includes("aac") ? "m4a" : t.includes("webm") ? "webm" : t.includes("ogg") ? "ogg" : t.includes("mpeg") ? "mp3" : "bin";
}

/**
 * Holds a radio report for the operator [203]. The phone or radio that sent it gets `held` back, not
 * a resolution. The model starts reading its words while it waits, so giving it to a unit later is
 * quick [257]; `readings` are what the model read already, for a report held after it was read.
 */
async function hold(session: string, input: Omit<HeldInput, "session" | "audio">, sound: Blob | null, readings?: Readings) {
  try {
    const audio = sound ? { data: Buffer.from(await sound.arrayBuffer()), ext: extOf(sound) } : null;
    const entry = await saveHeld({ session, ...input, audio });
    // Not awaited: the reply does not wait for the model. It never throws.
    if (entry) void readHeldAhead(entry, readings);
    return entry ? { id: entry.id, reason: entry.reason, question: entry.question, audio: entry.audio } : null;
  } catch (err) {
    console.error("holding the radio report failed", err);
    return null;
  }
}

export async function POST(req: Request) {
  const t0 = performance.now();
  const now = Date.now();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip, now)) return NextResponse.json({ error: "Too many reports, slow down." }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const audio = form.get("audio");
  const textIn = form.get("text");
  // Legacy developer clients can send a test clip beside text. New phone reports use audio.
  // Clips are kept only with KEEP_CLIPS=1 (lib/reports/clips.ts).
  const clipIn = form.get("clip");
  const clip = clipIn instanceof Blob && clipIn.size > 0 && clipIn.size <= MAX_AUDIO_BYTES ? clipIn : null;
  const segments = clipSegments(form.get("segments"));
  let lastPosition = parseLastPosition(form.get("lastPosition"));
  /** The mission's tracks, so a number the speaker says can be checked. None outside a mission. */
  let tracks: KnownTrack[] = [];
  const clientTs = Number(form.get("clientTs")) || null;
  const areaIn = form.get("area");
  let areaId: AreaId = isAreaId(areaIn) ? areaIn : DEFAULT_AREA;
  // Who sent it and where it belongs; reports without a session (the web page) are not saved.
  const session = sessionCode(form.get("session"));
  // In a mission, a report with no call sign is a radio report: who sent it is read from its words [202].
  const radio = session != null && !callsignGiven(form.get("callsign"));
  let callsign = callsignOf(form.get("callsign"));
  const seqIn = Number(form.get("seq"));
  const seq = Number.isInteger(seqIn) && seqIn > 0 ? seqIn : null;
  // The language the device is set to. It decides the question's language; without it, it is guessed.
  const pinned = pinnedLanguage(form.get("language"));
  /** A radio report: the mission's roster, the first hints for Voxtral [205]. */
  let roster: string[] = [];
  if (session && radio) {
    try {
      const m = await openMissionLog(session);
      if (!m.ok) return NextResponse.json({ error: m.error, ended: m.ended }, { status: m.status });
      areaId = m.area;
      roster = missionRoster(m.entries);
    } catch (err) {
      console.error("reading the mission failed", err);
      return NextResponse.json({ error: "Reading the mission failed." }, { status: 500 });
    }
  } else if (session) {
    // In a mission, the mission sets the area and the log gives the last position, not the phone.
    try {
      const c = await reportContext(session, callsign, { area: areaId, lastPosition }, now);
      if (!c.ok) return NextResponse.json({ error: c.error, ended: c.ended }, { status: c.status });
      areaId = c.area;
      lastPosition = c.lastPosition;
      tracks = c.tracks;
    } catch (err) {
      console.error("reading the mission failed", err);
      return NextResponse.json({ error: "Reading the mission failed." }, { status: 500 });
    }
  }
  const area = AREAS[areaId];
  const { bias } = AREA_DATA[area.id];
  const meta = { callsign, seq, clientTs, area: area.id, lastPosition };
  const sound = clip ?? (audio instanceof Blob && audio.size > 0 ? audio : null);

  const timings = { stt: 0, extract: 0, resolve: 0, total: 0 };
  let transcript = "";
  let sttLanguage: string | null = null;
  /** Keeps the report's audio when KEEP_CLIPS=1; the file name goes back in the reply. */
  const keep = async (r: Pick<ClipRecord, "transcript" | "language"> & { resolution: Resolution; report_id?: string }): Promise<{ clip?: string }> => {
    if (!sound || !keepingClips()) return {};
    const { resolution: res } = r;
    const file = await keepClip(sound, {
      ts: now, session, callsign: meta.callsign, seq, source: clip ? "phone" : "server", transcript: r.transcript, segments, language: r.language,
      status: res.status, rule: res.evidence.rule, detail: res.evidence.detail, question: res.question, report_id: r.report_id, timings_ms: timings,
    });
    return file ? { clip: file } : {};
  };

  try {
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Clip too large (1 MB max, about 15 s)." }, { status: 413 });
      const s = performance.now();
      // A speaker whose language is not the area's gets phrases in their own language first [190].
      // Whisper on this computer listens for the device's language, as the phone does; Mistral detects it itself.
      // On a radio net, the roster's call signs go first, so Voxtral hears them [205].
      // Whisper here gets a short prompt instead: the roster and ten place names, none in Cyrillic [247].
      const hints = [...roster, ...speechHints(area, bias, pinned)].slice(0, 100);
      const prompt = whisperPrompt(roster, AREA_DATA[area.id].places);
      const r = await getTranscriber().transcribe(audio, audio.type || "audio/webm", hints, { language: pinned, prompt });
      timings.stt = Math.round(performance.now() - s);
      transcript = r.text;
      sttLanguage = r.language;
    } else if (typeof textIn === "string" && textIn.trim()) {
      transcript = textIn.trim().slice(0, MAX_TEXT_CHARS);
    } else if (clip) {
      // The phone heard no words but sent its clip: a whisper it missed is worth keeping.
      transcript = "";
    } else {
      return NextResponse.json({ error: "Send `audio` or `text`." }, { status: 400 });
    }

    /** For a radio report: who sent it, once the words are known. */
    let sender: Sender | undefined;
    if (session && radio) {
      // Read the log again: questions may have opened while the clip was transcribed.
      const m = await openMissionLog(session);
      if (!m.ok) return NextResponse.json({ error: m.error, ended: m.ended }, { status: m.status });
      const found: SenderFound = findSender(transcript, m.entries, now);
      const language = pinned ?? sttLanguage;
      if (found.kind === "held") {
        timings.total = Math.round(performance.now() - t0);
        const held = await hold(session, { clientTs, area: area.id, transcript, language, reason: found.reason, heard: found.heard, read: found.read, candidates: found.candidates, question: found.question }, sound);
        console.log(`[radio] held (${found.reason}): ${found.why}`);
        return NextResponse.json({ transcript, language, intent: null, timings_ms: timings, clientTs, area: area.id, held });
      }
      callsign = found.callsign;
      sender = found.sender;
      const c = await reportContext(session, callsign, { area: areaId, lastPosition }, now);
      if (!c.ok) return NextResponse.json({ error: c.error, ended: c.ended }, { status: c.status });
      lastPosition = c.lastPosition;
      tracks = c.tracks;
      Object.assign(meta, { callsign, lastPosition });
      // A few words that answer the unit's open question are not a report [251]: "two", "the metro
      // station". They are kept as what was heard, and the command post confirms the choice. Nothing
      // moves, and no model reads them. Anything else is read as a report, as before.
      const answer = answerHeard(m.entries, callsign, afterCallsign(transcript, sender.heard), now);
      if (answer) {
        const lang = pinned ?? sttLanguage;
        let saved: Awaited<ReturnType<typeof saveReply>> = null;
        try {
          saved = await saveReply({ session, callsign, clientTs, report_id: answer.report_id, transcript, language: lang, choice: answer.candidate.id, how: answer.how, sender });
        } catch (err) {
          console.error("keeping the answer heard failed", err);
        }
        // Not saved: the question closed meanwhile. The words go on as a report.
        if (saved) {
          timings.total = Math.round(performance.now() - t0);
          const heardAs: HeardReply = { question: answer.report_id, choice: answer.candidate.id, n: answer.n, name: answer.candidate.name, how: answer.how };
          const kept = await keep({ transcript, language: lang, resolution: ANSWER_HEARD, report_id: saved.id });
          console.log(`[radio] ${callsign}: heard as an answer, choice ${answer.n} (${answer.how})`);
          return NextResponse.json({ transcript, language: lang, intent: null, timings_ms: timings, clientTs, area: area.id, callsign, sender, resolution: ANSWER_HEARD, report_id: saved.id, heard: heardAs, ...kept });
        }
      }
      // The model reads the words after the call sign, with a request for recon cut out [234]; the log keeps them all.
      const heard = splitRequest(afterCallsign(transcript, sender.heard));
      if (heard.only && heard.request) {
        timings.total = Math.round(performance.now() - t0);
        const lang = pinned ?? sttLanguage;
        const request = await saveAsked(session, { callsign, words: heard.request.words, n: heard.request.n, sender });
        const kept = await keep({ transcript, language: lang, resolution: REQUEST_ONLY });
        return NextResponse.json({ transcript, language: lang, intent: null, timings_ms: timings, clientTs, area: area.id, callsign, sender, resolution: REQUEST_ONLY, ...request, ...kept });
      }
      const r = await readTranscript(heard.text, { area, sttLanguage, pinned, lastPosition, now, tracks, callsign });
      timings.extract = r.extract_ms;
      timings.resolve = r.resolve_ms;
      timings.total = Math.round(performance.now() - t0);
      // A move the unit could not have made waits for the operator: maybe it was another unit [204].
      const to = r.resolution.track ? null : positionFromReport(r.resolution, r.intent);
      const far = farMove(m.entries, callsign, lastPosition, c.atStart, to, now);
      if (far) {
        const lang = pinned ?? sttLanguage ?? r.intent.language;
        const held = await hold(
          session,
          { clientTs, area: area.id, transcript, language: lang, reason: "far", heard: sender.heard, read: null, candidates: [...far.others, callsign], question: far.question, position: to },
          sound,
          // Read already: giving it to a unit places it again without the model [257].
          r.readings,
        );
        console.log(`[radio] held (far): ${far.question}`);
        return NextResponse.json({ transcript, language: lang, intent: r.intent, timings_ms: timings, clientTs, area: area.id, held });
      }
      const lang = pinned ?? sttLanguage ?? r.intent.language;
      const saved = await save(session, { ...meta, transcript, language: lang, intent: r.intent, resolution: r.resolution, timings_ms: timings, sender, ...asked(heard) });
      const kept = await keep({ transcript, language: lang, ...saved });
      return NextResponse.json({ transcript, language: lang, intent: r.intent, timings_ms: timings, clientTs, area: area.id, callsign, sender, ...saved, ...kept });
    }

    if (!transcript) {
      timings.total = Math.round(performance.now() - t0);
      const heard = pinned ?? sttLanguage;
      const resolution: Resolution = {
        status: "unresolved",
        candidates: [],
        question: NO_WORDS[heard === "ru" ? "uk" : (heard ?? "")] ?? NO_WORDS[area.id === "kyiv" || area.id === "izium" ? "uk" : "en"],
        evidence: { rule: "empty_transcript", detail: "speech-to-text returned no words" },
      };
      const saved = await save(session, { ...meta, transcript: "", language: heard, intent: null, resolution, timings_ms: timings });
      const kept = await keep({ transcript: "", language: heard, ...saved });
      return NextResponse.json({ transcript: "", language: heard, intent: null, timings_ms: timings, clientTs, area: area.id, ...saved, ...kept });
    }

    // A request for recon is cut out before the model reads the words [234].
    const heard = splitRequest(transcript);
    if (heard.only && heard.request) {
      timings.total = Math.round(performance.now() - t0);
      const language = pinned ?? sttLanguage;
      const request = await saveAsked(session, { callsign, words: heard.request.words, n: heard.request.n });
      const kept = await keep({ transcript, language, resolution: REQUEST_ONLY });
      return NextResponse.json({ transcript, language, intent: null, timings_ms: timings, clientTs, area: area.id, resolution: REQUEST_ONLY, ...request, ...kept });
    }
    const read = await readTranscript(heard.text, { area, sttLanguage, pinned, lastPosition, now, tracks, callsign });
    const { intent, resolution } = read;
    timings.extract = read.extract_ms;
    timings.resolve = read.resolve_ms;
    timings.total = Math.round(performance.now() - t0);

    const language = pinned ?? sttLanguage ?? intent.language;
    const saved = await save(session, { ...meta, transcript, language, intent, resolution, timings_ms: timings, ...asked(heard) });
    const kept = await keep({ transcript, language, ...saved });
    return NextResponse.json({ transcript, language, intent, timings_ms: timings, clientTs, area: area.id, ...saved, ...kept });
  } catch (err) {
    timings.total = Math.round(performance.now() - t0);
    if (err instanceof LocalTranscriberDownError) {
      console.warn(`[stt] ${err.message}. Start it with \`npm run stt\` (\`npm run stt:prepare\` once first).`);
      const error = "Speech-to-text on the coordinator is not ready. Start it with npm run stt; run npm run stt:prepare once first if the speech models are missing.";
      return NextResponse.json({ error, transcript, timings_ms: timings }, { status: 503 });
    }
    console.error("report failed", err);
    return NextResponse.json({ error: "Processing failed. Try again or type the report.", transcript, timings_ms: timings }, { status: 502 });
  }
}
