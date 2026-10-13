/**
 * Site configuration, read from content/site.json at build time.
 *
 * Every user-facing string, colour, link and map default lives in that file
 * so a deployer edits content, not code. Missing optional keys fall back to
 * the defaults below; edit content/site.json and rebuild to change them.
 */

import siteJson from "@content/site.json";

export interface MapViewConfig {
  longitude: number;
  latitude: number;
  zoom: number;
}

export interface BasemapConfig {
  id: string;
  name: string;
  /** XYZ tile template containing {z}/{x}/{y}, or a MapLibre style.json URL. */
  url: string;
  attribution?: string;
}

export interface LinkConfig {
  label: string;
  href: string;
}

export interface NavItem extends LinkConfig {
  /** "home" renders a house icon next to (or instead of) the label. */
  icon?: "home";
}

export interface ImageConfig {
  src: string;
  alt: string;
}

export interface SiteConfig {
  lang: string;
  name: string;
  shortName: string;
  description: string;
  banner?: string;
  logo?: { src: string; alt: string; width?: number; height?: number };
  colors: { brand: string; accent: string; footer: string };
  nav: NavItem[];
  home: {
    hero: ImageConfig[];
    mapHeading?: string;
    introHeading?: string;
    intro?: string;
    introLink?: LinkConfig;
    galleryCount?: number;
    galleryLink?: LinkConfig;
  };
  map: {
    initialView: MapViewConfig;
    defaultBasemap: string;
    basemaps: BasemapConfig[];
  };
  api: { enabled: boolean; baseUrl: string };
  stories: { breadcrumb: string; heading: string };
  gallery: { heading: string; pageSize: number };
  typology: { heading: string; intro: string };
  footer: {
    orgName?: string;
    lines?: string[];
    email?: string;
    phone?: string;
    links?: Array<{ label: string; url: string }>;
    copyright?: string;
  };
  labels: Record<string, string>;
}

const DEFAULT_LABELS: Record<string, string> = {
  home: "Home",
  openMenu: "Open menu",
  closeMenu: "Close menu",
  close: "Close",
  layers: "Layers",
  layersTitle: "Data layers",
  layersHint: "Toggle visibility and adjust opacity",
  opacity: "Opacity",
  layersVisible: "{visible} of {total} layers visible",
  basemap: "Basemap",
  copyView: "Copy view",
  copied: "Copied",
  copyViewHint: "Copy a shareable link to this view",
  tenure: "Tenure",
  tenureFilterTitle: "Tenure records filter",
  recordsMatch: "{count} matching records",
  clearAll: "Clear all",
  colorBy: "Color markers by",
  colorByType: "Tenure type",
  colorByGap: "Security gap",
  gapHint:
    "Fill = legal security, ring = perceived security (light 1 to dark 4; gray = not analyzed or not rated).",
  analyzedTypes: "Tenure types analyzed",
  moreTypes: "More FAO framework categories",
  useType: "Use type",
  legalSecurity: "Legal security",
  perceivedSecurity: "Perceived security",
  village: "Village",
  villagePlaceholder: "Type a village name",
  add: "Add",
  scheme: "Irrigation scheme",
  noScheme: "No scheme",
  season: "Season",
  confidence: "Confidence",
  use: "Use",
  actor: "Actor",
  fuzzedNote: "Location generalized to protect a sensitive arrangement.",
  readInStory: "Read in story",
  source: "Source",
  fieldPhoto: "Field photo",
  openImage: "Open full image",
  linkedPhoto: "Linked field photo",
  search: "Search",
  openStory: "Open",
  copyLink: "Copy link",
  itemsFound: "{count} items found",
  backToStories: "Back to stories",
  enlargeImage: "Enlarge image",
  firstPage: "First page",
  previousPage: "Previous page",
  nextPage: "Next page",
  lastPage: "Last page",
  securityScale: "Security scale",
  viewOnMap: "View on map",
  faoRow: "FAO framework row",
  notAnalyzed: "Not analyzed in this assessment",
  noStories: "No stories match your search.",
  previousPicture: "Previous picture",
  nextPicture: "Next picture",
};

const raw = siteJson as unknown as Partial<SiteConfig>;

export const site: SiteConfig = {
  lang: raw.lang ?? "en",
  name: raw.name ?? "Water Tenure Storymap",
  shortName: raw.shortName ?? raw.name ?? "Water Tenure",
  description: raw.description ?? "",
  banner: raw.banner,
  logo: raw.logo,
  colors: {
    brand: raw.colors?.brand ?? "#0d9ed3",
    accent: raw.colors?.accent ?? "#ef8e57",
    footer: raw.colors?.footer ?? raw.colors?.brand ?? "#25a8d7",
  },
  nav: raw.nav ?? [{ label: "Home", href: "/", icon: "home" }],
  home: { hero: [], ...raw.home },
  map: {
    initialView: raw.map?.initialView ?? { longitude: 0, latitude: 0, zoom: 2 },
    defaultBasemap: raw.map?.defaultBasemap ?? raw.map?.basemaps?.[0]?.id ?? "osm",
    basemaps:
      raw.map?.basemaps && raw.map.basemaps.length > 0
        ? raw.map.basemaps
        : [
            {
              id: "osm",
              name: "OpenStreetMap",
              url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              attribution: "&copy; OpenStreetMap contributors",
            },
          ],
  },
  api: { enabled: raw.api?.enabled ?? true, baseUrl: raw.api?.baseUrl ?? "" },
  stories: { breadcrumb: "Story map", heading: "Stories", ...raw.stories },
  gallery: { heading: "Gallery", pageSize: 12, ...raw.gallery },
  typology: { heading: "Water tenure typology", intro: "", ...raw.typology },
  footer: raw.footer ?? {},
  labels: { ...DEFAULT_LABELS, ...raw.labels },
};

/** UI label by key, with {placeholder} substitution. Unknown keys echo the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let text = site.labels[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/** The basemap with the given id, else the configured default, else the first. */
export function findBasemap(id: string | null | undefined): BasemapConfig {
  return (
    site.map.basemaps.find((b) => b.id === id) ??
    site.map.basemaps.find((b) => b.id === site.map.defaultBasemap) ??
    site.map.basemaps[0]
  );
}
