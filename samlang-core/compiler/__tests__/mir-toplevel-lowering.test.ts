import compileHighIrModuleToMidIRCompilationUnit from '../mir-toplevel-lowering';

import { HIR_RETURN, HIR_STRING } from 'samlang-core-ast/hir-expressions';
import { midIRCompilationUnitToString } from 'samlang-core-ast/mir-nodes';

it('compileHighIrModuleToMidIRCompilationUnit dummy source test', () => {
  expect(
    midIRCompilationUnitToString(compileHighIrModuleToMidIRCompilationUnit({ functions: [] }))
  ).toBe('\n');
});

it('compileHighIrModuleToMidIRCompilationUnit full integration test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrModuleToMidIRCompilationUnit({
        functions: [
          {
            name: '_module__class_Main_function_main',
            parameters: ['foo', 'bar', 'baz'],
            hasReturn: true,
            body: [HIR_RETURN(HIR_STRING('hello world'))],
          },
          {
            name: 'fooBar',
            parameters: ['foo', 'bar', 'baz'],
            hasReturn: true,
            body: [HIR_RETURN(HIR_STRING('hello world'))],
          },
        ],
      })
    )
  ).toBe(`const GLOBAL_STRING_0 = "hello world";

function _module__class_Main_function_main {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}

function fooBar {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}
`);
});
