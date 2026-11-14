import { referenceWarnings } from '../core/references';
import { documentClipboardHtml } from '../adapters/document-clipboard-html';
import { wechatAdapter } from '../adapters/text-adapter';
import { mathText } from '../core/math';
import { writeDocument } from './rich';
import type { BlockNode, InlineNode, SemanticDocument } from '../core/semantic-document';
import { inspectDocument } from '../core/preflight';
import { reviewDocument } from '../ui/copy-review';
import { pagesNativeTransfer } from '../adapters/pages-native-xml';
import { CopyCancelled } from './copy-cancelled';

export const nativeFailureMessage = (code?: string): string => {
  const messages: Record<string, string> = {
    'connection-permission': '请在设置中启用“增强公式兼容”。',
    'host-unavailable': '本地连接不可用，请检查“增强公式兼容”设置。',
    'accessibility-permission': '请在 macOS 系统设置中为 PasteFitBridge 开启辅助功能；开发版更新后可能需要重新添加。',
    'automation-permission': '请在 macOS 系统设置的自动化权限中允许 PasteFitBridge 控制 Pages。',
    'focus-changed': '转换时切换了窗口，本次已停止。请保持窗口不变后重试。',
    'clipboard-changed': '转换期间剪贴板发生变化，本次已停止，请重新复制。',
    busy: '另一项 Pages 复制正在转换，请稍后再试。',
    'conversion-timeout': 'Pages 转换超时，尚未确认复制成功，请稍后重试。',
    'native-equations-missing': '公式转换未完成，请重试。',
    'invalid-document': '本机组件需要更新，请在“增强公式兼容”中安装新版后重试。'
  };
  return messages[code ?? ''] ?? '公式增强未完成，请重试或在设置中停用。';
};
export const copyPagesNative = async (initial: SemanticDocument, alreadyReviewed = false): Promise<readonly string[]> => {
  const report = inspectDocument(initial, 'auto');
  const needsReview = !alreadyReviewed && report.findings.some(f => f.replacement !== undefined && !f.protected);
  const document = needsReview ? await reviewDocument(initial, 'auto') : initial;
  if (!document) throw new CopyCancelled();
  const transfer = pagesNativeTransfer(document);
  if (!transfer.equations) {
    const inline = (nodes: readonly InlineNode[]): InlineNode[] => nodes.map(node => node.type === 'math' ? { type: 'text', value: mathText(node) } : 'children' in node ? { ...node, children: inline(node.children) } : node);
    const blocks = (nodes: readonly BlockNode[]): BlockNode[] => nodes.map(node => {
      if (node.type === 'paragraph' || node.type === 'heading') return { ...node, children: inline(node.children) };
      if (node.type === 'quote') return { ...node, children: blocks(node.children) };
      if (node.type === 'list') return { ...node, items: node.items.map(item => ({ ...item, children: blocks(item.children) })) };
      if (node.type === 'table') return { ...node, rows: node.rows.map(row => ({ ...row, cells: row.cells.map(inline), ...(row.cellMeta ? { cellMeta: row.cellMeta.map(meta => ({ ...meta, blocks: blocks(meta.blocks) })) } : {}) })) };
      return node;
    });
    const warnings = await writeDocument({ ...document, children: blocks(document.children) }, 'office');
    return [...new Set([...transfer.warnings, ...referenceWarnings(document), ...warnings])];
  }
  const html = documentClipboardHtml(document).value;
  const plain = wechatAdapter.render(document).value;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const response = await Promise.race([
      chrome.runtime.sendMessage({ type: 'pastefit:copy-pages-native', documentXml: transfer.documentXml, html, plain }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('复制超时，请稍后重试。')), 75000); })
    ]);
    if (!response.ok) throw new Error(nativeFailureMessage(response.code));
    return [...new Set([...transfer.warnings, ...referenceWarnings(document)])];
  } catch (error) {
    if (/context invalidated|receiving end|message port/i.test(error instanceof Error ? error.message : '')) throw new Error('贴妥已更新，请刷新网页后重试。');
    throw error;
  } finally { if (timer !== undefined) clearTimeout(timer); }
};
