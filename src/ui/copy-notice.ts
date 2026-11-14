import { copyCheck } from './copy-feedback';

export type CopyNoticeAnchor = { left: number; top: number; bottom: number };
export const copyNoticeAnchor = (): CopyNoticeAnchor | null => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (typeof range.getClientRects !== 'function') return null;
  const rect = [...range.getClientRects()].find(rect => rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth);
  return rect ? { left: Math.max(8, rect.left), top: Math.max(0, rect.top), bottom: Math.min(innerHeight, rect.bottom) } : null;
};

// Native context menus close before copy completes. A short acknowledgement
// stays near the captured selection, without guessing its destination app.
export const copyNotice = (warnings: readonly string[] = [], options: { anchor?: CopyNoticeAnchor | null; pending?: boolean } = {}): HTMLElement => {
  document.querySelectorAll('[data-pastefit-copy-notice]').forEach(node => node.remove());
  const notice = document.createElement('div'); notice.dataset.pastefitCopyNotice = 'true';
  notice.setAttribute('role', 'status');
  notice.style.cssText = 'all:initial;box-sizing:border-box;position:fixed;z-index:2147483647;display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:7px 14px;border-radius:18px;color:#25486d;background:linear-gradient(110deg,#def7fff2,#edf3fff5 65%,#fff3e3e8);box-shadow:inset 0 1px 1px #fff,0 3px 12px #25486d14;backdrop-filter:blur(8px);font:600 13px/1.5 sans-serif;max-width:min(360px,calc(100vw - 16px))';
  const result = document.createElement('span'); result.textContent = options.pending ? '复制中…' : '已复制';
  if (!options.pending) { const icon = copyCheck(); icon.style.color = '#0876ed'; notice.append(icon); }
  notice.append(result);
  if (warnings.length) {
    const details = document.createElement('details'); const title = document.createElement('summary');
    title.textContent = `${warnings.length} 处提醒`; title.style.cursor = 'pointer'; details.append(title);
    for (const warning of warnings) { const p = document.createElement('p'); p.textContent = warning; p.style.cssText = 'overflow-wrap:anywhere;margin:6px 0;font-weight:400'; details.append(p); }
    notice.append(details);
  }
  document.body.append(notice);
  const anchor = options.anchor === undefined ? copyNoticeAnchor() : options.anchor;
  const size = notice.getBoundingClientRect();
  const maxLeft = Math.max(8, innerWidth - size.width - 8);
  const left = Math.max(8, Math.min(anchor?.left ?? (innerWidth - size.width) / 2, maxLeft));
  let top = anchor ? anchor.top - size.height - 8 : 24;
  if (top < 8 && anchor) top = anchor.bottom + 8;
  top = Math.max(8, Math.min(top, innerHeight - size.height - 8));
  // Leave the host page's visible buttons clickable as well.
  const controls = [...document.querySelectorAll('button,[role="button"],[role="toolbar"]')].map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
  const clear = (x: number, y: number): boolean => !controls.some(rect => x < rect.right + 6 && x + size.width > rect.left - 6 && y < rect.bottom + 6 && y + size.height > rect.top - 6);
  let x = left;
  if (!clear(x, top)) {
    const alternative = controls.flatMap(rect => [rect.right + 8, rect.left - size.width - 8]).filter(x => x >= 8 && x <= maxLeft).sort((a, b) => Math.abs(a - left) - Math.abs(b - left)).find(x => clear(x, top));
    if (alternative !== undefined) x = alternative;
    else if (anchor) top = Math.max(8, Math.min(anchor.bottom + 8, innerHeight - size.height - 8));
  }
  notice.style.left = `${x}px`; notice.style.top = `${top}px`;
  if (!options.pending) window.setTimeout(() => { if (!notice.querySelector('details[open]')) notice.remove(); }, warnings.length ? 12000 : 2500);
  return notice;
};
