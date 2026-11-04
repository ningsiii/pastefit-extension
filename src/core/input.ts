export interface SourceMetadata {
  readonly sourceUrl?: string;
}

export interface MarkdownInput {
  readonly kind: 'markdown';
  readonly content: string;
  readonly metadata?: SourceMetadata;
}

export interface HtmlInput {
  readonly kind: 'html';
  readonly content: string;
  readonly metadata?: SourceMetadata;
}

export interface PlainTextInput {
  readonly kind: 'plain';
  readonly content: string;
  readonly metadata?: SourceMetadata;
}

export type ContentInput = MarkdownInput | HtmlInput | PlainTextInput;
