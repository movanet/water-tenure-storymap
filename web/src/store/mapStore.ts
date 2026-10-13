import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LAYERS, layerColor } from "@/lib/layers";
import { findBasemap, site } from "@/lib/site";

/** Runtime state of one configured layer (content/layers.json). */
export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  /** 0-100, driven by the opacity slider. */
  opacity: number;
  color: string;
}

export interface MapViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

/** Display mode for the tenure records layer. */
export type TenureDisplayMode = "type" | "gap";

/** Multi-select filters for tenure records. */
export interface TenureFilters {
  tenureTypes: string[];
  useTypes: string[];
  legalSecurity: string[];
  perceivedSecurity: string[];
  villages: string[];
  diSchemes: string[];
  seasons: string[];
}

export const EMPTY_TENURE_FILTERS: TenureFilters = {
  tenureTypes: [],
  useTypes: [],
  legalSecurity: [],
  perceivedSecurity: [],
  villages: [],
  diSchemes: [],
  seasons: [],
};

export function hasActiveTenureFilters(f: TenureFilters): boolean {
  return Object.values(f).some((v) => v.length > 0);
}

/** Layer state as configured, before any user interaction. */
export const DEFAULT_LAYERS: Layer[] = LAYERS.map((config) => ({
  id: config.id,
  name: config.name,
  visible: config.visible ?? true,
  opacity: Math.round((config.opacity ?? 1) * 100),
  color: layerColor(config),
}));

interface MapState {
  basemapId: string;
  layers: Layer[];
  currentView: MapViewState;
  tenureFilters: TenureFilters;
  tenureDisplayMode: TenureDisplayMode;

  setBasemap: (id: string) => void;
  toggleLayer: (layerId: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  setLayersVisibility: (visibleIds: string[]) => void;
  resetLayers: () => void;
  setLayerOpacity: (layerId: string, opacity: number) => void;
  setCurrentView: (view: MapViewState) => void;
  toggleTenureFilterValue: (key: keyof TenureFilters, value: string) => void;
  setTenureFilters: (filters: TenureFilters) => void;
  clearTenureFilters: () => void;
  setTenureDisplayMode: (mode: TenureDisplayMode) => void;
}

/**
 * Map UI state shared by the map, its controls and the URL sync. Only the
 * chosen basemap is remembered between visits (localStorage); layer
 * visibility always starts from content/layers.json so configuration
 * changes take effect for returning visitors.
 */
export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      basemapId: findBasemap(site.map.defaultBasemap).id,
      layers: DEFAULT_LAYERS,
      currentView: site.map.initialView,
      tenureFilters: EMPTY_TENURE_FILTERS,
      tenureDisplayMode: "type",

      setBasemap: (id) => set({ basemapId: findBasemap(id).id }),

      toggleLayer: (layerId) =>
        set((state) => ({
          layers: state.layers.map((layer) =>
            layer.id === layerId ? { ...layer, visible: !layer.visible } : layer
          ),
        })),

      setLayerVisible: (layerId, visible) =>
        set((state) => ({
          layers: state.layers.map((layer) =>
            layer.id === layerId ? { ...layer, visible } : layer
          ),
        })),

      setLayersVisibility: (visibleIds) =>
        set((state) => ({
          layers: state.layers.map((layer) => ({
            ...layer,
            visible: visibleIds.includes(layer.id),
          })),
        })),

      resetLayers: () => set({ layers: DEFAULT_LAYERS }),

      setLayerOpacity: (layerId, opacity) =>
        set((state) => ({
          layers: state.layers.map((layer) =>
            layer.id === layerId ? { ...layer, opacity } : layer
          ),
        })),

      setCurrentView: (view) => set({ currentView: view }),

      toggleTenureFilterValue: (key, value) =>
        set((state) => {
          const current = state.tenureFilters[key];
          const next = current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value];
          return { tenureFilters: { ...state.tenureFilters, [key]: next } };
        }),

      setTenureFilters: (filters) => set({ tenureFilters: filters }),

      clearTenureFilters: () => set({ tenureFilters: EMPTY_TENURE_FILTERS }),

      setTenureDisplayMode: (mode) => set({ tenureDisplayMode: mode }),
    }),
    {
      name: "water-tenure-storymap",
      partialize: (state) => ({ basemapId: state.basemapId }),
      merge: (persisted, current) => {
        const id = (persisted as { basemapId?: unknown } | undefined)?.basemapId;
        return {
          ...current,
          basemapId: findBasemap(typeof id === "string" ? id : null).id,
        };
      },
    }
  )
);
