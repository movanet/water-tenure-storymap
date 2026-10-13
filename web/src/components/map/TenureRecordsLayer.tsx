"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Marker } from "react-map-gl/maplibre";
import { useMapStore } from "@/store/mapStore";
import { securityColor, tenureColor } from "@/lib/tenureColors";
import {
  buildTenureQuery,
  fetchApiJson,
  parseTenureFeatureCollection,
  type TenureRecord,
} from "@/lib/tenureApi";
import { getTenureType } from "@/data/tenureVocab";
import { LAYERS } from "@/lib/layers";
import TenurePopup from "./TenurePopup";

const LAYER_ID = LAYERS.find((l) => l.type === "tenure-records")?.id;

/**
 * Tenure records served by the API at /api/tenure-records.geojson, filtered
 * by the active tenure filters. If the API is not deployed the layer shows
 * nothing.
 *
 * Display modes:
 * - "type" (default): marker fill = tenure type colour.
 * - "gap" (security gap): fill = legal security, ring = perceived
 *   security (4-step light-to-dark ramp, NA/NR gray).
 */
export default function TenureRecordsLayer() {
  const layer = useMapStore((s) => s.layers.find((l) => l.id === LAYER_ID));
  const filters = useMapStore((s) => s.tenureFilters);
  const mode = useMapStore((s) => s.tenureDisplayMode);
  const [records, setRecords] = useState<TenureRecord[]>([]);
  const [selected, setSelected] = useState<TenureRecord | null>(null);

  const query = useMemo(() => buildTenureQuery(filters), [filters]);

  useEffect(() => {
    if (!LAYER_ID) return;
    let cancelled = false;
    fetchApiJson(`/api/tenure-records.geojson${query ? `?${query}` : ""}`).then((data) => {
      if (cancelled) return;
      const next = data ? parseTenureFeatureCollection(data) : [];
      setRecords(next);
      // Close a popup whose record disappeared after a filter change.
      setSelected((prev) => (prev && next.some((r) => r.id === prev.id) ? prev : null));
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  if (!layer || !layer.visible || records.length === 0) return null;

  const opacity = layer.opacity / 100;

  return (
    <>
      {records.map((record) => {
        const type = getTenureType(record.tenure_type);
        const legal = record.legal_security ?? type?.legal_security;
        const perceived = record.perceived_security ?? type?.perceived_security;
        const fill = mode === "gap" ? securityColor(legal) : tenureColor(record.tenure_type);
        const ring = mode === "gap" ? securityColor(perceived) : "#ffffff";
        return (
          <Marker
            key={record.id}
            longitude={record.lon}
            latitude={record.lat}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setSelected(record);
            }}
          >
            <div
              className="h-[18px] w-[18px] cursor-pointer rounded-full transition-transform hover:scale-125"
              style={{
                backgroundColor: fill,
                opacity,
                border: `3px solid ${ring}`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 1px 3px rgba(0,0,0,0.3)",
              }}
              title={record.title ?? type?.label ?? record.tenure_type}
            />
          </Marker>
        );
      })}

      {selected && <TenurePopup record={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
