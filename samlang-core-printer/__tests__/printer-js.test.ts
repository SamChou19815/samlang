import {
  createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromHighIRStatement_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromHighIRModule,
} from '../printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from '../printer-prettier-core';

import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_THROW,
} from 'samlang-core-ast/common-names';
import {
  HIR_IF_ELSE,
  HIR_BINARY,
  HIR_INT,
  HIR_FUNCTION_CALL,
  HIR_NAME,
  HIR_LET,
  HIR_RETURN,
  HIR_ZERO,
  HIR_STRUCT_INITIALIZATION,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
  HIR_WHILE_TRUE,
  HighIRExpression,
  HighIRStatement,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
} from 'samlang-core-ast/hir-types';
import { assertNotNull } from 'samlang-core-utils';

const highIRExpressionToString = (highIRExpression: HighIRExpression): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRExpression_EXPOSED_FOR_TESTING(highIRExpression)
  ).trimEnd();

const highIRStatementToString = (highIRStatement: HighIRStatement): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromHighIRStatement_EXPOSED_FOR_TESTING(highIRStatement)
  ).trimEnd();

const highIRModuleToJSString = (
  availableWidth: number,
  highIRModule: HighIRModule,
  forInterpreter = false
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromHighIRModule(highIRModule, forInterpreter)
  ).trimEnd();

it('compile hello world to JS integration test', () => {
  const hirModule: HighIRModule = {
    globalVariables: [
      { name: 'h', content: 'Hello ' },
      { name: 'w', content: 'World!' },
      { name: 'f1', content: '"foo' },
      { name: 'f2', content: "'foo" },
    ],
    typeDefinitions: [],
    functions: [
      {
        name: '_module_Test_class_Main_function_main',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_builtin_stringConcat', HIR_INT_TYPE),
            functionArguments: [HIR_NAME('h', HIR_STRING_TYPE), HIR_NAME('w', HIR_STRING_TYPE)],
            returnCollector: { name: '_t0', type: HIR_STRING_TYPE },
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
            returnCollector: { name: '_t1', type: HIR_STRING_TYPE },
          }),
        ],
      },
      {
        name: '_compiled_program_main',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_module_Test_class_Main_function_main', HIR_INT_TYPE),
            functionArguments: [],
          }),
        ],
      },
    ],
  };
  assertNotNull(hirModule);
  expect(highIRModuleToJSString(100, hirModule)).toBe(
    `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => console.log(line);
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };

const h = "Hello ";
const w = "World!";
const f1 = "\\"foo";
const f2 = "'foo";
const _module_Test_class_Main_function_main = () => {
  var _t0 = _builtin_stringConcat(h, w);
  var _t1 = _builtin_println(_t0);
};
const _compiled_program_main = () => {
  _module_Test_class_Main_function_main();
};

_compiled_program_main();`
  );
});

const setupHIRIntegration = (hirModule: HighIRModule): string => {
  // eslint-disable-next-line no-eval
  return eval(highIRModuleToJSString(100, hirModule, true));
};

