import type { Metadata } from "next";
import Footer from "@/components/layout/Footer";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import { GALLERY } from "@/lib/gallery";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: site.gallery.heading };

/** Gallery of the pictures listed in content/gallery.json. */
export default function GalleryPage() {
  return (
    <div className="flex min-h-[calc(100vh-80px)] flex-col bg-white">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-8 md:px-8 md:py-10">
          <h1 className="mb-8 text-3xl font-bold text-brand md:text-4xl">{site.gallery.heading}</h1>
          <GalleryGrid items={GALLERY} pageSize={site.gallery.pageSize} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
