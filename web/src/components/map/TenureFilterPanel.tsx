"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal, X } from "lucide-react";
import {
  hasActiveTenureFilters,
  useMapStore,
  type TenureFilters,
} from "@/store/mapStore";
import { TENURE_VOCAB, vocabItems } from "@/data/tenureVocab";
import { tenureColor } from "@/lib/tenureColors";
import { buildTenureQuery, fetchApiJson, type TypologyStats } from "@/lib/tenureApi";
import { t } from "@/lib/site";

interface ChipOption {
  value: string;
  label: string;
  swatch?: string;
  count?: number;
}

function FilterChips({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="border-t border-gray-100 px-3 py-2.5 first:border-t-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle(option.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-gray-300 bg-white text-gray-700 hover:border-brand hover:text-brand"
              }`}
            >
              {option.swatch && (
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    active ? "ring-1 ring-white" : ""
                  }`}
                  style={{ backgroundColor: option.swatch }}
                />
              )}
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className={active ? "text-white/80" : "text-gray-400"}>
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tenure filter panel: collapsible card in the map control cluster.
 * Multi-select chips for tenure type, use type, both security scales,
 * village, irrigation scheme and season, with per-option counts from
 * /api/stats/typology (silent on failure), a display-mode toggle and
 * "Clear all". Filter state lives in the map store.
 */
