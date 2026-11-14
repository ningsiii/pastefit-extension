import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentTextAdapter, wechatAdapter } from '../../src/adapters/text-adapter';
import { sanitizeMathml } from '../../src/core/math';
import { captureSelection } from '../../src/extension/capture-selection';
import { writeDocument } from '../../src/clipboard/rich';
import { openRichEditor } from '../../src/ui/rich-editor';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const md = (content: string) => normalizeMarkdown({ kind: 'markdown', content }).document;
const output = (source: string) => documentHtmlAdapter.render(html(source)).value;
const parse = (source: string) => new DOMParser().parseFromString(source, 'text/html');
const readBlob = (blob: Blob): Promise<string> => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
afterEach(() => { document.body.innerHTML = ''; window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });

describe('document formatting and content preservation', () => {
  it('drops source colors, backgrounds, font family and hidden UI, retaining semantic emphasis', () => {
    const value = output('<p style="background:white;color:white;font-family:Fantasy"><span style="font-weight:700;font-style:italic;text-decoration:underline">保留</span><span style="DISPLAY:none!important">隐藏一</span><span style="visibility: hidden">隐藏二</span><span role="button">复制</span><input value="secret"></p>');
    expect(value).toContain('<strong>'); expect(value).toContain('<em>'); expect(value).toContain('<u>');
    expect(value).not.toMatch(/background|color|font-family|隐藏|复制|secret/);
  });
  it('preserves scientific scripts, citations and underline across HTML round trips', () => {
    const source = '<p>H<sub>2</sub>O，x<sup>2</sup>，文献<sup><a href="https://example.org">[1]</a></sup>，<u>说明</u></p>';
    const value = output(source);
    expect(value).toContain('H<sub>2</sub>O'); expect(value).toContain('x<sup>2</sup>');
    expect(value).toContain('<sup><a href="https://example.org">[1]</a></sup>');
    expect(output(value)).toBe(value);
    expect(documentTextAdapter.render(html(source)).value).toContain('H₂O，x²');
    expect(documentTextAdapter.render(html(source)).value).toContain('^{[1]: https://example.org}');
  });
  it('keeps necessary Unicode spaces, joiners, emoji and code indentation', () => {
    const text = 'A\u00a0B\u202fC\u200bD\u2060E\u200cF\u200dG\u00adH 👨‍👩‍👧‍👦';
    const doc = html(`<p>${text}</p><pre><code>  x\t= 1\n    y = 2</code></pre>`);
    const rich = documentHtmlAdapter.render(doc).value;
    expect(rich).toContain(text); expect(rich).toContain('  x\t= 1\n    y = 2');
    expect(documentTextAdapter.render(doc).value).toContain(text);
  });
  it('normalizes HTML layout whitespace without converting explicit breaks into paragraphs', () => {
    expect(output('<p>A\n   B<br>C</p>')).toBe('<p>A B<br>C</p>');
    expect(output('<p style="white-space:pre-wrap">A  B\nC</p>')).toBe('<p>A  B\nC</p>');
  });
  it('keeps multiple list paragraphs and nested numbering separate', () => {
    const value = output('<ol start="3"><li><p>首段</p><p>次段</p><ul><li>子项</li></ul></li></ol>');
    expect(value).toContain('<ol start="3">'); expect(value).toContain('<p>首段</p><p>次段</p>');
    expect(parse(value).querySelectorAll('li')).toHaveLength(2);
  });
  it('keeps merged cells, per-cell headers, inner paragraphs and nested tables without duplicate rows', () => {
    const value = output('<table><tr><th rowspan="2">分组</th><td colspan="2"><p>第一段</p><p>第二段</p></td></tr><tr><td><ul><li>要点</li></ul></td><td><table><tr><td>内部</td></tr></table></td></tr></table>');
    const doc = parse(value); const table = doc.querySelector('table')!;
    expect([...table.querySelectorAll('tr')].filter(row => row.closest('table') === table)).toHaveLength(2);
    expect(table.querySelector('th')?.getAttribute('rowspan')).toBe('2');
    expect(table.querySelector('td')?.getAttribute('colspan')).toBe('2');
    expect(table.querySelector('td')?.querySelectorAll('p')).toHaveLength(2);
    expect(table.querySelectorAll('table')).toHaveLength(1);
    expect(table.querySelector('li')?.textContent).toBe('要点');
    expect(output(value)).toBe(value);
    const text = documentTextAdapter.render(html(value)).value;
    expect(text.match(/内部/g)).toHaveLength(1); expect(text).toContain('第一段 / 第二段');
  });
  it('retains header-only tables and caps malformed span attributes', () => {
    const doc = html('<table><tr><th colspan="999999">标题</th><th rowspan="-3">末列</th></tr></table>');
    expect(documentHtmlAdapter.render(doc).value).toContain('colspan="1000"');
    expect(documentHtmlAdapter.render(doc).value).not.toContain('rowspan');
    expect(wechatAdapter.render(doc).value).toContain('标题');
  });
});

