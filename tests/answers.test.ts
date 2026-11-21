import { describe, expect, it } from "vitest";
import { answerReadback, matchAnswer, type AnswerChoice } from "../lib/geo/answers";

const VINCENNES: AnswerChoice[] = [
  { id: "node/1", name: "Bérault", category: "metro_station" },
  { id: "node/2", name: "Château de Vincennes", category: "metro_station" },
  { id: "way/3", name: "Château de Vincennes", category: "castle" },
];
const KYIV: AnswerChoice[] = [
  { id: "a", name: "Майдан Незалежності", category: "metro_station" },
  { id: "b", name: "Maidan Palace Hotel", category: "hotel" },
];

describe("a spoken answer to an open question [194]", () => {
  it("takes a place in the list, in three languages", () => {
    for (const [said, id] of [
      ["The first one.", "node/1"],
      ["Second.", "node/2"],
      ["the last one", "way/3"],
      ["Number three", "way/3"],
      ["La deuxième.", "node/2"],
      ["Le premier", "node/1"],
      ["Третій.", "way/3"],
      ["Перша", "node/1"],
    ] as const) {
      expect(matchAnswer(said, VINCENNES), said).toMatchObject({ choice: id, rule: "answer_ordinal" });
    }
  });

  it("takes a name, and a type word between two places of one name", () => {
    expect(matchAnswer("Bérault", VINCENNES)).toMatchObject({ choice: "node/1", rule: "answer_name" });
    expect(matchAnswer("The castle, Château de Vincennes", VINCENNES)).toMatchObject({ choice: "way/3" });
    expect(matchAnswer("Château de Vincennes station", VINCENNES)).toMatchObject({ choice: "node/2" });
    expect(matchAnswer("Майдан Незалежності", KYIV)).toMatchObject({ choice: "a" });
  });

  it("takes none of these", () => {
    for (const said of ["None of these.", "Neither", "Aucun.", "Жоден."]) expect(matchAnswer(said, VINCENNES), said).toEqual(expect.objectContaining({ choice: null, rule: "answer_none" }));
  });

  it("takes yes or no to a single choice, and a place or a name over a no [195]", () => {
    const ONE = VINCENNES.slice(0, 1);
    for (const said of ["Yes.", "Oui", "Так.", "Yeah, correct"]) expect(matchAnswer(said, ONE), said).toMatchObject({ choice: "node/1", rule: "answer_yes" });
    for (const said of ["No.", "Non", "Ні."]) expect(matchAnswer(said, ONE), said).toMatchObject({ choice: null, rule: "answer_none" });
    expect(matchAnswer("No, the second one", VINCENNES)).toMatchObject({ choice: "node/2", rule: "answer_ordinal" });
    expect(matchAnswer("Ні, друга", VINCENNES)).toMatchObject({ choice: "node/2" });
    expect(matchAnswer("Yes", VINCENNES)).toBeNull(); // yes to which one?
  });

  it("leaves a new report, or anything unclear, to be read as a report", () => {
    expect(matchAnswer("Château de Vincennes", VINCENNES)).toBeNull(); // two places of that name
    expect(matchAnswer("I'm now moving towards the town hall by the park", VINCENNES)).toBeNull(); // too long
    expect(matchAnswer("Golden Gate", KYIV)).toBeNull(); // not a choice
    expect(matchAnswer("The second, Bérault", VINCENNES)).toBeNull(); // the place and the name disagree
    expect(matchAnswer("", VINCENNES)).toBeNull();
    expect(matchAnswer("first", [])).toBeNull();
  });
});

describe("saying back a spoken answer [196]", () => {
  it("names the place it took, or says none, in the question's language", () => {
    expect(answerReadback("Bérault", "en")).toBe("Bérault. Marked.");
    expect(answerReadback("Bérault", "fr")).toBe("Bérault. Noté.");
    expect(answerReadback("Майдан Незалежності", "uk")).toBe("Майдан Незалежності. Позначено.");
    expect(answerReadback(null, "en")).toMatch(/^None/);
    expect(answerReadback(null, "uk")).toMatch(/^Жоден/);
  });
});

describe("the report route with a question open [194]", () => {
  it("answers it from typed words, and reads anything else as a report", async () => {
    const { POST } = await import("../app/api/report/route");
    const form = (text: string) => {
      const f = new FormData();
      f.append("text", text);
      f.append("area", "vincennes");
      f.append("language", "en");
      f.append("choices", JSON.stringify(VINCENNES));
      return new Request("http://localhost/api/report", { method: "POST", body: f, headers: { "x-forwarded-for": "10.0.0.94" } });
    };
    const reply = await (await POST(form("the second one"))).json();
    expect(reply.answer).toMatchObject({ choice: "node/2", rule: "answer_ordinal" });
    expect(reply.resolution).toBeUndefined();
  });
});
