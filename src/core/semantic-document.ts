export type InlineNode =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'break'; readonly hard: boolean }
  | { readonly type: 'emphasis'; readonly children: readonly InlineNode[] }
  | { readonly type: 'strong'; readonly children: readonly InlineNode[] }
  | { readonly type: 'delete'; readonly children: readonly InlineNode[] }
  | { readonly type: 'code'; readonly value: string }
  | { readonly type: 'link'; readonly href: string; readonly children: readonly InlineNode[] }
  | { readonly type: 'image'; readonly alt: string; readonly src?: string };

export type BlockNode =
  | { readonly type: 'heading'; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly children: readonly InlineNode[] }
  | { readonly type: 'paragraph'; readonly children: readonly InlineNode[] }
  | { readonly type: 'list'; readonly ordered: boolean; readonly start?: number; readonly items: readonly ListItem[] }
  | { readonly type: 'quote'; readonly children: readonly BlockNode[] }
  | { readonly type: 'codeBlock'; readonly value: string; readonly language?: string }
  | { readonly type: 'thematicBreak' }
  | { readonly type: 'table'; readonly rows: readonly TableRow[] }
  | { readonly type: 'unknown'; readonly value: string };

export interface ListItem {
  readonly checked?: boolean;
  readonly children: readonly BlockNode[];
}

export interface TableRow {
  readonly header: boolean;
  readonly cells: readonly (readonly InlineNode[])[];
}

export interface SemanticDocument {
  readonly type: 'document';
  readonly children: readonly BlockNode[];
}
