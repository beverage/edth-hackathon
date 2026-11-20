import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { loadGazetteer } from './geo/gazetteer.js';
import { isAreaId } from './geo/areas.js';
import { UserError } from './controller.js';

const files = { '/': ['controller.html', 'text/html'], '/phone': ['phone.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/map.js': ['map.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };
export const localRequest = req => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const token = req => req.headers.authorization?.replace(/^Bearer /, '') ?? '';
const control = req => { if (!localRequest(req)) throw new UserError('Open the controller on this computer at localhost. Use /phone on the phone.', 403); };

async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new UserError('Expected JSON.', 415);
  const origin = req.headers.origin;
  if (origin && origin !== `http://${req.headers.host}`) throw new UserError('Request origin is not allowed.', 403);
  let bytes = 0, overflow = false; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 32768) overflow = true; if (!overflow) chunks.push(chunk); }
  if (overflow) throw new UserError('Request is too large.', 413);
  try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error(); return body; }
  catch { throw new UserError('Invalid JSON.'); }
}

export function createHttpServer(controller, { port = 3117 } = {}) {
  let healthCache = null, checked = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
    try {
      const url = new URL(req.url, 'http://controller.local');
      const pathname = url.pathname;
      if (req.method === 'GET' && files[pathname]) {
        const [file, mime] = files[pathname];
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
        res.end(await readFile(new URL(`../web/${file}`, import.meta.url))); return;
      }
      if (req.method === 'GET' && pathname === '/api/missions') { send(200, controller.list()); return; }
      if (req.method === 'GET' && pathname === '/api/unit') {
        send(200, { ...controller.unitState(token(req)), controllerError: controller.fatalError ?? null }); return;
      }
      if (req.method === 'GET' && pathname === '/api/health') {
        control(req);
        if (Date.now() - checked > 10000) { healthCache = await controller.extractor.health(); checked = Date.now(); }
        const addresses = Object.values(networkInterfaces()).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}/phone`);
        send(200, { ...healthCache, addresses, controllerError: controller.fatalError ?? null }); return;
      }
      if (req.method === 'GET' && pathname === '/api/state') {
        control(req);
        const id = url.searchParams.get('mission');
        let at;
        if (url.searchParams.has('at')) { at = Number(url.searchParams.get('at')); if (!Number.isFinite(at)) throw new UserError('Invalid replay time.'); }
        send(200, id ? controller.view(id, at) : null); return;
      }
      if (req.method === 'GET' && pathname === '/api/map') {
        control(req); const area = url.searchParams.get('area');
        if (!isAreaId(area)) throw new UserError('Unknown area.');
        send(200, loadGazetteer(area).map(({ id, name, category, lat, lon, lines }) => ({ id, name, category, lat, lon, lines }))); return;
      }
      if (req.method === 'GET' && pathname === '/api/places') {
        control(req); send(200, controller.places(url.searchParams.get('area'), url.searchParams.get('q'))); return;
      }
      if (req.method === 'GET' && pathname === '/api/export') {
        control(req); const id = url.searchParams.get('mission'); controller.mission(id);
        // Unit authentication and join codes stay on the controller, never in exported logs.
        const events = controller.store.events.filter(e => e.mission === id).map(({ token, invite, device, ...e }) => e);
        res.setHeader('Content-Disposition', 'attachment; filename="mission.json"'); send(200, events); return;
      }
      if (req.method === 'POST') {
        const body = await jsonBody(req);
        if (controller.fatalError) throw new UserError(controller.fatalError, 503);
        if (pathname === '/api/missions') { control(req); send(201, await controller.create(body)); return; }
        const end = pathname.match(/^\/api\/missions\/([^/]+)\/end$/);
        if (end) { control(req); send(200, await controller.end(decodeURIComponent(end[1]))); return; }
        if (pathname === '/api/join') { send(200, await controller.join(body)); return; }
        if (pathname === '/api/reports') { send(202, await controller.submit(token(req), body)); return; }
        if (pathname === '/api/answers') { send(200, await controller.answer(token(req), body)); return; }
      }
      send(404, { error: 'Not found.' });
    } catch (err) {
      if (!(err instanceof UserError)) console.error('Request failed:', err.code ?? err.name);
      if (!res.headersSent) send(err.status ?? 500, { error: err instanceof UserError ? err.message : 'The controller could not complete the request. Check its terminal.' });
      else res.end();
    }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return server;
}
