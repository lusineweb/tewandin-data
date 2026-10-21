// Turns the compact Wîkîferheng extract(s) in scripts/*.txt into src/data/verbs.json.
//
// Line format (one verb):
//   #infinitive|G or N|present stem|past stem|definition[|X, P or H]
//   <tense>[E|O]:aff1,aff2,.../neg1,neg2,...
// G/N = transitive / intransitive. X simple, P with a preverb, H compound ("aciz kirin").
// E = ergative tense, a single form (agrees with a 3rd-person singular object)
// O = ergative tense, six forms listed by object person (ez, tu, ew, em, hûn, ew)
// "~" separates variants of one cell, " — " separates regional alternatives.
//
// Compound verbs whose every form is "<first part> <form of the base verb>" are stored as a
// reference to the base verb and rebuilt in the app (see materialize() in src/lib/grammar.ts).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = readdirSync(join(root, 'scripts')).filter(f => f.endsWith('.txt')).sort();

const byInf = new Map();
for (const f of files) {
  let cur = null;
  for (const raw of readFileSync(join(root, 'scripts', f), 'utf8').split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (line[0] === '#') {
      const [inf, tr, ps, pp, def = '', kind = ''] = line.slice(1).split('|');
      cur = { inf: inf.normalize('NFC').trim(), tr, ps, pp, def: def.trim(), f: kind || undefined, t: {} };
      byInf.set(cur.inf, cur); // later files win
      continue;
    }
    const m = line.match(/^(\d+)([EO]?):(.*)$/);
    if (!m || !cur) throw new Error(`${f}: cannot parse line: ${line.slice(0, 60)}`);
    const [a, n] = m[3].split('/');
    cur.t[m[1]] = { k: m[2] || undefined, a: a.normalize('NFC').split(','), n: n.normalize('NFC').split(',') };
  }
}

const REQUIRED = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '11', '12'];
let verbs = [...byInf.values()].filter(v => {
  const missing = REQUIRED.filter(k => !v.t[k] || v.t[k].a.some(x => !x));
  if (missing.length) console.warn(`skip ${v.inf}: missing tenses ${missing.join(',')}`);
  return !missing.length;
});
const keep = new Map(verbs.map(v => [v.inf, v]));

// prefix every variant and alternative of a base cell: "neke~meke" → "aciz neke~aciz meke"
const prefixCell = (pre, cell) => cell.split('~').map(v => v.split(' — ').map(w => `${pre} ${w}`).join(' — ')).join('~');

function asReference(v) {
  if (!v.inf.includes(' ')) return null;
  const words = v.inf.split(' ');
  for (let cut = words.length - 1; cut >= 1; cut--) {
    const base = keep.get(words.slice(cut).join(' '));
    if (!base || base.t['1'] === undefined || base.ref) continue;
    const pre = words.slice(0, cut).join(' ');
    const ek = [];
    let ok = true;
    for (const k of REQUIRED) {
      const c = v.t[k], b = base.t[k];
      for (const side of ['a', 'n']) {
        let expect;
        if (c.k === b.k) expect = b[side];
        else if (c.k === 'E' && b.k === 'O') { expect = [b[side][2]]; if (side === 'a') ek.push(+k); }
        else { ok = false; break; }
        const got = c[side];
        if (got.length !== expect.length || got.some((x, i) => x !== prefixCell(pre, expect[i]))) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (ok) return { b: base.inf, p: pre, ...(ek.length ? { e: ek } : {}) };
  }
  return null;
}

let refs = 0;
verbs = verbs.map(v => {
  const ref = asReference(v);
  if (!ref) return v;
  refs++;
  const { t, ...rest } = v;
  return { ...rest, ref };
});

verbs.sort((x, y) => x.inf.localeCompare(y.inf, 'ku'));
const json = JSON.stringify(verbs);
writeFileSync(join(root, 'src/data/verbs.json'), json);

// manifest.json tells installed apps whether a newer data set is online (see src/lib/remote.ts).
// The version only changes when the data itself changes.
const sha = createHash('sha256').update(json).digest('hex');
const mPath = join(root, 'src/data/manifest.json');
const old = existsSync(mPath) ? JSON.parse(readFileSync(mPath, 'utf8')) : null;
const now = new Date();
const stamp = Number(now.toISOString().replace(/[-:T]/g, '').slice(0, 12)); // YYYYMMDDHHmm
const manifest = old?.sha256 === sha ? old : { version: stamp, count: verbs.length, bytes: Buffer.byteLength(json), sha256: sha, built: now.toISOString() };
writeFileSync(mPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`${verbs.length} verbs (${refs} stored as compounds of a base verb) → src/data/verbs.json, ${(json.length / 1024).toFixed(0)} KB`);
