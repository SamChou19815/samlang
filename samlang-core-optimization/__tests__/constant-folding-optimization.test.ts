import optimizeIRWithConstantFolding from '../constant-folding-optimization';

import {
  MidIRStatement,
  midIRStatementToString,
  MIR_ZERO,
  MIR_ONE,
  MIR_EIGHT,
  MIR_CONST,
  MIR_TEMP,
  MIR_NAME,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
  MIR_CALL_FUNCTION,
} from 'samlang-core-ast/mir-nodes';

const optimizeAndDumpToString = (statements: readonly MidIRStatement[]): string =>
  optimizeIRWithConstantFolding(statements).map(midIRStatementToString).join('\n');

it('optimizeIRWithConstantFolding div/mod by zero tests.', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('/', MIR_ONE, MIR_OP('-', MIR_EIGHT, MIR_EIGHT))),
    ])
  ).toBe('a = (1 / 0);');

  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_OP('%', MIR_ONE, MIR_OP('-', MIR_EIGHT, MIR_EIGHT))),
    ])
  ).toBe('a = (1 % 0);');
});

it('optimizeIRWithConstantFolding normal tests', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP(
        MIR_TEMP('a'),
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
                  MIR_OP(
                    '*',
                    MIR_OP('/', MIR_OP('%', MIR_EIGHT, MIR_CONST(BigInt(3))), MIR_ONE),
                    MIR_EIGHT
                  ),
                  MIR_EIGHT
                ),
                MIR_CONST(BigInt(3))
              ),
              MIR_CONST(BigInt(4))
            )
          )
        )
      ),
    ])
  ).toBe('a = MEM[(foo + 15)];');

  expect(
    optimizeAndDumpToString([
      MIR_MOVE_IMMUTABLE_MEM(
        MIR_IMMUTABLE_MEM(MIR_OP('!=', MIR_EIGHT, MIR_EIGHT)),
        MIR_IMMUTABLE_MEM(MIR_OP('==', MIR_EIGHT, MIR_EIGHT))
      ),
    ])
  ).toBe('MEM[0] = MEM[1];');
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_IMMUTABLE_MEM(
        MIR_IMMUTABLE_MEM(MIR_OP('!=', MIR_EIGHT, MIR_ZERO)),
        MIR_IMMUTABLE_MEM(MIR_OP('==', MIR_EIGHT, MIR_ZERO))
      ),
    ])
  ).toBe('MEM[1] = MEM[0];');

  expect(optimizeAndDumpToString([MIR_JUMP('foo')])).toBe('goto foo;');
  expect(optimizeAndDumpToString([MIR_CALL_FUNCTION('foo', [MIR_EIGHT])])).toBe('foo(8);');
  expect(optimizeAndDumpToString([MIR_RETURN()])).toBe('return;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_EIGHT)])).toBe('return 8;');

  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_ZERO, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<=', MIR_EIGHT, MIR_ZERO), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<=', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([
      MIR_CJUMP_FALLTHROUGH(MIR_IMMUTABLE_MEM(MIR_OP('>', MIR_EIGHT, MIR_EIGHT)), 'a'),
    ])
  ).toBe('if (MEM[0]) goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>', MIR_EIGHT, MIR_ZERO), 'a')])
  ).toBe('goto a;');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>=', MIR_ZERO, MIR_EIGHT), 'a')])
  ).toBe('');
  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('>=', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('goto a;');
});