describe('math input, output and safe fallback', () => {
  it.each(['$x^2$', '\\(x^2\\)', '$$x^2$$', '\\[x^2\\]'])('converts %s into one MathML expression with a source annotation', source => {
    const rendered = documentHtmlAdapter.render(md(source));
    expect(rendered.warnings).toEqual([]);
    const doc = parse(rendered.value);
    expect(doc.querySelectorAll('math')).toHaveLength(1);
    expect(doc.querySelector('msup')).not.toBeNull();
    expect(doc.querySelector('annotation')?.textContent).toBe('x^2');
    const roundTrip = documentHtmlAdapter.render(html(rendered.value));
    expect(roundTrip.value).toBe(rendered.value);
  });
  it('protects mixed prose, GFM table math, matrix row separators and nested Markdown constructs', () => {
    const source = '正文 **重点 $x_i$**。\n\n| 公式 | 值 |\n| --- | --- |\n| $a^2$ | 1 |\n\n$$\n\\begin{matrix}a&b\\\\c&d\\end{matrix}\n$$';
    const result = documentHtmlAdapter.render(md(source));
    expect(result.warnings).toEqual([]);
    const doc = parse(result.value);
    expect(doc.querySelectorAll('math')).toHaveLength(3);
    expect(doc.querySelector('strong math')).not.toBeNull();
    expect(doc.querySelector('mtable')).not.toBeNull();
    expect(result.value).toContain('正文');
  });
  it('does not treat currency, escaped dollars, inline code or fenced code as math', () => {
    const doc = md('价格 $5 and $10。\\$x$；`$x^2$`\n\n```latex\n$$x^2$$\n```');
    const value = documentHtmlAdapter.render(doc).value;
    expect(value).not.toContain('<math'); expect(value).toContain('$5 and $10');
    expect(value).toContain('<code>$x^2$</code>'); expect(value).toContain('$$x^2$$');
  });
  it('reads KaTeX once, preferring source over duplicate rendered/accessible layers', () => {
    const source = '<p>A <span class="katex"><span class="katex-mathml"><math><semantics><msup><mi>x</mi><mn>2</mn></msup><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x2</span></span> B</p>';
    const result = documentHtmlAdapter.render(html(source));
    expect(parse(result.value).querySelectorAll('math')).toHaveLength(1);
    expect(result.value).not.toContain('x2'); expect(result.value).toContain('A '); expect(result.value).toContain(' B');
  });
  it('reads MathJax source, native MathML, display formulas and current data-math-source', () => {
    const value = output('<div class="katex-display"><span class="katex"><math><annotation encoding="application/x-tex">x^2</annotation></math></span></div><p><mjx-container data-math="y^3"><svg></svg></mjx-container><span data-math-source="z_1">z1</span><math><mfrac><mn>1</mn><mn>2</mn></mfrac></math></p>');
    const doc = parse(value); expect(doc.querySelectorAll('math')).toHaveLength(4);
    expect(doc.querySelector('math')?.getAttribute('display')).toBe('block');
    expect(doc.querySelector('mfrac')).not.toBeNull();
  });
  it.each(['\\unknowncommand{x}', '\\includegraphics{https://evil.test/a.png}', '\\href{javascript:alert(1)}{x}', 'x'.repeat(10001)])('preserves an unconvertible or unsafe formula as escaped source with a warning', source => {
    const doc = { type: 'document' as const, children: [{ type: 'paragraph' as const, children: [{ type: 'math' as const, source, format: 'latex' as const, display: false }] }] };
    const result = documentHtmlAdapter.render(doc);
    expect(result.warnings).not.toHaveLength(0);
    expect(parse(result.value).querySelector('img,a,script')).toBeNull();
    expect(parse(result.value).querySelector('code')?.textContent).toBe(`\\(${source}\\)`);
    expect(documentHtmlAdapter.render(html(result.value)).warnings).not.toHaveLength(0);
  });
  it('rejects active/foreign MathML and strips presentation colors, URLs and event attributes', () => {
    expect(sanitizeMathml('<math><script>alert(1)</script></math>', false)).toBeNull();
    expect(sanitizeMathml('<math><annotation-xml><img src="x"/></annotation-xml></math>', false)).toBeNull();
    expect(sanitizeMathml('<math><mi xmlns="http://www.w3.org/1999/xhtml">x</mi></math>', false)).toBeNull();
    const safe = sanitizeMathml('<math style="background:white" onclick="alert(1)"><mi mathcolor="red" href="https://evil.test">x</mi></math>', false)!;
    expect(safe).not.toMatch(/style|onclick|mathcolor|href/); expect(safe).toContain('>x</mi>');
  });
});

