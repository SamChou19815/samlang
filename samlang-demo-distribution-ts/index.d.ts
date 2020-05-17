type DemoResult = {
  readonly interpreterResult: string | null;
  readonly interpreterPrinted: string | null;
  readonly prettyPrintedProgram: string | null;
  readonly assemblyString: string | null;
  readonly errors: readonly string[];
};

/**
 * @param programString source code of a samlang program.
 * @returns result of running demo operation on it. See the type definition of `DemoResult`.
 */
declare const runDemo: (programString: string) => DemoResult;
export = runDemo;
