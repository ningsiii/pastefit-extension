import type { SemanticDocument } from '../core/semantic-document';
import { documentHtmlAdapter } from '../adapters/document-html';
import { wechatAdapter } from '../adapters/text-adapter';

export type CopyMode = 'chat' | 'smart';
export type RichWriter = Pick<Clipboard, 'writeText' | 'write'>;

export const writeDocument = async (
  document: SemanticDocument,
  mode: CopyMode = 'smart',
  writer: RichWriter = navigator.clipboard
): Promise<void> => {
  const plain = wechatAdapter.render(document).value;
  if (!plain.trim()) throw new Error('没有可复制的内容');
  if (mode === 'chat') {
    if (!writer?.writeText) throw new Error('此页面无法写入剪贴板');
    await writer.writeText(plain);
    return;
  }
  if (!writer?.write || typeof ClipboardItem === 'undefined') throw new Error('此页面不支持双格式复制，请在 Chrome 中重试');
  await writer.write([new ClipboardItem({
    'text/html': new Blob([documentHtmlAdapter.render(document).value], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' })
  })]);
};
