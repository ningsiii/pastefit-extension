import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';
import { writeDocument, type RichWriter } from '../../src/clipboard/rich';

export const sampleMarkdown = '这是 **原始粗体内容**。\n\n- 第一项\n- 第二项\n\n表格：\n\n| 字段 | 内容 |\n| --- | --- |\n| Name | PasteFit |\n| Mode | Smart Copy |\n\n末尾检查：中文 ABC 123。';
export const sampleHtml = '<p>这是 <strong>原始粗体内容</strong>。</p><ul><li>第一项</li><li>第二项</li></ul><p>表格：</p><table border="1"><thead><tr><th>字段</th><th>内容</th></tr></thead><tbody><tr><td>Name</td><td>PasteFit</td></tr><tr><td>Mode</td><td>Smart Copy</td></tr></tbody></table><p>末尾检查：中文 ABC 123。</p>';
const samplePlain = '这是「原始粗体内容」。\n\n• 第一项\n• 第二项\n\n表格：\n字段：Name\n内容：PasteFit\n\n字段：Mode\n内容：Smart Copy\n\n末尾检查：中文 ABC 123。';
export type DiagnosticMode = 'baseline' | 'markdown' | 'html-only' | 'selection';
export function inspectPayload(html: string, plain: string) {
  // Detached parsing only; never mount clipboard HTML into the live document.
  const template = document.createElement('template');
  template.innerHTML = html;
  const parsed = template.content;
  const rows = [...parsed.querySelectorAll('tr')].map(row => [...row.children].filter(c => c.matches('th,td')).map(c => c.textContent ?? ''));
  const text = parsed.textContent ?? '';
  return {
    htmlCharacters: html.length, plainCharacters: plain.length,
    bold: parsed.querySelector('strong,b')?.textContent ?? '',
    listItems: parsed.querySelectorAll('li').length, rows,
    completeTable: JSON.stringify(rows) === JSON.stringify([['字段', '内容'], ['Name', 'PasteFit'], ['Mode', 'Smart Copy']]),
    firstParagraph: text.includes('这是 原始粗体内容。'),
    lastParagraph: text.includes('末尾检查：中文 ABC 123。')
  };
}
export type Payload = { types: string[]; html: string; plain: string; summary: ReturnType<typeof inspectPayload> };
const readBlob = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsText(blob);
});
async function inspectItems(items: readonly ClipboardItem[]): Promise<Payload> {
  if (items.length !== 1) throw new Error('预期一个 ClipboardItem');
  const item = items[0];
  const read = async (type: string) => item.types.includes(type) ? readBlob(await item.getType(type)) : '';
  const [html, plain] = await Promise.all([read('text/html'), read('text/plain')]);
  return { types: [...item.types], html, plain, summary: inspectPayload(html, plain) };
}
export async function runDiagnostic(mode: DiagnosticMode, writer: RichWriter, observe: (payload: Payload) => void): Promise<void> {
  const diagnosticWriter: RichWriter = {
    writeText: () => Promise.reject(new Error('诊断路径不应调用仅文本写入')),
    write: async items => {
      const outgoing = mode === 'html-only'
        ? items.map(item => new ClipboardItem({ 'text/html': item.getType('text/html') })) : items;
      // Start the actual write before awaiting inspection so user activation is not delayed.
      const writeResult = writer.write(outgoing).then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
      observe(await inspectItems(outgoing));
      const result = await writeResult;
      if (!result.ok) throw result.error;
    }
  };
  if (mode === 'baseline') {
    await diagnosticWriter.write([new ClipboardItem({
      'text/html': new Blob([sampleHtml], { type: 'text/html' }),
      'text/plain': new Blob([samplePlain], { type: 'text/plain' })
    })]);
  } else {
    const input = captureSelection();
    if (!input) throw new Error('未捕获到样本选区');
    await writeDocument(normalize(input).document, 'smart', diagnosticWriter);
  }
}
