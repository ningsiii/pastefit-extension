import { copyNotice, copyNoticeAnchor } from '../ui/copy-notice';
import { captureSelection } from './capture-selection';
import { normalize } from './workflow';
import { reviewedCopy as writeDocument, CopyCancelled } from '../clipboard/reviewed-copy';
import { openRichEditor } from '../ui/rich-editor';

const mode = window.__pastefitAction ?? 'smart';
delete window.__pastefitAction;
const anchor = copyNoticeAnchor();
const input = captureSelection();
if (!input) {
  window.alert('贴妥：没有可用选区，请重新选中文字。');
} else {
  const document = normalize(input).document;
  if (mode === 'edit') openRichEditor(document);
  else {
    const busy = copyNotice([], { anchor, pending: true });
    void writeDocument(document, mode).then((warnings) => {
    copyNotice(warnings, { anchor });
  }).catch((error: unknown) => {
    if (error instanceof CopyCancelled) return;
    const panel = openRichEditor(document); const status = panel.querySelector('[role="status"]');
    if (status) status.textContent = error instanceof Error ? error.message : '复制失败，请重试。';
  }).finally(() => busy.remove());
  }
}
