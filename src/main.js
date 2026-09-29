import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/pt-serif/400.css';
import '@fontsource/pt-serif/400-italic.css';
import '@fontsource/pt-serif/700.css';
import '@fontsource/pt-serif/700-italic.css';
import '@fontsource/pt-sans-narrow/400.css';
import '@fontsource/pt-sans-narrow/700.css';
import './styles/card.css';
import './styles/sheet.css';
import './styles/app.css';
import { renderCards } from './sheets.js';
import { createPicker } from './picker.js';
import { spellCard } from './cards/spell.js';
import { itemCard, RARITY_ORDER } from './cards/item.js';
import { SCHOOL_ICONS } from './cards/school-icons.js';
import { ITEM_ICONS } from './cards/item-icons.js';
import { featureCard, featCard, flattenClasses, FEAT_ICON } from './cards/feature.js';

// YAML files arrive as parsed objects (see the yaml plugin in vite.config.js).
const load = (files) => Object.values(files);
const byName = (a, b) => a.name.localeCompare(b.name, 'ru');
const spells = load(import.meta.glob('/data/spells/*.yaml', { import: 'default', eager: true }))
  .sort((a, b) => a.level - b.level || byName(a, b));
const items = load(import.meta.glob('/data/items/*.yaml', { import: 'default', eager: true }))
  .sort((a, b) => RARITY_ORDER[a.rarity_key] - RARITY_ORDER[b.rarity_key] || byName(a, b));

// Class order as in the Player's Handbook (Artificer last); features keep their page order.
const CLASS_ORDER = ['barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk', 'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard', 'artificer'];
const classes = load(import.meta.glob('/data/classes/*.yaml', { import: 'default', eager: true }))
  .sort((a, b) => CLASS_ORDER.indexOf(a.id) - CLASS_ORDER.indexOf(b.id));
const features = flattenClasses(classes);
// Feats are grouped by book, Player's Handbook first.
const featBook = (f) => (f.sources?.[0]?.code === 'PH14' ? '' : f.sources?.[0]?.code ?? '~');
const feats = load(import.meta.glob('/data/feats/*.yaml', { import: 'default', eager: true }))
  .sort((a, b) => featBook(a).localeCompare(featBook(b)) || byName(a, b));

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const printMode = params.has('print'); // used by scripts/render.js: no UI, just sheets
document.body.classList.toggle('print', printMode);

const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'ru'));
const sourceOptions = (list) =>
  [...new Map(list.flatMap((e) => e.sources ?? []).map((x) => [x.code, x.book]))]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, book]) => [code, `${code} — ${book}`]);
const hasSource = (e, code) => (e.sources ?? []).some((x) => x.code === code);

// ---- Collections: each has its own picker tab, URL key and card template ----

// Class list; spells only available to subclasses count for the parent class ("магия хронургии (волшебник)").
const classesOf = (s) =>
  s.classes?.length ? s.classes : (s.subclasses ?? []).map((x) => x.match(/\(([^)]+)\)$/)?.[1]).filter(Boolean);
const levelTitle = (level) => (level === 0 ? 'Заговоры' : `${level} уровень`);

const RARITY_GROUP = {
  common: 'Обычные', uncommon: 'Необычные', rare: 'Редкие', very_rare: 'Очень редкие',
  legendary: 'Легендарные', artifact: 'Артефакты', varies: 'Разная редкость', none: 'Без редкости',
};

