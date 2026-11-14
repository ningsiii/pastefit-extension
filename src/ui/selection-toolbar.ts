import { copyFailureMessage } from '../clipboard/focus-retry';
import { visibleSelectionAnchor } from './selection-geometry';
import { copyNotice } from './copy-notice';
import { captureSelection } from '../extension/capture-selection';
import { normalize } from '../extension/workflow';
import { reviewedCopy as writeDocument, CopyCancelled } from '../clipboard/reviewed-copy';
import type { SemanticDocument } from '../core/semantic-document';
import { openRichEditor } from './rich-editor';
import { sites } from '../extension/site-settings';
import { confirmCopy, copyBlue } from './copy-feedback';

const marker = 'data-pastefit-selection-toolbar';
const excluded = 'input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],button,a,dialog,[data-pastefit-editor-panel]';
const elementOf = (node: Node): Element | null => node instanceof Element ? node : node.parentElement;

export const mountSelectionToolbar = (
  write = writeDocument,
  edit: (doc: SemanticDocument) => unknown = doc => openRichEditor(doc, writeDocument, 'emoji')
): (() => void) => {
  const response = sites.find(site => site.host === location.hostname)?.selector;
  document.querySelector(`[${marker}]`)?.dispatchEvent(new Event('pastefit:dispose'));
  const host = document.createElement('div'); host.setAttribute(marker, 'true');
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483646;display:none;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:light}
    .bar{box-sizing:border-box;max-width:calc(100vw - 16px);display:flex;flex-wrap:wrap;align-items:center;gap:0;font:12px/1.5 sans-serif;color:#18202a}
    .actions{position:relative;display:flex;overflow:hidden;border-radius:999px;background:#fffffff5;backdrop-filter:blur(8px);filter:drop-shadow(0 2px 5px #18202a12)}
    .actions::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:inset 0 1px 1px #ffffffb3,inset 0 -1px 1px #ffffff40;background:linear-gradient(180deg,#ffffff26,transparent 35%,transparent 75%,#ffffff0d)}
    button{display:flex;align-items:center;justify-content:center;box-sizing:border-box;min-height:28px;font:inherit;font-weight:600;border:0;padding:4px 12px;cursor:pointer;white-space:nowrap;text-shadow:0 1px 2px #24416b66}
    button:focus-visible{outline:2px solid #18202a;outline-offset:-3px}
    button:disabled{opacity:.5}
    .primary,.edit{width:80px;flex:0 0 80px}
    .primary{gap:4px;padding:4px 8px;background:${copyBlue};color:#fff;padding-right:17px;clip-path:polygon(0 0,100% 0,calc(100% - 10px) 100%,0 100%)}
    .primary:hover{filter:brightness(1.04)}
    .edit{background:linear-gradient(115deg,#fff3d2aa 0%,#fff6be18 45%,#ffffff20 100%),linear-gradient(145deg,#ffe580e6 0%,#ffb12ce6 33%,#ff891ae6 70%,#ff5d32e6 100%);color:#fff;padding-left:17px;margin-left:-8px;clip-path:polygon(10px 0,100% 0,100% 100%,0 100%)}
    .edit:hover{filter:brightness(1.04)}
    .quiet{min-width:24px;min-height:24px;margin-left:3px;padding:2px 6px;border-radius:50%;background:transparent;color:#64748b;text-shadow:none;opacity:0;visibility:hidden;transition:opacity .12s}
    .bar:hover .quiet,.bar:focus-within .quiet{opacity:1;visibility:visible}
    .quiet:hover{background:#e9edf5cc}
    output{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    @media(hover:none){.quiet{opacity:1;visibility:visible}}
    @media(prefers-reduced-motion:reduce){.quiet{transition:none}}
  `;
  const bar = document.createElement('div'); bar.className = 'bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '贴妥选区操作');
  const actions = document.createElement('div'); actions.className = 'actions';
  bar.append(actions); root.append(style, bar); document.body.append(host);
  let current: SemanticDocument | null = null;
  let sourceRange: Range | null = null;
  let sourceText = '';
  let timer = 0;
  let disposed = false;
  let generation = 0;
  let feedbackTimer = 0;
  let placement: { left: number; top: number } | null = null;
  const hide = (): void => {
    window.clearTimeout(timer); window.clearTimeout(feedbackTimer); generation++; current = null; sourceRange = null; sourceText = '';
    placement = null; host.style.display = 'none';
  };
  const valid = (): boolean => Boolean(sourceRange?.startContainer.isConnected && sourceRange.endContainer.isConnected && sourceRange.toString() === sourceText);
  const status = document.createElement('output'); status.setAttribute('role', 'status');
  const button = (label: string, action: () => void, className = ''): HTMLButtonElement => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.className = className;
    node.addEventListener('mousedown', event => event.preventDefault());
    node.addEventListener('click', action); bar.append(node); return node;
  };
  const copy = button('复制', () => {
    if (!current || !valid()) { hide(); return; }
    const doc = current; const version = generation; window.clearTimeout(feedbackTimer); copy.disabled = true; copy.textContent = '复制中…';
    void write(doc).then((warnings) => { if (generation === version) { status.textContent = '已复制'; confirmCopy(copy); feedbackTimer = window.setTimeout(() => { if (generation === version) copy.textContent = '复制'; }, 2000); if (warnings?.length) copyNotice(warnings); } }, (error: unknown) => {
      if (generation === version) {
        status.textContent = error instanceof CopyCancelled ? error.message : `复制失败：${copyFailureMessage(error)}`;
        copy.textContent = error instanceof CopyCancelled ? '已取消' : '复制失败';
        copy.title = status.textContent;
      }
    }).finally(() => { if (generation === version) copy.disabled = false; });
  }, 'primary');
  copy.title = '贴妥智能复制'; copy.setAttribute('aria-label', '贴妥智能复制');
  const editButton = button('编辑', () => {
    if (!current || !valid()) { hide(); return; }
    const doc = current; hide(); edit(doc);
  }, 'edit');
  editButton.title = '编辑内容、添加符号与 Emoji'; editButton.setAttribute('aria-label', '贴妥编辑');
  actions.append(copy, editButton);
  const close = button('×', hide, 'quiet'); close.setAttribute('aria-label', '关闭选区浮条');
  bar.append(status);
  // Reserve the entire bar, including the normally invisible close button.
  // Never hide or intercept the page's own selection tools.
  const position = (): void => {
    if (!current || !sourceRange || !valid()) return;
    const anchor = visibleSelectionAnchor(sourceRange);
    if (!anchor) { host.style.display = 'none'; return; }
    host.style.display = 'block';
    const size = host.getBoundingClientRect();
    const obstacles = [...document.querySelectorAll('button,[role="button"],[role="toolbar"],[role="menu"],[role="dialog"]')]
      .filter(node => node !== host && !host.contains(node))
      .filter(node => { const css = getComputedStyle(node); return css.display !== 'none' && css.visibility !== 'hidden'; })
      .map(node => node.getBoundingClientRect())
      .filter(rect => rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth);
    const clear = (left: number, top: number): boolean => left >= 8 && left + size.width <= innerWidth - 8 && top >= 8 && top + size.height <= innerHeight - 8 && !obstacles.some(rect => left < rect.right + 6 && left + size.width > rect.left - 6 && top < rect.bottom + 6 && top + size.height > rect.top - 6);
    // Keep a safe placement for this selection. Native hover tools may vanish
    // as the pointer approaches us; snapping back would move the button away
    // between pointerdown and click.
    if (placement && clear(placement.left, placement.top)) return;
    const maxLeft = innerWidth - size.width - 8;
    const preferredLeft = Math.max(8, Math.min(anchor.left, maxLeft));
    const xs = [preferredLeft, ...obstacles.flatMap(rect => [rect.right + 8, rect.left - size.width - 8])]
      .filter(x => x >= 8 && x <= maxLeft).sort((a, b) => Math.abs(a - preferredLeft) - Math.abs(b - preferredLeft));
    for (const top of [anchor.top - size.height - 8, anchor.bottom + 8]) {
      if (top < 8 || top + size.height > innerHeight - 8) continue;
      for (const left of xs) {
        if (obstacles.some(rect => left < rect.right + 6 && left + size.width > rect.left - 6 && top < rect.bottom + 6 && top + size.height > rect.top - 6)) continue;
        placement = { left, top }; host.style.left = `${left}px`; host.style.top = `${top}px`; return;
      }
    }
    // Crowded viewports keep native controls usable; right-click remains available.
    host.style.display = 'none';
  };
  let layoutTimer = 0;
  const observer = new MutationObserver(records => {
    if (!current || records.every(record => record.target === host || host.contains(record.target))) return;
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(position, 30);
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  const update = (): void => {
    if (disposed || document.querySelector('dialog[open],[data-pastefit-editor-panel]')) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return;
    const range = selection.getRangeAt(0);
    const start = elementOf(range.startContainer); const end = elementOf(range.endContainer);
    if (!start || !end || start.closest(excluded) || end.closest(excluded) || document.activeElement?.closest(excluded)) return;
    const answer = response ? start.closest(response) : null;
    if (response && (!answer || !answer.contains(range.endContainer))) return;
    const text = range.toString(); if (text.trim().length < 2 || text.length > 50000) return;
    // Endpoint checks alone would allow a selection spanning an embedded editor.
    if (range.cloneContents().querySelector(excluded)) return;
    try {
      const input = captureSelection(); if (!input) return;
      const doc = normalize(input).document;
      const rect = visibleSelectionAnchor(range);
      if (!rect) return;
      current = doc; sourceRange = range.cloneRange(); sourceText = text; status.textContent = ''; copy.disabled = false; copy.textContent = '复制'; copy.title = '贴妥智能复制';
      position();
    } catch { hide(); }
  };
  const schedule = (): void => { hide(); timer = window.setTimeout(update, 180); };
  // A browser may deliver selectionchange after mouseup. The pending update
  // reads the latest selection; only dismiss an already displayed snapshot.
  const changed = (): void => { if (current && document.activeElement !== host) hide(); };
  const down = (event: Event): void => { if (!event.composedPath().includes(host)) hide(); };
  const up = (event: Event): void => { if (!event.composedPath().includes(host)) schedule(); };
  const key = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hide();
    else if ((event.shiftKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) ||
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) schedule();
  };
  document.addEventListener('selectionchange', changed);
  document.addEventListener('mousedown', down, true);
  document.addEventListener('mouseup', up, true);
  document.addEventListener('keyup', key, true);
  window.addEventListener('scroll', hide, true); window.addEventListener('resize', hide); window.addEventListener('blur', hide);
  const dispose = (): void => {
    disposed = true; observer.disconnect(); window.clearTimeout(layoutTimer); hide(); host.remove();
    document.removeEventListener('selectionchange', changed); document.removeEventListener('mousedown', down, true);
    document.removeEventListener('mouseup', up, true); document.removeEventListener('keyup', key, true);
    window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide);
  };
  host.addEventListener('pastefit:dispose', dispose, { once: true });
  return dispose;
};
