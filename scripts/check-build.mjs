import { existsSync, readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';
for (const name of ['content', 'selection', 'service-worker', 'popup', 'options', 'pages-native-setup']) {
  const source = readFileSync(`dist/assets/${name}.js`, 'utf8');
  assert(![...source].some(char => { const point = char.codePointAt(0); return (point & 0xffff) >= 0xfffe || (point >= 0xfdd0 && point <= 0xfdef); }), 'Extension script contains Unicode noncharacters rejected by Chrome scripting');
  new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(`dist/assets/${name}.js`));
  new Script(source, { filename: `${name}.js` });
  assert(!source.includes('import('), 'Injected scripts must not dynamically import modules');
}
const manifest = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
assert.equal(manifest.action.default_popup, 'popup.html');
assert.equal(manifest.version, '0.1.2');
assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, manifest.version);
assert.equal(JSON.parse(readFileSync('package-lock.json', 'utf8')).version, manifest.version);
assert.equal(manifest.options_ui.page, 'options.html');
assert(existsSync('dist/options.html') && existsSync('dist/options.css'));
assert(existsSync('dist/popup.html') && existsSync('dist/popup.css'));
assert(existsSync('dist/pages-native.html') && existsSync('dist/pages-native.css'));
for (const name of ['install', 'security', 'accessibility', 'automation', 'ready']) {
  const png = readFileSync(`dist/setup/${name}.png`);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', 'Setup screenshot must exist as a local PNG');
}
assert(existsSync('dist/mac-setup-help.html'), 'Complete screenshot instructions must ship with the extension');
assert(process.env.PASTEFIT_MAC_TEST_INSTALLER || !existsSync('dist/installers'), 'Ordinary extension builds must not bundle native executables');
const popupCss = readFileSync('dist/popup.css', 'utf8');
assert(popupCss.includes('width:260px'), 'Settings popup must retain its compact width');
assert(popupCss.includes('.status:empty{display:none}'), 'Empty feedback must not reserve popup space');
assert.equal(manifest.background.service_worker, 'assets/service-worker.js');

const iconSizes = [16, 32, 48, 128];
for (const size of iconSizes) {
  const relativePath = manifest.icons?.[String(size)];
  assert.equal(relativePath, `icons/icon${size}.png`, `Manifest icon${size} path must be stable`);
  const outputPath = `dist/${relativePath}`;
  assert(existsSync(outputPath), `${outputPath} must exist after build`);
  const png = readFileSync(outputPath);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG', `${outputPath} must be a PNG`);
  assert.equal(png.readUInt32BE(16), size, `${outputPath} width must be ${size}`);
  assert.equal(png.readUInt32BE(20), size, `${outputPath} height must be ${size}`);
}
assert.equal(manifest.action?.default_icon?.['16'], 'icons/icon16.png');
assert.equal(manifest.action?.default_icon?.['32'], 'icons/icon32.png');

console.log('Extension scripts, manifest entries, and 16/32/48/128 px icon assets verified.');
