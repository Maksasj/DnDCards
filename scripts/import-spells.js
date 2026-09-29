// Imports spells from dnd.su into data/spells/*.yaml.
//
//   npm run import:spells -- --all            import every spell on dnd.su/spells/ that is missing
//   npm run import:spells -- --all --force    re-import all of them (overwrites manual edits!)
//   npm run import:spells -- "Fireball" "Hex" import single spells by English name

import path from 'node:path';
import { BASE, get, norm, fetchArticle, toMarkdown, parseArgs, runImport, assignIds } from './dndsu.js';

const opts = parseArgs('Usage: npm run import:spells -- <"Spell name"… | --all> [--force]');

async function loadIndex() {
  const html = await get(`${BASE}/piece/spells/index-list/`);
  const json = html.match(/window\.LIST = (\{.*?\});?\s*<\/script>/s)?.[1];
  if (!json) throw new Error('Could not find spell index on dnd.su (site layout changed?)');
  const cards = JSON.parse(json).cards;
  const byName = new Map();
  for (const c of cards) {
    const key = norm(c.title_en);
    // Prefer the Player's Handbook version (source 102) if a name appears more than once.
    if (!byName.has(key) || c.filter_source.includes(102)) byName.set(key, c);
  }
  assignIds(cards, (c) => byName.get(norm(c.title_en)) === c);
  return { cards, byName };
}

async function importSpell(entry) {
  const { card, common } = await fetchArticle(BASE + entry.link, entry.title_en);
  const spell = { ...common, level: null, school: entry.school.toLowerCase() };

  // Only the top-level fields: descriptions contain their own <li><strong>…</strong> lists.
  const fields = card.querySelector('ul.params').childNodes.filter((n) => n.rawTagName === 'li');
  for (const li of fields) {
    const label = li.querySelector('strong')?.text.replace(':', '').trim();
    const value = li.text.replace(li.querySelector('strong')?.text ?? '', '').trim();
    if (li.classList.contains('size-type-alignment')) {
      // "3 уровень, воплощение (ритуал)" or "Заговор, иллюзия"
      spell.level = /заговор/i.test(li.text) ? 0 : parseInt(li.text, 10);
      spell.ritual = /ритуал/i.test(li.text);
    } else if (label === 'Время накладывания') {
      // "1 реакция, совершаемая вами, когда …" → casting_time + reaction_trigger
      const [time, ...rest] = value.replace(/\s+/g, ' ').split(', ');
      spell.casting_time = time;
      const trigger = rest.join(', ').replace(/^совершаемая вами,\s*/, '');
      if (trigger) spell.reaction_trigger = trigger;
    } else if (label === 'Дистанция') spell.range = value;
    else if (label === 'Компоненты') {
      const m = value.match(/^([^(]*?)\s*(?:\((.*)\))?$/s);
      spell.components = m[1].trim();
      if (m[2]) spell.material = m[2].trim();
    } else if (label === 'Длительность') {
      spell.duration = value;
      spell.concentration = /концентрац/i.test(value);
    } else if (label === 'Подклассы') {
      // "магия хронургии (волшебник), домен света (жрец)"
      spell.subclasses = value.split(/,\s*(?![^()]*\))/).map((x) => x.trim());
    } else if (label === 'Классы') {
      spell.classes = value.split(',').map((s) => s.trim().replace(/[A-Z]+$/, '')); // drop source tags like "бардTCE"
    }
  }

  let desc = toMarkdown(card.querySelector('[itemprop=description]'));
  // Split off the "at higher levels" paragraph into its own field.
  const hl = desc.match(/\n\n\*+\s*На (?:больших|более высоких) уровнях\.?\s*\*+\s*(.*)$/s);
  if (hl) {
    spell.higher_levels = hl[1].trim();
    desc = desc.slice(0, hl.index);
  }
  spell.description = desc.trim();
  return spell;
}

const index = await loadIndex();
const entries = [
  ...(opts.all ? index.cards.map((c) => [c.title_en, c]) : []),
  ...opts.names.map((n) => [n, index.byName.get(norm(n))]),
];
const failed = await runImport({ entries, dataDir: path.resolve('data/spells'), force: opts.force, importOne: importSpell });
process.exit(failed ? 1 : 0);
