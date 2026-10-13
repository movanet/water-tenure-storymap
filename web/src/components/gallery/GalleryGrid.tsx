"use client";

import React, { useState } from "react";
import ContentImage from "@/components/content/ContentImage";
import Lightbox from "@/components/ui/Lightbox";
import Pager from "@/components/ui/Pager";
import type { GalleryItem } from "@/lib/gallery";

/** Picture grid with caption bands, a lightbox and pagination. */
export default function GalleryGrid({ items, pageSize }: { items: GalleryItem[]; pageSize: number }) {
  const size = Math.max(1, pageSize);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<GalleryItem | null>(null);
  const visible = items.slice((page - 1) * size, page * size);

  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((item) => (
          <figure
            key={item.src}
            onClick={() => setSelected(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setSelected(item)}
            className="relative aspect-[16/10] cursor-pointer overflow-hidden rounded-xl bg-gray-100 shadow-md transition-transform hover:scale-[1.02]"
          >
            <ContentImage
              src={item.src}
              alt={item.caption}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
            <figcaption className="absolute inset-x-0 bottom-0 bg-brand/75 px-4 py-3">
              <p className="line-clamp-2 text-sm font-medium leading-snug text-white">
                {item.caption}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>

      {selected && (
        <Lightbox src={selected.src} caption={selected.caption} onClose={() => setSelected(null)} />
      )}

      <Pager count={items.length} page={page} pages={pages} onPage={setPage} />
    </>
  );
}
