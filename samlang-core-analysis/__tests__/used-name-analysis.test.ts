import analyzeUsedFunctionNames from '../used-name-analysis';

import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import { unitType } from 'samlang-core-ast/common-nodes';
import {
  HIR_ZERO,
  HIR_NAME,
  HIR_FUNCTION_CALL,
  HIR_LET,
  HIR_STRUCT_INITIALIZATION,
  HIR_INDEX_ACCESS,
  HIR_RETURN,
  HIR_WHILE_TRUE,
  HIR_IF_ELSE,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';

it('analyzeUsedFunctionNames test', () => {
  expect(
    Array.from(
      analyzeUsedFunctionNames({
        functions: [
          {
            name: ENCODED_COMPILED_PROGRAM_MAIN,
            parameters: [],
            hasReturn: false,
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', unitType),
                functionArguments: [],
              }),
            ],
          },
          {
            name: 'foo',
            parameters: [],
            hasReturn: false,
            body: [
              HIR_LET({ name: '', assignedExpression: HIR_ZERO }),
              HIR_STRUCT_INITIALIZATION({
                structVariableName: '',
                expressionList: [
                  HIR_INDEX_ACCESS({
                    type: unitType,
                    expression: HIR_NAME('bar', unitType),
                    index: 0,
                  }),
                ],
              }),
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('baz', unitType),
                functionArguments: [HIR_NAME('haha', unitType)],
              }),
              HIR_RETURN(HIR_NAME('bar', unitType)),
              HIR_WHILE_TRUE([
                HIR_IF_ELSE({
                  booleanExpression: HIR_ZERO,
                  s1: [
                    HIR_LET({
                      name: '',
                      assignedExpression: HIR_BINARY({
                        operator: '+',
                        e1: HIR_NAME('foo', unitType),
                        e2: HIR_NAME('bar', unitType),
                      }),
                    }),
                  ],
                  s2: [HIR_LET({ name: '', assignedExpression: HIR_ZERO })],
                }),
              ]),
            ],
          },
          {
            name: 'bar',
            parameters: [],
            hasReturn: false,
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', unitType),
                functionArguments: [],
              }),
            ],
          },
          {
            name: 'baz',
            parameters: [],
            hasReturn: false,
            body: [],
          },
        ],
      }).values()
    ).sort((a, b) => a.localeCompare(b))
  ).toEqual([ENCODED_COMPILED_PROGRAM_MAIN, 'bar', 'baz', 'foo', 'haha']);
});
