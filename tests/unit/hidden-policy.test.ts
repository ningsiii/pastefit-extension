import { afterEach, expect, it, vi } from 'vitest';
import { inspectDocument } from '../../src/core/preflight';
import { normalizeHtml } from '../../src/core/normalize-html';
import { documentTextAdapter } from '../../src/adapters/text-adapter';
import { reviewedCopy } from '../../src/clipboard/reviewed-copy';
import { createVisualReview } from '../../src/ui/visual-review';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const suspicious = (content: string) => inspectDocument(html(content), 'auto').findings.filter(f => f.suspicious);
const click = (name: string) => [...document.querySelectorAll('button')].find(b => b.textContent === name)!.click();
const writer = () => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const clipboard = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('navigator', { clipboard });
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({})) } } });
  return clipboard;
};
afterEach(() => { document.querySelector('[data-pastefit-copy-review]')?.dispatchEvent(new Event('pastefit:dispose')); document.body.replaceChildren(); vi.unstubAllGlobals(); });

it.each([
  '正\u200b文', 'hel\u200blo', 'dc.\u200bcontributor.\u200bauthor', 'Eng\ufefflish',
  'first\u200b\u200bword', 'English.\u200b', '<b>English.</b>\u200b', 'ab\u202ecd\u202c', 'text\u0007value',
  '<b>hel</b><i>\u200b</i>lo', '<b>正</b>\u200b文'
])('marks only a prose anomaly as suspicious: %s', content => {
  expect(suspicious(`<p>${content}</p>`).length).toBeGreaterThan(0);
});

it.each([
  '10 公斤', '10\u00a0公斤', '10\u202f公斤', '10\u00a0千克', '10\u00a0kg',
  'A\u00a0B', '1\u202f000', '正文  对齐\t内容', '正文 ，标点', 'co\u00adoperate',
  '10\u2009kg', 'a\u2060b', '👩🏽‍💻 👨‍👩‍👧', 'می\u200cروم',
  'ภาษา\u200bไทย', 'អក្សរ\u200bខ្មែរ', 'မြန်မာ\u200bစာ', 'これは日本\u200b語です',
  'עברית \u2066English\u2069', 'العربية \u200fEnglish',
  '<b>עברית </b><i>\u2066English\u2069</i>',
  'https://example.org/long\u200bword', '[待补充] **文本**', '\ufeff正文',
  '<code>hel\u200blo\u202e</code>', '<span data-math-source="a\u200bb">a b</span>'
])('preserves normal typography/language/source content without prompting: %s', content => {
  expect(suspicious(`<p>${content}</p>`)).toHaveLength(0);
});

it('recognizes 公斤 as a protected unit and keeps ordinary typography out of the automatic review', async () => {
  const clipboard = writer();
  const doc = html('<p>10\u00a0公斤；A\u00a0B；对齐  内容；می\u200cروم 👩🏽‍💻</p>');
  expect(inspectDocument(doc, 'auto').findings.find(f => f.protected)?.label).toContain('U+00A0');
  await reviewedCopy(doc, 'office', clipboard);
  expect(document.querySelector('dialog')).toBeNull(); expect(clipboard.write).toHaveBeenCalledOnce();
});

it('opens one review for a mixed English anomaly, leaves other findings intact, and applies the users choices', async () => {
  const clipboard = writer();
  const doc = html('<p>hel\u200blo；10\u00a0公斤；می\u200cروم；[待补充]</p>');
  const pending = reviewedCopy(doc, 'office', clipboard);
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull());
  expect(clipboard.write).not.toHaveBeenCalled();
  expect(document.querySelectorAll('[data-finding-id]')).toHaveLength(3);
  expect(document.querySelectorAll('[data-decision="change"]')).toHaveLength(1);
  expect([...document.querySelectorAll('button')].filter(b => b.textContent === '复制')).toHaveLength(1);
  const mark = document.querySelector<HTMLButtonElement>('[data-decision="change"]')!;
  mark.click(); expect(document.querySelectorAll('[data-decision="change"]')).toHaveLength(0);
  document.querySelector<HTMLButtonElement>('[data-finding-id]')!.click();
  click('复制'); await pending; expect(clipboard.write).toHaveBeenCalledOnce();
  const item = clipboard.write.mock.calls[0][0][0];
  const text = await new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(item.data['text/plain']); });
  expect(text).toBe('hello；10\u00a0公斤；می\u200cروم；[待补充]'); expect(text).not.toContain('〔');
});

it('does not let 500 earlier harmless spaces hide a later anomaly', () => {
  const report = inspectDocument(html(`<p>${'A\u00a0'.repeat(600)}hel\u200blo</p>`), 'auto');
  expect(report.findings).toHaveLength(500); expect(report.omitted).toBe(101);
  expect(report.findings.filter(f => f.suspicious)).toHaveLength(1);
});

it('shows every retained hidden finding as a compact reversible marker without changing document structure', () => {
  const doc = html('<table><tr><td rowspan="2">hel\u200blo</td><td>10\u00a0公斤</td></tr><tr><td>می\u200cروم</td></tr></table>');
  const review = createVisualReview(doc, 'word'); document.body.append(review.element);
  expect(review.element.querySelector('td[rowspan="2"]')).not.toBeNull();
  const marks = () => [...review.element.querySelectorAll<HTMLButtonElement>('[data-finding-id]')];
  for (let i = 0; i < marks().length; i++) {
    const before = documentTextAdapter.render(review.getDocument()).value;
    marks()[i].click(); expect(documentTextAdapter.render(review.getDocument()).value).not.toBe(before);
    marks()[i].click(); expect(documentTextAdapter.render(review.getDocument()).value).toBe(before);
  }
  expect(marks().every(mark => mark.textContent!.length < 8 && mark.style.whiteSpace === 'nowrap')).toBe(true);
});
