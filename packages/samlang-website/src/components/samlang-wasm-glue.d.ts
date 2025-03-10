// @generated

export function init(url?: string): Promise<void>;

type Range = {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

type Diagnostic = {
  severity: 8;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
};

export type CompilationResult = string | { tsCode: string; interpreterResult: string };

export function compile(source: string): Promise<CompilationResult>;

export class State {
  updateSource(source: string): void;
  getErrors(): Diagnostic[];
  queryType(
    line: number,
    column: number
  ): { contents: Array<{ language: string; value: string }>; range: Range } | null;
  queryDefinitionLocation(line: number, column: number): Range | null;
  autoComplete(
    line: number,
    column: number
  ): Array<{
    range: Range;
    label: string;
    insertText: string;
    detail: string;
    insertTextFormat: number;
    kind: number;
  }>;
}
