import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import { compileSamlangSourcesToHighIRSources } from 'samlang-core-compiler';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import { prettyPrintSamlangModule, prettyPrintHighIRModuleAsJS } from 'samlang-core-printer';
import { checkSources, lowerSourcesToLLVMModules } from 'samlang-core-services';

type SamlangDemoResult = {
  readonly interpreterPrinted?: string;
  readonly prettyPrintedProgram?: string;
  readonly jsString?: string;
  readonly llvmString?: string;
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

  const demoSamlangModule = checkedSources.forceGet(demoModuleReference);
  const jsProgram = compileSamlangSourcesToHighIRSources(checkedSources).get(demoModuleReference);
  const demoLLVMModule = lowerSourcesToLLVMModules(checkedSources).get(demoModuleReference);

  const interpreterPrinted = interpretSamlangModule(demoSamlangModule);
  const prettyPrintedProgram = prettyPrintSamlangModule(100, demoSamlangModule);
  const jsString =
    jsProgram != null
      ? prettyPrintHighIRModuleAsJS(100, jsProgram)
      : '// No JS output because there is no Main.main() function\n';
  const llvmString = demoLLVMModule != null ? prettyPrintLLVMModule(demoLLVMModule) : undefined;

  return {
    interpreterPrinted,
    prettyPrintedProgram,
    jsString,
    llvmString,
    errors: [],
  };
};

export default runSamlangDemo;
