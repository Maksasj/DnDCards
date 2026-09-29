import { defineConfig } from 'vite';
import YAML from 'yaml';

// data/*.yaml and decks/*.yaml are converted to JSON at build time,
// so the site doesn't ship a YAML parser or parse hundreds of files in the browser.
const yaml = {
  name: 'yaml',
  transform(code, id) {
    if (!id.endsWith('.yaml')) return null;
    return { code: `export default ${JSON.stringify(YAML.parse(code))};`, map: null };
  },
};

export default defineConfig({
  // Relative asset paths: the site works under any GitHub Pages path (user.github.io/<repo>/).
  base: './',
  plugins: [yaml],
  server: {
    port: 5173,
    // The project lives on the Windows drive (/mnt/c) under WSL, where file change
    // events are unreliable, so poll for changes to keep live reload working.
    watch: { usePolling: true, interval: 300, ignored: ['**/node_modules/**', '**/out/**'] },
  },
});
