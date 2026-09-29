// Imports class features of the 13 main classes from dnd.su into data/classes/<class>.yaml.
//
//   npm run import:classes              import classes that are missing
//   npm run import:classes -- --force   re-import all of them (overwrites manual edits!)
//   npm run import:classes -- barbarian wizard --force
//
// A class page on dnd.su (e.g. /class/87-barbarian/) is one long article:
//
//   h2 "Классовые умения"            class features follow
//     h3 "ЯРОСТЬ"                    a feature; its first line is "1-й уровень, умение варвара"
//       h4 "Дуэлянт" …               sub-headings: options when the feature asks you to choose
//   h2.hide-next "Таинственные воззвания"   option lists (invocations, maneuvers, infusions)
//     h3 … / **Name.** paragraphs    one entry each
//   h2 "Пути дикости"                subclass group header (no .hide-next)
//   h2.hide-next "Путь тотемного воина"     a subclass …
//     h3 "ТОТЕМНЫЙ ДУХ"              … and its features
//   h2 "Unearthed Arcana & Unofficial"      playtest/homebrew: not imported

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import YAML from 'yaml';
import { BASE, get, toMarkdown } from './dndsu.js';

const CLASSES = {
  barbarian: '87-barbarian', bard: '88-bard', cleric: '89-cleric', druid: '90-druid',
  fighter: '91-fighter', monk: '93-monk', paladin: '94-paladin', ranger: '97-ranger',
  rogue: '99-rogue', sorcerer: '101-sorcerer', warlock: '104-warlock', wizard: '105-wizard',
  artificer: '137-artificer',
};
// Sections that are reference material, not something a character has.
const SKIP_FEATURE = /^(хиты, владение и снаряжение|увеличение характеристик|быстрое создание|ограничение:.*|)$/i;
const SKIP_SECTION = /^(изучение дикого облика|спутники повелителя зверей)$/i;

const DATA_DIR = path.resolve('data/classes');
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

// ---- helpers ----

const TRANSLIT = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};
const slug = (s) =>
  s.toLowerCase().replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// "ЗАЩИТА БЕЗ ДОСПЕХОВ" → "Защита без доспехов"; mixed-case titles are kept.
const title = (s) => {
  const t = s.replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
  return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t;
};
const text = (html) => parseHtml(html).text.replace(/\s+/g, ' ').trim();
const md = (html) => toMarkdown(parseHtml(html)).trim();

const bookKey = (s) => s.replace(/\u200e/g, '').replace(/[’‘]/g, "'").trim().toLowerCase();

// Book title → source code, learned from the already imported spells and items.
async function loadBookCodes() {
  const codes = new Map([['PH', 'PH14'], ['DMG', 'DMG14']]);
  for (const dir of ['data/spells', 'data/items']) {
    for (const f of await fs.readdir(dir).catch(() => [])) {
      const d = YAML.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      for (const s of d.sources ?? []) codes.set(bookKey(s.book), s.code);
    }
  }
  return codes;
}

// The article split at headings: [{ tag: 'h2'|'h3'|'h4', cls, title, html }], html = content up to the
// next heading. Collapsible sections (h2.hide-next + <div class="hide-wrapper">) also get an
// { tag: 'end' } token where their wrapper closes, so the parser knows when the section is over.
function sections(html) {
  const tokens = [];
  const re = /<(h[2345])([^>]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(html))) {
    const cls = m[2].match(/class=["']([^"']*)["']/)?.[1] ?? '';
    if (/tableTitle/.test(cls) || m[1] === 'h5') continue; // table captions etc. stay in the content
    tokens.push({ tag: m[1], cls, title: text(m[3]), start: m.index, end: re.lastIndex });
    if (m[1] === 'h2' && /hide-next/.test(cls)) {
      const open = html.indexOf('<div', re.lastIndex);
      if (open >= 0) tokens.push({ tag: 'end', start: wrapperEnd(html, open), end: wrapperEnd(html, open) });
    }
  }
  tokens.sort((a, b) => a.start - b.start);
  tokens.forEach((t, i) => (t.html = html.slice(t.end, tokens[i + 1]?.start ?? html.length)));
  return tokens;
}

// Position right after the </div> that closes the <div …> starting at `open`.
function wrapperEnd(html, open) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = open;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  return html.length;
}

