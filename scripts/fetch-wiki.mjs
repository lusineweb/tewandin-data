// Downloads every Kurmanji conjugation table from Wîkîferheng and writes an export JSON
// ({ lines, defs, meta }) that import-wiki.mjs turns into scripts/data-wikiferheng-full.txt.
// Runs monthly in GitHub Actions (.github/workflows/update-verbs.yml); also works locally:
//   node scripts/fetch-wiki.mjs /tmp/tewandin-wiki.json
import { readFileSync, writeFileSync } from 'node:fs';
import { extractBatch, firstDefinition } from './wiki-extract.mjs';

const API = 'https://ku.wiktionary.org/w/api.php';
const UA = process.env.WIKI_USER_AGENT || 'TewandinBot/1.0 (https://github.com/; Kurmanji conjugation app; monthly data refresh)';
const out = process.argv[2] || 'tewandin-wiki.json';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(params) {
  const body = new URLSearchParams({ format: 'json', formatversion: '2', maxlag: '5', ...params });
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const r = await fetch(API, { method: 'POST', body, headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
      if (r.ok) {
        const j = await r.json();
        if (j.error?.code === 'maxlag') throw new Error('maxlag');
        if (j.error) throw new Error(j.error.info || j.error.code);
        return j;
      }
      const wait = Number(r.headers.get('retry-after')) * 1000 || 5000 * attempt;
      console.warn(`HTTP ${r.status}, retry in ${wait / 1000}s`);
      await sleep(wait);
    } catch (e) {
      console.warn(`${e.message}, retry ${attempt}`);
      await sleep(5000 * attempt);
    }
  }
  throw new Error('Wîkîferheng API kept failing');
}

// 1. every conjugation page
const titles = [];
let cont = {};
do {
  const r = await api({ action: 'query', list: 'categorymembers', cmtitle: 'Kategorî:Tewandin:lêker (kurmancî)', cmnamespace: '106', cmlimit: '500', ...cont });
  titles.push(...r.query.categorymembers.map(m => m.title.replace(/^Tewandin:/, '')));
  cont = r.continue ?? null;
  await sleep(500);
} while (cont);
const unique = [...new Set(titles)].filter(t => !t.includes('/'));
console.log(`${unique.length} conjugation pages`);

// 2. conjugation tables, 8 pages per parse request
const lines = {};
const errors = [];
const B = 8;
for (let i = 0; i < unique.length; i += B) {
  const batch = unique.slice(i, i + B);
  const text = batch.map((t, k) => `<span class="mkx" title="${k}"></span>\n{{:Tewandin:${t}}}\n`).join('\n');
  const r = await api({ action: 'parse', text, prop: 'text', contentmodel: 'wikitext', disablelimitreport: '1', title: 'Tewandin:' + batch[0] });
  const res = extractBatch(r.parse.text, batch);
  Object.assign(lines, res.lines);
  errors.push(...res.errors);
  if (i % 400 === 0) console.log(`${i + batch.length}/${unique.length}`);
  await sleep(600);
}

// 3. first definition of each verb, 50 pages per request
const defs = {};
for (let i = 0; i < unique.length; i += 50) {
  const batch = unique.slice(i, i + 50);
  const r = await api({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: batch.join('|') });
  for (const p of r.query.pages) {
    const d = firstDefinition(p.revisions?.[0]?.slots?.main?.content);
    if (d) defs[p.title] = d;
  }
  await sleep(600);
}

const count = Object.keys(lines).length;
console.log(`${count} verbs extracted, ${errors.length} errors, ${Object.keys(defs).length} definitions`);
if (errors.length) console.log(errors.slice(0, 50).join('\n'));

// Refuse to replace good data with a broken scrape.
let previous = 0;
try { previous = JSON.parse(readFileSync(new URL('../src/data/manifest.json', import.meta.url))).count || 0; } catch {}
if (count < previous * 0.95 || errors.length > count * 0.02) {
  console.error(`Stopping: ${count} verbs now vs ${previous} before, ${errors.length} errors.`);
  process.exit(1);
}

writeFileSync(out, JSON.stringify({ lines, defs, meta: { source: 'ku.wiktionary.org', fetched: new Date().toISOString(), count } }));
console.log(`→ ${out}`);
