# DnD Cards

Printable D&D 5e spell cards (in Russian, from [dnd.su](https://dnd.su/spells/)).
Pick spells on the site, press **Печать / PDF**, print at 100% scale on A4, cut along the marks.

- All spells on one page, filters by level / class / school / source book.
- The selection is stored in the link (`#s=fireball,shield,…`), so a deck can be shared by URL.
- Designed for grayscale printers: cards are 63 mm wide and at least 88 mm tall; long spells get taller cards.

## Development

```
npm install
npm run dev                  # live preview at http://localhost:5173
npm run import -- --all      # (re)import spells from dnd.su into data/spells/*.yaml (skips existing files)
npm run import -- "Fireball" # import single spells by English name
npm run check                # sanity-check imported data
npm run pdf -- "<share link>" [name]  # out/<name>.pdf via headless Chromium (npx playwright install chromium first)
npm run png -- "<share link>" [name]  # out/png/<name>/*.png, one image per card, for design review
npm run build                # static site in dist/
```

Pushing to `master` deploys the site to GitHub Pages (`.github/workflows/deploy.yml`).

Spell texts and school icons © their authors, taken from dnd.su. This is a fan project for personal use at the table.
