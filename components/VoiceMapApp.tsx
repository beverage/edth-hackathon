"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { GeoJSONSource, Map as MLMap, Marker } from "maplibre-gl";
import { bearingDeg, destination, distanceM } from "@/lib/geo/geo";
import { AREAS, DEFAULT_AREA, isAreaId, type AreaId } from "@/lib/geo/areas";
import type { Candidate, HeadingTo, Intent, Placement, Resolution } from "@/lib/geo/types";
import { loadingLabel, ukrainianVoice } from "@/lib/tts/ukrainianVoice";

type Lang = "en" | "fr" | "uk";
const SPEECH_LANG: Record<Lang, string> = { en: "en-GB", fr: "fr-FR", uk: "uk-UA" };

/** Which area is active: `?area=` in the URL wins, then the last choice on this phone, then the default. */
const AREA_EVENT = "v2m-area";
const areaStore = {
  get(): AreaId {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("area");
      if (isAreaId(fromUrl)) return fromUrl;
      const saved = window.localStorage.getItem(AREA_EVENT);
      if (isAreaId(saved)) return saved;
    } catch {}
    return DEFAULT_AREA;
  },
  set(id: AreaId) {
    try {
      window.localStorage.setItem(AREA_EVENT, id);
      window.history.replaceState(null, "", `?area=${id}`);
    } catch {}
    window.dispatchEvent(new Event(AREA_EVENT));
  },
  subscribe(cb: () => void) {
    window.addEventListener(AREA_EVENT, cb);
    return () => window.removeEventListener(AREA_EVENT, cb);
  },
};
/**
 * The language this phone's speaker uses (decision 106): the last choice on this phone, else English.
 * It is sent with every report and decides the question's language and voice; nothing guesses it.
 */
const LANG_EVENT = "v2m-lang";
const LANGS: Lang[] = ["en", "fr", "uk"];
const LANG_NAME: Record<Lang, string> = { en: "English", fr: "Français", uk: "Українська" };
const LANG_SHORT: Record<Lang, string> = { en: "EN", fr: "FR", uk: "УКР" };
const isLang = (v: unknown): v is Lang => v === "en" || v === "fr" || v === "uk";
const langStore = {
  get(): Lang {
    try {
      const saved = window.localStorage.getItem(LANG_EVENT);
      if (isLang(saved)) return saved;
    } catch {}
    return "en";
  },
  set(l: Lang) {
    try {
      window.localStorage.setItem(LANG_EVENT, l);
    } catch {}
    window.dispatchEvent(new Event(LANG_EVENT));
  },
  subscribe(cb: () => void) {
    window.addEventListener(LANG_EVENT, cb);
    return () => window.removeEventListener(LANG_EVENT, cb);
  },
};
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const MAX_CLIP_MS = 15_000;
const HOLD_THRESHOLD_MS = 400;
const MIN_CLIP_MS = 350;

type Timings = { stt: number; extract: number; resolve: number; total: number };
type ApiResponse = {
  transcript: string;
  language: string | null;
  intent: Intent | null;
  resolution: Resolution;
  timings_ms: Timings;
  error?: string;
  /** Set instead of a resolution when the clip answered the open question [194]. */
  answer?: { choice: string | null; rule: string; detail: string };
};
/** `estimated`: worked out from the last position and a movement report, not from a stated position. */
type Position = { lat: number; lon: number; ts: number; radius_m: number; label: string; estimated?: boolean };
type Arrow = { from?: { lat: number; lon: number }; to: HeadingTo };
type Report = {
  id: string;
  ts: number;
  source: "voice" | "text";
  transcript: string;
  outcome: string;
  evidence?: string;
  timings?: Timings;
  roundTripMs?: number;
};
/** An open question. `track` is the number of the track it is about, said again once a choice places it. */
type Pending = { reportId: string; question: string; candidates: Candidate[]; lang: Lang; track?: number | null };
type RecState = "idle" | "starting" | "recording" | "sending";

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function circlePolygon(lat: number, lon: number, radiusM: number): GeoJSON.Feature<GeoJSON.Polygon> {
  const ring: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const p = destination({ lat, lon }, (i * 360) / 64, radiusM);
    ring.push([p.lon, p.lat]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
}

function arrowFeatures(from: { lat: number; lon: number }, to: { lat: number; lon: number }): GeoJSON.FeatureCollection {
  const b = bearingDeg(from, to);
  const len = Math.max(18, Math.min(60, distanceM(from, to) * 0.25));
  const l = destination(to, b + 180 - 28, len);
  const r = destination(to, b + 180 + 28, len);
  const base = destination(to, b + 180, len * 0.8);
  return {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { part: "shaft" }, geometry: { type: "LineString", coordinates: [[from.lon, from.lat], [base.lon, base.lat]] } },
      {
        type: "Feature",
        properties: { part: "head" },
        geometry: { type: "Polygon", coordinates: [[[to.lon, to.lat], [l.lon, l.lat], [r.lon, r.lat], [to.lon, to.lat]]] },
      },
    ],
  };
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mp4;codecs=mp4a.40.2", "audio/aac"];
  for (const m of prefs) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {}
  }
  return "";
}

