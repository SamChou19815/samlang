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
import { prettyPrintMidIRSourcesAsJSSources } from 'samlang-core-ast/mir-nodes';
import { DEFAULT_BUILTIN_TYPING_CONTEXT } from 'samlang-core-checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from 'samlang-core-compiler';
import {
  setupLLVMInterpretationEnvironment,
  interpretLLVMSources,
} from 'samlang-core-interpreter/llvm-ir-interpreter';
import interpretSamlangModule from 'samlang-core-interpreter/source-level-interpreter';
import { optimizeHighIRSourcesAccordingToConfiguration } from 'samlang-core-optimization';
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

  const midIROptimizedSingleSource = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(
      compileSamlangSourcesToHighIRSources(checkedSources)
    )
  );
  it('MIR[all]', () => {
    let jsCode = `let printed;
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => { printed += line; printed += "\\n" };;
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };
${prettyPrintMidIRSourcesAsJSSources(midIROptimizedSingleSource)}
const result = {};

`;

    runnableSamlangProgramTestCases.forEach(({ testCaseName }) => {
      jsCode += `printed = ''
${encodeMainFunctionName(new ModuleReference([testCaseName]))}();
result['${testCaseName}'] = printed;

`;
    });
    jsCode += 'result';

    const expectedResult = Object.fromEntries(
      runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => [
        testCaseName,
        expectedStandardOut,
      ])
    );
    // eslint-disable-next-line no-eval
    expect(eval(jsCode)).toEqual(expectedResult);
  });

  const llvmSources = lowerMidIRSourcesToLLVMSources(midIROptimizedSingleSource);
  const llvmInterpretationEnvironment = setupLLVMInterpretationEnvironment(llvmSources);
  runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
    it(`LLVM: ${testCaseName}`, () => {
      let result: string;
      try {
        result = interpretLLVMSources(
          llvmInterpretationEnvironment,
          encodeMainFunctionName(new ModuleReference([testCaseName]))
        );
        llvmInterpretationEnvironment.printed = '';
      } catch {
        throw new Error(prettyPrintLLVMSources(llvmSources));
      }
      expect(result).toBe(expectedStandardOut);
    });
  });
});
