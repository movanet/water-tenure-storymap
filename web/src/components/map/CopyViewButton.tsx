"use client";

import React, { useState } from "react";
import { Check, Link2 } from "lucide-react";
import { useMapStore } from "@/store/mapStore";
import { serializeUrlState } from "@/lib/urlState";
import { t } from "@/lib/site";

/**
 * "Copy view" button for the map control cluster: copies a shareable link
 * with the current map view, visible layers, display mode and tenure filters.
 */
export default function CopyViewButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const { currentView, layers, tenureDisplayMode, tenureFilters } =
      useMapStore.getState();
    const query = serializeUrlState({
      view: currentView,
      layers,
      mode: tenureDisplayMode,
      filters: tenureFilters,
    });
    const url = `${window.location.origin}${window.location.pathname}?${query}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (insecure context): leave the URL bar,
      // which MapUrlSync keeps up to date, as the fallback.
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-800 shadow-md transition-colors hover:bg-gray-50"
      title={t("copyViewHint")}
    >
      {copied ? (
        <Check className="h-5 w-5 text-green-600" />
      ) : (
        <Link2 className="h-5 w-5 text-brand" />
      )}
      <span className="text-sm font-medium">{copied ? t("copied") : t("copyView")}</span>
    </button>
  );
}
