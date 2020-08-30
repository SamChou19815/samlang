import {
  ModuleReference,
  checkSources,
  compileSamlangSourcesToHighIRSources,
  lowerSourcesToAssemblyPrograms,
  interpretSamlangModule,
  prettyPrintSamlangModule,
  prettyPrintHighIRModuleAsJS,
  assemblyProgramToString,
} from '@dev-sam/samlang-core';

type SamlangDemoResult = {
  readonly interpreterPrinted?: string;
  readonly prettyPrintedProgram?: string;
  readonly jsString?: string;
  readonly assemblyString?: string;
  readonly errors: readonly string[];
};

/**
 * @param programString source code of a samlang program.
 * @returns result of running demo operation on it. See the type definition of `DemoResult`.
 */
const runSamlangDemo = (programString: string): SamlangDemoResult => {
  const demoModuleReference = new ModuleReference(['Demo']);

  const { checkedSources, compileTimeErrors } = checkSources([
    [demoModuleReference, programString],
  ]);

  if (compileTimeErrors.length > 0) {
    return {
      errors: compileTimeErrors.map((it) => it.toString()).sort((a, b) => a.localeCompare(b)),
    };
  }

  const demoSamlangModule = checkedSources.get(demoModuleReference);
  const jsProgram = compileSamlangSourcesToHighIRSources(checkedSources).get(demoModuleReference);
  const demoAssemblyProgram = lowerSourcesToAssemblyPrograms(checkedSources).get(
    demoModuleReference
  );

  // istanbul ignore next
  if (demoSamlangModule == null) throw new Error();

  const interpreterPrinted = interpretSamlangModule(demoSamlangModule);
  const prettyPrintedProgram = prettyPrintSamlangModule(100, demoSamlangModule);
  const jsString =
    jsProgram != null
      ? prettyPrintHighIRModuleAsJS(jsProgram)
      : '// No JS output because there is no Main.main() function\n';
  const assemblyString =
    demoAssemblyProgram != null ? assemblyProgramToString(demoAssemblyProgram) : undefined;

  return {
    interpreterPrinted,
    prettyPrintedProgram,
    jsString,
    assemblyString,
    errors: [],
  };
};

export default runSamlangDemo;