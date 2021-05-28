import { runnableSamlangProgramTestCases } from '../test-programs';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import type { MidIRModule } from 'samlang-core-ast/mir-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import {
  compileSamlangSourcesToMidIRSources,
  lowerMidIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import interpretLLVMModule from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import {
  OptimizationConfiguration,
  optimizeMidIRModuleAccordingToConfiguration,
} from 'samlang-core-optimization';
// eslint-disable-next-line import/no-internal-modules
import { createPrettierDocumentFromMidIRModule } from 'samlang-core-printer/printer-js';
// eslint-disable-next-line import/no-internal-modules
import { prettyPrintAccordingToPrettierAlgorithm } from 'samlang-core-printer/printer-prettier-core';
import { checkSources } from 'samlang-core-services';

const { checkedSources, compileTimeErrors } = checkSources(
  runnableSamlangProgramTestCases.map((it) => [
    new ModuleReference([it.testCaseName]),
    it.sourceCode,
  ]),
  DEFAULT_BUILTIN_TYPING_CONTEXT
);

expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

// @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
if (process.env.CI) {
  runnableSamlangProgramTestCases.forEach((testCase) => {
    it(`source-level: ${testCase.testCaseName}`, () => {
      const samlangModule = checkedSources.forceGet(new ModuleReference([testCase.testCaseName]));
      expect(interpretSamlangModule(samlangModule)).toBe(testCase.expectedStandardOut);
    });
  });
}

const midSources = compileSamlangSourcesToMidIRSources(
  checkedSources,
  DEFAULT_BUILTIN_TYPING_CONTEXT
);

const midIRModuleToJSCode = (midIRModule: MidIRModule): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromMidIRModule(midIRModule, true)
  );

const testMIR = (
  program: MidIRModule,
  expectedStandardOut: string,
  optimizationConfig?: OptimizationConfiguration
): void => {
  const jsCode = midIRModuleToJSCode(
    optimizeMidIRModuleAccordingToConfiguration(program, optimizationConfig)
  );
  let interpretationResult: string;
  try {
    // eslint-disable-next-line no-eval
    interpretationResult = eval(jsCode);
  } catch (e) {
    fail(`${e.message}\n\n${jsCode}`);
    return;
  }
  if (interpretationResult !== expectedStandardOut) {
    const unoptimizedJSCode = midIRModuleToJSCode(program);
    fail(
      `Expected:\n${expectedStandardOut}\nActual:\n${interpretationResult}\nCode:\n${jsCode}\n\nUnoptimized Code:\n${unoptimizedJSCode}`
    );
  }
};

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  const program = midSources.forceGet(new ModuleReference([testCaseName]));

  it(`MIR[no-opt]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut, {});
  });
  it(`MIR[lvn]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut, { doesPerformLocalValueNumbering: true });
  });
  it(`MIR[cse]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut, { doesPerformCommonSubExpressionElimination: true });
  });
  it(`MIR[inl]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut, { doesPerformInlining: true });
  });
  it(`MIR[loop]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut, { doesPerformLoopOptimization: true });
  });
  it(`MIR[all]: ${testCaseName}`, () => {
    testMIR(program, expectedStandardOut);
  });
});

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  it(`LLVM: ${testCaseName}`, () => {
    const compilationUnit = lowerMidIRModuleToLLVMModule(
      optimizeMidIRModuleAccordingToConfiguration(
        midSources.forceGet(new ModuleReference([testCaseName]))
      )
    );

    let result: string;
    try {
      result = interpretLLVMModule(compilationUnit);
    } catch {
      fail(prettyPrintLLVMModule(compilationUnit));
    }
    expect(result).toBe(expectedStandardOut);
  });
});
