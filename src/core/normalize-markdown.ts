import { marked, type Token, type Tokens } from 'marked';
import type { ContentInput } from './input';
import type { BlockNode, InlineNode, ListItem, SemanticDocument, TableRow } from './semantic-document';
import { isSafeUrl, normalizeLineEndings, type NormalizationResult } from './types';

const text = (value: string): InlineNode => ({ type: 'text', value });

const inline = (tokens: readonly Token[] | undefined): InlineNode[] =>
  (tokens ?? []).flatMap((token): InlineNode[] => {
    switch (token.type) {
      case 'text':
        return [text(token.text)];
      case 'br':
        return [{ type: 'break', hard: true }];
      case 'strong':
        return [{ type: 'strong', children: inline(token.tokens) }];
      case 'em':
        return [{ type: 'emphasis', children: inline(token.tokens) }];
      case 'del':
        return [{ type: 'delete', children: inline(token.tokens) }];
      case 'codespan':
        return [{ type: 'code', value: token.text }];
      case 'link':
        return isSafeUrl(token.href) ? [{ type: 'link', href: token.href, children: inline(token.tokens) }] : inline(token.tokens);
      case 'image':
        return [{ type: 'image', alt: token.text, ...(isSafeUrl(token.href) ? { src: token.href } : {}) }];
      case 'html':
        return [text(token.text.replace(/<[^>]*>/g, ''))];
      default:
        return 'text' in token ? [text(String(token.text))] : [];
    }
  });

const blocks = (tokens: readonly Token[] | undefined): BlockNode[] =>
  (tokens ?? []).flatMap((token): BlockNode[] => {
    switch (token.type) {
      case 'heading':
        return [{ type: 'heading', level: token.depth as 1 | 2 | 3 | 4 | 5 | 6, children: inline(token.tokens) }];
      case 'paragraph':
        return [{ type: 'paragraph', children: inline(token.tokens) }];
      case 'text':
        return [{ type: 'paragraph', children: inline(token.tokens ?? [token]) }];
      case 'blockquote':
        return [{ type: 'quote', children: blocks(token.tokens) }];
      case 'code':
        return [{ type: 'codeBlock', value: normalizeLineEndings(token.text), ...(token.lang ? { language: token.lang } : {}) }];
      case 'hr':
        return [{ type: 'thematicBreak' }];
      case 'list': {
        const listToken = token as Tokens.List;
        const items: ListItem[] = listToken.items.map((item: Tokens.ListItem) => ({
          ...(typeof item.checked === 'boolean' ? { checked: item.checked } : {}),
          children: blocks(item.tokens)
        }));
        return [{ type: 'list', ordered: token.ordered, ...(token.ordered && token.start !== 1 ? { start: token.start } : {}), items }];
      }
      case 'table': {
        const tableToken = token as Tokens.Table;
        const row = (cells: readonly Tokens.TableCell[], header: boolean): TableRow => ({
          header,
          cells: cells.map((cell) => inline(cell.tokens))
        });
        return [{ type: 'table', rows: [row(tableToken.header, true), ...tableToken.rows.map((cells: Tokens.TableCell[]) => row(cells, false))] }];
      }
      case 'html':
        return [{ type: 'unknown', value: token.text.replace(/<[^>]*>/g, '') }];
      default:
        return 'text' in token ? [{ type: 'unknown', value: String(token.text) }] : [];
    }
  });

export const normalizeMarkdown = (input: Extract<ContentInput, { kind: 'markdown' }>): NormalizationResult => {
  const content = normalizeLineEndings(input.content);
  if (!content.trim()) return { document: { type: 'document', children: [] }, warnings: [] };
  const tokens = marked.lexer(content, { gfm: true, breaks: false });
  const document: SemanticDocument = { type: 'document', children: blocks(tokens) };
  return { document, warnings: [] };
};
