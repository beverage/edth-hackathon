import { bboxHalfDiagonalM, bboxHalfExtentM, bearingDeg, destination, distanceM, nearestPointOnLines } from "./geo.js";
import { categoryIsExplicit, genericCategoryOf, searchByName, stripCategoryWords } from "./gazetteer.js";
export const FRESH_MS = 10 * 60 * 1000;
export const CATEGORY_RADIUS_M = 1500;
export const NEAREST_RATIO = 0.4;
/** A name match must score at least this... */
export const GOOD_SCORE = 0.7;
/** ...and be within this of the best match to count as a contender. */
export const SCORE_MARGIN = 0.1;
export const MAX_CHOICES = 3;
/** Same-name matches this close together are one place for our purposes; no question is worth asking. */
export const COLOCATED_M = 120;
/** ...unless one of them is bigger than this: a 1.2 km street and the station on it are worth a question. */
export const COLOCATED_MAX_EXTENT_M = 300;
const REL_RADIUS = {
    at: 30,
    near: 80,
    behind: 80,
    in_front_of: 80,
    next_to: 80,
    between: 150,
    north_of: 100,
    south_of: 100,
    east_of: 100,
    west_of: 100,
    north_east_of: 100,
    south_east_of: 100,
    south_west_of: 100,
    north_west_of: 100,
    towards: 0,
};
const COMPASS = {
    north_of: 0,
    north_east_of: 45,
    east_of: 90,
    south_east_of: 135,
    south_of: 180,
    south_west_of: 225,
    west_of: 270,
    north_west_of: 315,
};
const DIRECTION_DEG = { north: 0, north_east: 45, east: 90, south_east: 135, south: 180, south_west: 225, west: 270, north_west: 315 };
const COMPASS_OFFSET_M = 100;
const MAX_EXTENT_RADIUS_M = 500;
/** Smallest circle for a position estimated from a movement report. */
const MOVE_MIN_RADIUS_M = 50;
/**
 * A compass word is one of eight, so "north" is anything within 22.5° of north: up to 0.38 of the
 * distance sideways. The circle for "d metres north" is this share of d.
 */
