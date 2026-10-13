"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import { t } from "@/lib/site";

interface LightboxProps {
  src: string;
  caption: string;
  onClose: () => void;
}

/** Full-screen picture dialog with caption; closes on backdrop click or Escape. */
export default function Lightbox({ src, caption, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={caption}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-white"
          aria-label={t("close")}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex max-h-[70vh] w-full items-center justify-center bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={caption} className="max-h-[70vh] w-auto max-w-full object-contain" />
        </div>
        <p className="px-5 py-4 text-sm font-medium text-gray-800">{caption}</p>
      </div>
    </div>
  );
}
