import { describe, expect, it, vi } from 'vitest';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { normalizeHtml } from '../../src/core/normalize-html';
import { documentClipboardHtml } from '../../src/adapters/document-clipboard-html';
import { pagesNativeTransfer } from '../../src/adapters/pages-native-xml';
import { documentHtmlAdapter } from '../../src/adapters/document-html';
import { documentTextAdapter, wechatAdapter } from '../../src/adapters/text-adapter';
import { referenceWarnings } from '../../src/core/references';
import { copyPagesNative } from '../../src/clipboard/pages-native';
import { captureSelection } from '../../src/extension/capture-selection';
import { writeDocument } from '../../src/clipboard/rich';
const md = (content: string) => normalizeMarkdown({ kind: 'markdown', content }).document;
const html = (content: string) => normalizeHtml({ kind: 'html', content }).document;
const render = (content: string) => documentHtmlAdapter.render(md(content)).value;

describe('footnote content and correspondence', () => {
  it('retains notes after repeated references and gives each unique definition a target', () => {
    const doc = md('研究[^1]，再次[^1]，另见[^other]。\n\n[^1]: 补充 **说明**。\n\n[^other]: 第二个说明。');
    const output = documentHtmlAdapter.render(doc).value;
    expect(output.match(/href="#pf-ref-note-1"/g)).toHaveLength(2);
    expect(output).toContain('name="pf-ref-note-1"');
    expect(output).toContain('[1] 补充 <strong>说明</strong>');
    expect(output).toContain('[other] 第二个说明');
    expect(referenceWarnings(doc)).toEqual([]);
    expect(wechatAdapter.render(doc).value).not.toContain('pf-ref-');
  });
  it('keeps multiline note paragraphs, lists, links and formulas', () => {
    const output = render('正文[^a]。\n\n[^a]: 第一段\n\n    第二段 $x^2$\n\n    - 要点\n    - [来源](https://example.org)');
    expect(output).toContain('第一段'); expect(output).toContain('第二段');
    expect(output).toContain('<ul>'); expect(output).toContain('https://example.org');
    expect(output).toContain('<annotation encoding="application/x-tex">x^2</annotation>');
  });
  it('keeps a definition before its reference and never leaks state across copies', () => {
    expect(render('[^a]: 说明\n\n正文[^a]')).toContain('href="#pf-ref-note-1"');
    const doc = md('仅标记[^a]');
    expect(documentTextAdapter.render(doc).value).toContain('[^a]');
    expect(referenceWarnings(doc).join()).toContain('没有对应的注释内容');
  });
  it('keeps every duplicate and orphan definition and warns without guessing', () => {
    const doc = md('正文[^a]\n\n[^a]: 第一份\n\n[^a]: 第二份\n\n[^b]: 独立说明');
    const output = documentHtmlAdapter.render(doc).value;
    expect(output).toContain('第一份'); expect(output).toContain('第二份'); expect(output).toContain('独立说明');
    expect(output).not.toContain('href="#pf-ref-note');
    expect(referenceWarnings(doc).join()).toContain('重复');
    expect(referenceWarnings(doc).join()).toContain('没有对应的正文标记');
  });
  it('does not interpret literal code, escaped markers or math as footnotes', () => {
    const doc = md('`[^a]` 和 \\[^b] 与 $x^{[^c]}$\n\n```text\n[^d]: literal\n```');
    expect(referenceWarnings(doc)).toEqual([]);
    expect(documentHtmlAdapter.render(doc).value).not.toContain('pf-ref-note');
  });
  it('preserves bibliography, source link titles and literal cross references', () => {
    const output = render('[1] 张某.论文.2026.\n\n如表2所示，参见第3.1节和公式（4）。[来源][source]\n\n[source]: https://example.org/paper "论文标题"');
    expect(output).toContain('[1] 张某.论文.2026.');
    expect(output).toContain('如表2所示，参见第3.1节和公式（4）');
    expect(output).toContain('title="论文标题"');
  });
  it('escapes note labels and does not create executable markup', () => {
    const output = render('内容[^<img src=x onerror=alert(1)>]\n\n[^<img src=x onerror=alert(1)>]: 说明');
    expect(output).not.toContain('<img'); expect(output).toContain('&lt;img');
  });
});