// "3-й уровень, умение пути тотемного воина" / "Требование: 15-й уровень колдуна" at the top.
function splitHeader(markdown) {
  const blocks = markdown.split('\n\n');
  const out = {};
  const first = blocks[0]?.replace(/^\*+|\*+$/g, '').trim() ?? '';
  const level = first.match(/^(\d+)-й уровень/);
  if (level) {
    out.level = Number(level[1]);
    out.subtitle = first;
    blocks.shift();
  } else if (/^Требовани[ея]/i.test(first)) {
    out.prerequisite = first.replace(/^Требовани[ея]\s*:?\s*/i, '');
    const lvl = first.match(/(\d+)-й уровень/);
    if (lvl) out.level = Number(lvl[1]);
    blocks.shift();
  }
  out.description = blocks.join('\n\n').trim();
  return out;
}

// Paragraphs like "***Медведь.*** В состоянии ярости …" in a feature that asks you to choose.
const LABELED = /^\*{2,3}([^*]{1,60}?)\.?\*{2,3}\.?\s*(?:\*[^*]*\*\s*)?([\s\S]*)$/;
function labeledOptions(description) {
  const blocks = description.split('\n\n');
  const options = [];
  for (const b of blocks) {
    const m = b.match(LABELED);
    if (m && m[2].trim()) options.push({ name: title(m[1].replace(/\*/g, '')), description: m[2].trim() });
  }
  return options;
}
const asksToChoose = (s) => /выб(ира|ер|ор)/i.test(s);
// Sub-headings that are parts of a feature, not alternatives to choose from (Spellcasting, Combat Superiority).
const PART_OF_FEATURE =
  /^(заговоры|ячейки заклинаний|известные заклинания|подготовка и накладывание|базовая характеристика|фокусировка|ритуал|приёмы|кости превосходства|спасброски|сложность|заклинания (домена|клятвы|круга))/i;
// Lists a character follows as a whole (paladin tenets), not alternatives.
const NOT_A_CHOICE = /^(догматы|принципы)/i;

function finishFeature(f, idPrefix) {
  const head = splitHeader(md(f.html));
  const feature = { id: `${idPrefix}.${slug(f.name)}`, name: f.name, ...head };
  // Options from sub-headings (Fighting Style: Дуэлянт, Защита, …) …
  let options = f.subs.map((s) => ({ name: title(s.title), description: md(s.html) })).filter((o) => o.description);
  if (options.length && (!asksToChoose(head.description) || options.length < 2 || options.some((o) => PART_OF_FEATURE.test(o.name)))) {
    // … unless they are just parts of the feature (Pact Magic: Ячейки заклинаний, …)
    feature.description = [feature.description, ...options.map((o) => `**${o.name}.** ${o.description}`)].join('\n\n');
    options = [];
  }
  // … or from labeled paragraphs (Totem Spirit: Медведь, Орёл, …)
  if (!options.length && asksToChoose(head.description) && !NOT_A_CHOICE.test(f.name)) {
    const labeled = labeledOptions(head.description);
    if (labeled.length >= 2 && !labeled.some((o) => PART_OF_FEATURE.test(o.name))) options = labeled;
  }
  if (options.length) {
    feature.options = options.map((o) => ({ id: `${feature.id}.${slug(o.name)}`, ...o }));
  }
  return feature;
}

// ---- class page ----

