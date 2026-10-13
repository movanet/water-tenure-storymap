"use client";

import React, { useState } from "react";
import { Check, Map } from "lucide-react";
import { useMapStore } from "@/store/mapStore";
import { site, t } from "@/lib/site";

/** Basemap picker; the list comes from "map.basemaps" in content/site.json. */
export default function BasemapSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const basemapId = useMapStore((s) => s.basemapId);
  const setBasemap = useMapStore((s) => s.setBasemap);

  if (site.map.basemaps.length < 2) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg border border-gray-200 bg-white p-3 text-gray-800 shadow-md transition-colors hover:bg-gray-50"
        title={t("basemap")}
        aria-label={t("basemap")}
        aria-expanded={isOpen}
      >
        <Map className="h-5 w-5 text-brand" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-14 z-50 max-h-[520px] min-w-[240px] overflow-y-auto rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
            <h3 className="mb-3 font-semibold text-gray-900">{t("basemap")}</h3>
            <div className="space-y-1.5">
              {site.map.basemaps.map((basemap) => (
                <button
                  key={basemap.id}
                  onClick={() => {
                    setBasemap(basemap.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-2.5 text-sm transition-all ${
                    basemapId === basemap.id
                      ? "bg-brand text-white"
                      : "bg-gray-50 text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span className="font-medium">{basemap.name}</span>
                  {basemapId === basemap.id && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
