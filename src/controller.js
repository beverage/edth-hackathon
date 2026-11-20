import { randomBytes, randomUUID } from 'node:crypto';
import { AREAS, isAreaId } from './geo/areas.js';
import { loadGazetteer, searchByName } from './geo/gazetteer.js';
import { resolve } from './geo/resolver.js';
import { bboxHalfDiagonalM } from './geo/geo.js';
import { foldEvents, publicMission } from './state.js';

export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const requireText = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max) throw new UserError(`${name} is required (up to ${max} characters).`);
  return v.trim();
};
export const languageOf = v => ['en', 'fr', 'uk'].includes(v) ? v : 'en';

function placementPosition(pl, label) {
  if (!pl.pin) return null;
  return { ...pl.pin, radius_m: pl.radius_m ?? 80, label: pl.heading_to ? `towards ${pl.heading_to.name}` : label,
    estimated: !!pl.estimated, heading_to: pl.heading_to };
}

export class Controller {
  constructor(store, extractor) {
    this.store = store; this.extractor = extractor; this.missions = foldEvents(store.events);
    this.lock = Promise.resolve(); this.queue = []; this.running = false; this.stopping = false; this.abort = new AbortController();
  }
  async init() {
    for (const m of Object.values(this.missions)) for (const r of Object.values(m.reports)) {
      if (['queued', 'processing'].includes(r.status)) await this.record({ kind: 'result', mission: m.id, report: r.id, status: 'error', error: 'Controller restarted before this report finished. Please send it again.' });
    }
    return this;
  }
  exclusive(fn) { const task = this.lock.then(fn); this.lock = task.catch(() => {}); return task; }
  async record(event) {
    const saved = await this.store.append({ ...event, id: event.id ?? randomUUID(), ts: Date.now() });
    this.missions = foldEvents(this.store.events);
    return saved;
  }
  mission(id) { const m = Object.hasOwn(this.missions, id) ? this.missions[id] : null; if (!m) throw new UserError('Mission not found.', 404); return m; }
  openMission(id) { const m = this.mission(id); if (m.ended) throw new UserError('This mission has ended. Join an open mission.', 409); return m; }
  list() { return Object.values(this.missions).map(m => ({ id: m.id, name: m.name, area: m.area, opened: m.opened, ended: m.ended, units: Object.keys(m.units).length })).reverse(); }
  create(input) {
    return this.exclusive(async () => {
      if (!isAreaId(input.area)) throw new UserError('Choose Vincennes or Kyiv.');
      const name = requireText(input.name, 80, 'Mission name');
      const feature = input.start ? loadGazetteer(input.area).find(f => f.id === input.start) : null;
      if (input.start && !feature) throw new UserError('Choose a start point from the gazetteer.');
      const start = feature ? { lat: feature.lat, lon: feature.lon, radius_m: Math.max(300, feature.bbox ? bboxHalfDiagonalM(feature.bbox) : 0), label: feature.name, estimated: true } : null;
      const number = Object.keys(this.missions).length + 1;
      const id = `${input.area}-${number}`;
      await this.record({ kind: 'mission', mission: id, name, area: input.area, start, invite: randomBytes(6).toString('hex') });
      return publicMission(this.mission(id), true);
    });
  }
  end(id) {
    return this.exclusive(async () => {
      const m = this.mission(id);
      if (!m.ended) await this.record({ kind: 'end', mission: id });
      return { ended: true };
    });
  }
  join(input) {
    return this.exclusive(async () => {
      const m = this.openMission(input.mission);
      if (typeof input.invite !== 'string' || input.invite.trim().toLowerCase() !== m.invite) throw new UserError('The join code is incorrect.', 403);
      const callsign = requireText(input.callsign, 24, 'Call sign').toUpperCase();
      if (!/^[\p{L}\p{N} _-]+$/u.test(callsign)) throw new UserError('Use letters, numbers, spaces, - or _ for the call sign.');
      const device = requireText(input.device, 80, 'Device identifier');
      const old = m.units[callsign];
      if (old && old.device !== device && Date.now() - old.lastSeen < 180000) throw new UserError('This call sign is in use. Choose another.', 409);
      if (old?.device === device) return { token: old.token, mission: m.id, callsign };
      const token = randomBytes(24).toString('hex');
      await this.record({ kind: 'join', mission: m.id, callsign, device, token, start: m.start, language: languageOf(input.language) });
      return { token, mission: m.id, callsign };
    });
  }
  identify(token) {
    if (typeof token !== 'string' || !token) throw new UserError('Join a mission first.', 401);
    for (const m of Object.values(this.missions)) for (const u of Object.values(m.units)) if (u.token === token) return { m, u };
    throw new UserError('Your connection expired. Join the mission again.', 401);
  }
  unitState(token) {
    const { m, u } = this.identify(token);
    const report = u.latestReport ? m.reports[u.latestReport] : null;
    return { mission: { id: m.id, name: m.name, area: m.area, ended: m.ended }, callsign: u.callsign,
      position: u.position, positionTs: u.positionTs, report, pending: u.pending ? m.reports[u.pending] : null,
      history: Object.values(m.reports).filter(r => r.callsign === u.callsign).slice(-20).reverse() };
  }
  submit(token, input) {
    return this.exclusive(async () => {
      const { m, u } = this.identify(token); this.openMission(m.id);
      const text = requireText(input.text, 500, 'Report');
      const requestId = requireText(input.requestId, 80, 'Report identifier');
      const duplicate = Object.values(m.reports).find(r => r.callsign === u.callsign && r.requestId === requestId);
      if (duplicate) return { id: duplicate.id, status: duplicate.status };
      if (this.queue.length >= 20) throw new UserError('The controller is busy. Try again shortly.', 429);
      const event = await this.record({ kind: 'accepted', mission: m.id, callsign: u.callsign, text, requestId, language: languageOf(input.language) });
      this.queue.push({ mission: m.id, report: event.id });
      void this.drain();
      return { id: event.id, status: 'queued' };
    });
  }
  answer(token, input) {
    return this.exclusive(async () => {
      const { m, u } = this.identify(token); this.openMission(m.id);
      const report = m.reports[input.report];
      if (!report || report.callsign !== u.callsign) throw new UserError('Question not found.', 404);
      if (report.status === 'answered' || report.status === 'rejected') return { status: report.status };
      if (u.pending !== report.id || u.latestReport !== report.id) throw new UserError('That question is no longer current.', 409);
      const candidate = input.choice === null ? null : report.resolution.candidates.find(c => c.id === input.choice);
      if (input.choice !== null && !candidate) throw new UserError('Choose one of the offered places.');
      await this.record({ kind: 'answer', mission: m.id, report: report.id, choice: candidate?.id ?? null,
        position: candidate ? placementPosition(candidate.placement, candidate.name) : null });
      return { status: candidate ? 'answered' : 'rejected' };
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.stopping) {
        const job = this.queue.shift();
        await this.process(job);
      }
    } catch (err) { this.fatalError = 'Cannot save the report log. Stop the controller and check disk space and permissions.'; console.error(this.fatalError, err.code ?? err.name); }
    finally { this.running = false; }
  }
  async process({ mission, report }) {
    const started = Date.now();
    let context;
    await this.exclusive(async () => {
      const m = this.mission(mission), r = m.reports[report], u = m.units[r.callsign];
      if (m.ended || u.latestReport !== report) {
        await this.record({ kind: 'result', mission, report, status: 'superseded' }); return;
      }
      context = { r: { ...r }, last: u.position ? { ...u.position, ts: u.positionTs ?? m.opened,
        ...(u.position.estimated ? { uncertainty_m: u.position.radius_m } : {}) } : null, area: m.area };
      await this.record({ kind: 'progress', mission, report });
    });
    if (!context) return;
    let outcome;
    try {
      const { r, last, area } = context;
      const intent = await this.extractor.extract(r.text, { place: AREAS[area].place, language: r.language, signal: this.abort.signal });
      const resolution = resolve({ intent, transcript: r.text, lastPosition: last, now: Date.now(), gazetteer: loadGazetteer(area), areaCentre: AREAS[area].centre });
      const name = resolution.candidates.find(c => c.id === resolution.evidence.feature_id)?.name ?? (intent.distance_m ? `${intent.distance_m} m ${intent.direction ?? ''}` : 'position');
      outcome = { status: resolution.status, resolution, position: resolution.status === 'resolved' ? placementPosition(resolution, name) : null };
    } catch (err) { outcome = { status: 'error', error: err.message || 'Processing failed. Please retry.' }; }
    await this.exclusive(async () => {
      const m = this.mission(mission), r = m.reports[report], u = m.units[r.callsign];
      if (m.ended || u.latestReport !== report) outcome = { status: 'superseded' };
      await this.record({ kind: 'result', mission, report, ...outcome, elapsedMs: Date.now() - started });
    });
  }
  view(id, at) { const m = foldEvents(this.store.events, at)[id]; if (!m) throw new UserError('Mission not found at that time.', 404); return publicMission(m, true); }
  places(area, query) {
    if (!isAreaId(area)) throw new UserError('Unknown area.');
    return searchByName(String(query ?? '').slice(0, 100), loadGazetteer(area)).filter(m => m.score >= .5).slice(0, 8).map(({ feature: f }) => ({ id: f.id, name: f.name, category: f.category, town: f.town }));
  }
  async close() { this.stopping = true; this.abort.abort(); while (this.running) await new Promise(r => setTimeout(r, 20)); await this.lock; await this.store.close(); }
}
