// Print layout: fits card text (autofit), packs cards into A4 pages (paginate, buildPage).

const PAGE_W = 210;
const PAGE_H = 297;
const CARD_W = 63;
const CARD_MIN_H = 88; // standard card height; long spells grow taller, never shorter
const PAGE_MIN_MARGIN = 10; // printers can't print to the edge; also room for crop marks
const COLUMN_MAX_H = PAGE_H - 2 * PAGE_MIN_MARGIN;
const FONT_MAX = 7.4; // pt
const FONT_MIN = 6.4; // below this the text gets hard to read; grow the card instead
const FONT_LAST_RESORT = 5.8; // only for cards already as tall as the page; below that, split

const overflows = (body) => body.scrollHeight > body.clientHeight + 0.5;
const setFont = (body, size) => (body.style.fontSize = `${size}pt`);
const smaller = (size) => Math.round((size - 0.2) * 10) / 10;

// Fits one card: first shrink the font a little, then make the card taller, and only if the
// card has reached the page height, shrink the font a bit further. Returns the height in mm.
function fit(card) {
  const body = card.querySelector('.body');
  let size = FONT_MAX;
  setFont(body, size);
  while (overflows(body) && size > FONT_MIN) setFont(body, (size = smaller(size)));
  let height = CARD_MIN_H;
  while (overflows(body) && height < COLUMN_MAX_H) card.style.height = `${++height}mm`;
  while (overflows(body) && size > FONT_LAST_RESORT) setFont(body, (size = smaller(size)));
  return height;
}

// Splits a list or table so the rows that end below `bottom` go into a copy placed after it
// (tables repeat their header). Returns the copy, or null if no row fits above `bottom`.
function splitRows(block, bottom) {
  const rows = block.tagName === 'TABLE' ? [...block.querySelectorAll('tbody tr')] : [...block.children];
  const cut = rows.findIndex((r) => r.getBoundingClientRect().bottom > bottom);
  if (cut <= 0) return null;
  const rest = block.cloneNode(true);
  const restRows = rest.tagName === 'TABLE' ? [...rest.querySelectorAll('tbody tr')] : [...rest.children];
  restRows.slice(0, cut).forEach((r) => r.remove());
  rows.slice(cut).forEach((r) => r.remove());
  block.after(rest);
  return rest;
}

// A page-height card whose text still doesn't fit: move what doesn't fit onto a continuation
// card ("… (продолжение)") placed right after it. Lists and tables are split between rows.
// Returns the continuation card, or null when nothing can be moved (one huge unsplittable block).
function split(card) {
  const body = card.querySelector('.body');
  setFont(body, FONT_MIN);
  const bottom = body.getBoundingClientRect().bottom - 0.5;
  let blocks = [...body.children];
  let cut = blocks.findIndex((b) => b.getBoundingClientRect().bottom > bottom);
  if (cut < 0) return null;
  if (['TABLE', 'UL'].includes(blocks[cut].tagName) && splitRows(blocks[cut], bottom)) {
    blocks = [...body.children];
    cut += 1;
  }
  if (cut === 0) return null;

  const cont = card.cloneNode(true);
  cont.dataset.id = `${card.dataset.id}+`;
  cont.style.height = '';
  cont.querySelector('.stats')?.remove();
  const name = cont.querySelector('.name');
  if (!name.querySelector('.cont')) name.insertAdjacentHTML('beforeend', ' <span class="cont">(продолжение)</span>');
  const contBody = cont.querySelector('.body');
  contBody.replaceChildren(...blocks.slice(cut));
  card.after(cont);
  // Margins can still push the last kept block over the edge: move blocks until it fits.
  while (overflows(body) && body.children.length > 1) contBody.prepend(body.lastElementChild);
  return cont;
}

