import React from "react";
import Link from "next/link";
import { ChevronsRight } from "lucide-react";
import HeroCarousel from "@/components/layout/HeroCarousel";
import Footer from "@/components/layout/Footer";
import HomeMap from "@/components/map/HomeMap";
import Markdown from "@/components/content/Markdown";
import ContentImage from "@/components/content/ContentImage";
import { site } from "@/lib/site";
import { GALLERY } from "@/lib/gallery";

/**
 * Home page: picture carousel, interactive map, introduction and a strip of
 * gallery pictures. Every text and picture comes from content/site.json
 * ("home") and content/gallery.json.
 */
export default function Home() {
  const home = site.home;
  const strip = GALLERY.slice(0, home.galleryCount ?? 4);

  return (
    <main className="bg-white">
      <HeroCarousel slides={home.hero} />

      {home.mapHeading && (
        <h1 className="mb-6 mt-8 text-center text-2xl font-bold text-gray-900 sm:text-3xl md:mb-8 md:mt-10 md:text-4xl">
          {home.mapHeading}
        </h1>
      )}

      <section className="mx-auto w-[94%] max-w-[1600px]">
        <HomeMap />
      </section>

      {(home.introHeading || home.intro) && (
        <section className="mx-auto max-w-5xl px-4 py-10 md:px-6 md:py-14">
          {home.introHeading && (
            <h2 className="mb-6 text-center text-2xl font-bold text-gray-900 sm:text-3xl md:mb-8 md:text-4xl">
              {home.introHeading}
            </h2>
          )}
          {home.intro && (
            <Markdown
              text={home.intro}
              paragraphClassName="text-sm leading-relaxed text-gray-800 md:text-[15px]"
            />
          )}
          {home.introLink && (
            <div className="mt-6 flex justify-end">
              <Link
                href={home.introLink.href}
                className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-brand hover:underline"
              >
                <ChevronsRight className="h-4 w-4" />
                {home.introLink.label}
              </Link>
            </div>
          )}
        </section>
      )}

      {strip.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-10 md:px-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-6">
            {strip.map((item) => (
              <div
                key={item.src}
                className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-md"
              >
                <div className="relative aspect-[4/3]">
                  <ContentImage
                    src={item.src}
                    alt={item.caption}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover"
                  />
                </div>
                <p className="p-2.5 text-[11px] leading-snug text-gray-700">{item.caption}</p>
              </div>
            ))}
          </div>
          {home.galleryLink && (
            <div className="mt-6 flex justify-end">
              <Link
                href={home.galleryLink.href}
                className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-brand hover:underline"
              >
                <ChevronsRight className="h-4 w-4" />
                {home.galleryLink.label}
              </Link>
            </div>
          )}
        </section>
      )}

      <Footer />
    </main>
  );
}
