import optimizeIrWithSimpleOptimization from '../simple-optimizations';

import {
  MidIRStatement,
  midIRStatementToString,
  MIR_ZERO,
  MIR_TEMP,
  MIR_MOVE_TEMP,
  MIR_LABEL,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const optimizeIRAndConvertToString = (midIRStatements: readonly MidIRStatement[]): string =>
  optimizeIrWithSimpleOptimization(midIRStatements).map(midIRStatementToString).join('\n');

it('optimizeIrWithSimpleOptimization test.', () => {
  expect(optimizeIRAndConvertToString([MIR_RETURN(MIR_ZERO)])).toBe('return 0;');

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_RETURN(MIR_ZERO),
    ])
  ).toBe(`if (boolVar) goto A;
a = b;
A:
return 0;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('A'),
      MIR_RETURN(MIR_ZERO),
    ])
  ).toBe(`return 0;`);

  expect(optimizeIRAndConvertToString([MIR_JUMP('A'), MIR_LABEL('A'), MIR_JUMP('A')])).toBe(
    'A:\ngoto A;'
  );

  expect(
    optimizeIRAndConvertToString([
      MIR_LABEL('A'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_JUMP('B'),
      MIR_MOVE_TEMP('c', MIR_TEMP('d')),
    ])
  ).toBe(`A:
if (boolVar) goto A;
B:
a = b;
goto B;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_JUMP('B'),
      MIR_LABEL('A'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_LABEL('B'),
    ])
  ).toBe(`if (boolVar) goto A;
goto B;
A:
a = b;
B:`);

  expect(
    optimizeIRAndConvertToString([
      MIR_JUMP('C'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_MOVE_TEMP('c', MIR_TEMP('d')),
      MIR_LABEL('C'),
    ])
  ).toBe('');

  expect(
    optimizeIRAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP('c', MIR_TEMP('d')),
    ])
  ).toBe(`if (boolVar) goto B;
a = b;
B:
c = d;`);

  expect(
    optimizeIRAndConvertToString([
      MIR_JUMP('A'),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_LABEL('C'),
      MIR_MOVE_TEMP('a', MIR_TEMP('b')),
      MIR_MOVE_TEMP('c', MIR_TEMP('d')),
      MIR_LABEL('D'),
      MIR_LABEL('E'),
      MIR_LABEL('F'),
      MIR_JUMP('G'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'G'),
      MIR_LABEL('G'),
      MIR_JUMP('C'),
      MIR_RETURN(MIR_ZERO),
    ])
  ).toBe(`C:
a = b;
c = d;
goto C;`);
});
