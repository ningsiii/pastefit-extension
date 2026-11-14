import { isReferenceAnchor, referenceIssues } from '../core/references';
import type { BlockNode, InlineNode, SemanticDocument } from '../core/semantic-document';
import { mathText, renderMath } from '../core/math';
import { isSafeUrl, type AdapterWarning, type OutputAdapter } from '../core/types';

export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const renderDocumentHtml = (document: SemanticDocument, formulaMode: 'mathml' | 'source' = 'mathml'): ReturnType<OutputAdapter['render']> => {
    const warnings: AdapterWarning[] = [];
    const inline = (nodes: readonly InlineNode[]): string => nodes.map((node): string => {
      switch (node.type) {
        case 'text': {
          const value = escapeHtml(node.value);
          const anchor = node.anchor && isReferenceAnchor(node.anchor) ? `<a id="${node.anchor}" name="${node.anchor}"></a>` : '';
          return anchor + (node.referenceIssue && referenceIssues.includes(node.referenceIssue) ? `<span data-pastefit-reference-issue="${node.referenceIssue}" data-pastefit-reference-label="${escapeHtml(node.referenceLabel ?? node.value)}">${value}</span>` : value);
        }
        case 'break': return '<br>';
        case 'code': return `<code>${escapeHtml(node.value)}</code>`;
        case 'strong': return `<strong>${inline(node.children)}</strong>`;
        case 'emphasis': return `<em>${inline(node.children)}</em>`;
        case 'delete': return `<del>${inline(node.children)}</del>`;
        case 'underline': return `<u>${inline(node.children)}</u>`;
        case 'superscript': return `<sup>${inline(node.children)}</sup>`;
        case 'subscript': return `<sub>${inline(node.children)}</sub>`;
        case 'math': {
          // The WPS fallback uses visible source text, never MathML whose visual
          // and annotation branches WPS may concatenate during HTML import.
          if (formulaMode === 'source') return `<span>${escapeHtml(mathText(node))}</span>`;
          const result = renderMath(node); warnings.push(...result.warnings);
          return result.value ?? `<code data-math-source="${escapeHtml(node.source)}" data-math-format="${node.format}"${node.display ? ' display="block"' : ''}>${escapeHtml(mathText(node))}</code>`;
        }
        case 'link': return isSafeUrl(node.href) ? `<a href="${escapeHtml(node.href)}"${node.title ? ` title="${escapeHtml(node.title)}"` : ''}>${inline(node.children)}</a>` : inline(node.children);
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
          return `<${tag}${node.ordered ? ` start="${start}"` : ''}>${node.items.map((item) => {
            const multiple = item.children.filter(child => child.type === 'paragraph').length > 1;
            const content = multiple ? blocks(item.children) : item.children.map(child => child.type === 'paragraph' ? inline(child.children) : blocks([child])).join('');
            return `<li>${item.checked === undefined ? '' : item.checked ? '☑ ' : '☐ '}${content}</li>`;
          }).join('')}</${tag}>`;
        }
        case 'table': return `<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;border:1px solid #888">${node.rows.map((row) => `<tr>${row.cells.map((cell, index) => {
          const meta = row.cellMeta?.[index];
          const tag = (meta?.header ?? row.header) ? 'th' : 'td';
          const span = (name: string, value: number | undefined): string => Number.isSafeInteger(value) && value! > 1 ? ` ${name}="${Math.min(1000, value!)}"` : '';
          const content = meta?.blocks.length ? meta.blocks.length === 1 && meta.blocks[0].type === 'paragraph' ? inline(meta.blocks[0].children) : blocks(meta.blocks) : inline(cell);
          return `<${tag}${span('rowspan', meta?.rowSpan)}${span('colspan', meta?.colSpan)} style="border:1px solid #888;padding:4px 8px;vertical-align:top">${content || '&nbsp;'}</${tag}>`;
        }).join('')}</tr>`).join('')}</table>`;
      }
    }).join('');
    const value = blocks(document.children);
    return { value, warnings: warnings.filter((warning, index) => warnings.findIndex(other => other.message === warning.message) === index) };
};

export const documentHtmlAdapter: OutputAdapter = { id: 'document-html', render: renderDocumentHtml };
