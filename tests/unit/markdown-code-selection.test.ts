import { afterEach, expect, it, vi } from 'vitest';
import { writeDocument } from '../../src/clipboard/rich';
import { captureSelection } from '../../src/extension/capture-selection';
import { normalize } from '../../src/extension/workflow';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { wechatAdapter } from '../../src/adapters/text-adapter';

const markdown = '# 标题\n\n**重点**\n\n| 字段 | 内容 |\n| --- | --- |\n| Name | PasteFit |';
const select = (node: Node) => {
  const range = document.createRange(); range.selectNodeContents(node);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
};
afterEach(() => { document.body.replaceChildren(); window.getSelection()?.removeAllRanges(); vi.unstubAllGlobals(); });

// Synthetic content with the nested span/newline structure supplied by the user.
// No saved conversation or account-bearing HTML is included in this fixture.
const highlightedSource = () => {
  document.body.innerHTML = '<div><code class="whitespace-pre! block text-size-code"><span><span></span>\n<span><span class="hljs-section"># Sample</span></span>\n<span></span>\n<span><span class="hljs-strong">**Important**</span></span>\n<span></span>\n<span>- One</span>\n<span>  - Nested</span>\n<span></span>\n<span>| Key | Value |</span>\n<span>| --- | --- |</span>\n<span>| A | 123 |</span>\n<span>| B | 456 |</span>\n<span></span>\n<span>End marker.</span>\n<span></span></span></code></div>';
  return document.querySelector('code')!;
};
it('captures unlabelled highlighted block code without pre and preserves every newline', async () => {
  const code = highlightedSource(); select(code.firstChild!);
  expect(captureSelection()).toEqual({ kind: 'markdown', content: code.textContent });
  const doc = normalize(captureSelection()!).document;
  expect(doc.children.map(n => n.type)).toEqual(['heading', 'paragraph', 'list', 'table', 'paragraph']);
  const html = documentHtmlAdapter.render(doc).value;
  expect(html).toContain('<strong>Important</strong>');
  const holder = document.createElement('div'); holder.innerHTML = html;
  expect([...holder.querySelectorAll('tr')].map(row => row.textContent)).toEqual(['KeyValue', 'A123', 'B456']);
  expect(holder.querySelectorAll('li')).toHaveLength(2);
  expect(holder.textContent).toContain('End marker.');
  const chat = wechatAdapter.render(doc).value;
  expect(chat).not.toContain('**Important**'); expect(chat).not.toContain('| ---');
  expect(chat).toContain('123'); expect(chat).toContain('456'); expect(chat).toContain('End marker.');
  vi.stubGlobal('ClipboardItem', class { constructor(public data: Record<string, Blob>) {} });
  const writer = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn() };
  await writeDocument(doc, 'smart', writer);
  expect(writer.write).toHaveBeenCalledTimes(1); expect(writer.writeText).not.toHaveBeenCalled();
  const items = writer.write.mock.calls[0][0]; expect(items).toHaveLength(1);
  expect(Object.keys(items[0].data).sort()).toEqual(['text/html', 'text/plain']);
  const read = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob);
  });
  expect(await read(items[0].data['text/html'])).toBe(html);
  expect(await read(items[0].data['text/plain'])).toBe(chat);
});
it('supports the same highlighted structure inside pre without relying on CSS classes', () => {
  const code = highlightedSource(); code.className = '';
  const pre = document.createElement('pre'); code.replaceWith(pre); pre.append(code); select(code);
  expect(captureSelection()).toEqual({ kind: 'markdown', content: code.textContent });
});
it('does not treat section and emphasis classes with non-Markdown text as Markdown', () => {
  const code = highlightedSource(); code.querySelector('.hljs-section')!.textContent = '[configuration]'; select(code);
  expect(captureSelection()!.kind).toBe('html');
});
it('uses block evidence without copying unselected highlighted text', () => {
  const code = highlightedSource(); const text = code.querySelector('.hljs-strong')!.firstChild!;
  const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, text.textContent!.length);
  window.getSelection()!.addRange(range);
  expect(captureSelection()).toEqual({ kind: 'markdown', content: '**Important**' });
});
it.each(['language-python', 'language-javascript'])('explicit %s overrides Markdown-like highlighting', language => {
  const code = highlightedSource(); code.classList.add(language); select(code);
  expect(captureSelection()!.kind).toBe('html');
});
it('does not infer Markdown from generic section highlighting alone', () => {
  const code = highlightedSource(); code.querySelector('.hljs-strong')!.removeAttribute('class'); select(code);
  expect(captureSelection()!.kind).toBe('html');
});
it('does not unwrap inline code or a selection including surrounding prose', () => {
  const code = highlightedSource(); code.className = ''; select(code);
  expect(captureSelection()!.kind).toBe('html');
  code.className = 'whitespace-pre! block';
  code.parentElement!.append(document.createTextNode(' surrounding prose')); select(code.parentElement!);
  expect(captureSelection()!.kind).toBe('html');
});
it.each(['class="language-markdown"', 'class="lang-md"', 'data-language="Markdown"', 'data-lang="gfm"'])('converts explicitly marked code: %s', attribute => {
  document.body.innerHTML = `<article><div>Markdown<button>复制</button></div><pre><code ${attribute}></code></pre><p>不要复制</p></article>`;
  const code = document.querySelector('code')!; const span = document.createElement('span'); span.textContent = markdown; code.append(span); select(span);
  expect(captureSelection()).toEqual({ kind: 'markdown', content: markdown });
  const doc = normalize(captureSelection()!).document;
  expect(doc.children.map(node => node.type)).toEqual(['heading', 'paragraph', 'table']);
  const html = documentHtmlAdapter.render(doc).value;
  expect(html).toContain('<strong>重点</strong>'); expect(html).toContain('<table'); expect(html).not.toContain('<pre>');
  expect(wechatAdapter.render(doc).value).toContain('字段： Name');
});
it('supports language on pre and captures only selected text', () => {
  document.body.innerHTML = '<pre data-language="md"><code></code></pre>';
  const code = document.querySelector('code')!; code.textContent = '**重点** 未选中的内容';
  const range = document.createRange(); range.setStart(code.firstChild!, 0); range.setEnd(code.firstChild!, 6); window.getSelection()!.addRange(range);
  expect(captureSelection()).toEqual({ kind: 'markdown', content: '**重点**' });
});
it.each(['', 'class="language-python"', 'class="language-javascript"', 'class="language-markdown" data-language="python"'])('does not unwrap unknown or non-Markdown code: %s', attribute => {
  document.body.innerHTML = `<div>Markdown</div><pre><code ${attribute}></code></pre>`;
  const code = document.querySelector('code')!; code.textContent = markdown; select(code);
  expect(captureSelection()!.kind).toBe('html');
  expect(normalize(captureSelection()!).document.children[0].type).toBe('codeBlock');
});
it('keeps Markdown examples in mixed prose and selections crossing blocks', () => {
  document.body.innerHTML = '<article><p>解释</p><pre><code class="language-markdown"></code></pre><p>结束</p></article>';
  document.querySelector('code')!.textContent = markdown; select(document.querySelector('article')!);
  expect(captureSelection()!.kind).toBe('html');
  expect(normalize(captureSelection()!).document.children.map(n => n.type)).toEqual(['paragraph', 'codeBlock', 'paragraph']);
  const range = document.createRange(); range.setStart(document.querySelector('code')!.firstChild!, 0); range.setEnd(document.querySelector('article')!.lastChild!.firstChild!, 2);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  expect(captureSelection()!.kind).toBe('html');
});
