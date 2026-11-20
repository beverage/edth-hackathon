/**
 * Lowercase, fold Latin accents, turn punctuation into spaces, collapse spaces.
 * Works for any script: Cyrillic letters are kept as they are (й and ї keep their marks).
 */
export function normalize(s) {
    return s
        .normalize("NFD")
        .replace(/([a-zA-Z])[̀-ͯ]+/g, "$1") // é → e, but not й → и
        .normalize("NFC")
        .toLowerCase()
        .replace(/œ/g, "oe")
        .replace(/æ/g, "ae")
        .replace(/(?<=[Ѐ-ӿ])['’ʼ`](?=[Ѐ-ӿ])/g, "") // Ukrainian apostrophe: слов'янська → словянська
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}
export function tokens(s) {
    const n = normalize(s);
    return n ? n.split(" ") : [];
}
const UK_LATIN = {
    а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y", і: "i", ї: "i", й: "i",
    к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
    ш: "sh", щ: "shch", ь: "", ю: "iu", я: "ia", "'": "", "’": "", ʼ: "",
};
const UK_LATIN_INITIAL = { є: "ye", ї: "yi", й: "y", ю: "yu", я: "ya" };
/** Ukrainian → Latin, official 2010 (passport) system. Returns null if the text has no Ukrainian Cyrillic. */
export function transliterateUk(s) {
    if (!/[Ѐ-ӿ]/.test(s))
        return null;
    let out = "";
    let wordStart = true;
    const lower = s.toLowerCase().replace(/зг/g, "zgh");
    for (let i = 0; i < lower.length; i++) {
        const ch = lower[i];
        const mapped = wordStart && ch in UK_LATIN_INITIAL ? UK_LATIN_INITIAL[ch] : ch in UK_LATIN ? UK_LATIN[ch] : ch;
        const upper = s[i] !== undefined && s[i] !== s[i].toLowerCase();
        out += upper && mapped ? mapped[0].toUpperCase() + mapped.slice(1) : mapped;
        wordStart = !/[\p{L}'’ʼ]/u.test(ch);
    }
    return out;
}
