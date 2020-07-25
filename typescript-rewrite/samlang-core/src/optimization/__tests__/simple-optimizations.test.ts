import {
  MidIRStatement,
  midIRStatementToString,
  MIR_MOVE_TEMP,
  MIR_LABEL,
  MIR_JUMP,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
  MIR_TEMP,
} from '../../ast/mir';
import {
  optimizeIrWithSimpleOptimization,
  optimizeIRWithUnusedNameElimination,
} from '../simple-optimizations';

const optimizeAndConvertToString = (midIRStatements: readonly MidIRStatement[]): string =>
  optimizeIrWithSimpleOptimization(midIRStatements).map(midIRStatementToString).join('\n');

it('optimizeIrWithSimpleOptimization test.', () => {
  expect(optimizeAndConvertToString([MIR_RETURN()])).toBe('return;');

  expect(
    optimizeAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_RETURN(),
    ])
  ).toBe(`if (boolVar) goto A;
a = b;
A:
return;`);

  expect(
    optimizeAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('A'),
      MIR_RETURN(),
    ])
  ).toBe(`return;`);

  expect(optimizeAndConvertToString([MIR_JUMP('A'), MIR_LABEL('A'), MIR_JUMP('A')])).toBe(
    'A:\ngoto A;'
  );

  expect(
    optimizeAndConvertToString([
      MIR_LABEL('A'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_JUMP('B'),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
    ])
  ).toBe(`A:
if (boolVar) goto A;
B:
a = b;
goto B;`);

  expect(
    optimizeAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_JUMP('B'),
      MIR_LABEL('A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('B'),
    ])
  ).toBe(`if (boolVar) goto A;
goto B;
A:
a = b;
B:`);

  expect(
    optimizeAndConvertToString([
      MIR_JUMP('C'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
      MIR_LABEL('C'),
    ])
  ).toBe('');

  expect(
    optimizeAndConvertToString([
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'A'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
    ])
  ).toBe(`if (boolVar) goto B;
a = b;
B:
c = d;`);

  expect(
    optimizeAndConvertToString([
      MIR_JUMP('A'),
      MIR_LABEL('A'),
      MIR_LABEL('B'),
      MIR_LABEL('C'),
      MIR_MOVE_TEMP(MIR_TEMP('a'), MIR_TEMP('b')),
      MIR_MOVE_TEMP(MIR_TEMP('c'), MIR_TEMP('d')),
      MIR_LABEL('D'),
      MIR_LABEL('E'),
      MIR_LABEL('F'),
      MIR_JUMP('G'),
      MIR_CJUMP_FALLTHROUGH(MIR_TEMP('boolVar'), 'G'),
      MIR_LABEL('G'),
      MIR_JUMP('C'),
      MIR_RETURN(),
      MIR_RETURN(),
      MIR_RETURN(),
    ])
  ).toBe(`C:
a = b;
c = d;
goto C;`);
});

it('optimizeIRWithUnusedNameElimination test', () => {
  expect(
    optimizeIRWithUnusedNameElimination({
      globalVariables: [
        { name: 'v1', content: '' },
        { name: 'v2', content: 'v2' },
      ],
      functions: [
        { functionName: 'f1', argumentNames: [], hasReturn: false, mainBodyStatements: [] },
        { functionName: 'f2', argumentNames: [], hasReturn: false, mainBodyStatements: [] },
      ],
    })
  ).toEqual({
    globalVariables: [],
    functions: [],
  });
});
