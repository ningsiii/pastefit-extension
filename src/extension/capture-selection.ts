import { mathSelector } from '../core/math';
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

// Preserve caption position from the real page without importing its visual
// styling or pulling in captions outside the selected range.
const restoreSelectedCaptionStyles = (fragment: ParentNode, range: Range): void => {
  const source = [...document.querySelectorAll('caption')].filter(caption => {
    try { return range.intersectsNode(caption); } catch { return false; }
  });
  const clones = [...fragment.querySelectorAll('caption')];
  if (source.length !== clones.length) return;
  clones.forEach((clone, index) => {
    const caption = source[index]; const style = window.getComputedStyle(caption);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') { clone.remove(); return; }
    const parent = caption.closest('table');
    const side = style.captionSide || (parent ? window.getComputedStyle(parent).captionSide : '');
    if (side === 'top' || side === 'bottom') clone.style.captionSide = side;
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
    const range = selection.getRangeAt(i).cloneRange();
    const formulaRoot = (node: Node): Element | null => {
      const element = node instanceof Element ? node : node.parentElement;
      let root = element?.closest(mathSelector) ?? null;
      for (let parent = root?.parentElement?.closest(mathSelector); parent; parent = parent.parentElement?.closest(mathSelector)) root = parent;
      return root;
    };
    const startMath = formulaRoot(range.startContainer); const endMath = formulaRoot(range.endContainer);
    if (startMath) range.setStartBefore(startMath);
    if (endMath) range.setEndAfter(endMath);
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
      if (ancestor.matches(mathSelector)) {
        // A formula is atomic: copying only its rendered numerator must not lose
        // the source annotation or create a malformed equation.
        fragment = ancestor.cloneNode(true);
        ancestor = ancestor.parentElement;
        continue;
      }
      wrapper.append(fragment);
      fragment = wrapper;
      ancestor = ancestor.parentElement;
    }
    restoreSelectedCaptionStyles(fragment as ParentNode, range);
    container.append(fragment);
  }
  for (const element of container.querySelectorAll('[href], [src]')) {
    for (const attr of ['href', 'src']) {
      const value = element.getAttribute(attr);
      if (attr === 'href' && value?.startsWith('#')) continue;
      if (value) { try {
        const resolved = new URL(value, document.baseURI);
        const page = new URL(document.URL);
        const local = attr === 'href' && resolved.origin === page.origin && resolved.pathname === page.pathname && resolved.search === page.search && resolved.hash;
        element.setAttribute(attr, local ? resolved.hash : resolved.href);
      } catch { element.removeAttribute(attr); } }
    }
  }
  const structured = container.querySelector('h1,h2,h3,h4,h5,h6,strong,b,em,i,del,s,ul,ol,table,pre,code,a,img,blockquote,br,u,sup,sub,math,.katex,.katex-display,mjx-container,[data-math-source],[data-math]');
  return structured ? { kind: 'html', content: container.innerHTML } : { kind: 'markdown', content: selection.toString() };
};