describe('captured HTML references', () => {
  it('preserves forward and return links using safe local bookmarks', () => {
    const doc = html('<p>正文<sup><a id="r1" href="#n1">1</a></sup></p><ol><li id="n1"><p>说明<a href="#r1">↩</a></p></li></ol>');
    const output = documentHtmlAdapter.render(doc).value;
    expect(referenceWarnings(doc)).toEqual([]);
    const parsed = new DOMParser().parseFromString(output, 'text/html');
    for (const a of parsed.querySelectorAll('a[href]')) expect(parsed.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull();
    expect(parsed.querySelectorAll('a[href]')).toHaveLength(2);
    expect(output).toContain('说明');
  });
  it('preserves named anchors and references in table cells', () => {
    const doc = html('<p><a href="#note">[1]</a></p><table><tr><td id="note"><p>说明</p></td></tr></table>');
    const output = documentHtmlAdapter.render(doc).value;
    expect(output).toContain('name="pf-ref-html-1"'); expect(output).toContain('说明');
    expect(referenceWarnings(html('<p><a href="#n">1</a></p><p><a name="n"></a>注释</p>'))).toEqual([]);
  });
  it('preserves visible labels and warns for missing or ambiguous targets', () => {
    for (const suffix of ['', '<p id="n">第一份</p><p id="n">第二份</p>']) {
      const doc = html('<p><a href="#n"><sup>[1]</sup></a></p>' + suffix);
      const output = documentHtmlAdapter.render(doc).value;
      expect(output).toContain('[1]'); expect(output).not.toContain('href=');
      expect(referenceWarnings(doc)).toHaveLength(1);
    }
  });
  it('does not use hidden, interactive or code targets', () => {
    for (const target of ['<p hidden id="n">隐藏</p>', '<div style="display:none"><p id="n">隐藏</p></div>', '<pre id="n">literal</pre>', '<button id="n">按钮</button>']) {
      expect(referenceWarnings(html('<p><a href="#n">1</a></p>' + target))).toHaveLength(1);
    }
  });
  it('keeps external fragment URLs and recognizes an absolute link to the source page', () => {
    const input = '<p><a href="https://example.org/page#n">1</a><a href="https://elsewhere.org/#n">来源</a></p><p id="n">说明</p>';
    const doc = normalizeHtml({ kind: 'html', content: input, metadata: { sourceUrl: 'https://example.org/page' } }).document;
    const output = documentHtmlAdapter.render(doc).value;
    expect(output).toContain('href="#pf-ref-html-1"'); expect(output).toContain('https://elsewhere.org/#n');
  });
  it('preserves valid and incomplete notes through editor HTML normalization', () => {
    for (const source of ['正文[^a]\n\n[^a]: 说明', '正文[^missing]']) {
      const before = md(source); const after = html(documentHtmlAdapter.render(before).value);
      expect(documentTextAdapter.render(after).value).toBe(documentTextAdapter.render(before).value);
      expect(referenceWarnings(after)).toEqual(referenceWarnings(before));
      const output = documentHtmlAdapter.render(after).value;
      const parsed = new DOMParser().parseFromString(output, 'text/html');
      for (const a of parsed.querySelectorAll('a[href^="#"]')) expect(parsed.getElementById(a.getAttribute('href')!.slice(1))).not.toBeNull();
    }
  });
  it('rejects injected anchors, URLs and issue types', () => {
    const output = documentHtmlAdapter.render(html('<p><span data-pastefit-anchor="x&quot; onclick=&quot;alert(1)" data-pastefit-reference-issue="anything">文字</span><a href="javascript:alert(1)">来源</a></p>')).value;
    expect(output).toBe('<p>文字来源</p>');
  });
  it('delivers missing-note warnings in chat and rich clipboard modes', async () => {
    const doc = md('正文[^missing]');
    const writer = { writeText: vi.fn().mockResolvedValue(undefined), write: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal('ClipboardItem', class { constructor(public data: unknown) {} });
    try {
      expect((await writeDocument(doc, 'chat', writer)).join()).toContain('没有对应的注释内容');
      expect((await writeDocument(doc, 'smart', writer)).join()).toContain('没有对应的注释内容');
      expect(writer.write).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});

it('keeps fragment targets through real selection capture without copying a sibling note', () => {
  document.body.innerHTML = '<article><p>正文<a href="#n">[1]</a></p><p id="n">说明</p></article><p>私人相邻内容</p>';
  const range = document.createRange(); range.selectNodeContents(document.querySelector('article')!);
  const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  try {
    const captured = captureSelection()!;
    expect(captured.content).toContain('href="#n"');
    expect(captured.content).not.toContain('私人相邻内容');
    expect(referenceWarnings(normalizeHtml({ kind: 'html', content: captured.content }).document)).toEqual([]);
  } finally { selection.removeAllRanges(); document.body.innerHTML = ''; }
});
it('does not leave a Markdown link pointing to an unavailable local target', () => {
  const doc = md('[见说明](#absent)');
  expect(documentHtmlAdapter.render(doc).value).not.toContain('href=');
  expect(referenceWarnings(doc).join()).toContain('不在当前选区');
});

it('keeps note text and bookmarks on clipboard without sending local jumps back to the source page', () => {
  const doc = md('正文[^a]。\n\n[^a]: 说明 [来源](https://example.org)');
  const output = documentClipboardHtml(doc).value;
  expect(output).toContain('[a]'); expect(output).toContain('说明');
  expect(output).toContain('name="pf-ref-note-1"');
  expect(output).not.toContain('href="#');
  expect(output).toContain('href="https://example.org"');
  expect(documentHtmlAdapter.render(doc).value).toContain('href="#pf-ref-note-1"');
});
it('retains notes in the Mac native payload alongside editable math', () => {
  const transfer = pagesNativeTransfer(md('结论[^a] $x^2$。\n\n[^a]: 注释第一段\n\n    注释第二段'));
  const tree = new DOMParser().parseFromString(transfer.documentXml, 'application/xml');
  const visible = [...tree.getElementsByTagNameNS('*', 't')].map(n => n.textContent).join('');
  expect(transfer.equations).toBe(1);
  expect(visible).toContain('结论[a]'); expect(visible).toContain('[a] 注释第一段'); expect(visible).toContain('注释第二段');
});

it('keeps destinations on structural table rows and rebuilds source anchor metadata', () => {
  const doc = html('<p><a href="#r">行</a></p><table><tbody><tr id="r"><td>目标单元格</td></tr></tbody></table><span data-pastefit-anchor="pf-ref-html-1">无关</span>');
  const output = documentHtmlAdapter.render(doc).value;
  expect(output.match(/name="pf-ref-html-1"/g)).toHaveLength(1);
  expect(output).toContain('目标单元格');
});

it('delivers note diagnostics through the optional Mac copy path with and without equations', async () => {
  const write = vi.fn().mockResolvedValue(undefined); const writeText = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('ClipboardItem', class { constructor(public data: unknown) {} });
  vi.stubGlobal('navigator', { clipboard: { write, writeText } });
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  try {
    for (const source of ['缺少[^a]', '缺少[^a] $x^2$']) {
      expect((await copyPagesNative(md(source), true)).join()).toContain('没有对应的注释内容');
    }
    expect(write).toHaveBeenCalledOnce(); expect(sendMessage).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
