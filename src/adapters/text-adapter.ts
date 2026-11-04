import type { AdapterResult, OutputAdapter } from '../core/types';
import type { BlockNode, InlineNode, SemanticDocument } from '../core/semantic-document';
import { wechatTokens } from './tokens';

type Mode = 'wechat' | 'plain-text';

const inline = (nodes: readonly InlineNode[], mode: Mode): string => nodes.map((node) => {
  switch (node.type) {
    case 'text': return node.value;
    case 'break': return '\n';
    case 'code': return `\`${node.value}\``;
    case 'strong': {
      const value = inline(node.children, mode);
      return mode === 'wechat' ? `${wechatTokens.strongOpen}${value}${wechatTokens.strongClose}` : value;
    }
    case 'emphasis': {
      const value = inline(node.children, mode);
      return mode === 'wechat' ? `${wechatTokens.emphasisOpen}${value}${wechatTokens.emphasisClose}` : value;
    }
    case 'delete': return inline(node.children, mode);
    case 'link': { const label = inline(node.children, mode); return label === node.href ? label : `${label}${mode === 'wechat' ? '：' : ': '}${node.href}`; }
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
    case 'codeBlock': return `\`\`\`${block.language ?? ''}\n${block.value}\n\`\`\``;
    case 'quote': return renderBlocks(block.children, mode, depth).split('\n').map((line) => line ? `${mode === 'wechat' ? wechatTokens.quote : '>'} ${line}` : '').join('\n');
    case 'list': return block.items.map((item, index) => {
      const marker = item.checked === true ? '☑' : item.checked === false ? (mode === 'wechat' ? '☐' : '[ ]') : block.ordered ? `${(block.start ?? 1) + index}.` : mode === 'wechat' ? wechatTokens.bullet : '-';
      const nested = renderBlocks(item.children, mode, depth + 1, '\n');
      return `${'  '.repeat(depth)}${marker} ${nested}`;
    }).join('\n');
    case 'table': {
      const headers = block.rows.find((row) => row.header)?.cells.map((cell) => inline(cell, mode)) ?? [];
      return block.rows.filter((row) => !row.header).map((row) => row.cells.map((cell, index) => `${headers[index] ?? `Column ${index + 1}`}${mode === 'wechat' ? wechatTokens.separator : ': '} ${inline(cell, mode)}`).join(mode === 'wechat' ? '\n' : '; ')).join('\n');
    }
    case 'unknown': return block.value;
  }
}).filter(Boolean).join(separator);

const createAdapter = (id: Mode): OutputAdapter => ({ id, render: (document: SemanticDocument): AdapterResult<string> => ({ value: renderBlocks(document.children, id), warnings: [] }) });

export const wechatAdapter = createAdapter('wechat');
export const plainTextAdapter = createAdapter('plain-text');
