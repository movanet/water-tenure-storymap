import React from "react";
import Image, { type ImageProps } from "next/image";

/**
 * next/image for content-supplied pictures. SVG files and absolute URLs are
 * passed through unoptimized (the optimizer refuses SVG, and remote hosts
 * would otherwise have to be whitelisted in next.config.ts); raster files
 * under public/ are resized and cached by Next.js as usual.
 */
export default function ContentImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : "";
  const unoptimized =
    props.unoptimized ?? (/\.svg($|\?)/i.test(src) || /^https?:\/\//i.test(src));
  return <Image {...props} unoptimized={unoptimized} alt={props.alt} />;
}
