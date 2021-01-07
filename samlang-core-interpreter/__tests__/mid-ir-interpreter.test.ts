import interpretMidIRCompilationUnit from '../mid-ir-interpreter';

import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from 'samlang-core-ast/common-names';
import type { IROperator } from 'samlang-core-ast/common-operators';
import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
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
} from 'samlang-core-ast/mir-nodes';

const MIR_EIGHT = HIR_INT(8);
const MIR_NAME = (n: string) => HIR_NAME(n, HIR_INT_TYPE);
const MIR_TEMP = (n: string) => HIR_VARIABLE(n, HIR_INT_TYPE);
const MIR_IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });
const MIR_OP = (
  operator: IROperator,
  e1: HighIRExpression,
  e2: HighIRExpression
): HighIRExpression => HIR_BINARY({ operator, e1, e2 });

it('interpretMidIRCompilationUnit hello world test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [{ name: 'HW', content: 'Hello World!' }],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_NAME('HW')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('Hello World!\n');
});

it('interpretMidIRCompilationUnit string-int conversion test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_EIGHT], 'a'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT), [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('b')], 'c'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('c')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('8\n');
});

it('interpretMidIRCompilationUnit failed string-int conversion test', () => {
  expect(() =>
    interpretMidIRCompilationUnit({
      globalVariables: [{ name: 'HW', content: 'Hello World!' }],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT), [MIR_NAME('HW')]),
          ],
        },
      ],
    })
  ).toThrow('Bad string: Hello World!');
});

it('interpretMidIRCompilationUnit string concat test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [
        { name: 'HW1', content: 'Hello World!' },
        { name: 'HW2', content: ' Hi World!' },
      ],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(
              MIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT),
              [MIR_NAME('HW1'), MIR_NAME('HW2')],
              'a'
            ),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('a')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('Hello World! Hi World!\n');
});

it('interpretMidIRCompilationUnit panic test', () => {
  expect(() =>
    interpretMidIRCompilationUnit({
      globalVariables: [{ name: 'Ahh', content: 'Panic!' }],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_THROW), [MIR_NAME('Ahh')], 'a'),
          ],
        },
      ],
    })
  ).toThrow('Panic!');
});

it('interpretMidIRCompilationUnit setup tuple and print test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_MALLOC), [HIR_INT(16)], 'tuple'),
            MIR_MOVE_IMMUTABLE_MEM(MIR_TEMP('tuple'), MIR_EIGHT),
            MIR_MOVE_IMMUTABLE_MEM(MIR_OP('+', MIR_TEMP('tuple'), MIR_EIGHT), HIR_INT(42)),
            MIR_MOVE_TEMP(
              'sum',
              MIR_OP(
                '+',
                MIR_IMMUTABLE_MEM(MIR_TEMP('tuple')),
                MIR_IMMUTABLE_MEM(MIR_OP('+', MIR_TEMP('tuple'), MIR_EIGHT))
              )
            ),
            MIR_CALL_FUNCTION(
              MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
              [MIR_TEMP('sum')],
              'sum-string'
            ),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('sum-string')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('50\n');
});

it('interpretMidIRCompilationUnit jump test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_JUMP('foo'),
            MIR_CALL_FUNCTION(
              MIR_NAME(ENCODED_FUNCTION_NAME_THROW),
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
            MIR_LABEL('foo'),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretMidIRCompilationUnit cjump test 1', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_EIGHT, 'foo'),
            MIR_CALL_FUNCTION(
              MIR_NAME(ENCODED_FUNCTION_NAME_THROW),
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
            MIR_LABEL('foo'),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretMidIRCompilationUnit cjump test 2', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(HIR_ZERO, 'foo'),
            MIR_RETURN(HIR_ZERO),
            MIR_LABEL('foo'),
            MIR_CALL_FUNCTION(
              MIR_NAME(ENCODED_FUNCTION_NAME_THROW),
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
          ],
        },
      ],
    })
  ).toBe('');
});

it('interpretMidIRCompilationUnit dummy function call integration test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: 'dummy',
          argumentNames: [],
          mainBodyStatements: [MIR_RETURN(HIR_ZERO)],
        },
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [MIR_CALL_FUNCTION(MIR_NAME('dummy'), []), MIR_RETURN(HIR_ZERO)],
        },
      ],
    })
  ).toBe('');
});

it('interpretMidIRCompilationUnit factorial function call integration test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: 'factorial',
          argumentNames: ['n', 'acc'],
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), HIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_CALL_FUNCTION(
              MIR_NAME('factorial'),
              [MIR_OP('-', MIR_TEMP('n'), HIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
              'dummy'
            ),
            MIR_RETURN(MIR_TEMP('dummy')),
            MIR_LABEL('LABEL_RETURN_ACC'),
            MIR_RETURN(MIR_TEMP('acc')),
          ],
        },
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_CALL_FUNCTION(MIR_NAME('factorial'), [HIR_INT(4), HIR_ONE], 'a'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('b')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('24\n');
});

it('interpretMidIRCompilationUnit factorial function reference call integration test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: 'factorial',
          argumentNames: ['n', 'acc'],
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), HIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_CALL_FUNCTION(
              MIR_NAME('factorial'),
              [MIR_OP('-', MIR_TEMP('n'), HIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
              'dummy'
            ),
            MIR_RETURN(MIR_TEMP('dummy')),
            MIR_LABEL('LABEL_RETURN_ACC'),
            MIR_RETURN(MIR_TEMP('acc')),
          ],
        },
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('name', MIR_NAME('factorial')),
            MIR_CALL_FUNCTION(MIR_TEMP('name'), [HIR_INT(4), HIR_ONE], 'a'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('b')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('24\n');
});

it('interpretMidIRCompilationUnit binary expression test 1', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('one', HIR_ONE),
            MIR_MOVE_TEMP('v', MIR_OP('-', HIR_ONE, MIR_TEMP('one'))),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('0\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('/', HIR_ONE, HIR_ONE)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('%', HIR_ONE, MIR_EIGHT)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('^', HIR_ONE, HIR_ZERO)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('<', HIR_ONE, HIR_ZERO)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('0\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('<=', HIR_ONE, HIR_ZERO)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('0\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('>', HIR_ONE, HIR_ZERO)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('>=', HIR_ONE, HIR_ZERO)),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [
            MIR_MOVE_TEMP('v', MIR_OP('!=', HIR_ONE, MIR_TEMP('undefined_default_to_0'))),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING), [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN), [MIR_TEMP('s')]),
            MIR_RETURN(HIR_ZERO),
          ],
        },
      ],
    })
  ).toBe('1\n');

  expect(() =>
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [MIR_MOVE_TEMP('v', MIR_OP('/', HIR_ONE, HIR_ZERO))],
        },
      ],
    })
  ).toThrow('Division by zero!');

  expect(() =>
    interpretMidIRCompilationUnit({
      globalVariables: [],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          mainBodyStatements: [MIR_MOVE_TEMP('v', MIR_OP('%', HIR_ONE, HIR_ZERO))],
        },
      ],
    })
  ).toThrow('Mod by zero!');
});
