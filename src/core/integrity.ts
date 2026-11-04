import type { SemanticDocument } from './semantic-document';

const documentText = (document: SemanticDocument): string => JSON.stringify(document);

export const missingRequiredValues = (document: SemanticDocument, output: string, required: readonly string[]): string[] => {
  const source = documentText(document);
  return required.filter((value) => !source.includes(value) || !output.replace(/\r\n?/g, '\n').includes(value));
};
