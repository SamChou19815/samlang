import { runnableSamlangProgramTestCases } from '../test-programs';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import interpretLLVMModule from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import {
  OptimizationConfiguration,
  optimizeHighIRModuleAccordingToConfiguration,
} from 'samlang-core-optimization';
// eslint-disable-next-line import/no-internal-modules
import { createPrettierDocumentFromHighIRModule } from 'samlang-core-printer/printer-js';
// eslint-disable-next-line import/no-internal-modules
import { prettyPrintAccordingToPrettierAlgorithm } from 'samlang-core-printer/printer-prettier-core';
import { checkSources } from 'samlang-core-services';

const { checkedSources, compileTimeErrors } = checkSources(
  runnableSamlangProgramTestCases.map((it) => [
    new ModuleReference([it.testCaseName]),
    it.sourceCode,
  ])
);

// @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
if (process.env.CI) {
  expect(compileTimeErrors).toEqual([]);
  runnableSamlangProgramTestCases.forEach((testCase) => {
    it(`source-level: ${testCase.testCaseName}`, () => {
      const samlangModule = checkedSources.forceGet(new ModuleReference([testCase.testCaseName]));
      expect(interpretSamlangModule(samlangModule)).toBe(testCase.expectedStandardOut);
    });
  });
}

const hirSources = compileSamlangSourcesToHighIRSources(checkedSources, {});

const highIRModuleToJSCode = (highIRModule: HighIRModule): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromHighIRModule(highIRModule, true)
  );

const testHIR = (
  program: HighIRModule,
  expectedStandardOut: string,
  optimizationConfig?: OptimizationConfiguration
): void => {
  const jsCode = highIRModuleToJSCode(
    optimizeHighIRModuleAccordingToConfiguration(program, optimizationConfig)
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
    const unoptimizedJSCode = highIRModuleToJSCode(program);
    fail(
      `Expected:\n${expectedStandardOut}\nActual:\n${interpretationResult}\nCode:\n${jsCode}\n\nUnoptimized Code:\n${unoptimizedJSCode}`
    );
  }
};

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  const program = hirSources.forceGet(new ModuleReference([testCaseName]));

  it(`HIR[no-opt]: ${testCaseName}`, () => {
    testHIR(program, expectedStandardOut, {});
  });
  it(`HIR[lvn]: ${testCaseName}`, () => {
    testHIR(program, expectedStandardOut, { doesPerformLocalValueNumbering: true });
  });
  it(`HIR[cse]: ${testCaseName}`, () => {
    testHIR(program, expectedStandardOut, { doesPerformCommonSubExpressionElimination: true });
  });
  it(`HIR[inl]: ${testCaseName}`, () => {
    testHIR(program, expectedStandardOut, { doesPerformInlining: true });
  });
  it(`HIR[all]: ${testCaseName}`, () => {
    testHIR(program, expectedStandardOut);
  });
});

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  it(`LLVM: ${testCaseName}`, () => {
    const compilationUnit = lowerHighIRModuleToLLVMModule(
      optimizeHighIRModuleAccordingToConfiguration(
        hirSources.forceGet(new ModuleReference([testCaseName]))
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
