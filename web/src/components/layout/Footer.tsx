import React from "react";
import { Mail, Phone } from "lucide-react";
import ContentImage from "@/components/content/ContentImage";
import { site } from "@/lib/site";

/**
 * Site footer: a coloured block with the logo and copyright line on the
 * left, the organization's contact block and links on the right. All text
 * comes from "footer" in content/site.json; empty fields are omitted.
 */
export default function Footer() {
  const footer = site.footer;
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white">
      <div className="flex flex-col gap-8 md:flex-row md:items-stretch md:gap-0">
        <div className="flex w-full flex-col justify-between rounded-r-2xl bg-footer py-8 pl-6 pr-8 text-white md:w-[52%] md:rounded-r-full md:py-12 md:pl-14 md:pr-36">
          {site.logo && (
            <div>
              <ContentImage
                src={site.logo.src}
                alt={site.logo.alt}
                width={site.logo.width ?? 160}
                height={site.logo.height ?? 48}
                className="h-12 w-auto rounded bg-white/95 object-contain p-1.5"
              />
            </div>
          )}
          {footer.copyright && <p className="mt-12 text-sm font-bold">{footer.copyright}</p>}
        </div>

        <div className="flex-1 px-6 py-10 text-right md:px-14 md:py-12">
          {footer.orgName && (
            <h3 className="mb-3 text-lg font-semibold text-accent md:text-xl">{footer.orgName}</h3>
          )}
          <div className="space-y-1 text-sm leading-relaxed text-gray-800">
            {(footer.lines ?? []).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {footer.phone && (
              <p className="flex items-center justify-end gap-1.5">
                <Phone className="h-3.5 w-3.5 text-gray-500" />
                <span>{footer.phone}</span>
              </p>
            )}
            {footer.email && (
              <p className="flex items-center justify-end gap-1.5">
                <Mail className="h-3.5 w-3.5 text-gray-500" />
                <a href={`mailto:${footer.email}`} className="hover:text-brand hover:underline">
                  {footer.email}
                </a>
              </p>
            )}
          </div>

          {footer.links && footer.links.length > 0 && (
            <>
              <hr className="my-5 border-gray-200" />
              <ul className="flex flex-wrap justify-end gap-x-5 gap-y-2 text-sm font-semibold">
                {footer.links.map((link) => (
                  <li key={link.url}>
                    <a
                      href={link.url}
                      target={/^https?:\/\//.test(link.url) ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}
