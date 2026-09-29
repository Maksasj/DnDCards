import { ITEM_ICONS } from './item-icons.js';
import { inline, markdown } from '../markdown.js';

// Rarity order for sorting and filters; labels are used where the item's own
// wording is too long (e.g. "редкость варьируется (+1 необычный, +2 редкий, …)").
export const RARITIES = [
  ['common', 'обычный'],
  ['uncommon', 'необычный'],
  ['rare', 'редкий'],
  ['very_rare', 'очень редкий'],
  ['legendary', 'легендарный'],
  ['artifact', 'артефакт'],
  ['varies', 'разная редкость'],
  ['none', 'без редкости'],
];
export const RARITY_LABEL = Object.fromEntries(RARITIES);
export const RARITY_ORDER = Object.fromEntries(RARITIES.map(([key], i) => [key, i]));

// Spine text: "кольцо · редкое" — the item's own wording agrees in gender with the type.
const spineRarity = (it) =>
  it.rarity_key === 'varies' || it.rarity_key === 'none' || !it.rarity
    ? RARITY_LABEL[it.rarity_key]
    : it.rarity.replace(/\s*\(.*\)$/, '');

const attunement = (it) =>
  !it.attunement ? 'не требуется' : it.attunement_by ? `требуется ${it.attunement_by.toLowerCase()}` : 'требуется';

export function itemCard(it) {
  const type = it.type_detail ? `${it.type} (${it.type_detail})` : it.type;
  return `
  <article class="card item" data-id="item-${it.id}">
    <aside class="spine">
      <span class="level icon-box">${ITEM_ICONS[it.type_key] ?? ''}</span>
      <span class="school">${inline(`${it.type.toLowerCase()} · ${spineRarity(it)}`)}</span>
    </aside>
    <div class="face">
      <header>
        <h2 class="name">${inline(it.name)}</h2>
        <div class="name-en">${inline(it.name_en ?? '')}</div>
      </header>
      <dl class="stats">
        <div><dt>тип</dt><dd>${inline(type)}</dd></div>
        <div><dt>редкость</dt><dd>${inline(it.rarity || RARITY_LABEL[it.rarity_key])}</dd></div>
        <div><dt>настройка</dt><dd>${inline(attunement(it))}</dd></div>
        <div><dt>стоимость</dt><dd>${inline(it.price ?? '—')}</dd></div>
      </dl>
      <div class="body">
        ${markdown(it.description)}
      </div>
      <footer>
        <span class="classes"></span>
        <span class="sources">${(it.sources ?? []).map((x) => x.code).join(' ')}</span>
      </footer>
    </div>
  </article>`;
}
