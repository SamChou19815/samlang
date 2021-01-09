import lowerHighIRModuleToLLVMModule, {
  lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING,
} from '../llvm-lowering-translator';

import {
  HighIRExpression,
  HighIRStatement,
  HIR_BINARY,
  HIR_FALSE,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_LET,
  HIR_NAME,
  HIR_ONE,
  HIR_RETURN,
  HIR_STRUCT_INITIALIZATION,
  HIR_TRUE,
  HIR_VARIABLE,
  HIR_ZERO,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import {
  HIR_INT_TYPE as INT,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_STRING_TYPE,
  HIR_CLOSURE_TYPE,
  HIR_STRUCT_TYPE,
} from 'samlang-core-ast/hir-types';
import { prettyPrintLLVMFunction, prettyPrintLLVMModule } from 'samlang-core-ast/llvm-nodes';

const assertLoweringWorks = (
  highIRFunction: HighIRFunction,
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void => {
  expect(
    prettyPrintLLVMFunction(
      lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING(highIRFunction, globalStrings)
    )
  ).toBe(expectedString);
};

const assertStatementLoweringWorks = (
  statements: readonly HighIRStatement[],
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void => {
  assertLoweringWorks(
    { name: 'testFunction', parameters: [], type: HIR_FUNCTION_TYPE([], INT), body: statements },
    `define i64 @testFunction() local_unnamed_addr nounwind {
LABEL_testFunction_0_PURPOSE_START:
${expectedString}
}`,
    globalStrings
  );
};

const assertExpressionLoweringWorks = (
  expression: HighIRExpression,
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void => {
  assertStatementLoweringWorks([HIR_RETURN(expression)], expectedString, globalStrings);
};

it('prettyPrintLLVMFunction works for base expressions 1/n', () => {
  assertExpressionLoweringWorks(HIR_INT(42), '  ret i64 42');
  assertExpressionLoweringWorks(HIR_TRUE, '  ret i1 1');
  assertExpressionLoweringWorks(HIR_FALSE, '  ret i1 0');
});

it('prettyPrintLLVMFunction works for base expressions 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_LET({ name: 'foo', type: INT, assignedExpression: HIR_INT(42) }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    '  ret i64 42'
  );
  assertStatementLoweringWorks(
    [
      HIR_LET({ name: 'foo', type: INT, assignedExpression: HIR_NAME('bar', INT) }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    '  ret i64 @bar'
  );
  assertStatementLoweringWorks(
    [
      HIR_LET({ name: 'foo', type: INT, assignedExpression: HIR_VARIABLE('bar', INT) }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    '  ret i64 %bar'
  );
  assertLoweringWorks(
    {
      name: 'foo',
      parameters: ['bar'],
      type: HIR_FUNCTION_TYPE([INT], INT),
      body: [
        HIR_LET({ name: 'foo', type: INT, assignedExpression: HIR_VARIABLE('bar', INT) }),
        HIR_RETURN(HIR_VARIABLE('foo', INT)),
      ],
    },
    `define i64 @foo(i64 %bar) local_unnamed_addr nounwind {
LABEL_foo_0_PURPOSE_START:
  ret i64 %bar
}`
  );
});

it('prettyPrintLLVMFunction works for base expressions 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_LET({
        name: 'foo',
        type: INT,
        assignedExpression: HIR_INDEX_ACCESS({
          type: INT,
          expression: HIR_VARIABLE('bar', HIR_IDENTIFIER_TYPE('Bar')),
          index: 3,
        }),
      }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    `  %_temp_0_index_pointer_temp = getelementptr i64*, %Bar* %bar, i64 3
  %_temp_1_value_temp_loaded = load i64, i64* %_temp_0_index_pointer_temp
  ret i64 %_temp_1_value_temp_loaded`
  );
});

it('prettyPrintLLVMFunction works for base expressions 4/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_LET({
        name: 'foo',
        type: INT,
        assignedExpression: HIR_BINARY({
          operator: '/',
          e1: HIR_VARIABLE('bar', INT),
          e2: HIR_VARIABLE('baz', INT),
        }),
      }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    `  %_temp_0_binary_temp = sdiv i64 %bar, %baz
  ret i64 %_temp_0_binary_temp`
  );
});

it('prettyPrintLLVMFunction works for statements 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('println', HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)),
        functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('stringToInt', HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)),
        functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
        returnCollector: { name: 'r', type: INT },
      }),
    ],
    `  %_temp_0_string_name_cast = bitcast [1 x i64]* @ss to i64*
  call i64 @println(i64* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [1 x i64]* @ss to i64*
  %r = call i64 @stringToInt(i64* %_temp_1_string_name_cast) nounwind`,
    { ss: 1 }
  );
});

