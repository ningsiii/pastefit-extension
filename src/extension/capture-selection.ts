import type { ContentInput } from '../core/input';

const compactText = (value: string): string => value.replace(/\s+/g, ' ').trim();

// Highlight classes are evidence only in a block-code container. Require both
// a Markdown heading and a separate Markdown inline token, not arbitrary code.
const hasMarkdownHighlighting = (code: Element): boolean => {
  const heading = [...code.querySelectorAll('.hljs-section')].some(node =>
    /^#{1,6}[ \t]+\S/.test(node.textContent ?? ''));
  const inline = [...code.querySelectorAll('.hljs-strong,.hljs-emphasis')].some(node =>
    /^(\*\*|__|\*|_)(?=\S)[\s\S]+\1$/.test(node.textContent ?? ''));
  return heading && inline;
};

// Only unwrap a selection inside one identified Markdown source block.
// A document containing code examples must keep those examples as code.
const markdownCodeSelection = (selection: Selection): string | null => {
  if (selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  const start = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  const pre = start?.closest('pre');
  const code = start?.closest('code') ?? pre;
  if (!code) return null;
  if (!code.contains(range.startContainer) || !code.contains(range.endContainer)) return null;
  const block = Boolean(pre) || (code.classList.contains('block') &&
    (code.classList.contains('whitespace-pre!') || code.classList.contains('whitespace-pre')));
  if (!block) return null;
  const languages = [...new Set([code, ...(pre ? [pre] : [])])].flatMap(element => [
    element.getAttribute('data-language'), element.getAttribute('data-lang'),
    ...[...element.classList].map(name => /^(?:language|lang)-(.+)$/i.exec(name)?.[1])
  ]).filter((value): value is string => Boolean(value)).map(value => value.trim().toLowerCase());
  if (languages.length) {
    if (!languages.every(language => ['markdown', 'md', 'gfm'].includes(language))) return null;
  } else if (!hasMarkdownHighlighting(code)) return null;
  // Range text preserves literal newlines and indentation between highlight
  // spans. Do not compact whitespace or join each nested span with a newline.
  return range.toString();
};

const safeSourceCellText = (cell: Element): string => {
  const clone = cell.cloneNode(true) as Element;
  for (const ignored of clone.querySelectorAll('script,style,button,[role="button"],svg,noscript,iframe,object,template,input,select,textarea,[hidden]')) ignored.remove();
  for (const candidate of clone.querySelectorAll('[style]')) {
    if (/display\s*:\s*none/i.test(candidate.getAttribute('style') ?? '')) candidate.remove();
  }
  return compactText(clone.textContent ?? '');
};

const ownCells = (table: HTMLTableElement): Element[] =>
  [...table.querySelectorAll('th,td')].filter((cell) => cell.closest('table') === table);

const restoreSelectedTableCells = (fragment: DocumentFragment, range: Range): void => {
  const selectedText = compactText(range.toString());
  if (!selectedText) return;
  const clonedTables = [...fragment.querySelectorAll('table')];
  const sourceTables = [...document.querySelectorAll('table')].filter((table) => {
    try { return range.intersectsNode(table); } catch { return false; }
  });
  sourceTables.forEach((source, tableIndex) => {
    const clone = clonedTables[tableIndex];
    if (!clone) return;
    const sourceCells = ownCells(source);
    const clonedCells = ownCells(clone);
    if (!sourceCells.length || sourceCells.length !== clonedCells.length) return;
    sourceCells.forEach((sourceCell, cellIndex) => {
      const clonedCell = clonedCells[cellIndex];
      if (compactText(clonedCell.textContent ?? '')) return;
      let intersects = false;
      try { intersects = range.intersectsNode(sourceCell); } catch { return; }
      const sourceText = safeSourceCellText(sourceCell);
      if (!intersects || !sourceText || !selectedText.includes(sourceText)) return;
      clonedCell.replaceChildren(...[...sourceCell.childNodes].map((child) => child.cloneNode(true)));
    });
  });
};

export const captureSelection = (): ContentInput | null => {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
    if (active instanceof HTMLInputElement && active.type === 'password') return null;
    const { selectionStart: start, selectionEnd: end } = active;
    if (start !== null && end !== null && start !== end) return { kind: 'markdown', content: active.value.slice(start, end) };
  }
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const markdown = markdownCodeSelection(selection);
  if (markdown !== null) return { kind: 'markdown', content: markdown };
  const container = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    const clonedContents = range.cloneContents();
    restoreSelectedTableCells(clonedContents, range);
    let fragment: Node = clonedContents;
    let ancestor = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
      const wrapper = ancestor.cloneNode(false) as Element;
      if (ancestor instanceof HTMLOListElement) {
        const items = [...ancestor.children].filter((child) => child.tagName === 'LI');
        const first = items.findIndex((item) => range.intersectsNode(item));
        if (first >= 0) wrapper.setAttribute('start', String(ancestor.start + first));
      }
      wrapper.append(fragment);
      fragment = wrapper;
      ancestor = ancestor.parentElement;
    }
    container.append(fragment);
  }
  for (const element of container.querySelectorAll('[href], [src]')) {
    for (const attr of ['href', 'src']) {
      const value = element.getAttribute(attr);
      if (value) { try { element.setAttribute(attr, new URL(value, document.baseURI).href); } catch { element.removeAttribute(attr); } }
    }
  }
  const structured = container.querySelector('h1,h2,h3,h4,h5,h6,strong,b,em,i,del,s,ul,ol,table,pre,code,a,img,blockquote,br');
  return structured ? { kind: 'html', content: container.innerHTML } : { kind: 'markdown', content: selection.toString() };
};
