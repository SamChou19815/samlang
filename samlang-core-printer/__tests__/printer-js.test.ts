import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_THROW,
} from 'samlang-core-ast/common-names';
import {
  MidIRExpression,
  MidIRStatement,
  MidIRSources,
  MIR_BINARY,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_INT,
  MIR_FUNCTION_CALL,
  MIR_NAME,
  MIR_CAST,
  MIR_ZERO,
  MIR_STRUCT_INITIALIZATION,
  MIR_INDEX_ACCESS,
  MIR_VARIABLE,
  MIR_INT_TYPE,
  MIR_STRING_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_BOOL_TYPE,
} from 'samlang-core-ast/mir-nodes';

import {
  createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromMidIRStatement_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING,
  createPrettierDocumentFromMidIRSources,
} from '../printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from '../printer-prettier-core';

const midIRExpressionToString = (e: MidIRExpression): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromMidIRExpression_EXPOSED_FOR_TESTING(e)
  ).trimEnd();

const midIRStatementToString = (s: MidIRStatement): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    /* availableWidth */ 100,
    createPrettierDocumentFromMidIRStatement_EXPOSED_FOR_TESTING(s)
  ).trimEnd();

const midIRSourcesToJSString = (
  availableWidth: number,
  sources: MidIRSources,
  forInterpreter = false
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromMidIRSources(sources, forInterpreter)
  ).trimEnd();

