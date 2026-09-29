// A one-page picker for one collection (spells or items): search, filter chips and selects,
// and all matching entries grouped into columns with checkboxes.

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const normRu = (s) => s.toLowerCase().replace(/ё/g, 'е');

const option = (value, label) => {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
};

/**
 * config: {
 *   key,            'spells' | 'items' — element ids use it: filters-<key>, list-<key>, …
 *   data,           entries in display order
 *   selected,       Set of selected ids (shared with the rest of the app)
 *   searchPlaceholder,
 *   chips: { label, values, get(entry), text(value), title(value) },   quick toggle filter
 *   selects: [{ all, options: [[value, label]], test(entry, value) }],
 *   group(entry), groupTitle(groupKey),
 *   icon(entry), iconTitle(entry),
 *   onChange(),     called after the selection changed
 * }
 */
export function createPicker(config) {
  const { key, data, selected } = config;
  const state = { q: '', chips: new Set(), selects: config.selects.map(() => ''), onlySelected: false };
  const list = $(`list-${key}`);
  let visible = [];

  const matches = (e) => {
    if (state.onlySelected && !selected.has(e.id)) return false;
    if (state.chips.size && !state.chips.has(config.chips.get(e))) return false;
    if (config.selects.some((s, i) => state.selects[i] && !s.test(e, state.selects[i]))) return false;
    if (state.q) {
      const q = normRu(state.q.trim());
      if (!normRu(e.name).includes(q) && !e.name_en.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  function render() {
    visible = data.filter(matches);
    $(`found-${key}`).textContent = `Найдено: ${visible.length}`;
    if (!visible.length) {
      list.innerHTML = `<p class="empty">Ничего не найдено. Измените поиск или фильтры.</p>`;
      return;
    }
    list.innerHTML = [...Map.groupBy(visible, config.group)].map(([group, entries]) => `
      <section class="level-group">
        <h2>${config.groupTitle(group)} <span>${entries.length}</span></h2>
        <ul>${entries.map((e) => `
          <li><label title="${escapeHtml(config.iconTitle(e))}">
            <input type="checkbox" value="${e.id}" ${selected.has(e.id) ? 'checked' : ''} />
            <span class="icon">${config.icon(e) ?? ''}</span>
            <span class="ru">${escapeHtml(e.name)}</span>
            <span class="en">${escapeHtml(e.name_en)}</span>
            <span class="src">${(e.sources ?? []).map((x) => x.code).join(' ')}</span>
          </label></li>`).join('')}
        </ul>
      </section>`).join('');
  }

  // ---- Filter bar ----
  const filters = $(`filters-${key}`);
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = config.searchPlaceholder;
  search.autocomplete = 'off';
  search.oninput = () => { state.q = search.value; render(); };

  const chips = document.createElement('div');
  chips.className = 'levels';
  chips.setAttribute('role', 'group');
  chips.setAttribute('aria-label', config.chips.label);
  for (const value of config.chips.values) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = config.chips.text(value);
    b.title = config.chips.title(value);
    b.setAttribute('aria-pressed', 'false');
    b.onclick = () => {
      state.chips.has(value) ? state.chips.delete(value) : state.chips.add(value);
      b.setAttribute('aria-pressed', String(state.chips.has(value)));
      render();
    };
    chips.append(b);
  }

  const selects = config.selects.map((s, i) => {
    const el = document.createElement('select');
    el.setAttribute('aria-label', s.all);
    el.append(option('', s.all), ...s.options.map(([v, label]) => option(v, label)));
    el.onchange = () => { state.selects[i] = el.value; render(); };
    return el;
  });
  filters.append(search, chips, ...selects);

  // ---- Actions ----
  $(`only-selected-${key}`).onchange = (e) => { state.onlySelected = e.target.checked; render(); };
  $(`add-found-${key}`).onclick = () => {
    for (const e of visible) selected.add(e.id);
    config.onChange();
    render();
  };
  $(`clear-${key}`).onclick = () => {
    selected.clear();
    config.onChange();
    render();
  };
  list.onchange = (e) => {
    if (e.target.type !== 'checkbox') return;
    e.target.checked ? selected.add(e.target.value) : selected.delete(e.target.value);
    config.onChange();
  };

  return { render };
}
