import { ModuleReference, checkSources } from '../..';
import {
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
} from '../../ast/common/name-encoder';
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
} from '../../ast/hir/hir-expressions';
import { compileSamlangSourcesToHighIRSources } from '../../compiler';
import {
  highIRSourcesToJSString,
  highIRStatementToString,
  highIRFunctionToString,
  highIRExpressionToString,
} from '../printer-js';

it('compile hello world to JS integration test', () => {
  const moduleReference = new ModuleReference(['Test']);
  const sourceCode = `
    class Main {
        function main(): unit = println("Hello "::"World!")
    }
    `;
  const { checkedSources } = checkSources([[moduleReference, sourceCode]]);
  const hirSources = compileSamlangSourcesToHighIRSources(checkedSources);
  expect(highIRSourcesToJSString(hirSources)).toBe(
    `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
  const ${ENCODED_FUNCTION_NAME_PRINTLN} = (v) => console.log(v);
  const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);\nconst _module_Test_class_Main_function_main = () => {var _t0 = _builtin_stringConcat('Hello ', 'World!');;var _t1 = _builtin_println(_t0); };`
  );
  expect(highIRSourcesToJSString(hirSources, moduleReference)).toBe(
    `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
  const ${ENCODED_FUNCTION_NAME_PRINTLN} = (v) => console.log(v);
  const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => BigInt(v);
  const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);\nconst _module_Test_class_Main_function_main = () => {var _t0 = _builtin_stringConcat('Hello ', 'World!');;var _t1 = _builtin_println(_t0); };\n_module_Test_class_Main_function_main();`
  );
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
        s1: [HIR_RETURN(HIR_ZERO)],
        s2: [HIR_RETURN(HIR_ZERO)],
      })
    )
  ).toBe(`if ((5 == 5)) {return 0;} else {return 0;}`);
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
  ).toBe('while (true) { var val = func(); }');
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
        functionArguments: [HIR_STRING('Hello, world')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_PRINTLN),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_PRINTLN}('Hello, world');`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [HIR_STRING('5')],
        functionExpression: HIR_NAME(ENCODED_FUNCTION_NAME_STRING_TO_INT),
        returnCollector: 'res',
      })
    )
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_TO_INT}('5');`);
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
  ).toBe(`var res = ${ENCODED_FUNCTION_NAME_STRING_CONCAT}('5', '4');`);
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
  ).toBe(`st = [0, 'bar', 13];`);
});

it('HIR function to JS string test', () => {
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
  ).toBe(`const baz = (d, t, i) => {var b = 1857; return;};`);
});

it('HIR expression to JS string test', () => {
  expect(highIRExpressionToString(HIR_INT(BigInt(1305)))).toBe('1305');
  expect(highIRExpressionToString(HIR_STRING('bloop'))).toBe(`'bloop'`);
  expect(
    highIRExpressionToString(
      HIR_INDEX_ACCESS({
        expression: HIR_VARIABLE('samlang'),
        index: 3,
      })
    )
  ).toBe(`samlang[3]`);
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
  ).toBe('(7 != 7)');
});
