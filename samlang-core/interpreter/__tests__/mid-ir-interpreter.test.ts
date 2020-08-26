import {
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_COMPILED_PROGRAM_MAIN,
} from '../../ast/common-names';
import {
  MIR_ZERO,
  MIR_ONE,
  MIR_EIGHT,
  MIR_CONST,
  MIR_NAME,
  MIR_TEMP,
  MIR_OP,
  MIR_IMMUTABLE_MEM,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_FALLTHROUGH,
  MIR_RETURN,
} from '../../ast/mir-nodes';
import interpretMidIRCompilationUnit from '../mid-ir-interpreter';

it('interpretMidIRCompilationUnit hello world test', () => {
  expect(
    interpretMidIRCompilationUnit({
      globalVariables: [{ name: 'HW', content: 'Hello World!' }],
      functions: [
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [
              MIR_OP('+', MIR_NAME('HW'), MIR_EIGHT),
            ]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_EIGHT], 'a'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_STRING_TO_INT, [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('b')], 'c'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('c')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_STRING_TO_INT, [
              MIR_OP('+', MIR_NAME('HW'), MIR_EIGHT),
            ]),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(
              ENCODED_FUNCTION_NAME_STRING_CONCAT,
              [MIR_OP('+', MIR_NAME('HW1'), MIR_EIGHT), MIR_OP('+', MIR_NAME('HW2'), MIR_EIGHT)],
              'a'
            ),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('a')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(
              ENCODED_FUNCTION_NAME_THROW,
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_MALLOC, [MIR_CONST(BigInt(16))], 'tuple'),
            MIR_MOVE_IMMUTABLE_MEM(MIR_IMMUTABLE_MEM(MIR_TEMP('tuple')), MIR_EIGHT),
            MIR_MOVE_IMMUTABLE_MEM(
              MIR_IMMUTABLE_MEM(MIR_OP('+', MIR_TEMP('tuple'), MIR_EIGHT)),
              MIR_CONST(BigInt(42))
            ),
            MIR_MOVE_TEMP(
              MIR_TEMP('sum'),
              MIR_OP(
                '+',
                MIR_IMMUTABLE_MEM(MIR_TEMP('tuple')),
                MIR_IMMUTABLE_MEM(MIR_OP('+', MIR_TEMP('tuple'), MIR_EIGHT))
              )
            ),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('sum')], 'sum-string'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('sum-string')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_JUMP('foo'),
            MIR_CALL_FUNCTION(
              ENCODED_FUNCTION_NAME_THROW,
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
            MIR_LABEL('foo'),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_EIGHT, 'foo'),
            MIR_CALL_FUNCTION(
              ENCODED_FUNCTION_NAME_THROW,
              [MIR_OP('+', MIR_NAME('Ahh'), MIR_EIGHT)],
              'a'
            ),
            MIR_LABEL('foo'),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_ZERO, 'foo'),
            MIR_RETURN(),
            MIR_LABEL('foo'),
            MIR_CALL_FUNCTION(
              ENCODED_FUNCTION_NAME_THROW,
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
          hasReturn: false,
          mainBodyStatements: [MIR_RETURN()],
        },
        {
          functionName: ENCODED_COMPILED_PROGRAM_MAIN,
          argumentNames: [],
          hasReturn: false,
          mainBodyStatements: [MIR_CALL_FUNCTION('dummy', []), MIR_RETURN()],
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
          hasReturn: true,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_CALL_FUNCTION(
              'factorial',
              [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_CALL_FUNCTION('factorial', [MIR_CONST(BigInt(4)), MIR_ONE], 'a'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('b')]),
            MIR_RETURN(),
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
          hasReturn: true,
          mainBodyStatements: [
            MIR_CJUMP_FALLTHROUGH(MIR_OP('==', MIR_TEMP('n'), MIR_ZERO), 'LABEL_RETURN_ACC'),
            MIR_CALL_FUNCTION(
              'factorial',
              [MIR_OP('-', MIR_TEMP('n'), MIR_ONE), MIR_OP('*', MIR_TEMP('acc'), MIR_TEMP('n'))],
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('name'), MIR_NAME('factorial')),
            MIR_CALL_FUNCTION(MIR_TEMP('name'), [MIR_CONST(BigInt(4)), MIR_ONE], 'a'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('a')], 'b'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('b')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('one'), MIR_ONE),
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('-', MIR_ONE, MIR_TEMP('one'))),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('/', MIR_ONE, MIR_ONE)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('%', MIR_ONE, MIR_EIGHT)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('^', MIR_ONE, MIR_ZERO)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('<', MIR_ONE, MIR_ZERO)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('<=', MIR_ONE, MIR_ZERO)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('>', MIR_ONE, MIR_ZERO)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('>=', MIR_ONE, MIR_ZERO)),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [
            MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('!=', MIR_ONE, MIR_TEMP('undefined_default_to_0'))),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_INT_TO_STRING, [MIR_TEMP('v')], 's'),
            MIR_CALL_FUNCTION(ENCODED_FUNCTION_NAME_PRINTLN, [MIR_TEMP('s')]),
            MIR_RETURN(),
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
          hasReturn: false,
          mainBodyStatements: [MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('/', MIR_ONE, MIR_ZERO))],
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
          hasReturn: false,
          mainBodyStatements: [MIR_MOVE_TEMP(MIR_TEMP('v'), MIR_OP('%', MIR_ONE, MIR_ZERO))],
        },
      ],
    })
  ).toThrow('Mod by zero!');
});
