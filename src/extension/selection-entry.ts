import { captureSelection } from './capture-selection';
import { normalize } from './workflow';
import { writeDocument } from '../clipboard/rich';
import { openRichEditor } from '../ui/rich-editor';

const mode = window.__pastefitAction ?? 'smart';
delete window.__pastefitAction;
const input = captureSelection();
if (!input) {
  window.alert('贴妥：没有可用选区，请重新选中文字。');
} else {
  const document = normalize(input).document;
  if (mode === 'edit') openRichEditor(document);
  else void writeDocument(document, mode).then(() => {
    const notice = globalThis.document.createElement('div');
    notice.textContent = mode === 'chat' ? '已复制到聊天' : '已贴妥，可粘贴到微信或 Word'; notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#18202a;color:white;padding:12px 18px;border-radius:8px;font:16px sans-serif';
    globalThis.document.body.append(notice); window.setTimeout(() => notice.remove(), 2500);
  }).catch(() => {
    const panel = openRichEditor(document); const status = panel.querySelector('[role="status"]');
    if (status) status.textContent = '复制未成功。请在面板中选择“仅复制聊天文字”或“贴妥智能复制”重试。';
  });
}
