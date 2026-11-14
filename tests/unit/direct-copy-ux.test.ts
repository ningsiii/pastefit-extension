import { afterEach, expect, it, vi } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { pagesNativeTransfer } from '../../src/adapters/pages-native-xml';
import { copyPagesNative } from '../../src/clipboard/pages-native';
import { openRichEditor } from '../../src/ui/rich-editor';
import { copyNotice, copyNoticeAnchor } from '../../src/ui/copy-notice';
const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const read = (blob: Blob) => new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
const clipboard = () => {
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  vi.stubGlobal('navigator', { platform: 'MacIntel', clipboard: writer });
  return writer;
};
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
it('keeps recognized equations editable and an invalid equation as literal source in the same document', () => {
  const source = html('<p>START <span data-math-source="x^2">x</span> <span data-math-source="\\unknowncommand{x}">bad</span> END</p>');
  const before = JSON.stringify(source); const result = pagesNativeTransfer(source);
  expect(result.equations).toBe(1); expect(result.warnings).toEqual(['公式 2 保留原式：\\(\\unknowncommand{x}\\)']);
  expect(result.documentXml).toContain('<m:oMath>'); expect(result.documentXml).toContain('\\unknowncommand{x}'); expect(result.documentXml).toContain('END'); expect(result.documentXml).not.toContain('img'); expect(JSON.stringify(source)).toBe(before);
});
it.each(['<p>Plain text</p>', '<p><span data-math-source="\\unknowncommand{x}">bad</span></p>'])('copies formula-free or entirely unsupported content without helper permissions: %s', async content => {
  const writer = clipboard(); const sendMessage = vi.fn(); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const warnings = await copyPagesNative(html(content)); expect(sendMessage).not.toHaveBeenCalled(); expect(writer.write).toHaveBeenCalledOnce();
  const items = writer.write.mock.calls[0][0]; const copied = await read(items[0].data['text/html']); expect(copied).not.toMatch(/<math|<img/);
  if (content.includes('unknowncommand')) { expect(copied).toContain('\\unknowncommand{x}'); expect(warnings).toHaveLength(1); } else expect(warnings).toHaveLength(0);
});
it('does not turn unsupported MathML into live HTML or discard nested table content', async () => {
  const writer = clipboard(); vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn() } });
  await copyPagesNative({ type: 'document', children: [{ type: 'table', rows: [{ header: false, cells: [[{ type: 'math', format: 'mathml', display: false, source: '<math><mphantom><mi>x</mi></mphantom></math>' }]] }] }] });
  const copied = await read(writer.write.mock.calls[0][0][0].data['text/html']); expect(copied).toContain('<table'); expect(copied).toContain('&lt;math&gt;'); expect(copied).not.toContain('<math');
});
it('exposes one smart action, keeps Mac setup in options and recovers after native failure', async () => {
  clipboard(); const sendMessage = vi.fn().mockRejectedValue(new Error('Extension context invalidated.'));
  vi.stubGlobal('chrome', { storage: { local: { get: vi.fn(async () => ({ 'pastefit.copyTarget': 'office' })) } }, runtime: { sendMessage } });
  const panel = openRichEditor(html('<p><span data-math-source="x">x</span></p>'));
  const button = [...panel.querySelectorAll('button')].find(b => b.textContent === '贴妥智能复制')!;
  expect(button).toBeDefined(); expect(button.closest('details')).toBeNull(); expect(button.hidden).toBe(false); expect(panel.querySelector('a')!.closest('[aria-label="复制设置面板"]')).not.toBeNull(); expect(panel.textContent).not.toContain('复制到 Pages'); button.click(); expect(button.disabled).toBe(true);
  await vi.waitFor(() => expect(button.disabled).toBe(false)); expect(panel.querySelector('[role="status"]')!.textContent).toContain('贴妥已更新，请刷新网页后重试。');
  sendMessage.mockResolvedValue({ ok: true }); button.click(); await vi.waitFor(() => expect(panel.querySelector('[role="status"]')!.textContent).toBe('已复制')); expect(button.disabled).toBe(false);
});
it('acknowledges only copied and keeps detailed warnings collapsed, without a guessed destination', () => {
  vi.useFakeTimers(); const notice = copyNotice(['A very long warning about images and formats']);
  expect(notice.querySelector('span')!.textContent).toBe('已复制'); expect(notice.querySelector('details')!.open).toBe(false); expect(notice.querySelector('summary')!.textContent).toBe('1 处提醒');
  expect(notice.querySelector('span')!.textContent).not.toMatch(/Pages|微信|Word/); vi.runAllTimers(); expect(notice.isConnected).toBe(false);
});
it('ends a stalled request with a recoverable timeout instead of leaving the copy button disabled', async () => {
  vi.useFakeTimers(); clipboard(); vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(() => new Promise(() => undefined)) } });
  const pending = copyPagesNative(html('<span data-math-source="x">x</span>')); const check = expect(pending).rejects.toThrow('复制超时');
  await vi.advanceTimersByTimeAsync(75000); await check;
});

