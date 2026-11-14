// A copy acknowledgement never guesses the destination application. Details
// are available on demand rather than turning a toast into a compatibility log.
export const copyNotice = (warnings: readonly string[] = []): HTMLElement => {
  const notice = document.createElement('div'); notice.dataset.pastefitCopyNotice = 'true';
  notice.setAttribute('role', 'status'); notice.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#18202a;color:white;padding:10px 16px;border-radius:8px;font:15px/1.5 sans-serif;max-width:min(420px,calc(100vw - 48px))';
  const result = document.createElement('span'); result.textContent = '已复制'; notice.append(result);
  if (warnings.length) {
    const details = document.createElement('details'); const title = document.createElement('summary');
    title.textContent = `${warnings.length} 处提醒`; title.style.cursor = 'pointer'; details.append(title);
    for (const warning of warnings) { const p = document.createElement('p'); p.textContent = warning; p.style.cssText = 'overflow-wrap:anywhere;margin:6px 0'; details.append(p); }
    notice.append(details);
  }
  document.body.append(notice);
  window.setTimeout(() => { if (!notice.querySelector('details[open]')) notice.remove(); }, warnings.length ? 12000 : 2500);
  return notice;
};
