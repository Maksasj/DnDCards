// Shared helpers for the dnd.su importers (import-spells.js, import-items.js).

import fs from 'node:fs/promises';
import path from 'node:path';
import { parse as parseHtml } from 'node-html-parser';
import YAML from 'yaml';

export const BASE = 'https://dnd.su';
const UA = { 'User-Agent': 'Mozilla/5.0 (dnd-cards importer)' };

export const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

export async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// Parses a dnd.su article page. Returns the article card and the fields every card type shares.
export async function fetchArticle(url, fallbackNameEn) {
  const card = parseHtml(await get(url)).querySelector('.cards-wrapper .card');
  const title = card.querySelector('.card-title span').text.trim(); // "Огненный шар [Fireball]"
  const [, name, nameEn] = title.match(/^(.*?)\s*\[(.*)\]$/) ?? [null, title, fallbackNameEn];

  // Source plaques next to the title: <span> = books this text comes from (e.g. PH14, XGE),
  // <a> = link to the 2024 edition on next.dnd.su (PH24, DMG24), which is a different text.
  const plaques = card.querySelectorAll('.card-title .source-plaque');
  const sources = plaques
    .filter((el) => el.rawTagName === 'span')
    .map((el) => ({ code: el.text.trim(), book: el.getAttribute('title') }));
  const edition2024 = plaques.find((el) => el.rawTagName === 'a' && /24$/.test(el.text.trim()));

  return {
    card,
    common: {
      name,
      name_en: nameEn,
      source_url: url,
      sources,
      ...(edition2024 && { url_2024: edition2024.getAttribute('href') }),
    },
  };
}

// Converts description HTML to the small markdown dialect the cards understand:
// paragraphs separated by blank lines, **bold**, *italic*, "- " list items, "| a | b |" tables.
export function toMarkdown(node) {
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
  const walk = (parent) => {
    for (const n of parent.childNodes) {
      const tag = n.rawTagName?.toLowerCase();
      if (tag === 'div' || tag === 'section' || tag === 'blockquote') {
        walk(n); // layout wrappers: their paragraphs are blocks of their own
      } else if (tag === 'h4' || tag === 'h5') {
        const text = inline(n).trim();
        if (text) blocks.push(`**${text.replace(/^\*+|\*+$/g, '')}**`); // table captions and the like
      } else if (tag === 'ul' || tag === 'ol') {
        blocks.push(n.querySelectorAll('li').map((li) => `- ${inline(li).trim()}`).join('\n'));
      } else if (tag === 'table') {
        const rows = n.querySelectorAll('tr').map((tr) =>
          '| ' + tr.querySelectorAll('th,td').map((c) => inline(c).trim().replace(/\|/g, '/')).join(' | ') + ' |');
        blocks.push(rows.join('\n'));
      } else {
        const text = inline(n).trim();
        if (text) blocks.push(text);
      }
    }
  };
  walk(node);
  return blocks
    .join('\n\n')
    // dnd.su nests bold/italic around headings in several ways ("<em><strong>Name</strong>.</em>",
    // "<strong><em>Name</em>.</strong>"); normalize to "***Name.***"
    .replace(/\*\*\*([^*]+?)\*\*([.:])\*/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?)\*([.:])\*\*/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?)\*\*\*([.:])/g, '***$1$2***')
    .replace(/\*\*\*([^*]+?[.:])\*\*\*(?=\S)/g, '***$1*** ');
}

// Command line shared by both importers:
//   --all        import everything in the dnd.su index that is missing
//   "Name" …     import single entries by English name
//   --force      overwrite existing files (loses hand edits!)
export function parseArgs(usage) {
  const args = process.argv.slice(2);
  const opts = {
    force: args.includes('--force'),
    all: args.includes('--all'),
    names: args.filter((a) => !a.startsWith('--')),
  };
  if (!opts.names.length && !opts.all) {
    console.error(usage);
    process.exit(1);
  }
  return opts;
}

// Imports [name, indexEntry] pairs into dataDir/<entry.id>.yaml with importOne(entry).
// Existing files are skipped unless force is set, so hand edits are safe.
export async function runImport({ entries, dataDir, force, importOne }) {
  await fs.mkdir(dataDir, { recursive: true });
  const rel = path.relative(process.cwd(), dataDir);
  let failed = 0;
  for (const [i, [name, entry]] of entries.entries()) {
    const progress = `[${i + 1}/${entries.length}]`;
    if (!entry) {
      console.error(`✗ ${progress} ${name}: not found on dnd.su`);
      failed++;
      continue;
    }
    const file = path.join(dataDir, `${entry.id}.yaml`);
    const exists = await fs.access(file).then(() => true, () => false);
    if (exists && !force) {
      console.log(`· ${progress} ${name}: already imported (${entry.id}.yaml)`);
      continue;
    }
    try {
      const data = await importOne(entry);
      await fs.writeFile(file, YAML.stringify({ id: entry.id, ...data }, { lineWidth: 0 }));
      console.log(`✓ ${progress} ${name} → ${rel}/${entry.id}.yaml`);
    } catch (e) {
      console.error(`✗ ${progress} ${name}: ${e.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 300)); // be polite to dnd.su
  }
  return failed;
}

// File id = URL slug ("/spells/205-fireball/" → "fireball"). If two entries share a slug,
// all but the preferred one keep their number ("205-fireball").
export function assignIds(entries, preferred) {
  const slugOf = (e) => e.link.match(/\/\d+-([^/]+)\/$/)[1];
  const count = new Map();
  for (const e of entries) count.set(slugOf(e), (count.get(slugOf(e)) ?? 0) + 1);
  for (const e of entries) {
    e.id = count.get(slugOf(e)) === 1 || preferred(e) ? slugOf(e) : e.link.match(/\/(\d+-[^/]+)\/$/)[1];
  }
}