it('confirm samlang & equivalent JS have same print output', () => {
  expect(
    setupHIRIntegration({
      globalVariables: [
        { name: 'h', content: 'Hello ' },
        { name: 'w', content: 'World!' },
      ],
      typeDefinitions: [],
      functions: [
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_stringConcat', HIR_INT_TYPE),
              functionArguments: [HIR_NAME('h', HIR_STRING_TYPE), HIR_NAME('w', HIR_STRING_TYPE)],
              returnCollector: { name: '_t0', type: HIR_STRING_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnCollector: { name: '_t1', type: HIR_STRING_TYPE },
            }),
          ],
        },
      ],
    })
  ).toBe('Hello World!\n');

  expect(
    setupHIRIntegration({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [],
        },
      ],
    })
  ).toBe('');

  expect(
    setupHIRIntegration({
      globalVariables: [],
      typeDefinitions: [],
      functions: [
        {
          name: 'sum',
          parameters: ['a', 'b'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_RETURN(
              HIR_BINARY({
                operator: '+',
                e1: HIR_VARIABLE('a', HIR_INT_TYPE),
                e2: HIR_VARIABLE('b', HIR_INT_TYPE),
              })
            ),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('sum', HIR_INT_TYPE),
              functionArguments: [HIR_INT(42), HIR_INT(7)],
              returnCollector: { name: '_t0', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_intToString', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnCollector: { name: '_t1', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
              returnCollector: { name: '_t2', type: HIR_INT_TYPE },
            }),
          ],
        },
      ],
    })
  ).toBe('49\n');

  expect(
    setupHIRIntegration({
      globalVariables: [
        { name: 'y', content: 'Meaning of life' },
        { name: 'n', content: 'Not the meaning of life... keep looking' },
      ],
      typeDefinitions: [],
      functions: [
        {
          name: 'MeaningOfLifeConditional',
          parameters: ['sum'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_STRING_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_BINARY({
                operator: '==',
                e1: HIR_VARIABLE('sum', HIR_INT_TYPE),
                e2: HIR_INT(42),
              }),
              s1: [HIR_RETURN(HIR_NAME('y', HIR_STRING_TYPE))],
              s2: [HIR_RETURN(HIR_NAME('n', HIR_STRING_TYPE))],
            }),
          ],
        },
        {
          name: 'sum',
          parameters: ['a', 'b'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_RETURN(
              HIR_BINARY({
                operator: '+',
                e1: HIR_VARIABLE('a', HIR_INT_TYPE),
                e2: HIR_VARIABLE('b', HIR_INT_TYPE),
              })
            ),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('sum', HIR_INT_TYPE),
              functionArguments: [HIR_INT(42), HIR_INT(7)],
              returnCollector: { name: '_t0', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('MeaningOfLifeConditional', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnCollector: { name: '_t1', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
              returnCollector: { name: '_t2', type: HIR_INT_TYPE },
            }),
          ],
        },
      ],
    })
  ).toBe('Not the meaning of life... keep looking\n');

  expect(
    setupHIRIntegration({
      globalVariables: [{ name: 'rb', content: 'RANDOM_BABY' }],
      typeDefinitions: [],
      functions: [
        {
          name: 'dummyStudent',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: 't0',
              type: HIR_INT_TYPE,
              expressionList: [HIR_NAME('rb', HIR_STRING_TYPE)],
            }),
            HIR_RETURN(HIR_VARIABLE('t0', HIR_INT_TYPE)),
          ],
        },
        {
          name: 'getName',
          parameters: ['s'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_RETURN(
              HIR_INDEX_ACCESS({
                type: HIR_INT_TYPE,
                expression: HIR_VARIABLE('s', HIR_INT_TYPE),
                index: 0,
              })
            ),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('dummyStudent', HIR_INT_TYPE),
              functionArguments: [],
              returnCollector: { name: '_t0', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('getName', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnCollector: { name: '_t1', type: HIR_INT_TYPE },
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
            }),
          ],
        },
      ],
    })
  ).toBe('RANDOM_BABY\n');

  expect(() =>
    setupHIRIntegration({
      globalVariables: [{ name: 'illegal', content: 'Division by zero is illegal!' }],
      typeDefinitions: [],
      functions: [
        {
          name: 'sum',
          parameters: ['a', 'b'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_RETURN(
              HIR_BINARY({
                operator: '+',
                e1: HIR_VARIABLE('a', HIR_INT_TYPE),
                e2: HIR_VARIABLE('b', HIR_INT_TYPE),
              })
            ),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_BINARY({
                operator: '==',
                e1: HIR_INT(0),
                e2: HIR_INT(0),
              }),
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('_builtin_throw', HIR_INT_TYPE),
                  functionArguments: [HIR_NAME('illegal', HIR_STRING_TYPE)],
                }),
              ],
              s2: [],
            }),
          ],
        },
      ],
    })
  ).toThrow(`Division by zero is illegal!`);
});

