import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createExtractor } from '../src/ollama.js';
import { configuration } from '../src/config.js';
import { sanitizeIntent } from '../src/intent.js';
import { languageOf } from '../src/controller.js';

test('Ollama receives the local model, schema, language and bounded context', async () => {
  let request;
  const extractor = createExtractor({ fetchImpl: async (url, init) => {
    request = { url, body: JSON.parse(init.body) };
    return Response.json({ message: { content: JSON.stringify({ kind: 'position', landmark_name: 'Bérault', language: 'uk', lat: 0, lon: 0, relation: 'at' }) } });
  } });
  const intent = await extractor.extract("I'm at Bérault", { language: 'en', place: 'Vincennes, France' });
  assert.equal(request.url, 'http://127.0.0.1:11434/api/chat'); assert.equal(request.body.model, 'ministral-3:3b');
  assert.equal(request.body.options.num_ctx, 4096); assert.equal(request.body.format.additionalProperties, false);
  assert.equal(intent.language, 'en'); assert.ok(!('lat' in intent)); assert.ok(!('lon' in intent));
});
test('health distinguishes unavailable Ollama from a missing model', async () => {
  const offline = createExtractor({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal((await offline.health()).connected, false);
  const empty = createExtractor({ fetchImpl: async () => Response.json({ models: [] }) });
  assert.equal((await empty.health()).available, false); assert.match((await empty.health()).message, /ollama pull/);
});
test('malformed model answers and missing models produce actionable errors', async () => {
  const bad = createExtractor({ fetchImpl: async () => Response.json({ message: { content: 'bad JSON' } }) });
  await assert.rejects(bad.extract('at the station', { language: 'en' }), /unreadable/);
  const missing = createExtractor({ fetchImpl: async () => new Response('', { status: 404 }) });
  await assert.rejects(missing.extract('at the station'), /ollama pull/);
});
test('configuration validates port, URL and CLI arguments', () => {
  assert.equal(configuration({}, []).port, 3117); assert.equal(configuration({}, ['--port', '4000']).port, 4000);
  assert.throws(() => configuration({ PORT: 'NaN' }), /PORT/);
  assert.throws(() => configuration({ OLLAMA_URL: 'file:///tmp/model' }), /HTTP/);
  assert.throws(() => configuration({}, ['--oops', 'x']), /Usage/);
});
test('intent sanitation preserves supported pinned languages and rejects impossible distances', () => {
  assert.equal(sanitizeIntent({ distance_m: 1000000 }).distance_m, null);
  assert.deepEqual(['en', 'fr', 'uk', 'ru', null].map(languageOf), ['en', 'fr', 'uk', 'en', 'en']);
});
