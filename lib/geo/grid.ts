/**
 * A grid reference said out loud [223]: "grid 31U DQ 586 101", "Delta Quebec five eight six one
 * zero one" as the transcriber writes it ("DQ 586 101"), or "grille 586 101" with the square left
 * out, the way soldiers give a grid inside their own area. MGRS, the NATO grid. Read in code, with
 * no model, so a grid places the speaker (or a track) to the cell it names.
 *
 * What may be left out is taken from the area: the zone ("31U"), and with a grid word, the 100 km
 * square ("DQ"): the square nearest the area's centre.
 */
import { bearingDeg, distanceM, type LatLon } from "./geo";

export interface GridRead {
  pin: LatLon;
  /** Half the cell's diagonal: a 6-figure grid is a 100 m cell, about 71 m. */
  radius_m: number;
  /** The grid as read, written out: "31U DQ 586 101". */
  text: string;
  /** Kilometres from the area's centre. */
  from_centre_km: number;
}

/** Farther than this from the area, the grid is more likely misheard than meant. */
export const GRID_MAX_KM = 60;

const NATO: Record<string, string> = {
  alpha: "A", alfa: "A", bravo: "B", charlie: "C", delta: "D", echo: "E", foxtrot: "F", golf: "G", hotel: "H", india: "I",
  juliet: "J", juliett: "J", kilo: "K", lima: "L", mike: "M", november: "N", oscar: "O", papa: "P", quebec: "Q", romeo: "R",
  sierra: "S", tango: "T", uniform: "U", victor: "V", whiskey: "W", whisky: "W", xray: "X", yankee: "Y", zulu: "Z",
  // As a Ukrainian or Russian transcript writes them: "Дельта Квебек" [226].
  альфа: "A", браво: "B", чарлі: "C", чарли: "C", дельта: "D", ехо: "E", эхо: "E", фокстрот: "F", гольф: "G", готель: "H", отель: "H",
  індія: "I", индия: "I", джульєтта: "J", джульєта: "J", джульетта: "J", кіло: "K", кило: "K", ліма: "L", лима: "L", майк: "M",
  новембер: "N", оскар: "O", папа: "P", квебек: "Q", ромео: "R", сієрра: "S", сьєрра: "S", сьерра: "S", танго: "T", юніформ: "U",
  юниформ: "U", віктор: "V", виктор: "V", віскі: "W", виски: "W", іксрей: "X", иксрей: "X", янкі: "Y", янки: "Y", зулу: "Z",
};
/** Lower case with Latin accents dropped: a French transcript writes "Delta Québec", "zéro". */
const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC");
/**
 * Digits said one by one, as on a radio: "five eight six one zero one", "niner", "oh" for zero.
 * Only a run with a square or a grid word is read as a grid, so "two vehicles" stays a count.
 */
const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", niner: "9",
  un: "1", une: "1", deux: "2", trois: "3", quatre: "4", cinq: "5", sept: "7", huit: "8", neuf: "9",
  нуль: "0", один: "1", одна: "1", два: "2", дві: "2", три: "3", чотири: "4", пять: "5", шість: "6", сім: "7", вісім: "8", девять: "9",
};

/** Words that announce a grid. After one, lower-case letters count ("grid dq 586 101", typed). */
const GRID_WORDS = new Set(["grid", "mgrs", "grille", "carroyage", "квадрат", "сітка", "сітці", "координати"]);

// ---------- UTM (WGS84), Krüger series ----------
const A = 6378137;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F);
const EP2 = E2 / (1 - E2);
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function meridian(phi: number): number {
  const e4 = E2 * E2;
  const e6 = e4 * E2;
  return A * ((1 - E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * phi - ((3 * E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * phi) + ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * phi) - ((35 * e6) / 3072) * Math.sin(6 * phi));
}

export function toUtm(p: LatLon, zone = Math.floor((p.lon + 180) / 6) + 1): { zone: number; easting: number; northing: number } {
  const phi = rad(p.lat);
  const lam0 = rad((zone - 1) * 6 - 180 + 3);
  const n = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const t = Math.tan(phi) ** 2;
  const c = EP2 * Math.cos(phi) ** 2;
  const a = Math.cos(phi) * (rad(p.lon) - lam0);
  const m = meridian(phi);
  const easting = K0 * n * (a + ((1 - t + c) * a ** 3) / 6 + ((5 - 18 * t + t * t + 72 * c - 58 * EP2) * a ** 5) / 120) + 500000;
  let northing = K0 * (m + n * Math.tan(phi) * (a * a / 2 + ((5 - t + 9 * c + 4 * c * c) * a ** 4) / 24 + ((61 - 58 * t + t * t + 600 * c - 330 * EP2) * a ** 6) / 720));
  if (p.lat < 0) northing += 10_000_000;
  return { zone, easting, northing };
}

export function fromUtm(zone: number, easting: number, northing: number, south = false): LatLon {
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const m = (south ? northing - 10_000_000 : northing) / K0;
  const mu = m / (A * (1 - E2 / 4 - (3 * E2 * E2) / 64 - (5 * E2 ** 3) / 256));
  const phi1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const n1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = EP2 * Math.cos(phi1) ** 2;
  const r1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = (easting - 500000) / (n1 * K0);
  const lat = phi1 - ((n1 * Math.tan(phi1)) / r1) * (d * d / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4) / 24 + ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6) / 720);
  const lon = (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5) / 120) / Math.cos(phi1);
  return { lat: deg(lat), lon: (zone - 1) * 6 - 180 + 3 + deg(lon) };
}

