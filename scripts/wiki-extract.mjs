// Shared extraction of Wîkîferheng conjugation tables ("Tewandin:<verb>" pages) into the compact
// line format read by build-data.mjs. Used by fetch-wiki.mjs (GitHub Actions) and its test.
import { parseHTML } from 'linkedom';

const NOM = ['ez', 'tu', 'ew', 'em', 'hûn', 'ew'];
const ERG = ['min', 'te', 'wê/wî', 'me', 'we', 'wan'];
const SKIP = new Set([9, 10, 13, 14]); // these share their forms with 5, 6, 11, 12

const childRows = table => {
  const out = [];
  for (const sec of table.children) {
    if (sec.tagName === 'TR') out.push(sec);
    else if (sec.tagName === 'TBODY' || sec.tagName === 'THEAD') for (const r of sec.children) if (r.tagName === 'TR') out.push(r);
  }
  return out;
};
const cells = tr => [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
const cellTxt = c => {
  const html = c.innerHTML.replace(/<br\s*\/?>/gi, '\n');
  const { document } = parseHTML(`<div>${html}</div>`);
  return document.querySelector('div').textContent.split('\n').map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
};

/** One conjugation table → "#inf|tr|ps|pp|@kind" header and tense lines. Throws on anything unexpected. */
export function extractTable(ct, inf) {
  const title = ct.querySelector('td.title').textContent;
  const own = childRows(ct);
  const stems = own.flatMap(r => cells(r).filter(c => c.tagName === 'TH')).map(x => x.textContent.trim());
  const kind = /hevedudanî/.test(title) ? 'H' : /pêkhatî/.test(title) ? 'P' : 'X';
  const tr = /negerguhêz/.test(title) ? 'N' : 'G';
  const out = ['#' + inf + '|' + tr + '|' + stems[1] + '|' + stems[3] + '|@' + kind];
  const tts = [...ct.querySelectorAll('table.tense-table')];
  if (tts.length !== 15) throw new Error('tenses ' + tts.length);
  tts.forEach((tt, ti) => {
    if (SKIP.has(ti)) return;
    const rows = childRows(tt).filter(rw => cells(rw)[0]?.tagName === 'TD' && cells(rw).length >= 2);
    const n = cells(rows[0]).length;
    if (n >= 4) {
      out.push(ti + 'O:' + rows.map(rw => cellTxt(cells(rw)[n - 2]).join('~')).join(',') + '/' + rows.map(rw => cellTxt(cells(rw)[n - 1]).join('~')).join(','));
      return;
    }
    let erg = false;
    const strip = (arr, i) => arr.map(x => {
      let y = x.replace(/^\((bila|tû|hûn)\)\s*/, '');
      if (ti > 0) {
        if (y.startsWith(ERG[i] + ' ')) { erg = true; y = y.slice(ERG[i].length + 1); }
        else if (y.startsWith(NOM[i] + ' ')) y = y.slice(NOM[i].length + 1);
        else throw new Error('pronoun ' + ti + ' ' + x);
        y = y.replace(/^y?ê\/dê\s+/, '');
      }
      return y;
    }).join('~');
    const aff = rows.map((rw, i) => strip(cellTxt(cells(rw)[0]), i));
    const neg = rows.map((rw, i) => strip(cellTxt(cells(rw)[1]), i));
    if (aff.length !== (ti === 0 ? 2 : 6)) throw new Error('rows ' + ti);
    if (erg) {
      if (new Set(aff).size !== 1 || new Set(neg).size !== 1) throw new Error('ergative varies ' + ti);
      out.push(ti + 'E:' + aff[0] + '/' + neg[0]);
    } else out.push(ti + ':' + aff.join(',') + '/' + neg.join(','));
  });
  return out.join('\n');
}

/** HTML of a parse of several transcluded pages separated by <span class="mkx" title="k"> markers. */
export function extractBatch(html, batch) {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const lines = {}, errors = [];
  let cur = null;
  const seen = new Set();
  for (const el of document.querySelectorAll('span.mkx, table.conj-table')) {
    if (el.tagName === 'SPAN') { cur = +el.getAttribute('title'); continue; }
    if (cur == null || seen.has(cur)) continue; // the first table is the standard one
    seen.add(cur);
    try { lines[batch[cur]] = extractTable(el, batch[cur]); } catch (e) { errors.push(`${batch[cur]}: ${e.message}`); }
  }
  batch.forEach((t, k) => { if (!seen.has(k)) errors.push(`${t}: no table`); });
  return { lines, errors };
}

/** First definition line of the Kurmanji section of a page's wikitext. */
export function firstDefinition(wikitext = '') {
  const parts = wikitext.split(/(?:^|\n)==\s*\{\{ziman\|ku\}\}\s*==/);
  const sec = (parts[1] || '').split(/\n==[^=]/)[0];
  return sec.split('\n').find(l => /^#\s*[^:*#\s]/.test(l)) ?? null;
}
