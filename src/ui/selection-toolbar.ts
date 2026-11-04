import { captureSelection } from '../extension/capture-selection';
import { normalize } from '../extension/workflow';
import { writeDocument } from '../clipboard/rich';
import type { SemanticDocument } from '../core/semantic-document';
import { openRichEditor } from './rich-editor';
import { sites } from '../extension/site-settings';
import { brandImage } from './brand';

const marker = 'data-pastefit-selection-toolbar';
const excluded = 'input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],button,a,dialog,[data-pastefit-editor-panel]';
const elementOf = (node: Node): Element | null => node instanceof Element ? node : node.parentElement;
const hasFormatting = (doc: SemanticDocument): boolean => doc.children.some(block =>
  ['heading', 'list', 'table', 'quote'].includes(block.type) ||
  (block.type === 'paragraph' && block.children.some(inline => ['strong', 'emphasis', 'delete'].includes(inline.type))));

// Range rectangles include text clipped by nested scrolling containers. Anchor
// only to visible selected text, not the last logical line of a long code block.
const visibleAnchor = (range: Range): { left: number; bottom: number } | null => {
  let left = 0; let right = innerWidth; let top = 0; let bottom = innerHeight;
  for (let ancestor = elementOf(range.commonAncestorContainer); ancestor; ancestor = ancestor.parentElement) {
    const css = getComputedStyle(ancestor);
    const clipX = /^(auto|scroll|hidden|clip)$/.test(css.overflowX || css.overflow);
    const clipY = /^(auto|scroll|hidden|clip)$/.test(css.overflowY || css.overflow);
    if (!clipX && !clipY) continue;
    const bounds = ancestor.getBoundingClientRect();
    if (clipX) { left = Math.max(left, bounds.left); right = Math.min(right, bounds.right); }
    if (clipY) { top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom); }
  }
  if (left >= right || top >= bottom) return null;
  const rects = [...range.getClientRects()];
  for (let index = rects.length - 1; index >= 0; index--) {
    const rect = rects[index];
    if (rect.bottom <= top || rect.top >= bottom || rect.right <= left || rect.left >= right) continue;
    return { left: Math.max(left, rect.left), bottom: Math.min(bottom, rect.bottom) };
  }
  return null;
};

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
  style.textContent = ':host{color-scheme:light} .bar{box-sizing:border-box;max-width:calc(100vw - 16px);display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:5px;background:#fff;border:1px solid #dbe4ef;border-radius:10px;box-shadow:0 4px 18px #18202a22;font:13px/1.5 sans-serif;color:#18202a} button{font:inherit;border:0;border-radius:6px;padding:6px 8px;background:transparent;color:inherit;cursor:pointer} button:hover,button:focus-visible{background:#e7f0ff} button:focus-visible{outline:2px solid #0b66e4} button:disabled{opacity:.5} .primary{background:#0b66e4;color:#fff} .quiet{font-size:12px;color:#64748b} output{width:100%;max-width:280px;padding:0 6px}';
  const bar = document.createElement('div'); bar.className = 'bar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '贴妥选区操作');
  style.textContent += ' .bar{border-radius:16px;border-color:#dfe6f2;box-shadow:0 6px 24px #1e2c501c;padding:7px;gap:5px;color:#1e2c50}.primary{background:linear-gradient(120deg,#078af7,#0966df)}.primary:hover,.primary:focus-visible{background:#075ab9}button{border-radius:10px}button:focus-visible{outline-color:#ff9c29}';
  bar.append(brandImage(26));
  root.append(style, bar); document.body.append(host);
  let current: SemanticDocument | null = null;
  let sourceRange: Range | null = null;
  let sourceText = '';
  let timer = 0;
  let paused = false;
  let disposed = false;
  let generation = 0;
  const hide = (): void => {
    window.clearTimeout(timer); generation++; current = null; sourceRange = null; sourceText = '';
    host.style.display = 'none';
  };
  const valid = (): boolean => Boolean(sourceRange?.startContainer.isConnected && sourceRange.endContainer.isConnected && sourceRange.toString() === sourceText);
  const status = document.createElement('output'); status.setAttribute('role', 'status');
  const button = (label: string, action: () => void, className = ''): HTMLButtonElement => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.className = className;
    node.addEventListener('mousedown', event => event.preventDefault());
    node.addEventListener('click', action); bar.append(node); return node;
  };
  const copy = button('智能复制', () => {
    if (!current || !valid()) { hide(); return; }
    const doc = current; const version = generation; copy.disabled = true;
    void write(doc).then(() => { if (generation === version) status.textContent = '已贴妥'; }, () => {
      if (generation === version) status.textContent = '复制失败，请点编辑后重试';
    }).finally(() => { copy.disabled = false; });
  }, 'primary');
  button('编辑 / Emoji', () => {
    if (!current || !valid()) { hide(); return; }
    const doc = current; hide(); edit(doc);
  });
  button('本页停用', () => { paused = true; hide(); }, 'quiet').title = '本页不再弹出；刷新后恢复，右键仍可用';
  const close = button('×', hide, 'quiet'); close.setAttribute('aria-label', '关闭选区浮条');
  bar.append(status);
  const update = (): void => {
    if (disposed || paused || document.querySelector('dialog[open],[data-pastefit-editor-panel]')) return;
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
      const doc = normalize(input).document; if (!hasFormatting(doc)) return;
      const rect = visibleAnchor(range);
      if (!rect) return;
      current = doc; sourceRange = range.cloneRange(); sourceText = text; status.textContent = ''; copy.disabled = false;
      host.style.display = 'block';
      const size = host.getBoundingClientRect();
      host.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - size.width - 8))}px`;
      host.style.top = `${Math.max(8, Math.min(rect.bottom + 10, innerHeight - size.height - 8))}px`;
    } catch { hide(); }
  };
  const schedule = (): void => { hide(); if (!paused) timer = window.setTimeout(update, 180); };
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
    disposed = true; hide(); host.remove();
    document.removeEventListener('selectionchange', changed); document.removeEventListener('mousedown', down, true);
    document.removeEventListener('mouseup', up, true); document.removeEventListener('keyup', key, true);
    window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide);
  };
  host.addEventListener('pastefit:dispose', dispose, { once: true });
  return dispose;
};
