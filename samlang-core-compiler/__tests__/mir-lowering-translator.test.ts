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
  HIR_FUNCTION_CALL,
  HIR_INDEX_ACCESS,
  HIR_STRUCT_INITIALIZATION,
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
      .map(midIRStatementToString)
      .join('\n')
  ).toBe(expectedMirStatementsString);
};

it('midIRTranslateStatementsAndCollectGlobalStrings test', () => {
  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_FUNCTION_CALL({
      functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
      functionArguments: [
        HIR_ONE,
        HIR_NAME('GLOBAL_STRING_0', HIR_STRING_TYPE),
        HIR_VARIABLE('baz', HIR_INT_TYPE),
      ],
      returnCollector: { name: 'bar', type: HIR_STRING_TYPE },
    }),
    `_bar = foo(1, GLOBAL_STRING_0, _baz);`
  );
  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_FUNCTION_CALL({
      functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
      functionArguments: [
        HIR_ONE,
        HIR_NAME('GLOBAL_STRING_0', HIR_STRING_TYPE),
        HIR_VARIABLE('baz', HIR_INT_TYPE),
      ],
    }),
    `foo(1, GLOBAL_STRING_0, _baz);`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_IF_ELSE({
      booleanExpression: HIR_ONE,
      s1: [
        HIR_BINARY({
          name: 'a',
          operator: '+',
          e1: HIR_INT(2),
          e2: HIR_INT(2),
        }),
        HIR_RETURN(HIR_VARIABLE('a', HIR_INT_TYPE)),
      ],
      s2: [HIR_RETURN(HIR_INT(2))],
    }),
    `if (1) goto l__0_TRUE_BRANCH; else goto l__1_FALSE_BRANCH;
l__0_TRUE_BRANCH:
_a = (2 + 2);
return _a;
goto l__2_IF_ELSE_END;
l__1_FALSE_BRANCH:
return 2;
l__2_IF_ELSE_END:`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_INDEX_ACCESS({
      name: 'foo',
      type: HIR_INT_TYPE,
      pointerExpression: HIR_VARIABLE('this', HIR_INT_TYPE),
      index: 2,
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
