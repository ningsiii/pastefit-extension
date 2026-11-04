import { describe, expect, it } from 'vitest';
import type { ContentInput } from '../../src/core/input';
import type { OutputAdapter } from '../../src/core/types';
import manifest from '../fixtures/manifest.json';

const fixtureFiles = import.meta.glob('../fixtures/*/*', { eager: true, query: '?raw', import: 'default' });

describe('semantic contract and fixtures', () => {
  it('keeps the input union source-neutral', () => {
    const input: ContentInput = { kind: 'markdown', content: '# title' };
    expect(input.kind).toBe('markdown');
  });

  it('supports source-neutral adapters', () => {
    const adapter: OutputAdapter = { id: 'example', render: () => ({ value: '', warnings: [] }) };
    expect(adapter.id).toBe('example');
  });

  it('contains thirteen complete, declared fixtures', () => {
    expect(manifest.fixtures).toHaveLength(13);
    for (const name of manifest.fixtures) {
      for (const fileName of ['input.md', 'expected.wechat.txt', 'expected.plain.txt', 'manifest.json']) {
        expect(fixtureFiles).toHaveProperty(`../fixtures/${name}/${fileName}`);
      }
    }
  });
});
