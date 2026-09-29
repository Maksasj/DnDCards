// Checks data/spells/*.yaml and data/items/*.yaml for fields the cards rely on.   npm run check
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { SCHOOL_ICONS } from '../src/cards/school-icons.js';
import { ITEM_ICONS } from '../src/cards/item-icons.js';

const RARITY_KEYS = ['common', 'uncommon', 'rare', 'very_rare', 'legendary', 'artifact', 'varies', 'none'];

async function check(kind, fields, rules) {
  const dir = path.resolve('data', kind);
  const files = (await fs.readdir(dir).catch(() => [])).filter((f) => f.endsWith('.yaml'));
  const problems = [];
  for (const file of files) {
    const e = YAML.parse(await fs.readFile(path.join(dir, file), 'utf8'));
    const bad = (msg) => problems.push(`${file}: ${msg}`);
    for (const field of fields) if (!e[field] && e[field] !== 0) bad(`missing ${field}`);
    if (!e.sources?.length) bad('no sources');
    if (/<[a-z]/i.test(e.description ?? '')) bad('HTML left in description');
    rules(e, bad);
  }
  console.log(`${kind}: ${files.length} checked, ${problems.length} problems`);
  for (const p of problems) console.log('  ' + p);
}

await check('spells', ['name', 'name_en', 'casting_time', 'range', 'components', 'duration', 'description'], (s, bad) => {
  if (!Number.isInteger(s.level) || s.level < 0 || s.level > 9) bad(`level is ${s.level}`);
  if (!SCHOOL_ICONS[s.school]) bad(`unknown school "${s.school}"`);
  if (!s.classes?.length && !s.subclasses?.length) bad('no classes or subclasses');
});

await check('items', ['name', 'name_en', 'type', 'description'], (it, bad) => {
  if (!ITEM_ICONS[it.type_key]) bad(`unknown type_key "${it.type_key}"`);
  if (!RARITY_KEYS.includes(it.rarity_key)) bad(`unknown rarity_key "${it.rarity_key}"`);
  if (!it.rarity && it.rarity_key !== 'none') bad('empty rarity');
});
