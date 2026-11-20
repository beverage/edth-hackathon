/** Intent schema, extraction prompt, and validation. Coordinates never come from the model. */
const CATEGORIES = ["church", "metro_station", "castle", "town_hall", "school", "park", "hospital", "police", "bridge", "street", "other"];
const RELATIONS = [
    "at",
    "near",
    "in_front_of",
    "behind",
    "next_to",
    "north_of",
    "south_of",
    "east_of",
    "west_of",
    "north_east_of",
    "south_east_of",
    "south_west_of",
    "north_west_of",
    "towards",
    "between",
];
const DIRECTIONS = ["north", "north_east", "east", "south_east", "south", "south_west", "west", "north_west"];
/** A stated distance beyond this is not a report from someone on foot; it is dropped. */
export const MAX_DISTANCE_M = 20_000;
export const INTENT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["kind", "landmark_text", "landmark_name", "landmark_name_lemma", "landmark_category", "relation", "distance_m", "direction", "language", "confidence"],
    properties: {
        kind: { type: "string", enum: ["position", "movement", "other"] },
        landmark_text: { type: ["string", "null"] },
        landmark_name: { type: ["string", "null"] },
        landmark_name_lemma: { type: ["string", "null"] },
        landmark_category: { type: ["string", "null"], enum: [...CATEGORIES, null] },
        relation: { type: ["string", "null"], enum: [...RELATIONS, null] },
        distance_m: { type: ["number", "null"] },
        direction: { type: ["string", "null"], enum: [...DIRECTIONS, null] },
        language: { type: "string", enum: ["en", "fr", "uk"] },
        confidence: { type: "number" },
    },
};
export function systemPrompt(place = "Vincennes, France") {
    return `You turn one short spoken position report into JSON. Speakers are on foot in ${place}, and speak English, French or Ukrainian, sometimes mixed (Russian words may slip in).

Rules:
- Never output coordinates and never invent a place. Only copy what was said. Never translate a name and never change its script.
- kind: "position" when the speaker says where they are or that they arrived somewhere; "movement" when they are moving or heading towards somewhere ("towards", "heading to", "going to", "vers", "en direction de", "je me dirige vers", "рухаюсь до", "йду до", "прямую до", "у напрямку", "в бік"), or say how far or which way they moved ("moved 300 metres north", "j'ai avancé de 200 mètres vers l'est", "пройшов двісті метрів на північ"); "other" when neither a place nor a distance or compass direction is given.
- landmark_text: the landmark phrase exactly as said, including type words ("the Château de Vincennes metro station", "станції метро Хрещатик").
- landmark_name: the proper name only, exactly as said, keeping its grammatical case ("Château de Vincennes", "Bérault", "rue de Fontenay", "Хрещатику", "Золотих воріт", "вулиці Володимирській"). Leave out type words that are not part of the name ("metro", "station", "станція метро"). null when only a generic word was said ("the church", "la mairie", "церкви", "мостом").
- landmark_name_lemma: landmark_name in its dictionary (nominative) form, same language and script ("Хрещатику" → "Хрещатик", "Золотих воріт" → "Золоті ворота", "Софійського собору" → "Софійський собор", "вулиці Володимирській" → "вулиця Володимирська"). In English and French it equals landmark_name. null when landmark_name is null.
- landmark_category: from a type word the speaker said: church (church, église, chapelle, церква, храм, собор), metro_station (metro, station, métro, gare, метро, станція, вокзал), castle (castle, château, замок, фортеця), town_hall (town hall, mairie, мерія, міськрада), school (school, école, школа, університет), park (park, parc, парк, сквер), hospital (hospital, hôpital, лікарня, госпіталь), police (police, commissariat, поліція), bridge (bridge, pont, міст), street (street, rue, avenue, вулиця, проспект, площа, бульвар). If the type word is only part of the proper name ("Château" in "Château de Vincennes") and no other type word was said, use null.
- relation: "at" (at, à, au, на, в, у), "near" (near, close to, près de, біля, коло, поруч з, недалеко від), "in_front_of" (in front of, outside, devant, en face de, перед, навпроти), "behind" (behind, derrière, за, позаду), "next_to" (next to, beside, à côté de, поряд з), "north_of"/"south_of"/"east_of"/"west_of" (north of, au nord de, на північ від, ...), "north_east_of"/"south_east_of"/"south_west_of"/"north_west_of" (north-east of, au nord-est de, на північний схід від, ...), "towards" (towards, heading to, vers, en direction de, до, у напрямку, в бік), "between" (between, entre, між). null if no relation is given.
- distance_m: a distance the speaker said, as a number of metres ("200 metres" → 200, "half a kilometre" → 500, "1.5 km" → 1500, "deux cents mètres" → 200, "двісті метрів" → 200, "півкілометра" → 500). null when no distance was said. Never work one out from a time, a number of streets or a vague word ("five minutes", "two blocks", "a bit further" → null).
- direction: the compass direction the speaker moved or is moving in: "north", "north_east", "east", "south_east", "south", "south_west", "west", "north_west" ("moved 300 metres north", "heading south-east", "vers le nord", "на північ", "на південний захід"). null when none was said, when it is not a compass direction ("left", "forward", "back"), and when the compass word says where the speaker is from a landmark: "north of the church" is relation "north_of" with direction null.
- A movement measured from where the speaker was before ("from here", "from my last position", "de ma position", "звідси") names no landmark: landmark_text, landmark_name and landmark_category are null.
- If two places are given, one for where the speaker is and one for where they are going, report the one they are going to, as a movement.
- language: "fr" if the report is mostly French, "uk" if it is mostly Ukrainian or Russian, otherwise "en".
- confidence: 0 to 1, how sure you are of this reading.

Examples:
"I am behind the church" → {"kind":"position","landmark_text":"the church","landmark_name":null,"landmark_name_lemma":null,"landmark_category":"church","relation":"behind","distance_m":null,"direction":null,"language":"en","confidence":0.95}
"Je suis devant la mairie" → {"kind":"position","landmark_text":"la mairie","landmark_name":null,"landmark_name_lemma":null,"landmark_category":"town_hall","relation":"in_front_of","distance_m":null,"direction":null,"language":"fr","confidence":0.95}
"Moving towards Bérault" → {"kind":"movement","landmark_text":"Bérault","landmark_name":"Bérault","landmark_name_lemma":"Bérault","landmark_category":null,"relation":"towards","distance_m":null,"direction":null,"language":"en","confidence":0.9}
"je suis au château de Vincennes" → {"kind":"position","landmark_text":"château de Vincennes","landmark_name":"château de Vincennes","landmark_name_lemma":"château de Vincennes","landmark_category":null,"relation":"at","distance_m":null,"direction":null,"language":"fr","confidence":0.9}
"Я біля церкви" → {"kind":"position","landmark_text":"церкви","landmark_name":null,"landmark_name_lemma":null,"landmark_category":"church","relation":"near","distance_m":null,"direction":null,"language":"uk","confidence":0.95}
"Перебуваю біля станції метро Хрещатик" → {"kind":"position","landmark_text":"станції метро Хрещатик","landmark_name":"Хрещатик","landmark_name_lemma":"Хрещатик","landmark_category":"metro_station","relation":"near","distance_m":null,"direction":null,"language":"uk","confidence":0.95}
"Рухаюсь до Золотих воріт" → {"kind":"movement","landmark_text":"Золотих воріт","landmark_name":"Золотих воріт","landmark_name_lemma":"Золоті ворота","landmark_category":null,"relation":"towards","distance_m":null,"direction":null,"language":"uk","confidence":0.9}
"I'm about 200 metres south of the church" → {"kind":"position","landmark_text":"the church","landmark_name":null,"landmark_name_lemma":null,"landmark_category":"church","relation":"south_of","distance_m":200,"direction":null,"language":"en","confidence":0.95}
"Moved 300 metres north" → {"kind":"movement","landmark_text":null,"landmark_name":null,"landmark_name_lemma":null,"landmark_category":null,"relation":null,"distance_m":300,"direction":"north","language":"en","confidence":0.9}
"J'ai avancé de 150 mètres vers l'est" → {"kind":"movement","landmark_text":null,"landmark_name":null,"landmark_name_lemma":null,"landmark_category":null,"relation":null,"distance_m":150,"direction":"east","language":"fr","confidence":0.9}
"Пройшов півкілометра на південний захід" → {"kind":"movement","landmark_text":null,"landmark_name":null,"landmark_name_lemma":null,"landmark_category":null,"relation":null,"distance_m":500,"direction":"south_west","language":"uk","confidence":0.9}
"radio check" → {"kind":"other","landmark_text":null,"landmark_name":null,"landmark_name_lemma":null,"landmark_category":null,"relation":null,"distance_m":null,"direction":null,"language":"en","confidence":0.9}`;
}
function pick(v, allowed) {
    return typeof v === "string" && allowed.includes(v) ? v : null;
}
/**
 * The model's language label, checked against the letters actually said (decision 104). The local
 * 3B model labelled English reports in Kyiv as Ukrainian ("I'm at Khreshchatyk."), so the
 * question came back in Ukrainian.
 *   no Cyrillic letters:           not Ukrainian, unless speech-to-text said so; then the model's
 *                                  en or fr, else speech-to-text's, else English
 *   Cyrillic and no Latin letters: Ukrainian
 *   both:                          the model's label
 */
