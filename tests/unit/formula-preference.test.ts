import { afterEach, expect, it, vi } from 'vitest';
import { getWpsFormulaPreference, setWpsFormulaPreference, wpsFormulaKey } from '../../src/clipboard/formula-preference';
import { mountFormulaSettings } from '../../src/ui/formula-settings';
import { reviewedCopy } from '../../src/clipboard/reviewed-copy';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { openRichEditor } from '../../src/ui/rich-editor';

const storage = (initial = false) => {
  let value = initial;
  const get = vi.fn(async () => ({ [wpsFormulaKey]: value }));
  const set = vi.fn(async (values: Record<string, unknown>) => { value = values[wpsFormulaKey] === true; });
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', { storage: { local: { get, set } }, runtime: { getURL: (s: string) => s, sendMessage } });
  return { get, set, sendMessage };
};
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
const read = (blob: Blob) => new Promise<string>(resolve => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.readAsText(blob); });
afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); });

it('remembers the popup switch, describes off and rolls back failed saves', async () => {
  const { set } = storage();
  const root = document.createElement('div'); document.body.append(root);
  await mountFormulaSettings(root);
  let toggle = root.querySelector<HTMLInputElement>('input')!;
  expect(root.textContent).toContain('已关闭');
  toggle.click(); await tick();
  expect(await getWpsFormulaPreference()).toBe(true);
  expect(root.textContent).toContain('需粘到 WPS 公式框中转换');
  expect(root.textContent).toContain('粘到 Word');
  expect(root.textContent).toContain('请关闭此开关');
  expect(root.textContent).toContain('Word（Office）默认可直接粘贴可编辑公式');
  root.replaceChildren(); await mountFormulaSettings(root);
  toggle = root.querySelector<HTMLInputElement>('input')!;
  expect(toggle.checked).toBe(true);
  set.mockRejectedValueOnce(new Error('disk'));
  toggle.click(); await tick(); expect(toggle.checked).toBe(true);
  expect(root.textContent).toContain('保存失败');
  toggle.click(); await tick(); expect(await getWpsFormulaPreference()).toBe(false);
  expect(root.textContent).toContain('使用通用公式格式');
});
it('shows Pages only on Mac and blocks the switch on read failure', async () => {
  const { get } = storage(); vi.stubGlobal('navigator', { platform: 'Win32' });
  const root = document.createElement('div'); await mountFormulaSettings(root);
  expect(root.querySelector('a')).toBeNull();
  vi.stubGlobal('navigator', { platform: 'MacIntel' }); get.mockRejectedValueOnce(new Error('disk'));
  root.replaceChildren(); await mountFormulaSettings(root);
  expect(root.querySelector('a')?.textContent).toBe('设置 Pages 可编辑公式 →');
  expect(root.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
  expect(root.textContent).toContain('读取失败');
});
it.each(['MacIntel', 'Win32'])('applies the saved preference to smart copy without changing chat text on %s', async platform => {
  const { sendMessage } = storage(true);
  vi.stubGlobal('navigator', { platform });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) };
  const doc = normalizeMarkdown({ kind: 'markdown', content: '# Title\n\n$\\frac{a+b}{2}$' }).document;
  vi.stubGlobal('navigator', { platform, clipboard: writer });
  await reviewedCopy(doc, 'smart');
  const first = writer.write.mock.calls[0][0][0].data;
  expect(await read(first['text/html'])).toContain('\\frac{a+b}{2}');
  expect(await read(first['text/html'])).not.toContain('<math');
  await reviewedCopy(doc, 'smart', writer, false, false);
  const second = writer.write.mock.calls[1][0][0].data;
  expect(await read(second['text/html'])).toContain('<math');
  expect(await read(first['text/plain'])).toBe(await read(second['text/plain']));
  expect(sendMessage).not.toHaveBeenCalled();
  await setWpsFormulaPreference(false);
  await reviewedCopy(doc, 'smart', writer);
  expect(await read(writer.write.mock.calls[2][0][0].data['text/html'])).toContain('<math');
});
it('shares the persistent setting between editor and popup without a local override', async () => {
  storage(true);
  const write = vi.fn().mockResolvedValue([]);
  const doc = normalizeMarkdown({ kind: 'markdown', content: '$x_i$' }).document;
  const panel = openRichEditor(doc, write); await tick();
  const toggle = panel.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(toggle.checked).toBe(true);
  toggle.click();
  [...panel.querySelectorAll('button')].find(b => b.textContent === '贴妥智能复制')!.click(); await tick();
  expect(write.mock.calls[0][1]).toBe('smart');
  expect(await getWpsFormulaPreference()).toBe(false);
});

it('does not silently copy a different formula format when saved settings cannot be read', async () => {
  const { get } = storage(true); get.mockRejectedValue(new Error('disk'));
  const writer = { write: vi.fn(), writeText: vi.fn() };
  const doc = normalizeMarkdown({ kind: 'markdown', content: '$x_i$' }).document;
  await expect(reviewedCopy(doc, 'smart', writer)).rejects.toThrow('disk');
  expect(writer.write).not.toHaveBeenCalled();
  await reviewedCopy(doc, 'chat', writer); expect(writer.writeText).toHaveBeenCalledOnce();
});
