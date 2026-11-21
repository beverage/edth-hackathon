import { describe, expect, it } from "vitest";
import { destination } from "../lib/geo/geo";
import { gridLines, gridSpacing, measureText, toUtm } from "../lib/geo/grid";

const VINCENNES = { lat: 48.8455, lon: 2.435 };
const CASTLE = { lat: 48.8427, lon: 2.4358 }; // 31U DQ 5860 1012

describe("the grid's lines [232]", () => {
  const box = { west: 2.405, south: 48.832, east: 2.465, north: 48.856 };
  const fc = gridLines(box, VINCENNES, 1000);
  const lines = fc.features.filter((f) => f.properties?.kind === "line");
  const labels = fc.features.filter((f) => f.properties?.kind === "label").map((f) => f.properties?.text);

  it("draws one line a kilometre each way, labelled as on a printed map", () => {
    expect(lines.length).toBeGreaterThan(6);
    expect(labels).toEqual(expect.arrayContaining(["57", "58", "59", "60", "10", "11"]));
  });

  it("puts the castle between lines 58 and 59, and 10 and 11", () => {
    const u = toUtm(CASTLE);
    expect(Math.floor((u.easting % 100000) / 1000)).toBe(58);
    expect(Math.floor((u.northing % 100000) / 1000)).toBe(10);
  });

  it("spaces the lines by zoom, and draws none when too many", () => {
    expect(gridSpacing(14)).toBe(1000);
    expect(gridSpacing(10)).toBe(10000);
    expect(gridSpacing(6)).toBeNull();
    expect(gridLines({ west: 1, south: 47, east: 4, north: 50 }, VINCENNES, 1000).features).toHaveLength(0);
  });
});

describe("where the grid's figures go [233]", () => {
  const box = { west: 2.405, south: 48.832, east: 2.465, north: 48.856 };
  const labelsOf = (fc: GeoJSON.FeatureCollection) =>
    fc.features.filter((f) => f.properties?.kind === "label").map((f) => ({ text: String(f.properties?.text), at: (f.geometry as GeoJSON.Point).coordinates }));
  // At Vincennes the eastings are 55 to 61 and the northings 09 to 12.
  const isEasting = (text: string) => Number(text) >= 50;

  it("puts the eastings along the bottom and the northings up the left, as on a printed map", () => {
    const labels = labelsOf(gridLines(box, VINCENNES, 1000));
    expect(labels.length).toBeGreaterThan(4);
    for (const l of labels) {
      if (isEasting(l.text)) expect(l.at[1]).toBeLessThan(48.833);
      else expect(l.at[0]).toBeLessThan(2.406);
    }
  });

  it("keeps them in the place the map gives, clear of what covers the map", () => {
    const place = { row: 48.835, column: 2.409, inside: { west: 2.42, east: 2.46, south: 48.837, north: 48.848 } };
    const labels = labelsOf(gridLines(box, VINCENNES, 1000, place));
    const eastings = labels.filter((l) => isEasting(l.text));
    const northings = labels.filter((l) => !isEasting(l.text));
    expect(eastings.every((l) => l.at[1] === place.row)).toBe(true);
    expect(northings.every((l) => l.at[0] === place.column)).toBe(true);
    // 57 is left of the clear part, 61 off the map; 09 is under the row, 11 above the clear part.
    expect(eastings.map((l) => l.text)).toEqual(["58", "59", "60"]);
    expect(northings.map((l) => l.text)).toEqual(["10"]);
  });
});

describe("the ruler [232]", () => {
  it("gives distance, bearing and mils", () => {
    const b = destination(CASTLE, 60, 300);
    expect(measureText(CASTLE, b)).toBe("300 m · bearing 060° · 1067 mils");
    expect(measureText(CASTLE, destination(CASTLE, 270, 1500))).toBe("1.50 km · bearing 270° · 4800 mils");
  });

  it("gives the mils from the exact bearing, not the rounded degrees [233]", () => {
    expect(measureText(CASTLE, destination(CASTLE, 60.4, 300))).toBe("300 m · bearing 060° · 1074 mils");
    expect(measureText(CASTLE, destination(CASTLE, 179.6, 300))).toBe("300 m · bearing 180° · 3193 mils");
  });
});
