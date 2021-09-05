import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMSources } from 'samlang-core-ast/llvm-nodes';
import { prettyPrintMidIRSourcesAsJSSources } from 'samlang-core-ast/mir-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from 'samlang-core-compiler';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import prettyPrintSamlangModule from 'samlang-core-printer';
import { checkSources } from 'samlang-core-services';

export type SamlangDemoResult = {
  readonly interpreterPrinted?: string;
  readonly prettyPrintedProgram?: string;
  readonly jsString?: string;
  readonly llvmString?: string;
  readonly errors: readonly string[];
};

/**
 * @param programString source code of a samlang program.
 * @returns result of running demo operation on it. See the type definition of `DemoResult`.
 */
export default function runSamlangDemo(programString: string): SamlangDemoResult {
  const demoModuleReference = new ModuleReference(['Demo']);

  const { checkedSources, compileTimeErrors } = checkSources(
    [[demoModuleReference, programString]],
    DEFAULT_BUILTIN_TYPING_CONTEXT
  );

  if (compileTimeErrors.length > 0) {
    return {
      errors: compileTimeErrors.map((it) => it.toString()).sort((a, b) => a.localeCompare(b)),
    };
  }

  const demoSamlangModule = checkedSources.forceGet(demoModuleReference);
  const midIRSources = lowerHighIRSourcesToMidIRSources(
    compileSamlangSourcesToHighIRSources(checkedSources),
    /* referenceCounting */ false
  );
  const llvmSources = lowerMidIRSourcesToLLVMSources(midIRSources);

  const interpreterPrinted = interpretSamlangModule(demoSamlangModule);
  const prettyPrintedProgram = prettyPrintSamlangModule(100, demoSamlangModule);
  const jsString = prettyPrintMidIRSourcesAsJSSources(midIRSources);
  const llvmString = prettyPrintLLVMSources(llvmSources);

  return {
    interpreterPrinted,
    prettyPrintedProgram,
    jsString,
    llvmString,
    errors: [],
  };
}
