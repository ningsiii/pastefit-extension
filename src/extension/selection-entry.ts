import { copyNotice } from '../ui/copy-notice';
import { captureSelection } from './capture-selection';
import { normalize } from './workflow';
import { reviewedCopy as writeDocument, CopyCancelled } from '../clipboard/reviewed-copy';
import { openRichEditor } from '../ui/rich-editor';

const mode = window.__pastefitAction ?? 'smart';
delete window.__pastefitAction;
const input = captureSelection();
if (!input) {
  window.alert('贴妥：没有可用选区，请重新选中文字。');
} else {
  const document = normalize(input).document;
  if (mode === 'edit') openRichEditor(document);
  else {
    const busy = window.document.createElement('div'); busy.setAttribute('role', 'status'); busy.textContent = '正在复制…';
    busy.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#18202a;color:white;padding:10px 16px;border-radius:8px;font:15px sans-serif';
    window.document.body.append(busy);
    void writeDocument(document, mode).then((warnings) => {
    copyNotice(warnings);
  }).catch((error: unknown) => {
    if (error instanceof CopyCancelled) return;
    const panel = openRichEditor(document); const status = panel.querySelector('[role="status"]');
    if (status) status.textContent = error instanceof Error ? error.message : '复制失败，请重试。';
  }).finally(() => busy.remove());
  }
}
