import { documentHtmlAdapter } from '../adapters/document-html';
import { normalizeHtml } from '../core/normalize-html';
import type { SemanticDocument } from '../core/semantic-document';
import { writeDocument, type CopyMode } from '../clipboard/rich';
import { commonEmojis, commonSymbols, numberedEmojis, pointSymbols } from './editor-panel';
import { makePanelDraggable } from './draggable-panel';
import { brandImage } from './brand';

export const openRichEditor = (initial: SemanticDocument, write = writeDocument, initialGroup: 'symbols' | 'emoji' = 'symbols'): HTMLDialogElement => {
  const existing = document.querySelector('[data-pastefit-rich-editor]');
  existing?.dispatchEvent(new Event('pastefit:dispose'));
  existing?.remove();
  const opener = document.activeElement as HTMLElement | null;
  const panel = document.createElement('dialog');
  panel.dataset.pastefitRichEditor = 'true'; panel.setAttribute('aria-label', '贴妥编辑');
  panel.style.cssText = 'width:min(760px,calc(100vw - 24px));max-height:calc(100vh - 24px);box-sizing:border-box;overflow:auto;padding:0;border:1px solid #cbd5e1;border-radius:14px;background:white;color:#18202a;box-shadow:0 16px 64px #0f172a40;font:16px/1.6 sans-serif;';
  let stopDragging = (): void => undefined;
  const close = (): void => { stopDragging(); panel.remove(); opener?.focus(); };
  const title = document.createElement('h2'); title.textContent = '贴妥编辑'; title.style.cssText = 'margin:0;font-size:20px;font-weight:650;color:#1e2c50';
  const header = document.createElement('div'); header.style.cssText = 'position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid #e2e8f0;background:#f8fbff';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×'; closeButton.title = '关闭'; closeButton.setAttribute('aria-label', '关闭编辑器');
  closeButton.style.cssText = 'border:0;background:transparent;color:#18202a;font:28px/1 sans-serif;padding:2px 6px;cursor:pointer'; closeButton.addEventListener('click', close);
  const identity = document.createElement('div'); identity.style.cssText = 'display:flex;align-items:center;gap:12px';
  const caption = document.createElement('div'); const tagline = document.createElement('small'); tagline.textContent = 'PasteFit · Fit to paste.'; tagline.style.cssText = 'display:block;color:#7182a0;font:12px/1.5 sans-serif';
  caption.append(title, tagline); identity.append(brandImage(42), caption); header.append(identity, closeButton);
  panel.style.borderRadius = '22px'; panel.style.borderColor = '#dfe6f2'; panel.style.background = '#f5f7fc';
  header.style.background = 'linear-gradient(115deg,#eef8ff,#fff 70%,#fff4e6)';
  const hint = document.createElement('p'); hint.textContent = '可修改正文、插入符号和 Emoji。智能复制同时提供聊天文字和文档格式。'; hint.style.cssText = 'margin:0;color:#5b6572';
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:16px 18px 18px';
  const editor = document.createElement('div'); editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-multiline', 'true'); editor.setAttribute('aria-label', '编辑内容（保留格式）');
  editor.style.cssText = 'border:1px solid #ccd9eb;border-radius:14px;padding:18px;min-height:200px;max-height:45vh;overflow:auto;white-space:pre-wrap;background:white;color:#18202a;outline-color:#0876ed;';
  editor.innerHTML = documentHtmlAdapter.render(initial).value;
  const feedback = document.createElement('p'); feedback.setAttribute('role', 'status');
  let saved: Range | null = null;
  const remember = (): void => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) saved = selection.getRangeAt(0).cloneRange();
  };
  editor.addEventListener('keyup', remember); editor.addEventListener('mouseup', remember); editor.addEventListener('input', remember);
  const history: string[] = [];
  editor.addEventListener('input', () => { history.length = 0; });
  const insert = (value: string, close?: string): void => {
    history.push(editor.innerHTML); editor.focus();
    const range = saved && editor.contains(saved.commonAncestorContainer) ? saved : document.createRange();
    if (range !== saved) { range.selectNodeContents(editor); range.collapse(false); }
    if (close) {
      const fragment = range.extractContents();
      const opening = document.createTextNode(value); const ending = document.createTextNode(close);
      const content = document.createDocumentFragment(); content.append(opening, fragment, ending);
      range.insertNode(content); range.setStartBefore(ending);
    } else {
      range.deleteContents(); const text = document.createTextNode(value); range.insertNode(text); range.setStartAfter(text);
    }
    range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); saved = range.cloneRange();
  };
  editor.addEventListener('paste', (event) => { event.preventDefault(); remember(); insert(event.clipboardData?.getData('text/plain') ?? ''); });
  editor.addEventListener('drop', (event) => { event.preventDefault(); });
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'font:inherit;padding:7px 11px;margin:3px;border:1px solid #dfe6f2;border-radius:10px;background:#fff;color:#1e2c50;cursor:pointer';
    b.addEventListener('click', action); return b;
  };
  const toolbar = document.createElement('div'); toolbar.setAttribute('aria-label', '符号与 Emoji'); toolbar.style.cssText = 'border:1px solid #dfe6f2;border-radius:14px;background:white;padding:10px';
  const tabs = document.createElement('div'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '插入内容分类'); tabs.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px';
  const groups = document.createElement('div');
  const tabButtons: HTMLButtonElement[] = [];
  const groupPanels: HTMLDivElement[] = [];
  const selectGroup = (index: number): void => {
    tabButtons.forEach((tab, tabIndex) => {
      const active = tabIndex === index;
      tab.setAttribute('aria-selected', String(active));
      tab.style.background = active ? '#e7f0ff' : '#fff';
      tab.style.borderColor = active ? '#0b66e4' : '#cbd5e1';
      tab.style.color = active ? '#084da9' : '#334155';
      groupPanels[tabIndex].hidden = !active;
      groupPanels[tabIndex].style.display = active ? 'flex' : 'none';
    });
  };
  const addGroup = (tabLabel: string, label: string, options: typeof commonSymbols): void => {
    const index = groupPanels.length;
    const id = `pastefit-insert-group-${index}`;
    const tab = button(tabLabel, () => selectGroup(index)); tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', id);
    const group = document.createElement('div'); group.id = id; group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-label', label); group.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:2px';
    for (const option of options) {
      const b = button(option.value + (option.close ?? ''), () => insert(option.value, option.close));
      b.setAttribute('aria-label', `插入${option.label}`);
      b.addEventListener('pointerdown', (event) => { remember(); event.preventDefault(); }); group.append(b);
    }
    tabButtons.push(tab); groupPanels.push(group); tabs.append(tab); groups.append(group);
  };
  addGroup('符号', '常用符号', commonSymbols);
  addGroup('序号', '数字序号', numberedEmojis);
  addGroup('要点', '点状符号', pointSymbols);
  addGroup('Emoji', '常见场景', commonEmojis);
  selectGroup(initialGroup === 'emoji' ? 3 : 0);
  const undo = button('撤销插入', () => { const previous = history.pop(); if (previous !== undefined) { editor.innerHTML = previous; saved = null; editor.focus(); } });
  undo.style.marginLeft = 'auto'; tabs.append(undo); toolbar.append(tabs, groups);
  const actions = document.createElement('div');
  const copy = async (mode: CopyMode): Promise<void> => {
    const buttons = [...actions.querySelectorAll('button')]; buttons.forEach((b) => { b.disabled = true; });
    try {
      await write(normalizeHtml({ kind: 'html', content: editor.innerHTML }).document, mode);
      feedback.textContent = mode === 'chat' ? '已复制聊天文字' : '已贴妥，可粘贴到微信或 Word';
    } catch { feedback.textContent = '复制失败。请保持页面聚焦后重试，或选择另一种复制方式。'; }
    finally { buttons.forEach((b) => { b.disabled = false; }); }
  };
  actions.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
  const chatCopy = button('仅复制聊天文字', () => { void copy('chat'); });
  const documentCopy = button('贴妥智能复制', () => { void copy('smart'); });
  documentCopy.style.cssText += ';background:linear-gradient(120deg,#078af7,#0966df);border-color:#0876ed;color:white;font-weight:650;padding-inline:18px';
  actions.append(chatCopy, documentCopy);
  panel.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  feedback.style.cssText = 'min-height:1.6em;margin:0;color:#334155';
  body.append(hint, toolbar, editor, feedback, actions); panel.append(header, body); document.body.append(panel);
  if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open', '');
  stopDragging = makePanelDraggable(panel, header);
  editor.focus(); return panel;
};
