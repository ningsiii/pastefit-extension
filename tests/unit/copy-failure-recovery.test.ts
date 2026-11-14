import { afterEach, expect, it, vi } from 'vitest';
import { withClipboardFocusRetry, copyFailureMessage } from '../../src/clipboard/focus-retry';
import { writeDocument } from '../../src/clipboard/rich';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const lostFocus = () => new DOMException("Failed to execute 'write' on 'Clipboard': Document is not focused.", 'NotAllowedError');
it('retries exactly once when context-menu focus returns, reusing the complete payload', async () => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockRejectedValueOnce(lostFocus()).mockResolvedValue(undefined), writeText: vi.fn() };
  await writeDocument(normalizeMarkdown({ kind: 'markdown', content: '# Title\n\nText' }).document, 'smart', writer);
  expect(writer.write).toHaveBeenCalledTimes(2); expect(writer.write.mock.calls[0][0]).toBe(writer.write.mock.calls[1][0]);
  expect(writer.write.mock.calls[1][0][0].data['text/html']).toBeInstanceOf(Blob);
});
it('waits briefly for focus without calling window.focus or writing in the background', async () => {
  vi.useFakeTimers(); const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const steal = vi.spyOn(window, 'focus').mockImplementation(() => undefined);
  const write = vi.fn().mockRejectedValueOnce(lostFocus()).mockResolvedValue(undefined);
  const pending = withClipboardFocusRetry(write); await Promise.resolve(); expect(write).toHaveBeenCalledTimes(1);
  focused.mockReturnValue(true); window.dispatchEvent(new Event('focus')); await pending;
  expect(write).toHaveBeenCalledTimes(2); expect(steal).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it('stops after the short deadline and never retries later on a new focus event', async () => {
  vi.useFakeTimers(); vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const write = vi.fn().mockRejectedValue(lostFocus()); const pending = withClipboardFocusRetry(write);
  const result = expect(pending).rejects.toThrow('Document is not focused'); await vi.advanceTimersByTimeAsync(400); await result;
  window.dispatchEvent(new Event('focus')); expect(write).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it('does not retry unrelated denial or loop when the second write also fails', async () => {
  const denied = vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
  await expect(withClipboardFocusRetry(denied)).rejects.toThrow('Permission denied'); expect(denied).toHaveBeenCalledOnce();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true); vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const repeated = vi.fn().mockRejectedValue(lostFocus()); await expect(withClipboardFocusRetry(repeated)).rejects.toThrow('not focused'); expect(repeated).toHaveBeenCalledTimes(2);
});
it('shows short Chinese failures without raw browser errors or unknown source details', () => {
  expect(copyFailureMessage(lostFocus())).toBe('请回到网页后重试。');
  expect(copyFailureMessage(new Error('Failed to execute write: private sample'))).toBe('复制未完成，请重试。');
  expect(copyFailureMessage(new Error('Extension context invalidated'))).toContain('刷新网页');
  expect(copyFailureMessage(new DOMException('Denied','NotAllowedError'))).toContain('浏览器');
  expect(copyFailureMessage(new Error('转换期间剪贴板发生变化，本次已停止，请重新复制。'))).toContain('剪贴板发生变化');
});
