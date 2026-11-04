import { describe, expect, it } from 'vitest';
import { normalizeMarkdown } from '../../../src/core/normalize-markdown';

describe('normalizeMarkdown', () => {
  it('preserves headings, emphasis, nested lists, links, code and tables', () => {
    const result = normalizeMarkdown({ kind: 'markdown', content: '# Title\n\n**bold** [link](https://example.com)\n\n- one\n  - two\n\n```ts\nconst n = 42;\n```\n\n| A | B |\n|-|-|\n| 1 | 2 |' });
    expect(result.document.children.map((node) => node.type)).toEqual(['heading', 'paragraph', 'list', 'codeBlock', 'table']);
    expect(JSON.stringify(result.document)).toContain('const n = 42;');
    expect(JSON.stringify(result.document)).toContain('https://example.com');
    expect(JSON.stringify(result.document)).toContain('two');
  });

  it('keeps unsafe links readable without preserving their URL', () => {
    const result = normalizeMarkdown({ kind: 'markdown', content: '[bad](javascript:alert(1))' });
    expect(JSON.stringify(result.document)).toContain('bad');
    expect(JSON.stringify(result.document)).not.toContain('javascript:');
  });
});
