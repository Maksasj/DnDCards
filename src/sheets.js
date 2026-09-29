// Print layout: fits card text (autofit), packs cards into A4 pages (paginate, buildPage).
import { spellCard } from './cards/spell.js';

export const sortSpells = (a, b) => a.level - b.level || a.name.localeCompare(b.name, 'ru');

const PAGE_W = 210;
const PAGE_H = 297;
const CARD_W = 63;
const CARD_MIN_H = 88; // standard card height; long spells grow taller, never shorter
const PAGE_MIN_MARGIN = 10; // printers can't print to the edge; also room for crop marks
const COLUMN_MAX_H = PAGE_H - 2 * PAGE_MIN_MARGIN;
const FONT_MAX = 7.4; // pt
const FONT_MIN = 6.4; // below this the text gets hard to read; grow the card instead

const overflows = (body) => body.scrollHeight > body.clientHeight + 0.5;

// Fits the text of each card: first shrink the font a little, then make the card taller.
// Returns each card's height in mm.
function autofit(cards) {
  return cards.map((card) => {
    const body = card.querySelector('.body');
    let size = FONT_MAX;
    body.style.fontSize = `${size}pt`;
    while (overflows(body) && size > FONT_MIN) {
      size = Math.round((size - 0.2) * 10) / 10;
      body.style.fontSize = `${size}pt`;
    }
    let height = CARD_MIN_H;
    while (overflows(body) && height < COLUMN_MAX_H) {
      height += 1;
      card.style.height = `${height}mm`;
    }
    card.classList.toggle('tall', height > CARD_MIN_H);
    card.classList.toggle('overflow', overflows(body));
    return height;
  });
}

// Packs cards into A4 pages of 3 columns, filling each column top to bottom so the
// sort order reads down the columns. Returns [{ columns: [[{card, height}]], height }].
function paginate(cards, heights) {
  const pages = [];
  let page = null;
  let column = null;
  let columnH = 0;
  cards.forEach((card, i) => {
    const h = heights[i];
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

// Renders spells into `container` as A4 sheets (view "sheet") or loose zoomed cards (view "cards").
// Returns ids of cards that were made taller, and of cards whose text still doesn't fit.
export async function renderCards(container, spells, view) {
  // Cards are measured at print size (no zoom: zoom changes line wrapping), then moved into place.
  container.innerHTML = `<div class="measure">${[...spells].sort(sortSpells).map(spellCard).join('')}</div>`;
  await document.fonts.ready;
  const cards = [...container.querySelectorAll('.card')];
  const heights = autofit(cards);

  if (view === 'sheet') {
    container.replaceChildren(...paginate(cards, heights).map(buildPage));
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
