import type { ContentInput } from './input';
import type { BlockNode, InlineNode, ListItem, SemanticDocument, TableRow } from './semantic-document';
import { isSafeUrl, normalizeLineEndings, type NormalizationResult } from './types';

const text = (value: string): InlineNode => ({ type: 'text', value });
const hidden = (element: Element): boolean => element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || element.getAttribute('style')?.includes('display: none') === true;

const hasReadableInline = (nodes: readonly InlineNode[]): boolean => nodes.some((node) => {
  if (node.type === 'text' || node.type === 'code') return Boolean(node.value.trim());
  if (node.type === 'image') return Boolean(node.alt.trim() || node.src);
  if (node.type === 'break') return false;
  return hasReadableInline(node.children);
});

const safeTableCellText = (cell: Element): string => {
  if (cell.hasAttribute('hidden') || /display\s*:\s*none/i.test(cell.getAttribute('style') ?? '')) return '';
  const clone = cell.cloneNode(true) as Element;
  for (const unsafe of clone.querySelectorAll('script,style,button,[role="button"],svg,noscript,iframe,object,template,input,select,textarea,[hidden]')) unsafe.remove();
  for (const candidate of clone.querySelectorAll('[style]')) {
    if (/display\s*:\s*none/i.test(candidate.getAttribute('style') ?? '')) candidate.remove();
  }
  return normalizeLineEndings(clone.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const inlines = (node: Node): InlineNode[] => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [text(node.textContent)] : [];
  if (!(node instanceof Element) || hidden(node)) return [];
  if (['script', 'style', 'button', 'svg', 'noscript', 'iframe', 'object', 'template'].includes(node.tagName.toLowerCase())) return [];
  const children = [...node.childNodes].flatMap(inlines);
  switch (node.tagName.toLowerCase()) {
    case 'br': return [{ type: 'break', hard: true }];
    case 'strong': case 'b': return [{ type: 'strong', children }];
    case 'em': case 'i': return [{ type: 'emphasis', children }];
    case 'del': case 's': return [{ type: 'delete', children }];
    case 'code': return [{ type: 'code', value: node.textContent ?? '' }];
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return isSafeUrl(href) ? [{ type: 'link', href, children }] : children;
    }
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return [{ type: 'image', alt: node.getAttribute('alt') ?? '', ...(isSafeUrl(src) ? { src } : {}) }];
    }
    default: return children;
  }
};

const blockChildren = (element: Element): BlockNode[] => {
  const result: BlockNode[] = [];
  let pending: InlineNode[] = [];
  const flush = (): void => {
    if (pending.some((node) => node.type !== 'text' || node.value.trim())) result.push({ type: 'paragraph', children: pending });
    pending = [];
  };
  for (const node of element.childNodes) {
    if (node instanceof Element && /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|H[1-6]|PRE|BLOCKQUOTE|HR|UL|OL|TABLE)$/.test(node.tagName)) {
      flush(); result.push(...blockNode(node));
    } else pending.push(...inlines(node));
  }
  flush();
  return result;
};

const blockNode = (node: Node): BlockNode[] => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? [{ type: 'paragraph', children: [text(node.textContent)] }] : [];
  if (!(node instanceof Element) || hidden(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (['script', 'style', 'button', 'svg', 'noscript'].includes(tag)) return [];
  if (/^h[1-6]$/.test(tag)) return [{ type: 'heading', level: Number(tag[1]) as 1 | 2 | 3 | 4 | 5 | 6, children: inlines(node) }];
  if (tag === 'p') return [{ type: 'paragraph', children: inlines(node) }];
  if (tag === 'pre') return [{ type: 'codeBlock', value: normalizeLineEndings(node.textContent ?? ''), ...(node.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1] ? { language: node.querySelector('code')?.className.match(/language-([\w+-]+)/)?.[1] } : {}) }];
  if (tag === 'blockquote') return [{ type: 'quote', children: blockChildren(node) }];
  if (tag === 'hr') return [{ type: 'thematicBreak' }];
  if (tag === 'ul' || tag === 'ol') {
    const items: ListItem[] = [...node.children].filter((child) => child.tagName.toLowerCase() === 'li').map((item) => {
      const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      return { ...(checkbox ? { checked: checkbox.checked } : {}), children: blockChildren(item).length ? blockChildren(item) : [{ type: 'paragraph', children: inlines(item) }] };
    });
    return [{ type: 'list', ordered: tag === 'ol', ...(tag === 'ol' && Number(node.getAttribute('start') ?? '1') !== 1 ? { start: Number(node.getAttribute('start')) } : {}), items }];
  }
  if (tag === 'table') {
    const rows: TableRow[] = [...node.querySelectorAll('tr')].map((row) => ({
      header: Boolean(row.querySelector('th')),
      cells: [...row.querySelectorAll(':scope > th, :scope > td')].map((cell) => {
        const parsed = inlines(cell);
        if (hasReadableInline(parsed)) return parsed;
        const fallback = safeTableCellText(cell);
        return fallback ? [text(fallback)] : [];
      })
    }));
    return [{ type: 'table', rows }];
  }
  const nested = blockChildren(node);
  return nested.length ? nested : inlines(node).length ? [{ type: 'paragraph', children: inlines(node) }] : [];
};

export const normalizeHtml = (input: Extract<ContentInput, { kind: 'html' }>): NormalizationResult => {
  const document = new DOMParser().parseFromString(input.content, 'text/html');
  const semanticDocument: SemanticDocument = { type: 'document', children: blockChildren(document.body) };
  return { document: semanticDocument, warnings: [] };
};