describe('document entry and clipboard pipeline', () => {
  it('captures script-only and formula-only selections as structured HTML', () => {
    for (const content of ['H<sub>2</sub>O', '<span data-math-source="x^2">x2</span>']) {
      document.body.innerHTML = `<article>${content}</article>`;
      const range = document.createRange(); range.selectNodeContents(document.querySelector('article')!);
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
      expect(captureSelection()?.kind).toBe('html');
      const result = output(captureSelection()!.content);
      expect(result).toMatch(/<sub>|<math/);
    }
  });
  it('writes document-friendly plain text and rich MathML without changing smart chat fallback', async () => {
    vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
    const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
    const doc = md('# 标题\n\n**重点**与 $x^2$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    await writeDocument(doc, 'document', writer);
    const payload = writer.write.mock.calls[0][0][0].data;
    const plain = await readBlob(payload['text/plain']); const rich = await readBlob(payload['text/html']);
    expect(plain).not.toMatch(/[【】「」]/); expect(plain).toContain('A\tB\n1\t2');
    expect(plain).toContain('\\(x^2\\)'); expect(rich).toContain('<math');
    await writeDocument(doc, 'smart', writer);
    expect(await readBlob(writer.write.mock.calls[1][0][0].data['text/plain'])).toContain('【标题】');
  });
  it('keeps formulas and merged cells through editing and surfaces fallback warnings', async () => {
    const doc = html('<p>H<sub>2</sub>O <span data-math-source="x^2">x2</span></p><table><tr><td colspan="2">结果</td></tr></table>');
    const write = vi.fn().mockResolvedValue(['部分公式无法转换，已保留原式。']);
    const panel = openRichEditor(doc, write);
    [...panel.querySelectorAll('button')].find(button => button.textContent === '贴妥智能复制')!.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    const result = documentHtmlAdapter.render(write.mock.calls[0][0]).value;
    expect(result).toContain('<math'); expect(result).toContain('<sub>2</sub>'); expect(result).toContain('colspan="2"');
    expect(write.mock.calls[0][1]).toBe('smart');
    expect(panel.querySelector<HTMLElement>('[role="status"]')?.title).toContain('已保留原式');
  });
});

it('preserves inline HTML scripts in Markdown without interpreting scripts inside code', () => {
  const value = documentHtmlAdapter.render(md('H<sub>2</sub>O x<sup>**2**</sup> <u>说明</u> `<sup>literal</sup>`')).value;
  expect(value).toContain('H<sub>2</sub>O'); expect(value).toContain('<sup><strong>2</strong></sup>');
  expect(value).toContain('<u>说明</u>'); expect(value).toContain('<code>&lt;sup&gt;literal&lt;/sup&gt;</code>');
});
it('does not bring hidden math into a document', () => {
  expect(output('<p>可见<span style="display:none" data-math-source="secret">secret</span></p>')).toBe('<p>可见</p>');
});
it('captures a selected fragment of a rendered formula with its complete source', () => {
  document.body.innerHTML = '<article><span class="katex"><span class="katex-html"><span id="part">x</span><span>2</span></span><math><annotation encoding="application/x-tex">x^2</annotation></math></span></article>';
  const range = document.createRange(); range.selectNodeContents(document.querySelector('#part')!);
  window.getSelection()!.addRange(range);
  const input = captureSelection()!;
  expect(input.kind).toBe('html');
  const value = output(input.content);
  expect(parse(value).querySelectorAll('math')).toHaveLength(1);
  expect(parse(value).querySelector('annotation')?.textContent).toBe('x^2');
});
it('accepts source attributes with outer delimiters and a selection ending inside a formula', () => {
  document.body.innerHTML = '<article>正文 <span data-math-source="\\(x^2\\)"><b id="last">x</b><sup>2</sup></span> 后文</article>';
  const range = document.createRange(); range.setStart(document.querySelector('article')!.firstChild!, 0); range.setEnd(document.querySelector('#last')!.firstChild!, 1);
  window.getSelection()!.addRange(range);
  const value = output(captureSelection()!.content);
  expect(value).toContain('正文'); expect(value).not.toContain('后文');
  expect(parse(value).querySelector('annotation')?.textContent).toBe('x^2');
});
