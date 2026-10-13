/**
 * Map layer configuration, read from content/layers.json at build time.
 *
 * Layer types:
 * - "geojson": a vector file (usually under public/data/) drawn as fill,
 *   line or circle, optionally coloured by a property and clickable.
 * - "raster": XYZ or TMS image tiles, for example from a static tile folder
 *   or a tile server you host.
 * - "tenure-records" / "field-photos": the records and photos served by the
 *   tenure engine API. Keep at most one of each.
 *
 * Array order is drawing order: the first entry is drawn at the bottom.
 */

import layersJson from "@content/layers.json";

export type VectorKind = "fill" | "line" | "circle";

export interface ColorBy {
  /** Feature property whose value selects the colour. */
  field: string;
  /** property value -> colour; values not listed use style.color. */
  values: Record<string, string>;
}

export interface LayerStyle {
  kind?: VectorKind;
  color?: string;
  /** Fill layers: interior opacity (0-1) before the layer opacity slider. */
  fillOpacity?: number;
  /** Fill outline or line width in pixels. */
  lineWidth?: number;
  /** Line dash pattern, e.g. [2, 1]. */
  dash?: number[];
  /** Circle radius in pixels. */
  radius?: number;
  colorBy?: ColorBy;
}

export interface PopupConfig {
  /** Property used as the popup title. */
  title?: string;
  fields?: Array<{ key: string; label: string }>;
}

export interface LegendEntry {
  color: string;
  label: string;
}

export interface LayerConfig {
  id: string;
  name: string;
  type: "geojson" | "raster" | "tenure-records" | "field-photos";
  visible?: boolean;
  /** Initial opacity, 0-1. */
  opacity?: number;
  minzoom?: number;
  maxzoom?: number;
  attribution?: string;
  legend?: LegendEntry[];
  style?: LayerStyle;
  // geojson
  data?: string;
  popup?: PopupConfig;
  // raster
  tiles?: string[];
  tileSize?: number;
  scheme?: "xyz" | "tms";
}

const KNOWN_TYPES = new Set(["geojson", "raster", "tenure-records", "field-photos"]);

function loadLayers(): LayerConfig[] {
  const list = (layersJson as { layers?: LayerConfig[] }).layers ?? [];
  const seen = new Set<string>();
  for (const layer of list) {
    if (!layer.id || !layer.name) {
      throw new Error(`content/layers.json: every layer needs an "id" and a "name".`);
    }
    if (seen.has(layer.id)) {
      throw new Error(`content/layers.json: duplicate layer id "${layer.id}".`);
    }
    seen.add(layer.id);
    if (!KNOWN_TYPES.has(layer.type)) {
      throw new Error(
        `content/layers.json: layer "${layer.id}" has unknown type "${layer.type}". ` +
          `Use geojson, raster, tenure-records or field-photos.`
      );
    }
    if (layer.type === "geojson" && !layer.data) {
      throw new Error(`content/layers.json: geojson layer "${layer.id}" needs "data".`);
    }
    if (layer.type === "raster" && !(layer.tiles && layer.tiles.length > 0)) {
      throw new Error(`content/layers.json: raster layer "${layer.id}" needs "tiles".`);
    }
  }
  return list;
}

export const LAYERS: LayerConfig[] = loadLayers();

/** Swatch colour for the layer control. */
export function layerColor(layer: LayerConfig): string {
  return layer.style?.color ?? "#64748b";
}

/** Legend entries: explicit legend, else derived from style.colorBy. */
export function layerLegend(layer: LayerConfig): LegendEntry[] {
  if (layer.legend) return layer.legend;
  const colorBy = layer.style?.colorBy;
  if (!colorBy) return [];
  return Object.entries(colorBy.values).map(([label, color]) => ({ color, label }));
}

/** The MapLibre layer ids drawn for a geojson layer config. */
export function maplibreLayerIds(layer: LayerConfig): string[] {
  const kind = layer.style?.kind ?? "line";
  if (kind === "fill") return [`${layer.id}-fill`, `${layer.id}-outline`];
  return [`${layer.id}-${kind}`];
}

/** Ids of MapLibre layers that open a popup on click, mapped to their config. */
export const POPUP_LAYERS: Map<string, LayerConfig> = new Map(
  LAYERS.filter((l) => l.type === "geojson" && l.popup).flatMap((l) =>
    maplibreLayerIds(l).map((mlId) => [mlId, l] as [string, LayerConfig])
  )
);
