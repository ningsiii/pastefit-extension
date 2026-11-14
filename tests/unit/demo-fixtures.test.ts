import { afterEach, expect, it } from 'vitest';
import source from '../manual/demo/index.html?raw';
import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';
import { inspectDocument } from '../../src/core/preflight';
import { wechatAdapter } from '../../src/adapters/text-adapter';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';

const selectScene = (name: string) => {
  document.body.innerHTML = source;
  const template = document.getElementById(`scene-${name}`) as HTMLTemplateElement;
  const sample = document.getElementById('sample')!;
  sample.replaceChildren(template.content.cloneNode(true));
  const range = document.createRange(); range.selectNodeContents(name === 'chat' ? sample.querySelector('pre')! : sample);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  return normalize(captureSelection()!).document;
};
afterEach(() => { window.getSelection()?.removeAllRanges(); document.body.replaceChildren(); });
it('captures the Markdown demo through the real selection pipeline, without copying page controls', () => {
  const doc = selectScene('chat');
  const text = wechatAdapter.render(doc).value;
  expect(text).toContain('猫猫探月小队'); expect(text).not.toContain('##'); expect(text).not.toContain('**');
  expect(text).not.toContain('选中示例'); expect(text).not.toContain('录屏展示');
  expect(doc.children.filter(n => n.type === 'heading')).toHaveLength(3);
});
it('preserves three real formula sources, merged cells, ordered start and tinted source contrast', () => {
  const doc = selectScene('document');
  const report = inspectDocument(doc, 'word');
  expect(report.formulas).toHaveLength(3);
  expect(report.formulas.map(f => f.source)).toEqual(['\\frac{a+b}{2}', 'x_i', '\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}']);
  expect(document.querySelector('#sample [style]')?.getAttribute('style')).toContain('background-color');
  const rich = documentClipboardHtml(doc).value;
  expect(rich).toContain('rowspan="2"'); expect(rich).toContain('colspan="2"'); expect(rich).toContain('start="3"');
  expect(rich).not.toContain('#edf2ff'); expect(rich).toContain('末尾：奶茶已就位，月球等你来');
  const wps = documentClipboardHtml(doc, 'source').value;
  expect(wps).toContain('\\frac{a+b}{2}'); expect(wps).not.toContain('<math');
});
it('flags deliberate issues while preserving normal content and protected emoji', () => {
  const doc = selectScene('hidden'); const report = inspectDocument(doc, 'auto');
  expect(report.findings.some(f => f.label.includes('零宽空格'))).toBe(true);
  expect(report.findings.some(f => f.label.includes('不换行空格'))).toBe(true);
  expect(report.findings.some(f => f.label.includes('占位'))).toBe(true);
  const text = wechatAdapter.render(doc).value;
  expect(text).toContain('👨‍👩‍👧‍👦'); expect(text).toContain('a·b'); expect(text).toContain('می‌روم');
  expect(report.findings.filter(f => f.replacement !== undefined && !f.protected).some(f => f.context.includes('👨'))).toBe(false);
});
