// Imports magic items from dnd.su into data/items/*.yaml.
//
//   npm run import:items -- --all                       import every item on dnd.su/items/ that is missing
//   npm run import:items -- --all --force               re-import all of them (overwrites manual edits!)
//   npm run import:items -- "Bag of holding" "Flame tongue"   import single items by English name

import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import { BASE, get, norm, fetchArticle, toMarkdown, parseArgs, runImport, assignIds } from './dndsu.js';

const opts = parseArgs('Usage: npm run import:items -- <"Item name"… | --all> [--force]');

// The item index is an HTML list: <div class="for_filter" data-search="Ру,En,"> <a href> <span class="list-svg__armor">…
async function loadIndex() {
  const root = parseHtml(await get(`${BASE}/piece/items/index-list/`));
  const items = root.querySelectorAll('.for_filter').map((el) => {
    // data-search is "<ru>,<en>," and names can contain commas ("Оружие +1, +2, +3").
    const ru = el.querySelector('.list-item-title').text.trim();
    const en = el.getAttribute('data-search').slice(ru.length + 1).replace(/,$/, '');
    const typeClass = el.querySelector('[class^="list-svg__"]')?.getAttribute('class') ?? '';
    return {
      title_en: en.trim(),
      link: el.querySelector('a').getAttribute('href'),
      type_key: typeClass.replace('list-svg__', ''),
    };
  });
  if (!items.length) throw new Error('Could not find item index on dnd.su (site layout changed?)');
  const byName = new Map();
  for (const it of items) if (!byName.has(norm(it.title_en))) byName.set(norm(it.title_en), it);
  assignIds(items, (it) => byName.get(norm(it.title_en)) === it);
  return { items, byName };
}

// "очень редкий", "необычное (+1), редкое (+2)", "редкость варьируется (…)" → rarity key for sorting/filtering.
function rarityKey(text) {
  if (/варьируется/i.test(text)) return 'varies';
  if (/не имеет редкости/i.test(text)) return 'none';
  const found = new Set(
    (text.toLowerCase().match(/очень редк|необычн|обычн|редк|легендарн|артефакт/g) ?? []).map((w) => ({
      'очень редк': 'very_rare', необычн: 'uncommon', обычн: 'common', редк: 'rare', легендарн: 'legendary', артефакт: 'artifact',
    })[w]),
  );
  if (found.size === 1) return [...found][0];
  return found.size ? 'varies' : 'none';
}

// Splits at the first comma that is not inside parentheses.
function splitTop(text) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
  }
  return [text.trim(), ''];
}

async function importItem(entry) {
  const { card, common } = await fetchArticle(BASE + entry.link, entry.title_en);
  const item = { ...common, type_key: entry.type_key };

  // Only the top-level fields: descriptions contain their own <li><strong>…</strong> lists.
  const fields = card.querySelector('ul.params').childNodes.filter((n) => n.rawTagName === 'li');
  for (const li of fields) {
    if (li.classList.contains('subsection') || li.classList.contains('card-img__block')) continue; // description, picture
    const label = li.querySelector('strong')?.text.replace(':', '').trim();
    const value = li.text.replace(li.querySelector('strong')?.text ?? '', '').replace(/\s+/g, ' ').trim();
    if (li.classList.contains('size-type-alignment')) {
      // "Посох, очень редкий (требуется настройка Волшебником, Колдуном или Чародеем)"
      // "Доспех (средний или тяжёлый, кроме шкурного), необычный"
      let text = li.text.replace(/\s+/g, ' ').trim();
      const att = text.match(/\(\s*требуется настройка\s*([^)]*)\)/i);
      item.attunement = Boolean(att);
      if (att?.[1].trim()) item.attunement_by = att[1].trim();
      if (att) text = text.replace(att[0], '').trim();
      const [typePart, rarity] = splitTop(text);
      const [, type, detail] = typePart.match(/^([^(]+?)\s*(?:\((.*)\))?$/) ?? [null, typePart];
      item.type = type.trim();
      if (detail) item.type_detail = detail.trim();
      item.rarity = rarity.replace(/,$/, '').trim();
      item.rarity_key = rarityKey(item.rarity);
    } else if (label === 'Рекомендованная стоимость') {
      item.price = value;
    } else if (label) {
      console.warn(`  (${entry.title_en}: unknown field "${label}")`);
    }
  }

  item.description = toMarkdown(card.querySelector('[itemprop=description]')).trim();
  return item;
}

const index = await loadIndex();
const entries = [
  ...(opts.all ? index.items.map((it) => [it.title_en, it]) : []),
  ...opts.names.map((n) => [n, index.byName.get(norm(n))]),
];
const failed = await runImport({ entries, dataDir: path.resolve('data/items'), force: opts.force, importOne: importItem });
process.exit(failed ? 1 : 0);
