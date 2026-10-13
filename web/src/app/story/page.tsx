import type { Metadata } from "next";
import Footer from "@/components/layout/Footer";
import StoryList from "@/components/story/StoryList";
import { getStorySummaries } from "@/lib/stories";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: site.stories.heading };

/** Story index: one card per file in content/stories/. */
export default function StoryPage() {
  return (
    <div className="flex min-h-[calc(100vh-80px)] flex-col bg-white">
      <main className="flex-1">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-8 md:px-8 md:py-10">
          <StoryList stories={getStorySummaries()} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