export const COMPASS_SPREAD = 0.4;
/** A distance said aloud is paced or judged by eye; it is taken as good to a quarter. */
export const DISTANCE_SLACK = 0.25;
/** Circle for a point a stated distance away on a compass bearing. */
const compassRadius = (d) => Math.max(MOVE_MIN_RADIUS_M, Math.round(COMPASS_SPREAD * d));
/** How unsure the last position itself is: a position worked out from it starts with that much. */
const startRadius = (last) => Math.round(last.radius_m ?? last.uncertainty_m ?? 0);
const DEFAULT_CENTRE = { lat: 48.8455, lon: 2.435 };
/** Where the speaker is if `f` is the landmark they meant. */
export function placementFor(f, said, last) {
    const rel = said.relation ?? (said.kind === "movement" ? "towards" : "near");
    const d = said.distance_m ?? null;
    const travel = said.direction ? DIRECTION_DEG[said.direction] : null;
    // "Moved 300 m north on rue X": the distance and direction place the point from the last
    // position, and the street says which line it is on. The circle still reaches the unsnapped point.
    if (said.kind === "movement" && last && d != null && travel != null && f.lines?.length && said.relation !== "towards" && COMPASS[rel] === undefined) {
        const reckoned = destination(last, travel, d);
        const pin = nearestPointOnLines(reckoned, f.lines);
        return { pin, radius_m: Math.max(startRadius(last) + compassRadius(d), Math.round(distanceM(reckoned, pin))), estimated: true };
    }
    // The landmark's reference point: for a street, the point on it nearest the speaker's last position.
    const anchor = f.lines?.length && last ? nearestPointOnLines(last, f.lines) : { lat: f.lat, lon: f.lon };
    if (rel === "towards") {
        const heading_to = { lat: anchor.lat, lon: anchor.lon, id: f.id, name: f.name };
        // With no starting point there is nothing to move: the client shows only the target.
        if (!last)
            return { heading_to };
        const leg = distanceM(last, anchor);
        const along = (m) => (leg < 1 ? { lat: last.lat, lon: last.lon } : destination(last, bearingDeg(last, anchor), m));
        // "Moved 200 m towards X": that far along the leg, and not past X.
        if (d != null) {
            return { pin: along(Math.min(d, leg)), radius_m: startRadius(last) + Math.max(MOVE_MIN_RADIUS_M, Math.round(DISTANCE_SLACK * d)), heading_to, estimated: true };
        }
        // "I moved towards X" gives a direction, not a distance. The marker moves to the middle of the
        // leg and the circle spans all of it, from where they were to X: that is what we actually know.
        return { pin: along(leg / 2), radius_m: Math.max(MOVE_MIN_RADIUS_M, Math.round(leg / 2)), heading_to, estimated: true };
    }
    // Size of the feature itself is uncertainty too: "at the park" is anywhere in the park.
    let extent = 0;
    if (f.category === "street")
        extent = last ? 40 : f.bbox ? Math.min(400, bboxHalfDiagonalM(f.bbox)) : 150;
    else if (f.bbox)
        extent = Math.min(MAX_EXTENT_RADIUS_M, bboxHalfDiagonalM(f.bbox));
    const bearing = COMPASS[rel];
    if (bearing !== undefined) {
        const edge = f.bbox && f.category !== "street" ? Math.min(MAX_EXTENT_RADIUS_M, bboxHalfExtentM(f.bbox, bearing)) : 0;
        // With a distance said, the pin is that far out and the circle grows with it; without one, about 100 m out.
        return d != null
            ? { pin: destination(anchor, bearing, edge + d), radius_m: compassRadius(d) }
            : { pin: destination(anchor, bearing, edge + COMPASS_OFFSET_M), radius_m: REL_RADIUS[rel] };
    }
    // "200 metres from the church": the distance is known, the side is not, so the circle takes in
    // the whole ring. A direction of travel in the same report means the distance was how far they
    // moved, not how far they are from this place.
    const reach = d != null && travel == null ? extent + d * (1 + DISTANCE_SLACK) : extent;
    return { pin: { lat: anchor.lat, lon: anchor.lon }, radius_m: Math.round(Math.max(REL_RADIUS[rel], reach)) };
}
function toCandidate(f, ref, intent, last, score) {
    return {
        id: f.id,
        name: f.name,
        category: f.category,
        subtype: f.subtype,
        lat: f.lat,
        lon: f.lon,
        distance_m: Math.round(distanceM(ref, f.lines?.length ? nearestPointOnLines(ref, f.lines) : f)),
        ...(f.town ? { town: f.town } : {}),
        score,
        placement: placementFor(f, intent, last),
    };
}
const CAT_LABEL = {
    church: { en: "church", fr: "église", uk: "церква", frWhich: "Quelle église", ukWhich: "Яка церква" },
    metro_station: { en: "station", fr: "station", uk: "станція", frWhich: "Quelle station", ukWhich: "Яка станція" },
    castle: { en: "castle", fr: "château", uk: "замок", frWhich: "Quel château", ukWhich: "Який замок" },
    town_hall: { en: "town hall", fr: "mairie", uk: "адміністрація", frWhich: "Quelle mairie", ukWhich: "Яка адміністрація" },
    school: { en: "school", fr: "école", uk: "школа", frWhich: "Quelle école", ukWhich: "Яка школа" },
    park: { en: "park", fr: "parc", uk: "парк", frWhich: "Quel parc", ukWhich: "Який парк" },
    hospital: { en: "hospital", fr: "hôpital", uk: "лікарня", frWhich: "Quel hôpital", ukWhich: "Яка лікарня" },
    police: { en: "police station", fr: "commissariat", uk: "поліція", frWhich: "Quel commissariat", ukWhich: "Який відділок поліції" },
    bridge: { en: "bridge", fr: "pont", uk: "міст", frWhich: "Quel pont", ukWhich: "Який міст" },
    street: { en: "street", fr: "rue", uk: "вулиця", frWhich: "Quelle rue", ukWhich: "Яка вулиця" },
    other: { en: "place", fr: "lieu", uk: "місце", frWhich: "Quel lieu", ukWhich: "Яке місце" },
};
/** Kinds of "other" places worth naming in a question. */
const SUBTYPE_LABEL = {
    theatre: { en: "theatre", fr: "théâtre", uk: "театр" },
    cinema: { en: "cinema", fr: "cinéma", uk: "кінотеатр" },
    museum: { en: "museum", fr: "musée", uk: "музей" },
    gallery: { en: "gallery", fr: "galerie", uk: "галерея" },
    artwork: { en: "artwork", fr: "œuvre", uk: "скульптура" },
    monument: { en: "monument", fr: "monument", uk: "пам'ятник" },
    memorial: { en: "memorial", fr: "mémorial", uk: "меморіал" },
    attraction: { en: "landmark", fr: "site", uk: "пам'ятка" },
    square: { en: "square", fr: "place", uk: "площа" },
    library: { en: "library", fr: "bibliothèque", uk: "бібліотека" },
    post_office: { en: "post office", fr: "poste", uk: "пошта" },
    marketplace: { en: "market", fr: "marché", uk: "ринок" },
    stadium: { en: "stadium", fr: "stade", uk: "стадіон" },
};
/**
 * Choice labels. When two choices share a name, say what tells them apart: the kind of place
 * ("Château de Vincennes (castle)"), or for two places of one kind the town ("Rue Gambetta
 * (Montreuil)"), or failing that the distance ("Rue Gambetta (2.1 km)").
 */
