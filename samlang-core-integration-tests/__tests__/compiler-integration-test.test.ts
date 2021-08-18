import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import { ModuleReference } from 'samlang-core-ast/common-nodes';
import { prettyPrintLLVMSources } from 'samlang-core-ast/llvm-nodes';
import type { MidIRSources } from 'samlang-core-ast/mir-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from 'samlang-core-compiler';
import interpretLLVMSources from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import { optimizeMidIRSourcesAccordingToConfiguration } from 'samlang-core-optimization';
// eslint-disable-next-line import/no-internal-modules
import { createPrettierDocumentsForExportingModuleFromMidIRSources } from 'samlang-core-printer/printer-js';
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

  const getCommonJSCode = (source: MidIRSources) =>
    createPrettierDocumentsForExportingModuleFromMidIRSources(source)
      .map((doc) => prettyPrintAccordingToPrettierAlgorithm(100, doc))
      .join('');

  const midIRUnoptimizedSingleSource = lowerHighIRSourcesToMidIRSources(
    compileSamlangSourcesToHighIRSources(checkedSources)
  );
  const midIROptimizedSingleSource = optimizeMidIRSourcesAccordingToConfiguration(
    midIRUnoptimizedSingleSource
  );
  const midIRUnoptimizedCommonJSSource = getCommonJSCode(midIRUnoptimizedSingleSource);

  const testMIR = (
    commonJSCode: string,
    testCaseName: string,
    expectedStandardOut: string
  ): void => {
    const jsCode = `let printed = '';
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => { printed += line; printed += "\\n" };;
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };
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
    const commonJSCode = getCommonJSCode(midIRUnoptimizedSingleSource);
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[lvn]', () => {
    const commonJSCode = getCommonJSCode(
      optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
        doesPerformLocalValueNumbering: true,
      })
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[cse]', () => {
    const commonJSCode = getCommonJSCode(
      optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
        doesPerformCommonSubExpressionElimination: true,
      })
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[inl]', () => {
    const commonJSCode = getCommonJSCode(
      optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
        doesPerformInlining: true,
      })
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[loop]', () => {
    const commonJSCode = getCommonJSCode(
      optimizeMidIRSourcesAccordingToConfiguration(midIRUnoptimizedSingleSource, {
        doesPerformLoopOptimization: true,
      })
    );
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  describe('MIR[all]', () => {
    const commonJSCode = getCommonJSCode(midIROptimizedSingleSource);
    runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) =>
      it(testCaseName, () => testMIR(commonJSCode, testCaseName, expectedStandardOut))
    );
  });

  const llvmSources = lowerMidIRSourcesToLLVMSources(midIROptimizedSingleSource);
  runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
    it(`LLVM: ${testCaseName}`, () => {
      let result: string;
      try {
        result = interpretLLVMSources(
          llvmSources,
          encodeMainFunctionName(new ModuleReference([testCaseName]))
        );
      } catch {
        fail(prettyPrintLLVMSources(llvmSources));
      }
      expect(result).toBe(expectedStandardOut);
    });
  });
});
