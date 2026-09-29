// Renders cards through the same page as the preview, using headless Chromium.
//
//   npm run pdf -- <link> [name]   → out/<name>.pdf         (print-ready A4 sheets)
//   npm run png -- <link> [name]   → out/png/<name>/*.png   (one image per card + sheet images, for review)
//
// <link> is a share link copied from the site ("…#s=fireball,shield"), or just "fireball,shield".
// [name] defaults to "cards".

import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const [mode, link, name = 'cards'] = process.argv.slice(2);
if (!['pdf', 'png'].includes(mode) || !link) {
  console.error('Usage: npm run pdf -- "<share link or id,id,…>" [name]');
  process.exit(1);
}
const ids = link.includes('s=') ? link.slice(link.indexOf('s=') + 2).split(/[&#]/)[0] : link;

const server = await createServer({ logLevel: 'error', server: { port: 0 } });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();

try {
  const page = await browser.newPage({ deviceScaleFactor: mode === 'png' ? 4 : 1 });
  const open = async (view) => {
    await page.goto(`${base}?view=${view}&print#s=${ids}`);
    await page.waitForFunction(() => window.__cards?.ready, null, { timeout: 30000 });
    return page.evaluate(() => window.__cards);
  };

  const info = await open('sheet');
  if (info.tall.length) console.log(`· Taller than standard (long text): ${info.tall.join(', ')}`);
  if (info.overflow.length) console.warn(`! Text does not fit on: ${info.overflow.join(', ')}`);

  if (mode === 'pdf') {
    await fs.mkdir('out', { recursive: true });
    const file = path.join('out', `${name}.pdf`);
    await page.pdf({ path: file, preferCSSPageSize: true, printBackground: true });
    console.log(`✓ ${info.count} cards → ${file}`);
  } else {
    const dir = path.join('out', 'png', name);
    await fs.rm(dir, { recursive: true, force: true });
    await fs.mkdir(dir, { recursive: true });
    await page.setViewportSize({ width: 800, height: 1123 });
    const pages = await page.$$('.page');
    for (const [i, el] of pages.entries()) await el.screenshot({ path: path.join(dir, `_sheet-${i + 1}.png`) });
    for (const el of await page.$$('.card')) {
      await el.screenshot({ path: path.join(dir, `${await el.getAttribute('data-id')}.png`) });
    }
    console.log(`✓ ${info.count} cards + ${pages.length} sheets → ${dir}/`);
  }
} finally {
  await browser.close();
  await server.close();
}
