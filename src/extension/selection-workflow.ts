import { plainTextAdapter } from '../adapters/text-adapter';
import { normalizeMarkdown } from '../core/normalize-markdown';

export const formatSelectedText = (selection: string): string => plainTextAdapter.render(normalizeMarkdown({ kind: 'markdown', content: selection }).document).value;
