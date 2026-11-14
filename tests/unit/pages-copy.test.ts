import { afterEach, expect, it, vi } from 'vitest';
import { pagesHtml } from '../../src/clipboard/pages';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { normalizeHtml } from '../../src/core/normalize-html';
import { openRichEditor } from '../../src/ui/rich-editor';
const source = () => normalizeMarkdown({ kind: 'markdown', content: '# 标题\n\nH<sub>2</sub>O **重点** $x^2$\n\n| A | B |\n| --- | --- |\n| 1 | 2 |' }).document;
afterEach(() => { document.body.innerHTML = ''; });
it('uses local generated formula images for Pages while keeping editable text and table structures', async () => {
  const render = vi.fn(async () => { const img = document.createElement('img'); img.src = 'data:image/png;base64,AA=='; img.alt = '\\(x^2\\)'; return img; });
  const result = await pagesHtml(source(), render);
  expect(render).toHaveBeenCalledTimes(1);
  expect(result.value).not.toContain('<math'); expect(result.value).toContain('<img');
  expect(result.value).toContain('<sub>2</sub>'); expect(result.value).toContain('<strong>重点</strong>'); expect(result.value).toContain('<table');
  expect(result.warnings.join()).toContain('不可直接编辑');
});
it('keeps original source if Pages image conversion fails instead of pasting broken MathML', async () => {
  const result = await pagesHtml(source(), async () => { throw new Error('canvas blocked'); });
  expect(result.value).not.toContain('<math'); expect(result.value).toContain('\\(x^2\\)');
  expect(result.warnings.join()).toContain('已保留原式'); expect(result.value).toContain('标题');
});
it('limits formula image conversion and preserves extra formulas as source', async () => {
  const result = await pagesHtml(normalizeMarkdown({ kind: 'markdown', content: Array(101).fill('$x$').join(' ') }).document,
    async () => { const img = document.createElement('img'); img.alt = 'x'; return img; });
  const container = document.createElement('div'); container.innerHTML = result.value;
  expect(container.querySelectorAll('img')).toHaveLength(100); expect(result.value).toContain('\\(x\\)');
});
it('retains merged table cells in Pages output', async () => {
  const doc = normalizeHtml({ kind: 'html', content: '<table><tr><th rowspan="2">A</th><td colspan="2">B</td></tr><tr><td>C</td><td>D</td></tr></table>' }).document;
  const result = await pagesHtml(doc); expect(result.value).toContain('rowspan="2"'); expect(result.value).toContain('colspan="2"');
});
it('uses smart copy without a software selector or extra Pages button', async () => {
  const write = vi.fn().mockResolvedValue([]); const panel = openRichEditor(source(), write);
  expect(panel.querySelector('select')).toBeNull(); expect(panel.textContent).not.toContain('复制到 Pages');
  [...panel.querySelectorAll('button')].find(button => button.textContent === '贴妥智能复制')!.click();
  await vi.waitFor(() => expect(write).toHaveBeenCalled()); expect(write.mock.calls[0][1]).toBe('smart');
});
