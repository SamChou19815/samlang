import { Position, Range, ModuleReference } from '../ast/types';

export type CompletionItemKind = 2 | 3 | 5;
export type InsertTextFormat = 1 | 2;

export type AutoCompletionItem = {
  readonly label: string;
  readonly insertText: string;
  readonly insertTextFormat: InsertTextFormat;
  readonly kind: CompletionItemKind;
  readonly detail: string;
};

export interface LanguageServiceState {
  get allModulesWithError(): readonly ModuleReference[];
  getErrors(moduleReference: ModuleReference): readonly { readonly range: Range }[];
  update(moduleReference: ModuleReference, sourceCode: string): readonly ModuleReference[];
  remove(moduleReference: ModuleReference): readonly ModuleReference[];
}

export interface LanguageServices {
  get state(): LanguageServiceState;

  queryForHover(
    moduleReference: ModuleReference,
    position: Position
  ): { contents: Readonly<{ language: string; value: string }>[]; range: Range } | null;

  queryFoldingRanges(moduleReference: ModuleReference): readonly Range[] | null;

  queryDefinitionLocation(moduleReference: ModuleReference, position: Position): Location | null;

  autoComplete(moduleReference: ModuleReference, position: Position): AutoCompletionItem[];

  renameVariable(
    moduleReference: ModuleReference,
    position: Position,
    newName: string
  ): 'Invalid' | string | null;

  formatEntireDocument(moduleReference: ModuleReference): string | null;
}
