import { ModuleReference, checkSources } from '../..';
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
} from '../../ast/hir/hir-expressions';
import compileSamlangSourcesToHighIRSources from '../../compiler';
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
    `{const _module_Test_class_Main_function_main = () => {let _t0 = _builtin_stringConcat('Hello ', 'World!');;let _t1 = _builtin_println(_t0); };}`
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
        s1: [
          {
            __type__: 'HighIRReturnStatement',
          },
        ],
        s2: [
          {
            __type__: 'HighIRReturnStatement',
          },
        ],
      })
    )
  ).toBe(`if (5 == 5) {return;} else {return;}`);
  expect(
    highIRStatementToString(
      HIR_FUNCTION_CALL({
        functionArguments: [],
        functionExpression: HIR_NAME('func'),
        returnCollector: 'val',
      })
    )
  ).toBe('let val = func();');
  expect(
    highIRStatementToString(
      HIR_LET({
        name: 'foo',
        assignedExpression: HIR_INT(BigInt(19815)),
      })
    )
  ).toBe(`let foo = 19815;`);
  expect(highIRStatementToString(HIR_RETURN())).toBe('return;');
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
  ).toBe(`const baz = (d, t, i) => {let b = 1857; return;};`);
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
  ).toBe('7 != 7');
});
