import { afterEach, expect, it } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';
import { documentTextAdapter, plainTextAdapter, wechatAdapter } from '../../src/adapters/text-adapter';
import { pagesNativeTransfer } from '../../src/adapters/pages-native-xml';
import { inspectDocument } from '../../src/core/preflight';
import { createVisualReview } from '../../src/ui/visual-review';
import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const table = '<table><caption style="color:red;background:yellow"><strong>表1</strong> 实验 H<sub>2</sub>O <span data-math-source="x_i">x</span></caption><tr><th rowspan="2">组别</th><th colspan="2">指标</th></tr><tr><td>A</td><td>B</td></tr></table>';
const select = (node: Node) => { const range = document.createRange(); range.selectNodeContents(node); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); };
afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });

it('preserves the title as content above a merged table without adding a row, automatic fields or source colors', () => {
  const doc = html(table); expect(doc.children.map(n => n.type)).toEqual(['paragraph', 'table']);
  const rich = documentClipboardHtml(doc).value; const parsed = new DOMParser().parseFromString(rich, 'text/html');
  expect(parsed.body.firstElementChild?.tagName).toBe('P'); expect(parsed.body.firstElementChild?.querySelector('strong')?.textContent).toBe('表1');
  expect(parsed.body.firstElementChild?.querySelector('sub')?.textContent).toBe('2');
  expect(parsed.querySelectorAll('table > tbody > tr')).toHaveLength(2); expect(rich).toContain('rowspan="2"'); expect(rich).toContain('colspan="2"');
  expect(inspectDocument(doc, 'word').formulas.map(f => f.source)).toEqual(['x_i']);
  expect(rich).not.toMatch(/yellow|color:red|SEQ |fldSimple|caption-side/);
  for (const adapter of [wechatAdapter, plainTextAdapter, documentTextAdapter]) {
    const text = adapter.render(doc).value; expect(text.match(/表1/g)).toHaveLength(1); expect(text.indexOf('表1')).toBeLessThan(text.indexOf('组别'));
  }
  const xml = pagesNativeTransfer(doc).documentXml; expect(xml.indexOf('表1')).toBeLessThan(xml.indexOf('<w:tbl>')); expect(xml).toContain('<m:oMath>');
});

it.each(['style="caption-side:bottom"', 'style="caption-side:bottom !important"'])('preserves bottom captions as ordinary content below the table: %s', style => {
  const doc = html(`<table><caption ${style}>BOTTOM</caption><tr><td>CELL</td></tr></table>`);
  expect(doc.children.map(n => n.type)).toEqual(['table', 'paragraph']);
  for (const adapter of [documentHtmlAdapter, wechatAdapter, documentTextAdapter]) {
    const text = adapter.render(doc).value; expect(text.indexOf('BOTTOM')).toBeGreaterThan(text.indexOf('CELL')); expect(text.match(/BOTTOM/g)).toHaveLength(1);
  }
  const xml = pagesNativeTransfer(doc).documentXml; expect(xml.indexOf('BOTTOM')).toBeGreaterThan(xml.indexOf('</w:tbl>'));
});

it('inherits inline table caption position and honors a caption override', () => {
  expect(html('<table style="caption-side:bottom"><caption>BOTTOM</caption><tr><td>CELL</td></tr></table>').children.map(n => n.type)).toEqual(['table', 'paragraph']);
  expect(html('<table style="caption-side:bottom"><caption style="caption-side:top">TOP</caption><tr><td>CELL</td></tr></table>').children.map(n => n.type)).toEqual(['paragraph', 'table']);
});

it('captures stylesheet caption position for selections of both an article and the table itself', () => {
  document.body.innerHTML = '<style>caption.below{caption-side:bottom}</style><article><p>START</p><table><caption class="below">BOTTOM</caption><tr><td>CELL</td></tr></table><p>END</p></article>';
  for (const node of [document.querySelector('article')!, document.querySelector('table')!]) {
    select(node); const input = captureSelection()!; expect(input.kind).toBe('html');
    const text = documentTextAdapter.render(normalize(input).document).value;
    expect(text.indexOf('BOTTOM')).toBeGreaterThan(text.indexOf('CELL')); expect(text.match(/BOTTOM/g)).toHaveLength(1);
  }
});

it('keeps nested captions exactly once in their own cells through editor render/normalize and hidden review', () => {
  const doc = html('<table><caption>OUTER</caption><tr><td>FIRST<table><caption>INNER</caption><tr><td>LAST</td></tr></table></td></tr></table>');
  const roundtrip = html(documentHtmlAdapter.render(doc).value);
  const review = createVisualReview(roundtrip, 'auto'); const text = documentTextAdapter.render(review.getDocument()).value;
  for (const title of ['OUTER', 'INNER']) expect(text.match(new RegExp(title, 'g'))).toHaveLength(1);
  expect(text.indexOf('OUTER')).toBeLessThan(text.indexOf('FIRST')); expect(text.indexOf('INNER')).toBeLessThan(text.indexOf('LAST'));
  expect(inspectDocument(roundtrip, 'word').tables).toBe(2);
});

it('does not restore an unselected caption when copying only cells, and does not invent an empty table when copying only the caption', () => {
  document.body.innerHTML = '<table><caption>OUTSIDE</caption><tr><td>SELECTED</td></tr></table>';
  select(document.querySelector('td')!); const cells = normalize(captureSelection()!).document;
  expect(documentTextAdapter.render(cells).value).not.toContain('OUTSIDE');
  select(document.querySelector('caption')!); const caption = normalize(captureSelection()!).document;
  expect(documentTextAdapter.render(caption).value).toBe('OUTSIDE'); expect(inspectDocument(caption, 'word').tables).toBe(0);
});

it.each(['hidden', 'aria-hidden="true"', 'style="display:none"'])('excludes hidden captions and escapes visible markup without executing it: %s', attr => {
  const doc = html(`<table><caption ${attr}>HIDDEN</caption><tr><td>CELL</td></tr></table>`);
  expect(documentTextAdapter.render(doc).value).not.toContain('HIDDEN');
  const visible = documentHtmlAdapter.render(html('<table><caption>&lt;img src=x onerror=alert(1)&gt;<script>bad()</script><button>BUTTON</button></caption><tr><td>CELL</td></tr></table>')).value;
  const parsed = new DOMParser().parseFromString(visible, 'text/html'); expect(parsed.querySelector('img,script,button')).toBeNull();
  expect(parsed.body.textContent).toContain('<img src=x onerror=alert(1)>'); expect(parsed.body.textContent).not.toMatch(/bad\(\)|BUTTON/);
});

it('does not copy externally hidden caption text from a real page selection', () => {
  document.body.innerHTML = '<style>.gone{display:none}</style><article><table><caption class="gone">HIDDEN</caption><tr><td>CELL</td></tr></table></article>';
  select(document.querySelector('article')!); expect(documentTextAdapter.render(normalize(captureSelection()!).document).value).toBe('CELL');
});
