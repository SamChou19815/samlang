import {
  MidIRStatement,
  MIR_ZERO,
  MIR_ONE,
  MIR_TEMP,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_CJUMP_FALLTHROUGH,
  MIR_JUMP,
  MIR_LABEL,
  MIR_RETURN,
  MIR_IMMUTABLE_MEM,
  midIRStatementToString,
} from '../../ast/mir';
import optimizeIRWithCommonSubExpressionElimination, {
  // eslint-disable-next-line camelcase
  computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING,
} from '../common-subexpression-elimination-optimization';
import OptimizationResourceAllocator from '../optimization-resource-allocator';

const statements: readonly MidIRStatement[] = [
  /* 00 */ MIR_MOVE_TEMP(MIR_TEMP('x'), MIR_ONE),
  /* 01 */ MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_TEMP('x'), MIR_ONE), 'true'),
  /* 02 */ MIR_CALL_FUNCTION('f', [MIR_ONE], 'z2'),
  /* 03 */ MIR_MOVE_IMMUTABLE_MEM(
    MIR_IMMUTABLE_MEM(MIR_TEMP('z2')),
    MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
  ),
  /* 04 */ MIR_JUMP('r'),
  /* 05 */ MIR_LABEL('r'),
  /* 06 */ MIR_JUMP('end'),
  /* 07 */ MIR_LABEL('true'),
  /* 08 */ MIR_MOVE_TEMP(MIR_TEMP('y'), MIR_OP('+', MIR_ONE, MIR_TEMP('x'))),
  /* 09 */ MIR_MOVE_TEMP(
    MIR_TEMP('z1'),
    MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE))
  ),
  /* 10 */ MIR_MOVE_TEMP(
    MIR_TEMP('z2'),
    MIR_OP(
      '/',
      MIR_OP('*', MIR_OP('+', MIR_ONE, MIR_TEMP('x')), MIR_IMMUTABLE_MEM(MIR_ONE)),
      MIR_OP('+', MIR_ONE, MIR_TEMP('x'))
    )
  ),
  /* 11 */ MIR_LABEL('end'),
  /* 12 */ MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('!=', MIR_TEMP('y'), MIR_TEMP('z2'))),
  /* 13 */ MIR_RETURN(MIR_TEMP('a')),
];

it('computeGlobalExpressionUsageAndAppearMap test 1', () => {
  expect(
    Object.fromEntries(
      Array.from(
        computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING(statements).entries()
      ).map(([expression, { appears, usage }]) => [
        expression.uniqueHash(),
        { appears: Array.from(appears), usage: Array.from(usage) },
      ])
    )
  ).toEqual({
    '(((1 + x) * MEM[1]) / (1 + x))': {
      appears: [10],
      usage: [10],
    },
    '((1 + x) * MEM[1])': {
      appears: [9],
      usage: [9, 10],
    },
    '(1 + x)': {
      appears: [3, 8],
      usage: [],
    },
    '(x < 1)': {
      appears: [1],
      usage: [1],
    },
    '(y != z2)': {
      appears: [12],
      usage: [12],
    },
    'MEM[1]': {
      appears: [9],
      usage: [9, 10],
    },
  });
});

it('computeGlobalExpressionUsageAndAppearMap test 2', () => {
  expect(computeGlobalExpressionUsageAndAppearMap_EXPOSED_FOR_TESTING([MIR_RETURN()]).size).toBe(0);
});

it('optimizeIRWithCommonSubExpressionElimination test 1', () => {
  expect(
    optimizeIRWithCommonSubExpressionElimination(statements, new OptimizationResourceAllocator())
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`x = 1;
if ((x < 1)) goto true;
z2 = f(1);
MEM[z2] = (1 + x);
goto r;
r:
goto end;
true:
y = (1 + x);
_CSE_HOISTING_1_ = MEM[1];
_CSE_HOISTING_0_ = ((1 + x) * _CSE_HOISTING_1_);
z1 = _CSE_HOISTING_0_;
z2 = (_CSE_HOISTING_0_ / (1 + x));
end:
a = (y != z2);
return a;`);
});

it('optimizeIRWithCommonSubExpressionElimination test 2', () => {
  expect(
    optimizeIRWithCommonSubExpressionElimination(
      [MIR_RETURN()],
      new OptimizationResourceAllocator()
    )
      .map(midIRStatementToString)
      .join('\n')
  ).toBe('return;');
});

it('optimizeIRWithCommonSubExpressionElimination test 3', () => {
  expect(
    optimizeIRWithCommonSubExpressionElimination(
      [
        MIR_MOVE_TEMP(
          MIR_TEMP('x'),
          MIR_OP(
            '*',
            MIR_OP(
              '*',
              MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE)),
              MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))
            ),
            MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))
          )
        ),
        MIR_MOVE_TEMP(
          MIR_TEMP('y'),
          MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))
        ),
        MIR_RETURN(
          MIR_OP(
            '/',
            MIR_OP(
              '*',
              MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE)),
              MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))
            ),
            MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ONE), MIR_IMMUTABLE_MEM(MIR_ONE))
          )
        ),
      ],
      new OptimizationResourceAllocator()
    )
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`_CSE_HOISTING_2_ = MEM[1];
_CSE_HOISTING_1_ = (_CSE_HOISTING_2_ + _CSE_HOISTING_2_);
_CSE_HOISTING_0_ = (_CSE_HOISTING_1_ * _CSE_HOISTING_1_);
x = (_CSE_HOISTING_0_ * _CSE_HOISTING_1_);
y = _CSE_HOISTING_1_;
return (_CSE_HOISTING_0_ / _CSE_HOISTING_1_);`);
});

it('optimizeIRWithCommonSubExpressionElimination test 4', () => {
  expect(
    optimizeIRWithCommonSubExpressionElimination(
      [
        MIR_MOVE_TEMP(
          MIR_TEMP('x'),
          MIR_OP('+', MIR_IMMUTABLE_MEM(MIR_ZERO), MIR_IMMUTABLE_MEM(MIR_ONE))
        ),
        MIR_RETURN(MIR_OP('-', MIR_IMMUTABLE_MEM(MIR_ZERO), MIR_IMMUTABLE_MEM(MIR_ONE))),
      ],
      new OptimizationResourceAllocator()
    )
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(`_CSE_HOISTING_0_ = MEM[0];
_CSE_HOISTING_1_ = MEM[1];
x = (_CSE_HOISTING_0_ + _CSE_HOISTING_1_);
return (_CSE_HOISTING_0_ - _CSE_HOISTING_1_);`);
});
