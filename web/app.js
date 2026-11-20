import { MissionMap, unitColor } from './map.js';
const $ = id => document.getElementById(id);
const time = ts => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Not placed yet';
const node = (tag, text, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; };
// getRandomValues is available on HTTP LAN pages; randomUUID requires a secure context.
const uniqueId = () => [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2, '0')).join('');
function stored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function connection(ok, text = ok ? 'Connected' : 'Disconnected') { $('connection').textContent = text; $('connection').className = `badge ${ok ? 'ok' : 'bad'}`; }
function error(text) { const el = $('page-error'); el.textContent = text; el.hidden = !text; }
async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(8000) });
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status}).`); e.status = res.status; throw e; }
  return data;
}
function options(select, missions, selected) {
  const signature = JSON.stringify(missions.map(m => [m.id, m.name, m.ended]));
  if (select.dataset.signature === signature) return;
  select.dataset.signature = signature;
  select.replaceChildren(...missions.map(m => { const option = node('option', `${m.name}${m.ended ? ' · ended' : ''}`); option.value = m.id; return option; }));
  if (missions.some(m => m.id === selected)) select.value = selected;
}
function description(report, position) {
  if (!report) return 'Ready for your first report.';
  switch (report.status) {
    case 'queued': return 'Received. Waiting for the controller.';
    case 'processing': return 'Interpreting your report…';
    case 'error': return report.error;
    case 'ambiguous': return report.resolution.question || 'Which place did you mean?';
    case 'unresolved': return report.resolution.question || 'Please name a street or landmark.';
    case 'superseded': return 'A newer report replaced this one.';
    case 'rejected': return 'None of the places matched. Send a clearer report.';
    case 'answered': return 'Your choice was received and the map was updated.';
    case 'resolved': {
      const res = report.resolution;
      const label = position?.label || res?.candidates?.find(c => c.id === res.evidence.feature_id)?.name || 'reported position';
      return position || res?.pin ? `${(position?.estimated || res?.estimated) ? 'Estimated position' : 'Placed'}: ${label} · ±${Math.round(position?.radius_m ?? res.radius_m)} m` : 'Direction received. Name your starting place to place you on the map.';
    }
    default: return report.status;
  }
}
function feedItem(report, position) {
  const item = node('article'); item.append(node('time', time(report.ts)), node('p', report.callsign || '', 'identity'), node('p', `“${report.text}”`), node('p', description(report, position), 'outcome')); return item;
}

async function phone() {
  let credentials = stored('v2m-unit', null), submitting = false, retry = null, lastFeedback = '', refreshGeneration = 0, networkError = false;
  const device = stored('v2m-device', null) || uniqueId(); save('v2m-device', device);
  const query = new URLSearchParams(location.search);
  $('join-code').value = query.get('invite') || '';
  $('callsign').value = stored('v2m-callsign', 'ALPHA 1');
  $('language').value = stored('v2m-language', 'en');
  $('report-text').value = stored('v2m-draft', '');
  $('speak').checked = stored('v2m-speak', false);
  $('report-text').addEventListener('input', () => save('v2m-draft', $('report-text').value));
  $('language').addEventListener('change', () => save('v2m-language', $('language').value));
  $('speak').addEventListener('change', () => {
    save('v2m-speak', $('speak').checked);
    if ($('speak').checked && 'speechSynthesis' in window) { const unlock = new SpeechSynthesisUtterance(' '); unlock.volume = 0; speechSynthesis.speak(unlock); }
  });
  const showJoined = joined => { $('join-card').hidden = joined; $('report-card').hidden = !joined; $('history-card').hidden = !joined; if (!joined) { $('question-card').hidden = true; $('feedback-card').hidden = true; } };
  $('leave').onclick = () => { refreshGeneration++; credentials = null; retry = null; save('v2m-unit', null); showJoined(false); error(''); };
  $('join-form').onsubmit = async e => {
    e.preventDefault(); const button = e.submitter; button.disabled = true;
    try {
      credentials = await api('/api/join', { method: 'POST', body: { mission: $('mission-select').value, invite: $('join-code').value.trim(), callsign: $('callsign').value, device, language: $('language').value } });
      save('v2m-unit', credentials); save('v2m-callsign', credentials.callsign); $('join-error').textContent = ''; error(''); await refresh();
    } catch (err) { $('join-error').textContent = err.message; } finally { button.disabled = false; }
  };
  async function send(payload) {
    if (!credentials || submitting) return;
    const sendingToken = credentials.token;
    refreshGeneration++;
    submitting = true; retry = payload; $('send-report').disabled = true; $('retry').hidden = true;
    try {
      await api('/api/reports', { method: 'POST', token: sendingToken, body: payload });
      if (credentials?.token !== sendingToken) return;
      $('report-text').value = ''; save('v2m-draft', ''); retry = null; error(''); await refresh();
    } catch (err) { if (credentials?.token === sendingToken) { error(`${err.message} Your report is kept. Tap Retry to send it again.`); $('retry').hidden = false; } }
    finally { submitting = false; $('send-report').disabled = false; }
  }
  $('report-form').onsubmit = e => { e.preventDefault(); const text = $('report-text').value.trim(); if (text) void send({ text, language: $('language').value, requestId: uniqueId() }); };
  $('retry').onclick = () => { if (retry) void send(retry); };
  async function answer(report, choice) {
    for (const b of $('choices').querySelectorAll('button')) b.disabled = true;
    try { await api('/api/answers', { method: 'POST', token: credentials.token, body: { report, choice } }); error(''); await refresh(); }
    catch (err) { error(err.message); for (const b of $('choices').querySelectorAll('button')) b.disabled = false; }
  }
  async function refresh() {
    const generation = ++refreshGeneration;
    if (!credentials) {
      showJoined(false); const missions = (await api('/api/missions')).filter(m => !m.ended);
      if (generation !== refreshGeneration) return;
      options($('mission-select'), missions, query.get('mission') || $('mission-select').value);
      if (!missions.length) $('join-error').textContent = 'No open missions. Ask the controller to open one.';
      else if ($('join-error').textContent.startsWith('No open')) $('join-error').textContent = '';
      connection(true); if (networkError) { error(''); networkError = false; } return;
    }
    let state; const requestToken = credentials.token;
    try { state = await api('/api/unit', { token: requestToken }); }
    catch (err) {
      if (credentials?.token !== requestToken || generation !== refreshGeneration) return;
      if (err.status === 401) { credentials = null; save('v2m-unit', null); showJoined(false); }
      throw err;
    }
    if (credentials?.token !== requestToken || generation !== refreshGeneration) return;
    showJoined(true); connection(true, state.mission.ended ? 'Mission ended' : 'Connected');
    if (networkError) { error(''); networkError = false; }
    $('identity').textContent = state.callsign;
    $('mission-summary').textContent = `${state.mission.name} · ${state.mission.area === 'kyiv' ? 'Kyiv' : 'Vincennes'}`;
    $('send-report').disabled = submitting || !!state.mission.ended;
    $('report-text').disabled = !!state.mission.ended;
    if (state.mission.ended) error('This mission has ended. Tap Leave to join another.');
    if (state.controllerError) error(state.controllerError);
    const r = state.report, message = description(r, state.position);
    if (retry && r?.requestId === retry.requestId && r.status !== 'error') { retry = null; $('retry').hidden = true; error(''); }
    $('feedback-card').hidden = false; $('feedback-status').textContent = r?.status || 'Ready';
    $('feedback-status').className = `badge ${r?.status === 'error' ? 'bad' : 'ok'}`;
    $('feedback-text').textContent = message; $('transcript').textContent = r?.text || ''; $('transcript').hidden = !r;
    $('last-position').textContent = state.position ? `${state.position.estimated ? '≈ ' : ''}${state.position.label} · ±${Math.round(state.position.radius_m)} m · ${time(state.positionTs)}` : 'No position yet. Start by naming a place.';
    if (r?.status === 'error' && !retry) { retry = { text: r.text, language: r.language, requestId: uniqueId() }; $('retry').hidden = false; }
    const feedbackId = `${r?.id}:${r?.status}`;
    if (lastFeedback !== feedbackId && r && !['queued', 'processing'].includes(r.status) && $('speak').checked && 'speechSynthesis' in window) {
      speechSynthesis.cancel(); const speech = new SpeechSynthesisUtterance(message); speech.lang = { en: 'en-GB', fr: 'fr-FR', uk: 'uk-UA' }[r.language]; speechSynthesis.speak(speech);
    }
    lastFeedback = feedbackId;
    const pending = state.pending;
    $('question-card').hidden = !pending || !!state.mission.ended;
    if (pending && $('choices').dataset.report !== pending.id) {
      $('choices').dataset.report = pending.id; $('question').textContent = pending.resolution.question;
      const buttons = pending.resolution.candidates.map((c, i) => {
        const b = node('button', `${i + 1}. ${c.name}`); b.append(node('small', `${c.town ? `${c.town} · ` : ''}${c.category.replaceAll('_', ' ')} · ${c.distance_m} m from the reference point`)); b.onclick = () => void answer(pending.id, c.id); return b;
      });
      const none = node('button', 'None of these'); none.onclick = () => void answer(pending.id, null); buttons.push(none); $('choices').replaceChildren(...buttons);
    }
    if (!pending) $('choices').dataset.report = '';
    $('history').replaceChildren(...(state.history ?? (r ? [r] : [])).map(report => feedItem(report, report.id === r?.id ? state.position : null)));
  }
  async function tick() { try { await refresh(); } catch (err) { networkError = true; connection(false); error(err.message || 'Connection lost. Your draft is kept.'); } finally { setTimeout(tick, 1200); } }
  await tick();
}

async function controller() {
  const map = new MissionMap($('map'));
  let selected = '', live = true, replayAt = null, playing = false, lastPlay = 0, mission, area = '', generation = 0;
  let addresses = [], latestEnd = Date.now();
  $('zoom-in').onclick = () => map.zoom(1.5); $('zoom-out').onclick = () => map.zoom(1 / 1.5); $('fit-map').onclick = () => map.reset();
  $('new-mission').onclick = () => $('mission-dialog').showModal(); $('cancel-mission').onclick = () => $('mission-dialog').close();
  $('mission-select').onchange = () => { selected = $('mission-select').value; live = true; playing = false; area = ''; generation++; void refresh(); };
  let searchTimer;
  $('start-query').oninput = () => {
    clearTimeout(searchTimer); const q = $('start-query').value, a = $('area').value;
    searchTimer = setTimeout(async () => {
      try { const places = await api(`/api/places?area=${a}&q=${encodeURIComponent(q)}`); if ($('area').value !== a || $('start-query').value !== q) return;
        const none = node('option', 'No starting position'); none.value = '';
        $('start-place').replaceChildren(none, ...places.map(p => { const option = node('option', `${p.name}${p.town ? ` · ${p.town}` : ''} (${p.category})`); option.value = p.id; return option; }));
      } catch (err) { $('mission-error').textContent = err.message; }
    }, 250);
  };
  $('area').onchange = () => { $('start-query').value = ''; $('start-place').replaceChildren(new Option('No starting position', '')); };
  $('mission-form').onsubmit = async e => {
    e.preventDefault(); e.submitter.disabled = true;
    try { const result = await api('/api/missions', { method: 'POST', body: { name: $('mission-name').value, area: $('area').value, start: $('start-place').value || null } });
      selected = result.id; live = true; playing = false; generation++; $('mission-dialog').close(); $('mission-form').reset(); $('mission-error').textContent = ''; await refresh();
    } catch (err) { $('mission-error').textContent = err.message; } finally { e.submitter.disabled = false; }
  };
  $('end-mission').onclick = async () => {
    if (!selected || !confirm('End this mission? Phones will stop reporting. Its history will remain available.')) return;
    try { await api(`/api/missions/${encodeURIComponent(selected)}/end`, { method: 'POST', body: {} }); await refresh(); } catch (err) { error(err.message); }
  };
  $('copy-invite').onclick = async () => {
    const base = addresses[0] || `${location.origin}/phone`;
    const url = `${base}?mission=${encodeURIComponent(selected)}&invite=${encodeURIComponent(mission.invite)}`;
    try { await navigator.clipboard.writeText(url); $('copy-invite').textContent = 'Copied'; }
    catch { prompt('Copy this phone link:', url); }
  };
  $('timeline').oninput = () => { live = false; playing = false; replayAt = Number($('timeline').value); generation++; void refresh(); };
  $('live').onclick = () => { live = true; playing = false; replayAt = null; generation++; void refresh(); };
  $('play').onclick = () => { if (!mission) return; if (live || replayAt >= latestEnd) replayAt = mission.opened; live = false; playing = !playing; lastPlay = Date.now(); generation++; void refresh(); };
  async function health() {
    try { const h = await api('/api/health'); addresses = h.addresses; $('phone-address').textContent = addresses.join('\n') || `${location.origin}/phone (USB forwarding or local use)`;
      $('model-status').textContent = `${h.model} · ${h.message}`; $('runtime-error').textContent = h.controllerError || ''; }
    catch (err) { $('model-status').textContent = err.message; }
    finally { setTimeout(health, 10000); }
  }
  async function refresh() {
    const current = ++generation;
    const missions = await api('/api/missions');
    if (current !== generation) return;
    if (!selected || !missions.some(m => m.id === selected)) selected = missions.find(m => !m.ended)?.id || missions[0]?.id || '';
    options($('mission-select'), missions, selected); $('mission-select').value = selected;
    connection(true); error('');
    if (!selected) { $('end-mission').disabled = true; $('invite-card').hidden = true; map.update(null); return; }
    const meta = missions.find(m => m.id === selected); latestEnd = meta.ended || Date.now();
    if (playing) { const now = Date.now(); replayAt = Math.min(latestEnd, replayAt + (now - lastPlay) * Number($('speed').value)); lastPlay = now; if (replayAt >= latestEnd) playing = false; }
    const data = await api(`/api/state?mission=${encodeURIComponent(selected)}${live ? '' : `&at=${replayAt}`}`);
    if (current !== generation) return;
    mission = data;
    if (area !== data.area) { const features = await api(`/api/map?area=${data.area}`); if (current !== generation) return; area = data.area; map.setData(area, features); }
    map.update(data); $('map-title').textContent = area === 'kyiv' ? 'Kyiv' : 'Vincennes';
    $('map-empty').hidden = data.units.some(u => u.position || u.pending);
    $('map-empty').textContent = data.units.length ? 'Waiting for the first location report.' : 'Invite a phone to join this mission.';
    $('mission-summary').textContent = `${data.id} · ${meta.ended ? 'Ended' : 'Open'} · ${time(data.opened)}`;
    $('end-mission').disabled = !!meta.ended; $('invite-card').hidden = !!meta.ended || !live; $('invite').textContent = data.invite;
    $('unit-count').textContent = data.units.length;
    $('units').replaceChildren(...data.units.map(u => {
      const b = node('button', u.callsign, `unit ${u.pending ? 'pending' : ''}`); b.style.setProperty('--unit-color', unitColor(u.callsign));
      b.append(node('small', u.pending ? 'Awaiting an answer' : u.position ? `${u.position.estimated ? '≈ ' : ''}${u.position.label} · ±${Math.round(u.position.radius_m)} m` : 'Joined · no position'), node('small', time(u.positionTs)));
      b.onclick = () => map.focus(u.position); return b;
    }));
    const unitByName = Object.fromEntries(data.units.map(u => [u.callsign, u]));
    $('feed').replaceChildren(...data.reports.map(r => { const item = feedItem(r, unitByName[r.callsign]?.latestReport === r.id ? unitByName[r.callsign].position : null);
      if (r.status === 'ambiguous' && unitByName[r.callsign]?.pending !== r.id) item.append(node('small', 'This question is no longer awaiting an answer.'));
      item.onclick = () => map.focus(r.resolution?.pin ? { ...r.resolution.pin, radius_m: r.resolution.radius_m } : null); return item;
    }));
    $('timeline').min = data.opened; $('timeline').max = latestEnd; $('timeline').value = live ? latestEnd : replayAt;
    $('replay-label').textContent = live ? 'Live' : `Replay · ${time(replayAt)}`; $('play').textContent = playing ? 'Pause' : 'Play replay';
    $('export').href = `/api/export?mission=${encodeURIComponent(selected)}`;
  }
  async function tick() { try { await refresh(); } catch (err) { connection(false); error(err.message); } finally { setTimeout(tick, playing ? 250 : 1500); } }
  void health(); await tick();
}
if (document.body.dataset.page === 'phone') void phone(); else void controller();
