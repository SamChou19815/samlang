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
  createPrettierDocumentForExportingModuleFromMidIRSources,
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

const midIRSourcesToJSString = (availableWidth: number, sources: MidIRSources): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForExportingModuleFromMidIRSources(sources)
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

module.exports = {  };`
    );
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

  it('createPrettierDocumentForExportingModuleFromMidIRSources works', () => {
    expect(
      prettyPrintAccordingToPrettierAlgorithm(
        80,
        createPrettierDocumentForExportingModuleFromMidIRSources({
          globalVariables: [],
          typeDefinitions: [],
          mainFunctionNames: ['foo', 'bar'],
          functions: [],
        })
      )
    ).toBe(`const _builtin_stringConcat = (a, b) => a + b;
const __Builtins_println = (line) => console.log(line);
const __Builtins_stringToInt = (v) => parseInt(v, 10);
const __Builtins_intToString = (v) => String(v);
const __Builtins_panic = (v) => { throw Error(v); };


module.exports = { foo, bar };
`);

    expect(
      prettyPrintAccordingToPrettierAlgorithm(
        10,
        createPrettierDocumentForExportingModuleFromMidIRSources({
          globalVariables: [],
          typeDefinitions: [],
          mainFunctionNames: ['foo', 'bar'],
          functions: [],
        })
      )
    ).toBe(`const _builtin_stringConcat = (a, b) => a + b;
const __Builtins_println = (line) => console.log(line);
const __Builtins_stringToInt = (v) => parseInt(v, 10);
const __Builtins_intToString = (v) => String(v);
const __Builtins_panic = (v) => { throw Error(v); };


module.exports = { foo, bar };
`);
  });
});
