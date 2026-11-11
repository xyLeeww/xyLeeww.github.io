// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// https://astro.build/config
export default defineConfig({
  site: 'https://xyLeeww.github.io',
  output: 'static',
  server: { port: 3000 },
  // The ray tracing docs briefly lived under /raytracing/; keep old links working.
  redirects: {
    '/raytracing': '/rt-docs/',
    '/raytracing/[...slug]': '/rt-docs/[...slug]',
  },
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
