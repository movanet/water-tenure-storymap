"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ContentImage from "@/components/content/ContentImage";
import { t, type ImageConfig } from "@/lib/site";

const AUTO_ADVANCE_MS = 6000;

/**
 * Full-width picture carousel for the home page ("home.hero" in
 * content/site.json): prev/next arrows, dot indicators, auto-advance.
 */
export default function HeroCarousel({ slides }: { slides: ImageConfig[] }) {
  const [index, setIndex] = useState(0);
  const count = slides.length;

  const goTo = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [index, count]);

  if (count === 0) return null;

  return (
    <section className="relative h-[240px] w-full overflow-hidden bg-gray-200 sm:h-[320px] md:h-[480px] xl:h-[600px]">
      {slides.map((slide, i) => (
        <div
          key={slide.src}
          className={`absolute inset-0 transition-opacity duration-700 ${
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          aria-hidden={i !== index}
        >
          <ContentImage
            src={slide.src}
            alt={slide.alt}
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
          />
        </div>
      ))}

      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            aria-label={t("previousPicture")}
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white transition-colors hover:bg-black/50"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            aria-label={t("nextPicture")}
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/30 p-2 text-white transition-colors hover:bg-black/50"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5">
            {slides.map((slide, i) => (
              <button
                key={slide.src}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1} / ${count}`}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  i === index ? "bg-white" : "bg-white/50 hover:bg-white/75"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
