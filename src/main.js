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
import { renderCards, sortSpells } from './sheets.js';
import { SCHOOL_ICONS } from './cards/school-icons.js';

// YAML files arrive as parsed objects (see the yaml plugin in vite.config.js).
const spells = Object.values(import.meta.glob('/data/spells/*.yaml', { import: 'default', eager: true }))
  .sort(sortSpells);
const decks = Object.fromEntries(
  Object.entries(import.meta.glob('/decks/*.yaml', { import: 'default', eager: true }))
    .map(([file, deck]) => [file.match(/([^/]+)\.yaml$/)[1], deck]),
);
const byId = new Map(spells.map((s) => [s.id, s]));

const normEn = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const byEnName = new Map(spells.map((s) => [normEn(s.name_en), s]));

// Decks list spells by English name. Returns the matching spells and names with no data.
function deckSpells(deckId) {
  const missing = [];
  const found = (decks[deckId]?.spells ?? [])
    .map((n) => byEnName.get(normEn(n)) ?? (missing.push(n), null))
    .filter(Boolean);
  return { found, missing };
}

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const printMode = params.has('print'); // used by scripts/render.js: no UI, just sheets
document.body.classList.toggle('print', printMode);

// ---- Selection: shared via the URL hash (#s=id,id,…) and remembered in localStorage ----

const STORAGE_KEY = 'dnd-cards.selected';
let missing = [];

function initialSelection() {
  if (params.has('deck')) {
    const { found, missing: m } = deckSpells(params.get('deck'));
    missing = m;
    return found.map((s) => s.id);
  }
  const hash = new URLSearchParams(location.hash.slice(1)).get('s');
  if (hash !== null) return hash.split(',');
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

const selected = new Set(initialSelection().filter((id) => byId.has(id)));

function saveSelection() {
  const ids = [...selected];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage can be unavailable (private mode); the URL still carries the selection.
  }
  if (!printMode) history.replaceState(null, '', ids.length ? `#s=${ids.join(',')}` : location.pathname + location.search);
}

// ---- Filters ----

// Class list plus the parent classes of subclass-only spells ("магия хронургии (волшебник)").
const classesOf = (s) => [...(s.classes ?? []), ...(s.subclasses ?? []).map((x) => x.match(/\(([^)]+)\)$/)?.[1]).filter(Boolean)];

const filters = { q: '', levels: new Set(), cls: '', school: '', source: '', onlySelected: false };
const normRu = (s) => s.toLowerCase().replace(/ё/g, 'е');

function matches(s) {
  if (filters.onlySelected && !selected.has(s.id)) return false;
  if (filters.levels.size && !filters.levels.has(s.level)) return false;
  if (filters.cls && !classesOf(s).includes(filters.cls)) return false;
  if (filters.school && s.school !== filters.school) return false;
  if (filters.source && !(s.sources ?? []).some((x) => x.code === filters.source)) return false;
  if (filters.q) {
    const q = normRu(filters.q.trim());
    if (!normRu(s.name).includes(q) && !s.name_en.toLowerCase().includes(q)) return false;
  }
  return true;
}

const option = (value, label) => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
};

function setupFilters() {
  const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'ru'));

  $('class').append(option('', 'Все классы'), ...uniq(spells.flatMap((s) => s.classes ?? [])).map((c) => option(c, c)));
  $('school').append(option('', 'Все школы'), ...uniq(spells.map((s) => s.school)).map((c) => option(c, c)));
  const books = new Map(spells.flatMap((s) => s.sources ?? []).map((x) => [x.code, x.book]));
  $('source').append(option('', 'Все источники'),
    ...[...books].sort(([a], [b]) => a.localeCompare(b)).map(([code, book]) => option(code, `${code} — ${book}`)));

  const levels = [...new Set(spells.map((s) => s.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = level === 0 ? 'Заговоры' : level;
    b.title = levelTitle(level);
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      filters.levels.has(level) ? filters.levels.delete(level) : filters.levels.add(level);
      b.setAttribute('aria-pressed', String(filters.levels.has(level)));
      renderList();
    };
    $('levels').append(b);
  }

  $('q').oninput = (e) => { filters.q = e.target.value; renderList(); };
  $('class').onchange = (e) => { filters.cls = e.target.value; renderList(); };
  $('school').onchange = (e) => { filters.school = e.target.value; renderList(); };
  $('source').onchange = (e) => { filters.source = e.target.value; renderList(); };
  $('only-selected').onchange = (e) => { filters.onlySelected = e.target.checked; renderList(); };
}

