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
} from '../../ast/mir';
import optimizeIRWithAlgebraicSimplification from '../algebraic-optimization';

const optimizeAndDumpToString = (statements: readonly MidIRStatement[]): string =>
  optimizeIRWithAlgebraicSimplification(statements).map(midIRStatementToString).join('\n');
it('optimizeIRWithConstantFolding normal tests', () => {
  expect(
    optimizeAndDumpToString([
      MIR_MOVE_TEMP(
        MIR_TEMP('a'),
        MIR_IMMUTABLE_MEM(MIR_OP('+', MIR_NAME('foo'), MIR_CONST(BigInt(3))))
      ),
    ])
  ).toBe('a = MEM[(foo + 3)];');

  expect(
    optimizeAndDumpToString([
      MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_EIGHT), MIR_IMMUTABLE_MEM(MIR_EIGHT)),
    ])
  ).toBe('MEM[8] = MEM[8];');

  expect(optimizeAndDumpToString([MIR_JUMP('foo')])).toBe('goto foo;');
  expect(optimizeAndDumpToString([MIR_CALL_FUNCTION('foo', [MIR_EIGHT])])).toBe('foo(8);');
  expect(optimizeAndDumpToString([MIR_RETURN()])).toBe('return;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_EIGHT)])).toBe('return 8;');

  expect(
    optimizeAndDumpToString([MIR_CJUMP_FALLTHROUGH(MIR_OP('<', MIR_EIGHT, MIR_EIGHT), 'a')])
  ).toBe('if ((8 < 8)) goto a;');

  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('+', MIR_ZERO, MIR_EIGHT))])).toBe('return 8;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('+', MIR_EIGHT, MIR_ZERO))])).toBe('return 8;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('^', MIR_ZERO, MIR_EIGHT))])).toBe('return 8;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('^', MIR_EIGHT, MIR_ZERO))])).toBe('return 8;');
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', MIR_TEMP('a'), MIR_ONE))])).toBe(
    'return a;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', MIR_ONE, MIR_TEMP('a')))])).toBe(
    'return a;'
  );
  expect(optimizeAndDumpToString([MIR_RETURN(MIR_OP('*', MIR_TEMP('a'), MIR_TEMP('a')))])).toBe(
    'return (a * a);'
  );
});
