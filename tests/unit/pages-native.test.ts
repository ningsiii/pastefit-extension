import { afterEach, describe, expect, it, vi } from 'vitest';
import { pagesNativeXml } from '../../src/adapters/pages-native-xml';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { nativePagesRequest } from '../../src/extension/pages-native-service';
import { copyPagesNative } from '../../src/clipboard/pages-native';
const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const xml = (content: string) => new DOMParser().parseFromString(content, 'application/xml');
const local = (root: Document | Element, tag: string) => [...root.getElementsByTagNameNS('*', tag)];
afterEach(() => { document.querySelector('[data-pastefit-copy-review]')?.dispatchEvent(new Event('pastefit:dispose')); document.body.replaceChildren(); vi.unstubAllGlobals(); });

describe('internal native Pages transfer', () => {
  it('preserves source text, inline emphasis, scripts and fractions as native OMML, with explicit regular runs', () => {
    const source = html('<h2>START</h2><p>正文 <b>粗体</b> H<sub>2</sub>O x<sup>2</sup> <span data-math-source="\\frac{a+b}{2}">f</span> &lt;script&gt; END</p>'); const before = JSON.stringify(source);
    const result = pagesNativeXml(source); const tree = xml(result); expect(tree.querySelector('parsererror')).toBeNull();
    expect(tree.documentElement.namespaceURI).toContain('wordprocessingml'); expect(local(tree, 'oMath')).toHaveLength(1); expect(local(tree, 'f')).toHaveLength(1);
    expect(local(tree, 'vertAlign').map(e => e.getAttribute('w:val'))).toEqual(['subscript', 'superscript']);
    expect(result).toContain('<w:b w:val="0"/>'); expect(result).toContain('&lt;script&gt;'); expect(result).not.toContain('image'); expect(JSON.stringify(source)).toBe(before);
    expect(local(tree, 't').map(e => e.textContent).join('')).toContain('正文 粗体 H2O x2 a+b2 <script> END');
  });
  it('retains matrix fences and the 2x2 editable matrix rather than literal small parentheses', () => {
    const source = normalizeMarkdown({ kind: 'markdown', content: '$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$' }).document;
    const tree = xml(pagesNativeXml(source)); expect(local(tree, 'd')).toHaveLength(1); expect(local(tree, 'm')).toHaveLength(1); expect(local(tree, 'mr')).toHaveLength(2);
    expect(local(tree, 'begChr')[0].getAttribute('m:val')).toBe('('); expect(local(tree, 'endChr')[0].getAttribute('m:val')).toBe(')');
  });
  it('retains horizontal and vertical cell merges, all rows, nested content and table equations', () => {
    const source = html('<p><span data-math-source="x^2">x</span></p><table><tr><th rowspan="2">A</th><th colspan="2">Results</th></tr><tr><td>P<br>Q</td><td><span data-math-source="x_i">x</span></td></tr><tr><td>B</td><td>123</td><td>END</td></tr></table>');
    const tree = xml(pagesNativeXml(source)); expect(local(tree, 'gridCol')).toHaveLength(3); expect(local(tree, 'tr')).toHaveLength(3);
    expect(local(tree, 'gridSpan')[0].getAttribute('w:val')).toBe('2'); expect(local(tree, 'vMerge').map(e => e.getAttribute('w:val'))).toEqual(['restart', 'continue']); expect(local(tree, 'oMath')).toHaveLength(2);
    expect(local(tree, 't').map(e => e.textContent).join('')).toContain('ResultsPQxiB123END');
  });
  it('preserves readable list starts, line breaks and code characters', () => {
    const tree = xml(pagesNativeXml(html('<p><span data-math-source="x">x</span></p><ol start="3"><li>A</li><li>B</li></ol><pre>  a &lt; b\n  c</pre>')));
    expect(local(tree, 't').map(e => e.textContent).join('')).toContain('3. A4. B  a < b  c');
  });
  it.each(['$\\sqrt{x}$', '$x_1^2$', '$\\sqrt[3]{x}$', '$\\sum_{i=1}^{n}i$'])('converts supported structured math %s without images', content => {
    const tree = xml(pagesNativeXml(normalizeMarkdown({ kind: 'markdown', content }).document)); expect(tree.querySelector('parsererror')).toBeNull(); expect(local(tree, 'oMath')).toHaveLength(1);
  });
  it('retains upright text/functions, Unicode math alphabets and explicit inherited variants', () => {
    const source = normalizeMarkdown({ kind: 'markdown', content: '$\\sin x+\\mathbf{x}+\\mathbb{R}+\\text{where}$' }).document;
    const result = pagesNativeXml(source); expect(result).toContain('<m:sty m:val="p"/>'); expect(result).toContain('𝐱'); expect(result).toContain('ℝ');
    const explicit = (math: string) => pagesNativeXml({ type: 'document', children: [{ type: 'paragraph', children: [{ type: 'math', source: math, format: 'mathml', display: false }] }] });
    expect(explicit('<math><mstyle mathvariant="bold"><mi>x</mi></mstyle></math>')).toContain('<m:sty m:val="b"/>');
    expect(() => explicit('<math><mi mathvariant="double-struck">R</mi></math>')).toThrow('字体暂不支持');
  });
  it('refuses unsupported math, unsafe MathML, formula-free and excessive content before native invocation', () => {
    expect(() => pagesNativeXml(html('<p>plain</p>'))).toThrow('没有');
    expect(() => pagesNativeXml(html('<span data-math-source="\\notacommand{x}">x</span>'))).toThrow('无法转换');
    expect(() => pagesNativeXml(html('<span data-math-source="&lt;math&gt;&lt;script&gt;bad&lt;/script&gt;&lt;/math&gt;" data-math-format="mathml">x</span>'))).toThrow();
    expect(() => pagesNativeXml({ type: 'document', children: [{ type: 'paragraph', children: [{ type: 'math', format: 'mathml', display: false, source: '<math><mphantom><mi>x</mi></mphantom></math>' }] }] })).toThrow('暂不支持');
    expect(() => pagesNativeXml(html('<p>' + '<span data-math-source="x">x</span>'.repeat(101) + '</p>'))).toThrow('100');
  });
});

