export function foldEvents(events, at = Infinity) {
  const missions = Object.create(null);
  for (const e of events) {
    if (e.ts > at) continue;
    if (e.kind === 'mission') {
      missions[e.mission] = { id: e.mission, name: e.name, area: e.area, invite: e.invite, opened: e.ts, ended: null, start: e.start, units: {}, reports: {} };
      continue;
    }
    const m = missions[e.mission];
    if (!m) continue;
    if (e.kind === 'end') {
      m.ended = e.ts;
      for (const r of Object.values(m.reports)) if (['queued', 'processing', 'ambiguous'].includes(r.status)) r.status = 'superseded';
      for (const u of Object.values(m.units)) u.pending = null;
    }
    if (e.kind === 'join') {
      const old = m.units[e.callsign];
      if (old?.pending && m.reports[old.pending]) m.reports[old.pending].status = 'superseded';
      m.units[e.callsign] = { callsign: e.callsign, device: e.device, token: e.token, language: e.language, joined: e.ts, lastSeen: e.ts,
        position: old?.position ?? e.start, positionTs: old?.positionTs ?? null, trail: old?.trail ?? [], latestReport: null, pending: null };
    }
    if (e.kind === 'accepted') {
      m.reports[e.id] = { id: e.id, callsign: e.callsign, text: e.text, language: e.language, ts: e.ts, status: 'queued', requestId: e.requestId };
      const u = m.units[e.callsign];
      if (u.pending && m.reports[u.pending]) m.reports[u.pending].status = 'superseded';
      u.latestReport = e.id; u.pending = null; u.lastSeen = e.ts; u.language = e.language;
    }
    if (e.kind === 'progress' && m.reports[e.report]) m.reports[e.report].status = 'processing';
    if (e.kind === 'result') {
      const r = m.reports[e.report];
      if (!r) continue;
      Object.assign(r, { status: e.status, resolution: e.resolution, error: e.error, elapsedMs: e.elapsedMs, finished: e.ts });
      const u = m.units[r.callsign];
      if (u.latestReport === r.id && !m.ended) {
        if (e.status === 'ambiguous') u.pending = r.id;
        if (e.position) move(u, e.position, e.ts);
      }
    }
    if (e.kind === 'answer') {
      const r = m.reports[e.report];
      if (!r) continue;
      Object.assign(r, { status: e.choice === null ? 'rejected' : 'answered', choice: e.choice, answered: e.ts });
      const u = m.units[r.callsign];
      if (u.latestReport === r.id) { u.pending = null; if (e.position) move(u, e.position, e.ts); }
    }
  }
  return missions;
}

function move(unit, position, ts) {
  if (unit.position && unit.positionTs) unit.trail.push({ ...unit.position, ts: unit.positionTs });
  unit.trail = unit.trail.slice(-100);
  unit.position = position; unit.positionTs = ts; unit.lastSeen = ts;
}

export function publicMission(mission, controller = false) {
  const { invite, ...result } = mission;
  result.units = Object.values(mission.units).map(({ token, device, ...u }) => u);
  const recent = new Map(Object.values(mission.reports).slice(-200).map(r => [r.id, r]));
  // Questions remain visible even when other units produce more than 200 newer reports.
  for (const u of Object.values(mission.units)) if (u.pending && mission.reports[u.pending]) recent.set(u.pending, mission.reports[u.pending]);
  result.reports = [...recent.values()].sort((a, b) => b.ts - a.ts);
  if (controller) result.invite = invite;
  return result;
}
