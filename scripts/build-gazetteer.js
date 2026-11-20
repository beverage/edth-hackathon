/**
 * Builds data/gazetteer.<area>.json from one Overpass query.
 * Run: npm run gazetteer -- vincennes   (or: kyiv)
 * The running app never calls Overpass or Nominatim; it only reads the committed JSON.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { normalize, transliterateUk } from "../src/geo/normalize.js";
import { AREAS, isAreaId } from "../src/geo/areas.js";
import { groupStreetPieces, joinSameTown } from "../src/geo/streets.js";
const areaArg = process.argv[2] ?? "vincennes";
if (!isAreaId(areaArg)) {
    console.error(`Unknown area "${areaArg}". Known: ${Object.keys(AREAS).join(", ")}`);
    process.exit(1);
}
const AREA = AREAS[areaArg];
const BBOX = AREA.bbox;
const OUT_FILE = `data/gazetteer.${AREA.id}.json`;
const ENDPOINT = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";
const bb = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
const query = `
[out:json][timeout:120];
(
  nwr["railway"~"^(station|halt)$"]["name"](${bb});
  nwr["public_transport"="station"]["name"](${bb});
  nwr["amenity"~"^(place_of_worship|townhall|school|college|university|kindergarten|hospital|clinic|police|post_office|library|theatre|cinema|marketplace|fire_station|arts_centre|community_centre)$"]["name"](${bb});
  nwr["office"="government"]["name"](${bb});
  nwr["historic"]["name"](${bb});
  nwr["tourism"~"^(museum|attraction|artwork|viewpoint|gallery)$"]["name"](${bb});
  nwr["leisure"~"^(park|garden|stadium|sports_centre)$"]["name"](${bb});
  nwr["landuse"="forest"]["name"](${bb});
  way["bridge"]["name"]["highway"!~"."](${bb});
  way["man_made"="bridge"]["name"](${bb});
  nwr["place"~"^(square|neighbourhood|quarter|locality)$"]["name"](${bb});
)->.poi;
.poi out tags bb;
way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian|service|footway)$"]["name"](${bb})->.streets;
.streets out tags geom;
`;
function categorize(t) {
    const has = (k, re) => (re ? re.test(t[k] ?? "") : k in t);
    if (has("highway"))
        return { category: "street", subtype: t.highway };
    if (has("railway", /^(station|halt)$/) || has("public_transport", /^station$/)) {
        const sub = t.station === "subway" || t.subway === "yes" || /métro|metro/i.test(t.network ?? "") ? "metro" : /RER/i.test(`${t.network ?? ""} ${t.line ?? ""} ${t.route_ref ?? ""}`) ? "rer" : "rail";
        return { category: "metro_station", subtype: sub };
    }
    if (has("amenity", /^place_of_worship$/)) {
        return t.religion === "christian" ? { category: "church", subtype: t.building ?? "church" } : { category: "other", subtype: `place_of_worship:${t.religion ?? "unknown"}` };
    }
    if (has("amenity", /^townhall$/) || (has("office", /^government$/) && /mairie|hôtel de ville|міська рада|міська державна адміністрація/i.test(t.name ?? "")))
        return { category: "town_hall", subtype: "townhall" };
    if (has("historic", /^(castle|fort|manor|palace)$/))
        return { category: "castle", subtype: t.historic };
    if (has("amenity", /^(school|college|university|kindergarten)$/))
        return { category: "school", subtype: t.amenity };
    if (has("amenity", /^(hospital|clinic)$/))
        return { category: "hospital", subtype: t.amenity };
    if (has("amenity", /^police$/))
        return { category: "police", subtype: t.police ?? "police" };
    if (has("leisure", /^(park|garden)$/) || has("landuse", /^forest$/))
        return { category: "park", subtype: t.leisure ?? t.landuse };
    if (has("bridge") || has("man_made", /^bridge$/))
        return { category: "bridge", subtype: "bridge" };
    const sub = t.amenity ?? t.tourism ?? t.historic ?? t.leisure ?? t.place ?? t.office ?? "other";
    return { category: "other", subtype: sub };
}
function namesOf(t) {
    const keys = ["name", "name:uk", "name:fr", "name:en", "int_name", "alt_name", "short_name", "official_name", "old_name", "loc_name", "name:ru"];
    const out = [];
    const add = (v) => {
        const s = (v ?? "").trim();
        if (s && !out.includes(s))
            out.push(s);
    };
    for (const k of keys)
        for (const v of (t[k] ?? "").split(";"))
            add(v);
    // Latin spelling of Ukrainian names, so "Khreshchatyk" matches when OSM has no name:en.
    const ukName = t["name:uk"] ?? t.name;
    if (ukName)
        add(transliterateUk(ukName));
    return out;
}
const r5 = (x) => Math.round(x * 1e5) / 1e5;
function haversine(aLat, aLon, bLat, bLon) {
    const R = 6371000;
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
// Higher wins when duplicates are merged (a station node beats an entrance or a platform relation).
function priority(el) {
    return el.type === "node" ? 3 : el.type === "way" ? 2 : 1;
}
// Busy public servers return 429/502/504; back off and alternate between the main server and a mirror.
// `accept` rejects an answer that parsed but is not usable; that counts as a failed attempt.
async function overpass(q, what, accept = () => null) {
    const endpoints = [ENDPOINT, "https://overpass.private.coffee/api/interpreter"];
    for (let attempt = 0; attempt < 8; attempt++) {
        const url = endpoints[attempt % endpoints.length];
        console.log(`Querying Overpass at ${url} for ${what} (attempt ${attempt + 1}) ...`);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "edth-voice-to-map-gazetteer/0.1" },
                body: new URLSearchParams({ data: q }).toString(),
                signal: AbortSignal.timeout(180_000),
            });
            if (res.ok) {
                const json = (await res.json());
                const problem = accept(json);
                if (!problem)
                    return json;
                console.log(`  unusable answer: ${problem}`);
            }
            else
                console.log(`  ${res.status}: ${(await res.text()).slice(0, 80).replace(/\s+/g, " ")}`);
        }
        catch (e) {
            console.log(`  ${e.message}`);
        }
        await new Promise((r) => setTimeout(r, Math.min(60_000, 2000 * 2 ** attempt)));
    }
    throw new Error("Overpass unavailable after retries; existing data file left untouched");
}
/**
 * The town each point is in: the admin area at `level` (commune, city) that contains it.
 * One query; a marker element before each lookup tells the answers apart.
 */
