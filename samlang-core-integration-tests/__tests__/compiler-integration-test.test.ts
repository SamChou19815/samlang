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
// eslint-disable-next-line import/no-internal-modules
import { createPrettierDocumentFromHighIRModule } from 'samlang-core-printer/printer-js';
// eslint-disable-next-line import/no-internal-modules
import { prettyPrintAccordingToPrettierAlgorithm } from 'samlang-core-printer/printer-prettier-core';
import { checkSources } from 'samlang-core-services';
import { checkNotNull } from 'samlang-core-utils';

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
      const samlangModule = checkNotNull(
        checkedSources.get(new ModuleReference([testCase.testCaseName]))
      );
      expect(interpretSamlangModule(samlangModule)).toBe(testCase.expectedStandardOut);
    });
  });
}

const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);

const highIRModuleToJSCode = (highIRModule: HighIRModule): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    100,
    createPrettierDocumentFromHighIRModule(highIRModule, true)
  );

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  const program = checkNotNull(hirSources.get(new ModuleReference([testCaseName])));

  it(`HIR: ${testCaseName}`, () => {
    const jsCode = highIRModuleToJSCode(program);
    // eslint-disable-next-line no-eval
    const interpretationResult = eval(jsCode);
    if (interpretationResult !== expectedStandardOut) {
      fail(`Expected:\n${expectedStandardOut}\nActual:\n${interpretationResult}\nCode: ${jsCode}`);
    }
  });
});

runnableSamlangProgramTestCases.forEach(({ testCaseName, expectedStandardOut }) => {
  it(`LLVM: ${testCaseName}`, () => {
    const compilationUnit = lowerHighIRModuleToLLVMModule(
      checkNotNull(hirSources.get(new ModuleReference([testCaseName])))
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
