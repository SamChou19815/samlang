import { runnableSamlangProgramTestCases } from '../test-programs';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { LLVMModule, prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import interpretLLVMModule from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import optimizeHighIRModule from 'samlang-core-optimization';
import { prettyPrintHighIRModuleAsJS } from 'samlang-core-printer';
// eslint-disable-next-line import/no-internal-modules
import { createPrettierDocumentFromHighIRModule } from 'samlang-core-printer/printer-js';
// eslint-disable-next-line import/no-internal-modules
import { prettyPrintAccordingToPrettierAlgorithm } from 'samlang-core-printer/printer-prettier-core';
import { checkSources } from 'samlang-core-services';
import { checkNotNull } from 'samlang-core-utils';

type HighIRTestCase = {
  readonly testCaseName: string;
  readonly expectedStandardOut: string;
  readonly compilationUnit: HighIRModule;
};

type LLVMIRTestCase = {
  readonly testCaseName: string;
  readonly expectedStandardOut: string;
  readonly compilationUnit: LLVMModule;
};

const { checkedSources, compileTimeErrors } = checkSources(
  runnableSamlangProgramTestCases.map((it) => [
    new ModuleReference([it.testCaseName]),
    it.sourceCode,
  ])
);

// @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
if (process.env.CI) {
  runnableSamlangProgramTestCases.forEach((testCase) => {
    it(`source-level: ${testCase.testCaseName}`, () => {
      const samlangModule = checkNotNull(
        checkedSources.get(new ModuleReference([testCase.testCaseName]))
      );
      expect(interpretSamlangModule(samlangModule)).toBe(testCase.expectedStandardOut);
    });
  });
}

const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);

const highIRBaseTestCases: readonly HighIRTestCase[] = (() => {
  expect(compileTimeErrors).toEqual([]);

  return runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => {
    const highIRModule = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));
    return { testCaseName, expectedStandardOut, compilationUnit: highIRModule };
  });
})();

const highIRModuleToJSCode = (highIRModule: HighIRModule): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromHighIRModule(highIRModule, true)
  );

const testHighIROptimizerResult = (
  testCase: HighIRTestCase,
  optimizer: (compilationUnit: HighIRModule) => HighIRModule
): void => {
  const unoptimized = testCase.compilationUnit;
  const optimized = optimizer(unoptimized);
  // eslint-disable-next-line no-eval
  const interpretationResult = eval(highIRModuleToJSCode(optimized));
  if (interpretationResult !== testCase.expectedStandardOut) {
    const expected = testCase.expectedStandardOut;
    const unoptimizedString = prettyPrintHighIRModuleAsJS(100, unoptimized);
    const optimizedString = prettyPrintHighIRModuleAsJS(100, optimized);
    fail(
      `Expected:\n${expected}\nActual:\n${interpretationResult}\nUnoptimized MIR:${unoptimizedString}\nOptimized MIR:${optimizedString}`
    );
  }
};

highIRBaseTestCases.forEach((testCase) => {
  // @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
  if (process.env.CI) {
    it(`HIR[no-opt]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) => it);
    });

    it(`HIR[lvn]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) =>
        optimizeHighIRModule(it, { doesPerformLocalValueNumbering: true })
      );
    });

    it(`HIR[cse]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) =>
        optimizeHighIRModule(it, { doesPerformCommonSubExpressionElimination: true })
      );
    });

    it(`HIR[in]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) =>
        optimizeHighIRModule(it, { doesPerformInlining: true })
      );
    });
  }

  it(`HIR[all]: ${testCase.testCaseName}`, () => {
    testHighIROptimizerResult(testCase, (it) => optimizeHighIRModule(it));
  });
});

const llvmBaseTestCases: readonly LLVMIRTestCase[] = (() => {
  expect(compileTimeErrors).toEqual([]);

  return runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => {
    const highIRModule = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));
    const compilationUnit = lowerHighIRModuleToLLVMModule(optimizeHighIRModule(highIRModule));
    return { testCaseName, expectedStandardOut, compilationUnit };
  });
})();

llvmBaseTestCases.forEach((testCase) => {
  it(`LLVM[all]: ${testCase.testCaseName}`, () => {
    let result: string;
    try {
      result = interpretLLVMModule(testCase.compilationUnit);
    } catch {
      fail(prettyPrintLLVMModule(testCase.compilationUnit));
    }
    expect(result).toBe(testCase.expectedStandardOut);
  });
});

runnableSamlangProgramTestCases.forEach(({ testCaseName }) => {
  const highIRModule = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));
  it(`LLVM[no-opt]: ${testCaseName}`, () => {
    lowerHighIRModuleToLLVMModule(highIRModule);
  });
});
