/**
 * The stage eval (docs/hackathon/stage-test-plan.md): sends each line of evals/stage.cases.json to a running
 * coordinator as a radio report, in a fresh mission, and scores the reply and the mission's log.
 *
 *   npm run eval:stage                          typed, every case once
 *   npm run eval:stage -- --repeat 3            stage lines three times
 *   npm run eval:stage -- --variants            the other wordings too
 *   npm run eval:stage -- --voices Samantha,Daniel   as speech: `say` writes each clip to a file
 *                                               (nothing plays) and the coordinator transcribes it
 *   npm run eval:stage -- --only A1,F3 --base http://localhost:3117
 *   npm run eval:stage -- --cases other.json    another file of lines, in the same shape
 *   npm run eval:stage -- --name pass1 --keep   name the results file; leave the missions in place
 *   npm run eval:stage -- --read vincennes-5    no run: what that mission heard, report by report
 *
 * It needs a coordinator (offline mode for the stage), so it is not part of npm test. Results go
 * to evals/results/stage-<how>-<time>.json. macOS only with --voices (`say`, `afconvert`).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { distanceM } from "../lib/geo/geo";
import type { Resolution } from "../lib/geo/types";
import { foldLog, type SessionState } from "../lib/reports/fold";
import type { LogEntry } from "../lib/reports/types";

type Given = { text: string } | { wait_s: number } | { kind: [string, string] } | { plot: Record<string, unknown> } | { send: Record<string, unknown> } | { answer: string };
interface Expect {
  sender?: string;
  held?: string;
  status?: "resolved" | "ambiguous" | "unresolved";
  feature?: string;
  heading_to?: string;
  candidates?: string[];
  /** false: must not be about a track. Otherwise the parts given must match; affiliation null is "not said". */
  track?: false | { n?: number; affiliation?: string | null; kind?: string; count?: number };
  /** false: no request read. Otherwise the track it is about. */
  request?: false | { n: number | null };
  at?: { lat: number; lon: number; within_m: number };
  /** Units that must be where they were before the line. */
  stays?: string[];
  /** A track's state in the log after the line. `recon` is the call sign or track number looking at it. */
  state?: { track: number; affiliation?: string; kind?: string; recon?: string };
  /** For a held report: the operator gives it to this unit, as from the Unassigned tray. `unit`, `asked`, `state` and `stays` then read the log. */
  give?: string;
  /** Where a unit is in the log after the line, and after `give`. */
  unit?: { callsign: string; at: { lat: number; lon: number; within_m: number } };
  /** A request for recon waiting in the log after the line, about this track. */
  asked?: { n: number | null };
}
interface Case { id: string; stage?: boolean; given?: Given[]; text: string; expect: Expect; variants?: string[]; note?: string }
interface Doc { area: string; start: string | null; roster: string[]; cases: Case[] }
/** The parts of the report endpoint's reply that are scored. */
interface Reply {
  error?: string;
  transcript?: string;
  callsign?: string;
  report_id?: string;
  timings_ms?: { total?: number };
  held?: { id?: string; reason: string; question?: string };
  request?: { id: string; n: number | null };
  resolution?: Resolution;
}
interface Run { id: string; said: string; how: string; pass: boolean; misses: string[]; transcript: string | null; sender: string | null; got: string; ms: number | null }

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : null;
};
const base = opt("base") ?? "http://localhost:3147";
const only = opt("only")?.split(",") ?? null;
const repeat = Number(opt("repeat") ?? 1);
const withVariants = args.includes("--variants");
const stageOnly = args.includes("--stage");
const voices = opt("voices")?.split(",").filter(Boolean) ?? [];
const doc = JSON.parse(readFileSync(opt("cases") ?? join(__dirname, "../evals/stage.cases.json"), "utf8")) as Doc;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clips = voices.length ? mkdtempSync(join(tmpdir(), "stage-clips-")) : null;
let seq = 0;

