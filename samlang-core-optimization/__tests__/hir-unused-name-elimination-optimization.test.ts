import optimizeHighIRModuleByEliminatingUnusedOnes from '../hir-unused-name-elimination-optimization';

import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import {
  HIR_ZERO,
  HIR_NAME,
  HIR_FUNCTION_CALL,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
  HIR_INDEX_ACCESS,
  HIR_RETURN,
  HIR_IF_ELSE,
  HIR_BINARY,
  HIR_WHILE,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE, HIR_FUNCTION_TYPE, HIR_IDENTIFIER_TYPE } from 'samlang-core-ast/hir-types';

it('optimizeHighIRModuleByEliminatingUnusedOnes test', () => {
  const optimized = optimizeHighIRModuleByEliminatingUnusedOnes({
    globalVariables: [
      { name: 'bar', content: 'fff' },
      { name: 'fsdfsdf', content: '' },
    ],
    typeDefinitions: [
      { identifier: 'Foo', mappings: [HIR_INT_TYPE] },
      { identifier: 'Baz', mappings: [HIR_INT_TYPE] },
    ],
    functions: [
      {
        name: ENCODED_COMPILED_PROGRAM_MAIN,
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_IDENTIFIER_TYPE('Foo')),
            functionArguments: [],
            returnType: HIR_INT_TYPE,
          }),
        ],
      },
      {
        name: 'foo',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO }),
          HIR_STRUCT_INITIALIZATION({
            structVariableName: '',
            type: HIR_INT_TYPE,
            expressionList: [HIR_NAME('bar', HIR_INT_TYPE)],
          }),
          HIR_INDEX_ACCESS({
            name: 'd',
            type: HIR_INT_TYPE,
            pointerExpression: HIR_NAME('bar', HIR_INT_TYPE),
            index: 0,
          }),
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('baz', HIR_FUNCTION_TYPE([], HIR_INT_TYPE)),
            functionArguments: [HIR_NAME('haha', HIR_INT_TYPE)],
            returnType: HIR_INT_TYPE,
          }),
          HIR_RETURN(HIR_NAME('bar', HIR_INT_TYPE)),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_NAME('foo', HIR_INT_TYPE),
                e2: HIR_NAME('bar', HIR_INT_TYPE),
              }),
            ],
            s2: [HIR_CAST({ name: '', type: HIR_INT_TYPE, assignedExpression: HIR_ZERO })],
            s1BreakValue: null,
            s2BreakValue: null,
            finalAssignments: [],
          }),
          HIR_IF_ELSE({
            booleanExpression: HIR_ZERO,
            s1: [],
            s2: [],
            s1BreakValue: HIR_ZERO,
            s2BreakValue: HIR_ZERO,
            finalAssignments: [
              {
                name: 'fff',
                type: HIR_INT_TYPE,
                branch1Value: HIR_ZERO,
                branch2Value: HIR_ZERO,
              },
            ],
          }),
          HIR_WHILE({
            loopVariables: [
              { name: 'f', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
            ],
            statements: [
              HIR_BINARY({
                name: '',
                operator: '+',
                e1: HIR_NAME('foo', HIR_INT_TYPE),
                e2: HIR_NAME('bar', HIR_INT_TYPE),
              }),
            ],
          }),
          HIR_WHILE({
            loopVariables: [
              { name: 'f', type: HIR_INT_TYPE, initialValue: HIR_ZERO, loopValue: HIR_ZERO },
            ],
            statements: [],
            breakCollector: { name: 'd', type: HIR_INT_TYPE },
          }),
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
            returnType: HIR_INT_TYPE,
          }),
        ],
      },
      {
        name: 'baz',
        parameters: [],
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [],
      },
    ],
  });

  expect(optimized.globalVariables.map((it) => it.name)).toEqual(['bar']);
  expect(optimized.typeDefinitions.map((it) => it.identifier)).toEqual(['Foo']);
  expect(optimized.functions.map((it) => it.name).sort((a, b) => a.localeCompare(b))).toEqual([
    ENCODED_COMPILED_PROGRAM_MAIN,
    'bar',
    'baz',
    'foo',
  ]);
});
