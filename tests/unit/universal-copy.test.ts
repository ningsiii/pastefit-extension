import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';
import { normalizeHtml } from '../../src/core/normalize-html';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { wechatAdapter } from '../../src/adapters/text-adapter';
import { writeDocument } from '../../src/clipboard/rich';
import { openRichEditor } from '../../src/ui/rich-editor';

afterEach(() => { document.body.innerHTML = ''; window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });
const select = (node: Node, start = 0, end = node.textContent!.length): void => {
  const range = document.createRange(); range.setStart(node, start); range.setEnd(node, end);
  window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range);
};
const html = (source: string): string => documentHtmlAdapter.render(normalizeHtml({ kind: 'html', content: source }).document).value;

describe('universal rich copy', () => {
  it('preserves ordered numbering when only a later list item is selected', () => {
    document.body.innerHTML = '<ol start="3"><li>first</li><li><strong>second</strong></li></ol>';
    select(document.querySelector('strong')!.firstChild!);
    expect(documentHtmlAdapter.render(normalize(captureSelection()!).document).value).toContain('<ol start="4">');
  });
  it('does not capture sibling items through ChatGPT-like wrapper elements', () => {
    document.body.innerHTML = '<main><article><div><ol start="3"><li><p>third</p></li><li><p>fourth <strong>selected</strong></p></li><li><p>fifth</p></li></ol></div></article></main>';
    select(document.querySelector('strong')!.firstChild!);
    const result = documentHtmlAdapter.render(normalize(captureSelection()!).document).value;
    expect(result).toContain('<ol start="4">');
    expect(result).toContain('<strong>selected</strong>');
    expect(result).not.toContain('third');
    expect(result).not.toContain('fifth');
  });
  it('preserves a partially selected strong ancestor without copying neighbours', () => {
    document.body.innerHTML = '<h2>outside <strong>ABCDEF</strong></h2><p>private neighbour</p>';
    select(document.querySelector('strong')!.firstChild!, 1, 4);
    const input = captureSelection()!;
    expect(input.kind).toBe('html');
    expect(documentHtmlAdapter.render(normalize(input).document).value).toBe('<h2><strong>BCD</strong></h2>');
  });
  it('resolves relative links and captures only selected input text', () => {
    document.body.innerHTML = '<a href="/guide">read</a><textarea>**bold** private</textarea>';
    select(document.querySelector('a')!.firstChild!);
    expect(captureSelection()!.content).toContain(new URL('/guide', document.baseURI).href);
    const area = document.querySelector('textarea')!; area.focus(); area.setSelectionRange(0, 8);
    expect(captureSelection()).toEqual({ kind: 'markdown', content: '**bold**' });
  });
  it('keeps list inline order, nested emphasis and tables through HTML normalization', () => {
    const result = html('<ul><li>before <strong>bold</strong> after<ul><li><em>child</em></li></ul></li></ul><table><tr><th>A</th></tr><tr><td>42</td></tr></table>');
    expect(result).toContain('<li>before <strong>bold</strong> after<ul>');
    expect(result).toContain('<em>child</em>'); expect(result).toContain('>42</td>');
  });
  it('keeps every data cell when a cross-block selection ends inside a ChatGPT-style table', () => {
    document.body.innerHTML = `<article>
      <p>这是 <strong>原始粗体内容</strong>。</p>
      <ul><li>第一项</li><li>第二项</li></ul>
      <p>表格：</p>
      <div class="table-wrapper"><table><thead><tr><th><span>字段</span></th><th><span>内容</span></th></tr></thead>
      <tbody><tr><td><div aria-hidden="true">Name</div></td><td><div aria-hidden="true">PasteFit</div><button>复制</button></td></tr>
      <tr><td><div aria-hidden="true">Mode</div><span hidden>内部文本</span></td><td><div aria-hidden="true">Smart Copy</div><script>secret()</script></td></tr></tbody></table></div>
    </article>`;
    const start = document.querySelector('strong')!.firstChild!;
    const end = [...document.querySelectorAll('td')].at(-1)!.querySelector('div')!.firstChild!;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent!.length);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);

    const input = captureSelection()!;
    expect(input.kind).toBe('html');
    const semanticDocument = normalize(input).document;
    const result = documentHtmlAdapter.render(semanticDocument).value;
    const chat = wechatAdapter.render(semanticDocument).value;
    expect(result).toContain('<th');
    for (const value of ['字段', '内容', 'Name', 'PasteFit', 'Mode', 'Smart Copy']) {
      expect(result).toContain(value);
      expect(chat).toContain(value);
    }
    expect(result).not.toContain('复制');
    expect(result).not.toContain('内部文本');
    expect(result).not.toContain('secret');
  });
  it('restores selected source cells when Range cloning returns empty data cells', () => {
    document.body.innerHTML = `<article><p>开始</p><table><thead><tr><th>字段</th><th>内容</th></tr></thead><tbody>
      <tr><td>Name</td><td>PasteFit<button>复制</button></td></tr><tr><td>Mode</td><td>Smart Copy</td></tr>
    </tbody></table><p>结束</p></article>`;
    const start = document.querySelector('p')!.firstChild!;
    const end = [...document.querySelectorAll('td')].at(-1)!.firstChild!;
    const range = document.createRange(); range.setStart(start, 0); range.setEnd(end, end.textContent!.length);
    const nativeClone = range.cloneContents.bind(range);
    vi.spyOn(range, 'cloneContents').mockImplementation(() => {
      const fragment = nativeClone();
      fragment.querySelectorAll('td').forEach((cell) => cell.replaceChildren());
      return fragment;
    });
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);

    const result = documentHtmlAdapter.render(normalize(captureSelection()!).document).value;
    for (const value of ['Name', 'PasteFit', 'Mode', 'Smart Copy']) expect(result).toContain(value);
    expect(result).not.toContain('复制');
  });
  it('does not restore unselected rows from a partially selected table', () => {
    document.body.innerHTML = '<table><tbody><tr><td>Selected A</td><td>Selected B</td></tr><tr><td>Private C</td><td>Private D</td></tr></tbody></table>';
    const first = document.querySelector('td')!.firstChild!;
    const second = document.querySelectorAll('td')[1].firstChild!;
    const range = document.createRange(); range.setStart(first, 0); range.setEnd(second, second.textContent!.length);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);

    const result = documentHtmlAdapter.render(normalize(captureSelection()!).document).value;
    expect(result).toContain('Selected A'); expect(result).toContain('Selected B');
    expect(result).not.toContain('Private C'); expect(result).not.toContain('Private D');
  });
  it('drops active HTML and dangerous links; escapes code and does not embed remote images', () => {
    const result = html('<p><script>alert(1)</script><a href="javascript:alert(1)">safe label</a><img src="https://example.com/i" onerror="bad()" alt="image"></p><pre>&lt;script&gt;literal&lt;/script&gt;</pre>');
    expect(result).not.toMatch(/<script|javascript:|onerror|<img/);
    expect(result).toContain('safe label'); expect(result).toContain('&lt;script&gt;literal&lt;/script&gt;');
  });
  it('writes only plain text for the explicit chat fallback', async () => {
    const writer = { writeText: vi.fn().mockResolvedValue(undefined), write: vi.fn() };
    await writeDocument(normalize({ kind: 'markdown', content: '**bold**' }).document, 'chat', writer);
    expect(writer.writeText).toHaveBeenCalledWith('「bold」');
    expect(writer.write).not.toHaveBeenCalled();
  });
  it('keeps the ClipboardItem HTML as a fragment for Chrome to wrap once', () => {
    const result = html('<p>before</p><table><tr><td>PasteFit</td></tr></table>');
    expect(result).toContain('<p>before</p><table');
    expect(result).not.toMatch(/<!doctype|<html|<body|StartFragment|EndFragment/i);
  });
  it('uses the flat Word-compatible table shape and direct cell text', () => {
    const result = html('<table><tr><th>字段</th><th>内容</th></tr><tr><td>Name</td><td>PasteFit</td></tr></table>');
    expect(result).toContain('<table border="1" cellspacing="0" cellpadding="4"');
    expect(result).not.toMatch(/<thead|<tbody/i);
    expect(result).toContain('<th style="border:1px solid #888;padding:4px 8px;vertical-align:top">字段</th>');
    expect(result).toContain('<td style="border:1px solid #888;padding:4px 8px;vertical-align:top">PasteFit</td>');
  });
  it('does not silently fall back when dual-format copying is rejected', async () => {
    vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
    const writer = { writeText: vi.fn(), write: vi.fn().mockRejectedValue(new Error('denied')) };
    await expect(writeDocument(normalize({ kind: 'markdown', content: '**bold**' }).document, 'smart', writer)).rejects.toThrow('denied');
    expect(writer.writeText).not.toHaveBeenCalled();
  });
  it('edits a rich local copy, inserts Emoji at the selection and copies retained structure', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    const panel = openRichEditor(normalizeHtml({ kind: 'html', content: '<h2>Title</h2><p><strong>bold</strong> tail</p>' }).document, write);
    const editor = panel.querySelector('[role="textbox"]')!;
    const text = editor.querySelector('strong')!.firstChild!; select(text, 0, 0);
    editor.dispatchEvent(new MouseEvent('mouseup'));
    (panel.querySelector('[aria-label="插入提示"]') as HTMLButtonElement).click();
    expect(editor.querySelector('strong')!.textContent).toBe('📌bold');
    [...panel.querySelectorAll('button')].find((b) => b.textContent === '贴妥智能复制')!.click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    expect(documentHtmlAdapter.render(write.mock.calls[0][0]).value).toContain('<strong>📌bold</strong>');
    expect(documentHtmlAdapter.render(write.mock.calls[0][0]).value).toContain('<h2>Title</h2>');
  });
  it('offers numbered, point and common-scene insert groups', () => {
    const panel = openRichEditor(normalize({ kind: 'markdown', content: 'text' }).document, vi.fn());
    expect(panel.querySelector('[aria-label="数字序号"]')?.querySelectorAll('button')).toHaveLength(10);
    expect(panel.querySelector('[aria-label="点状符号"]')?.querySelectorAll('button')).toHaveLength(6);
    expect(panel.querySelector('[aria-label="常见场景"]')?.querySelectorAll('button')).toHaveLength(24);
    expect(panel.querySelector('[aria-label="插入序号 1"]')).not.toBeNull();
    expect(panel.querySelector('[aria-label="插入实心圆点"]')).not.toBeNull();
    const tabs = [...panel.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['符号', '序号', '要点', 'Emoji']);
    expect(panel.querySelector('[aria-label="常见场景"]')?.hasAttribute('hidden')).toBe(true);
    tabs[3].click();
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
    expect(panel.querySelector('[aria-label="常见场景"]')?.hasAttribute('hidden')).toBe(false);
    expect(panel.querySelector('[aria-label="常用符号"]')?.hasAttribute('hidden')).toBe(true);
  });
  it('moves from the title bar, clamps to the viewport, and ignores the close button', () => {
    vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600);
    const panel = openRichEditor(normalize({ kind: 'markdown', content: 'text' }).document, vi.fn());
    panel.getBoundingClientRect = vi.fn(() => ({ left: 100, top: 80, width: 400, height: 300, right: 500, bottom: 380, x: 100, y: 80, toJSON: () => ({}) } as DOMRect));
    const header = panel.querySelector('[data-pastefit-drag-handle]') as HTMLElement;
    const closeButton = panel.querySelector('[aria-label="关闭编辑器"]') as HTMLButtonElement;

    closeButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 110, clientY: 90 }));
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 700, clientY: 500 }));
    expect(panel.style.left).toBe('');

    header.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, clientY: 100 }));
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 900, clientY: 900 }));
    expect(panel.style.left).toBe('392px');
    expect(panel.style.top).toBe('292px');
    expect(panel.dataset.pastefitDragging).toBe('true');
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    expect(panel.dataset.pastefitDragging).toBeUndefined();
  });
  it('top-right close never copies and a failed copy stays open for retry', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'));
    const panel = openRichEditor(normalize({ kind: 'markdown', content: 'text' }).document, write);
    [...panel.querySelectorAll('button')].find((b) => b.textContent === '贴妥智能复制')!.click();
    await vi.waitFor(() => expect(panel.querySelector('[role="status"]')!.textContent).toContain('复制失败'));
    expect(panel.isConnected).toBe(true);
    expect([...panel.querySelectorAll('button')].some((b) => b.textContent === '取消')).toBe(false);
    (panel.querySelector('[aria-label="关闭编辑器"]') as HTMLButtonElement).click();
    expect(panel.isConnected).toBe(false); expect(write).toHaveBeenCalledTimes(1);
  });
});
