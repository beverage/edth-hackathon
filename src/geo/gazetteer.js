import { readFileSync } from "node:fs";
const vincennes = JSON.parse(readFileSync(new URL("../../data/gazetteer.vincennes.json", import.meta.url), "utf8"));
const kyiv = JSON.parse(readFileSync(new URL("../../data/gazetteer.kyiv.json", import.meta.url), "utf8"));
import { tokens } from "./normalize.js";
const FILES = {
    vincennes: vincennes,
    kyiv: kyiv,
};
export function loadGazetteer(area = "vincennes") {
    return FILES[area].features;
}
/** Words that carry no identity in a place name. */
const STOPWORDS = new Set([
    "the", "of", "a", "an", "at", "on", "in", "to", "by", "and", "near",
    "de", "du", "des", "la", "le", "les", "l", "d", "au", "aux", "en", "et",
    "на", "в", "у", "біля", "до", "від", "з", "із", "і", "й", "та", "імені", "ім",
]);
/** Spelling variants mapped to one token before comparison (both query and names). */
const CANON = {
    st: "saint",
    ste: "sainte",
    street: "rue",
    road: "rue",
    av: "avenue",
    ave: "avenue",
    bd: "boulevard",
    bld: "boulevard",
    blvd: "boulevard",
    church: "eglise",
    chapel: "chapelle",
    castle: "chateau",
    вул: "вулиця",
    просп: "проспект",
    пр: "проспект",
    пл: "площа",
    пров: "провулок",
    бул: "бульвар",
    бульв: "бульвар",
};
/** Category words as canonical tokens: English, French, Ukrainian (and common Russian), dictionary form. */
export const CATEGORY_WORDS = {
    church: ["eglise", "chapelle", "temple", "cathedral", "cathedrale", "basilica", "basilique", "церква", "храм", "собор", "костел", "костьол", "каплиця", "церковь"],
    metro_station: ["metro", "subway", "station", "gare", "underground", "tube", "rer", "stop", "метро", "станція", "вокзал", "станция"],
    castle: ["chateau", "fort", "fortress", "forteresse", "donjon", "keep", "замок", "фортеця"],
    town_hall: ["mairie", "town", "city", "hall", "townhall", "hotel", "ville", "мерія", "міськрада", "ратуша", "мэрия"],
    school: ["school", "ecole", "college", "lycee", "university", "universite", "creche", "kindergarten", "школа", "ліцей", "гімназія", "університет", "коледж", "інститут"],
    park: ["park", "parc", "bois", "garden", "jardin", "woods", "forest", "foret", "парк", "сквер"],
    hospital: ["hospital", "hopital", "clinic", "clinique", "лікарня", "госпіталь", "шпиталь", "поліклініка", "больница"],
    police: ["police", "commissariat", "gendarmerie", "поліція", "відділок", "полиция"],
    bridge: ["bridge", "pont", "passerelle", "міст", "мост"],
    street: [
        "rue", "avenue", "boulevard", "allee", "place", "quai", "impasse", "passage", "chemin", "route", "villa", "cours", "sentier", "square", "lane",
        "вулиця", "проспект", "бульвар", "площа", "провулок", "узвіз", "набережна", "шосе", "улица",
    ],
};
/**
 * Ukrainian nouns change their ending with grammatical case ("біля церкви", "за мостом").
 * A token is a category word if it is one of these stems plus a known case ending.
 * "міст" (bridge) is deliberately not a stem: "міста" means "of the city".
 */
const CATEGORY_STEMS = {
    church: ["церкв", "церков", "храм", "собор", "костел", "костьол", "каплиц"],
    metro_station: ["станці", "станци", "вокзал"],
    castle: ["замк", "фортец"],
    town_hall: ["мері", "міськрад", "ратуш", "мэри"],
    school: ["школ", "ліце", "гімназі", "університет", "коледж", "інститут"],
    park: ["парк", "сквер"],
    hospital: ["лікарн", "госпітал", "шпитал", "поліклінік", "больниц"],
    police: ["поліці", "відділк", "полици"],
    bridge: ["мост"],
    street: ["вулиц", "проспект", "бульвар", "площ", "провулк", "узвоз", "набережн", "улиц"],
};
const CASE_ENDINGS = new Set(["", "а", "я", "у", "ю", "і", "ї", "и", "е", "є", "ь", "й", "ом", "ем", "єм", "ою", "ею", "єю", "ові", "еві", "ій", "ої", "ах", "ях"]);
const CYRILLIC = /[Ѐ-ӿ]/;
const NAMED_CATEGORIES = Object.keys(CATEGORY_WORDS);
export function isCategoryWord(token, category) {
    if (category === "other")
        return false;
    if (CATEGORY_WORDS[category].includes(token))
        return true;
    if (!CYRILLIC.test(token))
        return false;
    return CATEGORY_STEMS[category].some((stem) => token.startsWith(stem) && CASE_ENDINGS.has(token.slice(stem.length)));
}
export function categoryOfToken(token) {
    return NAMED_CATEGORIES.find((c) => isCategoryWord(token, c));
}
/** Canonical tokens with stopwords removed (falls back to all tokens if only stopwords remain). */
export function canonTokens(s) {
    const all = tokens(s).map((t) => CANON[t] ?? t);
    const kept = all.filter((t) => !STOPWORDS.has(t));
    return kept.length ? kept : all;
}
/**
 * If every token of `name` is a category word ("the church", "la mairie", "церкви"),
 * the name carries no identity: return the category it implies. Otherwise undefined.
 */