async function json(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** One spoken line as a 16 kHz mono clip. `say -o` writes the file and plays nothing. */
function clip(text: string, voice: string): Blob {
  const aiff = join(clips!, `c${seq}.aiff`);
  const wav = join(clips!, `c${seq}.wav`);
  execFileSync("say", ["-v", voice, "-o", aiff, text]);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@16000", "-c", "1", aiff, wav]);
  return new Blob([readFileSync(wav)], { type: "audio/wav" });
}

async function report(session: string, text: string, voice: string | null): Promise<Record<string, unknown>> {
  const n = ++seq;
  const audio = voice ? clip(text, voice) : null;
  const ts = String(Date.now());
  // A kept-alive connection can be closed under us while `say` writes the clip: try again.
  for (let attempt = 1; ; attempt++) {
    const form = new FormData();
    form.set("session", session);
    form.set("area", doc.area);
    form.set("language", "en");
    form.set("clientTs", ts);
    form.set("seq", String(n));
    if (audio) form.set("audio", audio, "clip.wav");
    else form.set("text", text);
    try {
      const res = await fetch(`${base}/api/report`, { method: "POST", body: form });
      return (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as Record<string, unknown>;
    } catch (e) {
      if (attempt >= 3) return { error: `the report could not be sent: ${e instanceof Error ? e.message : e}` };
      await sleep(500);
    }
  }
}

async function state(session: string): Promise<SessionState> {
  const res = await fetch(`${base}/api/sessions/${session}?after=0`);
  const data = (await res.json()) as { entries: LogEntry[] };
  return foldLog(data.entries);
}

/** What the reply shows, in a line. */
function describe(r: Reply): string {
  if (r.error) return `error: ${r.error}`;
  if (r.held) return `held (${r.held.reason}): ${r.held.question ?? ""}`;
  const res: Partial<Resolution> = r.resolution ?? {};
  const t = res.track;
  const parts: (string | undefined)[] = [res.status];
  if (t) parts.push(`Track ${t.n ?? "?"}: ${t.affiliation ?? "unknown"} ${t.kind ?? "?"}${t.count ? ` ×${t.count}` : ""}${t.label ? `, ${t.label}` : ""}`);
  const named = res.candidates?.find((c) => c.id === res.evidence?.feature_id)?.name;
  if (named) parts.push(named);
  if (res.heading_to) parts.push(`towards ${res.heading_to.name ?? res.heading_to.id}`);
  if (res.radius_m && !t) parts.push(`±${Math.round(res.radius_m)} m`);
  if (res.status === "ambiguous") parts.push(`asks: ${res.question ?? ""} [${(res.candidates ?? []).map((c) => c.name).join(" / ")}]`);
  if (res.status === "unresolved") parts.push(`${res.evidence?.rule ?? ""}: ${res.question ?? ""}`);
  if (r.request) parts.push(`request${r.request.n != null ? ` on Track ${r.request.n}` : ", no track"}`);
  return parts.filter(Boolean).join("; ");
}

function score(e: Expect, r: Reply, before: SessionState, after: SessionState): string[] {
  const misses: string[] = [];
  const res: Partial<Resolution> = r.resolution ?? {};
  if (r.error) return [`error: ${r.error}`];
  if (e.held != null) {
    if (!r.held) misses.push(`not held, wanted held (${e.held})`);
    else if (r.held.reason !== e.held) misses.push(`held (${r.held.reason}), wanted (${e.held})`);
  } else if (r.held) misses.push(`held (${r.held.reason}): ${r.held.question ?? ""}`);
  if (!r.held) misses.push(...scoreReply(e, r, res));
  for (const c of e.stays ?? []) {
    const a = before.units.find((u) => u.callsign === c)?.position;
    const b = after.units.find((u) => u.callsign === c)?.position;
    if ((a == null) !== (b == null) || (a && b && distanceM(a, b) > 1)) misses.push(`${c} moved`);
  }
  if (e.unit) {
    const p = after.units.find((u) => u.callsign === e.unit!.callsign)?.position;
    if (!p) misses.push(`${e.unit.callsign} has no position in the log`);
    else if (distanceM(p, e.unit.at) > e.unit.at.within_m) misses.push(`${e.unit.callsign} is ${Math.round(distanceM(p, e.unit.at))} m from where it should be (limit ${e.unit.at.within_m} m)`);
  }
  if (e.asked && !after.requests.some((q) => q.n === e.asked!.n)) misses.push(`no request waiting about Track ${e.asked.n ?? "none"}`);
  if (e.state) {
    const t = after.tracks.find((x) => x.n === e.state!.track);
    if (!t) misses.push(`no Track ${e.state.track} in the log`);
    else {
      if (e.state.affiliation && t.affiliation !== e.state.affiliation) misses.push(`Track ${t.n} is ${t.affiliation} in the log, wanted ${e.state.affiliation}`);
      if (e.state.kind && t.kind !== e.state.kind) misses.push(`Track ${t.n} is a ${t.kind} in the log, wanted ${e.state.kind}`);
      if (e.state.recon && !t.recon.some((x) => x.unit === e.state!.recon || String(x.asset) === e.state!.recon)) misses.push(`${e.state.recon} is not looking at Track ${t.n}`);
    }
  }
  return misses;
}

/** The checks on the reply itself, for a report that was not held. */
function scoreReply(e: Expect, r: Reply, res: Partial<Resolution>): string[] {
  const misses: string[] = [];
  if (e.sender != null && r.callsign !== e.sender) misses.push(`sender ${r.callsign ?? "none"}, wanted ${e.sender}`);
  if (e.status != null && res.status !== e.status) misses.push(`status ${res.status}, wanted ${e.status}`);
  if (e.feature != null && res.evidence?.feature_id !== e.feature) misses.push(`place ${res.evidence?.feature_id ?? "none"}, wanted ${e.feature}`);
  if (e.heading_to != null && res.heading_to?.id !== e.heading_to) misses.push(`heading to ${res.heading_to?.id ?? "none"}, wanted ${e.heading_to}`);
  if (e.candidates != null) {
    const offered = (res.candidates ?? []).map((c) => c.id);
    for (const id of e.candidates) if (!offered.includes(id)) misses.push(`choice ${id} not offered`);
  }
  if (e.track === false && res.track) misses.push("read as a report about a track");
  if (e.track) {
    const t = res.track;
    if (!t) misses.push("not read as a report about a track");
    else {
      if (e.track.n !== undefined && t.n !== e.track.n) misses.push(`Track ${t.n}, wanted Track ${e.track.n}`);
      if (e.track.affiliation !== undefined && t.affiliation !== e.track.affiliation) misses.push(`affiliation ${t.affiliation ?? "not said"}, wanted ${e.track.affiliation ?? "not said"}`);
      if (e.track.kind !== undefined && t.kind !== e.track.kind) misses.push(`kind ${t.kind ?? "none"}, wanted ${e.track.kind}`);
      if (e.track.count !== undefined && t.count !== e.track.count) misses.push(`count ${t.count ?? "none"}, wanted ${e.track.count}`);
    }
  }
  if (e.request === false && r.request) misses.push("a request was read");
  if (e.request) {
    if (!r.request) misses.push("no request read");
    else if (r.request.n !== e.request.n) misses.push(`request on Track ${r.request.n ?? "none"}, wanted ${e.request.n ?? "none"}`);
  }
  if (e.at) {
    const pin = res.track ? res.track.placement?.pin : res.pin;
    if (!pin) misses.push("no position");
    else {
      const off = distanceM(pin, e.at);
      if (off > e.at.within_m) misses.push(`${Math.round(off)} m from where it should be (limit ${e.at.within_m} m)`);
    }
  }
  return misses;
}

async function runOne(c: Case, said: string, how: string, voice: string | null): Promise<Run> {
  const opened = await json("/api/sessions", { area: doc.area, name: `Stage ${c.id}`, start: doc.start, roster: doc.roster });
  const session = (opened.data.mission as { code?: string } | undefined)?.code;
  if (!session) return { id: c.id, said, how, pass: false, misses: [`could not open a mission: ${JSON.stringify(opened.data)}`], transcript: null, sender: null, got: "", ms: null };
  const setup: string[] = [];
  let asked: string | null = null;
  for (const g of c.given ?? []) {
    if ("wait_s" in g) await sleep(g.wait_s * 1000);
    else if ("answer" in g) {
      // The operator answers the question the last typed report left open, as on the command post.
      const r = await json("/api/answer", { session, report: asked, choice: g.answer, by: "CP" });
      if (r.status >= 400) setup.push(`setup: answering with ${g.answer}: ${r.data.error}`);
    } else if ("kind" in g) {
      const r = await json(`/api/sessions/${session}/units`, { callsign: g.kind[0], kind: g.kind[1] });
      if (r.status >= 400) setup.push(`setup: kind of ${g.kind[0]}: ${r.data.error}`);
    } else if ("plot" in g) {
      const r = await json(`/api/sessions/${session}/tracks`, { action: "place", ...g.plot });
      if (r.status >= 400) setup.push(`setup: placing a track: ${r.data.error}`);
    } else if ("send" in g) {
      const r = await json(`/api/sessions/${session}/tasks`, { action: "send", ...g.send });
      if (r.status >= 400) setup.push(`setup: sending: ${r.data.error}`);
    } else {
      // The scene is set with typed reports, whatever the line itself is sent as.
      const r = (await report(session, g.text, null)) as Reply;
      asked = r.report_id ?? null;
      if (r.held || r.error) setup.push(`setup "${g.text}": ${describe(r)}`);
    }
  }
  const before = await state(session);
  const r = (await report(session, said, voice)) as Reply;
  if (c.expect.give && r.held?.id) {
    // The operator's one tap in the Unassigned tray: the held report goes to this unit.
    const g = await json(`/api/sessions/${session}/held/${r.held.id}`, { action: "assign", callsign: c.expect.give });
    if (g.status >= 400) setup.push(`giving it to ${c.expect.give}: ${g.data.error}`);
  }
  const after = await state(session);
  const misses = [...setup, ...score(c.expect, r, before, after)];
  // End the mission and take it off the list, so a long run does not slow down as they pile up.
  await json(`/api/sessions/${session}/end`, {});
  if (!args.includes("--keep")) await fetch(`${base}/api/sessions/${session}`, { method: "DELETE" });
  return { id: c.id, said, how, pass: misses.length === 0, misses, transcript: (r.transcript as string) ?? null, sender: (r.callsign as string) ?? null, got: describe(r), ms: r.timings_ms?.total ?? null };
}

/**
 * What a mission heard, oldest first: for scoring a voice sheet. Each report with the words as
 * speech-to-text wrote them, who it went to and what it did; then the ones still held.
 */
async function read(session: string) {
  const s = await state(session);
  const time = (ts: number) => new Date(ts).toTimeString().slice(0, 8);
  for (const f of [...s.feed].reverse()) {
    if (f.kind !== "report") continue;
    console.log(`${time(f.ts)}  ${f.callsign.padEnd(9)} ${JSON.stringify(f.transcript)}\n          ${f.status}: ${f.outcome}`);
  }
  for (const h of s.held) console.log(`${time(h.ts)}  held      ${JSON.stringify(h.transcript)}\n          ${h.question}`);
}

async function main() {
  if (opt("read")) return read(opt("read")!);
  const cases = doc.cases.filter((c) => (!only || only.includes(c.id)) && (!stageOnly || c.stage));
  const runs: Run[] = [];
  const d = new Date();
  const stamp = [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, "0")).join("-");
  const out = join(__dirname, `../evals/results/stage-${opt("name") ?? (voices.length ? "voices" : withVariants ? "variants" : "typed")}-${stamp}.json`);
  // Shown and saved after every run, so a run that is stopped keeps what it has.
  const keep = (r: Run) => {
    runs.push(r);
    show(r);
    writeFileSync(out, JSON.stringify({ base, voices, repeat, runs }, null, 1) + "\n");
  };
  const show = (r: Run) => {
    console.log(`${r.pass ? "pass" : "MISS"}  ${r.id.padEnd(4)} ${r.how.padEnd(9)} ${JSON.stringify(r.said)}`);
    if (r.transcript != null && r.transcript !== r.said) console.log(`      heard: ${JSON.stringify(r.transcript)}`);
    console.log(`      ${r.got}${r.ms != null ? `  (${(r.ms / 1000).toFixed(1)} s)` : ""}`);
    for (const m of r.misses) console.log(`      - ${m}`);
  };
  for (const c of cases) {
    if (voices.length) {
      for (const v of voices) {
        keep(await runOne(c, c.text, v, v));
      }
      continue;
    }
    for (let k = 0; k < (c.stage ? repeat : 1); k++) {
      keep(await runOne(c, c.text, repeat > 1 && c.stage ? `typed ${k + 1}` : "typed", null));
    }
    if (withVariants) {
      for (const v of c.variants ?? []) {
        keep(await runOne(c, v, "variant", null));
      }
    }
  }
  const passed = runs.filter((r) => r.pass).length;
  const times = runs.map((r) => r.ms).filter((m): m is number => m != null).sort((a, b) => a - b);
  console.log(`\n${passed} of ${runs.length} runs passed.${times.length ? ` Median ${(times[Math.floor(times.length / 2)] / 1000).toFixed(1)} s, slowest ${(times[times.length - 1] / 1000).toFixed(1)} s.` : ""}`);
  console.log(`Saved ${out}`);
  if (clips) rmSync(clips, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
