import { plainTextAdapter, wechatAdapter } from '../adapters/text-adapter';
import type { ClipboardWriter } from '../clipboard/write';
import type { ContentInput } from '../core/input';
import { normalizeHtml } from '../core/normalize-html';
import { normalizeMarkdown } from '../core/normalize-markdown';
import type { AdapterResult } from '../core/types';

export type AdapterId = 'wechat' | 'plain-text';
export type CopyResult = { readonly ok: true; readonly message: '已贴妥'; readonly valueLength: number } | { readonly ok: false; readonly reason: 'empty-content' | 'unsupported-input' | 'clipboard-unsupported' | 'clipboard-denied' | 'clipboard-failed' };

export const normalize = (input: ContentInput) => {
  if (input.kind === 'markdown') return normalizeMarkdown(input);
  if (input.kind === 'html') return normalizeHtml(input);
  return { document: { type: 'document' as const, children: input.content ? [{ type: 'paragraph' as const, children: [{ type: 'text' as const, value: input.content }] }] : [] }, warnings: [] };
};

const adapterFor = (id: AdapterId): { render: (document: ReturnType<typeof normalize>['document']) => AdapterResult<string> } => id === 'wechat' ? wechatAdapter : plainTextAdapter;

export const formatContent = (input: ContentInput, adapterId: AdapterId): string =>
  input.content.trim() ? adapterFor(adapterId).render(normalize(input).document).value : '';

export const copyText = async (value: string, writer: ClipboardWriter): Promise<CopyResult> => {
  if (!value.trim()) return { ok: false, reason: 'empty-content' };
  try {
    await writer.writeText(value);
    return { ok: true, message: '已贴妥', valueLength: value.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'unsupported') return { ok: false, reason: 'clipboard-unsupported' };
    if (message.toLowerCase().includes('denied') || message.toLowerCase().includes('notallowed')) return { ok: false, reason: 'clipboard-denied' };
    return { ok: false, reason: 'clipboard-failed' };
  }
};

export const processAndCopy = async (input: ContentInput, adapterId: AdapterId, writer: ClipboardWriter): Promise<CopyResult> =>
  copyText(formatContent(input, adapterId), writer);
