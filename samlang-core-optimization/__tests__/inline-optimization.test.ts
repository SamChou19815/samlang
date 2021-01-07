import optimizeMidIRCompilationUnitByInlining, {
  // eslint-disable-next-line camelcase
  estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING,
} from '../inline-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  midIRCompilationUnitToString,
} from 'samlang-core-ast/mir-nodes';

const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

it('estimateMidIRFunctionInlineCost test', () => {
  expect(
    estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING({
      functionName: '',
      argumentNames: [],
      mainBodyStatements: [
        MIR_MOVE_TEMP('', MIR_TEMP('')), // 0,
        MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP(''), MIR_IMMUTABLE_MEM(MIR_TEMP(''))), // 2
        MIR_JUMP(''), // 1
        MIR_LABEL(''), // 1
        MIR_RETURN(HIR_ZERO), // 1,
        MIR_CJUMP_FALLTHROUGH(MIR_TEMP(''), ''), // 1
        MIR_RETURN(MIR_OP('+', HIR_ZERO, HIR_ZERO)), // 2
        MIR_CALL_FUNCTION(MIR_NAME('f'), [MIR_TEMP('')]), // 10 + 1 = 11
      ],
    })
  ).toBe(19);
});

it('optimizeMidIRCompilationUnitByInlining test 1', () => {
  expect(
    midIRCompilationUnitToString(
      optimizeMidIRCompilationUnitByInlining(
        {
          globalVariables: [],
          functions: [
            {
              functionName: 'factorial',
              argumentNames: ['n', 'acc'],
              mainBodyStatements: [
                MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), HIR_ZERO), 'LABEL_RETURN_ACC'),
                MIR_CALL_FUNCTION(
                  MIR_NAME('factorial'),
                  [
                    MIR_OP('-', MIR_TEMP('n'), HIR_ONE),
                    MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n')),
                  ],
                  'dummy'
                ),
                MIR_RETURN(MIR_TEMP('dummy')),
                MIR_LABEL('LABEL_RETURN_ACC'),
                MIR_RETURN(MIR_TEMP('acc')),
              ],
            },
            {
              functionName: 'infiniteLoop',
              argumentNames: [],
              mainBodyStatements: [
                MIR_CALL_FUNCTION(MIR_NAME('infiniteLoop'), []),
                MIR_RETURN(HIR_ZERO),
              ],
            },
            {
              functionName: 'insanelyBigFunction',
              argumentNames: ['a'],
              mainBodyStatements: [
                MIR_CALL_FUNCTION(MIR_NAME('moveMove'), [MIR_TEMP('a')]),
                MIR_CALL_FUNCTION(MIR_TEMP('a'), []),
                ...Array.from(new Array(10).keys()).map(() =>
                  MIR_CALL_FUNCTION(MIR_NAME('non-existing-function'), [])
                ),
              ],
            },
            {
              functionName: 'moveMove',
              argumentNames: ['a'],
              mainBodyStatements: [
                MIR_MOVE_TEMP('a', MIR_TEMP('a')),
                MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('a'), MIR_IMMUTABLE_MEM(MIR_TEMP('a'))),
                MIR_JUMP('lll'),
                MIR_LABEL('lll'),
                MIR_RETURN(HIR_ZERO),
              ],
            },
          ],
        },
        new OptimizationResourceAllocator()
      )
    )
  ).toBe(`
function factorial {
  let n = _ARG0;
  let acc = _ARG1;

  if ((n == 0)) goto LABEL_RETURN_ACC;
  _INLINING_1_n = (n + -1);
  _INLINING_1_acc = (acc * n);
  if ((_INLINING_1_n == 0)) goto INLINING_0_LABEL_RETURN_ACC;
  _INLINING_1_dummy = factorial((_INLINING_1_n + -1), (_INLINING_1_acc * _INLINING_1_n));
  dummy = _INLINING_1_dummy;
  goto INLINING_0___INLINING_END;
  INLINING_0_LABEL_RETURN_ACC:
  dummy = _INLINING_1_acc;
  INLINING_0___INLINING_END:
  return dummy;
  LABEL_RETURN_ACC:
  return acc;
}

function infiniteLoop {

  infiniteLoop();
  return 0;
}

function insanelyBigFunction {
  let a = _ARG0;

  _INLINING_5_a = a;
  _INLINING_5_a = _INLINING_5_a;
  MEM[_INLINING_5_a] = _INLINING_5_a[0];
  a();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
}

function moveMove {
  let a = _ARG0;

  a = a;
  MEM[a] = a[0];
  return 0;
}
`);
});

it('optimizeMidIRCompilationUnitByInlining test 2', () => {
  expect(
    midIRCompilationUnitToString(
      optimizeMidIRCompilationUnitByInlining(
        {
          globalVariables: [],
          functions: [],
        },
        new OptimizationResourceAllocator()
      )
    )
  ).toBe('\n');
});

it('optimizeMidIRCompilationUnitByInlining test 3', () => {
  expect(
    midIRCompilationUnitToString(
      optimizeMidIRCompilationUnitByInlining(
        {
          globalVariables: [],
          functions: [
            {
              functionName: 'emptyFunction',
              argumentNames: [],
              mainBodyStatements: [MIR_RETURN(HIR_ZERO)],
            },
            {
              functionName: 'insanelyBigFunction',
              argumentNames: ['a'],
              mainBodyStatements: [
                ...Array.from(new Array(105).keys()).map(() =>
                  MIR_CALL_FUNCTION(MIR_NAME('non-existing-function'), [])
                ),
                MIR_RETURN(HIR_ZERO),
              ],
            },
          ],
        },
        new OptimizationResourceAllocator()
      )
    )
  ).toBe(`
function emptyFunction {

  return 0;
}

function insanelyBigFunction {
  let a = _ARG0;

${'  non-existing-function();\n'.repeat(105)}  return 0;
}
`);
});
