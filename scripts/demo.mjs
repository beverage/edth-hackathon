// Fills a mission on a running coordinator with typed radio reports, so the command post can be
// seen working without a phone or a microphone. Each report goes through the real pipeline: the
// model reads the words, the resolver places them, and the mission log keeps the result.
// The plans are in scenarios/missions/<area>.json; docs/showcase.md says what each one shows.
//
//   npm run demo                         Vincennes, on http://localhost:3117
//   npm run demo -- kyiv                 another area: vincennes, kyiv or izium
//   npm run demo -- all                  all three, one mission each
//   npm run demo -- --pace 4             wait 4 s between reports, to watch them arrive
//   npm run demo -- --end                end each mission when its reports are in
//   npm run demo -- --base http://localhost:3131
//
// It needs the coordinator running in either mode (README, Run locally). Typed reports need no
// speech-to-text. Open http://localhost:3117/cp to watch; the newest open mission shows by itself.
import { readFileSync } from "node:fs";

const AREAS = ["vincennes", "kyiv", "izium"];
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const end = args.includes("--end");
if (end) args.splice(args.indexOf("--end"), 1);
const base = option("--base", "http://localhost:3117").replace(/\/+$/, "");
const pace = Number(option("--pace", "0")) * 1000;
const areas = args.length === 0 ? ["vincennes"] : args.includes("all") ? AREAS : args;
for (const a of areas) {
  if (!AREAS.includes(a)) {
    console.error(`No plan for "${a}". Use one of: ${AREAS.join(", ")}, or all.`);
    process.exit(1);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

/** Checks that a coordinator answers at base. Not ready yet is fine: typed reports need no speech-to-text. */
async function check() {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = await res.json().catch(() => ({}));
    if (body.app !== "voice-to-map") throw new Error("not this app");
    if (!body.ready) console.log("The coordinator is still warming up, or speech-to-text is not running. Typed reports work anyway.\n");
  } catch {
    console.error(`No coordinator at ${base}. Start it first: see "Run locally" in README.md.`);
    process.exit(1);
  }
}

let seq = 0;
async function say(plan, session, text, language) {
  const form = new FormData();
  form.set("session", session);
  form.set("area", plan.area);
  form.set("language", language ?? plan.language ?? "en");
  form.set("clientTs", String(Date.now()));
  form.set("seq", String(++seq));
  form.set("text", text);
  const res = await fetch(`${base}/api/report`, { method: "POST", body: form });
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

/** One line on what the coordinator made of a report. */
function outcome(r) {
  if (r.error) return `error: ${r.error}`;
  if (r.held) return `held for the operator: ${r.held.question ?? r.held.reason}`;
  const res = r.resolution ?? {};
  const parts = [r.callsign ?? "no call sign"];
  const t = res.track;
  // A new track says whose and what it is; an update says only what changed.
  if (t) parts.push([`track ${t.n ?? "?"}`, t.affiliation ?? (t.kind ? "unknown" : null), t.kind].filter(Boolean).join(" "));
  if (res.status === "resolved") parts.push(res.candidates?.find((c) => c.id === res.evidence?.feature_id)?.name ?? "placed");
  else if (res.question) parts.push(`asks: ${res.question}`);
  else if (!r.request) parts.push(res.status ?? "?");
  if (r.request) parts.push("asks for recon");
  return parts.join(", ");
}

async function run(area) {
  const plan = JSON.parse(readFileSync(new URL(`../scenarios/missions/${area}.json`, import.meta.url), "utf8"));
  const opened = await post("/api/sessions", { area: plan.area, name: plan.name, start: plan.start ?? null, roster: plan.roster });
  const session = opened.data.mission?.code;
  if (!session) throw new Error(`Could not open a mission: ${JSON.stringify(opened.data)}`);
  console.log(`Mission ${session}, "${plan.name}". Watch it at ${base}/cp?session=${session}\n`);

  const ids = {}; // a step's label -> its report id, and its recon request
  for (const step of plan.steps) {
    if (step.kind) {
      const [callsign, kind] = step.kind;
      const r = await post(`/api/sessions/${session}/units`, { callsign, kind });
      console.log(`  The command post marks ${callsign} as a ${kind.replace("_", " ")}${r.status < 300 ? "." : `: refused (${r.status}).`}`);
      continue;
    }
    if (step.answer) {
      const [label, choice] = step.answer;
      if (!ids[label]?.asked) { console.log(`  (No question to answer for "${label}": the model placed it straight away.)`); continue; }
      const r = await post("/api/answer", { session, report: ids[label].id, choice, by: "CP" });
      const picked = ids[label].choices?.find((c) => c.id === choice);
      const named = picked ? `${picked.name} (${picked.subtype ?? picked.category})` : choice;
      console.log(`  The operator answers the question: ${r.status < 300 ? named : `refused (${r.data.error ?? r.status})`}.`);
      continue;
    }
    if (step.send) {
      const asked = ids[step.send.request];
      if (!asked?.request) { console.log("  (No recon request was heard, so no drone is sent.)"); continue; }
      const r = await post(`/api/sessions/${session}/tasks`, { action: "send", unit: step.send.unit, n: asked.request.n, request: asked.request.id });
      console.log(`  The operator sends ${step.send.unit} to look at track ${asked.request.n}${r.status < 300 ? "." : `: refused (${r.data.error ?? r.status}).`}`);
      continue;
    }
    if (pace) await sleep(pace);
    const r = await say(plan, session, step.text, step.language);
    if (step.label) ids[step.label] = { id: r.held?.id ?? r.report_id, asked: r.resolution?.status === "ambiguous", choices: r.resolution?.candidates, request: r.request };
    console.log(`> ${step.text}\n    ${outcome(r)}`);
  }
  if (end) {
    await post(`/api/sessions/${session}/end`, {});
    console.log(`\nMission ${session} ended. It stays in the replay.\n`);
  } else {
    console.log(`\nMission ${session} is open. Questions left for the operator wait in the Decisions list.\n`);
  }
}

await check();
for (const area of areas) await run(area);
