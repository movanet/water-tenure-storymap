"use client";

import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { t } from "@/lib/site";

interface PagerProps {
  /** Total number of items (shown as "{count} items found"). */
  count: number;
  page: number;
  pages: number;
  onPage: (page: number) => void;
}

/** "n items found" plus first / previous / next / last page buttons. */
export default function Pager({ count, page, pages, onPage }: PagerProps) {
  const button =
    "flex h-8 w-8 items-center justify-center rounded-full text-brand transition-colors hover:bg-brand/10 disabled:cursor-not-allowed disabled:text-gray-300";
  return (
    <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
      <p className="text-sm text-gray-600">{t("itemsFound", { count })}</p>
      <div className="flex items-center gap-1">
        <button disabled={page <= 1} onClick={() => onPage(1)} className={button} aria-label={t("firstPage")}>
          <ChevronsLeft className="h-5 w-5" />
        </button>
        <button
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={button}
          aria-label={t("previousPage")}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="px-3 text-sm font-medium text-gray-700">
          {page} / {pages}
        </span>
        <button
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          className={button}
          aria-label={t("nextPage")}
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          disabled={page >= pages}
          onClick={() => onPage(pages)}
          className={button}
          aria-label={t("lastPage")}
        >
          <ChevronsRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
