import { afterEach, expect, it, vi } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';
import { writeDocument } from '../../src/clipboard/rich';
import { reviewedCopy } from '../../src/clipboard/reviewed-copy';
import { openRichEditor } from '../../src/ui/rich-editor';

const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const read = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
const clipboard = (platform = 'MacIntel') => {
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) };
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  vi.stubGlobal('navigator', { platform, clipboard: writer });
  let enabled = false; vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({ 'pastefit.wpsFormulaCompatible': enabled })), set: vi.fn(async values => { enabled = values['pastefit.wpsFormulaCompatible']; }) } }, runtime: { getURL: (path: string) => path, sendMessage: vi.fn().mockResolvedValue({ ok: false }) } }); return writer;
};
const sample = () => html('<h1>START</h1><p>正文 <strong>重点</strong> H<sub>2</sub>O <span data-math-source="\\frac{a+b}{2}">f</span></p><p><span display="block" data-math-source="\\begin{pmatrix}a&amp;b\\\\c&amp;d\\end{pmatrix}">matrix</span></p><ol start="3"><li>第三项</li><li>第四项</li></ol><table><tr><td rowspan="2">A</td><td><span data-math-source="x_i">x_i</span></td></tr><tr><td>END</td></tr></table><pre><code>$x^2$ literal</code></pre>');
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it.each(['MacIntel', 'Win32'])('explicit WPS source copy avoids native helper on %s, retaining prose and table structure', async platform => {
  const writer = clipboard(platform); const sendMessage = vi.fn(); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const doc = sample(); const before = JSON.stringify(doc);
  await reviewedCopy(doc, 'wps');
  expect(sendMessage).not.toHaveBeenCalled();
  const data = writer.write.mock.calls[0][0][0].data;
  const rich = await read(data['text/html']); const plain = await read(data['text/plain']);
  const parsed = new DOMParser().parseFromString(rich, 'text/html');
  expect(parsed.querySelector('math,img,annotation')).toBeNull();
  expect(parsed.querySelectorAll('h1')).toHaveLength(1); expect(parsed.querySelector('ol')?.getAttribute('start')).toBe('3');
  expect(parsed.querySelector('td')?.getAttribute('rowspan')).toBe('2'); expect(parsed.querySelector('strong')?.textContent).toBe('重点');
  for (const value of ['\\(\\frac{a+b}{2}\\)', '\\[\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}\\]', '\\(x_i\\)', '$x^2$ literal', 'START', 'END']) {
    expect(parsed.body.textContent).toContain(value); expect(plain).toContain(value);
  }
  expect(plain).not.toContain('【'); expect(JSON.stringify(doc)).toBe(before);
  await writeDocument(doc, 'document', writer);
  expect(await read(writer.write.mock.calls[1][0][0].data['text/html'])).toContain('<math');
});
it('escapes arbitrary source in WPS HTML and never converts code literals into formulas', () => {
  const doc = normalizeMarkdown({ kind: 'markdown', content: '`$x^2$`\n\n$\\unknowncommand{x}$' }).document;
  const result = documentClipboardHtml(doc, 'source').value;
  expect(result).toContain('<code>$x^2$</code>'); expect(result).toContain('\\unknowncommand{x}'); expect(result).not.toContain('<math');
  const unsafe = documentClipboardHtml({ type: 'document', children: [{ type: 'paragraph', children: [{ type: 'math', source: '<img src=x onerror=alert(1)>', format: 'mathml', display: false }] }] }, 'source').value;
  const parsed = new DOMParser().parseFromString(unsafe, 'text/html');
  expect(parsed.querySelector('img')).toBeNull(); expect(parsed.body.textContent).toContain('<img src=x onerror=alert(1)>');
});

