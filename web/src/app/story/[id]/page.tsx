import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StoryViewer from "@/components/story/StoryViewer";
import { getStories, getStory } from "@/lib/stories";

// Every story is rendered at build time; unknown ids are a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getStories().map((story) => ({ id: story.id }));
}

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const story = getStory(id);
  return story ? { title: story.title, description: story.subtitle } : {};
}

export default async function StoryDetailPage({ params }: Params) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) notFound();
  return <StoryViewer story={story} />;
}
