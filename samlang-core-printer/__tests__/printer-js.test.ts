import {
  highIRModuleToJSString,
  highIRStatementToString,
  highIRFunctionToString,
  highIRExpressionToString,
} from '../printer-js';

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
  HIR_STRING,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
  HIR_WHILE_TRUE,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import { assertNotNull } from 'samlang-core-utils';

it('compile hello world to JS integration test', () => {
  const hirModule: HighIRModule = {
    functions: [
      {
        name: '_module_Test_class_Main_function_main',
        parameters: [],
        hasReturn: false,
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_builtin_stringConcat'),
            functionArguments: [HIR_STRING('Hello '), HIR_STRING('World!')],
            returnCollector: '_t0',
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_builtin_println'),
            functionArguments: [HIR_VARIABLE('_t0')],
            returnCollector: '_t1',
          }),
        ],
      },
      {
        name: '_compiled_program_main',
        parameters: [],
        hasReturn: false,
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_module_Test_class_Main_function_main'),
            functionArguments: [],
          }),
        ],
      },
    ],
  };
  assertNotNull(hirModule);
  expect(highIRModuleToJSString(hirModule)).toBe(
    `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => console.log(line);
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };

const _module_Test_class_Main_function_main = () => {
  var _t0 = _builtin_stringConcat("Hello ", "World!");
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
  return eval(highIRModuleToJSString(hirModule, true));
};

it('confirm samlang & equivalent JS have same print output', () => {
  expect(
    setupHIRIntegration({
      functions: [
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_stringConcat'),
              functionArguments: [HIR_STRING('Hello '), HIR_STRING('World!')],
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println'),
              functionArguments: [HIR_VARIABLE('_t0')],
              returnCollector: '_t1',
            }),
          ],
        },
      ],
    })
  ).toBe('Hello World!\n');

  expect(
    setupHIRIntegration({
      functions: [
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [],
        },
      ],
    })
  ).toBe('');

  expect(
    setupHIRIntegration({
      functions: [
        {
          name: 'sum',
          parameters: ['a', 'b'],
          hasReturn: true,
          body: [
            HIR_RETURN(HIR_BINARY({ operator: '+', e1: HIR_VARIABLE('a'), e2: HIR_VARIABLE('b') })),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('sum'),
              functionArguments: [HIR_INT(BigInt(42)), HIR_INT(BigInt(7))],
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_intToString'),
              functionArguments: [HIR_VARIABLE('_t0')],
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println'),
              functionArguments: [HIR_VARIABLE('_t1')],
              returnCollector: '_t2',
            }),
          ],
        },
      ],
    })
  ).toBe('49\n');

  expect(
    setupHIRIntegration({
      functions: [
        {
          name: 'MeaningOfLifeConditional',
          parameters: ['sum'],
          hasReturn: true,
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_BINARY({
                operator: '==',
                e1: HIR_VARIABLE('sum'),
                e2: HIR_INT(BigInt(42)),
              }),
              s1: [HIR_RETURN(HIR_STRING('Meaning of life'))],
              s2: [HIR_RETURN(HIR_STRING('Not the meaning of life... keep looking'))],
            }),
          ],
        },
        {
          name: 'sum',
          parameters: ['a', 'b'],
          hasReturn: true,
          body: [
            HIR_RETURN(HIR_BINARY({ operator: '+', e1: HIR_VARIABLE('a'), e2: HIR_VARIABLE('b') })),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('sum'),
              functionArguments: [HIR_INT(BigInt(42)), HIR_INT(BigInt(7))],
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('MeaningOfLifeConditional'),
              functionArguments: [HIR_VARIABLE('_t0')],
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println'),
              functionArguments: [HIR_VARIABLE('_t1')],
              returnCollector: '_t2',
            }),
          ],
        },
      ],
    })
  ).toBe('Not the meaning of life... keep looking\n');

  expect(
    setupHIRIntegration({
      functions: [
        {
          name: 'dummyStudent',
          parameters: [],
          hasReturn: true,
          body: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName: 't0',
              expressionList: [HIR_STRING('RANDOM_BABY')],
            }),
            HIR_RETURN(HIR_VARIABLE('t0')),
          ],
        },
        {
          name: 'getName',
          parameters: ['s'],
          hasReturn: true,
          body: [
            HIR_RETURN(
              HIR_INDEX_ACCESS({
                expression: HIR_VARIABLE('s'),
                index: 0,
              })
            ),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('dummyStudent'),
              functionArguments: [],
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('getName'),
              functionArguments: [HIR_VARIABLE('_t0')],
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println'),
              functionArguments: [HIR_VARIABLE('_t1')],
              returnCollector: '_t2',
            }),
          ],
        },
      ],
    })
  ).toBe('RANDOM_BABY\n');

  expect(() =>
    setupHIRIntegration({
      functions: [
        {
          name: 'sum',
          parameters: ['a', 'b'],
          hasReturn: true,
          body: [
            HIR_RETURN(HIR_BINARY({ operator: '+', e1: HIR_VARIABLE('a'), e2: HIR_VARIABLE('b') })),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          hasReturn: false,
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_BINARY({
                operator: '==',
                e1: HIR_INT(BigInt(0)),
                e2: HIR_INT(BigInt(0)),
              }),
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('_builtin_throw'),
                  functionArguments: [HIR_STRING('Division by zero is illegal!')],
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
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
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
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
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
          e1: HIR_INT(BigInt(5)),
          e2: HIR_INT(BigInt(5)),
        }),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [
          HIR_IF_ELSE({
            booleanExpression: HIR_BINARY({
              operator: '==',
              e1: HIR_INT(BigInt(5)),
              e2: HIR_INT(BigInt(5)),
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
      HIR_WHILE_TRUE([
        HIR_FUNCTION_CALL({
          functionArguments: [],
          functionExpression: HIR_NAME('func'),
          returnCollector: 'val',
        }),
      ])
    )
  ).toBe(`while (true) {
  var val = func();
}`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func'),
        returnCollector: 'val',
      })
    )
  ).toBe('var val = func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func'),
      })
    )
  ).toBe('func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('Hello, world')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_PRINTLN}("Hello, world");`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('5')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}("5");`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_INT(BigInt(5))],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('5'), HIR_STRING('4')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}("5", "4");`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('panik')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_THROW),
        returnCollector: 'panik',
      })
    )
  ).toBe(`var panik = ${ENCODED_FUNCTION_NAME_THROW}("panik");`);
  expect(
    highIRStatementToString(
      HIR_LET({
        name: 'foo',
        assignedExpression: HIR_INT(BigInt(19815)),
      })
    )
  ).toBe(`var foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN(HIR_ZERO))).toBe('return 0;');
  expect(
    highIRStatementToString(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'st',
        expressionList: [HIR_ZERO, HIR_STRING('bar'), HIR_INT(BigInt(13))],
      })
    )
  ).toBe(`var st = [0, "bar", 13];`);
});

it('HIR function to JS string test 1', () => {
  expect(
    highIRFunctionToString({
      name: 'baz',
      parameters: ['d', 't', 'i'],
      hasReturn: true,
      body: [
        HIR_LET({
          name: 'b',
          assignedExpression: HIR_INT(BigInt(1857)),
        }),
      ],
    })
  ).toBe(`const baz = (d, t, i) => {
  var b = 1857;
};
`);
});

it('HIR function to JS string test 2', () => {
  expect(
    highIRFunctionToString({
      name: 'baz',
      parameters: ['d', 't', 'i'],
      hasReturn: true,
      body: [HIR_RETURN(HIR_INT(BigInt(42)))],
    })
  ).toBe(`const baz = (d, t, i) => {
  return 42;
};
`);
});

it('HIR expression to JS string test', () => {
  expect(highIRExpressionToString(HIR_INT(BigInt(1305)))).toBe('1305');
  expect(highIRExpressionToString(HIR_STRING('bloop'))).toBe(`"bloop"`);
  expect(highIRExpressionToString(HIR_STRING('"foo'))).toBe(`"\\"foo"`);
  expect(highIRExpressionToString(HIR_STRING("'foo"))).toBe(`"'foo"`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_VARIABLE('samlang'),
        index: 3,
      })
    )
  ).toBe(`samlang[3]`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_INDEX_ACCESS({
          expression: HIR_VARIABLE('a'),
          index: 4,
        }),
        index: 3,
      })
    )
  ).toBe('a[4][3]');
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_BINARY({
          operator: '+',
          e1: HIR_STRING('a'),
          e2: HIR_STRING('b'),
        }),
        index: 0,
      })
    )
  ).toBe('("a" + "b")[0]');
  expect(highIRExpressionToString(HIR_VARIABLE('ts'))).toBe('ts');
  expect(highIRExpressionToString(HIR_NAME('key'))).toBe('key');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '!=',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_INT(BigInt(7)),
      })
    )
  ).toBe('7 != 7');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '/',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_INT(BigInt(8)),
      })
    )
  ).toBe('Math.floor(7 / 8)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('7 + 4 * 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '+',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('7 * (4 + 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '*',
        e1: HIR_INT(BigInt(7)),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(4)),
          e2: HIR_INT(BigInt(4)),
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
          e1: HIR_INT(BigInt(1)),
          e2: HIR_INT(BigInt(2)),
        }),
        e2: HIR_BINARY({
          operator: '*',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
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
          e1: HIR_INT(BigInt(1)),
          e2: HIR_INT(BigInt(2)),
        }),
        e2: HIR_BINARY({
          operator: '%',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('(1 - 2) + 3 % 4');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_NAME('somevar'),
        e2: HIR_BINARY({
          operator: '-',
          e1: HIR_INT(BigInt(3)),
          e2: HIR_INT(BigInt(4)),
        }),
      })
    )
  ).toBe('somevar + (3 - 4)');
  expect(
    highIRExpressionToString(
      HIR_BINARY({
        operator: '+',
        e1: HIR_INDEX_ACCESS({
          expression: HIR_VARIABLE('a'),
          index: 2,
        }),
        e2: HIR_INT(BigInt(1)),
      })
    )
  ).toBe('a[2] + 1');
});
