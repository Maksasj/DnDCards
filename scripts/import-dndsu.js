// Imports spells from dnd.su into data/spells/*.yaml.
//
//   npm run import -- --all            import every spell listed on dnd.su/spells/ that is missing
//   npm run import -- --all --force    re-import all of them (overwrites manual edits!)
//   npm run import -- "Fireball" "Hex" import single spells by English name
//
// Existing YAML files are never overwritten without --force, so hand edits are safe.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import YAML from 'yaml';

const BASE = 'https://dnd.su';
const DATA_DIR = path.resolve('data/spells');
const UA = { 'User-Agent': 'Mozilla/5.0 (dnd-cards importer)' };

const args = process.argv.slice(2);
const force = args.includes('--force');
const all = args.includes('--all');
const targets = args.filter((a) => !a.startsWith('--'));
if (!targets.length && !all) {
  console.error('Usage: npm run import -- <"Spell name"… | --all> [--force]');
  process.exit(1);
}

const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

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
  // File id = URL slug ("/spells/205-fireball/" → "fireball"); if two spells share a slug,
  // the non-PHB ones keep their number ("205-fireball").
  const slugOf = (c) => c.link.match(/\/spells\/\d+-([^/]+)\//)[1];
  const slugCount = new Map();
  for (const c of cards) slugCount.set(slugOf(c), (slugCount.get(slugOf(c)) ?? 0) + 1);
  for (const c of cards) {
    const slug = slugOf(c);
    const unique = slugCount.get(slug) === 1 || byName.get(norm(c.title_en)) === c;
    c.id = unique ? slug : c.link.match(/\/spells\/(\d+-[^/]+)\//)[1];
  }
  return { cards, byName };
}

// Converts description HTML to the small markdown dialect the cards understand:
// paragraphs separated by blank lines, **bold**, *italic*, "- " list items.
function toMarkdown(node) {
  const inline = (n) => {
    if (n.nodeType === 3) return n.text.replace(/\s+/g, ' ');
    const inner = n.childNodes.map(inline).join('');
    const tag = n.rawTagName?.toLowerCase();
    if (tag === 'strong' || tag === 'b') return inner.trim() ? `**${inner.trim()}**` : '';
    if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : '';
    if (tag === 'br') return '\n';
    return inner;
  };
  const blocks = [];
  for (const n of node.childNodes) {
    const tag = n.rawTagName?.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      blocks.push(n.querySelectorAll('li').map((li) => `- ${inline(li).trim()}`).join('\n'));
    } else if (tag === 'table') {
      const rows = n.querySelectorAll('tr').map((tr) =>
        '| ' + tr.querySelectorAll('th,td').map((c) => inline(c).trim()).join(' | ') + ' |');
      blocks.push(rows.join('\n'));
    } else {
      const text = inline(n).trim();
      if (text) blocks.push(text);
    }
  }
  return blocks
    .join('\n\n')
    // dnd.su often wraps "<em><strong>Name</strong>.</em>"; normalize to "***Name.***"
    .replace(/\*\*\*([^*]+?)\*\*([.:])\*/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?)\*\*\*([.:])/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?[.:])\*\*\*(?=\S)/g, '***$1*** ');
}

async function importSpell(entry) {
  const url = BASE + entry.link;
  const root = parseHtml(await get(url));
  const card = root.querySelector('.cards-wrapper .card');
  const title = card.querySelector('.card-title span').text.trim(); // "Огненный шар [Fireball]"
  const [, name, nameEn] = title.match(/^(.*?)\s*\[(.*)\]$/) ?? [null, title, entry.title_en];

  // Source plaques next to the title: <span> = books this text comes from (e.g. PH14, XGE),
  // <a> = link to a different edition of the spell (PH24 on next.dnd.su), not this text.
  const plaques = card.querySelectorAll('.card-title .source-plaque');
  const sources = plaques
    .filter((el) => el.rawTagName === 'span')
    .map((el) => ({ code: el.text.trim(), book: el.getAttribute('title') }));
  const edition2024 = plaques.find((el) => el.rawTagName === 'a' && el.text.trim() === 'PH24');

  const spell = {
    name,
    name_en: nameEn,
    source_url: url,
    sources,
    ...(edition2024 && { url_2024: edition2024.getAttribute('href') }),
    level: null,
    school: entry.school.toLowerCase(),
  };

  for (const li of card.querySelectorAll('ul.params > li')) {
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
    }
    else if (label === 'Дистанция') spell.range = value;
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
    } else if (label === 'Классы') spell.classes = value.split(',').map((s) => s.trim().replace(/[A-Z]+$/, '')); // drop source tags like "бардTCE"
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
await fs.mkdir(DATA_DIR, { recursive: true });
let failed = 0;

const entries = [];
if (all) entries.push(...index.cards.map((c) => [c.title_en, c]));
for (const name of targets) entries.push([name, index.byName.get(norm(name))]);

for (const [i, [name, entry]] of entries.entries()) {
  const progress = `[${i + 1}/${entries.length}]`;
  if (!entry) {
    console.error(`✗ ${progress} ${name}: not found on dnd.su`);
    failed++;
    continue;
  }
  const file = path.join(DATA_DIR, `${entry.id}.yaml`);
  const exists = await fs.access(file).then(() => true, () => false);
  if (exists && !force) {
    console.log(`· ${progress} ${name}: already imported (${entry.id}.yaml)`);
    continue;
  }
  try {
    const spell = await importSpell(entry);
    await fs.writeFile(file, YAML.stringify({ id: entry.id, ...spell }, { lineWidth: 0 }));
    console.log(`✓ ${progress} ${name} → data/spells/${entry.id}.yaml`);
  } catch (e) {
    console.error(`✗ ${progress} ${name}: ${e.message}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 300)); // be polite to dnd.su
}
process.exit(failed ? 1 : 0);
