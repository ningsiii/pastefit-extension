import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountPasteFit } from '../../../src/integrations/chatgpt';

afterEach(() => { document.body.innerHTML = ''; vi.unstubAllGlobals(); });

describe('ChatGPT integration', () => {
  it('mounts exactly one button on assistant answers, not user messages', () => {
    document.body.innerHTML = '<article data-turn="assistant"><p>answer</p></article><article data-turn="user"><p>question</p></article>';
    mountPasteFit(); mountPasteFit();
    expect(document.querySelectorAll('[data-pastefit-button]').length).toBe(1);
    expect(document.querySelectorAll('[data-pastefit-edit-button]').length).toBe(1);
    expect(document.querySelector('article[data-turn="user"] button')).toBeNull();
  });

  it('opens an editor populated with the same formatted text used for copying', () => {
    document.body.innerHTML = '<article data-turn="assistant"><h2>标题</h2><p><strong>重点</strong></p></article>';
    mountPasteFit();
    (document.querySelector('[data-pastefit-edit-button]') as HTMLButtonElement).click();

    expect(document.querySelector('[data-pastefit-rich-editor] h2')).not.toBeNull();
    expect(document.querySelector('[role="textbox"]')?.innerHTML).toBe('<h2>标题</h2><p><strong>重点</strong></p>');
  });

  it('does not include action buttons in copied content', async () => {
    document.body.innerHTML = '<article data-turn="assistant"><p>answer</p><button>copy</button></article>';
    vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { write } });
    mountPasteFit();
    (document.querySelector('[data-pastefit-button]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    const blob = write.mock.calls[0][0][0].data['text/html'];
    const content = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(blob); });
    expect(content).toContain('answer');
    expect(content).not.toContain('copy');
  });
});
