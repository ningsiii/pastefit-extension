import { describe, expect, it } from 'vitest';
import { normalizeHtml } from '../../src/core/normalize-html';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';

describe('input safety', () => {
  it('does not retain executable HTML or dangerous URLs', () => {
    const html = normalizeHtml({ kind: 'html', content: '<script>evil()</script><a href="javascript:evil()">safe text</a>' });
    const markdown = normalizeMarkdown({ kind: 'markdown', content: '[safe text](javascript:evil())' });
    expect(JSON.stringify(html.document)).not.toContain('evil()');
    expect(JSON.stringify(markdown.document)).not.toContain('javascript:');
  });
});
