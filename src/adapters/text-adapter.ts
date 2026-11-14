import type { AdapterResult, OutputAdapter } from '../core/types';
import type { BlockNode, InlineNode, SemanticDocument } from '../core/semantic-document';
import { mathText } from '../core/math';
import { wechatTokens } from './tokens';

type Mode = 'wechat' | 'plain-text' | 'document';

const scriptText = (value: string, upper: boolean): string => {
  const from = '0123456789+-=()'; const to = upper ? '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾' : '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎';
  return [...value].every(c => from.includes(c)) ? [...value].map(c => to[from.indexOf(c)]).join('') : `${upper ? '^' : '_'}{${value}}`;
};

const inline = (nodes: readonly InlineNode[], mode: Mode): string => nodes.map((node) => {
  switch (node.type) {
    case 'text': return node.value;
    case 'break': return '\n';
    case 'code': return mode === 'document' ? node.value : `\`${node.value}\``;
    case 'strong': {
      const value = inline(node.children, mode);
      return mode === 'wechat' ? `${wechatTokens.strongOpen}${value}${wechatTokens.strongClose}` : value;
    }
    case 'emphasis': {
      const value = inline(node.children, mode);
      return mode === 'wechat' ? `${wechatTokens.emphasisOpen}${value}${wechatTokens.emphasisClose}` : value;
    }
    case 'math': return mathText(node);
    case 'superscript': return scriptText(inline(node.children, mode), true);
    case 'subscript': return scriptText(inline(node.children, mode), false);
    case 'underline': return inline(node.children, mode);
    case 'delete': return inline(node.children, mode);
    case 'link': { const label = inline(node.children, mode); return node.href.startsWith('#') || label === node.href ? label : `${label}${mode === 'wechat' ? '：' : ': '}${node.href}`; }
    case 'image': {
      const label = node.alt ? (mode === 'wechat' ? `[图：${node.alt}]` : `[image: ${node.alt}]`) : '';
      return node.src ? `${label}${label ? mode === 'wechat' ? '：' : ': ' : ''}${node.src}` : label;
    }
  }
}).join('');

const renderBlocks = (blocks: readonly BlockNode[], mode: Mode, depth = 0, separator = '\n\n'): string => blocks.map((block) => {
  switch (block.type) {
    case 'heading': return mode === 'wechat' ? `${wechatTokens.headingOpen}${inline(block.children, mode)}${wechatTokens.headingClose}` : inline(block.children, mode);
    case 'paragraph': return inline(block.children, mode);
    case 'thematicBreak': return mode === 'wechat' ? wechatTokens.divider : '---';
    case 'codeBlock': if (mode === 'document') return block.value; return `\`\`\`${block.language ?? ''}\n${block.value}\n\`\`\``;
    case 'quote': return renderBlocks(block.children, mode, depth).split('\n').map((line) => line ? `${mode === 'wechat' ? wechatTokens.quote : '>'} ${line}` : '').join('\n');
    case 'list': return block.items.map((item, index) => {
      const marker = item.checked === true ? '☑' : item.checked === false ? (mode === 'wechat' ? '☐' : '[ ]') : block.ordered ? `${(block.start ?? 1) + index}.` : mode === 'wechat' ? wechatTokens.bullet : '-';
      const nested = renderBlocks(item.children, mode, depth + 1, '\n');
      return `${'  '.repeat(depth)}${marker} ${nested}`;
    }).join('\n');
    case 'table': {
      const rows: string[][] = [];
      const occupied: boolean[][] = [];
      block.rows.forEach((row, r) => {
        rows[r] ??= []; occupied[r] ??= [];
        let column = 0;
        row.cells.forEach((cell, c) => {
          const meta = row.cellMeta?.[c];
          const cols = Math.min(1000, Math.max(1, meta?.colSpan ?? 1));
          const spanRows = Math.min(block.rows.length - r, Math.max(1, meta?.rowSpan ?? 1));
          while (occupied[r][column]) column++;
          rows[r][column] = meta?.blocks.length ? renderBlocks(meta.blocks, mode, depth) : inline(cell, mode);
          for (let y = r; y < r + spanRows; y++) {
            occupied[y] ??= []; rows[y] ??= [];
            for (let x = column; x < column + cols; x++) { occupied[y][x] = true; rows[y][x] ??= ''; }
          }
          column += cols;
        });
      });
      if (mode === 'document') return rows.map(row => Array.from({ length: row.length }, (_, i) => (row[i] ?? '').replace(/\n+/g, ' / ')).join('\t')).join('\n');
      const headerIndex = block.rows.findIndex(row => row.header);
      const headers = rows[headerIndex] ?? [];
      const data = rows.filter((_, index) => index !== headerIndex);
      if (!data.length) return headers.join(mode === 'wechat' ? '；' : '; ');
      return data.map(row => row.map((cell, index) => `${headers[index] || `Column ${index + 1}`}${mode === 'wechat' ? wechatTokens.separator : ': '} ${cell}`).join(mode === 'wechat' ? '\n' : '; ')).join('\n');
    }
    case 'unknown': return block.value;
  }
}).filter(Boolean).join(separator);

const createAdapter = (id: Mode): OutputAdapter => ({ id, render: (document: SemanticDocument): AdapterResult<string> => ({ value: renderBlocks(document.children, id), warnings: [] }) });

export const wechatAdapter = createAdapter('wechat');
export const plainTextAdapter = createAdapter('plain-text');

export const documentTextAdapter = createAdapter('document');
