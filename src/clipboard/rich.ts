import { referenceWarnings } from '../core/references';
import { pagesHtml } from './pages';
import type { SemanticDocument } from '../core/semantic-document';
import { documentClipboardHtml } from '../adapters/document-clipboard-html';
import { documentTextAdapter, wechatAdapter } from '../adapters/text-adapter';

export type CopyMode = 'chat' | 'smart' | 'document' | 'pages' | 'office' | 'wps' | 'wps-document';
export type RichWriter = Pick<Clipboard, 'writeText' | 'write'>;

export const writeDocument = async (
  document: SemanticDocument,
  mode: CopyMode = 'smart',
  writer: RichWriter = navigator.clipboard,
  formulaSource = false
): Promise<readonly string[]> => {
  const usePages = mode === 'pages';
  const useWps = mode === 'wps' || mode === 'wps-document';
  const plain = (mode === 'document' || useWps || usePages ? documentTextAdapter : wechatAdapter).render(document).value;
  if (!plain.trim()) throw new Error('没有可复制的内容');
  if (mode === 'chat') {
    if (!writer?.writeText) throw new Error('此页面无法写入剪贴板');
    await writer.writeText(plain);
    return referenceWarnings(document);
  }
  if (!writer?.write || typeof ClipboardItem === 'undefined') throw new Error('此页面不支持双格式复制，请在 Chrome 中重试');
  const rendered = usePages ? await pagesHtml(document) : documentClipboardHtml(document, useWps || formulaSource ? 'source' : 'mathml');
  const warnings = rendered.warnings.map(warning => typeof warning === 'string' ? warning : warning.message);
  const rich = rendered;
  await writer.write([new ClipboardItem({
    'text/html': new Blob([rich.value], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' })
  })]);
  return [...new Set([...warnings, ...referenceWarnings(document)])];
};