async function importClass(key, bookCodes) {
  const url = `${BASE}/class/${CLASSES[key]}/`;
  const html = await get(url);
  const page = parseHtml(html);
  const heading = page.querySelector('h2.card-title').text.trim(); // "Варвар [Barbarian]"
  const [, name, nameEn] = heading.match(/^(.*?)\s*\[(.*)\]$/) ?? [null, heading, key];
  // Class pages have no source plaques: the classic 12 are from the Player's Handbook.
  const classSources = key === 'artificer'
    ? [{ code: 'TCE', book: "Tasha's Cauldron of Everything" }]
    : [{ code: 'PH14', book: "Player's Handbook" }];

  const start = html.search(/<h2[^>]*>(?:<span[^>]*>)?\s*Классовые умения/);
  let end = html.search(/id=['"]unofficial['"]/);
  if (end < 0) end = html.indexOf('>Комментарии<');
  const article = html.slice(start, end);

  const result = { id: key, name, name_en: nameEn, source_url: url, sources: classSources, features: [], lists: [], subclasses: [] };
  const classOwner = { features: result.features, idPrefix: key };
  let phase = 'class'; // 'class' until the subclass group header, then 'subclasses'
  let ctx = 'class'; // where content goes: class | list | subclass | between | skip
  let owner = classOwner; // where finished features go: the class or a subclass
  let feature = null; // { name, html, subs: [] } being collected
  let list = null; // { id, name, parts: [{ heading?, html }] } being collected

  const flushFeature = () => {
    if (feature && !feature.skip) {
      const f = finishFeature(feature, owner.idPrefix);
      owner.features.push(f);
    }
    feature = null;
  };
  const flushList = () => {
    if (!list) return;
    // Entries are headings (invocations, infusions) or "**Name.** text" paragraphs (maneuvers).
    const entries = [];
    for (const part of list.parts) {
      const markdown = md(part.html);
      const labeled = labeledOptions(markdown);
      if (labeled.length >= 2 || (!part.heading && labeled.length)) entries.push(...labeled);
      else if (part.heading) entries.push({ name: title(part.heading), ...splitHeader(markdown) });
    }
    result.lists.push({ id: list.id, name: list.name, entries: entries.map((e) => ({ id: `${list.id}.${slug(e.name)}`, ...e })) });
    list = null;
  };
  const closeSection = () => {
    flushFeature();
    flushList();
    ctx = phase === 'class' ? 'class' : 'between';
    owner = classOwner;
  };

  for (const s of sections(article)) {
    if (s.tag === 'end') {
      closeSection();
      continue;
    }
    if (s.tag === 'h2') {
      closeSection();
      const collapsible = /hide-next/.test(s.cls);
      if (s.title === 'Классовые умения') {
        phase = ctx = 'class';
      } else if (SKIP_SECTION.test(s.title)) {
        ctx = 'skip';
      } else if (collapsible && phase === 'class') {
        ctx = 'list';
        list = { id: `${key}.${slug(s.title)}`, name: title(s.title), parts: [{ html: s.html }] };
      } else if (collapsible) {
        ctx = 'subclass';
        const source = text(s.html).match(/Источник:\s*«([^»]+)»/)?.[1];
        const code = source && bookCodes.get(bookKey(source));
        const subclass = {
          id: `${key}.${slug(s.title)}`,
          name: title(s.title),
          sources: code ? [{ code, book: source.replace(/\u200e/g, '') }] : source ? [{ code: source, book: source }] : classSources,
          features: [],
        };
        result.subclasses.push(subclass);
        owner = { features: subclass.features, idPrefix: subclass.id };
      } else if (phase === 'class') {
        phase = 'subclasses'; // "Пути дикости": the subclasses follow
        ctx = 'between';
      } else {
        ctx = 'skip'; // other material between subclasses (e.g. beast companion stat blocks)
      }
      continue;
    }
    if (ctx === 'skip' || ctx === 'between') continue;

    if (ctx === 'list') {
      list.parts.push({ heading: s.title, html: s.html });
      continue;
    }
    // class features / subclass features
    if (s.tag === 'h3') {
      flushFeature();
      const skip = SKIP_FEATURE.test(s.title) || /spoiler_head/.test(s.cls);
      feature = { name: title(s.title), html: s.html, subs: [], skip };
    } else if (feature) {
      feature.subs.push(s);
    }
  }
  closeSection();
  // A few features have no level line: they belong with the feature before them, or (when they
  // open a subclass, like paladin tenets) with the next one.
  for (const group of [result.features, ...result.subclasses.map((sc) => sc.features)]) {
    group.forEach((f, i) => {
      if (f.level !== undefined) return;
      f.level = group.slice(0, i).reverse().find((g) => g.level !== undefined)?.level
        ?? group.slice(i + 1).find((g) => g.level !== undefined)?.level;
    });
  }
  return result;
}

const bookCodes = await loadBookCodes();
await fs.mkdir(DATA_DIR, { recursive: true });
let failed = 0;
for (const key of only.length ? only : Object.keys(CLASSES)) {
  if (!CLASSES[key]) {
    console.error(`✗ ${key}: unknown class (${Object.keys(CLASSES).join(', ')})`);
    failed++;
    continue;
  }
  const file = path.join(DATA_DIR, `${key}.yaml`);
  if (!force && (await fs.access(file).then(() => true, () => false))) {
    console.log(`· ${key}: already imported`);
    continue;
  }
  try {
    const c = await importClass(key, bookCodes);
    await fs.writeFile(file, YAML.stringify(c, { lineWidth: 0 }));
    const opts = [...c.features, ...c.subclasses.flatMap((s) => s.features)].reduce((n, f) => n + (f.options?.length ?? 0), 0);
    console.log(`✓ ${key}: ${c.features.length} features, ${c.lists.map((l) => `${l.name} (${l.entries.length})`).join(', ') || 'no lists'}, ` +
      `${c.subclasses.length} subclasses (${c.subclasses.reduce((n, s) => n + s.features.length, 0)} features), ${opts} options`);
  } catch (e) {
    console.error(`✗ ${key}: ${e.stack}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 300));
}
process.exit(failed ? 1 : 0);
