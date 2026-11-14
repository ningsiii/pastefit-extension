import { isReferenceAnchor, prepareHtmlReferences, referenceIssues, referenceWarnings, withAnchor } from './references';
import type { ReferenceIssue } from './semantic-document';
import { readMath } from './math';
import type { ContentInput } from './input';
import type { BlockNode, InlineNode, ListItem, SemanticDocument, TableRow } from './semantic-document';
import { isSafeUrl, normalizeLineEndings, type NormalizationResult } from './types';

const text = (value: string): InlineNode => ({ type: 'text', value });
const styleHidden = (element: Element): boolean =>
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i.test(element.getAttribute('style') ?? '');
const hidden = (element: Element): boolean => element.hasAttribute('hidden') || element.getAttribute('aria-hidden') === 'true' || styleHidden(element);
const blocked = new Set(['script', 'style', 'button', 'svg', 'noscript', 'iframe', 'object', 'template', 'input', 'select', 'textarea', 'canvas']);
const spanValue = (value: string | null): number => /^\d+$/.test(value ?? '') ? Math.min(1000, Math.max(1, Number(value))) : 1;
const htmlText = (node: Node): string => {
  for (let el = node.parentElement; el; el = el.parentElement) {
    if (/white-space\s*:\s*(?:pre(?:-wrap|-line)?|break-spaces)/i.test(el.getAttribute('style') ?? '')) return normalizeLineEndings(node.textContent ?? '');
  }
  return (node.textContent ?? '').replace(/[\t\n\r ]+/g, ' ');
};

const hasReadableInline = (nodes: readonly InlineNode[]): boolean => nodes.some((node) => {
  if (node.type === 'text' || node.type === 'code') return Boolean(node.value.trim() || (node.type === 'text' && node.anchor));
  if (node.type === 'image') return Boolean(node.alt.trim() || node.src);
  if (node.type === 'break') return false;
  if (node.type === 'math') return Boolean(node.source.trim());
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
  const result = inlineContent(node);
  if (!(node instanceof Element) || hidden(node) || blocked.has(node.tagName.toLowerCase()) || node.getAttribute('role') === 'button') return result;
  const anchor = node.getAttribute('data-pastefit-anchor') ?? '';
  const issue = node.getAttribute('data-pastefit-reference-issue') as ReferenceIssue;
  const metadata: InlineNode[] = [];
  if (isReferenceAnchor(anchor)) metadata.push({ type: 'text', value: '', anchor });
  if (referenceIssues.includes(issue)) metadata.push({ type: 'text', value: '', referenceIssue: issue, referenceLabel: node.getAttribute('data-pastefit-reference-label') ?? node.textContent ?? '' });
  return [...metadata, ...result];
};
const inlineContent = (node: Node): InlineNode[] => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ? [text(htmlText(node))] : [];
  if (!(node instanceof Element)) return [];
  const math = readMath(node);
  if (math && !node.hasAttribute('hidden') && !styleHidden(node)) return [math];
  if (hidden(node) || blocked.has(node.tagName.toLowerCase()) || node.getAttribute('role') === 'button') return [];
  const children = [...node.childNodes].flatMap(inlines);
  switch (node.tagName.toLowerCase()) {
    case 'br': return [{ type: 'break', hard: true }];
    case 'strong': case 'b': return [{ type: 'strong', children }];
    case 'em': case 'i': return [{ type: 'emphasis', children }];
    case 'u': return [{ type: 'underline', children }];
    case 'sup': return [{ type: 'superscript', children }];
    case 'sub': return [{ type: 'subscript', children }];
    case 'del': case 's': return [{ type: 'delete', children }];
    case 'code': return [{ type: 'code', value: node.textContent ?? '' }];
    case 'a': {
      const href = node.getAttribute('href') ?? '';
      return href && isSafeUrl(href) ? [{ type: 'link', href, ...(node.getAttribute('title') ? { title: node.getAttribute('title')! } : {}), children }] : children;
    }
    case 'img': {
      const src = node.getAttribute('src') ?? '';
      return [{ type: 'image', alt: node.getAttribute('alt') ?? '', ...(isSafeUrl(src) ? { src } : {}) }];
    }
    default: {
      let result = children;
      const style = (node.getAttribute('style') ?? '').toLowerCase();
      if (/font-weight\s*:\s*(?:bold(?:er)?|[6-9]00)\b/.test(style)) result = [{ type: 'strong', children: result }];
      if (/font-style\s*:\s*(?:italic|oblique)\b/.test(style)) result = [{ type: 'emphasis', children: result }];
      if (/text-decoration(?:-line)?\s*:[^;]*\bunderline\b/.test(style)) result = [{ type: 'underline', children: result }];
      if (/vertical-align\s*:\s*super\b/.test(style)) result = [{ type: 'superscript', children: result }];
      if (/vertical-align\s*:\s*sub\b/.test(style)) result = [{ type: 'subscript', children: result }];
      return result;
    }
  }
};

