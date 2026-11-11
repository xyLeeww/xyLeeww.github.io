// @ts-check
import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import prismGithub from './src/shiki/prism-github.mjs';
import transformerLineMarks from './src/shiki/line-marks.mjs';

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
    // Light (Prism "github", like Docusaurus) is the inline default for every page; the dark
    // theme is exposed as --shiki-dark* CSS variables for the /rt-docs/ dark mode.
    shikiConfig: {
      themes: { light: prismGithub, dark: 'github-dark' },
      defaultColor: 'light',
      transformers: [transformerLineMarks()],
    },
  },
});
