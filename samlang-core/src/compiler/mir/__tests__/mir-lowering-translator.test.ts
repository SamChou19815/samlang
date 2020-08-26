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
} from '../../../ast/hir-expressions';
import { midIRStatementToString, MIR_ZERO } from '../../../ast/mir-nodes';
import midIRTranslateStatementsAndCollectGlobalStrings from '../mir-lowering-translator';
import MidIRResourceAllocator from '../mir-resource-allocator';

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
      functionExpression: HIR_NAME('foo'),
      functionArguments: [HIR_INT(BigInt(1)), HIR_STRING('bar'), HIR_VARIABLE('baz')],
      returnCollector: 'bar',
    }),
    `_bar = foo(1, (GLOBAL_STRING_0 + 8), _baz);`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_IF_ELSE({
      booleanExpression: HIR_INT(BigInt(1)),
      s1: [
        HIR_RETURN(HIR_BINARY({ operator: '+', e1: HIR_INT(BigInt(2)), e2: HIR_INT(BigInt(2)) })),
      ],
      s2: [HIR_RETURN(HIR_INT(BigInt(2)))],
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
    HIR_WHILE_TRUE([HIR_RETURN(HIR_INT(BigInt(2)))]),
    `LABEL__0_PURPOSE_WHILE_TRUE_START:
return 2;
goto LABEL__0_PURPOSE_WHILE_TRUE_START;`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_LET({
      name: 'foo',
      assignedExpression: HIR_INDEX_ACCESS({ expression: HIR_VARIABLE('this'), index: 2 }),
    }),
    '_foo = MEM[(_this + 16)];'
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(
    HIR_STRUCT_INITIALIZATION({
      structVariableName: 'struct',
      expressionList: [HIR_VARIABLE('this'), HIR_VARIABLE('that')],
    }),
    `_struct = _builtin_malloc(16);
MEM[(_struct + 0)] = _this;
MEM[(_struct + 8)] = _that;`
  );

  assertCorrectlyLoweredWithPreConfiguredSetup(HIR_RETURN(HIR_ZERO), 'return 0;');
});