const collections = {
  spells: {
    hashKey: 's',
    data: spells,
    card: spellCard,
    searchPlaceholder: 'Поиск заклинаний (рус. или англ.)',
    chips: {
      label: 'Уровень',
      values: uniq(spells.map((s) => String(s.level))).map(Number).sort((a, b) => a - b),
      get: (s) => s.level,
      text: (v) => (v === 0 ? 'Заговоры' : v),
      title: levelTitle,
    },
    selects: [
      { all: 'Все классы', options: uniq(spells.flatMap(classesOf)).map((c) => [c, c]), test: (s, v) => classesOf(s).includes(v) },
      { all: 'Все школы', options: uniq(spells.map((s) => s.school)).map((c) => [c, c]), test: (s, v) => s.school === v },
      { all: 'Все источники', options: sourceOptions(spells), test: hasSource },
    ],
    group: (s) => s.level,
    groupTitle: levelTitle,
    icon: (s) => SCHOOL_ICONS[s.school],
    iconTitle: (s) => s.school,
  },
  items: {
    hashKey: 'i',
    data: items,
    card: itemCard,
    searchPlaceholder: 'Поиск предметов (рус. или англ.)',
    chips: {
      label: 'Редкость',
      values: Object.keys(RARITY_ORDER).filter((k) => items.some((it) => it.rarity_key === k)),
      get: (it) => it.rarity_key,
      text: (k) => RARITY_GROUP[k],
      title: (k) => RARITY_GROUP[k],
    },
    selects: [
      { all: 'Все типы', options: uniq(items.map((it) => it.type)).map((t) => [t, t]), test: (it, v) => it.type === v },
      {
        all: 'Настройка: любая',
        options: [['yes', 'Требует настройки'], ['no', 'Без настройки']],
        test: (it, v) => it.attunement === (v === 'yes'),
      },
      { all: 'Все источники', options: sourceOptions(items), test: hasSource },
    ],
    group: (it) => it.rarity_key,
    groupTitle: (k) => RARITY_GROUP[k],
    icon: (it) => ITEM_ICONS[it.type_key],
    iconTitle: (it) => it.type,
  },
  classes: {
    hashKey: 'c',
    data: features,
    card: featureCard,
    searchPlaceholder: 'Поиск умений (например «ярость»)',
    chips: {
      label: 'Класс',
      values: classes.map((c) => c.id),
      get: (e) => e.classId,
      text: (id) => classes.find((c) => c.id === id).name,
      title: (id) => classes.find((c) => c.id === id).name,
    },
    selects: [
      {
        // Picking a subclass shows the class's own features plus only that subclass.
        all: 'Все подклассы',
        options: classes.flatMap((c) => c.subclasses.map((sc) => [sc.id, `${c.name}: ${sc.name}`])),
        test: (e, v) => e.classId === v.split('.')[0] && (!e.subclassId || e.subclassId === v),
      },
      {
        all: 'Любой уровень',
        options: Array.from({ length: 20 }, (_, i) => [String(i + 1), `до ${i + 1}-го уровня`]),
        test: (e, v) => (e.level ?? 0) <= Number(v),
      },
    ],
    group: (e) => e.group,
    groupTitle: (g) => features.find((e) => e.group === g).groupName,
    icon: (e) => (e.level ? `<b class="lvl-num">${e.level}</b>` : ''),
    iconTitle: (e) => (e.level ? `${e.level}-й уровень` : ''),
    hint: (e) => e.optionOf ?? (e.prerequisite ? `требование: ${e.prerequisite}` : ''),
  },
  feats: {
    hashKey: 'f',
    data: feats,
    card: featCard,
    searchPlaceholder: 'Поиск черт (рус. или англ.)',
    selects: [
      {
        all: 'Требования: любые',
        options: [['none', 'Без требований'], ['some', 'С требованием']],
        test: (f, v) => Boolean(f.prerequisite) === (v === 'some'),
      },
      { all: 'Все источники', options: sourceOptions(feats), test: hasSource },
    ],
    group: (f) => f.sources?.[0]?.code ?? '',
    groupTitle: (code) => feats.find((f) => f.sources?.[0]?.code === code)?.sources[0].book ?? code,
    icon: () => FEAT_ICON,
    iconTitle: (f) => (f.prerequisite ? `Требование: ${f.prerequisite}` : ''),
  },
};
for (const c of Object.values(collections)) {
  c.byId = new Map(c.data.map((e) => [e.id, e]));
  c.selected = new Set();
}

// ---- Selection: shared via the URL hash (#s=…&i=…&c=…&f=…) and remembered in localStorage ----

const STORAGE_KEY = 'dnd-cards.selected';

function readHash() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (![...Object.values(collections)].some((c) => hash.has(c.hashKey))) return null;
  return Object.fromEntries(Object.values(collections).map((c) => [c.hashKey, hash.get(c.hashKey)?.split(',') ?? []]));
}

