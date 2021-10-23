import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_FREE,
  encodeMainFunctionName,
} from '../ast/common-names';
import { ModuleReference } from '../ast/common-nodes';
import { prettyPrintLLVMSources } from '../ast/llvm-nodes';
import { prettyPrintMidIRSourcesAsJSSources } from '../ast/mir-nodes';
import { typeCheckSourceHandles } from '../checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToLLVMSources,
} from '../compiler';
import { setupLLVMInterpretationEnvironment, interpretLLVMSources } from '../llvm-ir-interpreter';
import { optimizeHighIRSourcesAccordingToConfiguration } from '../optimization';
import { runnableSamlangProgramTestCases } from '../test-programs';

describe('compiler-integration-tests', () => {
  const { checkedSources, compileTimeErrors } = typeCheckSourceHandles(
    runnableSamlangProgramTestCases.map((it) => [
      new ModuleReference([it.testCaseName]),
      it.sourceCode,
    ])
  );

  expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

  const midIROptimizedSingleSource = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(
      compileSamlangSourcesToHighIRSources(checkedSources)
    )
  );
  it('MIR[all]', () => {
    let jsCode = `let printed;
const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = ([,a], [,b]) => [1,a + b];
const ${ENCODED_FUNCTION_NAME_PRINTLN} = ([,line]) => { printed += line; printed += "\\n" };;
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = ([,v]) => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => [1,String(v)];
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };
const ${ENCODED_FUNCTION_NAME_FREE} = (v) => {};
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