import temml from 'temml';
import type { InlineNode } from './semantic-document';
import type { AdapterWarning } from './types';

export type MathNode = Extract<InlineNode, { type: 'math' }>;
const namespace = 'http://www.w3.org/1998/Math/MathML';
const tags = new Set('math mrow mi mn mo mtext ms mspace mfrac msqrt mroot mstyle merror mpadded mphantom mfenced menclose msub msup msubsup munder mover munderover mmultiscripts mprescripts none mtable mtr mtd mlabeledtr semantics annotation'.split(' '));
const attrs = new Set('display mathvariant stretchy fence separator accent accentunder largeop movablelimits symmetric lspace rspace linethickness bevelled notation rowalign columnalign rowspacing columnspacing columnspan rowspan equalrows equalcolumns width height depth voffset minsize maxsize encoding'.split(' '));

// Never pass arbitrary HTML, styles, URLs, events, or annotation-xml to a target.
export const sanitizeMathml = (source: string, display: boolean): string | null => {
  if (source.length > 100000) return null;
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.localName !== 'math') return null;
  const elements = [root, ...root.querySelectorAll('*')];
  if (elements.length > 4000) return null;
  for (const el of elements) {
    if (!tags.has(el.localName) || (el.namespaceURI && el.namespaceURI !== namespace)) return null;
    if (el.localName === 'annotation') {
      if (el.children.length || !/^application\/(?:x-tex|x-latex)$/.test(el.getAttribute('encoding') ?? '')) { el.remove(); continue; }
    }
    for (const attr of [...el.attributes]) {
      if (attr.name === 'xmlns') continue;
      if (!attrs.has(attr.name) || attr.value.length > 200 || /[<>{}]|url\s*\(|expression\s*\(/i.test(attr.value)) el.removeAttribute(attr.name);
    }
    // A new namespace cannot escape the whitelist through prefixed attributes.
    for (const attr of [...el.attributes]) if (attr.prefix) el.removeAttributeNode(attr);
  }
  root.setAttribute('xmlns', namespace);
  root.setAttribute('display', display ? 'block' : 'inline');
  return new XMLSerializer().serializeToString(root);
};

const stripDelimiters = (value: string): string => {
  const source = value.trim();
  for (const [open, close] of [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]) {
    if (source.startsWith(open) && source.endsWith(close) && source.length > open.length + close.length) return source.slice(open.length, -close.length).trim();
  }
  return source;
};

export const mathSelector = 'math,.katex,.katex-display,mjx-container,[data-math-source],[data-math]';
export const readMath = (el: Element): MathNode | null => {
  if (!el.matches(mathSelector)) return null;
  const native = el.localName === 'math' ? el : el.querySelector('math');
  const annotation = el.querySelector('annotation[encoding="application/x-tex"],annotation[encoding="application/x-latex"]');
  const source = el.getAttribute('data-math-source') ?? el.getAttribute('data-math') ?? annotation?.textContent;
  const display = el.classList.contains('katex-display') || el.getAttribute('display') === 'block' ||
    el.getAttribute('display') === 'true' || native?.getAttribute('display') === 'block';
  if (source?.trim()) return { type: 'math', source: el.getAttribute('data-math-format') === 'mathml' ? source.trim() : stripDelimiters(source), format: el.getAttribute('data-math-format') === 'mathml' ? 'mathml' : 'latex', display };
  if (native) return { type: 'math', source: new XMLSerializer().serializeToString(native), format: 'mathml', display };
  // SVG-only renderers with no accessible source remain explicit text fallbacks.
  return { type: 'math', source: el.getAttribute('aria-label') || el.textContent || '[公式：源内容不可用]', format: 'latex', display };
};

export const mathText = (node: MathNode): string => node.format === 'mathml' ? node.source :
  node.display ? `\\[${node.source}\\]` : `\\(${node.source}\\)`;

export const renderMath = (node: MathNode): { value: string | null; warnings: AdapterWarning[] } => {
  try {
    if (node.source.length > 10000) throw new Error('size');
    const raw = node.format === 'mathml' ? node.source : temml.renderToString(node.source, {
      displayMode: node.display, throwOnError: true, trust: false, strict: true, maxExpand: 200, maxSize: [20, 20], annotate: true
    });
    const value = sanitizeMathml(raw, node.display);
    if (!value) throw new Error('unsupported');
    return { value, warnings: [] };
  } catch {
    return { value: null, warnings: [{ code: 'unsupported-content', message: '部分公式无法转换，已保留原式。' }] };
  }
};
