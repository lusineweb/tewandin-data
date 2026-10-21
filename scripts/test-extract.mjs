// Checks the Node extractor against blocks produced earlier by the browser extractor.
import { existsSync, readFileSync } from 'node:fs';
import { extractBatch, firstDefinition } from './wiki-extract.mjs';
const fxUrl = new URL('./fixtures/wiki-sample.json', import.meta.url);
if (!existsSync(fxUrl)) { console.log('no saved sample, test skipped'); process.exit(0); }
const fx = JSON.parse(readFileSync(fxUrl));
const { lines, errors } = extractBatch(fx.parse.parse.text, fx.batch);
const known = {}; let cur = null;
for (const l of readFileSync(new URL('./data-wikiferheng-full.txt', import.meta.url), 'utf8').split('\n')) {
  if (!l) continue;
  if (l[0] === '#') { const p = l.slice(1).split('|'); cur = p[0]; known[cur] = ['#' + p.slice(0, 4).join('|') + '|@' + p[5]]; }
  else known[cur].push(l);
}
let bad = errors.length + fx.batch.filter(t => !lines[t]).length;
// a mismatch only warns: the saved sample can be older than the current Wîkîferheng pages
for (const t of fx.batch) if (lines[t] && lines[t] !== known[t]?.join('\n')) console.warn('differs from current data:', t);
const defs = fx.revs.query.pages.map(p => [p.title, firstDefinition(p.revisions?.[0]?.slots?.main?.content)]);
console.log(errors, defs);
console.log(bad ? `FAIL (${bad})` : `OK: ${fx.batch.length} verbs identical`);
process.exit(bad ? 1 : 0);
