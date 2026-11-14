import { visibleSelectionAnchor } from './selection-geometry';
import { copyCheck } from './copy-feedback';

export type CopyNoticeAnchor = { left: number; top: number; bottom: number };
export const copyNoticeAnchor = (): CopyNoticeAnchor | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (typeof range.getClientRects !== 'function') return null;
  return visibleSelectionAnchor(range);
};

// Native context menus close before copy completes. A short acknowledgement
// stays at the top center of the page, without guessing its destination app.
export const copyNotice = (warnings: readonly string[] = [], options: { anchor?: CopyNoticeAnchor | null; pending?: boolean; error?: string; onRetry?: () => void } = {}): HTMLElement => {
  document.querySelectorAll('[data-pastefit-copy-notice]').forEach(node => node.remove());
  const notice = document.createElement('div'); notice.dataset.pastefitCopyNotice = 'true';
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'all:initial;box-sizing:border-box;position:fixed;z-index:2147483647;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:7px 14px;border-radius:18px;color:#25486d;background:linear-gradient(110deg,#def7fff2,#edf3fff5 65%,#fff3e3e8);box-shadow:inset 0 1px 1px #fff,0 3px 12px #25486d14;backdrop-filter:blur(8px);font:600 13px/1.5 sans-serif;max-width:min(360px,calc(100vw - 16px))';
  const result = document.createElement('span'); result.textContent = options.pending ? '复制中…' : options.error ? '复制失败' : '已复制';
  if (!options.pending && !options.error) { const icon = copyCheck(); icon.style.color = '#0876ed'; notice.append(icon); }
  notice.append(result);
  if (options.error) {
    const reason = document.createElement('span'); reason.textContent = options.error; reason.style.cssText = 'font-weight:400;overflow-wrap:anywhere'; notice.append(reason);
    if (options.onRetry) {
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重试';
      retry.style.cssText = 'all:initial;font:600 13px/1.5 sans-serif;color:#0966df;cursor:pointer;padding:2px 6px;border-radius:8px;background:#ffffff99';
      retry.addEventListener('click', () => { retry.disabled = true; options.onRetry?.(); }); notice.append(retry);
    }
  }
  if (warnings.length) {
    const details = document.createElement('details'); const title = document.createElement('summary');
    title.textContent = `${warnings.length} 处提醒`; title.style.cursor = 'pointer'; details.append(title);
    for (const warning of warnings) { const p = document.createElement('p'); p.textContent = warning; p.style.cssText = 'overflow-wrap:anywhere;margin:6px 0;font-weight:400'; details.append(p); }
    notice.append(details);
  }
  document.body.append(notice);
  // A copy acknowledgement is global feedback, not another selection tool.
  // Keep its location stable across short/long selections and copy duration.
  notice.style.left = '50%';
  notice.style.top = '24px';
  notice.style.transform = 'translateX(-50%)';

  if (!options.pending) window.setTimeout(() => { if (!notice.querySelector('details[open]')) notice.remove(); }, warnings.length || options.error ? 12000 : 2500);
  return notice;
};
