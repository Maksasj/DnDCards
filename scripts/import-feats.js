// Imports feats from dnd.su into data/feats/*.yaml.
//
//   npm run import:feats -- --all              import every feat on dnd.su/feats/ that is missing
//   npm run import:feats -- --all --force      re-import all of them (overwrites manual edits!)
//   npm run import:feats -- "War Caster"       import single feats by English name

import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { BASE, get, norm, fetchArticle, toMarkdown, parseArgs, runImport, assignIds } from './dndsu.js';

const opts = parseArgs('Usage: npm run import:feats -- <"Feat name"… | --all> [--force]');

// The feat list is plain HTML on dnd.su/feats/: <div class="for_filter" data-search="Ру,En,"><a href>…
async function loadIndex() {
  const root = parseHtml(await get(`${BASE}/feats/`));
  const feats = root.querySelectorAll('.for_filter').map((el) => {
    const ru = el.querySelector('.list-item-title').text.trim();
    return {
      title_en: el.getAttribute('data-search').slice(ru.length + 1).replace(/,$/, ''),
      link: el.querySelector('a').getAttribute('href'),
    };
  });
  if (!feats.length) throw new Error('Could not find the feat list on dnd.su (site layout changed?)');
  const byName = new Map();
  for (const f of feats) if (!byName.has(norm(f.title_en))) byName.set(norm(f.title_en), f);
  assignIds(feats, (f) => byName.get(norm(f.title_en)) === f);
  return { feats, byName };
}

async function importFeat(entry) {
  const { card, common } = await fetchArticle(BASE + entry.link, entry.title_en);
  const feat = { ...common };
  const header = card.querySelector('ul.params > li.size-type-alignment');
  const requirement = header?.text.replace(/\s+/g, ' ').trim().replace(/^Требовани[ея]\s*:?\s*/i, '');
  if (requirement) feat.prerequisite = requirement;
  feat.description = toMarkdown(card.querySelector('[itemprop=description]')).trim();
  return feat;
}

const index = await loadIndex();
const entries = [
  ...(opts.all ? index.feats.map((f) => [f.title_en, f]) : []),
  ...opts.names.map((n) => [n, index.byName.get(norm(n))]),
];
const failed = await runImport({ entries, dataDir: path.resolve('data/feats'), force: opts.force, importOne: importFeat });
process.exit(failed ? 1 : 0);
