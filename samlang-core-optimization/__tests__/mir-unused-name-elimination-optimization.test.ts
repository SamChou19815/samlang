import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import {
  MIR_ZERO,
  MIR_NAME,
  MIR_FUNCTION_CALL,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
  MIR_INDEX_ACCESS,
  MIR_BINARY,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_INT_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_IDENTIFIER_TYPE,
} from 'samlang-core-ast/mir-nodes';

import optimizeMidIRModuleByEliminatingUnusedOnes from '../mir-unused-name-elimination-optimization';

it('optimizeMidIRModuleByEliminatingUnusedOnes test', () => {
  const optimized = optimizeMidIRModuleByEliminatingUnusedOnes({
    globalVariables: [
      { name: 'bar', content: 'fff' },
      { name: 'fsdfsdf', content: '' },
    ],
    typeDefinitions: [
      { identifier: 'Foo', mappings: [MIR_INT_TYPE] },
      { identifier: 'Baz', mappings: [MIR_INT_TYPE] },
    ],
    functions: [
      {
        name: ENCODED_COMPILED_PROGRAM_MAIN,
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_IDENTIFIER_TYPE('Foo')),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'foo',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO }),
          MIR_STRUCT_INITIALIZATION({
            structVariableName: '',
            type: MIR_INT_TYPE,
            expressionList: [MIR_NAME('bar', MIR_INT_TYPE)],
          }),
          MIR_INDEX_ACCESS({
            name: 'd',
            type: MIR_INT_TYPE,
            pointerExpression: MIR_NAME('bar', MIR_INT_TYPE),
            index: 0,
          }),
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('baz', MIR_FUNCTION_TYPE([], MIR_INT_TYPE)),
            functionArguments: [MIR_NAME('haha', MIR_INT_TYPE)],
            returnType: MIR_INT_TYPE,
          }),
          MIR_IF_ELSE({
            booleanExpression: MIR_ZERO,
            s1: [
              MIR_BINARY({
                name: '',
                operator: '+',
                e1: MIR_NAME('foo', MIR_INT_TYPE),
                e2: MIR_NAME('bar', MIR_INT_TYPE),
              }),
            ],
            s2: [MIR_CAST({ name: '', type: MIR_INT_TYPE, assignedExpression: MIR_ZERO })],
            finalAssignments: [
              {
                name: 'fff',
                type: MIR_INT_TYPE,
                branch1Value: MIR_ZERO,
                branch2Value: MIR_ZERO,
              },
            ],
          }),
          MIR_SINGLE_IF({
            booleanExpression: MIR_ZERO,
            invertCondition: false,
            statements: [MIR_BREAK(MIR_ZERO)],
          }),
          MIR_WHILE({
            loopVariables: [
              { name: 'f', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
            ],
            statements: [
              MIR_BINARY({
                name: '',
                operator: '+',
                e1: MIR_NAME('foo', MIR_INT_TYPE),
                e2: MIR_NAME('bar', MIR_INT_TYPE),
              }),
            ],
          }),
          MIR_WHILE({
            loopVariables: [
              { name: 'f', type: MIR_INT_TYPE, initialValue: MIR_ZERO, loopValue: MIR_ZERO },
            ],
            statements: [],
            breakCollector: { name: 'd', type: MIR_INT_TYPE },
          }),
        ],
        returnValue: MIR_NAME('bar', MIR_INT_TYPE),
      },
      {
        name: 'bar',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME('foo', MIR_INT_TYPE),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
      {
        name: 'baz',
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [],
        returnValue: MIR_ZERO,
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
