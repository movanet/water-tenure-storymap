import {
  EMPTY_TENURE_FILTERS,
  hasActiveTenureFilters,
  type Layer,
  type MapViewState,
  type TenureDisplayMode,
  type TenureFilters,
} from "@/store/mapStore";

/**
 * Shareable map state <-> URL query string.
 *
 * Params: ?lat=&lon=&z=&layers=&mode=&tt=&ut=&ls=&ps=&vil=&di=&season=
 * - lat / lon / z : map view (numbers)
 * - layers        : comma-separated ids of VISIBLE layers (omitted when
 *                   all layers are visible)
 * - mode          : "gap" for the security-gap display mode (omitted for
 *                   the default color-by-type mode)
 * - tt / ut / ls / ps / vil / di / season : comma-separated multi-value
 *   tenure filters (tenure type, use type, legal security, perceived
 *   security, village, irrigation scheme, season). Values are
 *   encodeURIComponent-encoded individually, joined with literal commas
 *   so shared links stay readable.
 */

export interface UrlMapState {
  view: MapViewState | null;
  /** Visible layer ids; null = param absent (keep current visibility). */
  layers: string[] | null;
  mode: TenureDisplayMode | null;
  filters: TenureFilters;
}

const FILTER_PARAMS: Array<[keyof TenureFilters, string]> = [
  ["tenureTypes", "tt"],
  ["useTypes", "ut"],
  ["legalSecurity", "ls"],
  ["perceivedSecurity", "ps"],
  ["villages", "vil"],
  ["diSchemes", "di"],
  ["seasons", "season"],
];

function encodeList(values: string[]): string {
  return values.map((v) => encodeURIComponent(v)).join(",");
}

function decodeList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => {
      try {
        return decodeURIComponent(v).trim();
      } catch {
        return v.trim();
      }
    })
    .filter((v) => v.length > 0);
}

export function parseUrlState(search: string): UrlMapState {
  const params = new URLSearchParams(search);

  const lat = parseFloat(params.get("lat") ?? "");
  const lon = parseFloat(params.get("lon") ?? "");
  const z = parseFloat(params.get("z") ?? "");
  const view =
    Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(z)
      ? { latitude: lat, longitude: lon, zoom: z }
      : null;

  const layersRaw = params.get("layers");
  const layers = layersRaw === null ? null : decodeList(layersRaw);

  const modeRaw = params.get("mode");
  const mode: TenureDisplayMode | null =
    modeRaw === "gap" ? "gap" : modeRaw === "type" ? "type" : null;

  const filters: TenureFilters = { ...EMPTY_TENURE_FILTERS };
  for (const [key, param] of FILTER_PARAMS) {
    filters[key] = decodeList(params.get(param));
  }

  return { view, layers, mode, filters };
}

export interface SerializableState {
  view: MapViewState;
  layers: Layer[];
  mode: TenureDisplayMode;
  filters: TenureFilters;
}

export function serializeUrlState(state: SerializableState): string {
  const parts: string[] = [];

  parts.push(`lat=${state.view.latitude.toFixed(5)}`);
  parts.push(`lon=${state.view.longitude.toFixed(5)}`);
  parts.push(`z=${state.view.zoom.toFixed(2)}`);

  // Only mirror layer visibility when it differs from "everything on".
  const hidden = state.layers.some((l) => !l.visible);
  if (hidden) {
    const visible = state.layers.filter((l) => l.visible).map((l) => l.id);
    parts.push(`layers=${encodeList(visible)}`);
  }

  if (state.mode === "gap") parts.push("mode=gap");

  if (hasActiveTenureFilters(state.filters)) {
    for (const [key, param] of FILTER_PARAMS) {
      const values = state.filters[key];
      if (values.length > 0) parts.push(`${param}=${encodeList(values)}`);
    }
  }

  return parts.join("&");
}