// ---------- MGRS letters ----------
const COLS = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"];
const ROWS = "ABCDEFGHJKLMNPQRSTUV";
const BANDS = "CDEFGHJKLMNPQRSTUVWX";

/** The 100 km square letters of a UTM point: "DQ". */
function squareOf(zone: number, easting: number, northing: number): string {
  const col = COLS[(zone - 1) % 3][Math.floor(easting / 100000) - 1];
  const row = ROWS[(Math.floor(northing / 100000) + (zone % 2 === 0 ? 5 : 0)) % 20];
  return col + row;
}

/** Where a square starts, in metres; the northing is known only modulo 2000 km. */
function squareStart(zone: number, square: string): { e: number; n: number } | null {
  const ci = COLS[(zone - 1) % 3].indexOf(square[0]);
  const ri = ROWS.indexOf(square[1]);
  if (ci < 0 || ri < 0) return null;
  return { e: (ci + 1) * 100000, n: (((ri - (zone % 2 === 0 ? 5 : 0)) % 20) + 20) % 20 * 100000 };
}

const distKm = (a: LatLon, b: LatLon) => {
  const x = rad(b.lon - a.lon) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.sqrt(x * x + y * y) * 6371;
};

/** The point a grid names, the 2000 km repeat of the row letters settled by the area's centre. */
function place(zone: number, square: string, digits: string, centre: LatLon): { pin: LatLon; cell: number } | null {
  const start = squareStart(zone, square);
  if (!start || digits.length % 2 || digits.length < 2 || digits.length > 10) return null;
  const k = digits.length / 2;
  const cell = 10 ** (5 - k);
  const e = start.e + Number(digits.slice(0, k)) * cell + cell / 2;
  let best: LatLon | null = null;
  for (let i = 0; i < 5; i++) {
    const p = fromUtm(zone, e, start.n + i * 2_000_000 + Number(digits.slice(k)) * cell + cell / 2);
    if (!best || Math.abs(p.lat - centre.lat) < Math.abs(best.lat - centre.lat)) best = p;
  }
  return best && { pin: best, cell };
}