// ---- Spell list ----

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let visible = [];

const levelTitle = (level) => (level === 0 ? 'Заговоры' : `${level} уровень`);

// All matching spells on one page, grouped by level, each group flowing into columns.
function renderList() {
  visible = spells.filter(matches);
  $('found').textContent = `Найдено: ${visible.length}`;
  if (!visible.length) {
    $('spells').innerHTML = `<p class="empty">Ничего не найдено. Измените поиск или фильтры.</p>`;
    return;
  }
  const groups = Map.groupBy(visible, (s) => s.level);
  $('spells').innerHTML = [...groups].map(([level, list]) => `
    <section class="level-group">
      <h2>${levelTitle(level)} <span>${list.length}</span></h2>
      <ul>${list.map((s) => `
        <li><label title="${s.school}">
          <input type="checkbox" value="${s.id}" ${selected.has(s.id) ? 'checked' : ''} />
          <span class="icon">${SCHOOL_ICONS[s.school] ?? ''}</span>
          <span class="ru">${escapeHtml(s.name)}</span>
          <span class="en">${escapeHtml(s.name_en)}</span>
          <span class="src">${(s.sources ?? []).map((x) => x.code).join(' ')}</span>
        </label></li>`).join('')}
      </ul>
    </section>`).join('');
}

function setupList() {
  $('spells').onchange = (e) => {
    if (e.target.type !== 'checkbox') return;
    e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value);
    selectionChanged();
  };
  $('add-found').onclick = () => {
    for (const s of visible) selected.add(s.id);
    selectionChanged();
    renderList();
  };
  $('clear').onclick = () => {
    selected.clear();
    selectionChanged();
    renderList();
  };
  $('deck').append(option('', 'Добавить колоду…'),
    ...Object.entries(decks).map(([id, d]) => option(id, `${d.name ?? id} (${d.spells?.length ?? 0})`)));
  $('deck').onchange = (e) => {
    const { found } = deckSpells(e.target.value);
    for (const s of found) selected.add(s.id);
    e.target.value = '';
    selectionChanged();
    renderList();
  };
}

// ---- Preview ----

let view = params.get('view') ?? 'sheet';
let renderToken = 0;
let renderTimer;

function selectionChanged() {
  saveSelection();
  updateCount();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 150);
}

function updateCount() {
  const n = selected.size;
  $('selected-count').textContent = n ? `(${n})` : '';
  $('print').disabled = n === 0;
  $('share').disabled = n === 0;
}

async function renderPreview() {
  const token = ++renderToken;
  const chosen = [...selected].map((id) => byId.get(id));
  const sheets = $('sheets');
  if (!chosen.length) {
    sheets.innerHTML = `<p class="empty-preview">Отметьте заклинания в списке — здесь появятся листы для печати.</p>`;
    $('status').textContent = '';
    window.__cards = { ready: true, count: 0, missing, overflow: [], tall: [] };
    return;
  }
  const result = await renderCards(sheets, chosen, view);
  if (token !== renderToken) return; // a newer render started meanwhile

  const pages = sheets.querySelectorAll('.page').length;
  const status = [];
  if (view === 'sheet') status.push(`${pages} ${plural(pages, 'лист', 'листа', 'листов')} A4`);
  if (missing.length) status.push(`нет данных: ${missing.join(', ')}`);
  if (result.overflow.length) status.push(`не влезает текст: ${result.overflow.join(', ')}`);
  $('status').textContent = status.join(' · ');
  window.__cards = { ready: true, count: chosen.length, missing, ...result };
}

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

// The selection lives in the URL hash, so the page address is a shareable link to this deck.
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
    const ids = new URLSearchParams(location.hash.slice(1)).get('s')?.split(',') ?? [];
    selected.clear();
    for (const id of ids) if (byId.has(id)) selected.add(id);
    selectionChanged();
    renderList();
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

setupFilters();
setupList();
setupPreview();
setupTabs();
setupSharing();
renderList();
updateCount();
renderPreview();
