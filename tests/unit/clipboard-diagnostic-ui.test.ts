import diagnosticHtml from '../manual/clipboard-diagnostic.html?raw';
import { afterEach, expect, it, vi } from 'vitest';
import { sampleHtml } from '../manual/diagnostic-core';

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.resetModules(); });
it('runs A and B, records paste and Word observations, then copies the report', async () => {
  document.body.innerHTML = diagnosticHtml;
  const write = vi.fn().mockResolvedValue(undefined);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { write, writeText }, userAgent: 'test browser' });
  vi.stubGlobal('ClipboardItem', class {
    types: string[];
    constructor(private data: Record<string, Blob | Promise<Blob>>) { this.types = Object.keys(data); }
    getType(type: string) { return Promise.resolve(this.data[type]); }
  });
  await import('../manual/clipboard-diagnostic');
  const readReport = () => JSON.parse(document.querySelector<HTMLTextAreaElement>('#report')!.value);
  for (const [index, mode] of ['baseline', 'markdown'].entries()) {
    const button = document.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)!;
    expect(button.disabled).toBe(false); button.click();
    await vi.waitFor(() => expect(readReport().runs[index].write).toContain('API 写入成功'));
    const paste = new Event('paste', { cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { types: ['text/html', 'text/plain'], getData: (type: string) => type === 'text/html' ? sampleHtml : 'sample' } });
    document.querySelector('#paste')!.dispatchEvent(paste);
    const word = document.querySelector<HTMLSelectElement>('#word')!;
    word.value = '只有聊天文字，没有表格'; word.dispatchEvent(new Event('change'));
    expect(readReport().runs[index]).toMatchObject({ mode, word: '只有聊天文字，没有表格', pasted: { summary: { completeTable: true } } });
  }
  expect(write).toHaveBeenCalledTimes(2);
  expect(writeText).not.toHaveBeenCalled();
  document.querySelector<HTMLButtonElement>('#copy-report')!.click();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  expect(JSON.parse(writeText.mock.calls[0][0]).runs).toHaveLength(2);
});
