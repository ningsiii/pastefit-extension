import { describe, expect, it } from 'vitest';
import { processAndCopy } from '../../../src/extension/workflow';

describe('processAndCopy', () => {
  it('writes adapter-produced plain text through an injected writer', async () => {
    const written: string[] = [];
    const result = await processAndCopy({ kind: 'markdown', content: '# Title' }, 'wechat', { writeText: async (value) => { written.push(value); } });
    expect(result).toEqual({ ok: true, message: '已贴妥', valueLength: 7 });
    expect(written).toEqual(['【Title】']);
  });

  it('returns user-safe failures without source content', async () => {
    const result = await processAndCopy({ kind: 'markdown', content: 'secret content' }, 'plain-text', { writeText: async () => { throw new Error('NotAllowedError'); } });
    expect(result).toEqual({ ok: false, reason: 'clipboard-denied' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
