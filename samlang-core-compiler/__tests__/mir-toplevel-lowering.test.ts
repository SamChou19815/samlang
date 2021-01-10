import compileHighIrModuleToMidIRCompilationUnit from '../mir-toplevel-lowering';

import {
  HIR_FUNCTION_CALL,
  HIR_LET,
  HIR_NAME,
  HIR_RETURN,
  HIR_VARIABLE,
  HIR_ZERO,
} from 'samlang-core-ast/hir-expressions';
import { HIR_STRING_TYPE, HIR_INT_TYPE, HIR_FUNCTION_TYPE } from 'samlang-core-ast/hir-types';
import { midIRCompilationUnitToString } from 'samlang-core-ast/mir-nodes';

it('compileHighIrModuleToMidIRCompilationUnit dummy source test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrModuleToMidIRCompilationUnit({
        globalVariables: [],
        typeDefinitions: [],
        functions: [],
      })
    )
  ).toBe('\n');
});

it('compileHighIrModuleToMidIRCompilationUnit full integration test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrModuleToMidIRCompilationUnit({
        globalVariables: [{ name: 'GLOBAL_STRING_0', content: 'hello world' }],
        typeDefinitions: [],
        functions: [
          {
            name: '_module__class_Main_function_main',
            parameters: ['foo', 'bar', 'baz'],
            type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE, HIR_INT_TYPE], HIR_STRING_TYPE),
            body: [HIR_RETURN(HIR_NAME('GLOBAL_STRING_0', HIR_STRING_TYPE))],
          },
          {
            name: 'fooBar',
            parameters: ['foo', 'bar', 'baz'],
            type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE, HIR_INT_TYPE], HIR_STRING_TYPE),
            body: [HIR_RETURN(HIR_NAME('GLOBAL_STRING_0', HIR_STRING_TYPE))],
          },
          {
            name: 'loop1',
            parameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_STRING_TYPE),
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('loop1', HIR_INT_TYPE),
                functionArguments: [],
                returnCollector: { name: 'n', type: HIR_INT_TYPE },
              }),
              HIR_RETURN(HIR_VARIABLE('n', HIR_INT_TYPE)),
            ],
          },
          {
            name: 'loop2',
            parameters: [],
            type: HIR_FUNCTION_TYPE([], HIR_STRING_TYPE),
            body: [
              HIR_LET({
                name: 'n',
                type: HIR_INT_TYPE,
                assignedExpression: HIR_VARIABLE('n', HIR_INT_TYPE),
              }),
              HIR_RETURN(HIR_ZERO),
            ],
          },
        ],
      })
    )
  ).toBe(`const GLOBAL_STRING_0 = "hello world";

function _module__class_Main_function_main {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return GLOBAL_STRING_0;
}

function fooBar {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return GLOBAL_STRING_0;
}

function loop1 {

  l_loop1_4_WHILE_TRUE_START:
  goto l_loop1_4_WHILE_TRUE_START;
}

function loop2 {

  _n = _n;
  return 0;
}
`);
});
