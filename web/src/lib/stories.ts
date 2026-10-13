/**
 * Story loading (server side, at build time).
 *
 * Each file content/stories/<id>.json is one story; the file name must equal
 * the story's "id". A story has chapters (the pills under the narrative) and
 * each chapter has sections (the accordion entries). Section ids are the
 * anchors used by tenure records' narrative_ref ("<story-id>#<section-id>").
 *
 * Problems in a story file stop the build with a message naming the file,
 * so a broken story never reaches the live site.
 */

import fs from "node:fs";
import path from "node:path";
import type { MapViewConfig } from "./site";

export interface StoryImage {
  src: string;
  caption: string;
}

export interface StorySection {
  id: string;
  title: string;
  /** Text in the small Markdown subset of components/content/Markdown.tsx. */
  body: string;
  mapView?: MapViewConfig;
  images?: StoryImage[];
}

export interface StoryChapter {
  id: string;
  title: string;
  description?: string;
  mapView?: MapViewConfig;
  /** Ids from content/layers.json to show while this chapter is active. */
  layers?: string[];
  sections: StorySection[];
}

export interface Story {
  id: string;
  order?: number;
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  thumbnail?: string;
  notice?: string;
  mapView?: MapViewConfig;
  chapters: StoryChapter[];
}

export type StorySummary = Omit<Story, "chapters">;

const STORIES_DIR = path.join(process.cwd(), "content", "stories");

function isView(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return ["longitude", "latitude", "zoom"].every((k) => typeof v[k] === "number");
}

function validate(story: Story, file: string): void {
  const fail = (msg: string): never => {
    throw new Error(`content/stories/${file}: ${msg}`);
  };
  const expected = path.basename(file, ".json");
  if (story.id !== expected) fail(`"id" must equal the file name ("${expected}").`);
  if (!/^[a-z0-9][a-z0-9-]*$/.test(story.id)) fail(`"id" may only use a-z, 0-9 and "-".`);
  if (!story.title) fail(`"title" is required.`);
  if (story.mapView && !isView(story.mapView)) fail(`"mapView" needs longitude, latitude, zoom.`);
  if (!Array.isArray(story.chapters) || story.chapters.length === 0) {
    fail(`"chapters" must be a non-empty array.`);
  }
  const sectionIds = new Set<string>();
  const chapterIds = new Set<string>();
  for (const chapter of story.chapters) {
    if (!chapter.id || !chapter.title) fail(`every chapter needs "id" and "title".`);
    if (chapterIds.has(chapter.id)) fail(`duplicate chapter id "${chapter.id}".`);
    chapterIds.add(chapter.id);
    if (chapter.mapView && !isView(chapter.mapView)) {
      fail(`chapter "${chapter.id}": "mapView" needs longitude, latitude, zoom.`);
    }
    if (!Array.isArray(chapter.sections) || chapter.sections.length === 0) {
      fail(`chapter "${chapter.id}" needs a non-empty "sections" array.`);
    }
    for (const section of chapter.sections) {
      if (!section.id || !section.title) {
        fail(`chapter "${chapter.id}": every section needs "id" and "title".`);
      }
      if (sectionIds.has(section.id)) fail(`duplicate section id "${section.id}".`);
      sectionIds.add(section.id);
      if (section.mapView && !isView(section.mapView)) {
        fail(`section "${section.id}": "mapView" needs longitude, latitude, zoom.`);
      }
      if (typeof section.body !== "string") fail(`section "${section.id}" needs a "body" string.`);
    }
  }
}

let cache: Story[] | null = null;

/** All stories, sorted by "order" then title. */
export function getStories(): Story[] {
  if (cache) return cache;
  const files = fs.existsSync(STORIES_DIR)
    ? fs.readdirSync(STORIES_DIR).filter((f) => f.endsWith(".json"))
    : [];
  const stories = files.map((file) => {
    let story: Story;
    try {
      story = JSON.parse(fs.readFileSync(path.join(STORIES_DIR, file), "utf-8")) as Story;
    } catch (err) {
      throw new Error(`content/stories/${file}: not valid JSON (${(err as Error).message})`);
    }
    validate(story, file);
    return story;
  });
  stories.sort(
    (a, b) =>
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      a.title.localeCompare(b.title)
  );
  cache = stories;
  return stories;
}

export function getStory(id: string): Story | undefined {
  return getStories().find((s) => s.id === id);
}

export function getStorySummaries(): StorySummary[] {
  return getStories().map((story) => {
    const { chapters, ...summary } = story;
    void chapters;
    return summary;
  });
}

/** Read a Markdown page from content/ (for example "about.md"). */
export function readContentPage(name: string): string {
  const file = path.join(process.cwd(), "content", name);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";
}