it('prettyPrintLLVMFunction works for statements 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE('t', INT),
          e2: HIR_INT(2),
        }),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
          }),
        ],
      }),
    ],
    `  %_temp_0_binary_temp = icmp eq i1 %t, 2
  br i1 %_temp_0_binary_temp, label %LABEL_testFunction_1_PURPOSE_if_else_true_label, label %LABEL_testFunction_2_PURPOSE_if_else_false_label
LABEL_testFunction_1_PURPOSE_if_else_true_label:
  call i64 @foo() nounwind
  br label %LABEL_testFunction_3_PURPOSE_if_else_end_label
LABEL_testFunction_2_PURPOSE_if_else_false_label:
  call i64 @bar() nounwind
LABEL_testFunction_3_PURPOSE_if_else_end_label:`
  );
});

it('prettyPrintLLVMFunction works for statements 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        multiAssignedVariable: {
          name: 'ma',
          type: INT,
          branch1Variable: 'b1',
          branch2Variable: 'ma',
        },
        booleanExpression: HIR_BINARY({ operator: '==', e1: HIR_VARIABLE('t', INT), e2: HIR_ZERO }),
        s1: [
          HIR_LET({ name: 'b1', type: INT, assignedExpression: HIR_ZERO }),
          HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b1', INT) }),
        ],
        s2: [
          HIR_IF_ELSE({
            multiAssignedVariable: {
              name: 'ma',
              type: INT,
              branch1Variable: 'b2',
              branch2Variable: 'ma',
            },
            booleanExpression: HIR_BINARY({
              operator: '==',
              e1: HIR_VARIABLE('t', INT),
              e2: HIR_ONE,
            }),
            s1: [
              HIR_LET({ name: 'b2', type: INT, assignedExpression: HIR_ZERO }),
              HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b2', INT) }),
            ],
            s2: [
              HIR_IF_ELSE({
                multiAssignedVariable: {
                  name: 'ma',
                  type: INT,
                  branch1Variable: 'b3',
                  branch2Variable: 'b4',
                },
                booleanExpression: HIR_BINARY({
                  operator: '==',
                  e1: HIR_VARIABLE('t', INT),
                  e2: HIR_INT(2),
                }),
                s1: [
                  HIR_LET({ name: 'b3', type: INT, assignedExpression: HIR_ZERO }),
                  HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b3', INT) }),
                ],
                s2: [
                  HIR_LET({ name: 'b4', type: INT, assignedExpression: HIR_ZERO }),
                  HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b4', INT) }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
    `  switch i64 %t, label %LABEL_testFunction_1_PURPOSE_match_end [ i64 0, label %LABEL_testFunction_2_PURPOSE_match_case_0 i64 1, label %LABEL_testFunction_3_PURPOSE_match_case_1 i64 2, label %LABEL_testFunction_4_PURPOSE_match_case_2 i64 3, label %LABEL_testFunction_5_PURPOSE_match_case_3 ]
LABEL_testFunction_2_PURPOSE_match_case_0:
  br label %LABEL_testFunction_1_PURPOSE_match_end
LABEL_testFunction_3_PURPOSE_match_case_1:
  br label %LABEL_testFunction_1_PURPOSE_match_end
LABEL_testFunction_4_PURPOSE_match_case_2:
  br label %LABEL_testFunction_1_PURPOSE_match_end
LABEL_testFunction_5_PURPOSE_match_case_3:
  br label %LABEL_testFunction_1_PURPOSE_match_end
LABEL_testFunction_1_PURPOSE_match_end:
  %ma = phi i64 [ 0, %LABEL_testFunction_2_PURPOSE_match_case_0 ], [ 0, %LABEL_testFunction_3_PURPOSE_match_case_1 ], [ 0, %LABEL_testFunction_4_PURPOSE_match_case_2 ], [ 0, %LABEL_testFunction_5_PURPOSE_match_case_3 ]`
  );
});

it('prettyPrintLLVMFunction works for statements 4/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        multiAssignedVariable: {
          name: 'ma',
          type: INT,
          branch1Variable: 'b1',
          branch2Variable: 'b2',
        },
        booleanExpression: HIR_BINARY({
          operator: '==',
          e1: HIR_VARIABLE('t', INT),
          e2: HIR_INT(2),
        }),
        s1: [
          HIR_LET({ name: 'b1', type: INT, assignedExpression: HIR_ZERO }),
          HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b1', INT) }),
        ],
        s2: [
          HIR_LET({ name: 'b2', type: INT, assignedExpression: HIR_ZERO }),
          HIR_LET({ name: 'ma', type: INT, assignedExpression: HIR_VARIABLE('b2', INT) }),
        ],
      }),
    ],
    `  %_temp_0_binary_temp = icmp eq i1 %t, 2
  br i1 %_temp_0_binary_temp, label %LABEL_testFunction_1_PURPOSE_if_else_true_label, label %LABEL_testFunction_2_PURPOSE_if_else_false_label
LABEL_testFunction_1_PURPOSE_if_else_true_label:
  br label %LABEL_testFunction_3_PURPOSE_if_else_end_label
LABEL_testFunction_2_PURPOSE_if_else_false_label:
LABEL_testFunction_3_PURPOSE_if_else_end_label:
  %ma = phi i64 [ 0, %LABEL_testFunction_1_PURPOSE_if_else_true_label ], [ 0, %LABEL_testFunction_2_PURPOSE_if_else_false_label ]`
  );
});