function readStorage() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return Array.isArray(saved) ? { s: saved } : saved; // older versions stored only spell ids
  } catch {
    return {};
  }
}

function applySelection(ids) {
  for (const c of Object.values(collections)) {
    c.selected.clear();
    for (const id of ids[c.hashKey] ?? []) if (c.byId.has(id)) c.selected.add(id);
  }
}

function saveSelection() {
  const ids = Object.fromEntries(Object.values(collections).map((c) => [c.hashKey, [...c.selected]]));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode); the URL still carries the selection.
  }
  const hash = Object.entries(ids).filter(([, v]) => v.length).map(([k, v]) => `${k}=${v.join(',')}`).join('&');
  if (!printMode) history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

// ---- Preview ----

let view = params.get('view') ?? 'sheet';
let renderToken = 0;
let renderTimer;

function selectionChanged() {
  saveSelection();
  updateCounts();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 150);
}

const totalSelected = () => Object.values(collections).reduce((n, c) => n + c.selected.size, 0);
const count = (n) => (n ? ` (${n})` : '');

function updateCounts() {
  $('count-spells').textContent = count(collections.spells.selected.size);
  $('count-items').textContent = count(collections.items.selected.size);
  $('count-classes').textContent = count(collections.classes.selected.size);
  $('count-feats').textContent = count(collections.feats.selected.size);
  $('count-sheets').textContent = count(totalSelected());
  $('print').disabled = totalSelected() === 0;
  $('share').disabled = totalSelected() === 0;
}

async function renderPreview() {
  const token = ++renderToken;
  // Print order: spells, items, class features, feats — each in list order.
  const html = Object.values(collections).flatMap((c) => c.data.filter((e) => c.selected.has(e.id)).map(c.card));
  const sheets = $('sheets');
  if (!html.length) {
    sheets.innerHTML = `<p class="empty-preview">Отметьте заклинания, предметы, умения или черты — здесь появятся листы для печати.</p>`;
    $('status').textContent = '';
    window.__cards = { ready: true, count: 0, overflow: [], tall: [] };
    return;
  }
  const result = await renderCards(sheets, html, view);
  if (token !== renderToken) return; // a newer render started meanwhile

  const pages = sheets.querySelectorAll('.page').length;
  const status = [];
  if (view === 'sheet') status.push(`${pages} ${plural(pages, 'лист', 'листа', 'листов')} A4`);
  if (result.overflow.length) status.push(`не влезает текст: ${result.overflow.join(', ')}`);
  $('status').textContent = status.join(' · ');
  window.__cards = { ready: true, count: html.length, ...result };
}

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// ---- Wiring ----

const pickers = Object.entries(collections).map(([key, c]) => createPicker({ key, ...c, onChange: selectionChanged }));
const renderLists = () => pickers.forEach((p) => p.render());

// The selection lives in the URL hash, so the page address is a shareable link to this selection.
function setupSharing() {
  $('share').onclick = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $('share').textContent = 'Ссылка скопирована';
    } catch {
      prompt('Скопируйте ссылку:', location.href);
    }
    setTimeout(() => ($('share').textContent = 'Скопировать ссылку'), 2000);
  };
  // A different link pasted into an open tab only changes the hash; load that selection.
  window.addEventListener('hashchange', () => {
    applySelection(readHash() ?? {});
    selectionChanged();
    renderLists();
  });
}

function setupTabs() {
  for (const tab of document.querySelectorAll('.tabs [role=tab]')) {
    tab.onclick = () => {
      document.body.dataset.tab = tab.dataset.tab;
      for (const t of document.querySelectorAll('.tabs [role=tab]')) t.setAttribute('aria-selected', String(t === tab));
      window.scrollTo(0, 0);
    };
  }
}

function setupPreview() {
  $('view').value = view;
  $('view').onchange = (e) => {
    view = e.target.value;
    renderPreview();
  };
  $('print').onclick = async () => {
    if (view !== 'sheet') {
      view = $('view').value = 'sheet';
      await renderPreview();
    }
    window.print();
  };
}

applySelection(readHash() ?? readStorage());
setupPreview();
setupTabs();
setupSharing();
renderLists();
updateCounts();
renderPreview();
