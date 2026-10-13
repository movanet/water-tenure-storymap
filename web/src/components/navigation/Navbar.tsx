"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Menu, X } from "lucide-react";
import ContentImage from "@/components/content/ContentImage";
import { site, t, type NavItem } from "@/lib/site";

/**
 * Sticky top bar: logo and short site name on the left, the links from
 * "nav" in content/site.json on the right. Below the md breakpoint the
 * links collapse into a menu. An optional "banner" line from site.json is
 * shown under the bar (the sample uses it to say the content is synthetic).
 */
export default function Navbar() {
  const pathname = usePathname();
  // The menu remembers the path it was opened on, so it closes on navigation.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const linkClass = (href: string) =>
    `flex items-center gap-1.5 rounded px-2 py-2 text-xs font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white/15 md:px-3 md:text-sm ${
      isActive(href) ? "bg-white/20" : ""
    }`;

  const mobileLinkClass = (href: string) =>
    `flex items-center gap-3 rounded px-3 py-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors hover:bg-white/15 ${
      isActive(href) ? "bg-white/20" : ""
    }`;

  const renderItem = (item: NavItem, mobile: boolean) => {
    const iconOnly = item.icon === "home" && !mobile;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={mobile ? mobileLinkClass(item.href) : linkClass(item.href)}
        aria-label={iconOnly ? item.label : undefined}
        title={iconOnly ? item.label : undefined}
      >
        {item.icon === "home" && <Home className="h-5 w-5" />}
        {!iconOnly && item.label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-[100] bg-brand shadow-md">
      <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-3 md:h-20 md:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 md:gap-3">
          {site.logo && (
            <span className="flex shrink-0 items-center justify-center rounded-md bg-white px-1.5 py-1">
              <ContentImage
                src={site.logo.src}
                alt={site.logo.alt}
                width={site.logo.width ?? 160}
                height={site.logo.height ?? 48}
                priority
                className="h-7 w-auto object-contain md:h-10"
              />
            </span>
          )}
          <span className="truncate text-sm font-bold tracking-[0.12em] text-white md:text-xl md:tracking-[0.15em]">
            {site.shortName}
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex md:gap-2">
          {site.nav.map((item) => renderItem(item, false))}
        </nav>

        <button
          type="button"
          onClick={() => setOpenOn(menuOpen ? null : pathname)}
          aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
          aria-expanded={menuOpen}
          className="rounded p-2 text-white transition-colors hover:bg-white/15 md:hidden"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {menuOpen && (
        <nav className="border-t border-white/15 bg-brand px-3 pb-3 pt-2 md:hidden">
          {site.nav.map((item) => renderItem(item, true))}
        </nav>
      )}

      {site.banner && (
        <div className="bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-900 md:text-sm">
          {site.banner}
        </div>
      )}
    </header>
  );
}
