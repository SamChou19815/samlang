import { Location, ModuleReference, Position } from '../ast/types';

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
  getErrors(moduleReference: ModuleReference): readonly { readonly location: Location }[];
  update(moduleReference: ModuleReference, sourceCode: string): void;
  remove(moduleReference: ModuleReference): void;
}

export interface LanguageServices {
  get state(): LanguageServiceState;

  queryForHover(
    moduleReference: ModuleReference,
    position: Position,
  ): { contents: Readonly<{ language: string; value: string }>[]; location: Location } | null;

  queryFoldingRanges(moduleReference: ModuleReference): readonly Location[] | null;

  queryDefinitionLocation(moduleReference: ModuleReference, position: Position): Location | null;

  autoComplete(moduleReference: ModuleReference, position: Position): AutoCompletionItem[];

  renameVariable(
    moduleReference: ModuleReference,
    position: Position,
    newName: string,
  ): 'Invalid' | string | null;

  formatEntireDocument(moduleReference: ModuleReference): string | null;
}
