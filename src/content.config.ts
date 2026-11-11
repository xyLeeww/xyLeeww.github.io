import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const notes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/notes' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

// Chinese ray tracing study materials; the top-level folder is the section key (see src/data/raytracing.ts).
const raytracing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/raytracing' }),
  schema: z.object({
    title: z.string(),
    order: z.number(),
    description: z.string().optional(),
    kind: z.enum(['translation', 'original']).default('translation'),
    source: z.string().url().optional(),
    sourceTitle: z.string().optional(),
    license: z.string().optional(),
  }),
});

export const collections = { notes, raytracing };
