export const AREAS = {
    vincennes: {
        id: "vincennes",
        label: "Vincennes",
        place: "Vincennes, France",
        centre: { lat: 48.8455, lon: 2.435 },
        // Vincennes centre, the château and three Line 1 stations.
        bbox: { s: 48.835, w: 2.41, n: 48.856, e: 2.46 },
        townAdminLevel: 8,
    },
    kyiv: {
        id: "kyiv",
        label: "Київ",
        place: "central Kyiv, Ukraine",
        centre: { lat: 50.4501, lon: 30.5234 }, // Maidan Nezalezhnosti
        // Main railway station in the west to the Lavra in the east, Olimpiiska in the south to Podil in the north.
        bbox: { s: 50.428, w: 30.485, n: 50.472, e: 30.565 },
        townAdminLevel: 4,
    },
};
export function isAreaId(x) {
    return typeof x === "string" && Object.hasOwn(AREAS, x);
}
