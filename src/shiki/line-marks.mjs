// Shiki transformer for Docusaurus-style line marks in the code fence meta string:
//   ```cpp {2,5-7} del={3}
// "{...}" marks added/changed lines (class "highlighted"), "del={...}" marks lines to delete
// (class "deleted"). Line numbers are 1-based; the code itself stays untouched.
const parseRanges = (text) =>
  new Set(
    text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .flatMap((part) => {
        const [from, to = from] = part.split('-').map(Number);
        return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
      }),
  );

export function parseLineMarks(meta = '') {
  const del = /\bdel=\{([\d,\s-]+)\}/.exec(meta);
  const rest = del ? meta.replace(del[0], '') : meta;
  const hl = /\{([\d,\s-]+)\}/.exec(rest);
  return { highlighted: hl ? parseRanges(hl[1]) : new Set(), deleted: del ? parseRanges(del[1]) : new Set() };
}

export default function transformerLineMarks() {
  return {
    name: 'line-marks',
    preprocess() {
      this.lineMarks = parseLineMarks(this.options.meta?.__raw);
    },
    pre(node) {
      const { highlighted, deleted } = this.lineMarks;
      if (highlighted.size || deleted.size) this.addClassToHast(node, 'has-line-marks');
    },
    line(node, line) {
      if (this.lineMarks.highlighted.has(line)) this.addClassToHast(node, 'highlighted');
      if (this.lineMarks.deleted.has(line)) this.addClassToHast(node, 'deleted');
    },
  };
}
