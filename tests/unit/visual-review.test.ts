import { afterEach, expect, it, vi } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentTextAdapter } from '../../src/adapters/text-adapter';
import { inspectDocument } from '../../src/core/preflight';
import { createVisualReview } from '../../src/ui/visual-review';
import { reviewedCopy } from '../../src/clipboard/reviewed-copy';
import { openRichEditor } from '../../src/ui/rich-editor';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const click = (label: string, root: ParentNode = document) => { const b = [...root.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label); expect(b).toBeDefined(); b!.click(); };
const clipboard = () => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) }; vi.stubGlobal('navigator', { clipboard: writer });
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({ 'pastefit.copyTarget': 'office' })), set: vi.fn(async () => undefined) } } }); return writer;
};
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['pages', 'word', 'wps'] as const)('preselects only suspicious controls and permits every marker to toggle for %s', target => {
  const source = html('<p>甲\u00a0乙，E\u200bF。重量10\u00a0公斤。外文می\u200cروم</p>'); const before = JSON.stringify(source);
  const review = createVisualReview(source, target); document.body.append(review.element);
  const text = () => documentTextAdapter.render(review.getDocument()).value;
  const marks = () => [...review.element.querySelectorAll<HTMLButtonElement>('[data-finding-id]')];
  expect(marks()).toHaveLength(4); expect(review.element.textContent).toContain('1 处将清理，3 处保留');
  expect(text()).toBe('甲\u00a0乙，EF。重量10\u00a0公斤。外文می\u200cروم');
  marks()[1].click(); expect(text()).toContain('E\u200bF'); marks()[1].click(); expect(text()).toContain('EF');
  // A default recommendation never locks a marker: units and joiners can be restored.
  for (const index of [0, 2, 3]) {
    const original = text(); marks()[index].click(); expect(text()).not.toBe(original);
    marks()[index].click(); expect(text()).toBe(original);
  }
  expect(marks().every(mark => !mark.hasAttribute('aria-disabled'))).toBe(true);
  expect(marks()[0].title).toContain('U+00A0'); expect(marks()[0].textContent).toBe('〔空格〕');
  expect(marks()[1].textContent).toBe('〔隐〕');
  click('查看结果'); expect(marks()).toHaveLength(0); expect(review.element.textContent).toContain('EF');
  click('返回标记'); expect(marks()).toHaveLength(4);
  click('全部保留'); expect(JSON.stringify(review.getDocument())).toBe(before);
  click('全部清理'); expect(text()).toBe('甲 乙，EF。重量10 公斤。外文میروم');
  click('全部保留'); expect(JSON.stringify(review.getDocument())).toBe(before); expect(JSON.stringify(source)).toBe(before);
  expect(review.element.textContent).not.toContain('撤销');
});
it('retains merged cells, formatting, equations, language and code, without copying annotations or executing text as HTML', () => {
  const source = html('<p><strong>前 </strong> 后 &lt;img src=x onerror=alert(1)&gt;</p><table><tr><td rowspan="2">A\u00a0B</td><td>H<sub>2</sub>O</td></tr><tr><td><span data-math-source="x^2">x2</span></td></tr></table><pre>C\u00a0D</pre><p>👩🏽‍💻 می\u200cروم</p>');
  const review = createVisualReview(source, 'pages'); document.body.append(review.element);
  expect(review.element.querySelector('strong')!.textContent).toBe('前 ');
  expect(review.element.querySelector('td[rowspan="2"] [data-finding-id]')).not.toBeNull();
  expect(review.element.querySelector('p > button[aria-label^="格式交界"]')).not.toBeNull();
  expect(review.element.querySelector('img[onerror]')).toBeNull();
  const copied = documentHtmlAdapter.render(review.getDocument()).value;
  expect(copied).toContain('rowspan="2"'); expect(copied).toContain('<annotation encoding="application/x-tex">x^2</annotation>'); expect(inspectDocument(review.getDocument(), 'pages').formulas[0].source).toBe('x^2'); expect(copied).toContain('<sub>2</sub>'); expect(copied).toContain('C\u00a0D'); expect(copied).toContain('👩🏽‍💻'); expect(copied).toContain('می\u200cروم');
  expect(copied).not.toMatch(/data-finding|data-decision|PF[a-f0-9]{32}|button/);
});
it('reveals hidden characters without treating visible placeholders and references as hidden content', async () => {
  const source = html('<p>开始 [待补充]，引用 citeturn1search0。A\u00a0B，末尾。</p>');
  const review = createVisualReview(source, 'wps'); document.body.append(review.element);
  expect(review.element.querySelectorAll('[data-finding-id]')).toHaveLength(1);
  expect(review.element.querySelector('[data-finding-id]')!.textContent).not.toContain('待补充');
  expect(documentTextAdapter.render(review.getDocument()).value).toBe('开始 [待补充]，引用 citeturn1search0。A\u00a0B，末尾。');
  const writer = clipboard();
  await reviewedCopy(html('<p>[待补充] citeturn1search0</p>'), 'document', writer);
  expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull(); expect(writer.write).toHaveBeenCalledOnce();
});
it('keeps boundary and overlapping whitespace findings disjoint', () => {
  const doc = html('<p><b>前 </b>  后   ，末尾。</p>'); const report = inspectDocument(doc, 'word');
  for (const a of report.findings) for (const b of report.findings) if (a !== b && a.path === b.path) expect(a.start < b.end && a.end > b.start).toBe(false);
});
it('does not interrupt clean equations/tables or protected-only text with a review dialog', async () => {
  const writer = clipboard(); vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);
  await reviewedCopy(html('<p>10\u00a0kg 👩🏽‍💻 می\u200cروم <span data-math-source="x^2">x2</span></p><table><tr><td>A</td></tr></table>'), 'office', writer);
  expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull(); expect(writer.write).toHaveBeenCalledOnce();
});
it('copies explicit editor decisions without prompting twice, but checks again after further editing', async () => {
  const writer = clipboard(); const panel = openRichEditor(html('<p>A\u00a0B</p>'));
  click('显示隐藏字符', panel); await vi.waitFor(() => expect(panel.querySelector('[data-pastefit-visual-review]')).not.toBeNull());
  const textbox = panel.querySelector<HTMLElement>('[role="textbox"]')!; expect(textbox.hidden).toBe(true);
  click('返回编辑', panel); await vi.waitFor(() => expect(textbox.hidden).toBe(false));
  click('贴妥智能复制', panel); await vi.waitFor(() => expect(writer.write).toHaveBeenCalledOnce()); expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull();
  textbox.innerHTML = '<p>C\u200bD</p>'; textbox.dispatchEvent(new Event('input'));
  click('贴妥智能复制', panel); await vi.waitFor(() => expect(panel.querySelector('[data-pastefit-visual-review]')).not.toBeNull()); expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull(); expect(writer.write).toHaveBeenCalledOnce();
  click('返回编辑', panel);
});
