// Converts a Wîkîferheng export (JSON: { lines: {title: block}, defs: {title: wikitextLine} })
// into scripts/data-wikiferheng-full.txt, the compact line format read by build-data.mjs.
// Usage: node scripts/import-wiki.mjs path/to/tewandin-wiki.json
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(process.argv[2], 'utf8'));

/** Turn one wikitext definition line into plain text. */
export function cleanDef(line = '') {
  let s = line.replace(/^#\s*/, '');
  if (/^\{\{mane\?/.test(s)) return '';
  for (let i = 0; i < 5; i++) s = s.replace(/\{\{[^{}]*\}\}/g, m => {
    // keep the visible word of simple link-like templates such as {{g|...}} or {{b|...}}; drop the rest
    const parts = m.slice(2, -2).split('|');
    return /^(g|b|binêre|m|l)$/.test(parts[0].trim()) && parts[1] ? parts[parts.length - 1] : '';
  });
  s = s
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'''?/g, '')
    .replace(/<ref[^>]*\/>/g, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '').replace(/<[^>]+>/g, '').replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:]+/, '')
    .trim();
  if (s.length > 160) s = s.slice(0, 159).replace(/\s+\S*$/, '') + '…';
  return s.replace(/\|/g, '/');
}

const out = [];
for (const [title, block] of Object.entries(src.lines)) {
  const [head, ...rest] = block.split('\n');
  const parts = head.slice(1).split('|');
  const kind = (parts[4] || '').replace('@', '');
  parts[4] = cleanDef(src.defs?.[title]);
  // keep the word-formation type as a 6th field: X simple, P with preverb, H compound
  out.push('#' + parts.slice(0, 5).join('|') + '|' + kind, ...rest);
}
writeFileSync(join(root, 'scripts', 'data-wikiferheng-full.txt'), out.join('\n') + '\n');
console.log(`${Object.keys(src.lines).length} verbs → scripts/data-wikiferheng-full.txt`);
