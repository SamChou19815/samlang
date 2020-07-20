import {
  MIR_ZERO,
  MIR_ONE,
  MIR_MINUS_ONE,
  MIR_EIGHT,
  MIR_CONST,
  MIR_NAME,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM_NON_CANONICAL,
  MIR_IMMUTABLE_MEM,
  MIR_OP_NON_CANONICAL,
  MIR_OP,
  MIR_ESEQ_NON_CANONICAL,
  MIR_MOVE_TEMP,
  MIR_MOVE_TEMP_NON_CANONICAL,
  MIR_MOVE_IMMUTABLE_MEM_NON_CANONICAL,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CALL_FUNCTION_NON_CANONICAL,
  MIR_CALL_FUNCTION,
  MIR_RETURN_NON_CANONICAL,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_CJUMP_NON_FALLTHROUGH_LESS_NON_CANONICAL,
  MIR_SEQ_NON_CANONICAL,
  midIRExpressionToString,
  midIRStatementToString,
  midIRCompilationUnitToString,
} from '..';

it('midIRExpressionToString tests', () => {
  expect(midIRExpressionToString(MIR_ZERO)).toBe('0');
  expect(midIRExpressionToString(MIR_ONE)).toBe('1');
  expect(midIRExpressionToString(MIR_MINUS_ONE)).toBe('-1');
  expect(midIRExpressionToString(MIR_EIGHT)).toBe('8');
  expect(midIRExpressionToString(MIR_CONST(BigInt(42)))).toBe('42');
  expect(midIRExpressionToString(MIR_NAME('global_str'))).toBe('global_str');
  expect(midIRExpressionToString(MIR_TEMP('variableName'))).toBe('variableName');

  expect(midIRExpressionToString(MIR_IMMUTABLE_MEM_NON_CANONICAL(MIR_ZERO))).toBe('MEM[0]');
  expect(midIRExpressionToString(MIR_IMMUTABLE_MEM(MIR_ZERO))).toBe('MEM[0]');

  expect(midIRExpressionToString(MIR_OP_NON_CANONICAL('+', MIR_EIGHT, MIR_ONE))).toBe('(8 + 1)');
  expect(midIRExpressionToString(MIR_OP('+', MIR_EIGHT, MIR_ONE))).toBe('(8 + 1)');

  expect(
    midIRExpressionToString(
      MIR_ESEQ_NON_CANONICAL([MIR_MOVE_TEMP(MIR_TEMP('foo'), MIR_TEMP('bar'))], MIR_ZERO)
    )
  ).toBe('ESEQ([foo = bar;], 0)');
});

it('midIRStatementToString tests', () => {
  expect(
    midIRStatementToString(MIR_MOVE_TEMP_NON_CANONICAL(MIR_TEMP('foo'), MIR_TEMP('bar')))
  ).toBe('foo = bar;');
  expect(midIRStatementToString(MIR_MOVE_TEMP(MIR_TEMP('foo'), MIR_TEMP('bar')))).toBe(
    'foo = bar;'
  );

  expect(
    midIRStatementToString(
      MIR_MOVE_IMMUTABLE_MEM_NON_CANONICAL(MIR_IMMUTABLE_MEM(MIR_ZERO), MIR_TEMP('foo'))
    )
  ).toBe('MEM[0] = foo;');
  expect(
    midIRStatementToString(MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_ZERO), MIR_TEMP('foo')))
  ).toBe('MEM[0] = foo;');

  expect(midIRStatementToString(MIR_JUMP('l1'))).toBe('goto l1;');
  expect(midIRStatementToString(MIR_LABEL('l1'))).toBe('l1:');

  expect(midIRStatementToString(MIR_CALL_FUNCTION_NON_CANONICAL('foo', [MIR_ZERO, MIR_ONE]))).toBe(
    'foo(0, 1);'
  );
  expect(midIRStatementToString(MIR_CALL_FUNCTION('foo', [MIR_ZERO, MIR_ONE]))).toBe('foo(0, 1);');
  expect(
    midIRStatementToString(MIR_CALL_FUNCTION_NON_CANONICAL('foo', [MIR_ZERO, MIR_ONE], 'bar'))
  ).toBe('bar = foo(0, 1);');
  expect(midIRStatementToString(MIR_CALL_FUNCTION('foo', [MIR_ZERO, MIR_ONE], 'bar'))).toBe(
    'bar = foo(0, 1);'
  );
  expect(
    midIRStatementToString(
      MIR_CALL_FUNCTION_NON_CANONICAL(MIR_TEMP('foo'), [MIR_ZERO, MIR_ONE], 'bar')
    )
  ).toBe('bar = foo(0, 1);');
  expect(
    midIRStatementToString(MIR_CALL_FUNCTION(MIR_TEMP('foo'), [MIR_ZERO, MIR_ONE], 'bar'))
  ).toBe('bar = foo(0, 1);');

  expect(midIRStatementToString(MIR_RETURN_NON_CANONICAL())).toBe('return;');
  expect(midIRStatementToString(MIR_RETURN())).toBe('return;');
  expect(midIRStatementToString(MIR_RETURN_NON_CANONICAL(MIR_ZERO))).toBe('return 0;');
  expect(midIRStatementToString(MIR_RETURN(MIR_ZERO))).toBe('return 0;');

  expect(midIRStatementToString(MIR_CJUMP_FALLTHROUGH(MIR_ZERO, 'l1'))).toBe('if (0) goto l1;');
  expect(
    midIRStatementToString(MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(MIR_ZERO, 'l1', 'l2'))
  ).toBe('if (0) goto l1; else goto l2;');
  expect(
    midIRStatementToString(MIR_CJUMP_NON_FALLTHROUGH_LESS_NON_CANONICAL(MIR_ZERO, 'l1', 'l2'))
  ).toBe('if (0) goto l1; else goto l2;');

  expect(midIRStatementToString(MIR_SEQ_NON_CANONICAL([MIR_RETURN()]))).toBe('[\n  return;\n];');
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
          isPublic: true,
          hasReturn: true,
          argumentNames: ['foo', 'bar'],
          mainBodyStatements: [MIR_RETURN()],
        },
        {
          functionName: 'barFoo',
          isPublic: true,
          hasReturn: true,
          argumentNames: ['bar', 'foo'],
          mainBodyStatements: [MIR_RETURN()],
        },
      ],
    })
  ).toBe(`const foo = "bar";
const baz = "derp";

function fooBar {
  let foo = _ARG0;
  let bar = _ARG1;

  return;
}

function barFoo {
  let bar = _ARG0;
  let foo = _ARG1;

  return;
}
`);
});
