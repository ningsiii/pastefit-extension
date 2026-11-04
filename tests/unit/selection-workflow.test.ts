import { describe, expect, it } from 'vitest';
import { formatSelectedText } from '../../src/extension/selection-workflow';

describe('formatSelectedText', () => {
  it('converts selected Markdown to readable plain text locally', () => {
    expect(formatSelectedText('# Title\n\n- one\n- two')).toContain('Title');
    expect(formatSelectedText('# Title\n\n- one\n- two')).not.toContain('#');
  });
});
