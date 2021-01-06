import analyzeUsedFunctionNames from '../used-name-analysis';

import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
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
import { HIR_INT_TYPE, HIR_FUNCTION_TYPE } from 'samlang-core-ast/hir-types';

it('analyzeUsedFunctionNames test', () => {
  expect(
    Array.from(
      analyzeUsedFunctionNames([
        {
          name: ENCODED_COMPILED_PROGRAM_MAIN,
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
              functionArguments: [],
            }),
          ],
        },
        {
          name: 'foo',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_LET({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
            HIR_STRUCT_INITIALIZATION({
              structVariableName: '',
              type: HIR_INT_TYPE,
              expressionList: [
                HIR_INDEX_ACCESS({
                  type: HIR_INT_TYPE,
                  expression: HIR_NAME('bar', HIR_INT_TYPE),
                  index: 0,
                }),
              ],
            }),
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('baz', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
              functionArguments: [HIR_NAME('haha', HIR_INT_TYPE)],
            }),
            HIR_RETURN(HIR_NAME('bar', HIR_INT_TYPE)),
            HIR_WHILE_TRUE(
              [],
              [
                HIR_IF_ELSE({
                  booleanExpression: HIR_ZERO,
                  s1: [
                    HIR_LET({
                      name: '',
                      type: HIR_INT_TYPE,
                      assignedExpression: HIR_BINARY({
                        operator: '+',
                        e1: HIR_NAME('foo', HIR_INT_TYPE),
                        e2: HIR_NAME('bar', HIR_INT_TYPE),
                      }),
                    }),
                  ],
                  s2: [HIR_LET({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
                }),
              ]
            ),
          ],
        },
        {
          name: 'bar',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [
            HIR_FUNCTION_CALL({
              functionExpression: HIR_NAME('foo', HIR_INT_TYPE),
              functionArguments: [],
            }),
          ],
        },
        {
          name: 'baz',
          parameters: [],
          type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
          body: [],
        },
      ]).values()
    ).sort((a, b) => a.localeCompare(b))
  ).toEqual([ENCODED_COMPILED_PROGRAM_MAIN, 'bar', 'baz', 'foo', 'haha']);
});
