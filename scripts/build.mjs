import { build } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const localInstaller = process.env.PASTEFIT_MAC_TEST_INSTALLER;
const installerUrl = localInstaller ? `installers/PasteFitBridge-mac-universal.${localInstaller.endsWith('.pkg') ? 'pkg' : 'dmg'}` : (process.env.PASTEFIT_MAC_INSTALLER_URL ?? '');
if (installerUrl && !localInstaller && !/^https:\/\//.test(installerUrl)) throw new Error('Installer download URL must use HTTPS');
const watch = process.argv.includes('--watch');
// Chrome content scripts are classic scripts: bundle each entry without shared ES imports.
for (const [name, entry] of Object.entries({ content: 'src/extension/content.ts', selection: 'src/extension/selection-entry.ts', 'service-worker': 'src/extension/service-worker.ts', popup: 'src/extension/popup.ts', options: 'src/extension/options.ts', 'pages-native-setup': 'src/extension/pages-native-setup.ts' })) {
  await build({ configFile: false, define: { __PASTEFIT_INSTALLER_URL__: JSON.stringify(installerUrl) }, esbuild: { charset: 'ascii' }, build: {
    outDir: 'dist', emptyOutDir: name === 'content',
    ...(watch ? { watch: {} } : {}),
    lib: { entry, name: 'PasteFit', formats: ['iife'], fileName: () => `assets/${name}.js` }
  } });
}
if (!watch) {
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) copyFileSync(file, `dist/${file}`);
  if (localInstaller && process.env.PASTEFIT_MAC_TEST_KEEP_ID !== '1') {
    const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
    manifest.key = JSON.parse(readFileSync('native/macos/test-extension.json', 'utf8')).key;
    writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  }
  if (localInstaller) { mkdirSync('dist/installers', { recursive: true }); copyFileSync(localInstaller, `dist/${installerUrl}`); }
  await import('./check-build.mjs');
}
