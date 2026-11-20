import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "../src/geo/resolver.js";
import { loadGazetteer, nameScore, searchByName } from "../src/geo/gazetteer.js";
import { bearingDeg, distanceM, nearestPointOnLines } from "../src/geo/geo.js";
import { sanitizeIntent } from "../src/intent.js";
const gaz = loadGazetteer();
const NOW = Date.parse("2026-11-20T16:00:00Z");
const byName = (n, cat) => gaz.find((f) => f.name === n && (!cat || f.category === cat));
const BERAULT = byName("Bérault", "metro_station");
const CHATEAU_METRO = byName("Château de Vincennes", "metro_station");
const CHATEAU_CASTLE = byName("Château de Vincennes", "castle");
const MAIRIE_VINCENNES = byName("Mairie de Vincennes", "town_hall");
function intent(p) {
    return {
        kind: "position",
        landmark_text: null,
        landmark_name: null,
        landmark_category: null,
        relation: "at",
        language: "en",
        confidence: 0.9,
        ...p,
    };
}
const at = (f, ageMin = 1) => ({ lat: f.lat, lon: f.lon, ts: NOW - ageMin * 60000 });
describe("gazetteer fixtures this suite relies on", () => {
    it("has the features used below", () => {
        assert.notStrictEqual(BERAULT, undefined);
        assert.notStrictEqual(CHATEAU_METRO, undefined);
        assert.notStrictEqual(CHATEAU_CASTLE, undefined);
        assert.notStrictEqual(MAIRIE_VINCENNES, undefined);
    });
});
describe("resolver", () => {
    it("unique named place resolves", () => {
        const r = resolve({ intent: intent({ landmark_name: "Bérault", landmark_text: "Bérault" }), transcript: "I'm at Bérault", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, BERAULT.id);
        assert.strictEqual(r.evidence.rule, "named_unique");
        // 30 m for "at", widened to cover Place Bérault, the small square of the same name above the station.
        assert.ok(r.radius_m >= 30);
        assert.ok(r.radius_m <= 120);
    });
    it("accent-free and slightly misspelled names still match", () => {
        const r = resolve({ intent: intent({ landmark_name: "Berrault" }), transcript: "at Berrault", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, BERAULT.id);
    });
    it("a name shared by a castle and a metro station is ambiguous", () => {
        const r = resolve({
            intent: intent({ landmark_name: "Château de Vincennes", landmark_category: "castle", landmark_text: "the château de Vincennes" }),
            transcript: "I'm at the château de Vincennes",
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(r.status, "ambiguous");
        assert.deepStrictEqual(r.candidates.map((c) => c.id).sort(), [CHATEAU_CASTLE.id, CHATEAU_METRO.id].sort());
        assert.match(r.question, /castle/);
        assert.match(r.question, /station/);
        // every choice carries a ready placement for the tap
        for (const c of r.candidates)
            assert.notStrictEqual(c.placement.pin, undefined);
    });
    it("an explicit category word outside the name narrows a shared name", () => {
        const r = resolve({
            intent: intent({ landmark_name: "Château de Vincennes", landmark_category: "metro_station" }),
            transcript: "I'm at the Château de Vincennes metro station",
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, CHATEAU_METRO.id);
    });
    it("an unknown name with no category is unresolved", () => {
        const r = resolve({ intent: intent({ landmark_name: "Gare du Nord" }), transcript: "I'm at Gare du Nord", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "unresolved");
        assert.ok(r.question);
        assert.strictEqual(r.pin, undefined);
    });
    it("an unknown name with a category asks among that category instead of guessing", () => {
        const r = resolve({
            intent: intent({ landmark_name: "Notre-Dame de Paris", landmark_category: "church" }),
            transcript: "I'm at the church Notre-Dame de Paris",
            now: NOW,
            gazetteer: gaz,
        });
        // "Église Notre-Dame" exists in Vincennes, so either it matches by name (and is unique) or we ask; never a silent guess elsewhere.
        assert.ok(["resolved", "ambiguous"].includes(r.status));
        if (r.status === "resolved")
            assert.strictEqual(r.evidence.rule.startsWith("named"), true);
    });
    it("no landmark at all is unresolved", () => {
        const r = resolve({ intent: intent({ kind: "other", relation: null }), transcript: "radio check", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "unresolved");
        assert.strictEqual(r.evidence.rule, "no_position_in_report");
    });
    it("category only, no last position: ambiguous with up to three choices", () => {
        const r = resolve({ intent: intent({ landmark_name: "the church", landmark_category: "church", relation: "behind" }), transcript: "I am behind the church", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "ambiguous");
        assert.strictEqual(r.candidates.length, 3);
        assert.strictEqual(r.evidence.rule, "category_ambiguous");
        assert.strictEqual(r.candidates.every((c) => c.category === "church"), true);
    });
    it("nearest wins with a fresh last position", () => {
        const r = resolve({
            intent: intent({ landmark_name: "mairie", landmark_category: "town_hall", relation: "in_front_of", language: "fr" }),
            transcript: "Je suis devant la mairie",
            lastPosition: at(CHATEAU_METRO, 2),
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.rule, "category_nearest_wins");
        assert.strictEqual(r.evidence.feature_id, MAIRIE_VINCENNES.id);
        assert.ok(r.radius_m >= 80);
    });
    it("the same report with a stale last position asks instead", () => {
        const r = resolve({
            intent: intent({ landmark_name: "mairie", landmark_category: "town_hall", relation: "in_front_of", language: "fr" }),
            transcript: "Je suis devant la mairie",
            lastPosition: at(CHATEAU_METRO, 25),
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(r.status, "ambiguous");
        assert.match(r.question, /Quelle mairie/);
    });
    it("movement towards a place moves the pin to the middle of the leg, with a circle spanning it", () => {
        const last = at(CHATEAU_METRO, 1);
        const r = resolve({
            intent: intent({ kind: "movement", landmark_name: "Bérault", relation: "towards" }),
            transcript: "Moving towards Bérault",
            lastPosition: last,
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.heading_to?.id, BERAULT.id);
        const leg = distanceM(last, BERAULT);
        assert.ok(Math.abs(distanceM(r.pin, last) - leg / 2) < 2);
        assert.ok(Math.abs(distanceM(r.pin, BERAULT) - leg / 2) < 2);
        // the circle reaches both where they were and where they are heading
        assert.ok(Math.abs(r.radius_m - leg / 2) <= 1);
    });
    it("movement with no known starting point gives a target but no pin", () => {
        const r = resolve({ intent: intent({ kind: "movement", landmark_name: "Bérault", relation: "towards" }), transcript: "Moving towards Bérault", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.pin, undefined);
        assert.strictEqual(r.heading_to?.id, BERAULT.id);
    });
    it("nearest wins from an estimated position only if it survives the uncertainty", () => {
        // Demo steps 3 and 4: "moving towards the town hall" from the station, then "je suis devant la mairie".
        const move = resolve({
            intent: intent({ kind: "movement", landmark_name: null, landmark_category: "town_hall", relation: "towards" }),
            transcript: "Moving towards the town hall",
            lastPosition: at(CHATEAU_METRO, 1),
            now: NOW,
            gazetteer: gaz,
        });
        assert.strictEqual(move.heading_to?.id, MAIRIE_VINCENNES.id);
        const estimate = { ...move.pin, ts: NOW, uncertainty_m: move.radius_m };
        const fr = intent({ landmark_name: "mairie", landmark_category: "town_hall", relation: "in_front_of", language: "fr" });
        // From the estimate half way to the mairie, the demo's next step still resolves.
        const next = resolve({ intent: fr, transcript: "Je suis devant la mairie", lastPosition: estimate, now: NOW, gazetteer: gaz });
        assert.strictEqual(next.status, "resolved");
        assert.strictEqual(next.evidence.feature_id, MAIRIE_VINCENNES.id);
        // The rule itself, from the station (town halls at 347 m and 1,455 m):
        // ±100 m: 447 < 0.4 × 1,355, still clear. ±175 m: 522 > 0.4 × 1,280, so ask.
        const sure = resolve({ intent: fr, transcript: "Je suis devant la mairie", lastPosition: { ...at(CHATEAU_METRO, 1), uncertainty_m: 100 }, now: NOW, gazetteer: gaz });
        assert.strictEqual(sure.status, "resolved");
        assert.match(sure.evidence.detail, /allowing ±100 m/);
        const unsure = resolve({ intent: fr, transcript: "Je suis devant la mairie", lastPosition: { ...at(CHATEAU_METRO, 1), uncertainty_m: 175 }, now: NOW, gazetteer: gaz });
        assert.strictEqual(unsure.status, "ambiguous");
    });
    it("compass relation offsets about 100 m on that bearing", () => {
        const r = resolve({ intent: intent({ landmark_name: "Bérault", relation: "north_of" }), transcript: "north of Bérault", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "resolved");
        assert.ok(r.pin.lat > BERAULT.lat);
        assert.ok(distanceM(r.pin, BERAULT) > 95);
        assert.strictEqual(r.radius_m, 100);
    });
});
describe("stated distances and compass directions", () => {
    const FONTENAY = byName("Rue de Fontenay", "street");
    /** A stated position at the château metro, drawn with a 30 m circle. */
    const start = { ...at(CHATEAU_METRO, 1), radius_m: 30 };
    const move = (p) => intent({ kind: "movement", relation: null, ...p });
    const run = (i, transcript, lastPosition) => resolve({ intent: i, transcript, lastPosition, now: NOW, gazetteer: gaz });
    it("a stated distance replaces the fixed 100 m offset, and the circle grows with it", () => {
        const r = run(intent({ landmark_name: "Bérault", relation: "north_of", distance_m: 300 }), "300 metres north of Bérault");
        assert.strictEqual(r.status, "resolved");
        assert.ok(r.pin.lat > BERAULT.lat);
        assert.ok(Math.abs(distanceM(r.pin, BERAULT) - 300) < 3);
        assert.strictEqual(r.radius_m, 120);
        // a place and a distance from it: stated, not an estimate from the last position
        assert.strictEqual(r.estimated, undefined);
    });
    it("north-east of a place is offset on 45°", () => {
        const r = run(intent({ landmark_name: "Bérault", relation: "north_east_of" }), "north-east of Bérault");
        assert.strictEqual(r.status, "resolved");
        assert.ok(Math.abs(bearingDeg(BERAULT, r.pin) - 45) < 2);
        assert.ok(Math.abs(distanceM(r.pin, BERAULT) - 100) < 3);
    });
    it("a distance from a place with no side given keeps the pin and widens the circle to take in the ring", () => {
        const r = run(intent({ landmark_name: "Bérault", relation: "near", distance_m: 200 }), "about 200 metres from Bérault");
        assert.strictEqual(r.status, "resolved");
        assert.ok(distanceM(r.pin, BERAULT) < 1);
        // 200 m and a quarter more, plus the size of Place Bérault, the square of the same name folded in.
        assert.ok(r.radius_m >= 250);
        assert.ok(r.radius_m <= 300);
    });
    it("a distance and a direction with no place are reckoned from the last position", () => {
        const r = run(move({ distance_m: 300, direction: "north" }), "Moved 300 metres north", start);
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.rule, "dead_reckoned");
        assert.strictEqual(r.estimated, true);
        assert.deepStrictEqual(r.candidates, []);
        assert.ok(Math.abs(distanceM(r.pin, start) - 300) < 2);
        assert.ok(bearingDeg(start, r.pin) < 1);
        // the start's own 30 m plus 0.4 × 300 m for the move
        assert.strictEqual(r.radius_m, 150);
    });
    it("each reckoned leg adds to the circle", () => {
        const first = run(move({ distance_m: 300, direction: "north" }), "Moved 300 metres north", start);
        const from = { ...first.pin, ts: NOW, radius_m: first.radius_m, uncertainty_m: first.radius_m };
        const second = run(move({ distance_m: 200, direction: "east" }), "Moved 200 metres east", from);
        assert.strictEqual(second.evidence.rule, "dead_reckoned");
        assert.ok(Math.abs(bearingDeg(from, second.pin) - 90) < 1);
        assert.strictEqual(second.radius_m, 150 + 80);
    });
    it("«300 metres north of my last position» is the same move", () => {
        const said = run(intent({ relation: "north_of", distance_m: 300 }), "I'm 300 metres north of my last position", start);
        const moved = run(move({ distance_m: 300, direction: "north" }), "Moved 300 metres north", start);
        assert.strictEqual(said.evidence.rule, "dead_reckoned");
        assert.deepStrictEqual(said.pin, moved.pin);
    });
    it("a move with no last position asks for a place instead of guessing a start", () => {
        const r = run(move({ distance_m: 300, direction: "north" }), "Moved 300 metres north");
        assert.strictEqual(r.status, "unresolved");
        assert.strictEqual(r.pin, undefined);
        assert.strictEqual(r.evidence.rule, "dead_reckoning_no_start");
        assert.match(r.question, /where you started/);
        const uk = run(move({ distance_m: 300, direction: "north", language: "uk" }), "Пройшов триста метрів на північ");
        assert.match(uk.question, /звідки/);
    });
    it("a direction with no distance, or a distance with no direction, asks for both", () => {
        for (const i of [move({ direction: "north" }), move({ distance_m: 300 })]) {
            const r = run(i, "Heading north", start);
            assert.strictEqual(r.status, "unresolved");
            assert.strictEqual(r.evidence.rule, "move_incomplete");
            assert.match(r.question, /distance and a compass direction/);
        }
    });
    it("a distance towards a place is that far along the leg, and never past the place", () => {
        const r = run(move({ landmark_name: "Bérault", relation: "towards", distance_m: 200 }), "Moved 200 metres towards Bérault", start);
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.heading_to?.id, BERAULT.id);
        assert.strictEqual(r.estimated, true);
        assert.ok(Math.abs(distanceM(r.pin, start) - 200) < 2);
        assert.ok(Math.abs(bearingDeg(start, r.pin) - bearingDeg(start, BERAULT)) < 1);
        // the start's 30 m plus the 50 m minimum for a move (a quarter of 200 m is exactly that)
        assert.strictEqual(r.radius_m, 80);
        const far = run(move({ landmark_name: "Bérault", relation: "towards", distance_m: 5000 }), "Moved 5 kilometres towards Bérault", start);
        assert.ok(distanceM(far.pin, BERAULT) < 2);
    });
    it("a move along a named street lands on that street", () => {
        assert.notStrictEqual(FONTENAY, undefined);
        // A point on rue de Fontenay, which runs east from here and drifts a little south.
        const onStreet = { lat: 48.84856, lon: 2.43249, ts: NOW - 60000, radius_m: 40 };
        const r = run(move({ landmark_name: "rue de Fontenay", relation: "at", distance_m: 300, direction: "east" }), "Moved 300 metres east on rue de Fontenay", onStreet);
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, FONTENAY.id);
        assert.strictEqual(r.estimated, true);
        assert.ok(distanceM(r.pin, nearestPointOnLines(r.pin, FONTENAY.lines)) < 1);
        assert.ok(r.pin.lon > onStreet.lon);
        assert.ok(Math.abs(distanceM(r.pin, onStreet) - 300) < 15);
        assert.strictEqual(r.radius_m, 40 + 120);
    });
    it("a place that cannot be found does not stop a move that states its distance and direction", () => {
        const r = run(move({ landmark_name: "Gare du Nord", distance_m: 300, direction: "north" }), "Moved 300 metres north past Gare du Nord", start);
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.rule, "dead_reckoned");
        assert.match(r.evidence.detail, /named_none/);
        // "north of" a place that cannot be found is not a move from the last position: still unresolved
        const of = run(intent({ landmark_name: "Gare du Nord", relation: "north_of", distance_m: 300 }), "300 metres north of Gare du Nord", start);
        assert.strictEqual(of.status, "unresolved");
    });
    it("intent clean-up keeps a sane distance and a compass direction, and drops anything else", () => {
        assert.partialDeepStrictEqual(sanitizeIntent({ kind: "movement", distance_m: 300.4, direction: "north_east" }), { distance_m: 300, direction: "north_east" });
        for (const distance_m of [-5, 0, 1e9, "300", null])
            assert.strictEqual(sanitizeIntent({ distance_m }).distance_m, null);
        assert.strictEqual(sanitizeIntent({ direction: "left" }).direction, null);
    });
    it("intent clean-up checks the language against the letters said (decision 104)", () => {
        const lang = (language, text, hint = null) => sanitizeIntent({ language }, hint, text).language;
        // What the local 3B model did with English reports in Kyiv
        assert.strictEqual(lang("uk", "I'm at Khreshchatyk."), "en");
        assert.strictEqual(lang("uk", "Moving towards Saint Sophia Cathedral."), "en");
        assert.strictEqual(lang("uk", "Je suis devant la mairie.", "fr"), "fr");
        // Speech-to-text heard Ukrainian: trusted, even in Latin letters
        assert.strictEqual(lang("uk", "Ya na Khreshchatyku.", "uk"), "uk");
        // Only Cyrillic letters: Ukrainian, whatever the label
        assert.strictEqual(lang("en", "Я на Хрещатику."), "uk");
        // Both scripts, or labels that already fit: the model's label stands
        assert.strictEqual(lang("en", "I'm at Хрещатик."), "en");
        assert.strictEqual(lang("uk", "Рухаюсь до Saint Sophia."), "uk");
        assert.strictEqual(lang("fr", "Je suis au château."), "fr");
        // Without the transcript, nothing is checked
        assert.strictEqual(sanitizeIntent({ language: "uk" }).language, "uk");
    });
});
describe("two streets with one name, in two towns", () => {
    // As the gazetteer build writes them: one feature per street, each with its town.
    const street = (town, lon0) => ({
        id: `street/rue-gambetta/${town.toLowerCase()}`,
        name: "Rue Gambetta",
        names: ["Rue Gambetta"],
        category: "street",
        subtype: "residential",
        lat: 48.853,
        lon: lon0 + 0.001,
        bbox: [lon0, 48.853, lon0 + 0.002, 48.853],
        osm_type: "way",
        osm_id: 1,
        lines: [
            [
                [lon0, 48.853],
                [lon0 + 0.002, 48.853],
            ],
        ],
        town,
    });
    const WEST = street("Vincennes", 2.429);
    const EAST = street("Montreuil", 2.457);
    const twoTowns = [WEST, EAST];
    const run = (lang, lastPosition, streets = twoTowns) => resolve({ intent: intent({ landmark_name: "rue Gambetta", landmark_category: "street", language: lang }), transcript: "I'm on rue Gambetta", lastPosition, now: NOW, gazetteer: streets });
    it("with no last position, asks which one and names the towns", () => {
        const r = run("en");
        assert.strictEqual(r.status, "ambiguous");
        assert.deepStrictEqual(r.candidates.map((c) => c.id).sort(), [EAST.id, WEST.id].sort());
        assert.match(r.question, /Rue Gambetta \(Vincennes\)/);
        assert.match(r.question, /Rue Gambetta \(Montreuil\)/);
        assert.deepStrictEqual(r.candidates.map((c) => c.town).sort(), ["Montreuil", "Vincennes"]);
        assert.match(run("fr").question, /^Quelle rue : Rue Gambetta \((Vincennes|Montreuil)\) ou Rue Gambetta/);
    });
    it("a fresh last position on one of them picks it: nearest wins", () => {
        const r = run("en", at({ lat: 48.8535, lon: 2.4295 }, 2));
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, WEST.id);
    });
    it("with no towns to tell them apart, the question gives the distances", () => {
        const r = run("en", undefined, twoTowns.map(({ town, ...f }) => (void town, f)));
        assert.strictEqual(r.status, "ambiguous");
        assert.match(r.question, /Rue Gambetta \(\d+ m\)|Rue Gambetta \(\d\.\d km\)/);
        assert.doesNotMatch(r.question, /\(street\)/);
    });
    it("in the real Vincennes gazetteer, «rue Gambetta» is two streets and the question names their towns", () => {
        const gambettas = gaz.filter((f) => f.category === "street" && f.name === "Rue Gambetta");
        assert.deepStrictEqual(gambettas.map((f) => f.town).sort(), ["Fontenay-sous-Bois", "Montreuil"]);
        const r = resolve({ intent: intent({ landmark_name: "rue Gambetta", landmark_category: "street" }), transcript: "I'm on rue Gambetta", now: NOW, gazetteer: gaz });
        assert.strictEqual(r.status, "ambiguous");
        assert.match(r.question, /Rue Gambetta \(Fontenay-sous-Bois\)/);
        assert.match(r.question, /Rue Gambetta \(Montreuil\)/);
    });
});
describe("name scoring", () => {
    it("word order separates Sainte-Chapelle from Chapelle Sainte-Bernadette", () => {
        assert.ok(nameScore("Sainte-Chapelle", "Sainte-Chapelle de Vincennes") > nameScore("Sainte-Chapelle", "Chapelle Sainte-Bernadette") + 0.1);
    });
    it("English street word matches French rue", () => {
        const top = searchByName("Fontenay street", gaz)[0];
        assert.strictEqual(top.feature.category, "street");
        assert.ok(top.feature.name.toLowerCase().includes("fontenay"));
    });
});
describe("Ukrainian reports against the central Kyiv gazetteer", () => {
    const kyiv = loadGazetteer("kyiv");
    const centre = { lat: 50.4501, lon: 30.5234 };
    const k = (n, cat) => kyiv.find((f) => f.name === n && f.category === cat);
    const KHRESHCHATYK_METRO = k("Хрещатик", "metro_station");
    const KHRESHCHATYK_STREET = k("вулиця Хрещатик", "street");
    const SOFIA = k("Софійський собор", "church");
    const uk = (p) => intent({ language: "uk", ...p });
    const run = (i, transcript, lastPosition) => resolve({ intent: i, transcript, lastPosition, now: NOW, gazetteer: kyiv, areaCentre: centre });
    it("has the features used below", () => {
        assert.notStrictEqual(KHRESHCHATYK_METRO, undefined);
        assert.notStrictEqual(KHRESHCHATYK_STREET, undefined);
        assert.notStrictEqual(SOFIA, undefined);
    });
    it("a name in the locative case matches through its dictionary form", () => {
        const r = run(uk({ landmark_name: "Софійського собору", landmark_name_lemma: "Софійський собор", landmark_category: "church", relation: "near" }), "Я біля Софійського собору");
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, SOFIA.id);
    });
    it("still matches an inflected name when no dictionary form is given", () => {
        const r = run(uk({ landmark_name: "Софійського собору", landmark_name_lemma: null, relation: "near" }), "Я біля Софійського собору");
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, SOFIA.id);
    });
    it("«на Хрещатику» is a station and a long street: asks in Ukrainian", () => {
        const r = run(uk({ landmark_name: "Хрещатику", landmark_name_lemma: "Хрещатик" }), "Я на Хрещатику");
        assert.strictEqual(r.status, "ambiguous");
        assert.deepStrictEqual(r.candidates.map((c) => c.id).sort(), [KHRESHCHATYK_METRO.id, KHRESHCHATYK_STREET.id].sort());
        assert.match(r.question, /Хрещатик \(станція\)/);
        assert.match(r.question, / чи /);
    });
    it("«біля станції метро Хрещатик» resolves to the station, type words inside the name or not", () => {
        for (const name of ["Хрещатик", "станції метро Хрещатик"]) {
            const lemma = name === "Хрещатик" ? "Хрещатик" : "станція метро Хрещатик";
            const r = run(uk({ landmark_name: name, landmark_name_lemma: lemma, landmark_category: "metro_station", relation: "near" }), "Перебуваю біля станції метро Хрещатик");
            assert.strictEqual(r.status, "resolved");
            assert.strictEqual(r.evidence.feature_id, KHRESHCHATYK_METRO.id);
        }
    });
    it("«на вулиці Хрещатик» resolves to the street", () => {
        const r = run(uk({ landmark_name: "вулиці Хрещатик", landmark_name_lemma: "вулиця Хрещатик", landmark_category: "street" }), "Я на вулиці Хрещатик");
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, KHRESHCHATYK_STREET.id);
    });
    it("«на Майдані Незалежності» is a station, a square and a street in one spot: no question, wider circle", () => {
        const r = run(uk({ landmark_name: "Майдані Незалежності", landmark_name_lemma: "Майдан Незалежності" }), "Я на Майдані Незалежності");
        assert.strictEqual(r.status, "resolved");
        assert.ok(r.radius_m > 100);
        assert.match(r.evidence.detail, /folded in/);
    });
    it("«біля церкви» with no last position asks which church, in Ukrainian", () => {
        const r = run(uk({ landmark_name: "церкви", landmark_name_lemma: "церква", landmark_category: null, relation: "near" }), "Я біля церкви");
        assert.strictEqual(r.status, "ambiguous");
        assert.match(r.question, /^Яка церква: /);
        assert.strictEqual(r.candidates.every((c) => c.category === "church"), true);
    });
    it("an English speaker in Kyiv matches Latin spellings", () => {
        const r = run(intent({ landmark_name: "Khreshchatyk", landmark_category: "metro_station" }), "I'm at Khreshchatyk metro");
        assert.strictEqual(r.status, "resolved");
        assert.strictEqual(r.evidence.feature_id, KHRESHCHATYK_METRO.id);
    });
    it("«міста» (of the city) is not read as «міст» (bridge)", () => {
        const r = run(uk({ landmark_name: "центрі міста", landmark_name_lemma: "центр міста" }), "Я в центрі міста");
        assert.doesNotMatch(r.evidence.rule, /^category/);
    });
    it("unknown place is unresolved with a Ukrainian prompt", () => {
        const r = run(uk({ landmark_name: "Ейфелевої вежі", landmark_name_lemma: "Ейфелева вежа", relation: "near" }), "Я біля Ейфелевої вежі");
        assert.strictEqual(r.status, "unresolved");
        assert.match(r.question, /Назвіть вулицю/);
    });
});