export function choiceLabels(cands, lang) {
    const kind = (c) => (c.category === "other" && c.subtype && SUBTYPE_LABEL[c.subtype]?.[lang]) || CAT_LABEL[c.category][lang];
    const name = (c) => c.name.toLowerCase();
    const twin = (a, b) => a.category === b.category && name(a) === name(b);
    const far = (m) => (m < 1000 ? `${m} ${lang === "uk" ? "м" : "m"}` : `${(m / 1000).toFixed(1).replace(".", lang === "en" ? "." : ",")} ${lang === "uk" ? "км" : "km"}`);
    return cands.map((c) => {
        // Also when another choice contains this name: "Хрещатик (станція)" next to "вулиця Хрещатик".
        const kindClash = cands.some((o) => o !== c && !twin(o, c) && name(o).includes(name(c)));
        const twins = cands.filter((o) => o !== c && twin(o, c));
        const where = !twins.length ? null : c.town && twins.every((o) => o.town && o.town !== c.town) ? c.town : far(c.distance_m);
        const parts = [kindClash ? kind(c) : null, where].filter(Boolean);
        return parts.length ? `${c.name} (${parts.join(", ")})` : c.name;
    });
}
function joinOr(items, lang) {
    if (items.length <= 1)
        return items.join("");
    const or = lang === "fr" ? " ou " : lang === "uk" ? " чи " : ", or ";
    return items.slice(0, -1).join(", ") + or + items[items.length - 1];
}
function askQuestion(cands, lang, category, notFound) {
    const labels = joinOr(choiceLabels(cands, lang), lang);
    const cat = category ? CAT_LABEL[category] : null;
    if (lang === "fr") {
        const lead = notFound ? `Je ne trouve pas « ${notFound} ». ` : "";
        if (cands.length === 1)
            return `${lead}Vous voulez dire ${labels} ?`;
        return `${lead}${cat ? cat.frWhich : "Lequel"} : ${labels} ?`;
    }
    if (lang === "uk") {
        const lead = notFound ? `Не знаходжу «${notFound}». ` : "";
        if (cands.length === 1)
            return `${lead}Ви маєте на увазі ${labels}?`;
        return `${lead}${cat ? cat.ukWhich : "Уточніть"}: ${labels}?`;
    }
    const lead = notFound ? `I can't find "${notFound}". ` : "";
    if (cands.length === 1)
        return `${lead}Do you mean ${labels}?`;
    return `${lead}Which ${cat ? cat.en : "one"}: ${labels}?`;
}
function unresolvedPrompt(lang, prompt = "place") {
    if (prompt === "no_start") {
        if (lang === "fr")
            return "Je ne sais pas d'où vous partez. Donnez le nom d'une rue ou d'un lieu.";
        if (lang === "uk")
            return "Не знаю, звідки ви вирушили. Назвіть вулицю або орієнтир.";
        return "I don't know where you started. Name a street or a landmark.";
    }
    if (prompt === "incomplete") {
        if (lang === "fr")
            return "Il me faut une distance et une direction, ou un lieu.";
        if (lang === "uk")
            return "Потрібні відстань і напрямок або орієнтир.";
        return "I need a distance and a compass direction, or a landmark.";
    }
    if (lang === "fr")
        return "Je n'ai pas pu vous placer. Donnez le nom d'une rue ou d'un lieu.";
    if (lang === "uk")
        return "Не вдалося визначити місце. Назвіть вулицю або орієнтир.";
    return "I couldn't place that. Name a street or a landmark.";
}
export function resolve(input) {
    const { intent, transcript, lastPosition: last, now, gazetteer } = input;
    const lang = intent.language === "fr" || intent.language === "uk" ? intent.language : "en";
    const d = intent.distance_m ?? null;
    const plain = (rule, detail, prompt) => ({
        status: "unresolved",
        candidates: [],
        question: unresolvedPrompt(lang, prompt),
        evidence: { rule, detail },
    });
    // Dead reckoning: no place to go by, only "d metres on this bearing" from the last position.
    // The circle is the last position's own circle plus the spread of the move, so it grows with each leg.
    const reckon = (from, bearing, dist, why) => {
        const start = startRadius(from);
        const age = Math.max(0, Math.round((now - from.ts) / 60_000));
        return {
            status: "resolved",
            pin: destination(from, bearing, dist),
            radius_m: start + compassRadius(dist),
            estimated: true,
            candidates: [],
            evidence: {
                rule: "dead_reckoned",
                detail: `${why}; ${dist} m on bearing ${bearing}° from the last position (${age} min old); circle ${start} m at the start + ${compassRadius(dist)} m for the move`,
            },
        };
    };
    // A place that cannot be found does not stop a move that states its own distance and direction.
    const unresolved = (rule, detail) => last && d != null && intent.direction ? reckon(last, DIRECTION_DEG[intent.direction], d, `${rule} (${detail}), so placed from the stated move`) : plain(rule, detail);
    let name = intent.landmark_name?.trim() || null;
    // Dictionary form of an inflected name ("мостом Патона" → "міст Патона"); same as the name in English and French.
    let lemma = intent.landmark_name_lemma?.trim() || null;
    if (!name)
        [name, lemma] = [lemma, null];
    let category = intent.landmark_category;
    // "the church", "la mairie", "церкви": a category word said as if it were a name.
    if (name) {
        const generic = genericCategoryOf(lemma ?? name) ?? genericCategoryOf(name);
        if (generic !== undefined) {
            name = null;
            category = category ?? generic;
        }
    }
    if (!name && !category) {
        // "300 metres north of my last position" says the same as "moved 300 metres north".
        const bearing = intent.direction ? DIRECTION_DEG[intent.direction] : intent.relation ? COMPASS[intent.relation] : undefined;
        if (bearing === undefined && d == null) {
            return intent.kind === "other"
                ? plain("no_position_in_report", "the report did not state a position or movement")
                : plain("no_landmark", "no landmark name or category in the report");
        }
        if (bearing === undefined || d == null) {
            return plain("move_incomplete", `no place named, and ${d == null ? "a direction with no distance" : "a distance with no compass direction"}`, "incomplete");
        }
        if (!last)
            return plain("dead_reckoning_no_start", `${d} m on bearing ${bearing}° but no last position to start from`, "no_start");
        return reckon(last, bearing, d, "no place named");
    }
    if (intent.kind === "other")
        return plain("no_position_in_report", "the report did not state a position or movement");
    const ref = last ?? input.areaCentre ?? DEFAULT_CENTRE;
    const fresh = !!last && now - last.ts < FRESH_MS;
    const refLabel = last ? (fresh ? "last position" : "stale last position") : "area centre";
    const decide = (cands, prefix, extra, forceAsk = false, notFound) => {
        cands.sort((a, b) => a.distance_m - b.distance_m);
        if (!cands.length)
            return unresolved(`${prefix}_none`, extra);
        if (!forceAsk && cands.length === 1) {
            return resolvedFrom(cands[0], cands, `${prefix}_unique`, `${extra}; one candidate`);
        }
        // A last position estimated from a movement report is only known to ±u metres, so the nearest
        // candidate has to win even in the worst case: it u farther away, the second u closer.
        const u = last?.uncertainty_m ?? 0;
        if (!forceAsk && fresh && cands[0].distance_m + u < NEAREST_RATIO * Math.max(0, cands[1].distance_m - u)) {
            return resolvedFrom(cands[0], cands.slice(0, MAX_CHOICES), `${prefix}_nearest_wins`, `${extra}; nearest ${cands[0].distance_m} m < ${NEAREST_RATIO} × second ${cands[1].distance_m} m from fresh last position${u ? `, allowing ±${Math.round(u)} m on that estimate` : ""}`);
        }
        const top = cands.slice(0, MAX_CHOICES);
        const why = forceAsk
            ? "name not in gazetteer, asking among category"
            : !fresh && cands.length > 1
                ? `${cands.length} candidates and no fresh last position`
                : `${cands.length} candidates, nearest ${cands[0].distance_m} m not < ${NEAREST_RATIO} × second ${cands[1].distance_m} m`;
        return {
            status: "ambiguous",
            candidates: top,
            question: askQuestion(top, lang, prefix === "category" || forceAsk ? category : sameCategory(top), notFound),
            evidence: { rule: `${prefix}_ambiguous`, detail: `${extra}; ${why}` },
        };
    };
    if (name) {
        const queries = [...new Set([lemma, name].filter((q) => !!q))];
        let all = searchByName(queries, gazetteer);
        let saidForExplicit = name;
        let note = `name "${lemma ?? name}"`;
        // "станція метро Хрещатик": nothing is called that, so drop the type words and look for a
        // station called "Хрещатик". Only features of that type count, or "Gare du Nord" would find "Rue du Nord".
        if ((all[0]?.score ?? 0) < GOOD_SCORE) {
            const cores = queries.map((q) => stripCategoryWords(q)).filter((c) => !!c);
            if (cores.length) {
                const alt = searchByName([...new Set(cores.map((c) => c.core))], gazetteer).filter((m) => m.feature.category === cores[0].category);
                if ((alt[0]?.score ?? 0) >= GOOD_SCORE) {
                    all = alt;
                    category = category ?? cores[0].category;
                    saidForExplicit = stripCategoryWords(name)?.core ?? cores[0].core;
                    note = `name "${cores[0].core}" (type words dropped)`;
                }
            }
        }
        const best = all[0]?.score ?? 0;
        let good = all.filter((m) => m.score >= GOOD_SCORE && m.score >= best - SCORE_MARGIN);
        note += ` best score ${best.toFixed(2)}`;
        // An exact name beats a name that merely contains it ("Châtelet du Château de Vincennes").
        if (good.some((m) => m.exact))
            good = good.filter((m) => m.exact);
        if (good.length > 1 && category && categoryIsExplicit(transcript, saidForExplicit, category)) {
            const ofCat = good.filter((m) => m.feature.category === category);
            if (ofCat.length) {
                good = ofCat;
                note += `; narrowed to ${category} (said outright)`;
            }
        }
        const groups = collapseColocated(good);
        if (groups.length < good.length)
            note += `; ${good.length - groups.length} co-located duplicate(s) folded in`;
        if (groups.length) {
            const cands = groups.map(({ match, folded }) => {
                const c = toCandidate(match.feature, ref, intent, last, match.score);
                // The folded places widen the circle: "on Maidan" is the whole square, not just the station entrance.
                // Not for a movement: there the circle is the length of the leg, not the size of the place.
                for (const f of c.placement.heading_to || c.placement.estimated ? [] : folded) {
                    const r = placementFor(f.feature, intent, last).radius_m;
                    if (c.placement.radius_m != null && r != null)
                        c.placement.radius_m = Math.max(c.placement.radius_m, r);
                }
                return c;
            });
            return decide(cands, "named", `${note}; ${cands.length} match(es); ref ${refLabel}`);
        }
        if (category && category !== "street" && category !== "other") {
            const cands = categoryCandidates(category, gazetteer, ref, intent, last);
            return decide(cands, "category", `${note}, not found; ${cands.length} ${category} within ${CATEGORY_RADIUS_M} m of ${refLabel}`, true, name);
        }
        return unresolved("named_none", `${note}; nothing above ${GOOD_SCORE}`);
    }
    if (!category || category === "street" || category === "other") {
        return unresolved("category_too_broad", `category "${category}" without a name cannot be placed`);
    }
    const cands = categoryCandidates(category, gazetteer, ref, intent, last);
    return decide(cands, "category", `${cands.length} ${category} within ${CATEGORY_RADIUS_M} m of ${refLabel}`);
}
function categoryCandidates(category, gazetteer, ref, intent, last) {
    return gazetteer
        .filter((f) => f.category === category)
        .map((f) => toCandidate(f, ref, intent, last))
        .filter((c) => c.distance_m <= CATEGORY_RADIUS_M);
}
/**
 * "Bérault" is a metro station and the small square above it; "Майдан Незалежності" is a station,
 * a square and a street in the same spot. Those are one place, not a question.
 * A match is folded into an earlier one when they are within COLOCATED_M of each other (or one
 * lies inside the other) and neither is bigger than COLOCATED_MAX_EXTENT_M. Points of interest
 * are kept in preference to streets. "Хрещатик" the 1.2 km street is never folded into its station.
 */
