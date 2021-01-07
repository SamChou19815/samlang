import { HIR_NAME, HIR_ONE, HIR_VARIABLE, HIR_ZERO } from '../hir-expressions';
import { HIR_INT_TYPE } from '../hir-types';
import {
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CALL_FUNCTION,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  midIRStatementToString,
  midIRCompilationUnitToString,
} from '../mir-nodes';

const TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);

it('midIRStatementToString tests', () => {
  expect(midIRStatementToString(MIR_MOVE_TEMP('foo', TEMP('bar')))).toBe('foo = bar;');

  expect(midIRStatementToString(MIR_MOVE_IMMUTABLE_MEM(HIR_ZERO, TEMP('foo')))).toBe(
    'MEM[0] = foo;'
  );

  expect(midIRStatementToString(MIR_JUMP('l1'))).toBe('goto l1;');
  expect(midIRStatementToString(MIR_LABEL('l1'))).toBe('l1:');

  expect(
    midIRStatementToString(MIR_CALL_FUNCTION(HIR_NAME('foo', HIR_INT_TYPE), [HIR_ZERO, HIR_ONE]))
  ).toBe('foo(0, 1);');
  expect(
    midIRStatementToString(
      MIR_CALL_FUNCTION(HIR_NAME('foo', HIR_INT_TYPE), [HIR_ZERO, HIR_ONE], 'bar')
    )
  ).toBe('bar = foo(0, 1);');
  expect(
    midIRStatementToString(
      MIR_CALL_FUNCTION(HIR_NAME('foo', HIR_INT_TYPE), [HIR_ZERO, HIR_ONE], 'bar')
    )
  ).toBe('bar = foo(0, 1);');

  expect(midIRStatementToString(MIR_RETURN(HIR_ZERO))).toBe('return 0;');

  expect(midIRStatementToString(MIR_CJUMP_FALLTHROUGH(HIR_ZERO, 'l1'))).toBe('if (0) goto l1;');
  expect(
    midIRStatementToString(MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(HIR_ZERO, 'l1', 'l2'))
  ).toBe('if (0) goto l1; else goto l2;');
});

it('midIRCompilationUnitToString test', () => {
  expect(
    midIRCompilationUnitToString({
      globalVariables: [
        { name: 'foo', content: 'bar' },
        { name: 'baz', content: 'derp' },
      ],
      functions: [
        {
          functionName: 'fooBar',
          argumentNames: ['foo', 'bar'],
          mainBodyStatements: [MIR_RETURN(HIR_ZERO)],
        },
        {
          functionName: 'barFoo',
          argumentNames: ['bar', 'foo'],
          mainBodyStatements: [MIR_RETURN(HIR_ZERO)],
        },
      ],
    })
  ).toBe(`const foo = "bar";
const baz = "derp";

function fooBar {
  let foo = _ARG0;
  let bar = _ARG1;

  return 0;
}

function barFoo {
  let bar = _ARG0;
  let foo = _ARG1;

  return 0;
}
`);
});
