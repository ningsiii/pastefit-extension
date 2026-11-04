import { describe, expect, it } from 'vitest';
import { normalizeMarkdown } from '../../../src/core/normalize-markdown';
import { plainTextAdapter, wechatAdapter } from '../../../src/adapters/text-adapter';

describe('text adapters', () => {
  it('renders structured text without losing links, code and table cells', () => {
    const doc = normalizeMarkdown({ kind: 'markdown', content: '# Title\n\n[guide](https://example.com)\n\n```ts\nconst n = 42;\n```\n\n| A | B |\n|-|-|\n| 1 | 2 |' }).document;
    const rendered = wechatAdapter.render(doc).value;
    expect(rendered).toContain('【Title】');
    expect(rendered).toContain('https://example.com');
    expect(rendered).toContain('const n = 42;');
    expect(rendered).toContain('A： 1');
    expect(plainTextAdapter.render(doc).value).toContain('Title');
  });
});
