import { describe, expect, it } from 'vitest';
import { plainTextAdapter, wechatAdapter } from '../../src/adapters/text-adapter';
import { missingRequiredValues } from '../../src/core/integrity';
import { normalizeMarkdown } from '../../src/core/normalize-markdown';
import fixtureIndex from '../fixtures/manifest.json';

const inputs = import.meta.glob('../fixtures/*/input.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
const manifests = import.meta.glob('../fixtures/*/manifest.json', { eager: true, import: 'default' }) as Record<string, { requiredText?: string[]; requiredNumbers?: string[]; requiredUrls?: string[]; requiredCode?: string[]; requiredCells?: string[]; requiredEmoji?: string[] }>;

describe('information preservation', () => {
  it('preserves every declared required value through both adapters', () => {
    for (const name of fixtureIndex.fixtures) {
      const document = normalizeMarkdown({ kind: 'markdown', content: inputs[`../fixtures/${name}/input.md`] }).document;
      const manifest = manifests[`../fixtures/${name}/manifest.json`];
      const required = Object.values(manifest).flat();
      for (const adapter of [wechatAdapter, plainTextAdapter]) {
        expect(missingRequiredValues(document, adapter.render(document).value, required), `${name}/${adapter.id}`).toEqual([]);
      }
    }
  });

  it('fails when a required value is removed from an output', () => {
    const document = normalizeMarkdown({ kind: 'markdown', content: 'number 42 and https://example.com' }).document;
    expect(missingRequiredValues(document, 'number and https://example.com', ['42', 'https://example.com'])).toEqual(['42']);
  });

  it('handles empty, unicode and long input without throwing', () => {
    for (const content of ['', '中文 🎯', 'x'.repeat(100_000)]) {
      const document = normalizeMarkdown({ kind: 'markdown', content }).document;
      expect(() => plainTextAdapter.render(document)).not.toThrow();
    }
  });
});