function extFor(mime: string): string {
  return mime.includes("mp4") || mime.includes("aac") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtTimings(t?: Timings, rt?: number): string {
  if (!t) return "";
  const parts = [];
  if (t.stt) parts.push(`STT ${t.stt} ms`);
  parts.push(`extract ${t.extract} ms`, `resolve ${t.resolve} ms`, `server ${t.total} ms`);
  if (rt) parts.push(`round trip ${rt} ms`);
  return parts.join(" · ");
}

let speechUnlocked = false;
function unlockSpeech() {
  if (typeof window === "undefined") return;
  // The on-device Ukrainian voice plays through its own audio element, which also needs a tap.
  if (langStore.get() === "uk" || ukrainianVoice.ready) ukrainianVoice.unlock();
  if (speechUnlocked || !("speechSynthesis" in window)) return;
  speechUnlocked = true;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

/**
 * Where the on-device Ukrainian voice is: about 77 MB the first time, with nothing on screen
 * before [193]. Shown under the language switch while Ukrainian is chosen.
 */
type VoiceLoad = { state: "idle" } | { state: "loading"; text: string } | { state: "ready" } | { state: "failed" };
const VOICE_IDLE: VoiceLoad = { state: "idle" };
let voiceLoad: VoiceLoad = VOICE_IDLE;
const voiceLoadListeners = new Set<() => void>();
const voiceLoadStore = {
  get: () => voiceLoad,
  set(v: VoiceLoad) {
    voiceLoad = v;
    for (const cb of voiceLoadListeners) cb();
  },
  subscribe(cb: () => void) {
    voiceLoadListeners.add(cb);
    return () => voiceLoadListeners.delete(cb);
  },
};
/** Starts fetching the on-device Ukrainian voice. Without it, questions use the system voice. */
function preloadUkrainianVoice() {
  if (ukrainianVoice.ready) return;
  if (voiceLoad.state !== "loading") voiceLoadStore.set({ state: "loading", text: "Завантажую голос…" });
  ukrainianVoice
    .load((p) => voiceLoadStore.set({ state: "loading", text: loadingLabel(p) }))
    .then(() => voiceLoadStore.set({ state: "ready" }))
    .catch(() => voiceLoadStore.set({ state: "failed" }));
}

function stopSpeaking() {
  ukrainianVoice.stop();
  window.speechSynthesis?.cancel();
}

function speak(text: string, lang: Lang) {
  if (typeof window === "undefined") return;
  if (lang === "uk") {
    if (ukrainianVoice.canSpeak(text)) {
      window.speechSynthesis?.cancel();
      // False means the voice could not play this after all, so the system voice takes over.
      void ukrainianVoice.speak(text).then((spoken) => {
        if (!spoken) speakWithSystemVoice(text, lang);
      });
      return;
    }
    if (!ukrainianVoice.ready) preloadUkrainianVoice(); // ready for the next question
  }
  ukrainianVoice.stop();
  speakWithSystemVoice(text, lang);
}

function speakWithSystemVoice(text: string, lang: Lang) {
  if (!("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[lang];
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
    if (voice) u.voice = voice;
    u.rate = 1;
    synth.speak(u);
  } catch {}
}

export default function VoiceMapApp() {
  const mapEl = useRef<HTMLDivElement>(null);
  const sheetEl = useRef<HTMLElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const candMarkers = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const area = useSyncExternalStore(areaStore.subscribe, areaStore.get, () => DEFAULT_AREA);
  const speakerLang = useSyncExternalStore(langStore.subscribe, langStore.get, (): Lang => "en");
  const voiceLoading = useSyncExternalStore(voiceLoadStore.subscribe, voiceLoadStore.get, () => VOICE_IDLE);

  // Ukrainian questions use the on-device voice, so fetch it as soon as Ukrainian is chosen.
  useEffect(() => {
    if (speakerLang === "uk") preloadUkrainianVoice();
  }, [speakerLang]);

  const [position, setPosition] = useState<Position | null>(null);
  const [trail, setTrail] = useState<Position[]>([]);
  const [arrow, setArrow] = useState<Arrow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState("Hold the button and say where you are.");
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastTimings, setLastTimings] = useState("");
  const [recState, setRecState] = useState<RecState>("idle");
  const [toggleMode, setToggleMode] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [text, setText] = useState("");

  // Refs mirror state for event handlers that outlive a render.
  const positionRef = useRef<Position | null>(null);
  const recStateRef = useRef<RecState>("idle");
  const toggleRef = useRef(false);
  const downAtRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const chooseRef = useRef<((i: number) => void) | null>(null);
  const rejectRef = useRef<(() => void) | null>(null);
  // The open question, for `send`: its choices go with the next clip, which may answer it [194].
  const pendingRef = useRef<Pending | null>(null);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const setRec = (s: RecState) => {
    recStateRef.current = s;
    setRecState(s);
  };

  // ---------- map ----------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !mapEl.current) return;
      ml.setWorkerUrl("/maplibre-gl-worker.mjs");
      mlRef.current = ml;
      const map = new ml.Map({
        container: mapEl.current,
        style: STYLE_URL,
        center: [AREAS[areaStore.get()].centre.lon, AREAS[areaStore.get()].centre.lat],
        zoom: AREAS[areaStore.get()].zoom,
        attributionControl: { compact: false, customAttribution: "© OpenStreetMap contributors" },
      });
      map.addControl(new ml.NavigationControl({ showCompass: true }), "top-right");
      map.on("load", () => {
        map.addSource("trail", { type: "geojson", data: EMPTY_FC });
        map.addSource("accuracy", { type: "geojson", data: EMPTY_FC });
        map.addSource("arrow", { type: "geojson", data: EMPTY_FC });
        map.addSource("target", { type: "geojson", data: EMPTY_FC });
        map.addSource("pos", { type: "geojson", data: EMPTY_FC });
        map.addLayer({ id: "trail-line", type: "line", source: "trail", filter: ["==", "$type", "LineString"], paint: { "line-color": "#5b6b7c", "line-width": 3, "line-dasharray": [2, 2] } });
        map.addLayer({ id: "trail-pts", type: "circle", source: "trail", filter: ["==", "$type", "Point"], paint: { "circle-radius": 4, "circle-color": "#5b6b7c", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
        map.addLayer({ id: "acc-fill", type: "fill", source: "accuracy", paint: { "fill-color": "#ff6b2c", "fill-opacity": 0.18 } });
        map.addLayer({ id: "acc-line", type: "line", source: "accuracy", paint: { "line-color": "#ff6b2c", "line-width": 2, "line-opacity": 0.8 } });
        map.addLayer({ id: "arrow-shaft", type: "line", source: "arrow", filter: ["==", "part", "shaft"], layout: { "line-cap": "round" }, paint: { "line-color": "#2c9cff", "line-width": 5 } });
        map.addLayer({ id: "arrow-head", type: "fill", source: "arrow", filter: ["==", "part", "head"], paint: { "fill-color": "#2c9cff" } });
        map.addLayer({ id: "target", type: "circle", source: "target", paint: { "circle-radius": 10, "circle-color": "rgba(44,156,255,0.15)", "circle-stroke-color": "#2c9cff", "circle-stroke-width": 2 } });
        map.addLayer({ id: "pos", type: "circle", source: "pos", paint: { "circle-radius": 8, "circle-color": "#ff6b2c", "circle-stroke-color": "#fff", "circle-stroke-width": 3 } });
        // Time of the last update next to the marker, as in Lysk's brief.
        map.addLayer({
          id: "pos-label",
          type: "symbol",
          source: "pos",
          layout: { "text-field": ["get", "time"], "text-font": ["Noto Sans Regular"], "text-size": 13, "text-offset": [0, 1.3], "text-anchor": "top", "text-allow-overlap": true, "text-ignore-placement": true },
          paint: { "text-color": "#16212c", "text-halo-color": "#ffffff", "text-halo-width": 2 },
        });
        setMapReady(true);
      });
      mapRef.current = map;
      if (process.env.NODE_ENV !== "production") (window as unknown as { __map: MLMap }).__map = map;
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep the attribution above the bottom sheet, and tell the map the sheet covers its lower part
  // (map padding persists, so every camera move centres on the visible area).
  useEffect(() => {
    const el = sheetEl.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      document.documentElement.style.setProperty("--sheet-h", `${el.offsetHeight}px`);
      const map = mapRef.current;
      if (!map) return;
      const pad = { top: 0, left: 0, right: 0, bottom: el.offsetHeight + 44 };
      // setPadding stops a camera animation in progress, so wait for it to finish.
      if (map.isMoving()) map.once("moveend", () => map.setPadding(pad));
      else map.setPadding(pad);
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, [mapReady]);

  const sheetPadding = useCallback(() => ({ top: 76, left: 40, right: 60, bottom: 30 }), []);

  // Camera moves wait a moment: the sheet usually changes height in the same update, and the
  // move should start from the new padding rather than be cut short by it.
  const cameraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveCamera = useCallback((fn: (map: MLMap) => void) => {
    if (cameraTimer.current) clearTimeout(cameraTimer.current);
    cameraTimer.current = setTimeout(() => {
      if (mapRef.current) fn(mapRef.current);
    }, 80);
  }, []);

  // Draw position, accuracy circle, trail.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
    if (position) {
      src("pos")?.setData({
        type: "FeatureCollection",
        features: [{ type: "Feature", properties: { time: `${position.estimated ? "≈ " : ""}${fmtTime(position.ts)}` }, geometry: { type: "Point", coordinates: [position.lon, position.lat] } }],
      });
      src("accuracy")?.setData({ type: "FeatureCollection", features: [circlePolygon(position.lat, position.lon, position.radius_m)] });
    } else {
      src("pos")?.setData(EMPTY_FC);
      src("accuracy")?.setData(EMPTY_FC);
    }
    const pts = [...trail, ...(position ? [position] : [])];
    src("trail")?.setData({
      type: "FeatureCollection",
      features: [
        ...(pts.length > 1 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: pts.map((p) => [p.lon, p.lat]) } }] : []),
        ...trail.map((p) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: [p.lon, p.lat] } })),
      ],
    });
  }, [position, trail, mapReady]);

  // Draw movement arrow.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const a = map.getSource("arrow") as GeoJSONSource | undefined;
    const t = map.getSource("target") as GeoJSONSource | undefined;
    if (arrow) {
      a?.setData(arrow.from ? arrowFeatures(arrow.from, arrow.to) : EMPTY_FC);
      t?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [arrow.to.lon, arrow.to.lat] } }] });
    } else {
      a?.setData(EMPTY_FC);
      t?.setData(EMPTY_FC);
    }
  }, [arrow, mapReady]);

  // Numbered candidate markers while a question is open.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    candMarkers.current.forEach((m) => m.remove());
    candMarkers.current = [];
    if (!map || !ml || !mapReady || !pending) return;
    pending.candidates.forEach((c, i) => {
      const el = document.createElement("button");
      el.className = "cand-marker";
      el.textContent = String(i + 1);
      el.setAttribute("aria-label", `Choice ${i + 1}: ${c.name}`);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        chooseRef.current?.(i);
      });
      candMarkers.current.push(new ml.Marker({ element: el }).setLngLat([c.lon, c.lat]).addTo(map));
    });
    const b = new ml.LngLatBounds();
    pending.candidates.forEach((c) => b.extend([c.lon, c.lat]));
    if (positionRef.current) b.extend([positionRef.current.lon, positionRef.current.lat]);
    moveCamera((m) => m.fitBounds(b, { padding: sheetPadding(), maxZoom: 16.5, duration: 600 }));
  }, [pending, mapReady, sheetPadding, moveCamera]);

  // ---------- applying results ----------
  const applyPlacement = useCallback(
    (pl: Placement, label: string) => {
      const map = mapRef.current;
      const prev = positionRef.current;
      if (pl.heading_to) {
        // The arrow runs from where they were to where they are heading; the marker moves to the
        // server's estimate (middle of that leg) and its circle spans the whole leg.
        const from = prev ? { lat: prev.lat, lon: prev.lon } : undefined;
        setArrow({ from, to: pl.heading_to });
        let moved: Position | null = null;
        if (prev && pl.pin) {
          moved = { lat: pl.pin.lat, lon: pl.pin.lon, ts: Date.now(), radius_m: pl.radius_m ?? 80, label: `towards ${pl.heading_to.name}`, estimated: true };
          setTrail((t) => [...t, prev].slice(-30));
          setPosition(moved);
          positionRef.current = moved;
        }
        const to = pl.heading_to;
        if (map && mlRef.current) {
          if (from) {
            const b = new mlRef.current.LngLatBounds();
            b.extend([from.lon, from.lat]);
            b.extend([to.lon, to.lat]);
            moveCamera((m) => m.fitBounds(b, { padding: sheetPadding(), maxZoom: 16.5, duration: 700 }));
          } else moveCamera((m) => m.easeTo({ center: [to.lon, to.lat], zoom: 16, duration: 700 }));
        }
        return moved
          ? `Moved towards ${pl.heading_to.name}: somewhere on the way (±${moved.radius_m} m)`
          : `Heading to ${pl.heading_to.name} (no starting position yet)`;
      }
      if (pl.pin) {
        const next: Position = { lat: pl.pin.lat, lon: pl.pin.lon, ts: Date.now(), radius_m: pl.radius_m ?? 80, label, ...(pl.estimated ? { estimated: true } : {}) };
        if (prev) setTrail((t) => [...t, prev].slice(-30));
        setPosition(next);
        positionRef.current = next;
        setArrow(null);
        moveCamera((m) => m.easeTo({ center: [next.lon, next.lat], zoom: Math.max(m.getZoom(), 16), duration: 700 }));
        return pl.estimated ? `Estimated: ${label} (±${next.radius_m} m)` : `Placed at ${label} (±${next.radius_m} m)`;
      }
      return "Nothing to place";
    },
    [sheetPadding, moveCamera],
  );

  const updateReport = (id: string, patch: Partial<Report>) => setReports((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const handleResponse = useCallback(
    (data: ApiResponse, source: "voice" | "text", roundTripMs: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const res = data.resolution;
      // The language the question was written in: the pinned one, unless the server ignored it.
      const said = data.intent?.language;
      const lang: Lang = isLang(said) ? said : langStore.get();
      setLastTranscript(data.transcript || "(no words heard)");
      setLastTimings(fmtTimings(data.timings_ms, roundTripMs));
      let outcome = "";
      if (res.status === "resolved" && res.track) {
        // A report about a track, something the speaker saw: the speaker's own marker does not move.
        outcome = res.track.say ?? "Track marked.";
        setPending(null);
        setStatus(outcome);
        if (res.track.say) speak(res.track.say, lang);
      } else if (res.status === "resolved") {
        const target = res.candidates.find((c) => c.id === res.evidence.feature_id);
        const i = data.intent;
        // A move with no place named: say what it was worked out from.
        const moved = res.estimated && !target && i?.distance_m ? `${i.distance_m} m ${(i.direction ?? i.relation?.replace(/_of$/, "") ?? "").replace("_", "-")} of the last position` : null;
        const label = target?.name ?? moved ?? "position";
        outcome = applyPlacement({ pin: res.pin, radius_m: res.radius_m, heading_to: res.heading_to, estimated: res.estimated }, label);
        setPending(null);
        setStatus(outcome);
      } else if (res.status === "ambiguous") {
        outcome = `Asked: ${res.question}`;
        setPending({ reportId: id, question: res.question ?? "Which one?", candidates: res.candidates, lang, track: res.track?.n ?? null });
        setStatus("Which one did you mean? Tap it, or hold the button and say it.");
        speak(res.question ?? "", lang);
      } else {
        outcome = `Unresolved: ${res.question ?? ""}`;
        setPending(null);
        setStatus(res.question ?? "Could not place that.");
        if (res.question) speak(res.question, lang);
      }
      setReports((rs) => [
        {
          id,
          ts: Date.now(),
          source,
          transcript: data.transcript,
          outcome,
          evidence: `${res.evidence.rule}${res.evidence.feature_id ? ` [${res.evidence.feature_id}]` : ""}: ${res.evidence.detail}`,
          timings: data.timings_ms,
          roundTripMs,
        },
        ...rs,
      ]);
    },
    [applyPlacement],
  );

  const choose = useCallback(
    (i: number) => {
      if (!pending) return;
      const c = pending.candidates[i];
      if (!c) return;
      stopSpeaking();
      // A question about a track: the choice places the track, and the speaker's own marker stays.
      const track = pending.track != null ? `Track ${pending.track}` : "Track";
      const out = c.track_placement ? `${track} placed at ${c.name} (±${c.track_placement.radius_m ?? 80} m)` : applyPlacement(c.placement, c.name);
      updateReport(pending.reportId, { outcome: `Chose ${i + 1}: ${c.name}. ${out}`, evidence: `user_choice [${c.id}]` });
      setStatus(out);
      setPending(null);
    },
    [pending, applyPlacement],
  );
  useEffect(() => {
    chooseRef.current = choose;
  }, [choose]);

  const rejectAll = () => {
    if (!pending) return;
    stopSpeaking();
    updateReport(pending.reportId, { outcome: "Rejected all choices" });
    setPending(null);
    setStatus(
      pending.lang === "fr"
        ? "Redites-le avec un nom de rue ou de lieu."
        : pending.lang === "uk"
          ? "Повторіть з назвою вулиці або місця."
          : "Say it again with a street or place name.",
    );
  };
  useEffect(() => {
    rejectRef.current = rejectAll;
  });

  // ---------- sending ----------
  const send = useCallback(
    async (payload: { audio?: Blob; text?: string }) => {
      setRec("sending");
      setStatus(payload.audio ? "Transcribing…" : "Resolving…");
      const fd = new FormData();
      if (payload.audio) {
        const type = payload.audio.type || "audio/webm";
        fd.append("audio", new File([payload.audio], `clip.${extFor(type)}`, { type }));
      }
      if (payload.text) fd.append("text", payload.text);
      const p = positionRef.current;
      // An estimate from a movement report carries its uncertainty, so "nearest wins" stays honest.
      // The circle goes too: a position reckoned from this one starts out that unsure.
      if (p) fd.append("lastPosition", JSON.stringify({ lat: p.lat, lon: p.lon, ts: p.ts, radius_m: p.radius_m, ...(p.estimated ? { uncertainty_m: p.radius_m } : {}) }));
      fd.append("clientTs", String(Date.now()));
      fd.append("area", areaStore.get());
      fd.append("language", langStore.get());
      const open = pendingRef.current;
      if (open) fd.append("choices", JSON.stringify(open.candidates.map((c) => ({ id: c.id, name: c.name, category: c.category }))));
      const t0 = performance.now();
      try {
        const r = await fetch("/api/report", { method: "POST", body: fd });
        const data = (await r.json()) as ApiResponse;
        const rt = Math.round(performance.now() - t0);
        if (!r.ok || data.error) {
          setStatus(data.error ?? `Error ${r.status}`);
          if (data.transcript) setLastTranscript(data.transcript);
        } else if (data.answer && open) {
          // Answered by voice: the same as a tap on the choice, or on "None of these".
          setLastTranscript(data.transcript);
          setLastTimings(fmtTimings(data.timings_ms, rt));
          const i = open.candidates.findIndex((c) => c.id === data.answer!.choice);
          if (data.answer.choice === null) rejectRef.current?.();
          else if (i >= 0) chooseRef.current?.(i);
        } else handleResponse(data, payload.audio ? "voice" : "text", rt);
      } catch {
        setStatus("Network error. Check the connection and try again.");
      } finally {
        setRec("idle");
      }
    },
    [handleResponse],
  );

  // ---------- capture ----------
  const requestWakeLock = async () => {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (nav.wakeLock && !wakeLockRef.current) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
        (wakeLockRef.current as unknown as EventTarget).addEventListener?.("release", () => (wakeLockRef.current = null));
      }
    } catch {}
  };
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible" && wakeLockRef.current === null && speechUnlocked) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (recStateRef.current !== "idle") return;
    setMicError(null);
    stopSpeaking();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicError("This browser cannot record audio here. Use the text box, or open the page over HTTPS in Safari or Chrome.");
      return;
    }
    setRec("starting");
    setStatus("Starting microphone…");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    } catch (e) {
      const name = (e as Error).name;
      setMicError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access was refused. Allow the microphone for this site in the browser settings, then reload. You can type reports meanwhile."
          : `Could not open the microphone (${name}). You can type reports meanwhile.`,
      );
      setStatus("Microphone unavailable.");
      setRec("idle");
      return;
    }
    streamRef.current = stream;
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    } catch {
      rec = new MediaRecorder(stream);
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      // Release the mic so iOS routes the spoken question to the speaker, not the earpiece.
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setToggleMode(false);
      toggleRef.current = false;
      const dur = Date.now() - startedAtRef.current;
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
      if (dur < MIN_CLIP_MS || blob.size < 1000) {
        setRec("idle");
        setStatus("Too short. Hold the button while you speak, or tap once to start and again to stop.");
        return;
      }
      send({ audio: blob });
    };
    recorderRef.current = rec;
    startedAtRef.current = Date.now();
    rec.start(250);
    setRec("recording");
    setElapsed(0);
    setStatus(toggleRef.current ? "Listening… tap to send." : "Listening… release to send.");
    tickRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
    maxTimerRef.current = setTimeout(() => {
      setStatus("15 s limit reached, sending.");
      stopRecording();
    }, MAX_CLIP_MS);
  }, [send, stopRecording]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    unlockSpeech();
    requestWakeLock();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    const s = recStateRef.current;
    if (s === "recording" && toggleRef.current) {
      stopRecording();
      return;
    }
    if (s !== "idle") return;
    downAtRef.current = Date.now();
    startRecording();
  };

  const onPointerUp = () => {
    const s = recStateRef.current;
    if (s !== "starting" && s !== "recording") return;
    if (toggleRef.current) return;
    const held = Date.now() - downAtRef.current;
    if (s === "recording" && held >= HOLD_THRESHOLD_MS) {
      stopRecording();
    } else {
      // Quick tap, or released while the mic was still opening: keep listening until the next tap.
      toggleRef.current = true;
      setToggleMode(true);
      setStatus("Listening… tap to send.");
    }
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || recStateRef.current !== "idle") return;
    unlockSpeech();
    setText("");
    send({ text: t });
  };

  const resetAll = (areaId: AreaId = areaStore.get()) => {
    stopSpeaking();
    setPosition(null);
    positionRef.current = null;
    setTrail([]);
    setArrow(null);
    setPending(null);
    setReports([]);
    setLastTranscript("");
    setLastTimings("");
    setStatus("Cleared. Hold the button and say where you are.");
    const a = AREAS[areaId];
    mapRef.current?.jumpTo({ center: [a.centre.lon, a.centre.lat], zoom: a.zoom });
  };

  const switchArea = (id: AreaId) => {
    if (id === areaStore.get() || recStateRef.current !== "idle") return;
    areaStore.set(id);
    resetAll(id);
    setStatus(`Area: ${AREAS[id].label}. Hold the button and say where you are.`);
  };

  const switchLang = (l: Lang) => {
    if (l === langStore.get() || recStateRef.current !== "idle") return;
    stopSpeaking();
    langStore.set(l);
    setStatus(`Language: ${LANG_NAME[l]}. Questions come back in it.`);
  };

  const btnLabel =
    recState === "starting"
      ? "Opening mic…"
      : recState === "recording"
        ? toggleMode
          ? "Tap to send"
          : "Release to send"
        : recState === "sending"
          ? "Working…"
          : "Hold to talk";

  return (
    <main className="app">
      <div ref={mapEl} className="map" />
      <nav className="areas" aria-label="Area">
        {(Object.keys(AREAS) as AreaId[]).map((id) => (
          <button key={id} className={id === area ? "active" : ""} aria-pressed={id === area} onClick={() => switchArea(id)} disabled={recState !== "idle"}>
            {AREAS[id].label}
          </button>
        ))}
      </nav>
      <nav className="langs" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l}
            lang={l}
            className={l === speakerLang ? "active" : ""}
            aria-pressed={l === speakerLang}
            aria-label={LANG_NAME[l]}
            title={LANG_NAME[l]}
            onClick={() => switchLang(l)}
            disabled={recState !== "idle"}
          >
            {LANG_SHORT[l]}
          </button>
        ))}
      </nav>
      {speakerLang === "uk" && (voiceLoading.state === "loading" || voiceLoading.state === "failed") && (
        <div className="voice-load" role="status" aria-live="polite">
          {voiceLoading.state === "loading" ? voiceLoading.text : "Голос недоступний: питання читає системний голос."}
        </div>
      )}
      <section ref={sheetEl} className="sheet">
        {pending && (
          <div className="ask" role="dialog" aria-label="Which one did you mean?">
            <div className="ask-q">{pending.question}</div>
            <div className="ask-choices">
              {pending.candidates.map((c, i) => (
                <button key={c.id} className="choice" onClick={() => choose(i)}>
                  <span className="choice-n">{i + 1}</span>
                  <span className="choice-name">
                    {c.name}
                    <small>
                      {c.category.replace("_", " ")} · {c.town ? `${c.town} · ` : ""}{c.distance_m < 1000 ? `${c.distance_m} m` : `${(c.distance_m / 1000).toFixed(1)} km`}{" "}
                      {position ? "from you" : "from centre"}
                    </small>
                  </span>
                </button>
              ))}
              <button className="choice none" onClick={rejectAll}>
                None of these
              </button>
            </div>
          </div>
        )}

        <div className="talk-row">
          <button
            className={`talk ${recState}`}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            disabled={recState === "sending"}
            aria-label={btnLabel}
          >
            <span className="talk-icon" aria-hidden>
              {recState === "recording" ? "●" : recState === "sending" ? "…" : "🎙"}
            </span>
            <span className="talk-label">{btnLabel}</span>
            {recState === "recording" && <span className="talk-time">{(elapsed / 1000).toFixed(1)} s</span>}
          </button>
          <div className="talk-side">
            <div className="transcript" aria-live="polite">
              {lastTranscript ? `“${lastTranscript}”` : <span className="muted">{AREAS[area].hint}</span>}
            </div>
            <div className="status" aria-live="polite">
              {status}
            </div>
            {lastTimings && <div className="timings">{lastTimings}</div>}
          </div>
        </div>

        {micError && <div className="mic-error">{micError}</div>}

        <form className="text-row" onSubmit={submitText}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Or type a report…" enterKeyHint="send" aria-label="Type a report" />
          <button type="submit" disabled={!text.trim() || recState !== "idle"}>
            Send
          </button>
        </form>

        <details className="log">
          <summary>
            Report log ({reports.length}){position ? ` · last fix ${fmtTime(position.ts)}` : ""}
          </summary>
          {reports.length > 0 && (
            <button className="reset" onClick={() => resetAll()}>
              Clear map and log
            </button>
          )}
          <ol>
            {reports.map((r) => (
              <li key={r.id}>
                <div className="log-head">
                  <span>{fmtTime(r.ts)}</span>
                  <span className="muted">{r.source}</span>
                </div>
                <div className="log-tx">“{r.transcript}”</div>
                <div className="log-out">{r.outcome}</div>
                {r.evidence && <div className="log-ev">{r.evidence}</div>}
                {r.timings && <div className="log-ev">{fmtTimings(r.timings, r.roundTripMs)}</div>}
              </li>
            ))}
          </ol>
        </details>
      </section>
    </main>
  );
}