it('HIR statements to JS string test', () => {
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(5),
          e2: HIR_INT(5),
        }),
        s1: [],
        s2: [HIR_RETURN(HIR_ZERO)],
      })
    )
  ).toBe(`if (5 == 5) {

} else {
  return 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(5),
          e2: HIR_INT(5),
        }),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [HIR_RETURN(HIR_ZERO)],
      })
    )
  ).toBe(`if (5 == 5) {
  return 0;
} else {
  return 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_INT(5),
          e2: HIR_INT(5),
        }),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [
          HIR_IF_ELSE({
            booleanExpression: HIR_BINARY({
              operator: '==',
              e1: HIR_INT(5),
              e2: HIR_INT(5),
            }),
            s1: [HIR_RETURN(HIR_ZERO)],
            s2: [HIR_RETURN(HIR_ZERO)],
          }),
        ],
      })
    )
  ).toBe(`if (5 == 5) {
  return 0;
} else {
  if (5 == 5) {
    return 0;
  } else {
    return 0;
  }
}`);
  expect(
    highIRStatementToString(
      HIR_WHILE_TRUE(
        [],
        [
          HIR_FUNCTION_CALL({
            functionArguments: [],
            functionExpression: HIR_NAME('func', HIR_INT_TYPE),
            returnCollector: { name: 'val', type: HIR_STRING_TYPE },
          }),
        ]
      )
    )
  ).toBe(`while (true) {
  var val = func();
}`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func', HIR_INT_TYPE),
        returnCollector: { name: 'val', type: HIR_STRING_TYPE },
      })
    )
  ).toBe('var val = func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func', HIR_INT_TYPE),
      })
    )
  ).toBe('func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, HIR_INT_TYPE),
        returnCollector: { name: 'res', type: HIR_INT_TYPE },
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_PRINTLN}(0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT, HIR_INT_TYPE),
        returnCollector: { name: 'res', type: HIR_INT_TYPE },
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}(0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_INT(5)],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING, HIR_INT_TYPE),
        returnCollector: { name: 'res', type: HIR_STRING_TYPE },
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO, HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT, HIR_INT_TYPE),
        returnCollector: { name: 'res', type: HIR_STRING_TYPE },
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}(0, 0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_THROW, HIR_INT_TYPE),
        returnCollector: { name: 'panik', type: HIR_INT_TYPE },
      })
    )
  ).toBe(`var panik = ${ENCODED_FUNCTION_NAME_THROW}(0);`);
  expect(
    highIRStatementToString(
      HIR_LET({
        name: 'foo',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_INT(19815),
      })
    )
  ).toBe(`var foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN(HIR_ZERO))).toBe('return 0;');
  expect(
    highIRStatementToString(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'st',
        type: HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_STRING_TYPE, HIR_INT_TYPE]),
        expressionList: [HIR_ZERO, HIR_ZERO, HIR_INT(13)],
      })
    )
  ).toBe(`var st = [0, 0, 13];`);
});

it('HIR function to JS string test 1', () => {
  expect(
    prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING({
        name: 'baz',
        parameters: ['d', 't', 'i'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
        body: [
          HIR_LET({
            name: 'b',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_INT(1857),
          }),
        ],
      })
    )
  ).toBe(`const baz = (d, t, i) => {
  var b = 1857;
};
`);
});

it('HIR function to JS string test 2', () => {
  expect(
    prettyPrintAccordingToPrettierAlgorithm(
      100,
      createPrettierDocumentFromHighIRFunction_EXPOSED_FOR_TESTING({
        name: 'baz',
        parameters: ['d', 't', 'i'],
        type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
        body: [HIR_RETURN(HIR_INT(42))],
      })
    )
  ).toBe(`const baz = (d, t, i) => {
  return 42;
};
`);
});

it('HIR expression to JS string test', () => {
  expect(highIRExpressionToString(HIR_INT(1305))).toBe('1305');
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        type: HIR_INT_TYPE,
        expression: HIR_VARIABLE('samlang', HIR_INT_TYPE),
        index: 3,
      })
    )
  ).toBe(`samlang[3]`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        type: HIR_INT_TYPE,
        expression: HIR_INDEX_ACCESS({
          type: HIR_INT_TYPE,
          expression: HIR_VARIABLE('a', HIR_INT_TYPE),
          index: 4,
        }),
        index: 3,
      })
    )
  ).toBe('a[4][3]');
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        type: HIR_INT_TYPE,
        expression: HIR_BINARY({
          operator: '+',
          e1: HIR_ZERO,
          e2: HIR_ZERO,
        }),
        index: 0,
      })
    )
  ).toBe('(0 + 0)[0]');
  expect(highIRExpressionToString(HIR_VARIABLE('ts', HIR_INT_TYPE))).toBe('ts');
  expect(highIRExpressionToString(HIR_NAME('key', HIR_INT_TYPE))).toBe('key');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '!=',
        e1: HIR_INT(7),
        e2: HIR_INT(7),
      })
    )
  ).toBe('7 != 7');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '/',
        e1: HIR_INT(7),
        e2: HIR_INT(8),
      })
    )
  ).toBe('Math.floor(7 / 8)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INT(7),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(4),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('7 + 4 * 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(7),
        e2: HIR_BINARY({
          operator: '+',
          e1: HIR_INT(4),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('7 * (4 + 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(7),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(4),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('7 * (4 * 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(1),
          e2: HIR_INT(2),
        }),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(3),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('(1 * 2) * (3 * 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_BINARY({
          operator: '-',
          e1: HIR_INT(1),
          e2: HIR_INT(2),
        }),
        e2: HIR_BINARY({
          operator: '%',
          e1: HIR_INT(3),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('(1 - 2) + 3 % 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_NAME('somevar', HIR_INT_TYPE),
        e2: HIR_BINARY({
          operator: '-',
          e1: HIR_INT(3),
          e2: HIR_INT(4),
        }),
      })
    )
  ).toBe('somevar + (3 - 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INDEX_ACCESS({
          type: HIR_INT_TYPE,
          expression: HIR_VARIABLE('a', HIR_INT_TYPE),
          index: 2,
        }),
        e2: HIR_INT(1),
      })
    )
  ).toBe('a[2] + 1');
});