it('requires optional native permission, rejects malformed payloads and never falls back to image success', async () => {
  const sendNativeMessage = vi.fn().mockResolvedValue({ ok: true }); const contains = vi.fn().mockResolvedValue(false);
  vi.stubGlobal('chrome', { permissions: { contains }, runtime: { sendNativeMessage } });
  expect(await nativePagesRequest('<!DOCTYPE evil>')).toEqual({ ok: false, code: 'invalid-document' }); expect(contains).not.toHaveBeenCalled();
  const request = '<w:document xmlns:w="safe"><w:body/></w:document>';
  expect(await nativePagesRequest(request)).toEqual({ ok: false, code: 'connection-permission' }); expect(sendNativeMessage).not.toHaveBeenCalled();
  contains.mockResolvedValue(true); sendNativeMessage.mockResolvedValue({ ok: false, code: 'native-equations-missing' });
  expect(await nativePagesRequest(request)).toEqual({ ok: false, code: 'native-equations-missing' });
  sendNativeMessage.mockRejectedValue(new Error('missing')); expect(await nativePagesRequest(request)).toEqual({ ok: false, code: 'host-unavailable' });
});
it('allows only one native request at a time and releases the gate after completion', async () => {
  let finish!: (result: { ok: boolean }) => void;
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn().mockResolvedValue(true) }, runtime: { sendNativeMessage: vi.fn(() => new Promise(resolve => { finish = resolve; })) } });
  const first = nativePagesRequest('<w:document x="y"/>'); await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(await nativePagesRequest('<w:document x="y"/>')).toEqual({ ok: false, code: 'busy' }); finish({ ok: true }); expect(await first).toEqual({ ok: true });
});
it('does not invoke native copy after review cancellation and surfaces actionable permission failures', async () => {
  const sendMessage = vi.fn().mockResolvedValue({ ok: false, code: 'accessibility-permission' }); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const pending = copyPagesNative(html('<p>A\u00a0B<span data-math-source="x">x</span></p>')); const reject = expect(pending).rejects.toThrow('取消');
  document.querySelector('[data-pastefit-copy-review]')!.dispatchEvent(new Event('pastefit:dispose')); await reject; expect(sendMessage).not.toHaveBeenCalled();
  await expect(copyPagesNative(html('<p><span data-math-source="x">x</span></p>'))).rejects.toThrow('辅助功能');
  expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'pastefit:copy-pages-native', documentXml: expect.stringContaining('<m:oMath>') }));
});
it('rejects unpaired, wrong-type, NUL, oversized or over-frame standard representations before calling the host', async () => {
  const sendNativeMessage = vi.fn().mockResolvedValue({ ok: true }); const contains = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('chrome', { runtime: { sendNativeMessage }, permissions: { contains } });
  const request = '<w:document x="y"/>';
  for (const pair of [[{}, 'plain'], ['<p>x</p>', undefined], ['', 'plain'], ['<p>x</p>', ' '], ['<p>\0</p>', 'plain'], ['x'.repeat(2_000_000), 'plain']]) {
    expect(await nativePagesRequest(request, ...pair)).toEqual({ ok: false, code: 'invalid-representations' });
  }
  expect(sendNativeMessage).not.toHaveBeenCalled(); expect(contains).not.toHaveBeenCalled();
  expect(await nativePagesRequest('<w:document ' + '中'.repeat(1_500_000), '<p>x</p>', 'x')).toEqual({ ok: false, code: 'invalid-document' });
  expect(sendNativeMessage).not.toHaveBeenCalled();
  expect(await nativePagesRequest(request, '<p><math><mi>x</mi></math></p>', '\\(x\\)')).toEqual({ ok: true });
  expect(sendNativeMessage).toHaveBeenCalledWith('com.pastefit.pages_bridge', { type: 'copy-pages-equations', documentXml: request, html: '<p><math><mi>x</mi></math></p>', plain: '\\(x\\)' });
});

