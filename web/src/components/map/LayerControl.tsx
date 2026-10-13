"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";
import { useMapStore } from "@/store/mapStore";
import { LAYERS, layerLegend } from "@/lib/layers";
import { t } from "@/lib/site";

const LEGENDS = new Map(LAYERS.map((l) => [l.id, layerLegend(l)]));

/** Layer toggles, opacity sliders and legends for content/layers.json. */
export default function LayerControl() {
  const [isOpen, setIsOpen] = useState(false);
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const setLayerOpacity = useMapStore((s) => s.setLayerOpacity);

  // The slider shows 0-10; the store keeps 0-100.
  const toDisplayValue = (opacity: number) => Math.round(opacity / 10);
  const toStoreValue = (display: number) => display * 10;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-800 shadow-md transition-colors hover:bg-gray-50"
        title={t("layersTitle")}
        aria-expanded={isOpen}
      >
        <Layers className="h-5 w-5 text-brand" />
        <span className="text-sm font-medium">{t("layers")}</span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-14 z-50 max-h-[440px] w-[300px] max-w-[calc(100vw-44px)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl md:max-h-[520px] md:w-[320px]">
            <div className="border-b border-gray-200 p-4">
              <h3 className="text-base font-semibold text-gray-900">{t("layersTitle")}</h3>
              <p className="mt-1 text-xs text-gray-500">{t("layersHint")}</p>
            </div>

            <div className="space-y-1 p-3">
              {layers.map((layer) => {
                const legend = LEGENDS.get(layer.id) ?? [];
                return (
                  <div
                    key={layer.id}
                    className={`rounded-lg p-3 transition-colors ${
                      layer.visible ? "bg-gray-50" : "bg-transparent hover:bg-gray-50"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={layer.visible}
                            onChange={() => toggleLayer(layer.id)}
                            className="peer sr-only"
                          />
                          <div className="peer h-5 w-10 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand"></div>
                          <div className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5"></div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: layer.color }} />
                          <span
                            className={`text-sm font-medium transition-colors ${
                              layer.visible ? "text-gray-900" : "text-gray-400"
                            }`}
                          >
                            {layer.name}
                          </span>
                        </div>
                      </label>
                    </div>

                    {layer.visible && (
                      <div className="flex items-center gap-3 pl-12">
                        <span className="w-12 text-xs text-gray-500">{t("opacity")}</span>
                        <input
                          type="range"
                          min="0"
                          max="10"
                          value={toDisplayValue(layer.opacity)}
                          onChange={(e) =>
                            setLayerOpacity(layer.id, toStoreValue(parseInt(e.target.value, 10)))
                          }
                          className="h-1.5 flex-1 cursor-pointer rounded-full bg-gray-200 accent-brand"
                          aria-label={`${t("opacity")}: ${layer.name}`}
                        />
                        <span className="w-6 text-right font-mono text-xs text-gray-600">
                          {toDisplayValue(layer.opacity)}
                        </span>
                      </div>
                    )}

                    {layer.visible && legend.length > 0 && (
                      <ul className="mt-2 space-y-1 pl-12">
                        {legend.map((entry) => (
                          <li key={entry.label} className="flex items-center gap-2 text-xs text-gray-600">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            {entry.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-gray-200 bg-gray-50 p-3">
              <p className="text-center text-xs text-gray-500">
                {t("layersVisible", {
                  visible: layers.filter((l) => l.visible).length,
                  total: layers.length,
                })}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
