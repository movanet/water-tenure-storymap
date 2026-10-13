"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Popup } from "react-map-gl/maplibre";
import { BookOpen, X } from "lucide-react";
import { tenureColor } from "@/lib/tenureColors";
import {
  fetchApiJson,
  parseLinkedPhotos,
  type LinkedPhoto,
  type TenureRecord,
} from "@/lib/tenureApi";
import {
  TENURE_VOCAB,
  getTenureType,
  getUseTypeLabel,
  itemLabel,
  securityLabel,
} from "@/data/tenureVocab";
import { t } from "@/lib/site";

interface TenurePopupProps {
  record: TenureRecord;
  onClose: () => void;
}

/**
 * Story link for a record's narrative_ref: "<story-id>#<section-id>" opens
 * that section of the story; a bare "<story-id>" opens the story.
 */
export function narrativeHref(ref: string): string {
  const [storyId, anchor] = ref.split("#", 2);
  const base = `/story/${encodeURIComponent(storyId)}`;
  return anchor ? `${base}#${encodeURIComponent(anchor)}` : base;
}

/**
 * Popup for a tenure record: colour-coded type badge, both security scores
 * with scale labels, use, actor, village, scheme, season, confidence,
 * description, linked photo thumbnails, a "Read in story" link when the
 * record has a narrative_ref, and the source line.
 */
export default function TenurePopup({ record, onClose }: TenurePopupProps) {
  // Loaded photos are tagged with the record id they belong to, so switching
  // records never shows the previous record's thumbnails.
  const [loadedPhotos, setLoadedPhotos] = useState<{
    forId: string;
    items: LinkedPhoto[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchApiJson(`/api/tenure-records/${encodeURIComponent(record.id)}/photos`).then((data) => {
      if (cancelled || !data) return;
      setLoadedPhotos({ forId: record.id, items: parseLinkedPhotos(data) });
    });
    return () => {
      cancelled = true;
    };
  }, [record.id]);

  const photos = loadedPhotos && loadedPhotos.forId === record.id ? loadedPhotos.items : [];

  const type = getTenureType(record.tenure_type);
  const color = tenureColor(record.tenure_type);
  const legal = record.legal_security ?? type?.legal_security;
  const perceived = record.perceived_security ?? type?.perceived_security;

  const rows: Array<{ label: string; value: string }> = [
    { label: t("legalSecurity"), value: securityLabel(legal) },
    { label: t("perceivedSecurity"), value: securityLabel(perceived) },
  ];
  if (record.use_type) rows.push({ label: t("use"), value: getUseTypeLabel(record.use_type) });
  if (record.actor_group)
    rows.push({ label: t("actor"), value: itemLabel(TENURE_VOCAB.actor_groups, record.actor_group) });
  if (record.village) rows.push({ label: t("village"), value: record.village });
  if (record.di_scheme && record.di_scheme !== "none")
    rows.push({ label: t("scheme"), value: record.di_scheme });
  if (record.season_relevance && record.season_relevance.length > 0)
    rows.push({
      label: t("season"),
      value: record.season_relevance.map((s) => itemLabel(TENURE_VOCAB.seasons, s)).join(", "),
    });
  if (record.confidence) rows.push({ label: t("confidence"), value: record.confidence });

  return (
    <Popup
      longitude={record.lon}
      latitude={record.lat}
      anchor="bottom"
      offset={14}
      closeButton={false}
      onClose={onClose}
      className="map-popup-container"
      maxWidth="300px"
    >
      <div
        className="max-h-[60vh] w-[270px] overflow-y-auto rounded-lg border border-l-4 border-gray-200 bg-white p-3 shadow-xl"
        style={{ borderLeftColor: color }}
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span
              className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: color }}
            >
              {type?.label ?? record.tenure_type}
            </span>
            {record.title && (
              <h3 className="mt-1.5 text-sm font-semibold leading-snug text-gray-900">
                {record.title}
              </h3>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            aria-label={t("close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-3 text-xs">
              <span className="shrink-0 text-gray-500">{row.label}</span>
              <span className="text-right font-medium text-gray-900">{row.value}</span>
            </div>
          ))}
        </div>

        {record.description && (
          <p className="mt-2 text-xs leading-relaxed text-gray-700">{record.description}</p>
        )}

        {record.fuzzed && (
          <p className="mt-2 text-[10px] leading-snug text-gray-500">{t("fuzzedNote")}</p>
        )}

        {photos.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {photos.slice(0, 4).map((photo) => (
              <a
                key={photo.id}
                href={photo.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={t("openImage")}
                className="block overflow-hidden rounded-md border border-gray-200 bg-gray-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.thumbUrl}
                  alt={t("linkedPhoto")}
                  loading="lazy"
                  className="h-12 w-full object-cover transition-opacity hover:opacity-90"
                />
              </a>
            ))}
          </div>
        )}

        {record.narrative_ref && (
          <Link
            href={narrativeHref(record.narrative_ref)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t("readInStory")}
          </Link>
        )}

        {record.source && (
          <p className="mt-2 border-t border-gray-100 pt-1.5 text-[10px] leading-snug text-gray-400">
            {t("source")}: {record.source}
          </p>
        )}
      </div>
    </Popup>
  );
}