export default function TenureFilterPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [villageInput, setVillageInput] = useState("");
  const [stats, setStats] = useState<TypologyStats | null>(null);

  const filters = useMapStore((s) => s.tenureFilters);
  const mode = useMapStore((s) => s.tenureDisplayMode);
  const toggleValue = useMapStore((s) => s.toggleTenureFilterValue);
  const clearFilters = useMapStore((s) => s.clearTenureFilters);
  const setMode = useMapStore((s) => s.setTenureDisplayMode);

  const query = useMemo(() => buildTenureQuery(filters), [filters]);
  const activeCount = useMemo(
    () => Object.values(filters).reduce((sum, v) => sum + v.length, 0),
    [filters]
  );

  // Per-option counts honoring the active filters. Silent empty on failure.
  useEffect(() => {
    let cancelled = false;
    fetchApiJson(`/api/stats/typology${query ? `?${query}` : ""}`).then((data) => {
      if (cancelled) return;
      setStats(data && typeof data === "object" ? (data as TypologyStats) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const countFor = (
    map: Record<string, number> | undefined,
    key: string
  ): number | undefined => (map ? map[key] ?? 0 : undefined);

  // Types analyzed in this assessment are shown first; the remaining FAO
  // framework categories live behind an expander but stay filterable.
  const toChip = (t: (typeof TENURE_VOCAB.tenure_types)[number]): ChipOption => ({
    value: t.id,
    label: t.label,
    swatch: tenureColor(t.id),
    count: countFor(stats?.by_tenure_type, t.id),
  });
  const tenureTypeOptions: ChipOption[] = TENURE_VOCAB.tenure_types
    .filter((t) => t.analyzed)
    .map(toChip);
  const moreTenureTypeOptions: ChipOption[] = TENURE_VOCAB.tenure_types
    .filter((t) => !t.analyzed)
    .map(toChip);

  const useTypeOptions: ChipOption[] = TENURE_VOCAB.use_types.map((u) => ({
    value: u.id,
    label: u.label,
    count: countFor(stats?.by_use_type, u.id),
  }));

  const securityOptions = (map: Record<string, number> | undefined): ChipOption[] =>
    (["1", "2", "3", "4"] as const).map((v) => ({
      value: v,
      label: `${v} - ${TENURE_VOCAB.security_scale[v]}`,
      count: countFor(map, v),
    }));

  // Village options come from loaded data (stats keys) plus any
  // free-text villages already selected.
  const villageOptions: ChipOption[] = useMemo(() => {
    const names = new Set<string>([
      ...Object.keys(stats?.by_village ?? {}),
      ...filters.villages,
    ]);
    return [...names].sort().map((name) => ({
      value: name,
      label: name,
      count: stats?.by_village ? stats.by_village[name] ?? 0 : undefined,
    }));
  }, [stats, filters.villages]);

  const diOptions: ChipOption[] = vocabItems(TENURE_VOCAB.di_schemes).map((d) => ({
    value: d.id,
    label: d.id === "none" ? t("noScheme") : d.label,
    count: countFor(stats?.by_di_scheme, d.id),
  }));

  const seasonOptions: ChipOption[] = vocabItems(TENURE_VOCAB.seasons).map((s) => ({
    value: s.id,
    label: s.label,
  }));

  const addVillage = () => {
    const name = villageInput.trim();
    if (!name) return;
    if (!filters.villages.includes(name)) toggleValue("villages", name);
    setVillageInput("");
  };

  const onToggle = (key: keyof TenureFilters) => (value: string) =>
    toggleValue(key, value);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-gray-800 shadow-md transition-colors hover:bg-gray-50"
        title={t("tenureFilterTitle")}
        aria-expanded={isOpen}
      >
        <SlidersHorizontal className="h-5 w-5 text-brand" />
        <span className="text-sm font-medium">{t("tenure")}</span>
        {activeCount > 0 && (
          <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
            {activeCount}
          </span>
        )}
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Panel */}
          <div className="absolute right-0 top-14 z-50 max-h-[440px] w-[300px] max-w-[calc(100vw-44px)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl md:max-h-[520px] md:w-[330px]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {t("tenureFilterTitle")}
                </h3>
                {stats?.total !== undefined && (
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    {t("recordsMatch", { count: stats.total })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {hasActiveTenureFilters(filters) && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded px-2 py-1 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/10"
                  >
                    {t("clearAll")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  aria-label={t("close")}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Display mode */}
            <div className="border-b border-gray-100 px-3 py-2.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {t("colorBy")}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode("type")}
                  aria-pressed={mode === "type"}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    mode === "type"
                      ? "border-brand bg-brand text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-brand"
                  }`}
                >
                  {t("colorByType")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("gap")}
                  aria-pressed={mode === "gap"}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                    mode === "gap"
                      ? "border-brand bg-brand text-white"
                      : "border-gray-300 bg-white text-gray-700 hover:border-brand"
                  }`}
                >
                  {t("colorByGap")}
                </button>
              </div>
              {mode === "gap" && (
                <p className="mt-1.5 text-[10px] leading-snug text-gray-500">
                  {t("gapHint")}
                </p>
              )}
            </div>

            <FilterChips
              title={t("analyzedTypes")}
              options={tenureTypeOptions}
              selected={filters.tenureTypes}
              onToggle={onToggle("tenureTypes")}
            />
            <details className="group">
              <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700">
                <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                  &#8250;
                </span>
                {t("moreTypes")}
              </summary>
              <div className="mt-1.5">
                <FilterChips
                  title=""
                  options={moreTenureTypeOptions}
                  selected={filters.tenureTypes}
                  onToggle={onToggle("tenureTypes")}
                />
              </div>
            </details>
            <FilterChips
              title={t("useType")}
              options={useTypeOptions}
              selected={filters.useTypes}
              onToggle={onToggle("useTypes")}
            />
            <FilterChips
              title={t("legalSecurity")}
              options={securityOptions(stats?.by_legal_security)}
              selected={filters.legalSecurity}
              onToggle={onToggle("legalSecurity")}
            />
            <FilterChips
              title={t("perceivedSecurity")}
              options={securityOptions(stats?.by_perceived_security)}
              selected={filters.perceivedSecurity}
              onToggle={onToggle("perceivedSecurity")}
            />

            {/* Village: chips from loaded data + free text */}
            <div className="border-t border-gray-100 px-3 py-2.5">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {t("village")}
              </p>
              {villageOptions.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {villageOptions.map((option) => {
                    const active = filters.villages.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => toggleValue("villages", option.value)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          active
                            ? "border-brand bg-brand text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-brand hover:text-brand"
                        }`}
                      >
                        <span>{option.label}</span>
                        {option.count !== undefined && (
                          <span className={active ? "text-white/80" : "text-gray-400"}>
                            {option.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={villageInput}
                  onChange={(e) => setVillageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addVillage();
                    }
                  }}
                  placeholder={t("villagePlaceholder")}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 focus:border-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addVillage}
                  className="shrink-0 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:border-brand hover:text-brand"
                >
                  {t("add")}
                </button>
              </div>
            </div>

            <FilterChips
              title={t("scheme")}
              options={diOptions}
              selected={filters.diSchemes}
              onToggle={onToggle("diSchemes")}
            />
            <FilterChips
              title={t("season")}
              options={seasonOptions}
              selected={filters.seasons}
              onToggle={onToggle("seasons")}
            />
          </div>
        </>
      )}
    </div>
  );
}
