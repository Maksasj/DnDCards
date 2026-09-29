# DnDCards: Plan

## Usage

```
npm run import -- party     # fetch missing spells of decks/party.yaml from dnd.su → data/spells/*.yaml
npm run dev                 # live preview at http://localhost:5173 (deck + view switch in the toolbar)
npm run pdf -- party        # → out/party.pdf, A4, 9 cards per page, crop marks
npm run png -- party        # → out/png/party/*.png, one image per card + per sheet (for design review)
```

Data files in `data/spells/` can be edited by hand; the importer never overwrites them without `--force`.

## Status (2026-09-29)

- Done: dnd.su importer, 35 spells of the party deck, spell card template (black-and-white spine with
  level box / school symbol (dnd.su icons); "концентрация" / "ритуал" written out in the stats grid), A4 sheet with 3 columns and crop marks, text fitting (shrink font to 6.4pt, then grow card taller; 88 mm is the minimum height, no maximum), PDF/PNG export, source books in the card footer (PH14, XGE, …; the PH24 link is stored as url_2024 but not printed).
- Decided: grayscale printer (no meaning carried by color; schools shown by symbol + name), A4, poker size 63×88 mm, Russian text from dnd.su, fonts Cormorant Garamond / PT Serif / PT Sans Narrow.
- Open: GitHub Pages site with all spells + filters (class / level / search), card backs, ability and item card types, test print to check size and readability.


Goal: turn spells, abilities and items from our wiki into printable cards (PDF) that we can cut out and use at the table.

## Approach

**Cards are HTML/CSS, and the PDF is rendered by a headless browser.**

- Browser layout gives us real typography: fonts, text wrapping, icons, borders, backgrounds. Doing that by hand with a PDF library (pdfkit, jsPDF) is painful.
- Chromium's print-to-PDF (through Playwright) supports exact physical sizes (`mm`), so cards come out at the right size.
- The same HTML runs as a live preview in the browser, so design changes show up instantly.
- I can take PNG screenshots of the cards and look at them myself, so I can check the design without you describing what's wrong.

## Stack

- Node.js (plain JavaScript, ES modules)
- Vite dev server: live preview of cards while designing
- Playwright (Chromium): HTML to PDF, and HTML to PNG for visual checks
- Card data in YAML files (easy to read and hand-edit)
- No framework needed at first. Plain HTML templates (or lightweight JSX) are enough.

## Data model (first draft)

One file per card, or one file per category:

```yaml
type: spell            # spell | ability | item
name: Fireball
level: 3
school: Evocation
casting_time: 1 action
range: 150 ft
components: V, S, M (a tiny ball of bat guano and sulfur)
duration: Instantaneous
classes: [Sorcerer, Wizard]
description: |
  A bright streak flashes from your pointing finger...
higher_levels: |
  +1d6 damage for each slot level above 3rd.
tags: [damage, aoe, fire]
```

Items and abilities get their own fields (rarity, attunement, uses/recharge, and so on). Each card type gets its own template.

## Print layout

- Card size: standard poker card, **63 × 88 mm** (fits normal card sleeves). Can be changed.
- 3 × 3 = **9 cards per A4/Letter page**, with crop marks for cutting.
- Optional card backs: the back page is mirrored so fronts and backs line up when printing double-sided.
- Printer-friendly mode: less ink, and still readable in black and white.

## Hard parts to plan for

1. **Long text.** Some spells have a lot of text. Options: shrink the font automatically until the text fits (down to a minimum size), continue on a second card, or use a larger card size for those spells. Auto-shrink comes first; the build warns when text still overflows.
2. **Getting the data from the wiki.** This depends on what the wiki is (Fandom/MediaWiki, Notion, custom site, and so on). Either a scraper/importer script that produces YAML, or a one-time conversion that we then hand-edit. I'll decide once I see the wiki.
3. **Licensing/fonts.** Use free fonts (for example from Google Fonts: a fantasy display font for titles and a readable serif for body text), bundled locally so builds work offline.

## Project layout

```
decks/           which cards go into a print run (party.yaml)
data/spells/     one YAML file per spell (imported, hand-editable)
src/cards/       card templates per type (spell.js)
src/styles/      card.css (card design), sheet.css (A4 layout, crop marks, preview)
src/main.js      preview page: loads data, lays out sheets, auto-fits text
scripts/         import-dndsu.js, render.js (PDF/PNG through headless Chromium)
out/             generated PDFs/PNGs (not in git)
```

## Milestones

1. **Skeleton:** one hard-coded spell card, preview, and a PDF at the correct size. Print one page and measure it with a ruler.
2. **Data:** YAML schema, several sample spells, 9-up sheet with crop marks.
3. **Design pass:** iterate on the look together (PNG screenshots, then feedback, then tweaks).
4. **Import:** pull the real spells/abilities from the wiki.
5. **More card types:** abilities, items, card backs, filters (for example "only my character's spells").
6. **Polish:** auto-fit text, overflow warnings, icons for school/damage type.

## Open questions

- A4 or US Letter paper?
- Card size: poker (63×88 mm), tarot (70×120 mm), or something else?
- Printing single-sided or double-sided (card backs)?
- Color or black-and-white printer?
- Which wiki, and what format is it in?
- Any visual style in mind (classic parchment, clean modern, per-class colors)?
