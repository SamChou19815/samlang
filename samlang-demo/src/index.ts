import { ModuleReference } from '@dev-sam/samlang-core/ast/common-nodes';
import { prettyPrintLLVMSources } from '@dev-sam/samlang-core/ast/llvm-nodes';
import { prettyPrintMidIRSourcesAsJSSources } from '@dev-sam/samlang-core/ast/mir-nodes';
import { typeCheckSourceHandles } from '@dev-sam/samlang-core/checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from '@dev-sam/samlang-core/compiler';
import { optimizeHighIRSourcesAccordingToConfiguration } from '@dev-sam/samlang-core/optimization';
import prettyPrintSamlangModule from '@dev-sam/samlang-core/printer';

export type SamlangDemoResult = {
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

  const { checkedSources, compileTimeErrors } = typeCheckSourceHandles([
    [demoModuleReference, programString],
  ]);

  if (compileTimeErrors.length > 0) {
    const errors = compileTimeErrors.map((it) => it.toString()).sort((a, b) => a.localeCompare(b));
    return { errors };
  }

  const demoSamlangModule = checkedSources.forceGet(demoModuleReference);
  const midIRSources = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(
      compileSamlangSourcesToHighIRSources(checkedSources)
    )
  );

  const prettyPrintedProgram = prettyPrintSamlangModule(100, demoSamlangModule);
  const jsString = prettyPrintMidIRSourcesAsJSSources(midIRSources);
  const llvmString = prettyPrintLLVMSources(lowerMidIRSourcesToLLVMSources(midIRSources));

  return { prettyPrintedProgram, jsString, llvmString, errors: [] };
}
