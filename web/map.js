const NS = 'http://www.w3.org/2000/svg';
const boxes = { vincennes: [2.41, 48.835, 2.46, 48.856], kyiv: [30.485, 50.428, 30.565, 50.472] };
export const unitColor = name => {
  let hash = 0; for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ['#b34618', '#1768a1', '#26764e', '#914caa', '#a42f60', '#6f6109'][Math.abs(hash) % 6];
};
function svg(tag, attributes = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}
export class MissionMap {
  constructor(el) {
    this.el = el; this.features = []; this.mission = null; this.area = 'vincennes'; this.reset();
    el.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1 / 1.2 : 1.2); }, { passive: false });
    let drag;
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, view: [...this.view] }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const size = Math.max(drag.view[2] / el.clientWidth, drag.view[3] / el.clientHeight);
      this.view[0] = drag.view[0] - (e.clientX - drag.x) * size;
      this.view[1] = drag.view[1] - (e.clientY - drag.y) * size;
      this.render();
    });
    el.addEventListener('pointerup', () => { drag = null; });
    el.addEventListener('pointercancel', () => { drag = null; });
    el.addEventListener('keydown', e => { if (e.key === '+' || e.key === '=') this.zoom(1.5); if (e.key === '-') this.zoom(1 / 1.5); });
    new ResizeObserver(() => this.render()).observe(el);
  }
  point({ lat, lon }) { return [(lon - this.lon) * this.kx, (this.lat - lat) * 111320]; }
  setData(area, features) { const changed = this.area !== area; this.area = area; this.features = features; if (changed) this.reset(); this.render(); }
  reset() {
    const [w, s, e, n] = boxes[this.area]; this.lon = (w + e) / 2; this.lat = (s + n) / 2; this.kx = 111320 * Math.cos(this.lat * Math.PI / 180);
    const width = (e - w) * this.kx, height = (n - s) * 111320;
    this.base = [-width / 2, -height / 2, width, height]; this.view = [...this.base]; this.render();
  }
  zoom(factor) {
    const width = this.view[2] / factor;
    if (width < this.base[2] / 24 || width > this.base[2] * 3) return;
    const h = this.view[3] / factor;
    this.view = [this.view[0] + (this.view[2] - width) / 2, this.view[1] + (this.view[3] - h) / 2, width, h]; this.render();
  }
  focus(position) { if (!position) return; const [x, y] = this.point(position); const size = Math.max(600, (position.radius_m ?? 80) * 4); this.view = [x - size / 2, y - size / 2, size, size]; this.render(); }
  update(mission) { this.mission = mission; this.render(); }
  render() {
    if (!this.el || !this.view) return;
    this.el.setAttribute('viewBox', this.view.join(' '));
    const scale = Math.max(this.view[2] / (this.el.clientWidth || 800), this.view[3] / (this.el.clientHeight || 500));
    const roads = svg('g', { fill: 'none', stroke: '#d4cec0', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' });
    const labels = svg('g', { fill: '#56635f', 'font-size': 11 * scale, 'font-family': 'system-ui' });
    const line = points => points.map(([lon, lat], i) => `${i ? 'L' : 'M'}${this.point({ lon, lat }).join(',')}`).join(' ');
    let streets = 0, places = 0;
    const visible = (x, y) => x > this.view[0] && x < this.view[0] + this.view[2] && y > this.view[1] && y < this.view[1] + this.view[3];
    for (const f of this.features) {
      if (f.lines) for (const points of f.lines) roads.append(svg('path', { d: line(points), 'vector-effect': 'non-scaling-stroke' }));
      const [x, y] = this.point(f);
      if (!visible(x, y)) continue;
      if (f.category === 'street') {
        if (streets++ % 9 === 0) labels.append(svg('text', { x, y, fill: '#87918b', 'font-size': 9 * scale }, f.name));
      } else if (places++ < 120 && (f.category !== 'other' || scale < 2)) {
        labels.append(svg('circle', { cx: x, cy: y, r: 2.5 * scale, fill: f.category === 'park' ? '#87a57d' : '#9bacae' }));
        labels.append(svg('text', { x: x + 5 * scale, y: y - 4 * scale }, f.name));
      }
    }
    const units = svg('g');
    for (const u of this.mission?.units ?? []) {
      const color = unitColor(u.callsign), pos = u.position;
      if (pos) {
        const [x, y] = this.point(pos);
        const group = svg('g', { opacity: !this.mission.ended && Date.now() - (u.positionTs ?? u.joined) > 180000 ? .45 : 1 });
        const track = [...u.trail, ...(u.positionTs ? [pos] : [])];
        if (track.length > 1) group.append(svg('path', { d: line(track.map(p => [p.lon, p.lat])), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke' }));
        group.append(svg('circle', { cx: x, cy: y, r: pos.radius_m ?? 80, fill: color, 'fill-opacity': .1, stroke: color, 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
        if (pos.heading_to) {
          const [tx, ty] = this.point(pos.heading_to), angle = Math.atan2(ty - y, tx - x), back = angle + Math.PI;
          group.append(svg('path', { d: `M${x},${y} L${tx},${ty} M${tx + Math.cos(back - .5) * 12 * scale},${ty + Math.sin(back - .5) * 12 * scale} L${tx},${ty} L${tx + Math.cos(back + .5) * 12 * scale},${ty + Math.sin(back + .5) * 12 * scale}`, fill: 'none', stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
        }
        group.append(svg('circle', { cx: x, cy: y, r: 6 * scale, fill: color, stroke: '#fff', 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
        group.append(svg('text', { x: x + 10 * scale, y: y - 8 * scale, fill: color, 'font-size': 13 * scale, 'font-weight': 700, 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 * scale }, `${u.callsign}${pos.estimated ? ' ≈' : ''}`));
        if (u.positionTs) group.append(svg('text', { x: x + 10 * scale, y: y + 9 * scale, fill: color, 'font-size': 10 * scale, 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 3 * scale }, new Date(u.positionTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })));
        units.append(group);
      }
      const report = this.mission.reports.find(r => r.id === u.pending);
      for (const [i, c] of (report?.resolution?.candidates ?? []).entries()) {
        const [x, y] = this.point(c);
        const marker = svg('g'); marker.append(svg('title', {}, `${u.callsign}: ${c.name}`));
        marker.append(svg('circle', { cx: x, cy: y, r: 11 * scale, fill: '#fff4cf', stroke: color, 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }));
        marker.append(svg('text', { x, y: y + 4 * scale, 'text-anchor': 'middle', 'font-size': 12 * scale, 'font-weight': 700, fill: color }, i + 1)); units.append(marker);
      }
    }
    this.el.replaceChildren(roads, labels, units);
  }
}
