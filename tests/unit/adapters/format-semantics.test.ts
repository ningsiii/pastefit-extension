import { describe, expect, it } from 'vitest';
import { wechatAdapter, plainTextAdapter } from '../../../src/adapters/text-adapter';
import { normalizeHtml } from '../../../src/core/normalize-html';
import { normalizeMarkdown } from '../../../src/core/normalize-markdown';

const renderWechatMarkdown = (content: string): string =>
  wechatAdapter.render(normalizeMarkdown({ kind: 'markdown', content }).document).value;

describe('format semantics', () => {
  it('preserves multiline strong text without Markdown marker noise', () => {
    const rendered = renderWechatMarkdown('**这是第一行加粗\n第二行仍在强调范围内\n第三行也是强调**');

    expect(rendered).toBe('「这是第一行加粗\n第二行仍在强调范围内\n第三行也是强调」');
    expect(rendered).not.toContain('**');
  });

  it('distinguishes italic and strong text, including adjacent and multiline ranges', () => {
    const rendered = renderWechatMarkdown('*斜体文本* 后面跟 **加粗文本**\n\n*斜体第一行\n斜体第二行*\n\n**加粗第一行\n加粗第二行**');

    expect(rendered).toContain('‹斜体文本› 后面跟 「加粗文本」');
    expect(rendered).toContain('‹斜体第一行\n斜体第二行›');
    expect(rendered).toContain('「加粗第一行\n加粗第二行」');
    expect(rendered).not.toMatch(/\*{1,2}/);
  });

  it('renders a divider separately from emphasis and preserves plain-text fallback', () => {
    const source = '**上面是加粗**\n\n---\n\n*下面是斜体*';
    const document = normalizeMarkdown({ kind: 'markdown', content: source }).document;

    expect(wechatAdapter.render(document).value).toBe('「上面是加粗」\n\n────────\n\n‹下面是斜体›');
    expect(plainTextAdapter.render(document).value).toBe('上面是加粗\n\n---\n\n下面是斜体');
  });

  it('keeps list hierarchy while rendering emphasis and hard line breaks', () => {
    const rendered = renderWechatMarkdown('- 列表项一\n- **列表项二加粗**  \n  换行继续\n- 列表项三\n\n1. 第一项\n2. **第二项加粗**  \n   换行\n   再换行\n3. 第三项');

    expect(rendered).toContain('• 列表项一');
    expect(rendered).toContain('• 「列表项二加粗」\n换行继续');
    expect(rendered).toContain('2. 「第二项加粗」\n换行\n再换行');
    expect(rendered).not.toContain('**');
  });

  it('renders headings, quote, code and HTML emphasis with visible WeChat semantics', () => {
    const markdown = '## 标题二\n\n**标题下的加粗内容\n换行后还有**\n\n### 标题三\n\n*标题下的斜体内容\n换行继续*\n\n> **引用**\n\n`const n = 1`';
    const rendered = renderWechatMarkdown(markdown);
    const htmlDocument = normalizeHtml({ kind: 'html', content: '<p><strong>粗体</strong>和<em>斜体</em></p>' }).document;

    expect(rendered).toContain('【标题二】');
    expect(rendered).toContain('「标题下的加粗内容\n换行后还有」');
    expect(rendered).toContain('【标题三】');
    expect(rendered).toContain('‹标题下的斜体内容\n换行继续›');
    expect(rendered).toContain('↳ 「引用」');
    expect(rendered).toContain('`const n = 1`');
    expect(wechatAdapter.render(htmlDocument).value).toBe('「粗体」和‹斜体›');
  });

  it('keeps quote paragraph spacing without rendering an empty quote marker', () => {
    const rendered = renderWechatMarkdown('> 第一段\n>\n> 第二段');

    expect(rendered).toBe('↳ 第一段\n\n↳ 第二段');
    expect(rendered).not.toContain('↳ \n');
  });

  it('keeps nested list levels compact and visibly indented', () => {
    const rendered = renderWechatMarkdown('- 父项\n  - 子项一\n  - 子项二\n- 下一项');

    expect(rendered).toBe('• 父项\n  • 子项一\n  • 子项二\n• 下一项');
  });
});