async function townsOf(points, level) {
    if (!points.length)
        return [];
    const q = "[out:json][timeout:120];\n" +
        points
            .map((p, i) => `make marker n="${i}"; out;\nis_in(${p.lat},${p.lon})->.a; area.a["boundary"="administrative"]["admin_level"="${level}"]; out tags;`)
            .join("\n");
    const read = (json) => {
        const towns = points.map(() => undefined);
        let cur = -1;
        let markers = 0;
        for (const el of json.elements) {
            if (el.type === "marker") {
                cur = Number(el.tags.n);
                markers++;
            }
            else if (cur >= 0 && towns[cur] === undefined)
                towns[cur] = el.tags?.name;
        }
        return { towns, markers };
    };
    // Some mirrors answer without their area index: no markers, or no town at all. Try again elsewhere.
    const json = await overpass(q, `the towns of ${points.length} street groups`, (j) => {
        const { towns, markers } = read(j);
        if (markers !== points.length)
            return `${markers} of ${points.length} lookups answered`;
        return towns.some(Boolean) ? null : "no town found for any street";
    });
    const { towns } = read(json);
    const missing = towns.filter((t) => !t).length;
    if (missing)
        console.log(`  ${missing} street group(s) are in no admin_level=${level} area; they are told apart by distance`);
    return towns;
}
/** The vertex nearest the middle of the pieces' box, so it always lies on the street. */
function onStreetCentre(lines) {
    const pts = lines.flat();
    const minLon = Math.min(...pts.map((p) => p[0]));
    const maxLon = Math.max(...pts.map((p) => p[0]));
    const minLat = Math.min(...pts.map((p) => p[1]));
    const maxLat = Math.max(...pts.map((p) => p[1]));
    const cLon = (minLon + maxLon) / 2;
    const cLat = (minLat + maxLat) / 2;
    let best = pts[0];
    let bestD = Infinity;
    for (const p of pts) {
        const d = (p[0] - cLon) ** 2 + (p[1] - cLat) ** 2;
        if (d < bestD) {
            bestD = d;
            best = p;
        }
    }
    return { lat: best[1], lon: best[0], bbox: [minLon, minLat, maxLon, maxLat] };
}
async function main() {
    const json = await overpass(query, `bbox ${bb}`);
    console.log(`Overpass returned ${json.elements.length} elements`);
    const pois = [];
    const pieces = new Map();
    for (const el of json.elements) {
        const t = el.tags ?? {};
        if (!t.name)
            continue;
        const cat = categorize(t);
        if (!cat)
            continue;
        if (cat.category === "street") {
            if (!el.geometry?.length)
                continue;
            const line = el.geometry.map((p) => [r5(p.lon), r5(p.lat)]);
            const key = normalize(t.name);
            pieces.set(key, [...(pieces.get(key) ?? []), { line, osm_id: el.id, name: t.name, names: namesOf(t), subtype: cat.subtype }]);
            continue;
        }
        let lat = el.lat;
        let lon = el.lon;
        let bbox;
        if (el.bounds) {
            bbox = [r5(el.bounds.minlon), r5(el.bounds.minlat), r5(el.bounds.maxlon), r5(el.bounds.maxlat)];
            lat = (el.bounds.minlat + el.bounds.maxlat) / 2;
            lon = (el.bounds.minlon + el.bounds.maxlon) / 2;
        }
        if (lat == null || lon == null)
            continue;
        pois.push({
            id: `${el.type}/${el.id}`,
            name: t.name,
            names: namesOf(t),
            category: cat.category,
            subtype: cat.subtype,
            lat: r5(lat),
            lon: r5(lon),
            bbox,
            osm_type: el.type,
            osm_id: el.id,
            _prio: priority(el),
        });
    }
    // Streets: pieces of one name are one street when they are close, or close enough and in the
    // same town. Two towns' "rue Gambetta" stay two features, each with its town, so a report naming
    // one is asked back. Only names that split need the town lookup.
    const byName = [...pieces.entries()].map(([key, ps]) => ({
        key,
        groups: groupStreetPieces(ps.map((p) => p.line)).map((g) => g.map((i) => ps[i])),
    }));
    const split = byName.flatMap((n) => (n.groups.length > 1 ? n.groups : []));
    const towns = await townsOf(split.map((g) => onStreetCentre(g.map((p) => p.line))), AREA.townAdminLevel);
    const townOf = new Map(split.map((g, i) => [g, towns[i]]));
    const streets = [];
    for (const { key, groups } of byName) {
        const withTown = groups.map((g) => ({ pieces: g, lines: g.map((p) => p.line), town: townOf.get(g) }));
        const streetsOfName = joinSameTown(withTown).map((ix) => ({
            pieces: ix.flatMap((i) => withTown[i].pieces),
            town: withTown[ix[0]].town,
        }));
        const slug = (s) => normalize(s).replace(/ /g, "-");
        const suffixes = streetsOfName.map((s) => (s.town ? slug(s.town) : ""));
        streetsOfName.forEach((s, i) => {
            const first = s.pieces[0];
            const lines = s.pieces.map((p) => p.line);
            const names = [];
            for (const p of s.pieces)
                for (const n of p.names)
                    if (!names.includes(n))
                        names.push(n);
            // One street keeps the plain id; same-name streets get their town, or a number when that does not tell them apart.
            const unique = suffixes[i] && suffixes.filter((x) => x === suffixes[i]).length === 1;
            const id = streetsOfName.length === 1 ? `street/${slug(key)}` : `street/${slug(key)}/${unique ? suffixes[i] : `${suffixes[i] || "part"}-${i + 1}`}`;
            streets.push({
                id,
                name: first.name,
                names,
                category: "street",
                subtype: first.subtype,
                ...onStreetCentre(lines),
                ...(streetsOfName.length > 1 && s.town ? { town: s.town } : {}),
                osm_type: "way",
                osm_id: first.osm_id,
                lines,
            });
        });
    }
    const sharedNames = streets.filter((s) => s.id.split("/").length > 2);
    console.log(`Streets: ${streets.length} from ${pieces.size} names; ${sharedNames.length} share a name with another street:`);
    for (const s of sharedNames)
        console.log(`  ${s.id}  ${s.town ?? "(no town)"}  ${s.lat},${s.lon}  ${s.lines.length} piece(s)`);
    // Merge duplicate POIs: same normalised name, same category, within 300 m.
    pois.sort((a, b) => b._prio - a._prio);
    const merged = [];
    for (const p of pois) {
        const dup = merged.find((m) => m.category === p.category && normalize(m.name) === normalize(p.name) && haversine(m.lat, m.lon, p.lat, p.lon) < 300);
        if (dup) {
            for (const n of p.names)
                if (!dup.names.includes(n))
                    dup.names.push(n);
            const contains = (b) => dup.lon >= b[0] && dup.lon <= b[2] && dup.lat >= b[1] && dup.lat <= b[3];
            if (!dup.bbox && p.bbox && contains(p.bbox))
                dup.bbox = p.bbox;
            continue;
        }
        merged.push(p);
    }
    const features = [
        ...merged.map(({ _prio, ...f }) => {
            void _prio;
            return f;
        }),
        ...streets,
    ];
    features.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    mkdirSync("data", { recursive: true });
    const out = {
        source: "OpenStreetMap via Overpass API (© OpenStreetMap contributors, ODbL)",
        built_at: new Date().toISOString(),
        area: AREA.id,
        bbox: BBOX,
        count: features.length,
        features,
    };
    writeFileSync(OUT_FILE, JSON.stringify(out));
    const counts = {};
    for (const f of features)
        counts[f.category] = (counts[f.category] ?? 0) + 1;
    console.log(`Wrote ${features.length} features to ${OUT_FILE}`, counts);
    for (const c of ["metro_station", "church", "castle", "town_hall"]) {
        console.log(`\n${c}:`);
        for (const f of features.filter((x) => x.category === c))
            console.log(`  ${f.id}  ${f.name}  [${f.subtype}]  ${f.lat},${f.lon}`);
    }
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
