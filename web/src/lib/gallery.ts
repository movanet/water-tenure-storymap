/** Gallery items, read from content/gallery.json at build time. */

import galleryJson from "@content/gallery.json";

export interface GalleryItem {
  src: string;
  caption: string;
}

export const GALLERY: GalleryItem[] = (
  (galleryJson as { items?: GalleryItem[] }).items ?? []
).filter((item) => item && typeof item.src === "string");