/** Words and numbers as the transcriber wrote them, with spelled letters made letters: "Delta" → "D". */
function tokens(text: string): { t: string; announced: boolean }[] {
  const out: { t: string; announced: boolean }[] = [];
  let announced = false;
  // "п'ять", "дев'ять": the apostrophe inside a Cyrillic word is part of it.
  // "X-ray" and "ікс-рей" are one spelled letter.
  const joined = text
    .normalize("NFC")
    .replace(/([\u0400-\u04ff])[\u2019\u02bc'`]([\u0400-\u04ff])/g, "$1$2")
    .replace(/\b(x)[-\s]?(ray)\b/gi, "$1$2")
    .replace(/(ікс|икс)[-\s]?(рей)/giu, "$1$2");
  for (const raw of joined.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    // Cyrillic keeps its letters: "й" and "ї" are not accented forms here.
    const low = /[\u0400-\u04ff]/.test(raw) ? raw.toLowerCase() : plain(raw);
    if (DIGIT_WORDS[low]) {
      out.push({ t: DIGIT_WORDS[low], announced });
      continue;
    }
    if (GRID_WORDS.has(low)) {
      announced = true;
      continue;
    }
    // "31UDQ586101" → "31", "UDQ", "586101".
    for (const part of raw.match(/\p{N}+|\p{L}+/gu) ?? []) out.push({ t: NATO[/[\u0400-\u04ff]/.test(part) ? part.toLowerCase() : plain(part)] ?? part, announced });
  }
  return out;
}

/**
 * The first grid reference in the words, or null. A run of grid-like pieces is read: numbers,
 * capital letters ("DQ", "31U") or spelled letters, and lower-case letters after a grid word.
 */
export function readGrid(text: string, centre: LatLon): GridRead | null {
  const toks = tokens(text);
  const gridish = (x: { t: string; announced: boolean }) => /^\p{N}+$/u.test(x.t) || (/^[A-Z]{1,3}$/.test(x.t)) || (x.announced && /^[a-z]{1,3}$/.test(x.t));
  const home = toUtm(centre);
  for (let i = 0; i < toks.length; i++) {
    if (!gridish(toks[i])) continue;
    let j = i;
    while (j < toks.length && gridish(toks[j])) j++;
    const run = toks.slice(i, j);
    i = j;
    // The longest piece of the run that reads as a grid: "grid at DQ 586 101 by the hotel" is "DQ 586 101".
    for (let a = 0; a < run.length; a++) {
      for (let b = run.length; b > a; b--) {
        const got = gridFrom(run.slice(a, b), centre, home);
        if (got) return got;
      }
    }
  }
  return null;
}

function gridFrom(run: { t: string; announced: boolean }[], centre: LatLon, home: { zone: number; easting: number; northing: number }): GridRead | null {
  const s = run.map((x) => x.t.toUpperCase()).join("");
  const announced = run.some((x) => x.announced);
  const m = /^(?:(\d{1,2})([C-HJ-NP-X]))?([A-HJ-NP-Z][A-HJ-NP-V])?(\d{2,10})$/.exec(s);
  if (!m) return null;
  const [, zoneSaid, band, squareSaid, digits] = m;
  if (!squareSaid && !announced) return null; // bare numbers are distances and counts, not a grid
  if (zoneSaid && !squareSaid) return null;
  if (band && !BANDS.includes(band)) return null;
  const zone = zoneSaid ? Number(zoneSaid) : home.zone;
  if (zone < 1 || zone > 60) return null;
  // The square left out: of the squares around the area's centre, the one that puts the point nearest it.
  const squares = squareSaid
    ? [squareSaid]
    : [-1, 0, 1].flatMap((de) => [-1, 0, 1].map((dn) => squareOf(zone, home.easting + de * 100000, home.northing + dn * 100000)));
  let best: { pin: LatLon; cell: number; square: string; km: number } | null = null;
  for (const sq of squares) {
    const p = place(zone, sq, digits, centre);
    if (!p) continue;
    const km = distKm(p.pin, centre);
    if (!best || km < best.km) best = { ...p, square: sq, km };
  }
  if (!best) return null;
  const k = digits.length / 2;
  return {
    pin: { lat: Number(best.pin.lat.toFixed(6)), lon: Number(best.pin.lon.toFixed(6)) },
    radius_m: Math.max(5, Math.round(best.cell * Math.SQRT1_2)),
    text: `${zoneSaid ? `${zoneSaid}${band ?? ""} ` : ""}${best.square} ${digits.slice(0, k)} ${digits.slice(k)}`,
    from_centre_km: Math.round(best.km * 10) / 10,
  };
}

/**
 * The grid of a point, the other way round [231]: "31U DQ 5860 1012" (8 figures, a 10 m cell).
 * For the map's readout, so an operator can read a grid off the map and say it.
 */
export function toGrid(p: LatLon, figures: 6 | 8 | 10 = 8): string {
  const u = toUtm(p);
  const band = BANDS[Math.min(19, Math.max(0, Math.floor((p.lat + 80) / 8)))];
  const k = figures / 2;
  const cell = 10 ** (5 - k);
  const e = String(Math.floor((u.easting % 100000) / cell)).padStart(k, "0");
  const n = String(Math.floor((u.northing % 100000) / cell)).padStart(k, "0");
  return `${u.zone}${band} ${squareOf(u.zone, u.easting, u.northing)} ${e} ${n}`;
}

/** Box of the map on screen. */
export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** The spacing of grid lines for a zoom, in metres: 1 km close in, 10 km further out, none beyond [232]. */
export function gridSpacing(zoom: number): 1000 | 10000 | null {
  if (zoom >= 12) return 1000;
  if (zoom >= 9) return 10000;
  return null;
}

/**
 * Where a grid's figures go [233]: the eastings in a row at latitude `row`, the northings in a
 * column at longitude `column`, and only those that fall `inside` the box. A map works these out
 * from the part of the screen that nothing covers.
 */
export interface GridLabels {
  row: number;
  column: number;
  inside: Bounds;
}

/**
 * MGRS grid lines over a box, in the UTM zone of `centre` [232]: lines of equal easting and
 * northing every `spacing` metres, each a few points long so it bends with the projection, and
 * label points with the line's figures ("58", "10"). By default the eastings go along the
 * bottom and the northings up the left, as on a printed map. GeoJSON, for a map layer. At most
 * 60 lines a way.
 */
export function gridLines(b: Bounds, centre: LatLon, spacing: 1000 | 10000, labels?: GridLabels): GeoJSON.FeatureCollection {
  const zone = toUtm(centre).zone;
  const corners = [
    toUtm({ lat: b.south, lon: b.west }, zone),
    toUtm({ lat: b.south, lon: b.east }, zone),
    toUtm({ lat: b.north, lon: b.west }, zone),
    toUtm({ lat: b.north, lon: b.east }, zone),
  ];
  const minE = Math.floor(Math.min(...corners.map((c) => c.easting)) / spacing) * spacing;
  const maxE = Math.ceil(Math.max(...corners.map((c) => c.easting)) / spacing) * spacing;
  const minN = Math.floor(Math.min(...corners.map((c) => c.northing)) / spacing) * spacing;
  const maxN = Math.ceil(Math.max(...corners.map((c) => c.northing)) / spacing) * spacing;
  const features: GeoJSON.Feature[] = [];
  if ((maxE - minE) / spacing > 60 || (maxN - minN) / spacing > 60) return { type: "FeatureCollection", features };
  const pt = (e: number, n: number): [number, number] => {
    const p = fromUtm(zone, e, n);
    return [p.lon, p.lat];
  };
  /** The figures a line is read by: kilometres within the 100 km square, "58"; tens of km, "5". */
  const figures = (m: number) => (spacing === 1000 ? String(Math.floor((m % 100000) / 1000)).padStart(2, "0") : String(Math.floor((m % 100000) / 10000)));
  const steps = 8;
  // Labels sit just inside the box when the map gives no place for them: eastings near the bottom, northings near the left.
  const { row, column, inside } = labels ?? { row: b.south + (b.north - b.south) * 0.03, column: b.west + (b.east - b.west) * 0.01, inside: b };
  for (let e = minE; e <= maxE; e += spacing) {
    const coords = Array.from({ length: steps + 1 }, (_, i) => pt(e, minN + ((maxN - minN) * i) / steps));
    const major = e % 100000 === 0;
    features.push({ type: "Feature", properties: { kind: "line", major }, geometry: { type: "LineString", coordinates: coords } });
    const at = toUtm({ lat: row, lon: fromUtm(zone, e, toUtm({ lat: row, lon: inside.west }, zone).northing).lon }, zone);
    const p = fromUtm(zone, e, at.northing);
    if (p.lon > inside.west && p.lon < inside.east) features.push({ type: "Feature", properties: { kind: "label", text: figures(e) }, geometry: { type: "Point", coordinates: [p.lon, row] } });
  }
  for (let n = minN; n <= maxN; n += spacing) {
    const coords = Array.from({ length: steps + 1 }, (_, i) => pt(minE + ((maxE - minE) * i) / steps, n));
    const major = n % 100000 === 0;
    features.push({ type: "Feature", properties: { kind: "line", major }, geometry: { type: "LineString", coordinates: coords } });
    const lat = fromUtm(zone, toUtm({ lat: inside.south, lon: column }, zone).easting, n).lat;
    if (lat > inside.south && lat < inside.north) features.push({ type: "Feature", properties: { kind: "label", text: figures(n) }, geometry: { type: "Point", coordinates: [column, lat] } });
  }
  return { type: "FeatureCollection", features };
}

/**
 * What the ruler says, as a radio report would give it: "300 m · bearing 060° · 1067 mils" [232].
 * The mils come from the exact bearing, not the rounded degrees: a mil is 18 times finer [233].
 */
export function measureText(a: LatLon, b: LatLon): string {
  const d = distanceM(a, b);
  const exact = (bearingDeg(a, b) + 360) % 360;
  const deg = Math.round(exact) % 360;
  const mils = Math.round((exact * 6400) / 360) % 6400;
  const dist = d >= 1000 ? `${(d / 1000).toFixed(2)} km` : `${Math.round(d)} m`;
  return `${dist} · bearing ${String(deg).padStart(3, "0")}° · ${mils} mils`;
}