const blockChildren = (element: Element): BlockNode[] => {
  const result: BlockNode[] = [];
  let pending: InlineNode[] = [];
  const flush = (): void => {
    if (pending.some((node) => node.type !== 'text' || node.value.trim() || node.anchor || node.referenceIssue)) result.push({ type: 'paragraph', children: pending });
    pending = [];
  };
  for (const node of element.childNodes) {
    if (node instanceof Element && /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|H[1-6]|PRE|BLOCKQUOTE|HR|UL|OL|TABLE)$/.test(node.tagName)) {
      flush(); result.push(...blockNode(node));
    } else pending.push(...inlines(node));
  }
  flush();
  const anchor = element.getAttribute('data-pastefit-anchor') ?? '';
  return withAnchor(result, isReferenceAnchor(anchor) ? anchor : undefined);
};

const blockNode = (node: Node): BlockNode[] => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.trim() ? [{ type: 'paragraph', children: [text(node.textContent)] }] : [];
  if (!(node instanceof Element) || hidden(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (blocked.has(tag) || node.getAttribute('role') === 'button') return [];
  const math = readMath(node);
  if (math) return withAnchor([{ type: 'paragraph', children: [math] }], node.getAttribute('data-pastefit-anchor') ?? undefined);
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
    return withAnchor([{ type: 'list', ordered: tag === 'ol', ...(tag === 'ol' && Number(node.getAttribute('start') ?? '1') !== 1 ? { start: Number(node.getAttribute('start')) } : {}), items }], node.getAttribute('data-pastefit-anchor') ?? undefined);
  }
  if (tag === 'table') {
    const rows: TableRow[] = [...node.querySelectorAll('tr')].filter(row => row.closest('table') === node && !hidden(row)).map((row) => {
      const cells = [...row.querySelectorAll(':scope > th, :scope > td')].filter(cell => !hidden(cell));
      return {
        header: cells.length > 0 && cells.every(cell => cell.tagName === 'TH'),
        cells: cells.map((cell) => {
          const parsed = inlines(cell);
          if (hasReadableInline(parsed)) return parsed;
          const fallback = safeTableCellText(cell);
          return fallback ? [text(fallback)] : [];
        }),
        cellMeta: cells.map(cell => ({ rowSpan: spanValue(cell.getAttribute('rowspan')), colSpan: spanValue(cell.getAttribute('colspan')),
          header: cell.tagName === 'TH', blocks: blockChildren(cell) }))
      };
    });
    // A caption is selected content, not a table row. Ordinary paragraphs keep
    // it in every output adapter without inventing numbering or Word fields.
    const before: BlockNode[] = []; const after: BlockNode[] = [];
    const side = (element: Element): string => (element as HTMLElement).style.captionSide;
    const captions = [...node.children].filter(child => child.tagName === 'CAPTION' && !hidden(child));
    for (const caption of captions) {
      const position = side(caption);
      const bottom = (position && position !== 'inherit' ? position : side(node)) === 'bottom';
      (bottom ? after : before).push(...blockChildren(caption));
    }
    const table = rows.length || !captions.length ? withAnchor([{ type: 'table', rows }], node.getAttribute('data-pastefit-anchor') ?? undefined) : [];
    return [...before, ...table, ...after];
  }
  const nested = blockChildren(node);
  return nested.length ? nested : inlines(node).length ? [{ type: 'paragraph', children: inlines(node) }] : [];
};

export const normalizeHtml = (input: Extract<ContentInput, { kind: 'html' }>): NormalizationResult => {
  const document = new DOMParser().parseFromString(input.content, 'text/html');
  prepareHtmlReferences(document.body, input.metadata?.sourceUrl);
  const semanticDocument: SemanticDocument = { type: 'document', children: blockChildren(document.body) };
  return { document: semanticDocument, warnings: referenceWarnings(semanticDocument).map(message => ({ code: 'unsupported-content', message })) };
};
