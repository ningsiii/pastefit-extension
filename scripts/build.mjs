import { build } from 'vite';
import { copyFileSync } from 'node:fs';
const watch = process.argv.includes('--watch');
// Chrome content scripts are classic scripts: bundle each entry without shared ES imports.
for (const [name, entry] of Object.entries({ content: 'src/extension/content.ts', selection: 'src/extension/selection-entry.ts', 'service-worker': 'src/extension/service-worker.ts', popup: 'src/extension/popup.ts', options: 'src/extension/options.ts' })) {
  await build({ configFile: false, build: {
    outDir: 'dist', emptyOutDir: name === 'content',
    ...(watch ? { watch: {} } : {}),
    lib: { entry, name: 'PasteFit', formats: ['iife'], fileName: () => `assets/${name}.js` }
  } });
}
if (!watch) {
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) copyFileSync(file, `dist/${file}`);
  await import('./check-build.mjs');
}