it('uses one Mac smart request with native equations, MathML HTML and complete text', async () => {
  const writer = clipboard(); const sendMessage = vi.fn(async message => message.type === 'pastefit:native-enabled' ? { ok: true } : { ok: true });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const { reviewedCopy } = await import('../../src/clipboard/reviewed-copy');
  const doc = html('<p>START <span data-math-source="\\frac{a+b}{2}">f</span> <span data-math-source="\\unknowncommand{x}">bad</span> END</p>');
  const warnings = await reviewedCopy(doc);
  expect(sendMessage.mock.calls).toHaveLength(2);
  const payload = sendMessage.mock.calls[1][0];
  expect(payload.documentXml).toContain('<m:oMath>'); expect(payload.documentXml).toContain('\\unknowncommand{x}');
  expect(payload.html).toContain('<math'); expect(payload.html).toContain('\\unknowncommand{x}'); expect(payload.html).not.toContain('<img');
  expect(payload.plain).toContain('\\frac{a+b}{2}'); expect(payload.plain).toContain('END'); expect(payload.plain).not.toContain('\ufffc');
  expect(writer.write).not.toHaveBeenCalled(); expect(warnings).toHaveLength(1);
});
it.each(['no-formula', 'unconfigured', 'windows'])('keeps browser copy without native conversion for %s', async kind => {
  const writer = clipboard(); if (kind === 'windows') vi.stubGlobal('navigator', { platform: 'Win32', clipboard: writer });
  const sendMessage = vi.fn().mockResolvedValue({ ok: false }); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const { reviewedCopy } = await import('../../src/clipboard/reviewed-copy');
  await reviewedCopy(html(kind === 'no-formula' ? '<p>START END</p>' : '<p>START <span data-math-source="x">x</span> END</p>'));
  expect(writer.write).toHaveBeenCalledOnce(); expect(sendMessage.mock.calls.some(([message]) => message.type === 'pastefit:copy-pages-native')).toBe(false);
  if (kind !== 'unconfigured') expect(sendMessage).not.toHaveBeenCalled();
  const copied = await read(writer.write.mock.calls[0][0][0].data['text/html']); expect(copied).toContain('END'); expect(copied).not.toContain('<img');
});
it('does not overwrite the clipboard with a fallback if the native conversion detects a competing copy', async () => {
  const writer = clipboard(); vi.stubGlobal('chrome', { runtime: { sendMessage: vi.fn(async message => message.type === 'pastefit:native-enabled' ? { ok: true } : { ok: false, code: 'clipboard-changed' }) } });
  const { reviewedCopy } = await import('../../src/clipboard/reviewed-copy');
  await expect(reviewedCopy(html('<span data-math-source="x">x</span>'))).rejects.toThrow('剪贴板发生变化');
  expect(writer.write).not.toHaveBeenCalled(); expect(writer.writeText).not.toHaveBeenCalled();
});

it.each(['MacIntel', 'Win32'])('keeps heading-only smart copy in the browser on %s', async platform => {
  const writer = clipboard(); vi.stubGlobal('navigator', { platform, clipboard: writer });
  const sendMessage = vi.fn().mockResolvedValue({ ok: true }); vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const { reviewedCopy } = await import('../../src/clipboard/reviewed-copy');
  await reviewedCopy(html('<h1>START</h1><p>Body</p><h6>END</h6>'));
  expect(sendMessage).not.toHaveBeenCalled(); expect(writer.write).toHaveBeenCalledOnce();
});

it('places a regular check acknowledgement above the captured selection and removes a prior busy notice', () => {
  vi.useFakeTimers();
  const busy = copyNotice([], { pending: true, anchor: { left: 40, top: 160, bottom: 180 } });
  expect(busy.textContent).toBe('复制中…'); expect(busy.querySelector('svg')).toBeNull();
  const notice = copyNotice([], { anchor: { left: 40, top: 160, bottom: 180 } });
  expect(busy.isConnected).toBe(false); expect(notice.style.left).toBe('40px');
  expect(parseFloat(notice.style.top)).toBeLessThan(160);
  expect(notice.querySelector('svg path')!.getAttribute('d')).toBe('M3 8l3 3 7-7');
  expect(notice.textContent).toBe('已复制');
  vi.advanceTimersByTime(2500); expect(notice.isConnected).toBe(false);
});
it('keeps a selection-edge acknowledgement visible below the text and falls back when there is no selection', () => {
  vi.useFakeTimers(); window.getSelection()!.removeAllRanges(); expect(copyNoticeAnchor()).toBeNull();
  const edge = copyNotice([], { anchor: { left: innerWidth + 20, top: 0, bottom: 20 } });
  expect(edge.style.top).toBe('28px'); expect(parseFloat(edge.style.left)).toBeLessThanOrEqual(innerWidth - 8);
  const fallback = copyNotice([], { anchor: null }); expect(fallback.style.top).toBe('24px');
});
it('confirms editor copy on the original button with a regular icon and supports another copy', async () => {
  clipboard(); const write = vi.fn().mockResolvedValue([]); const panel = openRichEditor(html('<p>Sample</p>'), write);
  const button = panel.querySelector<HTMLButtonElement>('[aria-label="贴妥智能复制"]')!;
  button.click(); expect(button.textContent).toBe('复制中…');
  await vi.waitFor(() => expect(button.textContent).toBe('已复制'));
  expect(button.querySelector('svg path')!.getAttribute('d')).toBe('M3 8l3 3 7-7'); expect(button.disabled).toBe(false);
  button.click(); await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(2));
  expect(JSON.stringify(write.mock.calls[0][0])).not.toMatch(/已复制|copy-check|M3 8/);
});
