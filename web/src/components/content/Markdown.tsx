import React from "react";

/**
 * Renders a small, safe Markdown subset to React elements (no raw HTML):
 * headings (#, ##, ###), paragraphs, bullet and numbered lists, links
 * [text](url), **bold**, *italic* and `code`. Blank lines separate blocks.
 * It is used for the About page, the home intro and story section bodies.
 */

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;

function safeHref(href: string): string | null {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href) ? href : null;
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts = text.split(INLINE).filter((p) => p !== "");
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const href = safeHref(link[2]);
      if (!href) return <React.Fragment key={key}>{link[1]}</React.Fragment>;
      const external = /^https?:\/\//i.test(href);
      return (
        <a
          key={key}
          href={href}
          className="font-medium text-brand underline-offset-2 hover:underline"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {link[1]}
        </a>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return <React.Fragment key={key}>{part}</React.Fragment>;
  });
}

interface MarkdownProps {
  text: string;
  className?: string;
  /** Tailwind classes for paragraphs and list items. */
  paragraphClassName?: string;
}

export default function Markdown({
  text,
  className,
  paragraphClassName = "text-sm leading-relaxed text-gray-700",
}: MarkdownProps) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  return (
    <div className={className}>
      {blocks.map((block, b) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const key = `b${b}`;
        const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
        if (heading && !trimmed.includes("\n")) {
          const level = heading[1].length;
          const content = inline(heading[2], key);
          if (level === 1) {
            return (
              <h1 key={key} className="mb-4 mt-2 text-3xl font-bold text-gray-900 md:text-4xl">
                {content}
              </h1>
            );
          }
          if (level === 2) {
            return (
              <h2 key={key} className="mb-3 mt-8 text-xl font-bold text-gray-900 md:text-2xl">
                {content}
              </h2>
            );
          }
          return (
            <h3 key={key} className="mb-2 mt-6 text-lg font-semibold text-gray-900">
              {content}
            </h3>
          );
        }
        const lines = trimmed.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={key} className={`mb-4 list-disc space-y-1 pl-5 ${paragraphClassName}`}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*[-*]\s+/, ""), `${key}-${i}`)}</li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
          return (
            <ol key={key} className={`mb-4 list-decimal space-y-1 pl-5 ${paragraphClassName}`}>
              {lines.map((l, i) => (
                <li key={i}>{inline(l.replace(/^\s*\d+[.)]\s+/, ""), `${key}-${i}`)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={key} className={`mb-4 last:mb-0 ${paragraphClassName}`}>
            {inline(lines.join(" "), key)}
          </p>
        );
      })}
    </div>
  );
}
