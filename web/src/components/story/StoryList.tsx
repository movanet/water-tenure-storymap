"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BookOpen, BookOpenText, Calendar, Check, Search, Share2 } from "lucide-react";
import ContentImage from "@/components/content/ContentImage";
import Pager from "@/components/ui/Pager";
import type { StorySummary } from "@/lib/stories";
import { site, t } from "@/lib/site";

const PAGE_SIZE = 10;

/** Searchable list of story cards with open and copy-link buttons. */
export default function StoryList({ stories }: { stories: StorySummary[] }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const filtered = stories.filter(
    (story) =>
      !needle ||
      [story.title, story.subtitle, story.author]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle))
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const share = async (story: StorySummary) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/story/${story.id}`);
      setCopiedId(story.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // Clipboard unavailable (insecure context); nothing to do.
    }
  };

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/story" className="text-sm font-medium text-brand hover:underline">
            {site.stories.breadcrumb}
          </Link>
          <h1 className="mt-1 text-3xl font-bold text-brand md:text-4xl">{site.stories.heading}</h1>
        </div>

        <div className="flex w-full items-center gap-2 border-b border-gray-400 pb-1 focus-within:border-brand md:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("search")}
            className="w-full bg-transparent py-1 text-sm text-gray-800 placeholder-gray-500 outline-none"
            aria-label={t("search")}
          />
        </div>
      </div>

      {visible.length === 0 && <p className="text-sm text-gray-600">{t("noStories")}</p>}

      <div className="grid gap-6">
        {visible.map((story) => (
          <article
            key={story.id}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex flex-col md:flex-row">
              {story.thumbnail && (
                <div className="relative h-48 w-full shrink-0 md:h-auto md:w-1/3">
                  <ContentImage
                    src={story.thumbnail}
                    alt={story.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              )}

              <div className="flex flex-1 flex-col p-5 md:p-6">
                <h2 className="text-xl font-bold text-brand md:text-2xl">{story.title}</h2>
                {story.subtitle && <p className="mt-1 text-sm text-gray-500">{story.subtitle}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {story.author && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">
                      <BookOpen className="h-3.5 w-3.5" />
                      {story.author}
                    </span>
                  )}
                  {story.date && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs font-medium text-gray-600">
                      <Calendar className="h-3.5 w-3.5" />
                      {story.date}
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-stretch gap-2">
                  <Link
                    href={`/story/${story.id}`}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-brand/90"
                  >
                    <BookOpenText className="h-4 w-4" />
                    {t("openStory")}
                  </Link>
                  <button
                    onClick={() => share(story)}
                    className="inline-flex w-11 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent/90"
                    aria-label={t("copyLink")}
                    title={t("copyLink")}
                  >
                    {copiedId === story.id ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <Pager count={filtered.length} page={current} pages={pages} onPage={setPage} />
    </>
  );
}
