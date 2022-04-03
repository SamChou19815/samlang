import {
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_THROW,
  encodeMainFunctionName,
} from '../ast/common-names';
import { ModuleReference } from '../ast/common-nodes';
import { prettyPrintMidIRSourcesAsJSSources } from '../ast/mir-nodes';
import { typeCheckSourceHandles } from '../checker';
import {
  compileSamlangSourcesToHighIRSources,
  lowerHighIRSourcesToMidIRSources,
  lowerMidIRSourcesToWasmModule,
} from '../compiler';
import samlangGeneratedWebAssemblyLoader from '../loader';
import { optimizeHighIRSourcesAccordingToConfiguration } from '../optimization';
import { runnableSamlangProgramTestCases } from '../test-programs';

describe('compiler-integration-tests', () => {
  const { checkedSources, compileTimeErrors } = typeCheckSourceHandles(
    runnableSamlangProgramTestCases.map((it) => [ModuleReference([it.testCaseName]), it.sourceCode])
  );

  expect(compileTimeErrors.map((it) => it.toString())).toEqual([]);

  const midIROptimizedSingleSource = lowerHighIRSourcesToMidIRSources(
    optimizeHighIRSourcesAccordingToConfiguration(
      compileSamlangSourcesToHighIRSources(checkedSources)
    )
  );
  const expectedResult = Object.fromEntries(
    runnableSamlangProgramTestCases.map(({ testCaseName, expectedStandardOut }) => [
      testCaseName,
      expectedStandardOut,
    ])
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
${encodeMainFunctionName(ModuleReference([testCaseName]))}();
result['${testCaseName}'] = printed;

`;
    });
    jsCode += 'result';

    // eslint-disable-next-line no-eval
    expect(eval(jsCode)).toEqual(expectedResult);
  });

  it('WASM[all]', () => {
    const wasmModule = lowerMidIRSourcesToWasmModule(midIROptimizedSingleSource);

    let printed = '';
    const mainFunctions = samlangGeneratedWebAssemblyLoader(
      wasmModule.emitBinary(),
      (pointerToString) => ({
        __Builtins_println(p: number) {
          printed += `${pointerToString(p)}\n`;
          return 0;
        },
      })
    );
    wasmModule.dispose();

    const actualResult = Object.fromEntries(
      runnableSamlangProgramTestCases.map(({ testCaseName }) => {
        const mainFunctionName = encodeMainFunctionName(ModuleReference([testCaseName]));
        mainFunctions[mainFunctionName]?.();
        const result = printed;
        printed = '';
        return [testCaseName, result];
      })
    );
    expect(actualResult).toEqual(expectedResult);
  });
});
