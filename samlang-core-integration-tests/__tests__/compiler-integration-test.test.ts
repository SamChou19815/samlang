import { runnableSamlangProgramTestCases } from '../test-programs';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { LLVMModule, prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import { MidIRCompilationUnit, midIRCompilationUnitToString } from 'samlang-core-ast/mir-nodes';
import {
  compileSamlangSourcesToHighIRSources,
  compileHighIrModuleToMidIRCompilationUnit,
  lowerHighIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import interpretLLVMModule from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretMidIRCompilationUnit from 'samlang-core-interpreter/mid-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import optimizeIRCompilationUnit, { optimizeHighIRFunctions } from 'samlang-core-optimization';
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

type MidIRTestCase = {
  readonly testCaseName: string;
  readonly expectedStandardOut: string;
  readonly compilationUnit: MidIRCompilationUnit;
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
    const optimizedFunctions = optimizeHighIRFunctions(highIRModule.functions);
    const compilationUnit = { ...highIRModule, functions: optimizedFunctions };
    return { testCaseName, expectedStandardOut, compilationUnit };
  });
})();

const highIRModuleToJSCode = (highIRModule: HighIRModule): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromHighIRModule(highIRModule, true)
  );

const testHighIROptimizerResult = (
  testCase: HighIRTestCase,
  optimizer: (compilationUnit: readonly HighIRFunction[]) => readonly HighIRFunction[]
): void => {
  const unoptimized = testCase.compilationUnit;
  const optimized = { ...testCase.compilationUnit, functions: optimizer(unoptimized.functions) };
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
        optimizeHighIRFunctions(it, { doesPerformLocalValueNumbering: true })
      );
    });

    it(`HIR[cse]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) =>
        optimizeHighIRFunctions(it, { doesPerformCommonSubExpressionElimination: true })
      );
    });

    it(`HIR[in]: ${testCase.testCaseName}`, () => {
      testHighIROptimizerResult(testCase, (it) =>
        optimizeHighIRFunctions(it, { doesPerformInlining: true })
      );
    });
  }

  it(`HIR[all]: ${testCase.testCaseName}`, () => {
    testHighIROptimizerResult(testCase, (it) => optimizeHighIRFunctions(it));
  });
});

const llvmBaseTestCases: readonly LLVMIRTestCase[] = (() => {
  expect(compileTimeErrors).toEqual([]);

  return runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => {
    const highIRModule = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));
    const optimizedFunctions = optimizeHighIRFunctions(highIRModule.functions);
    const compilationUnit = lowerHighIRModuleToLLVMModule({
      ...highIRModule,
      functions: optimizedFunctions,
    });
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

const mirBaseTestCases: readonly MidIRTestCase[] = (() => {
  expect(compileTimeErrors).toEqual([]);

  return runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => {
    const highIRModule = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));
    const compilationUnit = compileHighIrModuleToMidIRCompilationUnit(highIRModule);
    return { testCaseName, expectedStandardOut, compilationUnit };
  });
})();

const testMidIROptimizerResult = (
  testCase: MidIRTestCase,
  optimizer: (compilationUnit: MidIRCompilationUnit) => MidIRCompilationUnit
): void => {
  const unoptimized = testCase.compilationUnit;
  const optimized = optimizer(unoptimized);
  const interpretationResult = interpretMidIRCompilationUnit(optimized);
  if (interpretationResult !== testCase.expectedStandardOut) {
    const expected = testCase.expectedStandardOut;
    const unoptimizedString = midIRCompilationUnitToString(unoptimized);
    const optimizedString = midIRCompilationUnitToString(optimized);
    fail(
      `Expected:\n${expected}\nActual:\n${interpretationResult}\nUnoptimized MIR:${unoptimizedString}\nOptimized MIR:${optimizedString}`
    );
  }
};

mirBaseTestCases.forEach((testCase) => {
  // @ts-expect-error: process type is in @types/node, but we deliberatively excludes it to prevent core package depending on node.
  if (process.env.CI) {
    it(`IR[no-opt]: ${testCase.testCaseName}`, () => {
      let result: string;
      try {
        result = interpretMidIRCompilationUnit(testCase.compilationUnit);
      } catch {
        fail(midIRCompilationUnitToString(testCase.compilationUnit));
      }
      expect(result).toBe(testCase.expectedStandardOut);
    });

    it(`IR[vn]: ${testCase.testCaseName}`, () => {
      testMidIROptimizerResult(testCase, (it) =>
        optimizeIRCompilationUnit(it, { doesPerformLocalValueNumbering: true })
      );
    });

    it(`IR[cse]: ${testCase.testCaseName}`, () => {
      testMidIROptimizerResult(testCase, (it) =>
        optimizeIRCompilationUnit(it, { doesPerformCommonSubExpressionElimination: true })
      );
    });

    it(`IR[inl]: ${testCase.testCaseName}`, () => {
      testMidIROptimizerResult(testCase, (it) =>
        optimizeIRCompilationUnit(it, { doesPerformInlining: true })
      );
    });

    it(`IR[all]: ${testCase.testCaseName}`, () => {
      testMidIROptimizerResult(testCase, (it) => optimizeIRCompilationUnit(it));
    });
  }
});
