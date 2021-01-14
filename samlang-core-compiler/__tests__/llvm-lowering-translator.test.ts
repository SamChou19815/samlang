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
  HIR_SWITCH,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_CAST,
  HIR_NAME,
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
  HIR_STRUCT_TYPE,
  HIR_BOOL_TYPE,
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
l0_start:
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
  assertStatementLoweringWorks([HIR_RETURN(HIR_INT(42))], '  ret i64 42');
  assertStatementLoweringWorks([HIR_RETURN(HIR_NAME('bar', INT))], '  ret i64 @bar');
  assertStatementLoweringWorks([HIR_RETURN(HIR_VARIABLE('bar', INT))], '  ret i64 %bar');
  assertLoweringWorks(
    {
      name: 'foo',
      parameters: ['bar'],
      type: HIR_FUNCTION_TYPE([INT], INT),
      body: [HIR_RETURN(HIR_VARIABLE('bar', INT))],
    },
    `define i64 @foo(i64 %bar) local_unnamed_addr nounwind {
l0_start:
  ret i64 %bar
}`
  );
});

it('prettyPrintLLVMFunction works for base expressions 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_INDEX_ACCESS({
        name: 'foo',
        type: INT,
        pointerExpression: HIR_VARIABLE('bar', HIR_IDENTIFIER_TYPE('Bar')),
        index: 3,
      }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    `  %_temp_0_index_pointer_temp = getelementptr %Bar, %Bar* %bar, i32 0, i32 3
  %foo = load i64, i64* %_temp_0_index_pointer_temp
  ret i64 %foo`
  );
});

it('prettyPrintLLVMFunction works for base expressions 4/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_BINARY({
        name: 'foo',
        operator: '/',
        e1: HIR_VARIABLE('bar', INT),
        e2: HIR_VARIABLE('baz', INT),
      }),
      HIR_RETURN(HIR_VARIABLE('foo', INT)),
    ],
    `  %foo = sdiv i64 %bar, %baz
  ret i64 %foo`
  );
});

it('prettyPrintLLVMFunction works for HIR_FUNCTION_CALL', () => {
  assertStatementLoweringWorks(
    [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('println', HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)),
        functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
        returnType: INT,
      }),
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('stringToInt', HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)),
        functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
        returnType: INT,
        returnCollector: 'r',
      }),
    ],
    `  %_temp_0_string_name_cast = bitcast [1 x i64]* @ss to i64*
  call i64 @println(i64* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [1 x i64]* @ss to i64*
  %r = call i64 @stringToInt(i64* %_temp_1_string_name_cast) nounwind`,
    { ss: 1 }
  );
});

it('prettyPrintLLVMFunction works for HIR_IF_ELSE 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_BINARY({
        name: 'bb',
        operator: '==',
        e1: HIR_VARIABLE('t', INT),
        e2: HIR_INT(2),
      }),
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bb', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
          }),
        ],
      }),
    ],
    `  %bb = icmp eq i64 %t, 2
  br i1 %bb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  call i64 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  call i64 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:`
  );
});

it('prettyPrintLLVMFunction works for HIR_IF_ELSE 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b1',
          }),
        ],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b2',
          }),
        ],
        finalAssignment: {
          name: 'ma',
          type: INT,
          branch1Value: HIR_VARIABLE('b1', INT),
          branch2Value: HIR_VARIABLE('b2', INT),
        },
      }),
    ],
    `  br i1 %bbb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  %b1 = call i64 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  %b2 = call i64 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i64 [ %b1, %l1_if_else_true ], [ %b2, %l2_if_else_false ]`
  );
});

it('prettyPrintLLVMFunction works for HIR_IF_ELSE 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b1',
          }),
        ],
        s2: [
          HIR_IF_ELSE({
            booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
            s1: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
                functionArguments: [],
                returnType: INT,
                returnCollector: 'b2',
              }),
            ],
            s2: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
                functionArguments: [],
                returnType: INT,
                returnCollector: 'b3',
              }),
            ],
            finalAssignment: {
              name: 'ma_nested',
              type: INT,
              branch1Value: HIR_VARIABLE('b2', INT),
              branch2Value: HIR_VARIABLE('b3', INT),
            },
          }),
        ],
        finalAssignment: {
          name: 'ma',
          type: INT,
          branch1Value: HIR_VARIABLE('b1', INT),
          branch2Value: HIR_VARIABLE('ma_nested', INT),
        },
      }),
    ],
    `  br i1 %bbb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  %b1 = call i64 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  br i1 %bbb, label %l4_if_else_true, label %l5_if_else_false
l4_if_else_true:
  %b2 = call i64 @foo() nounwind
  br label %l6_if_else_end
l5_if_else_false:
  %b3 = call i64 @bar() nounwind
  br label %l6_if_else_end
l6_if_else_end:
  %ma_nested = phi i64 [ %b2, %l4_if_else_true ], [ %b3, %l5_if_else_false ]
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i64 [ %b1, %l1_if_else_true ], [ %ma_nested, %l6_if_else_end ]`
  );
});

