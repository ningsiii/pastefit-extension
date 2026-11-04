import { afterEach, expect, it, vi } from 'vitest';
import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';
import { writeDocument } from '../../src/clipboard/rich';

const markdown = '这是 **原始粗体内容**。\n\n- 第一项\n- 第二项\n\n表格：\n\n| 字段 | 内容 |\n| --- | --- |\n| Name | PasteFit |\n| Mode | Smart Copy |\n\n末尾检查：中文 ABC 123。';
const html = '<p>这是 <strong>原始粗体内容</strong>。</p><ul><li>第一项</li><li>第二项</li></ul><p>表格：</p><table><thead><tr><th>字段</th><th>内容</th></tr></thead><tbody><tr><td>Name</td><td>PasteFit</td></tr><tr><td>Mode</td><td>Smart Copy</td></tr></tbody></table><p>末尾检查：中文 ABC 123。</p>';
const read = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
});
afterEach(() => { document.body.innerHTML = ''; window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });

it.each(['markdown', 'html'] as const)('captures %s selection and writes complete chat and document representations together', async (kind) => {
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  if (kind === 'markdown') {
    const area = document.createElement('textarea'); area.value = markdown; document.body.append(area); area.focus(); area.select();
  } else {
    const article = document.createElement('article'); article.innerHTML = html; document.body.append(article);
    const range = document.createRange(); range.selectNodeContents(article); window.getSelection()!.addRange(range);
  }
  const input = captureSelection()!;
  expect(input.kind).toBe(kind);
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  await writeDocument(normalize(input).document, 'smart', writer);
  expect(writer.write).toHaveBeenCalledTimes(1); expect(writer.writeText).not.toHaveBeenCalled();
  const items = writer.write.mock.calls[0][0]; expect(items).toHaveLength(1);
  expect(Object.keys(items[0].data).sort()).toEqual(['text/html', 'text/plain']);
  const rich = await read(items[0].data['text/html']); const plain = await read(items[0].data['text/plain']);
  for (const value of ['原始粗体内容', '第一项', '第二项', '字段', '内容', 'Name', 'PasteFit', 'Mode', 'Smart Copy', '中文 ABC 123']) {
    expect(rich).toContain(value); expect(plain).toContain(value);
  }
  const parsed = new DOMParser().parseFromString(rich, 'text/html');
  expect([...parsed.querySelectorAll('tr')].map(row => [...row.children].map(cell => cell.textContent))).toEqual([['字段','内容'],['Name','PasteFit'],['Mode','Smart Copy']]);
  expect(parsed.querySelector('strong')?.textContent).toBe('原始粗体内容');
  expect(parsed.querySelectorAll('li')).toHaveLength(2);
  expect(plain).toContain('• 第一项'); expect(plain).not.toMatch(/\*\*|<table|\| ---|\u200b/);
  expect(rich).not.toMatch(/StartFragment|<html|\u200b/);
});
