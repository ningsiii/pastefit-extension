import { afterEach, expect, it, vi } from 'vitest';
import { openRichEditor } from '../../src/ui/rich-editor';
import { normalizeHtml } from '../../src/core/normalize-html';
import { wpsFormulaKey } from '../../src/clipboard/formula-preference';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const click = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') === label || b.textContent === label))!.click();
const key = (editor: HTMLElement, redo = false) => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: redo, bubbles: true, cancelable: true }));
const setup = () => {
  let pref = false;
  const listeners = new Set<(changes: Record<string, { newValue: boolean }>, area: string) => void>();
  const get = vi.fn(async () => ({ [wpsFormulaKey]: pref }));
  const set = vi.fn(async (values: Record<string, boolean>) => { pref = values[wpsFormulaKey]; listeners.forEach(fn => fn({ [wpsFormulaKey]: { newValue: pref } }, 'local')); });
  const write = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { storage: { local: { get, set }, onChanged: { addListener: (fn: typeof listeners extends Set<infer F> ? F : never) => listeners.add(fn), removeListener: (fn: typeof listeners extends Set<infer F> ? F : never) => listeners.delete(fn) } }, runtime: { getURL: (path: string) => path } });
  vi.stubGlobal('navigator', { platform: 'Win32', clipboard: { write, writeText: vi.fn() } });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  return { get, set, write, listeners };
};
const read = (blob: Blob) => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
afterEach(() => { document.querySelector('[data-pastefit-rich-editor]')?.dispatchEvent(new Event('pastefit:dispose')); document.body.replaceChildren(); vi.unstubAllGlobals(); });

it('uses one whole-document action to supply both document formatting and chat text without leaking interface labels', async () => {
  const { write } = setup(); const panel = openRichEditor(html('<h2>计划</h2><p><b>重点</b></p><ol><li>完成</li></ol><table><tr><th>名称</th></tr><tr><td>结果</td></tr></table>'));
  expect(panel.textContent).not.toMatch(/其他复制方式|仅复制聊天文字|复制为文稿|撤销插入|可直接复制/);
  expect(panel.style.width).toContain('1100px'); expect(panel.style.overflow).toBe('hidden');
  expect(panel.querySelector('[role="textbox"]')!.parentElement!.style.minHeight).toBe('0');
  expect(panel.querySelector('[aria-label="复制设置面板"]')?.hasAttribute('hidden')).toBe(true);
  expect(panel.querySelector<HTMLElement>('.pf-formula-settings > summary')!.style.display).toBe('none');
  click(panel, '贴妥智能复制'); await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  const data = write.mock.calls[0][0][0].data;
  expect(await read(data['text/html'])).toContain('<h2'); expect(await read(data['text/html'])).toContain('<table');
  const plain = await read(data['text/plain']); expect(plain).toContain('【计划】'); expect(plain).toContain('1. 完成'); expect(plain).toContain('名称： 结果');
  expect(plain).not.toMatch(/编辑内容|复制设置|贴妥智能复制/);
});

it('restores replaced text, formatting, selection and subsequent typing with keyboard undo and redo', () => {
  setup(); const panel = openRichEditor(html('<p><strong>原文</strong> 结尾</p>'), vi.fn());
  const editor = panel.querySelector<HTMLElement>('[role="textbox"]')!; const before = editor.innerHTML;
  const range = document.createRange(); range.selectNodeContents(editor.querySelector('strong')!);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); editor.dispatchEvent(new MouseEvent('mouseup'));
  click(panel, '→'); expect(editor.querySelector('strong')?.textContent).toBe('→');
  key(editor); expect(editor.innerHTML).toBe(before); expect(window.getSelection()!.toString()).toBe('原文');
  key(editor, true); expect(editor.querySelector('strong')?.textContent).toBe('→');
  editor.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'X', bubbles: true, cancelable: true }));
  editor.querySelector('strong')!.append('X'); editor.dispatchEvent(new Event('input'));
  key(editor); expect(editor.querySelector('strong')?.textContent).toBe('→'); key(editor); expect(editor.innerHTML).toBe(before);
});

it('handles copy-time suspicious text inside the editor and copies once after the decision', async () => {
  const { write } = setup(); const panel = openRichEditor(html('<p>hel\u200blo；10\u00a0公斤。</p>'));
  click(panel, '贴妥智能复制'); await vi.waitFor(() => expect(panel.querySelector('[data-pastefit-visual-review]')).not.toBeNull());
  expect(document.querySelector('[data-pastefit-copy-review]')).toBeNull(); expect(write).not.toHaveBeenCalled();
  expect(panel.querySelector<HTMLElement>('[role="textbox"]')!.hidden).toBe(true);
  expect(panel.style.width).toContain('1100px');
  click(panel, '贴妥智能复制'); await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  expect(await read(write.mock.calls[0][0][0].data['text/plain'])).toBe('hello；10\u00a0公斤。');
  click(panel, '返回编辑'); expect(panel.querySelector<HTMLElement>('[role="textbox"]')!.hidden).toBe(false);
  expect(panel.style.width).toContain('1100px');
});

it('waits for persisted setting saves before copying and removes the live preference listener on close', async () => {
  const { set, listeners } = setup(); let finish!: () => void;
  const persist = set.getMockImplementation()!;
  set.mockImplementationOnce(values => new Promise<void>(resolve => { finish = () => { void persist(values).then(resolve); }; }));
  const write = vi.fn().mockResolvedValue([]); const panel = openRichEditor(html('<p><span data-math-source="x_i">xi</span></p>'), write);
  const input = panel.querySelector<HTMLInputElement>('input')!;
  await vi.waitFor(() => expect(input.disabled).toBe(false)); expect(listeners.size).toBe(1);
  input.click(); click(panel, '贴妥智能复制'); await Promise.resolve(); expect(write).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(finish).toBeTypeOf('function')); finish(); await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
  expect(write.mock.calls[0][1]).toBe('wps');
  listeners.forEach(fn => fn({ [wpsFormulaKey]: { newValue: true } }, 'local')); expect(input.checked).toBe(true);
  panel.querySelector<HTMLButtonElement>('[aria-label="关闭编辑器"]')!.click(); expect(listeners.size).toBe(0);
});

it('blocks copying after a save failure until a new setting choice is saved', async () => {
  const { set, write } = setup(); const panel = openRichEditor(html('<p>正文</p>'));
  const input = panel.querySelector<HTMLInputElement>('input')!; await vi.waitFor(() => expect(input.disabled).toBe(false));
  set.mockRejectedValueOnce(new Error('disk')); input.click(); await vi.waitFor(() => expect(input.disabled).toBe(false));
  expect(input.checked).toBe(false); click(panel, '贴妥智能复制');
  await vi.waitFor(() => expect(panel.querySelector('[role="status"]')?.textContent).toContain('保存失败'));
  expect(write).not.toHaveBeenCalled(); input.click(); await vi.waitFor(() => expect(input.disabled).toBe(false));
  click(panel, '贴妥智能复制'); await vi.waitFor(() => expect(write).toHaveBeenCalledOnce());
});
