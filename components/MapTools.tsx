"use client";

/**
 * Grid tools on a map [232]: the MGRS grid under the pointer, the grid's lines, a ruler that gives
 * distance and bearing between two points, and a box to go to a grid. On the map page a click also
 * copies the grid under it. Used by the map page; ready for the command post's map.
 */
import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import type { GeoJSONSource, Map as MLMap, MapMouseEvent } from "maplibre-gl";
import type { LatLon } from "@/lib/geo/geo";
import { gridLines, gridSpacing, measureText, readGrid, toGrid, type GridLabels } from "@/lib/geo/grid";
import styles from "./MapTools.module.css";

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

interface Props {
  mapRef: RefObject<MLMap | null>;
  /** True once the map's style has loaded, so sources and layers can be added. */
  ready: boolean;
  /** The area's centre: where a grid with its square left out is read from. */
  centre: LatLon;
  /** The id of a layer the grid lines go under, so they never hide a unit. */
  below?: string;
  /** A plain click copies the grid under it. Off where a click already does something. */
  copyOnClick?: boolean;
  /** Pixels from the top of the map: under the zoom buttons. */
  top?: string;
}

export default function MapTools({ mapRef, ready, centre, below, copyOnClick = false, top = "110px" }: Props) {
  const [grid, setGrid] = useState("");
  const [lines, setLines] = useState(false);
  const [measuring, setMeasuring] = useState(false);
  const [measured, setMeasured] = useState("");
  const [goto, setGoto] = useState("");
  const [note, setNote] = useState("");
  const linesRef = useRef(lines);
  const measuringRef = useRef(measuring);
  const points = useRef<LatLon[]>([]);
  const centreRef = useRef(centre);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redrawRef = useRef<() => void>(() => {});
  const clearRulerRef = useRef<() => void>(() => {});
  const toolsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    linesRef.current = lines;
    measuringRef.current = measuring;
    centreRef.current = centre;
  });

  const say = (text: string) => {
    setNote(text);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 2500);
  };

  // Sources, layers and the map's events, once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const src = (id: string) => map.getSource(id) as GeoJSONSource | undefined;
    if (!map.getSource("mgrs")) {
      map.addSource("mgrs", { type: "geojson", data: EMPTY });
      map.addSource("ruler", { type: "geojson", data: EMPTY });
      map.addSource("goto", { type: "geojson", data: EMPTY });
      const under = below && map.getLayer(below) ? below : undefined;
      map.addLayer({ id: "mgrs-line", type: "line", source: "mgrs", filter: ["==", "kind", "line"], paint: { "line-color": "#1e3a5f", "line-width": ["case", ["get", "major"], 2, 1], "line-opacity": 0.45 } }, under);
      map.addLayer(
        {
          id: "mgrs-label",
          type: "symbol",
          source: "mgrs",
          filter: ["==", "kind", "label"],
          layout: { "text-field": ["get", "text"], "text-font": ["Noto Sans Regular"], "text-size": 12, "text-allow-overlap": true, "text-ignore-placement": true },
          paint: { "text-color": "#1e3a5f", "text-halo-color": "#ffffff", "text-halo-width": 2 },
        },
        under,
      );
      map.addLayer({ id: "ruler-line", type: "line", source: "ruler", filter: ["==", "$type", "LineString"], layout: { "line-cap": "round" }, paint: { "line-color": "#f2b33d", "line-width": 3, "line-dasharray": [2, 1] } });
      map.addLayer({ id: "ruler-pts", type: "circle", source: "ruler", filter: ["==", "$type", "Point"], paint: { "circle-radius": 5, "circle-color": "#f2b33d", "circle-stroke-color": "#12181d", "circle-stroke-width": 2 } });
      map.addLayer({ id: "goto-ring", type: "circle", source: "goto", paint: { "circle-radius": 14, "circle-color": "rgba(242,179,61,0.15)", "circle-stroke-color": "#f2b33d", "circle-stroke-width": 3 } });
    }

    let hovering = false;
    const showCentre = () => {
      const c = map.getCenter();
      setGrid(toGrid({ lat: c.lat, lon: c.lng }));
    };
    /**
     * Where the grid's figures go [233]: along the bottom and up the left of the part of the map
     * that nothing covers. The bottom is the map's padding, which keeps clear of the page's sheet.
     * The left column starts at the top of these tools, which sit below the page's own buttons.
     */
    const labelPlace = (): GridLabels => {
      const el = map.getContainer();
      const w = el.clientWidth;
      const h = el.clientHeight;
      const top = toolsRef.current ? toolsRef.current.getBoundingClientRect().top - el.getBoundingClientRect().top : 0;
      const bottom = h - (map.getPadding().bottom ?? 0) - 12;
      const left = 14;
      const at = (x: number, y: number) => map.unproject([x, y]);
      return {
        row: at(w / 2, bottom).lat,
        column: at(left, h / 2).lng,
        // Clear of each other's corner: eastings right of the column, northings above the row.
        inside: { west: at(left + 20, 0).lng, east: at(w - 14, 0).lng, north: at(0, top).lat, south: at(0, bottom - 16).lat },
      };
    };
    const drawLines = () => {
      const spacing = gridSpacing(map.getZoom());
      if (!linesRef.current || !spacing) return src("mgrs")?.setData(EMPTY);
      const b = map.getBounds();
      src("mgrs")?.setData(gridLines({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, centreRef.current, spacing, labelPlace()));
    };
    const drawRuler = () => {
      const p = points.current;
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          ...p.map((q): GeoJSON.Feature => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [q.lon, q.lat] } })),
          ...(p.length === 2 ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: p.map((q) => [q.lon, q.lat]) } } as GeoJSON.Feature] : []),
        ],
      };
      src("ruler")?.setData(fc);
    };
    const onMove = (e: MapMouseEvent) => {
      hovering = true;
      setGrid(toGrid({ lat: e.lngLat.lat, lon: e.lngLat.lng }));
    };
    const onOut = () => {
      hovering = false;
      showCentre();
    };
    // A tap also sends mouse events, so it counts as hovering, and a touch screen never sends
    // "mouseout". Without this the box would keep the tapped point while the map is dragged [233].
    const onTouch = () => {
      hovering = false;
    };
    const onMoveEnd = () => {
      if (!hovering) showCentre();
      drawLines();
    };
    const onClick = (e: MapMouseEvent) => {
      const at = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      if (measuringRef.current) {
        // A third click starts a new measure.
        points.current = points.current.length >= 2 ? [at] : [...points.current, at];
        drawRuler();
        setMeasured(points.current.length === 2 ? measureText(points.current[0], points.current[1]) : "Click the second point");
        return;
      }
      if (!copyOnClick) return;
      const g = toGrid(at);
      navigator.clipboard?.writeText(g).then(
        () => say(`Copied ${g}`),
        () => say(g),
      );
    };
    // The buttons draw again through these.
    redrawRef.current = drawLines;
    clearRulerRef.current = () => {
      points.current = [];
      drawRuler();
    };
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("touchstart", onTouch);
    map.on("moveend", onMoveEnd);
    map.on("click", onClick);
    showCentre();
    drawLines();
    return () => {
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("touchstart", onTouch);
      map.off("moveend", onMoveEnd);
      map.off("click", onClick);
    };
  }, [mapRef, ready, below, copyOnClick]);

  const toggleLines = () => {
    linesRef.current = !lines;
    setLines(!lines);
    redrawRef.current();
    if (!lines && mapRef.current && !gridSpacing(mapRef.current.getZoom())) say("Zoom in to see the grid");
  };
  const toggleMeasure = () => {
    measuringRef.current = !measuring;
    setMeasuring(!measuring);
    setMeasured(measuring ? "" : "Click the first point");
    clearRulerRef.current();
  };
  const go = (e: FormEvent) => {
    e.preventDefault();
    const map = mapRef.current;
    const g = readGrid(`grid ${goto}`, centre);
    if (!g || !map) return say("Not a grid. Try DQ 586 101.");
    map.flyTo({ center: [g.pin.lon, g.pin.lat], zoom: Math.max(map.getZoom(), 15) });
    (map.getSource("goto") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [g.pin.lon, g.pin.lat] } }] });
    say(`Grid ${g.text}`);
  };

  if (!grid) return null;
  return (
    <div ref={toolsRef} className={styles.tools} style={{ top }}>
      <div className={styles.grid} title="MGRS grid of the point under the pointer, or of the map's centre">
        {grid}
      </div>
      <div className={styles.row}>
        <button type="button" className={styles.btn} aria-pressed={lines} onClick={toggleLines} title="Show the 1 km grid">
          Grid
        </button>
        <button type="button" className={styles.btn} aria-pressed={measuring} onClick={toggleMeasure} title="Distance and bearing between two points">
          Measure
        </button>
      </div>
      <form className={styles.row} onSubmit={go}>
        <input className={styles.input} value={goto} onChange={(e) => setGoto(e.target.value)} placeholder="Go to grid" aria-label="Go to grid" spellCheck={false} />
        <button type="submit" className={styles.btn}>
          Go
        </button>
      </form>
      {measuring && measured ? <div className={styles.out}>{measured}</div> : null}
      {note ? (
        <div className={styles.out} role="status">
          {note}
        </div>
      ) : null}
    </div>
  );
}