it('prettyPrintLLVMFunction works for HIR_SWITCH 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_SWITCH({
        caseVariable: 'c',
        cases: [
          {
            caseNumber: 2,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
                functionArguments: [],
                returnType: INT,
              }),
            ],
          },
          {
            caseNumber: 2,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
                functionArguments: [],
                returnType: INT,
              }),
            ],
          },
        ],
      }),
    ],
    `  switch i64 %c, label %l3_match_case_1 [ i64 2, label %l2_match_case_0 i64 2, label %l3_match_case_1 ]
l2_match_case_0:
  call i64 @bar() nounwind
  br label %l1_match_end
l3_match_case_1:
  call i64 @bar() nounwind
  br label %l1_match_end
l1_match_end:`
  );
});

it('prettyPrintLLVMFunction works for HIR_SWITCH 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_SWITCH({
        caseVariable: 'c',
        cases: [
          { caseNumber: 1, statements: [] },
          { caseNumber: 0, statements: [] },
          { caseNumber: 2, statements: [] },
        ],
        finalAssignment: { name: 'ma', type: INT, branchValues: [HIR_ZERO, HIR_ZERO, HIR_ZERO] },
      }),
    ],
    `  switch i64 %c, label %l4_match_case_2 [ i64 1, label %l2_match_case_0 i64 0, label %l3_match_case_1 i64 2, label %l4_match_case_2 ]
l2_match_case_0:
  br label %l1_match_end
l3_match_case_1:
  br label %l1_match_end
l4_match_case_2:
  br label %l1_match_end
l1_match_end:
  %ma = phi i64 [ 0, %l2_match_case_0 ], [ 0, %l3_match_case_1 ], [ 0, %l4_match_case_2 ]`
  );
});

it('prettyPrintLLVMFunction works for HIR_SWITCH 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_SWITCH({
        caseVariable: 'c',
        cases: [
          { caseNumber: 1, statements: [] },
          { caseNumber: 0, statements: [] },
          {
            caseNumber: 2,
            statements: [
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME('foo', INT),
                functionArguments: [],
                returnType: INT,
                returnCollector: 'b2',
              }),
            ],
          },
        ],
        finalAssignment: {
          name: 'ma',
          type: INT,
          branchValues: [HIR_ZERO, HIR_ZERO, HIR_VARIABLE('b2', INT)],
        },
      }),
    ],
    `  switch i64 %c, label %l4_match_case_2 [ i64 1, label %l2_match_case_0 i64 0, label %l3_match_case_1 i64 2, label %l4_match_case_2 ]
l2_match_case_0:
  br label %l1_match_end
l3_match_case_1:
  br label %l1_match_end
l4_match_case_2:
  %b2 = call i64 @foo() nounwind
  br label %l1_match_end
l1_match_end:
  %ma = phi i64 [ 0, %l2_match_case_0 ], [ 0, %l3_match_case_1 ], [ %b2, %l4_match_case_2 ]`
  );
});

it('prettyPrintLLVMFunction works for HIR_STRUCT_INITIALIZATION 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_STRUCT_TYPE([INT, INT]),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_ptr_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = bitcast i64* %_temp_0_struct_ptr_raw to { i64, i64 }*
  %_temp_1_struct_ptr_0 = getelementptr { i64, i64 }, { i64, i64 }* %s, i32 0, i32 0
  store i64 0, i64* %_temp_1_struct_ptr_0
  %_temp_2_struct_ptr_1 = getelementptr { i64, i64 }, { i64, i64 }* %s, i32 0, i32 1
  store i64 0, i64* %_temp_2_struct_ptr_1`
  );
});

it('prettyPrintLLVMFunction works for HIR_STRUCT_INITIALIZATION 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_IDENTIFIER_TYPE('Foo'),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_ptr_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = bitcast i64* %_temp_0_struct_ptr_raw to %Foo*
  %_temp_1_struct_ptr_0 = getelementptr %Foo, %Foo* %s, i32 0, i32 0
  store i64 0, i64* %_temp_1_struct_ptr_0
  %_temp_2_struct_ptr_1 = getelementptr %Foo, %Foo* %s, i32 0, i32 1
  store i64 0, i64* %_temp_2_struct_ptr_1`
  );
});

it('prettyPrintLLVMFunction works for HIR_CAST with type conversion', () => {
  assertStatementLoweringWorks(
    [HIR_CAST({ name: 's', type: HIR_STRING_TYPE, assignedExpression: HIR_ZERO })],
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
                returnType: INT,
              }),
              HIR_FUNCTION_CALL({
                functionExpression: HIR_NAME(
                  'stringToInt',
                  HIR_FUNCTION_TYPE([HIR_STRING_TYPE], INT)
                ),
                functionArguments: [HIR_NAME('ss', HIR_STRING_TYPE)],
                returnType: INT,
                returnCollector: 'r',
              }),
            ],
          },
        ],
      })
    )
  ).toEqual(`declare i64* @_builtin_malloc(i64) nounwind
declare i64 @_builtin_println(i64*) nounwind
declare i64 @_builtin_throw(i64*) nounwind
declare i64* @_builtin_intToString(i64) nounwind
declare i64 @_builtin_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind

; @ss = 'S'
@ss = private unnamed_addr constant [2 x i64] [i64 1, i64 83], align 8
%A = type { i64, i64 }
define i64 @test() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [2 x i64]* @ss to i64*
  call i64 @println(i64* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [2 x i64]* @ss to i64*
  %r = call i64 @stringToInt(i64* %_temp_1_string_name_cast) nounwind
}`);
});
