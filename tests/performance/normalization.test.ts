import { describe, expect, it } from 'vitest';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import { plainTextAdapter } from '../../src/adapters/text-adapter';

describe('normalization performance observation', () => {
  it('processes approximately 100 KB mixed Markdown without failing', () => {
    const input = ('# Title\n\n- item https://example.com\n\n```ts\nconst n = 42;\n```\n\n').repeat(1_700);
    const started = performance.now();
    const document = normalizeMarkdown({ kind: 'markdown', content: input }).document;
    const output = plainTextAdapter.render(document).value;
    const elapsed = performance.now() - started;
    expect(input.length).toBeGreaterThan(100_000);
    expect(output).toContain('const n = 42;');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});
