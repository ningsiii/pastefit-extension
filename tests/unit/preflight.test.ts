import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanFindings, inspectDocument, type ReviewTarget } from '../../src/core/preflight';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentTextAdapter } from '../../src/adapters/text-adapter';
import { reviewedCopy, CopyCancelled } from '../../src/clipboard/reviewed-copy';
import { reviewDocument } from '../../src/ui/copy-review';
import { openRichEditor } from '../../src/ui/rich-editor';
import { mountPasteFit } from '../../src/integrations/chatgpt';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const click = (label: string, root: ParentNode = document) => { const button = [...root.querySelectorAll('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label); expect(button).toBeDefined(); button!.click(); };
const clipboard = () => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('navigator', { clipboard: writer }); return writer;
};
const storage = (value = 'office') => { const state: Record<string, unknown> = { 'pastefit.copyTarget': value }; vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => state), set: vi.fn(async next => Object.assign(state, next)) } } }); return state; };
const read = (blob: Blob): Promise<string> => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
afterEach(() => { document.querySelector('[data-pastefit-copy-review]')?.dispatchEvent(new Event('pastefit:dispose')); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe.each<ReviewTarget>(['pages', 'word', 'wps'])('%s preflight', target => {
  it('finds exact prose characters with visible context and permits only selected corrections', () => {
    const original = html('<p>A\u00a0B\u202fC\u200bD\u00adE</p><p>正文  ，标点。</p>');
    const before = JSON.stringify(original); const report = inspectDocument(original, target);
    expect(report.findings.some(f => f.context.includes('[U+00A0]') && f.location.includes('1段'))).toBe(true);
    expect(report.findings.some(f => f.label.includes('标点前'))).toBe(true);
    const one = report.findings.find(f => f.context.includes('[U+00A0]') && f.label.includes('U+00A0'))!;
    const cleaned = cleanFindings(original, report, new Set([one.id]));
    expect(documentTextAdapter.render(cleaned).value).toContain('A B\u202fC\u200bD\u00adE');
    expect(JSON.stringify(original)).toBe(before);
    expect(report.notes.join()).toContain('护眼/深色');
  });
  it('protects code, formulas, URLs, ordinary spaces, math dots and emoji joiners', () => {
    const doc = html('<p>A B · x • y 👨‍👩‍👧‍👦 👩🏽‍💻 <a href="https://example.org/a%20b">link</a></p><pre>A\u00a0B\u200bC  D</pre><p><code>X\u00a0Y</code><span data-math-source="x\\,y">x y</span></p>');
    const report = inspectDocument(doc, target);
    expect(report.findings).toHaveLength(0); expect(report.formulas[0].source).toBe('x\\,y');
    expect(documentHtmlAdapter.render(cleanFindings(doc, report, new Set())).value).toBe(documentHtmlAdapter.render(doc).value);
  });
  it('inspects merged and nested cells once and preserves the structure after cleaning', () => {
    const doc = html('<table><tr><th rowspan="2">A\u00a0B</th><td><p>C\u200bD</p><table><tr><td>E\u202fF</td></tr></table></td></tr><tr><td>G</td></tr></table>');
    const report = inspectDocument(doc, target); expect(report.tables).toBe(2); expect(report.findings).toHaveLength(3);
    const cleaned = cleanFindings(doc, report, new Set(report.findings.map(f => f.id)));
    const result = documentHtmlAdapter.render(cleaned).value;
    expect(result).toContain('rowspan="2"'); expect(result).toContain('A B'); expect(result).toContain('CD'); expect(result).toContain('E F'); expect(result).not.toMatch(/[\u00a0\u200b\u202f]/);
    expect(documentTextAdapter.render(cleaned).value).toContain('A B');
  });
});
it('flags directional and language joiners for review without offering destructive removal', () => {
  const report = inspectDocument(html('<p>فارسی\u200c字\u200dA\u202eB\u2060C</p>'), 'word');
  expect(report.findings).toHaveLength(4); expect(report.findings.every(f => f.replacement === undefined)).toBe(true);
});
it('detects raw citation markers, literal Markdown and unfinished placeholders without changing their meaning', () => {
  const doc = html('<p>citeturn1search0 **literal** [待补充]</p>');
  const report = inspectDocument(doc, 'wps'); expect(report.findings.some(f => f.label.includes('引用标记'))).toBe(true); expect(report.findings.some(f => f.label.includes('Markdown'))).toBe(true); expect(report.findings.some(f => f.label.includes('占位'))).toBe(true);
  expect(documentTextAdapter.render(cleanFindings(doc, report, new Set())).value).toContain('[待补充]');
  const selected = new Set(report.findings.filter(f => f.replacement !== undefined).map(f => f.id));
  expect(documentTextAdapter.render(cleanFindings(doc, report, selected)).value).toBe(' **literal** ');
});
it('bounds expanded findings and reports omitted items rather than silently declaring clean', () => {
  const report = inspectDocument(html(`<p>${'A\u00a0'.repeat(1000)}</p>`), 'pages'); expect(report.findings).toHaveLength(500); expect(report.omitted).toBe(500); expect(report.notes.join()).toContain('未展开');
});
it('has accurate target-specific equation notes and exposes original source', () => {
  const doc = normalizeMarkdown({ kind: 'markdown', content: '$\\frac{a+b}{2}$' }).document;
  expect(inspectDocument(doc, 'pages').notes.join()).toContain('仍为图片');
  for (const target of ['word', 'wps'] as const) expect(inspectDocument(doc, target).notes.join()).toContain('MathML');
});
it('makes processing reversible and cancellation leaves the clipboard unchanged', async () => {
  const writer = clipboard(); const doc = html('<p>A\u00a0B</p>'); const pending = reviewDocument(doc, 'pages');
  const mark = document.querySelector<HTMLButtonElement>('[data-finding-id]')!; expect(mark.dataset.decision).toBe('keep'); mark.click();
  expect(document.querySelector('[data-decision="change"]')).not.toBeNull(); mark.click();
  expect(document.querySelector('[data-decision="keep"]')).not.toBeNull();
  document.querySelector<HTMLButtonElement>('[data-finding-id]')!.click(); expect(document.querySelector('[data-finding-id]')!.getAttribute('data-decision')).toBe('change');
  click('取消'); expect(await pending).toBeNull(); expect(writer.write).not.toHaveBeenCalled(); expect(writer.writeText).not.toHaveBeenCalled();
});
it.each(['office', 'wps', 'pages'])('waits for review and ignores legacy %s preferences even if another tab changes them', async target => {
  const writer = clipboard(); const state = storage(target);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0, height: 0 } as DOMRect);
  const pending = reviewedCopy(html('<p>A\u200bB<span data-math-source="x^2">x2</span></p>'), 'smart', writer);
  await vi.waitFor(() => expect(document.querySelector('[data-pastefit-copy-review]')).not.toBeNull());
  expect(document.querySelector('h2')!.textContent).toBe('隐藏字符');
  expect(writer.write).not.toHaveBeenCalled(); state['pastefit.copyTarget'] = target === 'pages' ? 'office' : 'pages';
  expect(document.querySelector('[data-finding-id]')!.getAttribute('data-decision')).toBe('change'); click('复制'); await pending;
  expect(writer.write).toHaveBeenCalledTimes(1); const items = writer.write.mock.calls[0][0]; const result = await read(items[0].data['text/html']); expect(result).toContain('AB');
  expect(result).toContain('<math'); expect(result).not.toContain('<img');
});
it('cancels a real copy promise without touching the clipboard', async () => {
  const writer = clipboard(); storage(); const pending = reviewedCopy(html('<p>A\u200bB</p>'), 'smart', writer); const rejected = expect(pending).rejects.toBeInstanceOf(CopyCancelled);
  await vi.waitFor(() => expect(document.querySelector('dialog')).not.toBeNull()); click('取消'); await rejected; expect(writer.write).not.toHaveBeenCalled();
});
it('copies a selected formula source for native insertion without writing the whole document', async () => {
  const writer = clipboard(); const pending = reviewDocument(normalizeMarkdown({ kind: 'markdown', content: '$x^2$' }).document, 'pages');
  click('复制公式 1 源式'); await vi.waitFor(() => expect(writer.writeText).toHaveBeenCalledWith('x^2'));
  expect(writer.write).not.toHaveBeenCalled(); click('取消'); await pending;
});
it('checks plain normal content without an extra dialog and keeps the clean-copy shortcut', async () => {
  const writer = clipboard(); storage('wps'); await reviewedCopy(html('<p>A B</p>'), 'smart', writer); expect(document.querySelector('dialog')).toBeNull(); expect(writer.write).toHaveBeenCalledOnce();
});
it('opens the preflight from the editor and applies corrections with an editor undo path', async () => {
  clipboard(); storage('wps'); const write = vi.fn(); const panel = openRichEditor(html('<p>A\u00a0B</p>'), write);
  expect(panel.querySelector('select')).toBeNull(); click('显示隐藏字符', panel);
  await vi.waitFor(() => expect(panel.querySelector('[data-pastefit-visual-review]')).not.toBeNull());
  expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull();
  expect(panel.querySelector('[data-finding-id]')!.getAttribute('data-decision')).toBe('keep'); panel.querySelector<HTMLButtonElement>('[data-finding-id]')!.click(); click('返回编辑', panel);
  await vi.waitFor(() => expect(panel.querySelector('[role="textbox"]')!.textContent).toBe('A B'));
  panel.querySelector('[role="textbox"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })); expect(panel.querySelector('[role="textbox"]')!.textContent).toBe('A\u00a0B'); expect(write).not.toHaveBeenCalled();
});
it('routes actual response copy actions through the preflight', async () => {
  const writer = clipboard(); storage(); document.body.innerHTML = '<article data-turn="assistant"><p>A\u200bB</p></article>'; mountPasteFit();
  (document.querySelector('[data-pastefit-button]') as HTMLButtonElement).click(); await vi.waitFor(() => expect(document.querySelector('[data-pastefit-copy-review]')).not.toBeNull()); expect(writer.write).not.toHaveBeenCalled();
  click('复制'); await vi.waitFor(() => expect(writer.write).toHaveBeenCalledOnce());
});
it('disposes an older review promise rather than leaving a hidden copy pending', async () => {
  const first = reviewDocument(html('<p>A\u00a0B</p>'), 'word'); const second = reviewDocument(html('<p>C\u00a0D</p>'), 'wps'); expect(await first).toBeNull(); expect(document.querySelectorAll('[data-pastefit-copy-review]')).toHaveLength(1); click('取消'); expect(await second).toBeNull();
});
it('finds spaces on both sides of formatting boundaries without deleting intentional separation', () => {
  const doc = html('<p><strong>前 </strong> 后</p>'); const report = inspectDocument(doc, 'word');
  expect(report.findings.some(f => f.label.includes('格式边界'))).toBe(true);
  expect(documentHtmlAdapter.render(cleanFindings(doc, report, new Set(report.findings.map(f => f.id)))).value).toBe(documentHtmlAdapter.render(doc).value);
});
it('preserves typographic thin spaces and Arabic direction marks as manual-only findings', () => {
  const doc = html('<p>10\u2009kg X\u200aY A\u061cB</p>'); const report = inspectDocument(doc, 'wps');
  expect(report.findings).toHaveLength(3); expect(report.findings.every(f => f.replacement === undefined)).toBe(true);
});
