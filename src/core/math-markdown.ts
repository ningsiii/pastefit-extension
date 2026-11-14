import type { TokenizerExtension } from 'marked';

// Delimiter recognition only; Markdown itself is parsed by Marked, TeX by Temml.
const read = (src: string, block: boolean) => {
  const pairs = block ? [['$$', '$$'], ['\\[', '\\]']] : [['\\(', '\\)'], ['$$', '$$'], ['$', '$']];
  for (const [open, close] of pairs) {
    if (!src.startsWith(open)) continue;
    if (open === '$' && (src.startsWith('$$') || /\s/.test(src[1] ?? ''))) continue;
    for (let end = open.length; end < src.length; end++) {
      if (src.startsWith(close, end)) {
        const value = src.slice(open.length, end);
        if (open === '$' && value.includes('`')) return;
        if (open === '$' && /^\d+(?:[.,]\d+)?(?:[。；，]|\s+[A-Za-z]{2,})/.test(value)) return;
        if (!value.trim() || (!block && open === '$' && (/\n/.test(value) || /\s$/.test(value) || /\d/.test(src[end + 1] ?? '')))) return;
        const raw = src.slice(0, end + close.length);
        if (block && !/^[ \t]*(?:\n|$)/.test(src.slice(raw.length))) continue;
        return { type: block ? 'mathBlock' : 'mathInline', raw, text: value.trim(), display: block || open === '$$' };
      }
      if (src[end] === '\\') end++;
    }
  }
};
export const mathExtensions: TokenizerExtension[] = [
  { name: 'mathBlock', level: 'block', start: src => src.search(/^(?:\$\$|\\\[)/m), tokenizer(src) { return read(src, true); } },
  { name: 'mathInline', level: 'inline', start: src => src.search(/\$|\\\(/), tokenizer(src) { return read(src, false); } }
];

// Only these paired inline HTML semantics are supported inside Markdown.
export const scriptHtmlExtension: TokenizerExtension = {
  name: 'scriptHtml', level: 'inline', start: src => src.search(/<(?:sup|sub|u)>/i),
  tokenizer(src) {
    const opening = /^<(sup|sub|u)>/i.exec(src);
    if (!opening) return;
    const tag = opening[1].toLowerCase();
    const closing = src.toLowerCase().indexOf(`</${tag}>`, opening[0].length);
    if (closing < 0) return;
    const raw = src.slice(0, closing + tag.length + 3);
    const value = src.slice(opening[0].length, closing);
    // Nested identical tags are left to ordinary Markdown HTML fallback.
    if (new RegExp(`<${tag}>`, 'i').test(value)) return;
    return { type: 'scriptHtml', raw, tag, tokens: this.lexer.inlineTokens(value) };
  }
};
