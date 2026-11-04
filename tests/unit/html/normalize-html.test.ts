import { describe, expect, it } from 'vitest';
import { normalizeHtml } from '../../../src/core/normalize-html';

describe('normalizeHtml', () => {
  it('preserves semantic content while removing executable and UI noise', () => {
    const result = normalizeHtml({ kind: 'html', content: '<h1>Title</h1><p><strong>bold</strong> <a href="https://example.com">link</a></p><pre><code class="language-ts">const n = 42;</code></pre><button>copy</button><script>alert(1)</script><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>' });
    const serialized = JSON.stringify(result.document);
    expect(serialized).toContain('Title');
    expect(serialized).toContain('const n = 42;');
    expect(serialized).toContain('https://example.com');
    expect(serialized).not.toContain('alert(1)');
    expect(serialized).not.toContain('copy');
  });

  it('does not preserve dangerous link URLs', () => {
    const result = normalizeHtml({ kind: 'html', content: '<p><a href="javascript:alert(1)">bad</a></p>' });
    expect(JSON.stringify(result.document)).toContain('bad');
    expect(JSON.stringify(result.document)).not.toContain('javascript:');
  });
});
