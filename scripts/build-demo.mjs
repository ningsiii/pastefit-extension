import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const source = resolve(root, 'tests/manual/demo');
const target = resolve(root, process.argv[2] ?? 'release/demo/贴妥演示.html');
assert(target.startsWith(resolve(root, 'release') + '/'), 'Output must stay inside release/');
assert(!existsSync(target), 'Output already exists; choose a new file name.');
let html = readFileSync(resolve(source, 'index.html'), 'utf8');
const css = readFileSync(resolve(source, 'demo.css'), 'utf8');
const js = readFileSync(resolve(source, 'demo.js'), 'utf8');
html = html.replace(/<link rel="stylesheet" href="demo\.css[^\"]*">/, () => `<style>\n${css}\n</style>`);
html = html.replace(/<script src="demo\.js[^\"]*"><\/script>/, () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
const assets = {
  '../../../public/icons/icon48.png': ['public/icons/icon48.png', 'image/png'],
  '../../../public/icons/icon128.png': ['public/icons/icon128.png', 'image/png'],
  'chromewebstore.svg': ['tests/manual/demo/chromewebstore.svg', 'image/svg+xml'],
  'github.svg': ['tests/manual/demo/github.svg', 'image/svg+xml']
};
for (const [url, [path, mime]] of Object.entries(assets)) {
  const data = readFileSync(resolve(root, path)).toString('base64');
  html = html.replaceAll(`src="${url}"`, `src="data:${mime};base64,${data}"`);
}
assert(!/<(?:script|link)\b[^>]*(?:src|href)=/i.test(html), 'External script or stylesheet remains.');
assert([...html.matchAll(/<img\b[^>]*src="([^"]+)"/gi)].every(match => match[1].startsWith('data:')), 'Image dependency remains.');
assert(!/url\(\s*['"]?(?:https?:|\.\.?\/)/i.test(css), 'External CSS resource remains.');
mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, html);
console.log(`Self-contained HTML written: ${target} (${Buffer.byteLength(html)} bytes)`);
