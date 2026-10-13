"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import Map, {
  NavigationControl,
  ScaleControl,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import ConfiguredLayers from "./ConfiguredLayers";
import FieldPhotosLayer from "./FieldPhotosLayer";
import TenureRecordsLayer from "./TenureRecordsLayer";
import MapPopup, { type PopupData } from "./MapPopup";
import { useMapStore } from "@/store/mapStore";
import { findBasemap, site, type BasemapConfig } from "@/lib/site";
import { POPUP_LAYERS } from "@/lib/layers";

interface MapViewProps {
  initialViewState?: {
    longitude: number;
    latitude: number;
    zoom: number;
  };
  children?: React.ReactNode;
  onMapLoad?: (map: MapRef) => void;
}

/**
 * Resolve a basemap into a MapLibre style: XYZ tile templates (containing
 * "{z}") become an inline raster style, anything else is used as a hosted
 * style.json URL.
 */
function resolveMapStyle(basemap: BasemapConfig): string | StyleSpecification {
  if (!basemap.url.includes("{z}")) return basemap.url;
  return {
    version: 8,
    sources: {
      "basemap-raster": {
        type: "raster",
        tiles: [basemap.url],
        tileSize: 256,
        attribution: basemap.attribution ?? "",
      },
    },
    layers: [{ id: "basemap-raster-layer", type: "raster", source: "basemap-raster" }],
  };
}

interface PopupState {
  longitude: number;
  latitude: number;
  data: PopupData;
}

const INTERACTIVE_LAYER_IDS = [...POPUP_LAYERS.keys()];

export default function MapView({
  initialViewState = site.map.initialView,
  children,
  onMapLoad,
}: MapViewProps) {
  const mapRef = useRef<MapRef>(null);
  const basemapId = useMapStore((s) => s.basemapId);
  const layers = useMapStore((s) => s.layers);
  const setCurrentView = useMapStore((s) => s.setCurrentView);
  const [loaded, setLoaded] = useState(false);
  const [cursor, setCursor] = useState<string>("");
  const [popup, setPopup] = useState<PopupState | null>(null);

  const mapStyle = useMemo(() => resolveMapStyle(findBasemap(basemapId)), [basemapId]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    if (mapRef.current && onMapLoad) onMapLoad(mapRef.current);
  }, [onMapLoad]);

  // Keep currentView fresh so the shareable URL (MapUrlSync) can mirror it.
  const handleMoveEnd = useCallback(
    (e: ViewStateChangeEvent) => {
      setCurrentView({
        longitude: e.viewState.longitude,
        latitude: e.viewState.latitude,
        zoom: e.viewState.zoom,
      });
    },
    [setCurrentView]
  );

  // Click on a configured vector layer with a "popup" block.
  const handleClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      const config = feature ? POPUP_LAYERS.get(feature.layer.id) : undefined;
      const state = config ? layers.find((l) => l.id === config.id) : undefined;
      if (!feature || !config?.popup || !state?.visible) {
        setPopup(null);
        return;
      }
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const titleKey = config.popup.title;
      const title =
        (titleKey && props[titleKey] !== undefined ? String(props[titleKey]) : "") ||
        config.name;
      const rows = (config.popup.fields ?? [])
        .filter((f) => props[f.key] !== undefined && props[f.key] !== null && props[f.key] !== "")
        .map((f) => ({ label: f.label, value: String(props[f.key]) }));
      setPopup({
        longitude: e.lngLat.lng,
        latitude: e.lngLat.lat,
        data: { title, properties: rows, color: state.color },
      });
    },
    [layers]
  );

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Map
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onLoad={handleLoad}
        onIdle={() => setLoaded(true)}
        onMoveEnd={handleMoveEnd}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        onClick={handleClick}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("")}
        cursor={cursor}
        reuseMaps
      >
        <NavigationControl position="top-left" />
        <ScaleControl position="bottom-right" />
        <ConfiguredLayers />
        <FieldPhotosLayer />
        <TenureRecordsLayer />
        {popup && (
          <MapPopup
            longitude={popup.longitude}
            latitude={popup.latitude}
            data={popup.data}
            onClose={() => setPopup(null)}
          />
        )}
        {children}
      </Map>

      {/* Loading shimmer while MapLibre initializes */}
      {!loaded && (
        <div
          className="pointer-events-none absolute inset-0 z-10 animate-pulse bg-gray-100"
          aria-hidden="true"
        >
          <div className="h-full w-full bg-gradient-to-br from-gray-100 via-gray-200 to-gray-100" />
        </div>
      )}
    </div>
  );
}