export function genericCategoryOf(name) {
    const toks = canonTokens(name);
    if (!toks.length)
        return null;
    const cats = toks.map((t) => categoryOfToken(t));
    if (cats.some((c) => c === undefined))
        return undefined;
    return cats[0] ?? null;
}
/**
 * "станція метро Хрещатик" → { core: "хрещатик", category: "metro_station" }.
 * null when the name has no category words, or nothing else.
 */
export function stripCategoryWords(name) {
    const toks = canonTokens(name);
    const cats = toks.map((t) => categoryOfToken(t));
    const core = toks.filter((_, i) => cats[i] === undefined);
    const first = cats.find((c) => c !== undefined);
    if (!first || !core.length)
        return null;
    return { core: core.join(" "), category: first };
}
/**
 * Was the category said outright, outside the proper name?
 * "the Château de Vincennes metro station" → metro_station explicit.
 * "the château de Vincennes" → castle is only inside the name, so not explicit.
 */
export function categoryIsExplicit(transcript, name, category) {
    if (category === "other")
        return false;
    const residual = canonTokens(transcript);
    for (const t of canonTokens(name)) {
        const i = residual.indexOf(t);
        if (i >= 0)
            residual.splice(i, 1);
    }
    return residual.some((t) => isCategoryWord(t, category));
}
function levenshtein(a, b) {
    if (a === b)
        return 0;
    const m = a.length;
    const n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}
function tokenSim(a, b) {
    if (a === b)
        return 1;
    const minLen = Math.min(a.length, b.length);
    if (minLen < 4)
        return 0;
    if (a.startsWith(b) || b.startsWith(a))
        return 0.9;
    // Ukrainian case endings: same word if the first letters agree and only short endings differ
    // ("Софійського" / "Софійський", "Володимирській" / "Володимирська").
    if (CYRILLIC.test(a) && CYRILLIC.test(b)) {
        let cp = 0;
        while (cp < minLen && a[cp] === b[cp])
            cp++;
        if (cp >= 4 && a.length - cp <= 3 && b.length - cp <= 3)
            return 0.85;
    }
    const r = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
    return r >= 0.75 ? r : 0;
}
function scoreTokens(q, n) {
    if (!q.length || !n.length)
        return 0;
    const best = (t, pool) => Math.max(...pool.map((p) => tokenSim(t, p)));
    const recall = q.reduce((s, t) => s + best(t, n), 0) / q.length;
    const precision = n.reduce((s, t) => s + best(t, q), 0) / n.length;
    const phrase = ` ${n.join(" ")} `.includes(` ${q.join(" ")} `) ? 1 : 0;
    return 0.6 * recall + 0.25 * precision + 0.15 * phrase;
}
/**
 * Similarity of a spoken name to a gazetteer name, 0..1.
 * 0.6 × how much of the query the name covers + 0.25 × how much of the name the query covers
 * + 0.15 if the query appears as a contiguous phrase in the name (word order matters:
 * "Sainte-Chapelle" should beat "Chapelle Sainte-Bernadette").
 */
export function nameScore(query, name) {
    return scoreTokens(canonTokens(query), canonTokens(name));
}
const INDEX = new WeakMap();
function indexOf(features) {
    let idx = INDEX.get(features);
    if (idx)
        return idx;
    idx = features.map((feature) => {
        const names = [];
        const add = (raw, toks) => {
            const key = toks.join(" ");
            if (key && !names.some((n) => n.key === key))
                names.push({ raw, toks, key });
        };
        for (const raw of feature.names.length ? feature.names : [feature.name]) {
            const toks = canonTokens(raw);
            add(raw, toks);
            // People drop the street word ("на Хрещатику", "on Fontenay"): index streets without it too.
            if (feature.category === "street") {
                const bare = toks.filter((t) => !isCategoryWord(t, "street"));
                if (bare.length && bare.length < toks.length)
                    add(raw, bare);
            }
        }
        return { feature, names };
    });
    INDEX.set(features, idx);
    return idx;
}
/** All features scored against the query (or the best of several spellings of it), best first. */
export function searchByName(query, features) {
    const queries = (Array.isArray(query) ? query : [query]).map((q) => canonTokens(q)).filter((q) => q.length);
    const keys = new Set(queries.map((q) => q.join(" ")));
    const out = [];
    for (const { feature, names } of indexOf(features)) {
        let best = 0;
        let matched = feature.name;
        let exact = false;
        for (const n of names) {
            if (keys.has(n.key))
                exact = true;
            for (const q of queries) {
                const s = scoreTokens(q, n.toks);
                if (s > best) {
                    best = s;
                    matched = n.raw;
                }
            }
        }
        if (best > 0)
            out.push({ feature, score: Math.round(best * 1000) / 1000, matched_name: matched, exact });
    }
    return out.sort((a, b) => b.score - a.score);
}
