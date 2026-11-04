import { describe, expect, it } from 'vitest';
import { plainTextAdapter, wechatAdapter } from '../../../src/adapters/text-adapter';
import type { BlockNode, InlineNode } from '../../../src/core/semantic-document';
import { normalizeMarkdown } from '../../../src/core/normalize-markdown';
import expectedPlain from '../../fixtures/format-torture/expected.plain.txt?raw';
import expectedWechat from '../../fixtures/format-torture/expected.wechat.txt?raw';
import source from '../../fixtures/format-torture/input.md?raw';

const collectInlineTypes = (nodes: readonly InlineNode[]): string[] => nodes.flatMap((node) =>
  'children' in node ? [node.type, ...collectInlineTypes(node.children)] : [node.type]);

const collectBlockTypes = (nodes: readonly BlockNode[]): string[] => nodes.flatMap((node) => {
  if (node.type === 'list') return [node.type, ...node.items.flatMap((item) => collectBlockTypes(item.children))];
  if (node.type === 'quote') return [node.type, ...collectBlockTypes(node.children)];
  return [node.type];
});

describe('format torture fixture', () => {
  it('recognizes the expected Markdown and GFM semantic structures', () => {
    const document = normalizeMarkdown({ kind: 'markdown', content: source }).document;
    const inlineTypes = document.children.flatMap((node) =>
      node.type === 'heading' || node.type === 'paragraph' ? collectInlineTypes(node.children) : []);
    const blockTypes = collectBlockTypes(document.children);

    expect(document.children.filter((node) => node.type === 'heading')).toHaveLength(6);
    expect(inlineTypes).toEqual(expect.arrayContaining(['strong', 'emphasis', 'delete', 'code', 'link', 'image', 'break']));
    expect(blockTypes).toEqual(expect.arrayContaining(['list', 'quote', 'codeBlock', 'table', 'thematicBreak']));
  });

  it('keeps the documented current WeChat and plain-text baselines stable', () => {
    const document = normalizeMarkdown({ kind: 'markdown', content: source }).document;

    expect(wechatAdapter.render(document).value).toBe(expectedWechat.trimEnd());
    expect(plainTextAdapter.render(document).value).toBe(expectedPlain.trimEnd());
  });

  it('does not leave source emphasis syntax outside preserved code content', () => {
    const rendered = wechatAdapter.render(normalizeMarkdown({ kind: 'markdown', content: source }).document).value;

    expect(rendered).not.toContain('**加粗重点**');
    expect(rendered).not.toContain('*斜体提示*');
    expect(rendered).not.toContain('~~删除内容~~');
  });
});