export function checkLanguage(said, transcript, hint) {
    if (!/\p{Script=Cyrillic}/u.test(transcript)) {
        if (said !== "uk" || hint === "uk")
            return said;
        return hint === "fr" ? "fr" : "en";
    }
    if (!/\p{Script=Latin}/u.test(transcript))
        return "uk";
    return said;
}
/** Coerce whatever came back into a valid Intent. With the transcript, the language is checked too. */
export function sanitizeIntent(raw, languageHint, transcript) {
    const o = (raw && typeof raw === "object" ? raw : {});
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const hint = languageHint === "fr" ? "fr" : languageHint === "en" ? "en" : languageHint === "uk" || languageHint === "ru" ? "uk" : null;
    const conf = typeof o.confidence === "number" && Number.isFinite(o.confidence) ? Math.max(0, Math.min(1, o.confidence)) : 0.5;
    const dist = typeof o.distance_m === "number" && Number.isFinite(o.distance_m) && o.distance_m > 0 && o.distance_m <= MAX_DISTANCE_M ? Math.round(o.distance_m) : null;
    const said = pick(o.language, ["en", "fr", "uk"]) ?? hint ?? "en";
    return {
        kind: pick(o.kind, ["position", "movement", "other"]) ?? "other",
        landmark_text: str(o.landmark_text),
        landmark_name: str(o.landmark_name),
        landmark_name_lemma: str(o.landmark_name_lemma) ?? str(o.landmark_name),
        landmark_category: pick(o.landmark_category, CATEGORIES),
        relation: pick(o.relation, RELATIONS),
        distance_m: dist || null,
        direction: pick(o.direction, DIRECTIONS),
        language: transcript === undefined ? said : checkLanguage(said, transcript, hint),
        confidence: conf,
    };
}
