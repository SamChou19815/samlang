import optimizeIRWithConstantFolding from '../constant-folding-optimization';

import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  MidIRStatement,
  midIRStatementToString,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
  MIR_CALL_FUNCTION,
} from 'samlang-core-ast/mir-nodes';

const MIR_EIGHT = HIR_INT(8);
const MIR_NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

const optimizeAndDumpToString = (statements: readonly MidIRStatement[]): string =>
  optimizeIRWithConstantFolding(statements).map(midIRStatementToString).join('\n');

it('optimizeIRWithConstantFolding div/mod by zero tests.', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP('a', MIR_OP('/', HIR_ONE, MIR_OP('-', MIR_EIGHT, MIR_EIGHT))),
    ])
  ).toBe('a = (1 / 0);');

  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP('a', MIR_OP('%', HIR_ONE, MIR_OP('-', MIR_EIGHT, MIR_EIGHT))),
    ])
  ).toBe('a = (1 % 0);');
});

it('optimizeIRWithConstantFolding normal tests', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP(
        'a',
        MIR_IMMUTABLE_MEM(
          MIR_OP(
            '+',
            MIR_NAME('foo'),
            MIR_OP(
              '^',
              MIR_OP(
                '+',
                MIR_OP(
                  '-',
                  MIR_OP('*', MIR_OP('/', MIR_OP('%', MIR_EIGHT, HIR_INT(3)), HIR_ONE), MIR_EIGHT),
                  MIR_EIGHT
                ),
                HIR_INT(3)
              ),
              HIR_INT(4)
            )
          )
        )
      ),
    ])
  ).toBe('a = (foo + 15)[0];');

  expect(
    optimizeAndDumpToString([
      MIR_MOVE_IMMUTABLE_MEM(
        MIR_OP('!=', MIR_EIGHT, MIR_EIGHT),
        MIR_IMMUTABLE_MEM(MIR_OP('==', MIR_EIGHT, MIR_EIGHT))
      ),
    ])
  ).toBe('MEM[0] = 1[0];');
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_IMMUTABLE_MEM(
        MIR_OP('!=', MIR_EIGHT, HIR_ZERO),
        MIR_IMMUTABLE_MEM(MIR_OP('==', MIR_EIGHT, HIR_ZERO))
      ),
    ])
  ).toBe('MEM[1] = 0[0];');

  expect(optimizeAndDumpToString([MIR_JUMP('foo')])).toBe('goto foo;');
  expect(optimizeAndDumpToString([MIR_CALL_FUNCTION(MIR_NAME('foo'), [MIR_EIGHT])])).toBe(
    'foo(8);'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_EIGHT)])).toBe('return 8;');

  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', HIR_ZERO, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<=', MIR_EIGHT, HIR_ZERO), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<=', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([
      MIR_CJUMP_FALLTHROUGH(MIR_IMMUTABLE_MEM(MIR_OP('>', MIR_EIGHT, MIR_EIGHT)), 'a'),
    ])
  ).toBe('if (0[0]) goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>', MIR_EIGHT, HIR_ZERO), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>=', HIR_ZERO, MIR_EIGHT), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>=', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
});
