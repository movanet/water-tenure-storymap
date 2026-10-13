"use client";

import React, { useState } from "react";
import MapView from "./MapView";
import MapUrlSync from "./MapUrlSync";
import BasemapSelector from "./BasemapSelector";
import LayerControl from "./LayerControl";
import TenureFilterPanel from "./TenureFilterPanel";
import CopyViewButton from "./CopyViewButton";
import { parseUrlState } from "@/lib/urlState";

/**
 * The home page map card: map, control cluster and shareable-URL sync.
 * A view in the URL (?lat=&lon=&z=) wins over the configured initial view.
 */
export default function HomeMap() {
  // The map is client-only, so reading window in the initializer is safe;
  // the value only matters when MapLibre is constructed.
  const [initialUrlView] = useState(() =>
    typeof window === "undefined" ? null : parseUrlState(window.location.search).view
  );

  return (
    <div className="relative h-[420px] overflow-hidden rounded-3xl border border-gray-200 shadow-lg md:h-[600px] xl:h-[720px]">
      <MapView initialViewState={initialUrlView ?? undefined} />
      <MapUrlSync />
      <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
        <BasemapSelector />
        <LayerControl />
        <TenureFilterPanel />
        <CopyViewButton />
      </div>
    </div>
  );
}
