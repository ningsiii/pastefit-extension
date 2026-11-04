import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEditorPanel } from '../../../src/ui/editor-panel';

const opener = (): HTMLButtonElement => {
  const button = document.createElement('button');
  document.body.append(button);
  return button;
};

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('editor panel', () => {
  it('edits a local copy and inserts symbols at the current selection', () => {
    const panel = openEditorPanel('原文', opener(), { writeText: vi.fn() });
    const textarea = panel.querySelector('textarea') as HTMLTextAreaElement;
    const titleSymbol = [...panel.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '插入标题') as HTMLButtonElement;

    textarea.setSelectionRange(0, 2);
    titleSymbol.click();

    expect(textarea.value).toBe('【原文】');
    expect(document.body.textContent).not.toContain('原文');
  });

  it('does not write on close or Escape and restores opener focus', () => {
    const writeText = vi.fn();
    const button = opener();
    const panel = openEditorPanel('原文', button, { writeText });
    (panel.querySelector('textarea') as HTMLTextAreaElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(writeText).not.toHaveBeenCalled();
    expect(document.querySelector('[data-pastefit-editor-panel]')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('provides numbered and point symbols and closes from the top-right button', () => {
    const writeText = vi.fn();
    const button = opener();
    const panel = openEditorPanel('原文', button, { writeText });
    expect(panel.querySelector('[aria-label="数字序号"]')?.querySelectorAll('button')).toHaveLength(10);
    expect(panel.querySelector('[aria-label="点状符号"]')?.querySelectorAll('button')).toHaveLength(6);
    expect(panel.querySelector('[aria-label="插入序号 6"]')).not.toBeNull();
    expect([...panel.querySelectorAll('button')].some((item) => item.textContent === '取消')).toBe(false);
    (panel.querySelector('[aria-label="关闭编辑器"]') as HTMLButtonElement).click();
    expect(writeText).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });

  it('moves the legacy editor from its title bar without persisting a position', () => {
    vi.stubGlobal('innerWidth', 900); vi.stubGlobal('innerHeight', 700);
    const button = opener();
    const panel = openEditorPanel('原文', button, { writeText: vi.fn() });
    panel.getBoundingClientRect = vi.fn(() => ({ left: 120, top: 90, width: 500, height: 400, right: 620, bottom: 490, x: 120, y: 90, toJSON: () => ({}) } as DOMRect));
    const header = panel.querySelector('[data-pastefit-drag-handle]') as HTMLElement;
    header.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 150, clientY: 110 }));
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    expect(panel.style.left).toBe('8px');
    expect(panel.style.top).toBe('8px');
    (panel.querySelector('[aria-label="关闭编辑器"]') as HTMLButtonElement).click();

    const reopened = openEditorPanel('原文', button, { writeText: vi.fn() });
    expect(reopened.style.left).toBe('50%');
    expect(reopened.style.top).toBe('50%');
    expect(reopened.style.transform).toContain('translate');
  });

  it('inserts an explicitly selected Emoji at the current selection only', () => {
    const panel = openEditorPanel('开始结束', opener(), { writeText: vi.fn() });
    const textarea = panel.querySelector('textarea') as HTMLTextAreaElement;
    const pin = [...panel.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === '插入 Emoji：提示') as HTMLButtonElement;

    textarea.setSelectionRange(2, 2);
    pin.click();

    expect(textarea.value).toBe('开始📌结束');
    expect([...panel.querySelectorAll('[aria-label^="插入 Emoji"]')]).toHaveLength(24);
  });

  it('copies the edited textarea value and shows feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const panel = openEditorPanel('原文', opener(), { writeText });
    const textarea = panel.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = '用户编辑后的内容';
    const copy = [...panel.querySelectorAll('button')].find((button) => button.textContent === '复制') as HTMLButtonElement;
    copy.click();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('用户编辑后的内容'));
    await vi.waitFor(() => expect((panel.querySelector('output') as HTMLOutputElement).value).toBe('已贴妥'));
  });

  it('shows an error without closing when clipboard writing fails', async () => {
    const panel = openEditorPanel('原文', opener(), { writeText: async () => { throw new Error('NotAllowedError'); } });
    const copy = [...panel.querySelectorAll('button')].find((button) => button.textContent === '复制') as HTMLButtonElement;
    copy.click();

    await vi.waitFor(() => expect((panel.querySelector('output') as HTMLOutputElement).value).toBe('复制失败'));
    expect(document.querySelector('[data-pastefit-editor-panel]')).toBe(panel);
  });
});
