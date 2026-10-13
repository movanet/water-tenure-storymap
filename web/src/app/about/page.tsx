import type { Metadata } from "next";
import Footer from "@/components/layout/Footer";
import Markdown from "@/components/content/Markdown";
import { readContentPage } from "@/lib/stories";

export const metadata: Metadata = { title: "About" };

/** About page: renders content/about.md. */
export default function AboutPage() {
  const text = readContentPage("about.md");
  return (
    <div className="flex min-h-[calc(100vh-80px)] flex-col bg-white">
      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-6 py-12">
          <Markdown text={text} paragraphClassName="text-base leading-relaxed text-gray-700" />
        </article>
      </main>
      <Footer />
    </div>
  );
}
