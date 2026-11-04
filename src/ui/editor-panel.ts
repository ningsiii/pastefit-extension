import { browserClipboardWriter, type ClipboardWriter } from '../clipboard/write';
import { copyText } from '../extension/workflow';
import { makePanelDraggable } from './draggable-panel';

type InsertOption = Readonly<{ label: string; value: string; close?: string }>;

export const commonSymbols: readonly InsertOption[] = [
  { label: '箭头', value: '→' },
  { label: '引用', value: '↳' },
  { label: '破折号', value: '—' },
  { label: '标题', value: '【', close: '】' },
  { label: '强调', value: '「', close: '」' },
  { label: '序号', value: '①' },
  { label: '勾选', value: '✓' }
];

export const numberedEmojis: readonly InsertOption[] = [
  { label: '序号 1', value: '1️⃣' },
  { label: '序号 2', value: '2️⃣' },
  { label: '序号 3', value: '3️⃣' },
  { label: '序号 4', value: '4️⃣' },
  { label: '序号 5', value: '5️⃣' },
  { label: '序号 6', value: '6️⃣' },
  { label: '序号 7', value: '7️⃣' },
  { label: '序号 8', value: '8️⃣' },
  { label: '序号 9', value: '9️⃣' },
  { label: '序号 10', value: '🔟' }
];

export const pointSymbols: readonly InsertOption[] = [
  { label: '实心圆点', value: '•' },
  { label: '空心圆点', value: '◦' },
  { label: '实心方点', value: '▪' },
  { label: '空心方点', value: '▫' },
  { label: '蓝色要点', value: '🔹' },
  { label: '橙色要点', value: '🔸' }
];

export const commonEmojis: readonly InsertOption[] = [
  { label: '完成', value: '✅' },
  { label: '提示', value: '📌' },
  { label: '想法', value: '💡' },
  { label: '注意', value: '⚠️' },
  { label: '附件', value: '📎' },
  { label: '重点', value: '⭐' },
  { label: '指向', value: '👉' },
  { label: '目标', value: '🎯' },
  { label: '勾选框', value: '☑️' },
  { label: '错误', value: '❌' },
  { label: '等待', value: '⏳' },
  { label: '位置', value: '📍' },
  { label: '重要提醒', value: '❗' },
  { label: '记录', value: '📝' },
  { label: '清单', value: '📋' },
  { label: '日程', value: '📅' },
  { label: '数据', value: '📊' },
  { label: '合作', value: '🤝' },
  { label: '微笑', value: '🙂' },
  { label: '开心', value: '😊' },
  { label: '大笑', value: '😄' },
  { label: '赞', value: '👍' },
  { label: '感谢', value: '🙏' },
  { label: '庆祝', value: '🎉' }
];

const insertOption = (textarea: HTMLTextAreaElement, symbol: InsertOption): void => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const insertion = `${symbol.value}${selected}${symbol.close ?? ''}`;
  textarea.setRangeText(insertion, start, end, 'end');
  if (symbol.close && !selected) {
    const cursor = start + symbol.value.length;
    textarea.setSelectionRange(cursor, cursor);
  }
  textarea.focus();
};

const style = (element: HTMLElement, css: Partial<CSSStyleDeclaration>): void => {
  Object.assign(element.style, css);
};

export const openEditorPanel = (initialValue: string, opener: HTMLElement, writer: ClipboardWriter = browserClipboardWriter): HTMLElement => {
  const existing = document.querySelector('[data-pastefit-editor-panel]');
  existing?.dispatchEvent(new Event('pastefit:dispose'));
  existing?.remove();

  const overlay = document.createElement('section');
  overlay.setAttribute('data-pastefit-editor-panel', 'true');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '编辑贴妥内容');
  style(overlay, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(760px,calc(100vw - 24px))', height: 'min(720px,calc(100vh - 24px))', boxSizing: 'border-box', zIndex: '2147483647', background: '#fff', color: '#111', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 16px 64px rgba(15,23,42,.25)' });

  let stopDragging = (): void => undefined;
  const close = (): void => { stopDragging(); overlay.remove(); opener.focus(); };

  const title = document.createElement('strong');
  title.textContent = '编辑后复制';
  const header = document.createElement('div');
  style(header, { display: 'flex', alignItems: 'center', justifyContent: 'space-between' });
  const closeButton = document.createElement('button');
  closeButton.type = 'button'; closeButton.textContent = '×'; closeButton.title = '关闭'; closeButton.setAttribute('aria-label', '关闭编辑器');
  style(closeButton, { border: '0', background: 'transparent', fontSize: '24px', lineHeight: '1', cursor: 'pointer', color: '#111' });
  closeButton.addEventListener('click', close); header.append(title, closeButton);
  const textarea = document.createElement('textarea');
  textarea.value = initialValue;
  textarea.setAttribute('aria-label', '将复制的纯文本');
  style(textarea, { flex: '1', minHeight: '180px', width: '100%', boxSizing: 'border-box', font: '14px/1.5 sans-serif' });

  const symbolBar = document.createElement('div');
  symbolBar.setAttribute('aria-label', '常用符号');
  for (const symbol of commonSymbols) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = symbol.close ? `${symbol.value}${symbol.close}` : symbol.value;
    button.title = symbol.label;
    button.setAttribute('aria-label', `插入${symbol.label}`);
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => insertOption(textarea, symbol));
    symbolBar.append(button);
  }

  const emojiBar = document.createElement('div');
  emojiBar.setAttribute('aria-label', '主动插入 Emoji');
  for (const emoji of commonEmojis) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = emoji.value;
    button.title = emoji.label;
    button.setAttribute('aria-label', `插入 Emoji：${emoji.label}`);
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => insertOption(textarea, emoji));
    emojiBar.append(button);
  }

  const optionBar = (label: string, options: readonly InsertOption[]): HTMLDivElement => {
    const bar = document.createElement('div'); bar.setAttribute('aria-label', label);
    for (const option of options) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = option.value;
      button.title = option.label; button.setAttribute('aria-label', `插入${option.label}`);
      button.addEventListener('pointerdown', (event) => event.preventDefault());
      button.addEventListener('click', () => insertOption(textarea, option)); bar.append(button);
    }
    return bar;
  };
  const numberBar = optionBar('数字序号', numberedEmojis);
  const pointBar = optionBar('点状符号', pointSymbols);

  const feedback = document.createElement('output');
  feedback.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  actions.append(copy);

  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    const result = await copyText(textarea.value, writer);
    feedback.value = result.ok ? result.message : '复制失败';
    copy.disabled = false;
  });

  overlay.append(header, textarea, symbolBar, numberBar, pointBar, emojiBar, feedback, actions);
  document.body.append(overlay);
  stopDragging = makePanelDraggable(overlay, header);
  textarea.focus();
  return overlay;
};
