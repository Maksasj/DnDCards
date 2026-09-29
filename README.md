# DnD Cards

Printable D&D 5e cards (in Russian, from [dnd.su](https://dnd.su/)): spells, magic items, class features and feats.
Pick cards on the site, press **Печать / PDF**, print at 100% scale on A4, cut along the marks.

- Spells, magic items, class features (13 classes with official subclasses, their choices like Тотемный дух → Медведь,
  invocations, maneuvers, infusions) and feats, each on one page with filters.
- The selection is stored in the link (`#s=fireball&i=bag-of-holding&c=barbarian.yarost&f=war-caster`), so a deck can be shared by URL.
- Designed for grayscale printers: cards are 63 mm wide and at least 88 mm tall; long texts get taller cards,
  and texts longer than a page continue on a second card.

## Development

```
npm install
npm run dev                  # live preview at http://localhost:5173
npm run import:spells -- --all      # import spells from dnd.su into data/spells/*.yaml (skips existing files)
npm run import:items -- --all       # import magic items into data/items/*.yaml
npm run import:classes              # import the 13 main classes into data/classes/*.yaml
npm run import:feats -- --all       # import feats into data/feats/*.yaml
npm run import:spells -- "Fireball" # import single entries by English name (--force to overwrite)
npm run check                # sanity-check imported data
npm run pdf -- "<share link>" [name]  # out/<name>.pdf via headless Chromium (npx playwright install chromium first)
npm run png -- "<share link>" [name]  # out/png/<name>/*.png, one image per card, for design review
npm run build                # static site in dist/
```

Pushing to `master` deploys the site to GitHub Pages (`.github/workflows/deploy.yml`).

Spell texts and school icons © their authors, taken from dnd.su. This is a fan project for personal use at the table.
