import optimizeMidIRCompilationUnitByInlining, {
  // eslint-disable-next-line camelcase
  estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING,
} from '../inline-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  MIR_ZERO,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  midIRCompilationUnitToString,
  MIR_ONE,
} from 'samlang-core-ast/mir-nodes';

it('estimateMidIRFunctionInlineCost test', () => {
  expect(
    estimateMidIRFunctionInlineCost_EXPOSED_FOR_TESTING({
      functionName: '',
      argumentNames: [],
      hasReturn: true,
      mainBodyStatements: [
        MIR_MOVE_TEMP(MIR_TEMP(''), MIR_TEMP('')), // 0,
        MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('')), MIR_IMMUTABLE_MEM(MIR_TEMP(''))), // 2
        MIR_JUMP(''), // 1
        MIR_LABEL(''), // 1
        MIR_RETURN(), // 1,
        MIR_CJUMP_FALLTHROUGH(MIR_TEMP(''), ''), // 1
        MIR_RETURN(MIR_OP('+', MIR_ZERO, MIR_ZERO)), // 2
        MIR_CALL_FUNCTION('f', [MIR_TEMP('')]), // 10 + 1 = 11
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
              hasReturn: true,
              mainBodyStatements: [
                MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
                MIR_CALL_FUNCTION(
                  'factorial',
                  [
                    MIR_OP('-', MIR_TEMP('n'), MIR_ONE),
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
              hasReturn: false,
              mainBodyStatements: [MIR_CALL_FUNCTION('infiniteLoop', []), MIR_RETURN()],
            },
            {
              functionName: 'insanelyBigFunction',
              argumentNames: ['a'],
              hasReturn: false,
              mainBodyStatements: [
                MIR_CALL_FUNCTION('moveMove', [MIR_TEMP('a')]),
                MIR_CALL_FUNCTION(MIR_TEMP('a'), []),
                ...Array.from(new Array(10).keys()).map(() =>
                  MIR_CALL_FUNCTION('non-existing-function', [])
                ),
              ],
            },
            {
              functionName: 'moveMove',
              argumentNames: ['a'],
              hasReturn: false,
              mainBodyStatements: [
                MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('a')),
                MIR_MOVE_IMMUTABLE_MEM(
                  MIR_IMMUTABLE_MEM(MIR_TEMP('a')),
                  MIR_IMMUTABLE_MEM(MIR_TEMP('a'))
                ),
                MIR_JUMP('lll'),
                MIR_LABEL('lll'),
                MIR_RETURN(),
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
  return;
}

function insanelyBigFunction {
  let a = _ARG0;

  _INLINING_5_a = a;
  _INLINING_5_a = _INLINING_5_a;
  MEM[_INLINING_5_a] = MEM[_INLINING_5_a];
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
  MEM[a] = MEM[a];
  return;
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
              hasReturn: true,
              mainBodyStatements: [MIR_RETURN()],
            },
            {
              functionName: 'insanelyBigFunction',
              argumentNames: ['a'],
              hasReturn: false,
              mainBodyStatements: [
                ...Array.from(new Array(105).keys()).map(() =>
                  MIR_CALL_FUNCTION('non-existing-function', [])
                ),
                MIR_RETURN(),
              ],
            },
          ],
        },
        new OptimizationResourceAllocator()
      )
    )
  ).toBe(`
function emptyFunction {

  return;
}

function insanelyBigFunction {
  let a = _ARG0;

${'  non-existing-function();\n'.repeat(105)}  return;
}
`);
});
