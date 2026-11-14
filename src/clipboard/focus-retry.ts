// Chrome can reject a context-menu copy before focus has returned to the page.
// Only recover that specific transient error; do not steal focus or retry other failures.
const messageOf = (error: unknown): string => error instanceof Error || error instanceof DOMException ? error.message : '';
const focusError = (error: unknown): boolean => /document is not focused/i.test(messageOf(error));
const waitForFocus = (): Promise<boolean> => new Promise(resolve => {
  let settled = false;
  const finish = (focused: boolean): void => {
    if (settled) return; settled = true; clearTimeout(deadline);
    window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check);
    resolve(focused);
  };
  const check = (): void => { if (document.hasFocus() && document.visibilityState === 'visible') finish(true); };
  const deadline = setTimeout(() => finish(false), 400);
  window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
  check();
});
export const withClipboardFocusRetry = async (write: () => Promise<void>): Promise<void> => {
  try { await write(); }
  catch (error) {
    if (!focusError(error) || !await waitForFocus()) throw error;
    await write();
  }
};

export const copyFailureMessage = (error: unknown): string => {
  const message = messageOf(error);
  if (focusError(error)) return '请回到网页后重试。';
  if (/context invalidated|receiving end|message port/i.test(message)) return '贴妥已更新，请刷新网页后重试。';
  if (/NotAllowedError|not allowed|permission|denied/i.test(message) || (error instanceof DOMException && error.name === 'NotAllowedError')) return '浏览器暂未允许复制，请重试。';
  if (/[\u4e00-\u9fff]/.test(message) && message.length <= 160) return message;
  return '复制未完成，请重试。';
};