it('prettyPrintLLVMFunction works for statements 5/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_CLOSURE_TYPE,
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_pointer_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = bitcast i64* %_temp_0_struct_pointer_raw to { i64*, i64* }*
  %_temp_1_struct_value_casted_0 = inttoptr i64 0 to i64*
  %_temp_2_struct_value_pointer_0 = getelementptr i64**, { i64*, i64* }* %s, i64 0
  store i64* %_temp_1_struct_value_casted_0, i64** %_temp_2_struct_value_pointer_0
  %_temp_3_struct_value_casted_1 = inttoptr i64 0 to i64*
  %_temp_4_struct_value_pointer_1 = getelementptr i64**, { i64*, i64* }* %s, i64 1
  store i64* %_temp_3_struct_value_casted_1, i64** %_temp_4_struct_value_pointer_1`
  );
});

it('prettyPrintLLVMFunction works for statements 6/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_STRUCT_TYPE([INT, INT]),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_pointer_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = bitcast i64* %_temp_0_struct_pointer_raw to { i64, i64 }*
  %_temp_1_struct_value_pointer_0 = getelementptr i64*, { i64, i64 }* %s, i64 0
  store i64 0, i64* %_temp_1_struct_value_pointer_0
  %_temp_2_struct_value_pointer_1 = getelementptr i64*, { i64, i64 }* %s, i64 1
  store i64 0, i64* %_temp_2_struct_value_pointer_1`
  );
});

it('prettyPrintLLVMFunction works for statements 7/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_IDENTIFIER_TYPE('Foo'),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_pointer_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = bitcast i64* %_temp_0_struct_pointer_raw to %Foo*
  %_temp_1_struct_value_pointer_0 = getelementptr i64*, %Foo* %s, i64 0
  store i64 0, i64* %_temp_1_struct_value_pointer_0
  %_temp_2_struct_value_pointer_1 = getelementptr i64*, %Foo* %s, i64 1
  store i64 0, i64* %_temp_2_struct_value_pointer_1`
  );
});

it('prettyPrintLLVMFunction works for statements 8/n', () => {
  assertStatementLoweringWorks(
    [HIR_LET({ name: 's', type: HIR_STRING_TYPE, assignedExpression: HIR_ZERO })],
    '  %s = inttoptr i64 0 to i64*'
  );
});

it('lowerHighIRModuleToLLVMModule works', () => {
  expect(
    prettyPrintLLVMModule(
      lowerHighIRModuleToLLVMModule({
        globalVariables: [{ name: 'ss', content: 'S' }],
        typeDefinitions: [{ identifier: 'A', mappings: [INT, INT] }],
        functions: [
          {
            name: 'test',
            parameters: [],
            type: HIR_FUNCTION_TYPE([], INT),
            body: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('println', HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)),
                functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
              }),
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME(
                  'stringToInt',
                  HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)
                ),
                functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
                returnCollector: { name: 'r', type: INT },
              }),
            ],
          },
        ],
      })
    )
  ).toEqual(`declare i64* @_builtin_malloc(i64) nounwind
declare void @_builtin_println(i64*) nounwind
declare void @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

; @ss = 'S'
@ss = private unnamed_addr constant [1 x i64] [i64 1, i64 83], align 8
%A = { i64, i64 }
define i64 @test() local_unnamed_addr nounwind {
LABEL_test_0_PURPOSE_START:
  %_temp_0_string_name_cast = bitcast [1 x i64]* @ss to i64*
  call i64 @println(i64* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [1 x i64]* @ss to i64*
  %r = call i64 @stringToInt(i64* %_temp_1_string_name_cast) nounwind
}`);
});
