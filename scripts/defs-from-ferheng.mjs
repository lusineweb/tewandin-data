// Fills the gaps: for every verb in scripts/data-*.txt without a definition, looks up a Kurmancî
// definition in the Ferheng data (lusineweb/ferheng-data, also from Wîkîferheng, CC BY-SA 4.0)
// and writes scripts/defs-ferheng.tsv (infinitive ⇥ definition). build-data.mjs uses it only
// where the conjugation page itself has no definition.
//
// Order of lookup:
//   1. the verb itself ("agadar kirin"), following variant links ("Guhertoya …" too)
//   2. the verb written as one word ("aşkirakirin")
//   3. the non-verbal part of a compound ("abone" in "abone kirin") → "abone: <definition>"
//
// Usage: node scripts/defs-from-ferheng.mjs path/to/ferheng-data
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fdir = join(process.argv[2] || '../ferheng-data', 'src/data/shards');

const D = {};
for (const f of readdirSync(fdir)) if (f.endsWith('.json')) Object.assign(D, JSON.parse(readFileSync(join(fdir, f), 'utf8')));

// "{Haydar kirin|haydar kirin}" → "Haydar kirin", "{gotin}ê" → "gotinê"
const clean = s => s.replace(/\{([^{}|]*)(?:\|[^{}]*)?\}/g, '$1').replace(/[{}]/g, '').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
const cap = s => (s.length > 160 ? s.slice(0, 159).replace(/\s+\S*$/, '') + '…' : s).replace(/\|/g, '/');

function senses(word, depth = 0) {
  const e = D[word] ?? D[word.toLowerCase()];
  if (!e || depth > 3) return null;
  if (e.v) return senses(e.v, depth + 1);
  const out = [];
  for (const en of e.e || []) for (const s of en.s || []) if (s.d) out.push({ p: en.p, d: clean(s.d) });
  // "Guhertoya X" / "Binêre: X" only points at another spelling: use X's definition when there is one
  for (let i = 0; i < out.length; i++) {
    const m = out[i].d.match(/^(?:Guhertoya|Binêre:?)\s+(.+?)\.?$/);
    if (m) {
      const real = senses(m[1], depth + 1);
      if (real?.length) out[i] = real[0];
    }
  }
  return out.length ? out : null;
}

const first = (list, pos) => (list?.find(s => s.p === pos) ?? list?.[0])?.d || '';

// verbs and their definitions from the Wîkîferheng extract(s)
const verbs = new Map();
for (const f of readdirSync(join(root, 'scripts')).filter(f => f.startsWith('data-') && f.endsWith('.txt')).sort())
  for (const line of readFileSync(join(root, 'scripts', f), 'utf8').split('\n'))
    if (line[0] === '#') {
      const [inf, , , , def = ''] = line.slice(1).replace(/\r$/, '').split('|');
      verbs.set(inf.normalize('NFC').trim(), def.trim());
    }
const bases = [...verbs.keys()].filter(v => !v.includes(' ')).sort((a, b) => b.length - a.length);

const rows = [];
const stat = { self: 0, joined: 0, part: 0, none: 0 };
for (const [inf, def] of verbs) {
  if (def) continue;
  let d = first(senses(inf), 'lk');
  if (d) { stat.self++; rows.push([inf, d]); continue; }
  d = first(senses(inf.replace(/ /g, '')), 'nd');
  if (d) { stat.joined++; rows.push([inf, d]); continue; }
  // non-verbal part: "abone kirin" → "abone"; "barkirin" → "bar"
  let part = null;
  if (inf.includes(' ')) part = inf.split(' ').slice(0, -1).join(' ');
  else { const b = bases.find(b => b !== inf && inf.endsWith(b) && inf.length - b.length >= 2); if (b) part = inf.slice(0, -b.length); }
  const tries = part ? [part, part.replace(/î$/, ''), part.replace(/e$/, ''), part.replace(/ê$/, '')] : [];
  d = '';
  for (const t of tries) if ((d = first(senses(t)))) { part = t; break; }
  if (d) { stat.part++; rows.push([inf, `${part}: ${d}`]); continue; }
  stat.none++;
}

rows.sort((a, b) => a[0].localeCompare(b[0], 'ku'));
writeFileSync(join(root, 'scripts', 'defs-ferheng.tsv'), rows.map(([i, d]) => `${i}\t${cap(d)}`).join('\n') + '\n');
console.log(`defs-ferheng.tsv: ${rows.length} pênase (${stat.self} lêker, ${stat.joined} yekpeyv, ${stat.part} ji beşa navdêr/rengdêr), ${stat.none} hîn bê pênase`);
