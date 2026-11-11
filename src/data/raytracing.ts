import type { CollectionEntry } from 'astro:content';

export type RtEntry = CollectionEntry<'raytracing'>;

export interface RtSection {
  key: string;
  title: string;
  summary: string;
}

// Order here is the reading order of the whole site section.
export const sections: RtSection[] = [
  {
    key: '00-guide',
    title: '导读',
    summary: '译者前言、两天学习计划和术语表。',
  },
  {
    key: '01-rtiow',
    title: 'Ray Tracing in One Weekend',
    summary: '全书翻译:从输出一张图片开始,一步步写出支持漫反射、金属、玻璃和景深的光线追踪器。',
  },
  {
    key: '02-tnw-bvh',
    title: 'The Next Week:BVH',
    summary: '《The Next Week》中“包围体层次结构”一章的翻译:AABB、slab 相交和 BVH 构建。',
  },
  {
    key: '03-nvidia-tutorial',
    title: 'NVIDIA Vulkan 光线追踪教程',
    summary: 'nvpro-samples Vulkan 光线追踪教程(v2)翻译:把光栅化程序逐步改造为硬件光线追踪。',
  },
  {
    key: '04-nvidia-concepts',
    title: 'NVIDIA 概念详解',
    summary: '加速结构、着色器绑定表(SBT)和 Ray Query 三篇专题文档的翻译。',
  },
  {
    key: '05-notes',
    title: '学习笔记',
    summary: '原创笔记:三角形相交、BVH 与 SAH、Ray Query 与光追管线对比、Sascha Willems 示例导读。',
  },
];

export const sectionKey = (entry: RtEntry) => entry.id.split('/')[0];

export const sectionOf = (entry: RtEntry) => sections.find((s) => s.key === sectionKey(entry));

const sectionIndex = (entry: RtEntry) => {
  const i = sections.findIndex((s) => s.key === sectionKey(entry));
  return i < 0 ? sections.length : i;
};

export function sortEntries(entries: RtEntry[]): RtEntry[] {
  return [...entries].sort((a, b) => sectionIndex(a) - sectionIndex(b) || a.data.order - b.data.order);
}

export function groupBySection(entries: RtEntry[]) {
  const sorted = sortEntries(entries);
  return sections
    .map((section) => ({ section, entries: sorted.filter((e) => sectionKey(e) === section.key) }))
    .filter((g) => g.entries.length > 0);
}

export const entryUrl = (entry: RtEntry) => `/rt-docs/${entry.id}/`;

// Sidebar label: drop the trailing "(English Title)" that page titles carry.
export const navTitle = (entry: RtEntry) => entry.data.title.replace(/\s*[((][^()()]*[A-Za-z][^()()]*[))]\s*$/, '');