it('assigns six native paragraph styles and resets following paragraphs without direct heading overrides', () => {
  const content = Array.from({ length: 6 }, (_, i) => `${'#'.repeat(i + 1)} L${i + 1}\n\nP${i + 1}`).join('\n\n') + '\n\n$x^2$';
  const tree = xml(pagesNativeXml(normalizeMarkdown({ kind: 'markdown', content }).document));
  const paragraphs = local(tree, 'p');
  for (let i = 0; i < 6; i++) {
    expect(local(paragraphs[i * 2], 'pStyle')[0].getAttribute('w:val')).toBe(`Heading${i + 1}`);
    expect(local(paragraphs[i * 2], 'outlineLvl')[0].getAttribute('w:val')).toBe(String(i));
    expect(local(paragraphs[i * 2], 'b')).toHaveLength(0);
    expect(local(paragraphs[i * 2 + 1], 'pStyle')[0].getAttribute('w:val')).toBe('Normal');
    expect(local(paragraphs[i * 2 + 1], 'outlineLvl')).toHaveLength(0);
  }
  expect(local(tree, 'oMath')).toHaveLength(1);
});

it('keeps heading-only content on standard HTML without requiring a native connection', async () => {
  const sendMessage = vi.fn(); const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  vi.stubGlobal('navigator', { clipboard: { write } });
  await copyPagesNative(normalizeMarkdown({ kind: 'markdown', content: '# H1\n\nBody\n\n###### H6' }).document, true);
  expect(sendMessage).not.toHaveBeenCalled(); expect(write).toHaveBeenCalledOnce();
});
