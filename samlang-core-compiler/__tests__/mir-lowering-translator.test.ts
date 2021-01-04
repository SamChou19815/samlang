import midIRTranslateStatementsAndCollectGlobalStrings from '../mir-lowering-translator';
import MidIRResourceAllocator from '../mir-resource-allocator';

import {
  HighIRStatement,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_IF_ELSE,
  HIR_RETURN,
  HIR_BINARY,
  HIR_STRING,
  HIR_FUNCTION_CALL,
  HIR_LET,
  HIR_INDEX_ACCESS,
  HIR_STRUCT_INITIALIZATION,
  HIR_WHILE_TRUE,
  HIR_ZERO,
  HIR_ONE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE, HIR_STRING_TYPE } from 'samlang-core-ast/hir-types';
import { midIRStatementToString } from 'samlang-core-ast/mir-nodes';

const assertCorrectlyLoweredWithPreConfiguredSetup = (
  statement: HighIRStatement,
  expectedMirStatementsString: string
): void => {
  expect(
    midIRTranslateStatementsAndCollectGlobalStrings(new MidIRResourceAllocator(), '', [statement])
      .loweredStatements.map(midIRStatementToString)
      .join('\n')
  ).toBe(expectedMirStatementsString);
};

it('midIRTranslateStatementsAndCollectGlobalStrings test', () => {
  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_FUNCTION_CALL({
      functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
      functionArguments: [HIR_ONE, HIR_STRING('bar'), HIR_VARIABLE('baz', HIR_INT_TYPE)],
      returnCollector: { name: 'bar', type: HIR_STRING_TYPE },
    }),
    `_bar = foo(1, (GLOBAL_STRING_0 + 8), _baz);`
  );
  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_FUNCTION_CALL({
      functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
      functionArguments: [HIR_ONE, HIR_STRING('bar'), HIR_VARIABLE('baz', HIR_INT_TYPE)],
    }),
    `foo(1, (GLOBAL_STRING_0 + 8), _baz);`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_IF_ELSE({
      booleanExpression: HIR_ONE,
      s1: [
        HIR_RETURN(
          HIR_BINARY({
            operator: '+',
            e1: HIR_INT(2),
            e2: HIR_INT(2),
          })
        ),
      ],
      s2: [HIR_RETURN(HIR_INT(2))],
    }),
    `if (1) goto LABEL__0_PURPOSE_TRUE_BRANCH; else goto LABEL__1_PURPOSE_FALSE_BRANCH;
LABEL__0_PURPOSE_TRUE_BRANCH:
return (2 + 2);
goto LABEL__2_PURPOSE_IF_ELSE_END;
LABEL__1_PURPOSE_FALSE_BRANCH:
return 2;
LABEL__2_PURPOSE_IF_ELSE_END:`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_WHILE_TRUE([HIR_RETURN(HIR_INT(2))]),
    `LABEL__0_PURPOSE_WHILE_TRUE_START:
return 2;
goto LABEL__0_PURPOSE_WHILE_TRUE_START;`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_LET({
      name: 'foo',
      type: HIR_INT_TYPE,
      assignedExpression: HIR_INDEX_ACCESS({
        type: HIR_INT_TYPE,
        expression: HIR_VARIABLE('this', HIR_INT_TYPE),
        index: 2,
      }),
    }),
    '_foo = MEM[(_this + 16)];'
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_STRUCT_INITIALIZATION({
      structVariableName: 'struct',
      type: HIR_INT_TYPE,
      expressionList: [HIR_VARIABLE('this', HIR_INT_TYPE), HIR_VARIABLE('that', HIR_INT_TYPE)],
    }),
    `_struct = _builtin_malloc(16);
MEM[(_struct + 0)] = _this;
MEM[(_struct + 8)] = _that;`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(HIR_RETURN(HIR_ZERO), 'return 0;');
});
