const R = 6371000;
const toRad = Math.PI / 180;
const toDeg = 180 / Math.PI;
export function distanceM(a, b) {
    const dLat = (b.lat - a.lat) * toRad;
    const dLon = (b.lon - a.lon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
/** Initial bearing a → b in degrees, 0 = north, clockwise. */
export function bearingDeg(a, b) {
    const φ1 = a.lat * toRad;
    const φ2 = b.lat * toRad;
    const Δλ = (b.lon - a.lon) * toRad;
    const y = Math.sin(Δλ) * Math.cos(φ2);
    const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    return (Math.atan2(y, x) * toDeg + 360) % 360;
}
export function destination(p, bearing, distM) {
    const δ = distM / R;
    const θ = bearing * toRad;
    const φ1 = p.lat * toRad;
    const λ1 = p.lon * toRad;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    return { lat: round6(φ2 * toDeg), lon: round6(λ2 * toDeg) };
}
export function round6(x) {
    return Math.round(x * 1e6) / 1e6;
}
/** Nearest point to p on a set of polylines ([lon, lat] pairs), using a local flat projection (fine at city scale). */
export function nearestPointOnLines(p, lines) {
    const kx = Math.cos(p.lat * toRad);
    let best = { lat: lines[0][0][1], lon: lines[0][0][0] };
    let bestD = Infinity;
    for (const line of lines) {
        for (let i = 0; i < line.length; i++) {
            const [ax, ay] = [line[i][0] * kx, line[i][1]];
            const [bx, by] = i + 1 < line.length ? [line[i + 1][0] * kx, line[i + 1][1]] : [ax, ay];
            const px = p.lon * kx;
            const py = p.lat;
            const dx = bx - ax;
            const dy = by - ay;
            const len2 = dx * dx + dy * dy;
            const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
            const qx = ax + t * dx;
            const qy = ay + t * dy;
            const d = (px - qx) ** 2 + (py - qy) ** 2;
            if (d < bestD) {
                bestD = d;
                best = { lat: qy, lon: qx / kx };
            }
        }
    }
    return { lat: round6(best.lat), lon: round6(best.lon) };
}
/** Half the diagonal of a [minLon, minLat, maxLon, maxLat] box, metres. */
export function bboxHalfDiagonalM(b) {
    return distanceM({ lat: b[1], lon: b[0] }, { lat: b[3], lon: b[2] }) / 2;
}
/** From the centre of a box to its edge along a compass bearing, metres (N/S is half the height, E/W half the width). */
export function bboxHalfExtentM(b, bearing) {
    const h = distanceM({ lat: b[1], lon: b[0] }, { lat: b[3], lon: b[0] }) / 2;
    const w = distanceM({ lat: b[1], lon: b[0] }, { lat: b[1], lon: b[2] }) / 2;
    const c = Math.abs(Math.cos(bearing * toRad));
    const s = Math.abs(Math.sin(bearing * toRad));
    return Math.min(c > 1e-9 ? h / c : Infinity, s > 1e-9 ? w / s : Infinity);
}
