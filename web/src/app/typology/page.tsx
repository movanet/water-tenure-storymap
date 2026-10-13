"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import Footer from "@/components/layout/Footer";
import { TENURE_VOCAB, getTenureType, securityLabel } from "@/data/tenureVocab";
import { tenureColor, SECURITY_RAMP, SECURITY_NA_COLOR } from "@/lib/tenureColors";
import { fetchApiJson } from "@/lib/tenureApi";
import { site, t } from "@/lib/site";

/**
 * /typology: the FAO water tenure framework as used by this deployment.
 * Rows come from /api/vocab/fao-framework (the API's vocabulary, with the
 * analyzed flag per row); when the API is unavailable the page falls back
 * to the bundled copy of the vocabulary.
 *
 * Analyzed rows are active: type colour, definition, both security ratings
 * with scale labels, examples, and a "view on map" link that opens the home
 * map with that tenure type pre-filtered. Other rows are greyed out.
 */

interface FrameworkRow {
  id: string;
  name: string;
  category?: string;
  description?: string;
  analyzed: boolean;
  maps_to?: string | null;
}

function parseFrameworkRows(data: unknown): FrameworkRow[] | null {
  if (!data || typeof data !== "object") return null;
  const rows = Array.isArray(data)
    ? data
    : (data as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const parsed: FrameworkRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    parsed.push({
      id: r.id,
      name: r.name,
      category: typeof r.category === "string" ? r.category : undefined,
      description: typeof r.description === "string" ? r.description : undefined,
      analyzed: r.analyzed === true,
      maps_to: typeof r.maps_to === "string" ? r.maps_to : null,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

/** Fallback: the framework rows derived from the bundled vocabulary. */
function fallbackRows(): FrameworkRow[] {
  return TENURE_VOCAB.tenure_types.map((type) => ({
    id: type.fao_key ?? type.id,
    name: type.fao_name ?? type.label,
    category: type.category,
    description: type.definition,
    analyzed: type.analyzed,
    maps_to: type.id,
  }));
}

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
        >
          <div className="mb-3 flex items-center gap-3">
            <div className="h-4 w-4 rounded-full bg-gray-200" />
            <div className="h-4 w-48 rounded bg-gray-200" />
          </div>
          <div className="mb-2 h-3 w-full rounded bg-gray-100" />
          <div className="h-3 w-2/3 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

export default function TypologyPage() {
  const [rows, setRows] = useState<FrameworkRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchApiJson("/api/vocab/fao-framework").then((data) => {
      if (cancelled) return;
      setRows(parseFrameworkRows(data) ?? fallbackRows());
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-[calc(100vh-80px)] flex-col bg-white md:min-h-[calc(100vh-100px)]">
      <main className="flex-1">
        <div className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
          <header className="mb-8 text-center md:mb-10">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl md:text-4xl">
              {site.typology.heading}
            </h1>
            {site.typology.intro && (
              <p className="mx-auto mt-3 max-w-3xl text-sm leading-relaxed text-gray-600 md:text-[15px]">
                {site.typology.intro}
              </p>
            )}
          </header>

          {/* Security scale legend */}
          <div className="mb-8 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:p-5">
            <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("securityScale")}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {(["1", "2", "3", "4"] as const).map((v) => (
                <span key={v} className="inline-flex items-center gap-2 text-xs text-gray-700">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: SECURITY_RAMP[v] }}
                  />
                  {v} - {TENURE_VOCAB.security_scale[v]}
                </span>
              ))}
              <span className="inline-flex items-center gap-2 text-xs text-gray-700">
                <span
                  className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: SECURITY_NA_COLOR }}
                />
                NA / NR - {TENURE_VOCAB.security_scale.NA} /{" "}
                {TENURE_VOCAB.security_scale.NR}
              </span>
            </div>
          </div>

          {loading || rows === null ? (
            <SkeletonRows />
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const type = row.analyzed
                  ? getTenureType(row.maps_to ?? row.id)
                  : undefined;
                if (row.analyzed && type) {
                  const color = tenureColor(type.id);
                  return (
                    <article
                      key={row.id}
                      className="rounded-2xl border border-gray-200 border-l-4 bg-white p-5 shadow-sm"
                      style={{ borderLeftColor: color }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-3.5 w-3.5 shrink-0 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            <h2 className="text-base font-bold text-gray-900 md:text-lg">
                              {type.label}
                            </h2>
                          </div>
                          {row.name !== type.label && (
                            <p className="mt-0.5 pl-6 text-xs text-gray-400">
                              {t("faoRow")}: {row.name}
                            </p>
                          )}
                        </div>
                        <Link
                          href={`/?tt=${encodeURIComponent(type.id)}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand/90"
                        >
                          <MapPin className="h-3.5 w-3.5" />
                          {t("viewOnMap")}
                        </Link>
                      </div>

                      <p className="mt-3 text-sm leading-relaxed text-gray-700">
                        {type.definition}
                      </p>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {t("legalSecurity")}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-gray-900">
                            {securityLabel(type.legal_security)}
                          </p>
                        </div>
                        <div className="rounded-lg bg-gray-50 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            {t("perceivedSecurity")}
                          </p>
                          <p className="mt-0.5 text-sm font-medium text-gray-900">
                            {securityLabel(type.perceived_security)}
                          </p>
                        </div>
                      </div>

                      {type.examples.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {type.examples.map((example) => (
                            <span
                              key={example}
                              className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600"
                            >
                              {example}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                }

                // Framework row not analyzed in this assessment (or one that
                // does not map onto a type of the bundled vocabulary).
                return (
                  <article
                    key={row.id}
                    className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="h-3.5 w-3.5 shrink-0 rounded-full bg-gray-300" />
                        <h2 className="text-base font-semibold text-gray-400">
                          {row.name}
                        </h2>
                      </div>
                      <span className="shrink-0 rounded-full bg-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-500">
                        {t("notAnalyzed")}
                      </span>
                    </div>
                    {row.description && (
                      <p className="mt-2 pl-6 text-sm leading-relaxed text-gray-400">
                        {row.description}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <p className="mt-8 text-xs leading-relaxed text-gray-400">
            {TENURE_VOCAB.source}
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
