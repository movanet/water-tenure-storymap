"use client";

import React from "react";
import { Popup } from "react-map-gl/maplibre";
import { X } from "lucide-react";
import { t } from "@/lib/site";

export interface PopupData {
  title: string;
  properties: Array<{ label: string; value: string | number }>;
  /** Accent colour of the left border (the layer colour). */
  color?: string;
}

interface MapPopupProps {
  longitude: number;
  latitude: number;
  onClose: () => void;
  data: PopupData;
}

/** Property popup for features of the configured vector layers. */
export default function MapPopup({ longitude, latitude, onClose, data }: MapPopupProps) {
  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      onClose={onClose}
      closeButton={false}
      closeOnClick={false}
      anchor="bottom"
      offset={10}
      className="map-popup-container"
      maxWidth="320px"
    >
      <div
        className="min-w-[230px] rounded-lg border border-l-4 border-gray-200 bg-white p-4 shadow-xl"
        style={{ borderLeftColor: data.color ?? "#6b7280" }}
      >
        <div className="mb-3 flex items-start justify-between">
          <h3 className="pr-4 text-base font-semibold text-gray-900">{data.title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {data.properties.map((prop, idx) => (
            <div key={idx} className="flex justify-between gap-4 text-sm">
              <span className="shrink-0 text-gray-500">{prop.label}</span>
              <span className="text-right font-medium text-gray-900">{prop.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Popup>
  );
}
