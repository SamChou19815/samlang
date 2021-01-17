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
  HIR_CAST,
  HIR_RETURN,
  HIR_ZERO,
  HIR_STRUCT_INITIALIZATION,
  HIR_INDEX_ACCESS,
  HIR_VARIABLE,
  HighIRExpression,
  HighIRStatement,
  HIR_SWITCH,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import {
  HIR_INT_TYPE,
  HIR_STRING_TYPE,
  HIR_STRUCT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_BOOL_TYPE,
} from 'samlang-core-ast/hir-types';

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
            returnType: HIR_STRING_TYPE,
            returnCollector: '_t0',
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
            functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
            returnCollector: '_t1',
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
            returnType: HIR_INT_TYPE,
          }),
        ],
      },
    ],
  };
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
  let _t0 = _builtin_stringConcat(h, w);
  let _t1 = _builtin_println(_t0);
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
              returnType: HIR_STRING_TYPE,
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnType: HIR_STRING_TYPE,
              returnCollector: '_t1',
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
            HIR_BINARY({
              name: 'aaa',
              operator: '+',
              e1: HIR_VARIABLE('a', HIR_INT_TYPE),
              e2: HIR_VARIABLE('b', HIR_INT_TYPE),
            }),
            HIR_RETURN(HIR_VARIABLE('aaa', HIR_INT_TYPE)),
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
              returnType: HIR_INT_TYPE,
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_intToString', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
              returnCollector: '_t2',
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
            HIR_BINARY({
              name: 'bb',
              operator: '==',
              e1: HIR_VARIABLE('sum', HIR_INT_TYPE),
              e2: HIR_INT(42),
            }),
            HIR_IF_ELSE({
              booleanExpression: HIR_VARIABLE('bb', HIR_BOOL_TYPE),
              s1: [HIR_RETURN(HIR_NAME('y', HIR_STRING_TYPE))],
              s2: [HIR_RETURN(HIR_NAME('n', HIR_STRING_TYPE))],
              finalAssignments: [],
            }),
          ],
        },
        {
          name: 'sum',
          parameters: ['a', 'b'],
          type: HIR_FUNCTION_TYPE([HIR_INT_TYPE, HIR_INT_TYPE], HIR_INT_TYPE),
          body: [
            HIR_BINARY({
              name: 'aaa',
              operator: '+',
              e1: HIR_VARIABLE('a', HIR_INT_TYPE),
              e2: HIR_VARIABLE('b', HIR_INT_TYPE),
            }),
            HIR_RETURN(HIR_VARIABLE('aaa', HIR_INT_TYPE)),
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
              returnType: HIR_INT_TYPE,
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('MeaningOfLifeConditional', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
              returnCollector: '_t2',
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
            HIR_INDEX_ACCESS({
              name: 'aa',
              type: HIR_INT_TYPE,
              pointerExpression: HIR_VARIABLE('s', HIR_INT_TYPE),
              index: 0,
            }),
            HIR_RETURN(HIR_VARIABLE('aa', HIR_INT_TYPE)),
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
              returnType: HIR_INT_TYPE,
              returnCollector: '_t0',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('getName', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t0', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
              returnCollector: '_t1',
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('_builtin_println', HIR_INT_TYPE),
              functionArguments: [HIR_VARIABLE('_t1', HIR_INT_TYPE)],
              returnType: HIR_INT_TYPE,
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
            HIR_BINARY({
              name: 'aaa',
              operator: '+',
              e1: HIR_VARIABLE('a', HIR_INT_TYPE),
              e2: HIR_VARIABLE('b', HIR_INT_TYPE),
            }),
            HIR_RETURN(HIR_VARIABLE('aaa', HIR_INT_TYPE)),
          ],
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_IF_ELSE({
              booleanExpression: HIR_INT(1),
              s1: [
                HIR_FUNCTION_CALL({
                  functionExpression: HIR_NAME('_builtin_throw', HIR_INT_TYPE),
                  functionArguments: [HIR_NAME('illegal', HIR_STRING_TYPE)],
                  returnType: HIR_INT_TYPE,
                }),
              ],
              s2: [],
              finalAssignments: [],
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
      HIR_INDEX_ACCESS({
        name: 'foo',
        type: HIR_INT_TYPE,
        pointerExpression: HIR_VARIABLE('samlang', HIR_INT_TYPE),
        index: 3,
      })
    )
  ).toBe(`let foo = samlang[3];`);
  expect(
    highIRStatementToString(
      HIR_BINARY({
        name: 'foo',
        operator: '/',
        e1: HIR_INT(3),
        e2: HIR_INT(2),
      })
    )
  ).toBe(`let foo = Math.floor(3 / 2);`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_INT(5),
        s1: [],
        s2: [HIR_RETURN(HIR_ZERO)],
        finalAssignments: [],
      })
    )
  ).toBe(`if (5) {

} else {
  return 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_INT(5),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [HIR_RETURN(HIR_ZERO)],
        finalAssignments: [
          {
            name: 'f',
            type: HIR_INT_TYPE,
            branch1Value: HIR_ZERO,
            branch2Value: HIR_ZERO,
          },
        ],
      })
    )
  ).toBe(`let f;
if (5) {
  return 0;
  f = 0;
} else {
  return 0;
  f = 0;
}`);
  expect(
    highIRStatementToString(
      HIR_IF_ELSE({
        booleanExpression: HIR_INT(5),
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [
          HIR_IF_ELSE({
            booleanExpression: HIR_INT(5),
            s1: [HIR_RETURN(HIR_ZERO)],
            s2: [HIR_RETURN(HIR_ZERO)],
            finalAssignments: [],
          }),
        ],
        finalAssignments: [],
      })
    )
  ).toBe(`if (5) {
  return 0;
} else {
  if (5) {
    return 0;
  } else {
    return 0;
  }
}`);
  expect(
    highIRStatementToString(
      HIR_SWITCH({
        caseVariable: 'f',
        cases: [
          {
            caseNumber: 1,
            statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_INT_TYPE))],
          },
          {
            caseNumber: 2,
            statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_INT_TYPE))],
          },
        ],
        finalAssignments: [],
      })
    )
  ).toBe(`switch (f) {
  case 1: {
    return foo;
    break;
  }
  case 2: {
    return foo;
    break;
  }
}`);
  expect(
    highIRStatementToString(
      HIR_SWITCH({
        caseVariable: 'f',
        cases: [
          {
            caseNumber: 1,
            statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_INT_TYPE))],
          },
          {
            caseNumber: 2,
            statements: [HIR_RETURN(HIR_VARIABLE('foo', HIR_INT_TYPE))],
          },
        ],
        finalAssignments: [
          {
            name: 'ma',
            type: HIR_INT_TYPE,
            branchValues: [HIR_ZERO, HIR_ZERO],
          },
        ],
      })
    )
  ).toBe(`let ma;
switch (f) {
  case 1: {
    return foo;
    ma = 0;
    break;
  }
  case 2: {
    return foo;
    ma = 0;
    break;
  }
}`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func', HIR_INT_TYPE),
        returnType: HIR_STRING_TYPE,
        returnCollector: 'val',
      })
    )
  ).toBe('let val = func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func', HIR_INT_TYPE),
        returnType: HIR_INT_TYPE,
      })
    )
  ).toBe('func();');
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, HIR_INT_TYPE),
        returnType: HIR_INT_TYPE,
        returnCollector: 'res',
      })
    )
  ).toBe(`let res = ${ENCODED_FUNCTION_NAME_PRINTLN}(0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT, HIR_INT_TYPE),
        returnType: HIR_INT_TYPE,
        returnCollector: 'res',
      })
    )
  ).toBe(`let res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}(0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_INT(5)],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING, HIR_INT_TYPE),
        returnType: HIR_STRING_TYPE,
        returnCollector: 'res',
      })
    )
  ).toBe(`let res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO, HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT, HIR_INT_TYPE),
        returnType: HIR_STRING_TYPE,
        returnCollector: 'res',
      })
    )
  ).toBe(`let res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}(0, 0);`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_ZERO],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_THROW, HIR_INT_TYPE),
        returnType: HIR_INT_TYPE,
        returnCollector: 'panik',
      })
    )
  ).toBe(`let panik = ${ENCODED_FUNCTION_NAME_THROW}(0);`);
  expect(
    highIRStatementToString(
      HIR_CAST({
        name: 'foo',
        type: HIR_INT_TYPE,
        assignedExpression: HIR_INT(19815),
      })
    )
  ).toBe(`let foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN(HIR_ZERO))).toBe('return 0;');
  expect(
    highIRStatementToString(
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 'st',
        type: HIR_STRUCT_TYPE([HIR_INT_TYPE, HIR_STRING_TYPE, HIR_INT_TYPE]),
        expressionList: [HIR_ZERO, HIR_ZERO, HIR_INT(13)],
      })
    )
  ).toBe(`let st = [0, 0, 13];`);
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
          HIR_CAST({
            name: 'b',
            type: HIR_INT_TYPE,
            assignedExpression: HIR_INT(1857),
          }),
        ],
      })
    )
  ).toBe(`const baz = (d, t, i) => {
  let b = 1857;
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
  expect(highIRExpressionToString(HIR_VARIABLE('ts', HIR_INT_TYPE))).toBe('ts');
  expect(highIRExpressionToString(HIR_NAME('key', HIR_INT_TYPE))).toBe('key');
});
