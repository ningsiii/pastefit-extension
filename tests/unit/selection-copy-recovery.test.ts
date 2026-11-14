import { afterEach, expect, it, vi } from 'vitest';
const actions = vi.hoisted(() => ({ write: vi.fn(), edit: vi.fn() }));
vi.mock('../../src/clipboard/reviewed-copy', () => ({ reviewedCopy: actions.write, CopyCancelled: class CopyCancelled extends Error {} }));
vi.mock('../../src/ui/rich-editor', () => ({ openRichEditor: actions.edit }));
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); delete window.__pastefitAction; vi.resetModules(); vi.clearAllMocks(); });
const select = () => {
  document.body.innerHTML = '<p>Example <strong>selected text</strong></p>';
  const range = document.createRange(); range.selectNodeContents(document.querySelector('p')!); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
};
it('keeps right-click failure out of the editor and retries the captured document successfully', async () => {
  select(); actions.write.mockRejectedValueOnce(new DOMException("Failed to execute 'write' on 'Clipboard': Document is not focused.", 'NotAllowedError')).mockResolvedValue([]);
  await import('../../src/extension/selection-entry');
  await vi.waitFor(() => expect(document.querySelector('[data-pastefit-copy-notice]')?.textContent).toContain('请回到网页后重试'));
  expect(actions.edit).not.toHaveBeenCalled(); expect(document.body.textContent).not.toContain('Failed to');
  const original = actions.write.mock.calls[0][0];
  window.getSelection()!.removeAllRanges();
  document.querySelector<HTMLButtonElement>('[data-pastefit-copy-notice] button')!.click();
  await vi.waitFor(() => expect(document.querySelector('[data-pastefit-copy-notice]')?.textContent).toBe('已复制'));
  expect(actions.write).toHaveBeenCalledTimes(2); expect(actions.write.mock.calls[1][0]).toBe(original); expect(actions.edit).not.toHaveBeenCalled();
});
it('still opens the editor only when the user explicitly selects editing', async () => {
  select(); window.__pastefitAction = 'edit'; await import('../../src/extension/selection-entry');
  expect(actions.edit).toHaveBeenCalledOnce(); expect(actions.write).not.toHaveBeenCalled();
});
it('does not show failure or open editing when the user cancels a hidden-character review', async () => {
  select(); const { CopyCancelled } = await import('../../src/clipboard/reviewed-copy'); actions.write.mockRejectedValueOnce(new CopyCancelled());
  await import('../../src/extension/selection-entry'); await vi.waitFor(() => expect(document.querySelector('[data-pastefit-copy-notice]')).toBeNull());
  expect(actions.edit).not.toHaveBeenCalled();
});
