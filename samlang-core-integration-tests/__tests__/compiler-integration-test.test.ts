import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  compileSamlangSourcesToMidIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRModuleToLLVMModule,
} from 'samlang-core-compiler';
import interpretLLVMModule from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import { optimizeMidIRSourcesAccordingToConfiguration } from 'samlang-core-optimization';
import { prettyPrintMidIRSourcesAsJS } from 'samlang-core-printer';
import {
  createPrettierDocumentForInterpreterFromMidIRSources,
  createPrettierDocumentFromMidIRSources,
  // eslint-disable-next-line import/no-internal-modules
} from 'samlang-core-printer/printer-js';
// eslint-disable-next-line import/no-internal-modules
import { prettyPrintAccordingToPrettierAlgorithm } from 'samlang-core-printer/printer-prettier-core';
import { checkSources } from 'samlang-core-services';

import { runnableSamlangProgramTestCases } from '../test-programs';

describe('compiler-integration-tests', () => {
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

  const midIRUnoptimizedSingleSource = lowerHighIRSourcesToMidIRSources(
    compileSamlangSourcesToHighIRSources(checkedSources)
  );
  const midIRUnoptimizedCommonJSSource = prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromMidIRSources(midIRUnoptimizedSingleSource, true)
  );
  prettyPrintMidIRSourcesAsJS(100, midIRUnoptimizedSingleSource);
  const midIRMultipleSources = compileSamlangSourcesToMidIRSources(
    checkedSources,
    DEFAULT_BUILTIN_TYPING_CONTEXT
  );

  const testMIR = (
    commonJSCode: string,
    testCaseName: string,
    expectedStandardOut: string
  ): void => {
    const jsCode = `let printed = '';
${commonJSCode}
${encodeMainFunctionName(new ModuleReference([testCaseName]))}();
printed`;
    let interpretationResult: string;
    try {
      // eslint-disable-next-line no-eval
      interpretationResult = eval(jsCode);
    } catch (e) {
      fail(`${e.message}\n\n${jsCode}`);
      return;
    }
    if (interpretationResult !== expectedStandardOut) {
      fail(
        `Expected:\n${expectedStandardOut}\nActual:\n${interpretationResult}\nCode:\n${jsCode}\n\nUnoptimized Code:\n${midIRUnoptimizedCommonJSSource}`
      );
    }
  };

  describe('MIR[no-opt]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(midIRUnoptimizedSingleSource)
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[lvn]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(
        optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
          doesPerformLocalValueNumbering: true,
        })
      )
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[cse]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(
        optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
          doesPerformCommonSubExpressionElimination: true,
        })
      )
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[inl]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(
        optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
          doesPerformInlining: true,
        })
      )
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[loop]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(
        optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
          doesPerformLoopOptimization: true,
        })
      )
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[all]', () => {
    const commonJSCode = prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentForInterpreterFromMidIRSources(
        optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource)
      )
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
    it(`LLVM: ${testCaseName}`, () => {
      const compilationUnit = lowerMidIRModuleToLLVMModule(
        optimizeMidIRSourcesAccordingToConfiguration({
          ...midIRMultipleSources.forceGet(new ModuleReference([testCaseName])),
          mainFunctionNames: [ENCODED_COMPILED_PROGRAM_MAIN],
        })
      );

      let result: string;
      try {
        result = interpretLLVMModule(compilationUnit, ENCODED_COMPILED_PROGRAM_MAIN);
      } catch {
        fail(prettyPrintLLVMModule(compilationUnit));
      }
      expect(result).toBe(expectedStandardOut);
    });
  });
});