describe('printer-js', () => {
  it('compile hello world to JS integration test', () => {
    const sources: MidIRSources = {
      globalVariables: [
        { name: 'h', content: 'Hello ' },
        { name: 'w', content: 'World!' },
        { name: 'f1', content: '"foo' },
        { name: 'f2', content: "'foo" },
      ],
      typeDefinitions: [],
      mainFunctionNames: [],
      functions: [
        {
          name: '_module_Test_class_Main_function_main',
          parameters: [],
          type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
          body: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('_builtin_stringConcat', MIR_INT_TYPE),
              functionArguments: [MIR_NAME('h', MIR_STRING_TYPE), MIR_NAME('w', MIR_STRING_TYPE)],
              returnType: MIR_STRING_TYPE,
              returnCollector: '_t0',
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('_builtin_println', MIR_INT_TYPE),
              functionArguments: [MIR_VARIABLE('_t0', MIR_INT_TYPE)],
              returnType: MIR_INT_TYPE,
              returnCollector: '_t1',
            }),
          ],
          returnValue: MIR_ZERO,
        },
        {
          name: '_compiled_program_main',
          parameters: [],
          type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
          body: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('_module_Test_class_Main_function_main', MIR_INT_TYPE),
              functionArguments: [],
              returnType: MIR_INT_TYPE,
            }),
          ],
          returnValue: MIR_ZERO,
        },
      ],
    };
    expect(midIRSourcesToJSString(100, sources)).toBe(
      `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => console.log(line);
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };

const h = "Hello ";
const w = "World!";
const f1 = "\\"foo";
const f2 = "'foo";
const _module_Test_class_Main_function_main = () => {
  let _t0 = _builtin_stringConcat(h, w);
  let _t1 = _builtin_println(_t0);
  return 0;
};
const _compiled_program_main = () => {
  _module_Test_class_Main_function_main();
  return 0;
};

_compiled_program_main();`
    );
  });

  const setupMIRIntegration = (mirSources: MidIRSources): string => {
    // eslint-disable-next-line no-eval
    return eval(midIRSourcesToJSString(100, mirSources, true));
  };

  it('confirm samlang & equivalent JS have same print output', () => {
    expect(
      setupMIRIntegration({
        globalVariables: [
          { name: 'h', content: 'Hello ' },
          { name: 'w', content: 'World!' },
        ],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('_builtin_stringConcat', MIR_INT_TYPE),
                functionArguments: [MIR_NAME('h', MIR_STRING_TYPE), MIR_NAME('w', MIR_STRING_TYPE)],
                returnType: MIR_STRING_TYPE,
                returnCollector: '_t0',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t0', MIR_INT_TYPE)],
                returnType: MIR_STRING_TYPE,
                returnCollector: '_t1',
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe('Hello World!\n');

    expect(
      setupMIRIntegration({
        globalVariables: [],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe('');

    expect(
      setupMIRIntegration({
        globalVariables: [],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'sum',
            parameters: ['a', 'b'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
            body: [
              MIR_BINARY({
                name: 'aaa',
                operator: '+',
                e1: MIR_VARIABLE('a', MIR_INT_TYPE),
                e2: MIR_VARIABLE('b', MIR_INT_TYPE),
              }),
            ],
            returnValue: MIR_VARIABLE('aaa', MIR_INT_TYPE),
          },
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('sum', MIR_INT_TYPE),
                functionArguments: [MIR_INT(42), MIR_INT(7)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t0',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING, MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t0', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t1',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t1', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t2',
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe('49\n');

    expect(
      setupMIRIntegration({
        globalVariables: [
          { name: 'y', content: 'Meaning of life' },
          { name: 'n', content: 'Not the meaning of life... keep looking' },
        ],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'MeaningOfLifeConditional',
            parameters: ['sum'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_STRING_TYPE),
            body: [
              MIR_BINARY({
                name: 'bb',
                operator: '==',
                e1: MIR_VARIABLE('sum', MIR_INT_TYPE),
                e2: MIR_INT(42),
              }),
              MIR_IF_ELSE({
                booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
                s1: [],
                s2: [],
                finalAssignments: [
                  {
                    name: 'rv',
                    type: MIR_STRING_TYPE,
                    branch1Value: MIR_NAME('y', MIR_STRING_TYPE),
                    branch2Value: MIR_NAME('n', MIR_STRING_TYPE),
                  },
                ],
              }),
            ],
            returnValue: MIR_VARIABLE('rv', MIR_INT_TYPE),
          },
          {
            name: 'sum',
            parameters: ['a', 'b'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
            body: [
              MIR_BINARY({
                name: 'aaa',
                operator: '+',
                e1: MIR_VARIABLE('a', MIR_INT_TYPE),
                e2: MIR_VARIABLE('b', MIR_INT_TYPE),
              }),
            ],
            returnValue: MIR_VARIABLE('aaa', MIR_INT_TYPE),
          },
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('sum', MIR_INT_TYPE),
                functionArguments: [MIR_INT(42), MIR_INT(7)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t0',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('MeaningOfLifeConditional', MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t0', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t1',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t1', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t2',
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe('Not the meaning of life... keep looking\n');

    expect(
      setupMIRIntegration({
        globalVariables: [{ name: 'rb', content: 'RANDOM_BABY' }],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'dummyStudent',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_STRUCT_INITIALIZATION({
                structVariableName: 't0',
                type: MIR_INT_TYPE,
                expressionList: [MIR_NAME('rb', MIR_STRING_TYPE)],
              }),
            ],
            returnValue: MIR_VARIABLE('t0', MIR_INT_TYPE),
          },
          {
            name: 'getName',
            parameters: ['s'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE], MIR_INT_TYPE),
            body: [
              MIR_INDEX_ACCESS({
                name: 'aa',
                type: MIR_INT_TYPE,
                pointerExpression: MIR_VARIABLE('s', MIR_INT_TYPE),
                index: 0,
              }),
            ],
            returnValue: MIR_VARIABLE('aa', MIR_INT_TYPE),
          },
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('dummyStudent', MIR_INT_TYPE),
                functionArguments: [],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t0',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME('getName', MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t0', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
                returnCollector: '_t1',
              }),
              MIR_FUNCTION_CALL({
                functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
                functionArguments: [MIR_VARIABLE('_t1', MIR_INT_TYPE)],
                returnType: MIR_INT_TYPE,
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toBe('RANDOM_BABY\n');

    expect(() =>
      setupMIRIntegration({
        globalVariables: [{ name: 'illegal', content: 'Division by zero is illegal!' }],
        typeDefinitions: [],
        mainFunctionNames: [],
        functions: [
          {
            name: 'sum',
            parameters: ['a', 'b'],
            type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
            body: [
              MIR_BINARY({
                name: 'aaa',
                operator: '+',
                e1: MIR_VARIABLE('a', MIR_INT_TYPE),
                e2: MIR_VARIABLE('b', MIR_INT_TYPE),
              }),
            ],
            returnValue: MIR_VARIABLE('aaa', MIR_INT_TYPE),
          },
          {
            name: '_compiled_program_main',
            parameters: [],
            type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
            body: [
              MIR_IF_ELSE({
                booleanExpression: MIR_INT(1),
                s1: [
                  MIR_FUNCTION_CALL({
                    functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_THROW, MIR_INT_TYPE),
                    functionArguments: [MIR_NAME('illegal', MIR_STRING_TYPE)],
                    returnType: MIR_INT_TYPE,
                  }),
                ],
                s2: [],
                finalAssignments: [],
              }),
            ],
            returnValue: MIR_ZERO,
          },
        ],
      })
    ).toThrow(`Division by zero is illegal!`);
  });

  it('MIR statements to JS string test', () => {
    expect(
      midIRStatementToString(
        MIR_INDEX_ACCESS({
          name: 'foo',
          type: MIR_INT_TYPE,
          pointerExpression: MIR_VARIABLE('samlang', MIR_INT_TYPE),
          index: 3,
        })
      )
    ).toBe(`let foo = samlang[3];`);
    expect(
      midIRStatementToString(
        MIR_BINARY({
          name: 'foo',
          operator: '/',
          e1: MIR_INT(3),
          e2: MIR_INT(2),
        })
      )
    ).toBe(`let foo = Math.floor(3 / 2);`);
    expect(
      midIRStatementToString(
        MIR_IF_ELSE({
          booleanExpression: MIR_INT(5),
          s1: [],
          s2: [
            MIR_BINARY({
              name: 'foo',
              operator: '/',
              e1: MIR_INT(3),
              e2: MIR_INT(2),
            }),
          ],
          finalAssignments: [],
        })
      )
    ).toBe(`if (5) {

} else {
  let foo = Math.floor(3 / 2);
}`);
    expect(
      midIRStatementToString(
        MIR_IF_ELSE({
          booleanExpression: MIR_INT(5),
          s1: [],
          s2: [],
          finalAssignments: [
            { name: 'f', type: MIR_INT_TYPE, branch1Value: MIR_ZERO, branch2Value: MIR_ZERO },
          ],
        })
      )
    ).toBe(`let f;
if (5) {

  f = 0;
} else {

  f = 0;
}`);
    expect(
      midIRStatementToString(
        MIR_IF_ELSE({
          booleanExpression: MIR_INT(5),
          s1: [],
          s2: [
            MIR_IF_ELSE({
              booleanExpression: MIR_INT(5),
              s1: [],
              s2: [],
              finalAssignments: [],
            }),
          ],
          finalAssignments: [],
        })
      )
    ).toBe(`if (5) {

} else {
  if (5) {

  } else {

  }
}`);

    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [],
          functionExpression: MIR_NAME('func', MIR_INT_TYPE),
          returnType: MIR_STRING_TYPE,
          returnCollector: 'val',
        })
      )
    ).toBe('let val = func();');
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [],
          functionExpression: MIR_NAME('func', MIR_INT_TYPE),
          returnType: MIR_INT_TYPE,
        })
      )
    ).toBe('func();');
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [MIR_ZERO],
          functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN, MIR_INT_TYPE),
          returnType: MIR_INT_TYPE,
          returnCollector: 'res',
        })
      )
    ).toBe(`let res = ${ENCODED_FUNCTION_NAME_PRINTLN}(0);`);
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [MIR_ZERO],
          functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT, MIR_INT_TYPE),
          returnType: MIR_INT_TYPE,
          returnCollector: 'res',
        })
      )
    ).toBe(`let res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}(0);`);
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [MIR_INT(5)],
          functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_INT_TO_STRING, MIR_INT_TYPE),
          returnType: MIR_STRING_TYPE,
          returnCollector: 'res',
        })
      )
    ).toBe(`let res = ${ENCODED_FUNCTION_NAME_INT_TO_STRING}(5);`);
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [MIR_ZERO, MIR_ZERO],
          functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_STRING_CONCAT, MIR_INT_TYPE),
          returnType: MIR_STRING_TYPE,
          returnCollector: 'res',
        })
      )
    ).toBe(`let res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}(0, 0);`);
    expect(
      midIRStatementToString(
        MIR_FUNCTION_CALL({
          functionArguments: [MIR_ZERO],
          functionExpression: MIR_NAME(ENCODED_FUNCTION_NAME_THROW, MIR_INT_TYPE),
          returnType: MIR_INT_TYPE,
          returnCollector: 'panik',
        })
      )
    ).toBe(`let panik = ${ENCODED_FUNCTION_NAME_THROW}(0);`);
    expect(
      midIRStatementToString(
        MIR_CAST({
          name: 'foo',
          type: MIR_INT_TYPE,
          assignedExpression: MIR_INT(19815),
        })
      )
    ).toBe(`let foo = 19815;`);
    expect(
      midIRStatementToString(
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 'st',
          type: MIR_INT_TYPE,
          expressionList: [MIR_ZERO, MIR_ZERO, MIR_INT(13)],
        })
      )
    ).toBe(`let st = [0, 0, 13];`);

    expect(
      midIRStatementToString(
        MIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: MIR_INT_TYPE,
              initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
              loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
            },
            {
              name: 'acc',
              type: MIR_INT_TYPE,
              initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
              loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
            },
          ],
          statements: [
            MIR_CAST({
              name: 'foo',
              type: MIR_INT_TYPE,
              assignedExpression: MIR_VARIABLE('dev', MIR_INT_TYPE),
            }),
          ],
        })
      )
    ).toBe(`let n = _tail_rec_param_n;
let acc = _tail_rec_param_acc;
while (true) {
  let foo = dev;
  n = _t0_n;
  acc = _t1_acc;
}`);
    expect(midIRStatementToString(MIR_BREAK(MIR_ZERO))).toBe('break;');
    expect(
      midIRStatementToString(
        MIR_WHILE({
          loopVariables: [
            {
              name: 'n',
              type: MIR_INT_TYPE,
              initialValue: MIR_VARIABLE('_tail_rec_param_n', MIR_INT_TYPE),
              loopValue: MIR_VARIABLE('_t0_n', MIR_INT_TYPE),
            },
            {
              name: 'acc',
              type: MIR_INT_TYPE,
              initialValue: MIR_VARIABLE('_tail_rec_param_acc', MIR_INT_TYPE),
              loopValue: MIR_VARIABLE('_t1_acc', MIR_INT_TYPE),
            },
          ],
          statements: [
            MIR_CAST({
              name: 'foo',
              type: MIR_INT_TYPE,
              assignedExpression: MIR_VARIABLE('dev', MIR_INT_TYPE),
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: false,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: true,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          breakCollector: { name: 'v', type: MIR_INT_TYPE },
        })
      )
    ).toBe(`let n = _tail_rec_param_n;
let acc = _tail_rec_param_acc;
let v;
while (true) {
  let foo = dev;
  if (0) {
    v = 0; break;
  }
  if (!0) {
    v = 0; break;
  }
  n = _t0_n;
  acc = _t1_acc;
}`);
  });

  it('MIR function to JS string test 1', () => {
    expect(
      prettyPrintAccordingToPrettierAlgorithm(
        100,
        createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING({
          name: 'baz',
          parameters: ['d', 't', 'i'],
          type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
          body: [
            MIR_CAST({
              name: 'b',
              type: MIR_INT_TYPE,
              assignedExpression: MIR_INT(1857),
            }),
          ],
          returnValue: MIR_ZERO,
        })
      )
    ).toBe(`const baz = (d, t, i) => {
  let b = 1857;
  return 0;
};
`);
  });

  it('MIR function to JS string test 2', () => {
    expect(
      prettyPrintAccordingToPrettierAlgorithm(
        100,
        createPrettierDocumentFromMidIRFunction_EXPOSED_FOR_TESTING({
          name: 'baz',
          parameters: ['d', 't', 'i'],
          type: MIR_FUNCTION_TYPE([MIR_INT_TYPE, MIR_INT_TYPE, MIR_INT_TYPE], MIR_INT_TYPE),
          body: [],
          returnValue: MIR_INT(42),
        })
      )
    ).toBe(`const baz = (d, t, i) => {
  return 42;
};
`);
  });

  it('MIR expression to JS string test', () => {
    expect(midIRExpressionToString(MIR_INT(1305))).toBe('1305');
    expect(midIRExpressionToString(MIR_VARIABLE('ts', MIR_INT_TYPE))).toBe('ts');
    expect(midIRExpressionToString(MIR_NAME('key', MIR_INT_TYPE))).toBe('key');
  });
});