// Fits every card; cards too long even for the page get continuation cards.
// Returns [{ card, height }] in print order.
function autofit(cards) {
  const queue = [...cards];
  const out = [];
  for (let i = 0; i < queue.length; i++) {
    const card = queue[i];
    let height = fit(card);
    const body = card.querySelector('.body');
    if (overflows(body)) {
      const cont = split(card);
      if (cont) queue.splice(i + 1, 0, cont);
      else height = fit(card); // one huge block (e.g. a table): smallest font it is
    }
    card.classList.toggle('tall', height > CARD_MIN_H);
    card.classList.toggle('overflow', overflows(body));
    out.push({ card, height });
  }
  return out;
}

// Packs cards into A4 pages of 3 columns, filling each column top to bottom so the
// sort order reads down the columns. Returns [{ columns: [[{card, height}]], height }].
function paginate(fitted) {
  const pages = [];
  let page = null;
  let column = null;
  let columnH = 0;
  fitted.forEach(({ card, height: h }) => {
    if (!column || columnH + h > COLUMN_MAX_H) {
      if (!page || page.columns.length === 3) {
        page = { columns: [] };
        pages.push(page);
      }
      column = [];
      columnH = 0;
      page.columns.push(column);
    }
    column.push({ card, height: h });
    columnH += h;
  });
  for (const p of pages) {
    p.height = Math.max(...p.columns.map((c) => c.reduce((sum, x) => sum + x.height, 0)));
  }
  return pages;
}

// Page with columns centered on the sheet, plus crop marks:
//  - top/bottom marks for the vertical cuts between columns (cut these first),
//  - left/right marks for the horizontal cuts in the outer columns.
// The middle column is cut along the card outlines.
function buildPage({ columns, height }) {
  const x0 = (PAGE_W - 3 * CARD_W) / 2;
  const y0 = (PAGE_H - height) / 2;
  const section = document.createElement('section');
  section.className = 'page';

  const marks = [];
  for (let i = 0; i <= 3; i++) {
    const x = x0 + i * CARD_W;
    marks.push(`<i class="crop v" style="left:${x}mm;top:${y0 - 7.5}mm"></i>`,
      `<i class="crop v" style="left:${x}mm;top:${y0 + height + 1.5}mm"></i>`);
  }
  const edgeMarks = (col, side) => {
    let y = y0;
    const ys = [y];
    for (const { height: h } of col) ys.push((y += h));
    const x = side === 'left' ? x0 - 7.5 : x0 + 3 * CARD_W + 1.5;
    return ys.map((yy) => `<i class="crop h" style="left:${x}mm;top:${yy}mm"></i>`);
  };
  marks.push(...edgeMarks(columns[0], 'left'));
  if (columns[2]) marks.push(...edgeMarks(columns[2], 'right'));
  section.innerHTML = marks.join('');

  columns.forEach((col, i) => {
    const el = document.createElement('div');
    el.className = 'column';
    el.style.left = `${x0 + i * CARD_W}mm`;
    el.style.top = `${y0}mm`;
    for (const { card } of col) el.append(card);
    section.append(el);
  });
  return section;
}

// Renders card HTML (in print order) into `container` as A4 sheets (view "sheet") or loose
// zoomed cards (view "cards"). Returns ids of cards that were made taller, and of cards whose
// text still doesn't fit.
export async function renderCards(container, cardsHtml, view) {
  // Cards are measured at print size (no zoom: zoom changes line wrapping), then moved into place.
  container.innerHTML = `<div class="measure">${cardsHtml.join('')}</div>`;
  await document.fonts.ready;
  const fitted = autofit([...container.querySelectorAll('.card')]);
  const cards = fitted.map((f) => f.card);

  if (view === 'sheet') {
    container.replaceChildren(...paginate(fitted).map(buildPage));
  } else {
    const loose = document.createElement('div');
    loose.className = 'loose';
    loose.append(...cards);
    container.replaceChildren(loose);
  }
  return {
    tall: cards.filter((c) => c.classList.contains('tall')).map((c) => c.dataset.id),
    overflow: cards.filter((c) => c.classList.contains('overflow')).map((c) => c.dataset.id),
  };
}
