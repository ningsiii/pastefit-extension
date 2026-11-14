import type { BlockNode, InlineNode, ReferenceIssue, SemanticDocument } from './semantic-document';

export const isReferenceAnchor = (value: string): boolean => /^pf-ref-[a-z0-9-]{1,80}$/.test(value);
export const referenceIssues: readonly ReferenceIssue[] = ['missing-note', 'duplicate-note', 'unreferenced-note', 'missing-target', 'ambiguous-target'];

// An empty text node carries a bookmark, never an invisible Unicode character.
export const withAnchor = (nodes: readonly BlockNode[], anchor?: string): BlockNode[] => {
  if (!anchor) return [...nodes];
  const marker: InlineNode = { type: 'text', value: '', anchor };
  if (!nodes.length) return [{ type: 'paragraph', children: [marker] }];
  const [first, ...rest] = nodes;
  if (first.type === 'paragraph' || first.type === 'heading') return [{ ...first, children: [marker, ...first.children] }, ...rest];
  if (first.type === 'quote') return [{ ...first, children: withAnchor(first.children, anchor) }, ...rest];
  if (first.type === 'list' && first.items.length) return [{ ...first, items: [{ ...first.items[0], children: withAnchor(first.items[0].children, anchor) }, ...first.items.slice(1)] }, ...rest];
  return [{ type: 'paragraph', children: [marker] }, ...nodes];
};

export const referenceWarnings = (doc: SemanticDocument): string[] => {
  const warnings = new Set<string>();
  const messages: Record<ReferenceIssue, string> = {
    'missing-note': '当前选区没有对应的注释内容，已保留原标记',
    'duplicate-note': '当前选区有重复的注释定义，已全部保留，未猜测对应关系',
    'unreferenced-note': '当前选区没有对应的正文标记，注释内容已保留',
    'missing-target': '链接指向的说明或位置不在当前选区，已保留文字',
    'ambiguous-target': '链接目标重复，已保留文字，未猜测跳转位置'
  };
  const inline = (nodes: readonly InlineNode[]): void => { for (const node of nodes) {
    if (node.type === 'text' && node.referenceIssue) {
      const label = (node.referenceLabel || node.value).replace(/\s+/g, ' ').slice(0, 60);
      warnings.add(`引用${label ? `“${label}”` : ''}：${messages[node.referenceIssue]}。`);
    }
    if ('children' in node) inline(node.children);
  } };
  const blocks = (nodes: readonly BlockNode[]): void => { for (const node of nodes) {
    if (node.type === 'paragraph' || node.type === 'heading') inline(node.children);
    else if (node.type === 'quote') blocks(node.children);
    else if (node.type === 'list') node.items.forEach(item => blocks(item.children));
    else if (node.type === 'table') node.rows.forEach(row => row.cells.forEach((cell, i) => row.cellMeta?.[i]?.blocks.length ? blocks(row.cellMeta[i].blocks) : inline(cell)));
  } };
  blocks(doc.children);
  return [...warnings];
};

// Work only with links and targets inside the captured fragment. Never fetch a
// missing note from the surrounding page or a remote website.
export const prepareHtmlReferences = (root: HTMLElement, sourceUrl?: string): void => {
  for (const node of root.querySelectorAll('[data-pastefit-anchor]')) node.removeAttribute('data-pastefit-anchor');
  const targets = new Map<string, Element[]>();
  for (const node of root.querySelectorAll('[id],a[name]')) {
    const names = new Set([node.getAttribute('id'), node.getAttribute('name')].filter((x): x is string => Boolean(x)));
    for (const name of names) targets.set(name, [...(targets.get(name) ?? []), node]);
  }
  let sequence = 0; const assigned = new Map<Element, string>();
  for (const link of root.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href') ?? ''; let fragment: string | undefined;
    if (href.startsWith('#')) fragment = href.slice(1);
    else if (sourceUrl) {
      try { const a = new URL(href, sourceUrl); const b = new URL(sourceUrl); if (a.origin === b.origin && a.pathname === b.pathname && a.search === b.search && a.hash) fragment = a.hash.slice(1); } catch { /* Keep ordinary links on their existing URL safety path. */ }
    }
    if (!fragment) continue;
    try { fragment = decodeURIComponent(fragment); } catch { /* Match literal malformed escapes only; never interpret them as markup. */ }
    const matches = (targets.get(fragment) ?? []).filter(target => {
      for (let ancestor: Element | null = target; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.matches('[hidden],[aria-hidden="true"],[role="button"],script,style,button,pre,code,svg,noscript,iframe,object,template,input,select,textarea,canvas') || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))(?:\s*!important)?\s*(?:;|$)/i.test(ancestor.getAttribute('style') ?? '')) return false;
      }
      return true;
    });
    if (matches.length !== 1) {
      link.removeAttribute('href');
      link.setAttribute('data-pastefit-reference-issue', matches.length ? 'ambiguous-target' : 'missing-target');
      link.setAttribute('data-pastefit-reference-label', (link.textContent ?? '').slice(0, 100));
      continue;
    }
    // Row/section elements are structural only in our table model. Place their
    // destination at the first real cell, which is what a document can retain.
    const target = matches[0].matches('tr,thead,tbody,tfoot') ? matches[0].querySelector('th,td') : matches[0];
    if (!target) {
      link.removeAttribute('href'); link.setAttribute('data-pastefit-reference-issue', 'missing-target');
      link.setAttribute('data-pastefit-reference-label', (link.textContent ?? '').slice(0, 100)); continue;
    }
    const id = assigned.get(target) ?? `pf-ref-html-${++sequence}`;
    assigned.set(target, id); target.setAttribute('data-pastefit-anchor', id);
    link.setAttribute('href', `#${id}`);
  }
};
