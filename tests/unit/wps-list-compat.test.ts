import { expect, it } from 'vitest';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentTextAdapter } from '../../src/adapters/text-adapter';
import { pagesNativeTransfer } from '../../src/adapters/pages-native-xml';
import { normalizeHtml } from '../../src/core/normalize-html';
const doc = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const parse = (value: string) => new DOMParser().parseFromString(value, 'text/html');

it('adds an Office list start definition for WPS Web without replacing native numbering with text', () => {
  const source = doc('<ol start="3"><li>第三项</li><li>第四项</li></ol>');
  const copied = parse(documentClipboardHtml(source).value);
  expect(copied.querySelector('style')!.textContent).toContain('@list l1:level1{mso-level-number-format:decimal;mso-level-start-at:3;mso-level-text:"%1.";}');
  expect(copied.querySelector('ol')!.getAttribute('start')).toBe('3');
  expect([...copied.querySelectorAll('li')].map(n => n.textContent)).toEqual(['第三项', '第四项']);
  expect([...copied.querySelectorAll('li')].every(n => n.getAttribute('style') === 'mso-list:l1 level1 lfo1')).toBe(true);
  expect(copied.querySelector('meta[name="ProgId"]')!.getAttribute('content')).toBe('Word.Document');
  expect(documentHtmlAdapter.render(source).value).toBe('<ol start="3"><li>第三项</li><li>第四项</li></ol>');
  expect(normalizeHtml({ kind: 'html', content: documentClipboardHtml(source).value }).document).toEqual(source);
});

it('keeps separate restarts independent, including nested and table-cell lists', () => {
  const copied = parse(documentClipboardHtml(doc('<ol start="3"><li>A<ol start="7"><li>B</li></ol></li></ol><ol start="8"><li>C</li></ol><table><tr><td><ol start="5"><li>D</li></ol></td></tr></table>')).value);
  const rules = copied.querySelector('style')!.textContent!;
  expect(rules).toContain('@list l1:level1'); expect(rules).toContain('@list l2:level2');
  expect(rules).toContain('@list l3:level1'); expect(rules).toContain('@list l4:level1');
  expect((rules.match(/mso-level-start-at:/g) ?? []).length).toBe(4);
  expect([...copied.querySelectorAll('ol')].every(n => !n.hasAttribute('style'))).toBe(true);
  expect(new Set([...copied.querySelectorAll('li')].map(n => n.getAttribute('style'))).size).toBe(4);
  expect(copied.querySelector('td ol')!.getAttribute('start')).toBe('5');
});

it('retains headings, body text, native MathML and merged cells alongside list compatibility', () => {
  const source = doc('<h2>标题</h2><p>正文<span data-math-source="\\frac{a+b}{2}">f</span></p><ol start="3"><li>第三项</li></ol><table><tr><td colspan="2">表</td></tr></table>');
  const copied = parse(documentClipboardHtml(source).value);
  expect(copied.querySelector('h2')!.textContent).toBe('标题');
  expect(copied.querySelector('p')!.className).toBe('MsoNormal');
  expect(copied.querySelector('math mfrac')).not.toBeNull();
  expect(copied.querySelector('td')!.getAttribute('colspan')).toBe('2');
  expect(documentTextAdapter.render(source).value).toContain('3. 第三项');
  const native = pagesNativeTransfer(source);
  expect(native.equations).toBe(1); expect(native.documentXml).toContain('3. ');
});

it('does not change default lists or import source style/URL payloads', () => {
  const ordinary = doc('<ul><li>A</li></ul><ol><li>B</li></ol>');
  expect(documentClipboardHtml(ordinary)).toEqual(documentHtmlAdapter.render(ordinary));
  const source = doc('<ol start="3" style="color:red;background:url(https://evil.example)"><li onclick="evil()">&lt;script&gt;</li></ol>');
  const value = documentClipboardHtml(source).value;
  expect(value).not.toMatch(/evil|color:red|background:|onclick/); expect(value).toContain('&lt;script&gt;');
  expect(parse(value).querySelectorAll('script')).toHaveLength(0);
});

it.each([0, -2, 17])('preserves a safe integer start of %s', start => {
  const copied = parse(documentClipboardHtml(doc(`<ol start="${start}"><li>A</li></ol>`)).value);
  expect(copied.querySelector('style')!.textContent).toContain(`mso-level-start-at:${start};`);
  expect(copied.querySelector('ol')!.getAttribute('start')).toBe(String(start));
});
