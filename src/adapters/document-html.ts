import type { BlockNode, InlineNode } from '../core/semantic-document';
import { isSafeUrl, type OutputAdapter } from '../core/types';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const inline = (nodes: readonly InlineNode[]): string => nodes.map((node): string => {
  switch (node.type) {
    case 'text': return escapeHtml(node.value);
    case 'break': return '<br>';
    case 'code': return `<code>${escapeHtml(node.value)}</code>`;
    case 'strong': return `<strong>${inline(node.children)}</strong>`;
    case 'emphasis': return `<em>${inline(node.children)}</em>`;
    case 'delete': return `<del>${inline(node.children)}</del>`;
    case 'link': return isSafeUrl(node.href) ? `<a href="${escapeHtml(node.href)}">${inline(node.children)}</a>` : inline(node.children);
    // Keep image descriptions and links without causing remote image requests in previews or Word.
    case 'image': return node.src && isSafeUrl(node.src) ? `<a href="${escapeHtml(node.src)}">${escapeHtml(node.alt || node.src)}</a>` : escapeHtml(node.alt);
  }
}).join('');
const blocks = (nodes: readonly BlockNode[]): string => nodes.map((node): string => {
  switch (node.type) {
    case 'heading': { const level = Math.min(6, Math.max(1, Math.trunc(node.level))); return `<h${level}>${inline(node.children)}</h${level}>`; }
    case 'paragraph': return `<p>${inline(node.children)}</p>`;
    case 'quote': return `<blockquote>${blocks(node.children)}</blockquote>`;
    case 'codeBlock': return `<pre><code>${escapeHtml(node.value)}</code></pre>`;
    case 'thematicBreak': return '<hr>';
    case 'unknown': return `<p>${escapeHtml(node.value)}</p>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = Number.isSafeInteger(node.start) ? node.start : 1;
      return `<${tag}${node.ordered ? ` start="${start}"` : ''}>${node.items.map((item) => `<li>${item.checked === undefined ? '' : item.checked ? '☑ ' : '☐ '}${item.children.map((child) => child.type === 'paragraph' ? inline(child.children) : blocks([child])).join('')}</li>`).join('')}</${tag}>`;
    }
    // Keep a simple editable table with explicit borders; target application
    // compatibility must be verified separately from HTML structure tests.
    case 'table': return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;border:1px solid #888">${node.rows.map((row) => `<tr>${row.cells.map((cell) => { const tag = row.header ? 'th' : 'td'; return `<${tag} style="border:1px solid #888;padding:4px 8px;vertical-align:top">${inline(cell) || '&nbsp;'}</${tag}>`; }).join('')}</tr>`).join('')}</table>`;
  }
}).join('');

export const documentHtmlAdapter: OutputAdapter = {
  id: 'document-html', render: (document) => ({ value: blocks(document.children), warnings: [] })
};
