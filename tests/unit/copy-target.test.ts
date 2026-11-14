import { afterEach, expect, it, vi } from 'vitest';
import { wpsFormulaKey } from '../../src/clipboard/formula-preference';
import { getCopyTarget, setCopyTarget, copyTargetKey } from '../../src/clipboard/copy-target';
import { writeDocument } from '../../src/clipboard/rich';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { normalizeHtml } from '../../src/core/normalize-html';
import { openRichEditor } from '../../src/ui/rich-editor';
import { pagesHtml } from '../../src/clipboard/pages';
import { readMath } from '../../src/core/math';
import originalPage from '../manual/document-fidelity.html?raw';

const source = () => normalizeMarkdown({ kind: 'markdown', content: '$x^2$' }).document;
const store = (value: unknown) => {
  const state: Record<string, unknown> = { [copyTargetKey]: value };
  const get = vi.fn(async (key?: string) => ({ ...(key === copyTargetKey ? state : { [key ?? copyTargetKey]: state[key ?? copyTargetKey] }) }));
  const set = vi.fn(async (next: Record<string, unknown>) => { Object.assign(state, next); });
  vi.stubGlobal('chrome', { storage: { local: { get, set } } });
  return { get, set, state };
};
const blobText = (blob: Blob): Promise<string> => new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

it('defaults to Office and persists only the explicitly selected target enum', async () => {
  const storage = store(undefined); expect(await getCopyTarget()).toBe('office');
  await setCopyTarget('pages'); expect(await getCopyTarget()).toBe('pages');
  expect(storage.set).toHaveBeenCalledWith({ [copyTargetKey]: 'pages' });
  await setCopyTarget('office'); expect(await getCopyTarget()).toBe('office');
});
it('does not depend on a saved app preference being readable', async () => {
  const storage = store('pages'); storage.get.mockRejectedValue(new Error('unavailable'));
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  await writeDocument(source(), 'smart', writer);
  expect(storage.get).not.toHaveBeenCalled(); expect(writer.write).toHaveBeenCalledOnce();
  expect(await blobText(writer.write.mock.calls[0][0][0].data['text/html'])).toContain('<math');
});
it('opens repeated editors without a software selector or modifying legacy preferences', async () => {
  const storage = store('pages'); const write = vi.fn().mockResolvedValue([]);
  const first = openRichEditor(source(), write); expect(first.querySelector('select')).toBeNull();
  const second = openRichEditor(source(), write); expect(first.isConnected).toBe(false); expect(second.querySelector('select')).toBeNull();
  [...second.querySelectorAll('button')].find(b => b.textContent === '贴妥智能复制')!.click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledWith(expect.anything(), 'smart'));
  expect(storage.get.mock.calls.length).toBeGreaterThanOrEqual(2); expect(storage.get.mock.calls.every(args => args[0] === wpsFormulaKey)).toBe(true); expect(storage.set).not.toHaveBeenCalled(); expect(storage.state[copyTargetKey]).toBe('pages');
});
it('does not wait on a stalled old preference read before copying', async () => {
  const storage = store('office'); storage.get.mockImplementation(key => key === copyTargetKey ? new Promise(() => undefined) : Promise.resolve({ ...storage.state }));
  const write = vi.fn().mockResolvedValue([]); const panel = openRichEditor(source(), write);
  [...panel.querySelectorAll('button')].find(b => b.textContent === '贴妥智能复制')!.click();
  await vi.waitFor(() => expect(write).toHaveBeenCalledOnce()); expect(storage.get).toHaveBeenCalledWith(wpsFormulaKey); expect(storage.get).not.toHaveBeenCalledWith(copyTargetKey);
});
it('keeps MathML and formula source in one smart copy even with a saved Pages preference', async () => {
  store('pages'); vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  const warnings = await writeDocument(source(), 'smart', writer); const payload = writer.write.mock.calls[0][0][0].data;
  expect(await blobText(payload['text/html'])).toContain('<math'); expect(await blobText(payload['text/html'])).not.toContain('<img');
  expect(await blobText(payload['text/plain'])).toContain('x^2'); expect(warnings.join()).not.toContain('已按 Pages');
});
it('keeps Office smart copies in MathML and does not overwrite the selected Pages setting for explicit Office output', async () => {
  const storage = store('office'); vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  await writeDocument(source(), 'smart', writer);
  expect(await blobText(writer.write.mock.calls[0][0][0].data['text/html'])).toContain('<math');
  storage.state[copyTargetKey] = 'pages';
  await writeDocument(source(), 'office', writer);
  expect(await blobText(writer.write.mock.calls[1][0][0].data['text/html'])).toContain('<math');
  expect(storage.state[copyTargetKey]).toBe('pages');
});
it('preserves the original full matrix sample, following lists and the actual merged table as separate structures', async () => {
  const parsed = new DOMParser().parseFromString(originalPage, 'text/html');
  const doc = normalizeHtml({ kind: 'html', content: parsed.querySelector('article')!.outerHTML }).document;
  const result = await pagesHtml(doc, async math => {
    const image = document.createElement('img'); image.src = 'data:image/png;base64,AA=='; image.alt = readMath(math)!.source; return image;
  });
  const target = new DOMParser().parseFromString(result.value, 'text/html');
  expect(target.querySelectorAll('math,mtable,mtr')).toHaveLength(0);
  expect(target.querySelectorAll('img')).toHaveLength(3);
  expect([...target.querySelectorAll('img')].some(image => image.alt === '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}')).toBe(true);
  expect(target.querySelectorAll('table')).toHaveLength(1);
  expect(target.querySelectorAll('table tr')).toHaveLength(3);
  expect(target.querySelector('table th')!.getAttribute('rowspan')).toBe('2');
  expect(target.querySelector('table th[colspan]')!.getAttribute('colspan')).toBe('2');
  expect(target.querySelector('ol')!.closest('table')).toBeNull();
  expect(target.querySelectorAll('li')).toHaveLength(3);
  expect(target.body.textContent).toContain('第三项第二段');
  expect(target.body.textContent).toContain('末尾检查：结束 END 987');
  expect(target.body.textContent).not.toContain('\\begin{pmatrix}');
});
