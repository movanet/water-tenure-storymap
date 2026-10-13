"use client";

import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { MapRef } from "react-map-gl/maplibre";
import { ArrowLeft, Bookmark, ChevronDown, ChevronUp } from "lucide-react";
import MapView from "@/components/map/MapView";
import LayerControl from "@/components/map/LayerControl";
import BasemapSelector from "@/components/map/BasemapSelector";
import TenureFilterPanel from "@/components/map/TenureFilterPanel";
import Markdown from "@/components/content/Markdown";
import Lightbox from "@/components/ui/Lightbox";
import { useMapStore } from "@/store/mapStore";
import { site, t, type MapViewConfig } from "@/lib/site";
import type { Story, StoryChapter, StoryImage } from "@/lib/stories";

/**
 * Story view: a narrative panel (left third on large screens, below the map
 * on phones) and the map. Chapters are the pills under the narrative;
 * opening a section flies the map to the section's camera. The URL hash
 * names the open section or chapter ("/story/<id>#<section-id>"), which is
 * how "Read in story" links from tenure records land on the right place.
 */

interface Selection {
  chapterId: string;
  sectionId: string | null;
  /** location.hash written when this selection was made. */
  hash: string;
}

function subscribeHash(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}

function decodeHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, ""));
  } catch {
    return hash.replace(/^#/, "");
  }
}

function fromHash(story: Story, hash: string): Omit<Selection, "hash"> | null {
  const id = decodeHash(hash);
  if (!id) return null;
  for (const chapter of story.chapters) {
    if (chapter.sections.some((s) => s.id === id)) return { chapterId: chapter.id, sectionId: id };
  }
  const chapter = story.chapters.find((c) => c.id === id);
  return chapter ? { chapterId: chapter.id, sectionId: null } : null;
}

const viewKey = (v: MapViewConfig | undefined) =>
  v ? `${v.longitude},${v.latitude},${v.zoom}` : "";

