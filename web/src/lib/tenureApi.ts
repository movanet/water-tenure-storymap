import type { TenureFilters } from "@/store/mapStore";
import { site } from "@/lib/site";

/**
 * Shared helpers for the tenure engine API (see docs/API.md). Every fetch in
 * the UI fails silently to an empty state, so the site keeps working while
 * the API is not deployed. With "api.enabled": false in content/site.json
 * the UI makes no API calls at all.
 */

/** Absolute or same-origin URL of an API path such as "/api/health". */
export function apiUrl(path: string): string {
  return `${site.api.baseUrl.replace(/\/$/, "")}${path}`;
}

/** fetch() of an API path returning parsed JSON, or null on any failure. */
export async function fetchApiJson(path: string): Promise<unknown> {
  if (!site.api.enabled) return null;
  try {
    const res = await fetch(apiUrl(path));
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export interface TenureRecordProperties {
  id: string;
  tenure_type: string;
  use_type?: string;
  village?: string;
  title?: string;
  legal_security?: number | string;
  perceived_security?: number | string;
  actor_group?: string;
  di_scheme?: string;
  season_relevance?: string[];
  confidence?: string;
  description?: string;
  source?: string;
  narrative_ref?: string;
  quote_ref?: string;
  sensitivity?: string;
  fuzzed?: boolean;
}

export interface TenureRecord extends TenureRecordProperties {
  lon: number;
  lat: number;
}

export interface TypologyStats {
  by_tenure_type?: Record<string, number>;
  by_use_type?: Record<string, number>;
  by_legal_security?: Record<string, number>;
  by_perceived_security?: Record<string, number>;
  by_village?: Record<string, number>;
  by_di_scheme?: Record<string, number>;
  by_confidence?: Record<string, number>;
  total?: number;
}

/**
 * Build the API query string from the active filters. Filter params are
 * comma-separated multi-values:
 * tenure_type=&use_type=&legal_security=&perceived_security=&village=&di_scheme=&season=
 */
export function buildTenureQuery(filters: TenureFilters): string {
  const mapping: Array<[string, string[]]> = [
    ["tenure_type", filters.tenureTypes],
    ["use_type", filters.useTypes],
    ["legal_security", filters.legalSecurity],
    ["perceived_security", filters.perceivedSecurity],
    ["village", filters.villages],
    ["di_scheme", filters.diSchemes],
    ["season", filters.seasons],
  ];
  return mapping
    .filter(([, values]) => values.length > 0)
    .map(
      ([key, values]) =>
        `${key}=${values.map((v) => encodeURIComponent(v)).join(",")}`
    )
    .join("&");
}

interface GeoJsonFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: Partial<TenureRecordProperties>;
}

/**
 * Representative point for a feature: Point coordinates directly,
 * average of the outer ring for Polygon / first polygon of MultiPolygon.
 */
function featurePoint(geometry: GeoJsonFeature["geometry"]): [number, number] | null {
  if (!geometry || !geometry.coordinates) return null;
  const coords = geometry.coordinates;
  if (geometry.type === "Point" && Array.isArray(coords) && coords.length >= 2) {
    const [lon, lat] = coords as [number, number];
    return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
  }
  let ring: unknown = null;
  if (geometry.type === "Polygon" && Array.isArray(coords)) ring = coords[0];
  if (geometry.type === "MultiPolygon" && Array.isArray(coords)) {
    const first = coords[0];
    if (Array.isArray(first)) ring = first[0];
  }
  if (!Array.isArray(ring) || ring.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of ring) {
    if (Array.isArray(pt) && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
      sx += pt[0];
      sy += pt[1];
      n += 1;
    }
  }
  return n > 0 ? [sx / n, sy / n] : null;
}

/** Parse a FeatureCollection payload into flat records (defensive). */
export function parseTenureFeatureCollection(data: unknown): TenureRecord[] {
  if (!data || typeof data !== "object") return [];
  const features = (data as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  const records: TenureRecord[] = [];
  for (const f of features as GeoJsonFeature[]) {
    const props = f?.properties;
    if (!props || !props.id || !props.tenure_type) continue;
    const point = featurePoint(f.geometry);
    if (!point) continue;
    records.push({
      ...(props as TenureRecordProperties),
      lon: point[0],
      lat: point[1],
    });
  }
  return records;
}

export interface LinkedPhoto {
  id: string;
  thumbUrl: string;
  imageUrl: string;
}

/**
 * Parse the response of GET /api/tenure-records/{id}/photos ({photos: [...]});
 * a bare array or a FeatureCollection is accepted too, anything else yields [].
 */
export function parseLinkedPhotos(data: unknown): LinkedPhoto[] {
  if (!data || typeof data !== "object") return [];
  let items: unknown[] = [];
  if (Array.isArray(data)) items = data;
  else if (Array.isArray((data as { photos?: unknown }).photos))
    items = (data as { photos: unknown[] }).photos;
  else if (Array.isArray((data as { features?: unknown }).features))
    items = ((data as { features: unknown[] }).features).map(
      (f) => (f as { properties?: unknown }).properties
    );
  const photos: LinkedPhoto[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as { id?: unknown; thumb_url?: unknown; image_url?: unknown };
    const id = typeof obj.id === "string" || typeof obj.id === "number" ? String(obj.id) : null;
    if (!id) continue;
    photos.push({
      id,
      thumbUrl: apiUrl(
        typeof obj.thumb_url === "string" ? obj.thumb_url : `/api/photos/${id}/thumb`
      ),
      imageUrl: apiUrl(
        typeof obj.image_url === "string" ? obj.image_url : `/api/photos/${id}/image`
      ),
    });
  }
  return photos;
}
