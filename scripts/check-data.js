// Checks data/spells/*.yaml for fields the cards rely on.   npm run check
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { SCHOOL_ICONS } from '../src/cards/school-icons.js';

const dir = path.resolve('data/spells');
const problems = [];
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.yaml'));

for (const file of files) {
  const s = YAML.parse(await fs.readFile(path.join(dir, file), 'utf8'));
  const bad = (msg) => problems.push(`${file}: ${msg}`);
  if (!Number.isInteger(s.level) || s.level < 0 || s.level > 9) bad(`level is ${s.level}`);
  if (!SCHOOL_ICONS[s.school]) bad(`unknown school "${s.school}"`);
  for (const field of ['name', 'name_en', 'casting_time', 'range', 'components', 'duration', 'description']) {
    if (!s[field]) bad(`missing ${field}`);
  }
  if (!s.sources?.length) bad('no sources');
  if (!s.classes?.length && !s.subclasses?.length) bad('no classes or subclasses');
  if (/<[a-z]/i.test(s.description ?? '')) bad('HTML left in description');
}

console.log(`${files.length} spells checked, ${problems.length} problems`);
for (const p of problems) console.log('  ' + p);