export default function StoryViewer({ story }: { story: Story }) {
  const [map, setMap] = useState<MapRef | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [lightbox, setLightbox] = useState<StoryImage | null>(null);
  const setLayersVisibility = useMapStore((s) => s.setLayersVisibility);
  const resetLayers = useMapStore((s) => s.resetLayers);

  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");

  // A user selection wins until the hash changes from outside (back button,
  // another link); then the hash decides again.
  const active =
    selection && selection.hash === hash
      ? selection
      : fromHash(story, hash) ?? { chapterId: story.chapters[0].id, sectionId: null };

  const chapter: StoryChapter =
    story.chapters.find((c) => c.id === active.chapterId) ?? story.chapters[0];
  const section = chapter.sections.find((s) => s.id === active.sectionId);
  const target = section?.mapView ?? chapter.mapView ?? story.mapView;
  const targetKey = viewKey(target);
  const usesLayerSets = useMemo(() => story.chapters.some((c) => c.layers), [story]);

  const select = useCallback((chapterId: string, sectionId: string | null) => {
    const nextHash = `#${encodeURIComponent(sectionId ?? chapterId)}`;
    window.history.replaceState(null, "", nextHash);
    setSelection({ chapterId, sectionId, hash: nextHash });
  }, []);

  // Fly to the camera of the open section, else of the chapter.
  useEffect(() => {
    if (!map || !target) return;
    map.flyTo({
      center: [target.longitude, target.latitude],
      zoom: target.zoom,
      duration: 2000,
      essential: true,
    });
    // targetKey captures the camera; target itself is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, targetKey]);

  // Chapters may name the layers to show while they are active.
  useEffect(() => {
    if (!usesLayerSets) return;
    if (chapter.layers) setLayersVisibility(chapter.layers);
    else resetLayers();
  }, [usesLayerSets, chapter, setLayersVisibility, resetLayers]);

  // Bring a section opened from a link into view in the narrative panel.
  useEffect(() => {
    if (!active.sectionId) return;
    document.getElementById(`section-${active.sectionId}`)?.scrollIntoView({ block: "nearest" });
  }, [active.sectionId]);

  const initialView = story.mapView ?? story.chapters[0].mapView ?? site.map.initialView;

  return (
    <main className="flex h-[calc(100vh-64px)] flex-col-reverse bg-white md:h-[calc(100vh-80px)] lg:flex-row">
      {/* Narrative: below the map on phones, left third on large screens */}
      <div className="flex min-h-0 w-full flex-1 flex-col bg-white lg:h-full lg:w-1/3 lg:flex-none lg:border-r lg:border-gray-200">
        <div className="flex-1 overflow-y-auto px-5 py-5 md:px-6">
          <Link
            href="/story"
            className="inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-brand"
            aria-label={t("backToStories")}
            title={t("backToStories")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>

          <h2 className="mt-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {story.title}
          </h2>
          <h1 className="mt-1 text-2xl font-bold text-brand md:text-3xl">{chapter.title}</h1>
          {chapter.description && <p className="mt-2 text-sm text-gray-500">{chapter.description}</p>}

          {story.notice && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900">
              {story.notice}
            </p>
          )}

          <div className="mt-6 divide-y divide-gray-100">
            {chapter.sections.map((s) => {
              const isOpen = active.sectionId === s.id;
              const images = s.images ?? [];
              return (
                <div key={s.id} id={`section-${s.id}`} className="scroll-mt-4">
                  <button
                    onClick={() => select(chapter.id, isOpen ? null : s.id)}
                    className={`flex w-full items-start gap-3 py-3 text-left transition-colors ${
                      isOpen ? "text-brand" : "text-gray-800 hover:text-brand"
                    }`}
                    aria-expanded={isOpen}
                  >
                    <Bookmark
                      className={`mt-0.5 h-4 w-4 shrink-0 ${isOpen ? "text-brand" : "text-accent"}`}
                    />
                    <span className="flex-1 text-sm font-semibold leading-snug">{s.title}</span>
                    {isOpen ? (
                      <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="pb-4 pl-7">
                      <Markdown text={s.body} />
                      {images.length > 0 && (
                        <div
                          className={`mt-4 grid gap-3 ${
                            images.length > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
                          }`}
                        >
                          {images.map((image) => (
                            <figure key={image.src} className="w-full">
                              <button
                                type="button"
                                onClick={() => setLightbox(image)}
                                className="block w-full overflow-hidden rounded-xl border border-gray-100 bg-gray-100 shadow-sm transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-brand"
                                aria-label={`${t("enlargeImage")}: ${image.caption}`}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={image.src}
                                  alt={image.caption}
                                  loading="lazy"
                                  className="h-auto w-full object-cover"
                                />
                              </button>
                              <figcaption className="mt-1.5 text-xs leading-snug text-gray-500">
                                {image.caption}
                              </figcaption>
                            </figure>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chapter pills */}
        {story.chapters.length > 1 && (
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
            <div className="flex gap-2 overflow-x-auto">
              {story.chapters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => select(c.id, null)}
                  aria-current={c.id === chapter.id ? "true" : undefined}
                  className={`shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white transition-colors ${
                    c.id === chapter.id ? "bg-brand hover:bg-brand/90" : "bg-accent hover:bg-accent/90"
                  }`}
                >
                  {c.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map: top 45vh on phones, right two thirds on large screens */}
      <div className="relative h-[45vh] w-full shrink-0 border-b border-gray-200 lg:h-full lg:w-2/3 lg:border-b-0">
        <MapView initialViewState={initialView} onMapLoad={setMap} />
        <div className="absolute right-4 top-4 z-10 flex flex-col items-end gap-2">
          <BasemapSelector />
          <LayerControl />
          <TenureFilterPanel />
        </div>
      </div>

      {lightbox && (
        <Lightbox src={lightbox.src} caption={lightbox.caption} onClose={() => setLightbox(null)} />
      )}
    </main>
  );
}
