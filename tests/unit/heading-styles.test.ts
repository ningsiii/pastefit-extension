import { afterEach, expect, it, vi } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';
import { documentTextAdapter } from '../../src/adapters/text-adapter';
import { writeDocument } from '../../src/clipboard/rich';
import { copyPagesNative } from '../../src/clipboard/pages-native';

const parse = (value: string) => new DOMParser().parseFromString(value, 'text/html');
const read = (blob: Blob): Promise<string> => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
afterEach(() => { vi.unstubAllGlobals(); });

it('declares the Word importer and preserves six levels without creating localized custom style names', () => {
  const document = normalizeMarkdown({ kind: 'markdown', content: Array.from({ length: 6 }, (_, i) => `${'#'.repeat(i + 1)} L${i + 1}\n\nordinary ${i + 1}`).join('\n\n') }).document;
  const result = documentClipboardHtml(document); const html = parse(result.value);
  for (let level = 1; level <= 6; level++) {
    expect(html.querySelector(`h${level}`)?.textContent).toBe(`L${level}`);
    expect(html.querySelector(`h${level}`)?.hasAttribute('style')).toBe(false);
    expect(html.querySelector('style')!.textContent).toContain(`h${level}{mso-style-priority:9`);
    expect(html.querySelector('style')!.textContent).toContain(`mso-outline-level:${level};`);
  }
  expect(html.querySelectorAll('p')).toHaveLength(6);
  expect([...html.querySelectorAll('p')].every(p => p.className === 'MsoNormal')).toBe(true);
  expect(html.querySelector('meta[name="ProgId"]')!.getAttribute('content')).toBe('Word.Document');
  expect(result.value).not.toContain('mso-style-name');
  expect([...html.querySelectorAll('p')].every(p => !p.hasAttribute('style'))).toBe(true);
  expect(result.value).not.toMatch(/font-size|font-family|text-align|text-indent|color:|background:/);
  expect(normalizeHtml({ kind: 'html', content: result.value }).document).toEqual(document);
});

it('keeps the editor fragment contract and body-only documents unchanged', () => {
  const document = normalizeHtml({ kind: 'html', content: '<h2>Title</h2><p>Body</p>' }).document;
  expect(documentHtmlAdapter.render(document).value).toBe('<h2>Title</h2><p>Body</p>');
  const ordinary = normalizeHtml({ kind: 'html', content: '<p>H<sub>2</sub>O</p><pre><code>&lt;h1&gt;literal&lt;/h1&gt;</code></pre>' }).document;
  expect(documentClipboardHtml(ordinary)).toEqual(documentHtmlAdapter.render(ordinary));
});

it('preserves nested headings, scripts, formulas and merged tables without importing source styles', () => {
  const document = normalizeHtml({ kind: 'html', content: '<blockquote><h3 style="color:red;text-align:center">H3</h3></blockquote><table><tr><th colspan="2"><h4>H4</h4></th></tr><tr><td>H<sub>2</sub>O</td><td><span data-math-source="x^2">x²</span></td></tr></table>' }).document;
  const plain = documentTextAdapter.render(document).value;
  const fragment = parse(documentHtmlAdapter.render(document).value).body;
  const copied = parse(documentClipboardHtml(document).value).body;
  expect(copied.querySelector('blockquote h3')).not.toBeNull(); expect(copied.querySelector('th h4')).not.toBeNull();
  expect(copied.querySelector('th')!.getAttribute('colspan')).toBe('2');
  expect(copied.querySelectorAll('math')).toHaveLength(1); expect(copied.querySelector('sub')!.textContent).toBe('2');
  copied.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => h.removeAttribute('style'));
  copied.querySelectorAll('p.MsoNormal').forEach(p => p.removeAttribute('class'));
  expect(copied.innerHTML.replace(/<!--(?:Start|End)Fragment-->/g, '')).toBe(fragment.innerHTML);
  expect(documentTextAdapter.render(document).value).toBe(plain);
});

it('only inserts fixed metadata and keeps malicious heading text escaped', () => {
  const document = normalizeHtml({ kind: 'html', content: '<style>h1{background:url(https://evil.example)}</style><h1 onclick="evil()">&lt;/style&gt;&lt;script&gt;evil&lt;/script&gt;</h1>' }).document;
  const html = parse(documentClipboardHtml(document).value);
  expect(html.querySelectorAll('style')).toHaveLength(1); expect(html.querySelectorAll('script,[onclick]')).toHaveLength(0);
  expect(html.querySelector('h1')!.textContent).toBe('</style><script>evil</script>');
  expect(html.querySelector('style')!.textContent).not.toContain('evil');
});

it('writes heading definitions to the real rich-copy HTML payload while plain text stays unchanged', async () => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  const document = normalizeMarkdown({ kind: 'markdown', content: '# Title\n\nBody' }).document;
  await writeDocument(document, 'document', writer);
  const data = writer.write.mock.calls[0][0][0].data;
  expect(parse(await read(data['text/html'])).querySelector('head style')).not.toBeNull();
  expect(await read(data['text/plain'])).toBe(documentTextAdapter.render(document).value);
  await writeDocument(document, 'chat', writer); expect(writer.writeText).toHaveBeenCalled(); expect(writer.write).toHaveBeenCalledOnce();
});

it('sends the same heading metadata in the native helper standard HTML without changing the XML contract', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const document = normalizeMarkdown({ kind: 'markdown', content: '# Title\n\n$\\frac{a+b}{2}$' }).document;
  await copyPagesNative(document, true);
  const request = sendMessage.mock.calls[0][0];
  expect(parse(request.html).querySelector('meta[name="ProgId"]')!.getAttribute('content')).toBe('Word.Document');
  expect(parse(request.html).querySelector('h1')!.textContent).toBe('Title');
  expect(request.documentXml).toContain('<m:f>'); expect(request.documentXml).not.toContain('mso-style-name');
});
