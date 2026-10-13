"use client";

import React from "react";
import { Layer as MapLayer, Source } from "react-map-gl/maplibre";
import type { ExpressionSpecification } from "maplibre-gl";
import { LAYERS, type LayerConfig } from "@/lib/layers";
import { useMapStore, type Layer } from "@/store/mapStore";

/**
 * Draws the "geojson" and "raster" layers of content/layers.json in array
 * order (first = bottom). Visibility and opacity follow the layer control.
 * The API-backed layers (tenure records, field photos) are DOM markers and
 * are rendered by their own components on top of these.
 */

function colorExpression(config: LayerConfig): string | ExpressionSpecification {
  const style = config.style ?? {};
  const base = style.color ?? "#64748b";
  const colorBy = style.colorBy;
  if (!colorBy || Object.keys(colorBy.values).length === 0) return base;
  const pairs = Object.entries(colorBy.values).flat();
  return [
    "match",
    ["to-string", ["get", colorBy.field]],
    ...pairs,
    base,
  ] as unknown as ExpressionSpecification;
}

/** Optional source/layer props; MapLibre rejects keys that are present but undefined. */
function attribution(config: LayerConfig) {
  return config.attribution ? { attribution: config.attribution } : {};
}

function zoomRange(config: LayerConfig) {
  return {
    ...(config.minzoom !== undefined ? { minzoom: config.minzoom } : {}),
    ...(config.maxzoom !== undefined ? { maxzoom: config.maxzoom } : {}),
  };
}

function GeoJsonLayer({ config, state }: { config: LayerConfig; state: Layer }) {
  const style = config.style ?? {};
  const kind = style.kind ?? "line";
  const opacity = state.opacity / 100;
  const visibility = state.visible ? "visible" : "none";
  const color = colorExpression(config);
  const dash = style.dash && style.dash.length > 0 ? { "line-dasharray": style.dash } : {};

  return (
    <Source id={`src-${config.id}`} type="geojson" data={config.data!} {...attribution(config)}>
      {kind === "fill" && (
        <MapLayer
          id={`${config.id}-fill`}
          type="fill"
          {...zoomRange(config)}
          layout={{ visibility }}
          paint={{
            "fill-color": color,
            "fill-opacity": (style.fillOpacity ?? 0.2) * opacity,
          }}
        />
      )}
      {kind === "fill" && (
        <MapLayer
          id={`${config.id}-outline`}
          type="line"
          {...zoomRange(config)}
          layout={{ visibility }}
          paint={{
            "line-color": color,
            "line-width": style.lineWidth ?? 1.5,
            "line-opacity": opacity,
            ...dash,
          }}
        />
      )}
      {kind === "line" && (
        <MapLayer
          id={`${config.id}-line`}
          type="line"
          {...zoomRange(config)}
          layout={{ visibility, "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": color,
            "line-width": style.lineWidth ?? 2,
            "line-opacity": opacity,
            ...dash,
          }}
        />
      )}
      {kind === "circle" && (
        <MapLayer
          id={`${config.id}-circle`}
          type="circle"
          {...zoomRange(config)}
          layout={{ visibility }}
          paint={{
            "circle-color": color,
            "circle-radius": style.radius ?? 5,
            "circle-opacity": 0.9 * opacity,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.2,
            "circle-stroke-opacity": opacity,
          }}
        />
      )}
    </Source>
  );
}

function RasterLayer({ config, state }: { config: LayerConfig; state: Layer }) {
  return (
    <Source
      id={`src-${config.id}`}
      type="raster"
      tiles={config.tiles}
      tileSize={config.tileSize ?? 256}
      scheme={config.scheme ?? "xyz"}
      {...attribution(config)}
      {...zoomRange(config)}
    >
      <MapLayer
        id={`${config.id}-raster`}
        type="raster"
        layout={{ visibility: state.visible ? "visible" : "none" }}
        paint={{ "raster-opacity": state.opacity / 100 }}
      />
    </Source>
  );
}

export default function ConfiguredLayers() {
  const layers = useMapStore((s) => s.layers);
  return (
    <>
      {LAYERS.map((config) => {
        const state = layers.find((l) => l.id === config.id);
        if (!state) return null;
        if (config.type === "geojson") {
          return <GeoJsonLayer key={config.id} config={config} state={state} />;
        }
        if (config.type === "raster") {
          return <RasterLayer key={config.id} config={config} state={state} />;
        }
        return null;
      })}
    </>
  );
}
