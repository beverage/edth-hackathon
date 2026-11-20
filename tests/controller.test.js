import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EventStore } from '../src/store.js';
import { Controller } from '../src/controller.js';
import { foldEvents } from '../src/state.js';

const intent = name => ({ kind: 'position', landmark_text: name, landmark_name: name, landmark_category: null, relation: 'at', language: 'en', confidence: .95 });
const position = intent('Bérault');
async function fixture(t, extract = async () => position) {
  const dir = await mkdtemp(join(tmpdir(), 'voice-map-'));
  const store = await new EventStore(dir).init();
  const app = await new Controller(store, { extract, health: async () => ({ connected: true, available: true, model: 'test' }) }).init();
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const mission = await app.create({ name: 'Walk', area: 'vincennes' });
  const user = await app.join({ mission: mission.id, invite: mission.invite, callsign: 'alpha 1', device: 'phone-1', language: 'en' });
  return { app, store, dir, mission, user };
}
const submit = (app, user, text = "I'm at Bérault", requestId = 'report-1') => app.submit(user.token, { text, requestId, language: 'en' });
async function settled(app, id, mission) {
  for (let i = 0; i < 200; i++) {
    const r = app.mission(mission).reports[id];
    if (!['queued', 'processing'].includes(r.status)) return r;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Report did not finish');
}

test('reports have receipts, update the shared map, and keep private feedback history', async t => {
  const { app, user, mission } = await fixture(t);
  const receipt = await submit(app, user);
  assert.equal(receipt.status, 'queued');
  assert.equal((await settled(app, receipt.id, mission.id)).status, 'resolved');
  const state = app.unitState(user.token);
  assert.equal(state.callsign, 'ALPHA 1'); assert.equal(state.history.length, 1);
  assert.equal(state.position.label, 'Bérault'); assert.ok(state.position.radius_m >= 30 && state.position.radius_m < 100);
  const view = app.view(mission.id); assert.equal(view.units[0].callsign, 'ALPHA 1');
  assert.ok(!('token' in view.units[0])); assert.ok(!('device' in view.units[0]));
});
test('an ambiguous place waits for a phone answer; repeated answers do not move it twice', async t => {
  const { app, user, mission } = await fixture(t, async () => intent('Château de Vincennes'));
  const receipt = await submit(app, user, "I'm at the château de Vincennes");
  const r = await settled(app, receipt.id, mission.id); assert.equal(r.status, 'ambiguous');
  assert.equal(app.unitState(user.token).position, null);
  const c = r.resolution.candidates.find(c => c.category === 'metro_station'); assert.ok(c);
  await app.answer(user.token, { report: r.id, choice: c.id });
  assert.equal(app.unitState(user.token).position.label, c.name);
  await app.answer(user.token, { report: r.id, choice: null });
  assert.equal(app.unitState(user.token).report.status, 'answered');
});
test('none of these closes a question without inventing a position', async t => {
  const { app, user, mission } = await fixture(t, async () => intent('Château de Vincennes'));
  const { id } = await submit(app, user); await settled(app, id, mission.id);
  await app.answer(user.token, { report: id, choice: null });
  assert.equal(app.unitState(user.token).position, null); assert.equal(app.unitState(user.token).pending, null);
});
test('retransmitting the same report is idempotent', async t => {
  let calls = 0;
  const { app, user, mission } = await fixture(t, async () => { calls++; return position; });
  const one = await submit(app, user), two = await submit(app, user);
  assert.equal(one.id, two.id); await settled(app, one.id, mission.id);
  assert.equal(calls, 1); assert.equal(Object.keys(app.mission(mission.id).reports).length, 1);
});
test('failed inference gives feedback and a later report can succeed', async t => {
  let first = true;
  const { app, user, mission } = await fixture(t, async () => { if (first) { first = false; throw new Error('Ollama is not running'); } return position; });
  const bad = await submit(app, user); assert.equal((await settled(app, bad.id, mission.id)).status, 'error');
  assert.match(app.unitState(user.token).report.error, /Ollama/);
  const good = await submit(app, user, "I'm at Bérault", 'report-2'); assert.equal((await settled(app, good.id, mission.id)).status, 'resolved');
});
test('a newer report makes the older question unanswerable', async t => {
  const { app, user, mission } = await fixture(t, async text => intent(text === 'castle' ? 'Château de Vincennes' : 'Bérault'));
  const old = await submit(app, user, 'castle'); await settled(app, old.id, mission.id);
  const next = await submit(app, user, 'metro', 'report-2'); await settled(app, next.id, mission.id);
  await assert.rejects(app.answer(user.token, { report: old.id, choice: null }), /no longer current/);
  assert.equal(app.unitState(user.token).position.label, 'Bérault');
});
test('ending a mission prevents an in-flight result from moving a unit', async t => {
  let release; const wait = new Promise(r => release = r);
  const { app, user, mission } = await fixture(t, async () => { await wait; return position; });
  const r = await submit(app, user); await app.end(mission.id); release();
  assert.equal((await settled(app, r.id, mission.id)).status, 'superseded');
  assert.equal(app.unitState(user.token).position, null);
  await assert.rejects(submit(app, user, 'again', 'next'), /ended/);
});
test('a newer accepted report supersedes older in-flight work', async t => {
  let release; const wait = new Promise(r => release = r);
  const { app, user, mission } = await fixture(t, async text => { if (text === 'old') await wait; return intent(text === 'old' ? 'Château de Vincennes' : 'Bérault'); });
  const old = await submit(app, user, 'old'); const next = await submit(app, user, 'new', 'report-2'); release();
  assert.equal((await settled(app, old.id, mission.id)).status, 'superseded');
  assert.equal((await settled(app, next.id, mission.id)).status, 'resolved');
});
test('join codes and call-sign ownership are enforced', async t => {
  const { app, mission, user } = await fixture(t);
  await assert.rejects(app.join({ mission: mission.id, invite: 'wrong', callsign: 'B', device: 'phone2' }), /incorrect/);
  await assert.rejects(app.join({ mission: mission.id, invite: mission.invite, callsign: 'alpha 1', device: 'phone2' }), /in use/);
  assert.equal((await app.join({ mission: mission.id, invite: mission.invite, callsign: 'ALPHA 1', device: 'phone-1' })).token, user.token);
  assert.throws(() => app.unitState('bad'), /expired/);
});
test('users cannot answer another user’s question', async t => {
  const { app, mission, user } = await fixture(t, async () => intent('Château de Vincennes'));
  const second = await app.join({ mission: mission.id, invite: mission.invite, callsign: 'B', device: 'phone2' });
  const r = await submit(app, user); await settled(app, r.id, mission.id);
  await assert.rejects(app.answer(second.token, { report: r.id, choice: null }), /not found/);
  assert.equal(app.unitState(second.token).history.length, 0);
});
test('start positions are estimates derived from the gazetteer, never client coordinates', async t => {
  const { app } = await fixture(t);
  const m = await app.create({ name: 'Start', area: 'vincennes', start: 'node/9415191169', lat: 0, lon: 0 });
  assert.equal(m.start.estimated, true); assert.ok(m.start.radius_m >= 300); assert.ok(m.start.lat > 48);
  await assert.rejects(app.create({ name: 'Bad', area: 'constructor' }), /Choose/);
  assert.throws(() => app.mission('constructor'), /not found/);
});
test('replay rebuilds the state before a question was answered', async t => {
  const { app, user, mission, store } = await fixture(t, async () => intent('Château de Vincennes'));
  const r = await submit(app, user); const finished = await settled(app, r.id, mission.id);
  const before = foldEvents([...store.events]);
  await app.answer(user.token, { report: r.id, choice: finished.resolution.candidates[0].id });
  assert.equal(before[mission.id].units['ALPHA 1'].position, null);
  assert.equal(before[mission.id].units['ALPHA 1'].pending, r.id);
  assert.ok(app.unitState(user.token).position);
});
test('the store survives restarts, repairs an interrupted final line, and prevents a second controller', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'voice-map-log-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const store = await new EventStore(dir).init();
  await store.append({ id: 'one', kind: 'mission', mission: 'm', ts: 1, area: 'vincennes', name: 'Test' });
  await assert.rejects(new EventStore(dir).init(), /Another controller/); await store.close();
  await appendFile(join(dir, 'events.jsonl'), '{"incomplete"');
  const again = await new EventStore(dir).init(); assert.equal(again.events.length, 1);
  await again.append({ id: 'two', kind: 'end', mission: 'm', ts: 2 }); await again.close();
  assert.equal((await readFile(join(dir, 'events.jsonl'), 'utf8')).trim().split('\n').length, 2);
});
test('queued work found on restart becomes an explicit retryable error', async t => {
  const { app, store, user, mission } = await fixture(t);
  await app.record({ kind: 'accepted', id: 'interrupted', mission: mission.id, callsign: 'ALPHA 1', text: 'test', language: 'en', requestId: 'r' });
  await app.init(); assert.equal(app.unitState(user.token).report.status, 'error');
  assert.match(app.unitState(user.token).report.error, /restarted/); assert.ok(store.events.length > 3);
});