const findButton = (panel: HTMLElement, text: string) => [...panel.querySelectorAll('button')].find(b => b.textContent === text)!;
const enableWps = async (panel: HTMLElement, checked = true) => {
  const input = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  await vi.waitFor(() => expect(input.disabled).toBe(false));
  if (input.checked !== checked) input.click();
  await vi.waitFor(() => expect(input.disabled).toBe(false));
};
it('keeps editing and original math intact while persistent WPS settings affect the single copy action', async () => {
  clipboard(); const write = vi.fn().mockResolvedValue([]); const doc = sample(); const before = JSON.stringify(doc);
  const panel = openRichEditor(doc, write); const editor = panel.querySelector<HTMLElement>('[role="textbox"]')!;
  const original = editor.innerHTML;
  expect(panel.querySelector('[aria-label="WPS 复制预览（只读）"]')).toBeNull();
  expect(panel.querySelector('[aria-label="复制设置面板"]')?.hasAttribute('hidden')).toBe(true);
  await enableWps(panel);
  expect(editor.hidden).toBe(false); expect(editor.contentEditable).toBe('true'); expect(editor.innerHTML).toBe(original);
  expect(editor.querySelectorAll('math')).toHaveLength(3);
  findButton(panel, '贴妥智能复制').click(); await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(doc, 'wps'));
  await enableWps(panel, false); expect(editor.innerHTML).toBe(original);
  findButton(panel, '贴妥智能复制').click(); await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(doc, 'smart'));
  await enableWps(panel); panel.querySelector<HTMLButtonElement>('[aria-label="关闭编辑器"]')!.click();
  const next = openRichEditor(doc, write); await vi.waitFor(() => expect(next.querySelector<HTMLInputElement>('input')!.checked).toBe(true));
  expect(JSON.stringify(doc)).toBe(before);
});
it('copies a selected original formula without switching to a source-only editor or adding a formula list', async () => {
  const writer = clipboard(); const panel = openRichEditor(sample(), vi.fn());
  const editor = panel.querySelector<HTMLElement>('[role="textbox"]')!;
  const tools = panel.querySelector<HTMLElement>('[aria-label="所选公式"]')!;
  const copy = panel.querySelector<HTMLButtonElement>('[aria-label="复制当前公式源码"]')!;
  expect(tools.hidden).toBe(true);
  editor.querySelector('math')!.dispatchEvent(new MouseEvent('click', { bubbles: true })); copy.click();
  await vi.waitFor(() => expect(writer.writeText).toHaveBeenLastCalledWith('\\frac{a+b}{2}'));
  await enableWps(panel);
  editor.querySelectorAll('math')[2].dispatchEvent(new MouseEvent('click', { bubbles: true })); copy.click();
  await vi.waitFor(() => expect(writer.writeText).toHaveBeenLastCalledWith('x_i'));
});
it('keeps the saved preference when formulas are removed and refreshes selected sources after editing', async () => {
  const writer = clipboard(); const panel = openRichEditor(sample(), vi.fn());
  await enableWps(panel);
  const editor = panel.querySelector<HTMLElement>('[role="textbox"]')!;
  editor.innerHTML = '<p>修改 <span data-math-source="x_j">xj</span></p>'; editor.dispatchEvent(new Event('input'));
  editor.querySelector('[data-math-source]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  panel.querySelector<HTMLButtonElement>('[aria-label="复制当前公式源码"]')!.click();
  await vi.waitFor(() => expect(writer.writeText).toHaveBeenLastCalledWith('x_j'));
  editor.innerHTML = '<p>正文</p>'; editor.dispatchEvent(new Event('input'));
  expect(panel.querySelector<HTMLElement>('[aria-label="所选公式"]')!.hidden).toBe(true);
  expect(panel.querySelector<HTMLInputElement>('[role="switch"]')!.checked).toBe(true);
});
it('labels MathML-only sources honestly and retains clipboard-denial recovery', async () => {
  const writer = clipboard(); writer.writeText.mockRejectedValue(new Error('denied'));
  const panel = openRichEditor(html('<p><math><mi>x</mi></math></p>'), vi.fn());
  panel.querySelector('math')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const limitation = [...panel.querySelectorAll('span')].find(el => el.textContent?.includes('不能直接用于 WPS'))!;
  expect(limitation.hidden).toBe(false); findButton(panel, '复制 MathML').click();
  await vi.waitFor(() => expect(panel.querySelector('[role="status"]')?.textContent).toContain('复制失败'));
});
it('copies WPS source through the existing action without leaking settings or starting a helper', async () => {
  const writer = clipboard(); const sendMessage = vi.fn(); chrome.runtime.sendMessage = sendMessage;
  const panel = openRichEditor(sample()); await enableWps(panel);
  findButton(panel, '贴妥智能复制').click();
  await vi.waitFor(() => expect(writer.write).toHaveBeenCalledOnce()); expect(sendMessage).not.toHaveBeenCalled();
  const data = writer.write.mock.calls[0][0][0].data;
  for (const type of ['text/html', 'text/plain']) {
    const copied = await read(data[type]);
    for (const ui of ['WPS 公式兼容', '复制此公式', '复制设置', '编辑内容']) expect(copied).not.toContain(ui);
    expect(copied).toContain('END'); expect(copied).toContain('\\frac{a+b}{2}'); expect(copied).not.toContain('<math');
  }
});
it('preserves WPS mode and original math through inline hidden review and keyboard undo', async () => {
  clipboard(); const write = vi.fn().mockResolvedValue([]); const panel = openRichEditor(sample(), write);
  const editor = panel.querySelector<HTMLElement>('[role="textbox"]')!;
  findButton(panel, '→').click(); editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true }));
  await enableWps(panel); findButton(panel, '显示隐藏字符').click(); expect(editor.hidden).toBe(true);
  findButton(panel, '返回编辑').click(); expect(editor.hidden).toBe(false); expect(editor.querySelectorAll('math')).toHaveLength(3);
  findButton(panel, '贴妥智能复制').click(); await vi.waitFor(() => expect(write).toHaveBeenLastCalledWith(expect.anything(), 'wps'));
  expect(documentClipboardHtml(write.mock.calls[0][0]).value).toContain('<math');
});
