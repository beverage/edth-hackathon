/**
 * A spoken answer to an open question [194]. While a question waits, a short clip can answer it
 * instead of being a new report: "the second one", "Bérault", "none of these", "перша", "aucun",
 * and "yes" or "no" to "Do you mean X?" [195].
 * No model: the words are matched against the choices on screen, and anything unclear is left to
 * be read as a new report, as before.
 */
import { canonTokens, isCategoryWord } from "./gazetteer";
import type { Category } from "./types";

export interface AnswerChoice {
  id: string;
  name: string;
  category?: Category;
}

export type SpokenAnswer = { choice: string | null; rule: "answer_ordinal" | "answer_name" | "answer_yes" | "answer_none"; detail: string };

/** Longer than this, the clip is a report, not an answer to a question. */
export const MAX_ANSWER_WORDS = 6;

/** Words that name a place in the list, counted from 0; -1 is the last one. */
const ORDINALS: Record<string, number> = {
  first: 0, second: 1, third: 2, last: -1,
  premier: 0, premiere: 0, deuxieme: 1, seconde: 1, troisieme: 2, dernier: -1, derniere: -1,
  перший: 0, перша: 0, перше: 0, першу: 0, другий: 1, друга: 1, друге: 1, другу: 1, третій: 2, третя: 2, третє: 2, третю: 2, останній: -1, остання: -1, останню: -1,
};
/** Numbers count only when no ordinal was said: "the second one" is the second. */
const NUMBERS: Record<string, number> = {
  one: 0, "1": 0, two: 1, "2": 1, three: 2, "3": 2,
  un: 0, une: 0, deux: 1, trois: 2,
  один: 0, одна: 0, одну: 0, два: 1, дві: 1, три: 2,
};
const NONE = new Set(["none", "neither", "nothing", "aucun", "aucune", "aucuns", "rien", "жоден", "жодна", "жодне", "жодного"]);
/** "Do you mean X?" has one choice: yes takes it, no refuses it. Both give way to a place or a name: "no, the second one". */
const YES = new Set(["yes", "yeah", "yep", "correct", "affirmative", "exactly", "oui", "ouais", "exact", "exactement", "так", "точно", "правильно", "вірно"]);
const NO = new Set(["no", "nope", "negative", "non", "ні"]);

/** Ukrainian case endings: "Бераулт" and "Бераулта" are one word here. */
const sameWord = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5));

export function matchAnswer(text: string, choices: AnswerChoice[]): SpokenAnswer | null {
  const words = canonTokens(text);
  if (!words.length || words.length > MAX_ANSWER_WORDS || !choices.length) return null;

  if (words.some((w) => NONE.has(w))) return { choice: null, rule: "answer_none", detail: `"${text}" refuses every choice` };

  const at = (i: number) => choices[i < 0 ? choices.length + i : i];
  const ordinal = words.map((w) => ORDINALS[w]).find((i) => i !== undefined);
  const number = words.map((w) => NUMBERS[w]).find((i) => i !== undefined);
  const byPlace = ordinal ?? number;
  const placed = byPlace !== undefined ? at(byPlace) : undefined;

  // By name: the share of a choice's name words that were said, with a type word to tell apart
  // two places of one name ("Château de Vincennes, the castle").
  const scored = choices
    .map((c) => {
      const name = canonTokens(c.name);
      const hit = name.filter((n) => words.some((w) => sameWord(w, n))).length;
      // A type word counts outside the name only: "Château de Vincennes" says no castle by itself.
      const rest = [...words];
      for (const n of name) {
        const k = rest.findIndex((w) => sameWord(w, n));
        if (k >= 0) rest.splice(k, 1);
      }
      const typed = c.category ? rest.some((w) => isCategoryWord(w, c.category!)) : false;
      return { c, score: name.length ? hit / name.length : 0, typed };
    })
    .filter((s) => s.score >= 0.6)
    .sort((a, b) => b.score - a.score || Number(b.typed) - Number(a.typed));
  const best = scored[0];
  const clear = best && (scored.length === 1 || best.score > scored[1].score || (best.typed && !scored[1].typed));
  const named = clear ? best.c : undefined;

  if (placed && named && placed.id !== named.id) return null; // "the second, Bérault" with Bérault first: unclear
  if (placed) return { choice: placed.id, rule: "answer_ordinal", detail: `"${text}" names choice ${choices.indexOf(placed) + 1}, ${placed.name}` };
  if (named) return { choice: named.id, rule: "answer_name", detail: `"${text}" names ${named.name}` };
  if (words.some((w) => NO.has(w))) return { choice: null, rule: "answer_none", detail: `"${text}" says no` };
  if (choices.length === 1 && words.some((w) => YES.has(w))) return { choice: choices[0].id, rule: "answer_yes", detail: `"${text}" says yes to ${choices[0].name}` };
  return null;
}

/**
 * What the page says back after a spoken answer [196], so a misheard answer is caught at once:
 * "Bérault. Marked." The speaker hears the name and can correct it without looking at the screen.
 */
export function answerReadback(name: string | null, lang: "en" | "fr" | "uk"): string {
  if (lang === "fr") return name ? `${name}. Noté.` : "Aucun. Redites où vous êtes.";
  if (lang === "uk") return name ? `${name}. Позначено.` : "Жоден. Повторіть, де ви.";
  return name ? `${name}. Marked.` : "None of them. Say where you are again.";
}
