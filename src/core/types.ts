import type { SemanticDocument as SemanticDocumentType } from './semantic-document';

export type { SemanticDocument } from './semantic-document';

export type WarningCode = 'dangerous-url' | 'unknown-content' | 'invalid-input' | 'unsupported-content';

export interface NormalizationWarning {
  readonly code: WarningCode;
  readonly message: string;
}

export interface AdapterWarning {
  readonly code: WarningCode;
  readonly message: string;
}

export interface NormalizationResult<T = SemanticDocumentType> {
  readonly document: T;
  readonly warnings: readonly NormalizationWarning[];
}

export interface AdapterResult<T> {
  readonly value: T;
  readonly warnings: readonly AdapterWarning[];
}

export interface OutputAdapter<T = string> {
  readonly id: string;
  render(document: SemanticDocumentType): AdapterResult<T>;
}

export const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, '\n');

export const isSafeUrl = (value: string): boolean => {
  try {
    const protocol = new URL(value, 'https://pastefit.invalid').protocol;
    return protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:';
  } catch {
    return false;
  }
};
