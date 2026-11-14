import { copyFailureMessage } from '../clipboard/focus-retry';
import { documentHtmlAdapter } from '../adapters/document-html';
import { normalizeHtml } from '../core/normalize-html';
import type { SemanticDocument } from '../core/semantic-document';
import { getWpsFormulaPreference } from '../clipboard/formula-preference';
import { inspectDocument } from '../core/preflight';
import { mountFormulaSettings } from './formula-settings';
import { editorHistory } from './editor-history';
import { reviewedCopy as writeDocument } from '../clipboard/reviewed-copy';
import { createVisualReview } from './visual-review';
import { commonEmojis, commonSymbols, numberedEmojis, pointSymbols } from './editor-panel';
import { makePanelDraggable } from './draggable-panel';
import { brandImage } from './brand';
import { createFormulaTools } from './formula-tools';
import { confirmCopy, copyBlue } from './copy-feedback';

export const openRichEditor = (initial: SemanticDocument, write = writeDocument, initialGroup: 'symbols' | 'emoji' = 'symbols'): HTMLDialogElement => {
  const existing = document.querySelector('[data-pastefit-rich-editor]');
  existing?.dispatchEvent(new Event('pastefit:dispose'));
  existing?.remove();
  const opener = document.activeElement as HTMLElement | null;
  const panel = document.createElement('dialog');
  panel.dataset.pastefitRichEditor = 'true'; panel.setAttribute('aria-label', '贴妥编辑');
  panel.style.cssText = 'width:min(1100px,calc(100vw - 32px));height:min(820px,calc(100dvh - 32px));max-height:calc(100dvh - 32px);box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;padding:0;border:1px solid #cbd5e1;border-radius:14px;background:white;color:#18202a;box-shadow:0 16px 64px #0f172a40;font:16px/1.6 sans-serif;';
  let disposeHistory = (): void => undefined; let disposeSettings = (): void => undefined;
  let stopDragging = (): void => undefined;
  let feedbackTimer = 0;
  const close = (): void => { window.clearTimeout(feedbackTimer); stopDragging(); disposeHistory(); disposeSettings(); panel.remove(); opener?.focus(); };
  const title = document.createElement('h2'); title.textContent = '贴妥编辑'; title.style.cssText = 'margin:0;font-size:20px;font-weight:650;color:#1e2c50';
  const header = document.createElement('div'); header.style.cssText = 'flex:none;position:relative;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid #e2e8f0;background:#f8fbff';
  const closeButton = document.createElement('button'); closeButton.type = 'button'; closeButton.textContent = '×'; closeButton.title = '关闭'; closeButton.setAttribute('aria-label', '关闭编辑器');
  closeButton.style.cssText = 'border:0;background:transparent;color:#18202a;font:28px/1 sans-serif;padding:2px 6px;cursor:pointer'; closeButton.addEventListener('click', close);
  const identity = document.createElement('div'); identity.style.cssText = 'display:flex;align-items:center;gap:12px';
  const caption = document.createElement('div'); const tagline = document.createElement('small'); tagline.textContent = 'PasteFit · Fit to paste.'; tagline.style.cssText = 'display:block;color:#7182a0;font:12px/1.5 sans-serif';
  caption.append(title, tagline); identity.append(brandImage(42), caption); header.append(identity, closeButton);
  panel.style.borderRadius = '22px'; panel.style.borderColor = '#dfe6f2'; panel.style.background = '#f5f7fc';
  header.style.background = 'linear-gradient(115deg,#eef8ff,#fff 70%,#fff4e6)';
  const body = document.createElement('div'); body.style.cssText = 'display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;padding:12px 18px 16px;overflow:hidden';
  const editor = document.createElement('div'); editor.contentEditable = 'true';
  editor.setAttribute('role', 'textbox'); editor.setAttribute('aria-multiline', 'true'); editor.setAttribute('aria-label', '编辑内容（保留格式）');
  editor.style.cssText = 'border:1px solid #ccd9eb;border-radius:14px;padding:18px;flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;background:white;color:#18202a;outline-color:#0876ed;';
  editor.innerHTML = documentHtmlAdapter.render(initial).value;
  const initialHtml = editor.innerHTML;
  let wpsCompatible = false;
  const syncViews = (): void => {
    editor.hidden = Boolean(visual); editor.style.display = visual ? 'none' : 'block';
    toolbar.hidden = Boolean(visual); toolbar.style.display = visual ? 'none' : 'block';
    editorLabel.textContent = visual ? '隐藏字符检查' : '编辑内容';
  };
  let visual: ReturnType<typeof createVisualReview> | null = null;
  let reviewedHtml: string | null = null;
  const visualHost = document.createElement('div'); visualHost.hidden = true; visualHost.style.cssText = 'flex:1;min-height:0;overflow:auto;overscroll-behavior:contain';
  const currentDocument = (): SemanticDocument => visual ? visual.getDocument() : editor.innerHTML === initialHtml ? initial : normalizeHtml({ kind: 'html', content: editor.innerHTML }).document;
  const feedback = document.createElement('div'); feedback.setAttribute('role', 'status');
  let saved: Range | null = null;
  const remember = (): void => {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.getRangeAt(0).commonAncestorContainer)) saved = selection.getRangeAt(0).cloneRange();
  };
  editor.addEventListener('keyup', remember); editor.addEventListener('mouseup', remember); editor.addEventListener('input', remember);
  let refreshFormulas = (): void => undefined;
  const history = editorHistory(editor, () => { saved = null; remember(); reviewedHtml = null; refreshFormulas(); }); disposeHistory = history.dispose;
  editor.addEventListener('input', () => { reviewedHtml = null; refreshFormulas(); });
  const insert = (value: string, close?: string): void => {
    history.push(saved); editor.focus();
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
    range.collapse(true); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); saved = range.cloneRange(); refreshFormulas();
  };
  editor.addEventListener('paste', (event) => { event.preventDefault(); remember(); insert(event.clipboardData?.getData('text/plain') ?? ''); });
  editor.addEventListener('drop', (event) => { event.preventDefault(); });
  const button = (label: string, action: () => void): HTMLButtonElement => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.style.cssText = 'font:inherit;padding:7px 11px;margin:3px;border:1px solid #dfe6f2;border-radius:10px;background:linear-gradient(135deg,#fff,#f8fbff);color:#1e2c50;cursor:pointer';
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
      tab.style.background = active ? 'linear-gradient(120deg,#e1f6ff,#edf0ff)' : 'linear-gradient(135deg,#fff,#f8fbff)';
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
    const group = document.createElement('div'); group.id = id; group.setAttribute('role', 'tabpanel'); group.setAttribute('aria-label', label); group.style.cssText = 'display:flex;align-items:center;flex-wrap:wrap;gap:2px;flex-wrap:nowrap;overflow-x:auto;max-width:100%';
    for (const option of options) {
      const b = button(option.value + (option.close ?? ''), () => insert(option.value, option.close));
      b.setAttribute('aria-label', `插入${option.label}`); b.style.cssText += ';flex-shrink:0;padding:5px 8px;margin:2px';
      b.addEventListener('pointerdown', (event) => { remember(); event.preventDefault(); }); group.append(b);
    }
    tabButtons.push(tab); groupPanels.push(group); tabs.append(tab); groups.append(group);
  };
  addGroup('符号', '常用符号', commonSymbols);
  addGroup('序号', '数字序号', numberedEmojis);
  addGroup('要点', '点状符号', pointSymbols);
  addGroup('Emoji', '常见场景', commonEmojis);
  selectGroup(initialGroup === 'emoji' ? 3 : 0);
  toolbar.style.flex = 'none'; toolbar.style.padding = '6px 8px';
  tabs.style.marginBottom = '2px'; toolbar.append(tabs, groups);
  const headerActions = document.createElement('div'); headerActions.style.cssText = 'display:flex;align-items:center;gap:8px';
  const settings = document.createElement('div'); settings.hidden = true; settings.setAttribute('aria-label', '复制设置面板');
  settings.style.cssText = 'position:absolute;right:18px;top:calc(100% - 4px);width:min(320px,calc(100vw - 72px));max-height:calc(100dvh - 130px);overflow:auto;padding:16px;box-sizing:border-box;border:1px solid #dfe6f2;border-radius:12px;background:white;box-shadow:0 8px 24px #0f172a26';
  const settingsButton = button('复制设置', () => { settings.hidden = !settings.hidden; settingsButton.setAttribute('aria-expanded', String(!settings.hidden)); });
  settingsButton.setAttribute('aria-expanded', 'false');
  panel.addEventListener('pointerdown', event => { if (event.target instanceof Node && !settings.contains(event.target) && !settingsButton.contains(event.target)) { settings.hidden = true; settingsButton.setAttribute('aria-expanded', 'false'); } });
  headerActions.append(settingsButton, closeButton); header.append(headerActions, settings);
  const settingsReady = mountFormulaSettings(settings, { embedded: true, onChange: enabled => { wpsCompatible = enabled; } }).then(control => { if (!panel.isConnected) control.dispose(); else disposeSettings = control.dispose; return control; });
  const editorBar = document.createElement('div'); editorBar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none';
  const editorLabel = document.createElement('strong'); editorLabel.textContent = '编辑内容'; editorLabel.style.cssText = 'font:600 13px/1.5 sans-serif;color:#42536b';
  const copiedFeedback = (warnings: readonly string[]): void => {
    const result = document.createElement('span'); result.textContent = warnings.length ? '已复制 · 有格式提示' : '已复制';
    if (!warnings.length) result.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap';
    feedback.replaceChildren(result); feedback.title = warnings.join('\n');
    confirmCopy(documentCopy);
    feedbackTimer = window.setTimeout(() => { if (panel.isConnected) documentCopy.textContent = '贴妥智能复制'; }, 2000);
  };
  const actions = document.createElement('div');
  let copying = false;
  const copy = async (): Promise<void> => {
    if (copying) return; copying = true; window.clearTimeout(feedbackTimer); documentCopy.disabled = true; documentCopy.textContent = '复制中…';
    try {
      feedback.textContent = '';
      await (await settingsReady).flush();
      wpsCompatible = await getWpsFormulaPreference();
      if (!visual && reviewedHtml !== editor.innerHTML && inspectDocument(currentDocument(), 'auto').findings.some(finding => finding.suspicious)) {
        enterReview(); feedback.textContent = ''; documentCopy.textContent = '贴妥智能复制'; return;
      }
      const copyMode = wpsCompatible ? 'wps' : 'smart';
      const reviewed = Boolean(visual || reviewedHtml === editor.innerHTML);
      const warnings = write === writeDocument ? await writeDocument(currentDocument(), copyMode, undefined, reviewed, wpsCompatible) : await write(currentDocument(), copyMode);
      copiedFeedback(warnings ?? []);
    } catch (error) { documentCopy.textContent = '复制失败'; feedback.textContent = `复制失败：${copyFailureMessage(error)}`; }
    finally { copying = false; documentCopy.disabled = false; }
  };
  actions.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;flex:none';
  const enterReview = (): void => {
    visual = createVisualReview(currentDocument(), 'auto');
    visualHost.replaceChildren(visual.element); visualHost.hidden = false;
    const page = visualHost.querySelector<HTMLElement>('[data-pastefit-preview]')?.parentElement;
    if (page) { page.style.maxHeight = 'none'; page.style.overflow = 'visible'; }
    check.textContent = '返回编辑'; check.setAttribute('aria-pressed', 'true'); feedback.textContent = ''; syncViews();
  };
  const check = button('显示隐藏字符', () => {
    {
      if (visual) {
        history.push(saved); editor.innerHTML = documentHtmlAdapter.render(visual.getDocument()).value;
        reviewedHtml = editor.innerHTML; visual = null; visualHost.replaceChildren(); visualHost.hidden = true;
        editor.hidden = false; toolbar.hidden = false; check.textContent = '显示隐藏字符'; check.setAttribute('aria-pressed', 'false');
        saved = null; refreshFormulas(); feedback.textContent = '';
      } else {
        enterReview();
      }
    }
    syncViews();
  });
  check.setAttribute('aria-pressed', 'false');
  const documentCopy = button('贴妥智能复制', () => { void copy(); });
  documentCopy.setAttribute('aria-label', '贴妥智能复制');
  documentCopy.style.cssText += `;display:flex;align-items:center;justify-content:center;gap:6px;min-width:150px;border:0;border-radius:999px;background:${copyBlue};color:white;font-weight:650;padding:9px 18px;box-shadow:inset 0 1px 1px #ffffffb3,0 2px 5px #18202a12`;
  const formulaTools = createFormulaTools(feedback, editor); refreshFormulas = formulaTools.refresh;
  editorBar.append(editorLabel, check);
  actions.append(feedback, documentCopy);
  panel.addEventListener('cancel', (event) => { event.preventDefault(); if (!settings.hidden) { settings.hidden = true; settingsButton.setAttribute('aria-expanded', 'false'); settingsButton.focus(); } else close(); });
  feedback.style.cssText = 'min-width:0;font:13px/1.5 sans-serif;margin:0;color:#334155';
  body.append(toolbar, editorBar, editor, visualHost, formulaTools.element, actions); panel.append(header, body); document.body.append(panel);
  if (typeof panel.showModal === 'function') panel.showModal(); else panel.setAttribute('open', '');
  stopDragging = makePanelDraggable(panel, header);
  panel.addEventListener('pastefit:dispose', () => { window.clearTimeout(feedbackTimer); disposeHistory(); disposeSettings(); });
  editor.focus(); return panel;
};
