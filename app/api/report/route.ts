import { NextResponse } from "next/server";
import { NoLocalTranscriberError, getTranscriber } from "@/lib/providers/transcriber";
import { getExtractor, pinnedLanguage } from "@/lib/providers/extractor";
import { matchAnswer, type AnswerChoice } from "@/lib/geo/answers";
import { biasTerms, loadGazetteer } from "@/lib/geo/gazetteer";
import { affiliationSaid, kindSaid, resolveReport, trackNumberSaid, withTrackNumber, type KnownTrack } from "@/lib/geo/tracks";
import { readVoices } from "@/lib/geo/voices";
import { clipSegments, keepClip, keepingClips, type ClipRecord } from "@/lib/reports/clips";
import { AREAS, DEFAULT_AREA, isAreaId, speechHints, type AreaId } from "@/lib/geo/areas";
import type { GazetteerFeature, LastPosition, Resolution } from "@/lib/geo/types";
import { reportContext, saveReport, type ReportInput } from "@/lib/reports/record";
import { callsignOf, sessionCode } from "@/lib/reports/types";

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
    return [id, { gazetteer, bias: [...words, ...biasTerms(gazetteer, 100 - words.length)] }];
  }),
) as Record<AreaId, { gazetteer: GazetteerFeature[]; bias: string[] }>;

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
async function save(session: string | null, input: Omit<ReportInput, "session">): Promise<{ report_id?: string; resolution: Resolution }> {
  const unsaved = { resolution: input.intent ? withTrackNumber(input.resolution, null, input.intent, input.transcript) : input.resolution };
  if (!session) return unsaved;
  try {
    const saved = await saveReport({ session, ...input });
    return saved ? { report_id: saved.id, resolution: saved.resolution } : unsaved;
  } catch (err) {
    console.error("saving the report failed", err);
    return unsaved;
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
  // Test clips: the phone's own recording and Whisper's timed segments, sent beside its text when
  // its "Send clips" switch is on. Kept only with KEEP_CLIPS=1 (lib/reports/clips.ts).
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
  const callsign = callsignOf(form.get("callsign"));
  const seqIn = Number(form.get("seq"));
  const seq = Number.isInteger(seqIn) && seqIn > 0 ? seqIn : null;
  // The language the device is set to. It decides the question's language; without it, it is guessed.
  const pinned = pinnedLanguage(form.get("language"));
  // The choices of a question still open on the speaker's screen: a short clip may answer it [194].
  const choices = answerChoices(form.get("choices"));
  if (session) {
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
  const { gazetteer, bias } = AREA_DATA[area.id];
  const meta = { callsign, seq, clientTs, area: area.id, lastPosition };

  const timings = { stt: 0, extract: 0, resolve: 0, total: 0 };
  let transcript = "";
  let sttLanguage: string | null = null;
  /** Keeps the report's audio when KEEP_CLIPS=1; the file name goes back in the reply. */
  const keep = async (r: Pick<ClipRecord, "transcript" | "language"> & { resolution: Resolution; report_id?: string }): Promise<{ clip?: string }> => {
    const sound = clip ?? (audio instanceof Blob && audio.size > 0 ? audio : null);
    if (!sound || !keepingClips()) return {};
    const { resolution: res } = r;
    const file = await keepClip(sound, {
      ts: now, session, callsign, seq, source: clip ? "phone" : "server", transcript: r.transcript, segments, language: r.language,
      status: res.status, rule: res.evidence.rule, detail: res.evidence.detail, question: res.question, report_id: r.report_id, timings_ms: timings,
    });
    return file ? { clip: file } : {};
  };

  try {
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Clip too large (1 MB max, about 15 s)." }, { status: 413 });
      const s = performance.now();
      // A speaker whose language is not the area's gets phrases in their own language first [190].
      const r = await getTranscriber().transcribe(audio, audio.type || "audio/webm", speechHints(area, bias, pinned));
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

    // An answer to the open question, by voice or typed: "the second one", "Bérault", "none of these".
    // Not a report, so nothing is read by the model or saved; the screen applies it as a tap [194].
    const answer = choices.length ? matchAnswer(transcript, choices) : null;
    if (answer) {
      timings.total = Math.round(performance.now() - t0);
      return NextResponse.json({ transcript, language: pinned ?? sttLanguage, answer, timings_ms: timings, clientTs, area: area.id });
    }

    // The clip may hold other voices. With one voice this is one reading, as before; when two
    // voices name different places, the speaker is asked which is theirs (lib/geo/voices.ts).
    const extractor = getExtractor();
    const read = await readVoices(transcript, {
      extract: (text) => extractor.extract(text, { languageHint: sttLanguage, place: area.place, language: pinned }),
      // About the speaker, or about a track the speaker sees: the words decide, and the resolver places either.
      resolve: (intent, text) => resolveReport({ intent, transcript: text, lastPosition, now, gazetteer, areaCentre: area.centre, tracks, observer: callsign }),
      gazetteer,
      last: lastPosition,
      now,
      alsoReport: (text) => kindSaid(text) != null || affiliationSaid(text) != null || trackNumberSaid(text) != null,
    });
    const { intent, resolution } = read;
    timings.extract = read.extract_ms;
    timings.resolve = read.resolve_ms;
    timings.total = Math.round(performance.now() - t0);

    const language = pinned ?? sttLanguage ?? intent.language;
    const saved = await save(session, { ...meta, transcript, language, intent, resolution, timings_ms: timings });
    const kept = await keep({ transcript, language, ...saved });
    return NextResponse.json({ transcript, language, intent, timings_ms: timings, clientTs, area: area.id, ...saved, ...kept });
  } catch (err) {
    timings.total = Math.round(performance.now() - t0);
    if (err instanceof NoLocalTranscriberError) {
      const error = "This coordinator runs offline and cannot turn speech into text yet. Use speech-to-text on the phone, or type the report.";
      return NextResponse.json({ error, transcript, timings_ms: timings }, { status: 501 });
    }
    console.error("report failed", err);
    return NextResponse.json({ error: "Processing failed. Try again or type the report.", transcript, timings_ms: timings }, { status: 502 });
  }
}

/** The `choices` field: a JSON list of at most four `{ id, name, category }`, or nothing. */
function answerChoices(v: FormDataEntryValue | null): AnswerChoice[] {
  if (typeof v !== "string" || v.length > 4000) return [];
  try {
    const list = JSON.parse(v);
    if (!Array.isArray(list)) return [];
    return list
      .slice(0, 4)
      .filter((c): c is AnswerChoice => !!c && typeof c.id === "string" && typeof c.name === "string" && c.id.length <= 200 && c.name.length <= 200)
      .map((c) => ({ id: c.id, name: c.name, ...(typeof c.category === "string" ? { category: c.category } : {}) }));
  } catch {
    return [];
  }
}

