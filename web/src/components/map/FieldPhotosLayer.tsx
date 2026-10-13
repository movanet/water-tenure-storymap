"use client";

import React, { useEffect, useState } from "react";
import { Marker, Popup } from "react-map-gl/maplibre";
import { Camera } from "lucide-react";
import { useMapStore } from "@/store/mapStore";
import { LAYERS } from "@/lib/layers";
import { apiUrl, fetchApiJson } from "@/lib/tenureApi";
import { t } from "@/lib/site";

interface FieldPhoto {
  id: string;
  lon: number;
  lat: number;
  description: string | null;
  takenAt: string | null;
  thumbUrl: string;
  imageUrl: string;
}

interface PhotoFeature {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: {
    id?: string;
    description?: string | null;
    taken_at?: string | null;
    thumb_url?: string;
    image_url?: string;
  };
}

const LAYER_ID = LAYERS.find((l) => l.type === "field-photos")?.id;

function parsePhotos(data: unknown): FieldPhoto[] {
  const features = (data as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  return (features as PhotoFeature[])
    .filter(
      (f) =>
        f?.geometry?.type === "Point" &&
        Array.isArray(f.geometry.coordinates) &&
        f.geometry.coordinates.length >= 2 &&
        f.properties?.id
    )
    .map((f) => {
      const id = f.properties!.id!;
      return {
        id,
        lon: f.geometry!.coordinates![0],
        lat: f.geometry!.coordinates![1],
        description: f.properties!.description ?? null,
        takenAt: f.properties!.taken_at ?? null,
        thumbUrl: apiUrl(f.properties!.thumb_url ?? `/api/photos/${id}/thumb`),
        imageUrl: apiUrl(f.properties!.image_url ?? `/api/photos/${id}/image`),
      };
    });
}

/**
 * Geotagged field photos served by the API at /api/photos.geojson. Photos
 * linked to a sensitive record arrive with generalized coordinates. If the
 * API is not deployed the layer shows nothing.
 */
export default function FieldPhotosLayer() {
  const layer = useMapStore((s) => s.layers.find((l) => l.id === LAYER_ID));
  const [photos, setPhotos] = useState<FieldPhoto[]>([]);
  const [selected, setSelected] = useState<FieldPhoto | null>(null);

  useEffect(() => {
    if (!LAYER_ID) return;
    let cancelled = false;
    fetchApiJson("/api/photos.geojson").then((data) => {
      if (!cancelled) setPhotos(parsePhotos(data));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!layer || !layer.visible || photos.length === 0) return null;

  const opacity = layer.opacity / 100;

  return (
    <>
      {photos.map((photo) => (
        <Marker
          key={photo.id}
          longitude={photo.lon}
          latitude={photo.lat}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setSelected(photo);
          }}
        >
          <div
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-lg transition-transform hover:scale-110"
            style={{ backgroundColor: layer.color, opacity }}
            title={photo.description ?? t("fieldPhoto")}
          >
            <Camera className="h-4 w-4 text-black/80" />
          </div>
        </Marker>
      ))}

      {selected && (
        <Popup
          longitude={selected.lon}
          latitude={selected.lat}
          anchor="bottom"
          offset={18}
          closeButton={false}
          onClose={() => setSelected(null)}
          className="map-popup-container"
          maxWidth="280px"
        >
          <div
            className="w-[250px] rounded-lg border border-l-4 border-gray-200 bg-white p-3 shadow-xl"
            style={{ borderLeftColor: layer.color }}
          >
            <a
              href={selected.imageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 block"
              title={t("openImage")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.thumbUrl}
                alt={selected.description ?? t("fieldPhoto")}
                className="h-auto w-full rounded-md transition-opacity hover:opacity-90"
                loading="lazy"
              />
            </a>
            {selected.description && (
              <p className="mb-1 text-xs leading-relaxed text-gray-700">{selected.description}</p>
            )}
            {selected.takenAt && (
              <p className="font-mono text-[11px] text-gray-400">{selected.takenAt}</p>
            )}
            <button
              onClick={() => setSelected(null)}
              className="mt-2 w-full text-center text-[11px] text-gray-400 transition-colors hover:text-gray-700"
            >
              {t("close")}
            </button>
          </div>
        </Popup>
      )}
    </>
  );
}
