import { Marked, type Token, type Tokens } from 'marked';
import markedFootnote, { type Footnote } from 'marked-footnote';
import { referenceWarnings } from './references';
import type { ReferenceIssue } from './semantic-document';
import { mathExtensions, scriptHtmlExtension } from './math-markdown';
import type { ContentInput } from './input';
import type { BlockNode, InlineNode, ListItem, SemanticDocument, TableRow } from './semantic-document';
import { isSafeUrl, normalizeLineEndings, type NormalizationResult } from './types';

// A parser per input prevents the footnote extension's lexer state leaking across copies.
type NoteRef = { type: 'pastefitNoteRef'; raw: string; label: string; anchor?: string; issue?: ReferenceIssue };
type NoteDefinition = Footnote & { anchor?: string; issue?: ReferenceIssue };
const noteReference = {
  name: 'pastefitNoteRef', level: 'inline' as const,
  start: (src: string): number => src.indexOf('[^'),
  tokenizer(src: string): NoteRef | undefined {
    const match = /^\[\^([^\]\n]+)\]/.exec(src);
    return match ? { type: 'pastefitNoteRef', raw: match[0], label: match[1] } : undefined;
  }
};
const connectNotes = (tokens: readonly Token[]): void => {
  const definitions: NoteDefinition[] = []; const references: NoteRef[] = [];
  const walk = (items: readonly Token[]): void => { for (const token of items) {
    if (token.type === 'footnotes') continue;
    if (token.type === 'footnote') { definitions.push(token as NoteDefinition); walk((token as Footnote).content); }
    else if (token.type === 'pastefitNoteRef') references.push(token as NoteRef);
    else if (token.type === 'list') token.items.forEach((item: Tokens.ListItem) => walk(item.tokens));
    else if (token.type === 'table') [...token.header, ...token.rows.flat()].forEach((cell: Tokens.TableCell) => walk(cell.tokens));
    else if ('tokens' in token && Array.isArray(token.tokens)) walk(token.tokens);
  } };
  walk(tokens);
  // Labels are kept exactly as written; never guess a similarly named note.
  const groups = new Map<string, NoteDefinition[]>();
  definitions.forEach((definition, i) => { definition.anchor = `pf-ref-note-${i + 1}`; groups.set(definition.label, [...(groups.get(definition.label) ?? []), definition]); });
  for (const ref of references) {
    const matches = groups.get(ref.label) ?? [];
    if (matches.length === 1) ref.anchor = matches[0].anchor;
    else ref.issue = matches.length ? 'duplicate-note' : 'missing-note';
  }
  for (const definition of definitions) {
    if (groups.get(definition.label)!.length > 1) definition.issue = 'duplicate-note';
    else if (!references.some(ref => ref.label === definition.label)) definition.issue = 'unreferenced-note';
  }
};

const text = (value: string): InlineNode => ({ type: 'text', value });

const inline = (tokens: readonly Token[] | undefined): InlineNode[] =>
  (tokens ?? []).flatMap((token): InlineNode[] => {
    switch (token.type) {
      case 'pastefitNoteRef': {
        const ref = token as NoteRef;
        return ref.anchor ? [{ type: 'superscript', children: [{ type: 'link', href: `#${ref.anchor}`, children: [text(`[${ref.label}]`)] }] }] : [{ type: 'text', value: ref.raw, referenceIssue: ref.issue, referenceLabel: ref.label }];
      }
      case 'scriptHtml': return [{ type: token.tag === 'sup' ? 'superscript' : token.tag === 'sub' ? 'subscript' : 'underline', children: inline(token.tokens) }];
      case 'mathInline': return [{ type: 'math', source: token.text, format: 'latex', display: token.display }];
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
        if (token.href.startsWith('#')) return [{ type: 'text', value: '', referenceIssue: 'missing-target', referenceLabel: token.text }, ...inline(token.tokens)];
        return isSafeUrl(token.href) ? [{ type: 'link', href: token.href, ...(token.title ? { title: token.title } : {}), children: inline(token.tokens) }] : inline(token.tokens);
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
      case 'footnotes': return [];
      case 'footnote': {
        const note = token as NoteDefinition;
        const marker: InlineNode = { type: 'text', value: `[${note.label}] `, anchor: note.anchor, ...(note.issue ? { referenceIssue: note.issue, referenceLabel: note.label } : {}) };
        const content = blocks(note.content);
        if (content[0]?.type === 'paragraph') return [{ ...content[0], children: [marker, ...content[0].children] }, ...content.slice(1)];
        return [{ type: 'paragraph', children: [marker] }, ...content];
      }
      case 'mathBlock': return [{ type: 'paragraph', children: [{ type: 'math', source: token.text, format: 'latex', display: true }] }];
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
  const parser = new Marked(markedFootnote(), { extensions: [...mathExtensions, scriptHtmlExtension, noteReference], gfm: true, breaks: false });
  const tokens = parser.lexer(content);
  connectNotes(tokens);
  const document: SemanticDocument = { type: 'document', children: blocks(tokens) };
  return { document, warnings: referenceWarnings(document).map(message => ({ code: 'unsupported-content', message })) };
};
