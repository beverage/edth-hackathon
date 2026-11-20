import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller } from '../src/controller.js';
import { EventStore } from '../src/store.js';
import { createHttpServer, localRequest } from '../src/http.js';

test('browser API connects a phone, acknowledges a report, and returns shared results', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'voice-map-http-'));
  const store = await new EventStore(dir).init();
  const controller = await new Controller(store, { extract: async () => ({ kind: 'position', landmark_name: 'Bérault', landmark_text: 'Bérault', relation: 'at', language: 'en' }), health: async () => ({ available: true }) }).init();
  const server = createHttpServer(controller);
  t.after(async () => { server.close(); server.closeAllConnections(); await controller.close(); await rm(dir, { recursive: true, force: true }); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (path, token) => fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const post = async (path, data, token, origin) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(data) });
  const page = await get('/phone'); assert.match(await page.text(), /Which place/); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const mission = await (await post('/api/missions', { name: 'Live', area: 'vincennes' })).json();
  const user = await (await post('/api/join', { mission: mission.id, invite: mission.invite, callsign: 'A', device: 'phone' })).json();
  const receipt = await post('/api/reports', { text: "I'm at Bérault", requestId: 'one' }, user.token); assert.equal(receipt.status, 202);
  let state;
  for (let i = 0; i < 100; i++) { state = await (await get('/api/unit', user.token)).json(); if (state.report?.status === 'resolved') break; await new Promise(r => setTimeout(r, 5)); }
  assert.equal(state.position.label, 'Bérault');
  const snapshot = await (await get(`/api/state?mission=${mission.id}`)).json(); assert.equal(snapshot.units[0].callsign, 'A');
  assert.equal((await get('/api/unit', 'bad')).status, 401);
  assert.equal((await post('/api/missions', { name: 'X', area: 'vincennes' }, null, 'https://unrelated.example')).status, 403);
  const exported = await (await get(`/api/export?mission=${mission.id}`)).json();
  assert.ok(exported.every(e => !e.token && !e.invite && !e.device));
});
test('controller-only actions require loopback; phone actions do not require USB', () => {
  assert.equal(localRequest({ socket: { remoteAddress: '192.168.1.3' } }), false);
  assert.equal(localRequest({ socket: { remoteAddress: '::ffff:127.0.0.1' } }), true);
});
