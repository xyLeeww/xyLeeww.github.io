import type { CollectionEntry } from 'astro:content';

export type DocCollection = 'raytracing' | 'linuxdrivers';
export type DocEntry = CollectionEntry<DocCollection>;

export interface DocSection {
  key: string;
  title: string;
  summary: string;
}

export interface DocLink {
  label: string;
  href: string;
}

// A docs "space" is one Docusaurus-style site section (sidebar + pager) backed by a content collection.
// The top-level folder of each entry id is its section key.
export interface DocSpace {
  collection: DocCollection;
  /** URL prefix without trailing slash, e.g. '/rt-docs'. */
  base: string;
  /** Navbar brand and <title> suffix. */
  brand: string;
  /** Reading order of the whole space. */
  sections: DocSection[];
  /** Navbar links that jump to the first page of a section. */
  navSections: { label: string; section: string }[];
  footerLinks: DocLink[];
  /** Appended after "Copyright © YEAR Ava Li." in the footer. */
  copyright: string;
}

export const sectionKey = (entry: DocEntry) => entry.id.split('/')[0];

export const sectionOf = (space: DocSpace, entry: DocEntry) => space.sections.find((s) => s.key === sectionKey(entry));

export function sortEntries<E extends DocEntry>(space: DocSpace, entries: E[]): E[] {
  const sectionIndex = (entry: E) => {
    const i = space.sections.findIndex((s) => s.key === sectionKey(entry));
    return i < 0 ? space.sections.length : i;
  };
  return [...entries].sort((a, b) => sectionIndex(a) - sectionIndex(b) || a.data.order - b.data.order);
}

export function groupBySection<E extends DocEntry>(space: DocSpace, entries: E[]) {
  const sorted = sortEntries(space, entries);
  return space.sections
    .map((section) => ({ section, entries: sorted.filter((e) => sectionKey(e) === section.key) }))
    .filter((g) => g.entries.length > 0);
}

export const entryUrl = (space: DocSpace, id: string) => `${space.base}/${id}/`;

// Sidebar label: drop the trailing "(English Title)" that page titles carry.
export const navTitle = (entry: DocEntry) => entry.data.title.replace(/\s*[((][^()()]*[A-Za-z][^()()]*[))]\s*$/, '');