function collapseColocated(matches) {
    const extent = (f) => (f.bbox ? bboxHalfDiagonalM(f.bbox) : 0);
    const inside = (p, f) => !!f.bbox && p.lon >= f.bbox[0] && p.lon <= f.bbox[2] && p.lat >= f.bbox[1] && p.lat <= f.bbox[3];
    const nearestOn = (f, to) => (f.lines?.length ? nearestPointOnLines(to, f.lines) : f);
    const sorted = [...matches].sort((a, b) => Number(a.feature.category === "street") - Number(b.feature.category === "street"));
    const kept = [];
    for (const m of sorted) {
        const f = m.feature;
        const home = kept.find(({ match: { feature: k } }) => {
            if (extent(f) > COLOCATED_MAX_EXTENT_M || extent(k) > COLOCATED_MAX_EXTENT_M)
                return false;
            return distanceM(nearestOn(k, f), nearestOn(f, k)) <= COLOCATED_M || inside(k, f) || inside(f, k);
        });
        if (home)
            home.folded.push(m);
        else
            kept.push({ match: m, folded: [] });
    }
    return kept;
}
function sameCategory(cands) {
    const c = cands[0]?.category;
    return c && cands.every((x) => x.category === c) ? c : null;
}
function resolvedFrom(c, cands, rule, detail) {
    return {
        status: "resolved",
        pin: c.placement.pin,
        radius_m: c.placement.radius_m,
        heading_to: c.placement.heading_to,
        estimated: c.placement.estimated,
        candidates: cands,
        evidence: { rule, feature_id: c.id, detail: `${detail}; → ${c.name}` },
    };
}
