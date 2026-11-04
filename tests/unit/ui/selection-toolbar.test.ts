import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountSelectionToolbar } from '../../../src/ui/selection-toolbar';
import { openRichEditor } from '../../../src/ui/rich-editor';
import { normalize } from '../../../src/extension/workflow';
import { numberedEmojis, commonEmojis } from '../../../src/ui/editor-panel';

let dispose = () => {};
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('location', { hostname: 'chatgpt.com' });
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ left: 30, right: 200, top: 60, bottom: 80 }] });
  document.body.innerHTML = '<article data-turn="assistant"><p><strong>Selected</strong></p></article>';
});
afterEach(() => { dispose(); document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const host = () => document.querySelector('[data-pastefit-selection-toolbar]') as HTMLElement;
const button = (label: string) => [...host().shadowRoot!.querySelectorAll('button')].find(b => b.textContent === label)!;
const show = (node: Node = document.querySelector('strong')!) => {
  const range = document.createRange(); range.selectNodeContents(node);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  document.dispatchEvent(new MouseEvent('mouseup')); vi.advanceTimersByTime(200);
};
it('offers explicit copy without changing selection or writing automatically', async () => {
  const write = vi.fn().mockResolvedValue(undefined); dispose = mountSelectionToolbar(write);
  show(); expect(host().style.display).toBe('block'); expect(write).not.toHaveBeenCalled();
  const down = new MouseEvent('mousedown', { cancelable: true }); button('智能复制').dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true); expect(window.getSelection()!.toString()).toBe('Selected');
  button('智能复制').click(); await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1); expect(host().shadowRoot!.textContent).toContain('已贴妥');
});
it('retains captured document for editing and hides toolbar', () => {
  const edit = vi.fn(); dispose = mountSelectionToolbar(vi.fn(), edit); show(); button('编辑 / Emoji').click();
  expect(edit).toHaveBeenCalledTimes(1); expect(JSON.stringify(edit.mock.calls[0][0])).toContain('Selected'); expect(host().style.display).toBe('none');
});
it('handles keyboard select-all within an answer without intercepting the key', () => {
  dispose = mountSelectionToolbar();
  const range = document.createRange(); range.selectNodeContents(document.querySelector('strong')!);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  const event = new KeyboardEvent('keyup', { key: 'a', ctrlKey: true, cancelable: true });
  document.dispatchEvent(event); vi.advanceTimersByTime(200);
  expect(event.defaultPrevented).toBe(false); expect(host().style.display).toBe('block');
});
it('reports failure without claiming success', async () => {
  dispose = mountSelectionToolbar(vi.fn().mockRejectedValue(new Error('denied'))); show(); button('智能复制').click(); await Promise.resolve();
  expect(host().shadowRoot!.querySelector('output')!.textContent).toContain('复制失败');
});
it('supports recognized Markdown source with the existing parser', () => {
  document.body.innerHTML = '<article data-turn="assistant"><pre><code class="language-markdown"># Heading\n\n**Bold**</code></pre></article>';
  dispose = mountSelectionToolbar(); show(document.querySelector('code')!); expect(host().style.display).toBe('block');
});
it.each([
  ['chat.deepseek.com', '<div class="ds-markdown"><strong>Formatted</strong></div>'],
  ['www.doubao.com', '<div data-testid="message-content"><strong>Formatted</strong></div>']
])('offers formatted selections on opted-in supported host %s', (hostname, html) => {
  vi.stubGlobal('location', { hostname }); document.body.innerHTML = html;
  dispose = mountSelectionToolbar(); show(); expect(host().style.display).toBe('block');
});
it('recognizes the current assistant-message wrapper without legacy article/role markers', () => {
  // Synthetic text and semantic attributes only; no saved conversation/account data.
  document.body.innerHTML = '<div data-markdown-text-style="assistant-message"><div data-markdown-copy="contents"><div data-code-block="true"><div data-code-block-source="true"><code class="block whitespace-pre!"><span><span class="hljs-section"># Fixture</span>\n\n<span class="hljs-strong">**Important**</span>\n\n| Key | Value |\n| --- | --- |\n| A | 123 |</span></code></div></div></div></div>';
  const edit = vi.fn(); dispose = mountSelectionToolbar(vi.fn(), edit);
  show(document.querySelector('code > span')!);
  expect(host().style.display).toBe('block'); button('编辑 / Emoji').click();
  expect(edit).toHaveBeenCalledTimes(1);
  expect(edit.mock.calls[0][0].children.map((node: { type: string }) => node.type)).toEqual(['heading', 'paragraph', 'table']);
});
it('does not treat user-message wrappers or arbitrary markdown containers as assistant answers', () => {
  document.body.innerHTML = '<div data-markdown-text-style="user-message"><strong>User text</strong></div><div data-markdown-copy="contents"><strong>Other text</strong></div>';
  dispose = mountSelectionToolbar();
  for (const node of document.querySelectorAll('strong')) { show(node); expect(host().style.display).toBe('none'); }
});
it('still rejects cross-answer and editable selections with current assistant wrappers', () => {
  document.body.innerHTML = '<div data-markdown-text-style="assistant-message"><strong>First</strong></div><div data-markdown-text-style="assistant-message"><strong>Second</strong><div contenteditable="true"><strong>Editing</strong></div></div>';
  dispose = mountSelectionToolbar(); const nodes = document.querySelectorAll('strong');
  const range = document.createRange(); range.setStart(nodes[0].firstChild!, 0); range.setEnd(nodes[1].firstChild!, 6);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new MouseEvent('mouseup')); vi.advanceTimersByTime(200);
  expect(host().style.display).toBe('none'); show(nodes[2]); expect(host().style.display).toBe('none');
});
it('anchors to visible selected text when the selection ends outside the viewport', () => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [
    { left: 30, right: 200, top: 60, bottom: 80 },
    { left: 30, right: 200, top: innerHeight + 200, bottom: innerHeight + 220 }
  ] });
  dispose = mountSelectionToolbar(); show(); expect(host().style.display).toBe('block');
  expect(parseFloat(host().style.top)).toBe(90);
});
it('clips code selection geometry to its internal scroll container', () => {
  document.body.innerHTML = '<article data-turn="assistant"><div style="overflow-y:auto"><code class="block whitespace-pre!"><span class="hljs-section"># Heading</span>\n<span class="hljs-strong">**Bold**</span></code></div></article>';
  const scroller = document.querySelector('article > div')!;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 300, top: 30, bottom: 150 } as DOMRect);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [
    { left: 30, right: 200, top: 60, bottom: 80 },
    { left: 30, right: 200, top: 300, bottom: 320 }
  ] });
  dispose = mountSelectionToolbar(); show(document.querySelector('code')!);
  expect(host().style.display).toBe('block'); expect(parseFloat(host().style.top)).toBe(90);
});
it('observes mouseup even when the page stops its bubbling', () => {
  dispose = mountSelectionToolbar(); const strong = document.querySelector('strong')!;
  strong.addEventListener('mouseup', event => event.stopPropagation());
  const range = document.createRange(); range.selectNodeContents(strong);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  strong.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); vi.advanceTimersByTime(200);
  expect(host().style.display).toBe('block');
});
it('still hides when all selected text is clipped out of view', () => {
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [
    { left: 30, right: 200, top: innerHeight + 200, bottom: innerHeight + 220 }
  ] });
  dispose = mountSelectionToolbar(); show(); expect(host().style.display).toBe('none');
});
it.each([
  '<article data-turn="user"><strong>Selected</strong></article>',
  '<article data-turn="assistant"><p>Plain text</p></article>',
  '<article data-turn="assistant"><pre><code class="language-python">print(123)</code></pre></article>',
  '<article data-turn="assistant"><div contenteditable="true"><strong>Selected</strong></div></article>',
  '<article data-turn="assistant"><a href="#"><strong>Selected</strong></a></article>',
  '<dialog open><article data-turn="assistant"><strong>Selected</strong></article></dialog>'
])('does not offer toolbar in excluded context: %s', html => {
  document.body.innerHTML = html; dispose = mountSelectionToolbar();
  show(document.querySelector('strong,code,p')!); expect(host().style.display).toBe('none');
});
it('supports formatted generic selections when the opt-in controller mounts it', () => {
  vi.stubGlobal('location', { hostname: 'example.com' }); dispose = mountSelectionToolbar(); show(); expect(host().style.display).toBe('block');
});
it('does not show while an input is focused or across different answers', () => {
  dispose = mountSelectionToolbar(); const input = document.createElement('input'); document.body.append(input); input.focus(); show();
  expect(host().style.display).toBe('none'); input.blur();
  const other = document.createElement('article'); other.dataset.turn = 'assistant'; other.innerHTML = '<strong>Other</strong>'; document.body.append(other);
  const range = document.createRange(); range.setStart(document.querySelector('strong')!.firstChild!, 0); range.setEnd(other.firstChild!.firstChild!, 5);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new MouseEvent('mouseup')); vi.advanceTimersByTime(200);
  expect(host().style.display).toBe('none');
});
it('dismisses on scroll, selection changes and Escape; pause lasts until remount', () => {
  dispose = mountSelectionToolbar(); show(); window.dispatchEvent(new Event('scroll')); expect(host().style.display).toBe('none');
  show(); document.dispatchEvent(new Event('selectionchange')); expect(host().style.display).toBe('none');
  show(); document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' })); expect(host().style.display).toBe('none');
  show(); button('本页停用').click(); show(); expect(host().style.display).toBe('none');
  dispose(); dispose = mountSelectionToolbar(); show(); expect(host().style.display).toBe('block');
});
it('cleans up duplicate mounts and refuses changed source text', () => {
  dispose = mountSelectionToolbar(); const write = vi.fn(); dispose = mountSelectionToolbar(write);
  expect(document.querySelectorAll('[data-pastefit-selection-toolbar]')).toHaveLength(1); show();
  document.querySelector('strong')!.textContent = 'Changed'; button('智能复制').click(); expect(write).not.toHaveBeenCalled();
});
it('leaves native copy alone, limits large selections and clamps to the viewport', () => {
  dispose = mountSelectionToolbar(); show();
  const copyEvent = new Event('copy', { cancelable: true }); document.dispatchEvent(copyEvent); expect(copyEvent.defaultPrevented).toBe(false);
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [{ left: innerWidth - 1, right: innerWidth, top: innerHeight - 2, bottom: innerHeight }] });
  show(); expect(parseFloat(host().style.left)).toBeLessThanOrEqual(innerWidth - 8); expect(parseFloat(host().style.top)).toBeLessThanOrEqual(innerHeight - 8);
  document.querySelector('strong')!.textContent = 'x'.repeat(50001); show(); expect(host().style.display).toBe('none');
});
it('opens Emoji directly and inserts and undoes an added emoji', () => {
  const doc = normalize({ kind: 'markdown', content: '**Text**' }).document;
  const panel = openRichEditor(doc, vi.fn(), 'emoji');
  expect(panel.querySelector('[aria-label="常见场景"]')!.hasAttribute('hidden')).toBe(false);
  expect((panel.querySelector('[aria-label="常用符号"]') as HTMLElement).style.display).toBe('none');
  (panel.querySelector('[aria-label="插入庆祝"]') as HTMLButtonElement).click();
  expect(panel.querySelector('[role="textbox"]')!.textContent).toContain('🎉');
  ([...panel.querySelectorAll('button')].find(b => b.textContent === '撤销插入')!).click();
  expect(panel.querySelector('[role="textbox"]')!.textContent).toBe('Text');
  expect(numberedEmojis).toHaveLength(10); expect(commonEmojis).toHaveLength(24);
});
