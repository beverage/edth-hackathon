import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration } from '../src/config.js';
import { createExtractor } from '../src/ollama.js';
import { EventStore } from '../src/store.js';
import { Controller } from '../src/controller.js';

const area = process.argv[2] || 'vincennes';
if (!['vincennes', 'kyiv'].includes(area)) { console.error('Usage: npm run scenarios -- vincennes|kyiv'); process.exit(1); }
const scenario = JSON.parse(await readFile(new URL(`../scenarios/${area}-demo.json`, import.meta.url), 'utf8'));
const dir = await mkdtemp(join(tmpdir(), 'voice-map-scenario-'));
const store = await new EventStore(dir).init();
const app = await new Controller(store, createExtractor(configuration())).init();
let failed = 0;
try {
  const mission = await app.create({ name: scenario.title, area });
  const users = new Map();
  for (const step of scenario.steps) {
    if (!users.has(step.callsign)) users.set(step.callsign, await app.join({ mission: mission.id, invite: mission.invite, callsign: step.callsign, device: `scenario-${step.callsign}` }));
    const user = users.get(step.callsign);
    const receipt = await app.submit(user.token, { text: step.text, language: step.lang, requestId: step.id });
    let report;
    do { await new Promise(resolve => setTimeout(resolve, 50)); report = app.mission(mission.id).reports[receipt.id]; } while (['queued', 'processing'].includes(report.status));
    const res = report.resolution;
    let pass = report.status === step.expect.status && (!step.expect.feature_id || res?.evidence.feature_id === step.expect.feature_id) && (!step.expect.heading_to || res?.heading_to?.id === step.expect.heading_to);
    if (step.choose && report.status === 'ambiguous') {
      const choice = res.candidates.find(c => c.id === step.choose);
      if (choice) await app.answer(user.token, { report: receipt.id, choice: choice.id }); else pass = false;
    }
    if (!pass) failed++;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${step.id}: ${report.status} · ${report.elapsedMs ?? 0} ms · ${step.text}${report.error ? ` · ${report.error}` : ''}`);
  }
  console.log(`${scenario.steps.length - failed}/${scenario.steps.length} reports matched the expected outcome.`);
} finally { await app.close(); await rm(dir, { recursive: true, force: true }); }
if (failed) process.exitCode = 1;
