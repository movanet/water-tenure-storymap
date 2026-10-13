"use client";

import { useEffect, useRef } from "react";
import { useMapStore } from "@/store/mapStore";
import { parseUrlState, serializeUrlState } from "@/lib/urlState";
import { LAYERS } from "@/lib/layers";

const TENURE_LAYER_ID = LAYERS.find((l) => l.type === "tenure-records")?.id;

/**
 * Shareable map state: mirrors the map view, visible layers, display
 * mode and tenure filters into the page URL
 * (?lat=&lon=&z=&layers=&mode=&tt=&ut=&ls=&ps=&vil=&di=&season=).
 *
 * On mount it reads the URL into the store; afterwards every relevant
 * store change is written back with history.replaceState (debounced) so
 * the address bar always holds a shareable link without polluting
 * browser history.
 */
export default function MapUrlSync() {
  const hydrated = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentView = useMapStore((s) => s.currentView);
  const layers = useMapStore((s) => s.layers);
  const mode = useMapStore((s) => s.tenureDisplayMode);
  const filters = useMapStore((s) => s.tenureFilters);

  // 1. Read URL -> store, once on mount.
  useEffect(() => {
    const parsed = parseUrlState(window.location.search);
    const store = useMapStore.getState();
    if (parsed.view) store.setCurrentView(parsed.view);
    if (parsed.layers !== null) {
      store.setLayersVisibility(parsed.layers);
    } else if (
      Object.values(parsed.filters).some((v) => v.length > 0) ||
      parsed.mode === "gap"
    ) {
      // Deep links that carry tenure state (e.g. "view on map" from the
      // typology page) should always show the tenure layer.
      if (TENURE_LAYER_ID) store.setLayerVisible(TENURE_LAYER_ID, true);
    }
    if (parsed.mode) store.setTenureDisplayMode(parsed.mode);
    if (Object.values(parsed.filters).some((v) => v.length > 0)) {
      store.setTenureFilters(parsed.filters);
    }
    hydrated.current = true;
  }, []);

  // 2. Store -> URL, debounced replaceState.
  useEffect(() => {
    if (!hydrated.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const query = serializeUrlState({
        view: currentView,
        layers,
        mode,
        filters,
      });
      const url = `${window.location.pathname}?${query}${window.location.hash}`;
      window.history.replaceState(null, "", url);
    }, 400);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [currentView, layers, mode, filters]);

  return null;
}
