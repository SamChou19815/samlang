import { estimateFunctionInlineCost_EXPOSED_FOR_TESTING } from '../hir-inline-optimization';

import {
  HIR_ZERO,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SWITCH,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_RETURN,
} from 'samlang-core-ast/hir-expressions';
import { HIR_FUNCTION_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

it('estimateFunctionInlineCost test', () => {
  expect(
    estimateFunctionInlineCost_EXPOSED_FOR_TESTING({
      name: '',
      parameters: [],
      type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
      body: [
        HIR_INDEX_ACCESS({
          name: 'i0',
          type: HIR_INT_TYPE,
          pointerExpression: HIR_VARIABLE('a', HIR_INT_TYPE),
          index: 2,
        }),
        HIR_BINARY({
          name: 'b0',
          operator: '+',
          e1: HIR_VARIABLE('i1', HIR_INT_TYPE),
          e2: HIR_INT(3),
        }),
        HIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: HIR_INT_TYPE,
          expressionList: [
            HIR_VARIABLE('i1', HIR_INT_TYPE),
            HIR_VARIABLE('b1', HIR_INT_TYPE),
            HIR_VARIABLE('b3', HIR_INT_TYPE),
          ],
        }),
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME('fff', HIR_INT_TYPE),
          functionArguments: [
            HIR_VARIABLE('i1', HIR_INT_TYPE),
            HIR_VARIABLE('b1', HIR_INT_TYPE),
            HIR_VARIABLE('b3', HIR_INT_TYPE),
          ],
        }),
        HIR_CAST({
          name: 'ss',
          type: HIR_INT_TYPE,
          assignedExpression: HIR_VARIABLE('b3', HIR_INT_TYPE),
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [
            HIR_BINARY({
              name: '',
              operator: '+',
              e1: HIR_VARIABLE('', HIR_INT_TYPE),
              e2: HIR_INT(3),
            }),
          ],
          s2: [
            HIR_BINARY({
              name: '',
              operator: '+',
              e1: HIR_VARIABLE('', HIR_INT_TYPE),
              e2: HIR_INT(3),
            }),
          ],
        }),
        HIR_IF_ELSE({
          booleanExpression: HIR_ZERO,
          s1: [],
          s2: [],
          finalAssignment: {
            name: 'a',
            type: HIR_INT_TYPE,
            branch1Value: HIR_ZERO,
            branch2Value: HIR_ZERO,
          },
        }),
        HIR_SWITCH({
          caseVariable: '',
          cases: [
            {
              caseNumber: 1,
              statements: [
                HIR_BINARY({
                  name: '',
                  operator: '+',
                  e1: HIR_VARIABLE('', HIR_INT_TYPE),
                  e2: HIR_INT(3),
                }),
              ],
            },
          ],
        }),
        HIR_SWITCH({
          caseVariable: '',
          cases: [
            {
              caseNumber: 1,
              statements: [
                HIR_BINARY({
                  name: '',
                  operator: '+',
                  e1: HIR_VARIABLE('', HIR_INT_TYPE),
                  e2: HIR_INT(3),
                }),
              ],
            },
          ],
          finalAssignment: { name: '', type: HIR_INT_TYPE, branchValues: [HIR_ZERO, HIR_ZERO] },
        }),
        HIR_RETURN(HIR_VARIABLE('ss', HIR_INT_TYPE)),
      ],
    })
  ).toBe(31);
});
