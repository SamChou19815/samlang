import lowerHighIRModuleToLLVMModule, {
  lowerHighIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING,
} from '../llvm-lowering-translator';

import {
  HighIRExpression,
  HighIRStatement,
  HIR_FALSE,
  HIR_TRUE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_ZERO,
  HIR_BINARY,
  HIR_FUNCTION_CALL,
  HIR_IF_ELSE,
  HIR_SINGLE_IF,
  HIR_BREAK,
  HIR_WHILE,
  HIR_INDEX_ACCESS,
  HIR_INT,
  HIR_CAST,
  HIR_STRUCT_INITIALIZATION,
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
  globalStrings: Readonly<Record<string, number>> = {},
  hasReturn = true
): void => {
  assertLoweringWorks(
    {
      name: 'testFunction',
      parameters: [],
      type: HIR_FUNCTION_TYPE([], INT),
      body: statements,
      returnValue: HIR_ZERO,
    },
    `define i32 @testFunction() local_unnamed_addr nounwind {
l0_start:
${expectedString}${hasReturn ? '\n  ret i32 0' : ''}
}`,
    globalStrings
  );
};

const assertExpressionLoweringWorks = (
  expression: HighIRExpression,
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void => {
  assertLoweringWorks(
    {
      name: 'testFunction',
      parameters: [],
      type: HIR_FUNCTION_TYPE([], INT),
      body: [],
      returnValue: expression,
    },
    `define i32 @testFunction() local_unnamed_addr nounwind {
l0_start:
${expectedString}
}`,
    globalStrings
  );
};

it('LLVM lowering works for base expressions 1/n', () => {
  assertExpressionLoweringWorks(HIR_INT(42), '  ret i32 42');
  assertExpressionLoweringWorks(HIR_TRUE, '  ret i32 1');
  assertExpressionLoweringWorks(HIR_FALSE, '  ret i32 0');
});

it('LLVM lowering works for base expressions 2/n', () => {
  assertExpressionLoweringWorks(HIR_INT(42), '  ret i32 42');
  assertExpressionLoweringWorks(HIR_NAME('bar', INT), '  ret i32 @bar');
  assertExpressionLoweringWorks(HIR_VARIABLE('bar', INT), '  ret i32 %bar');
  assertLoweringWorks(
    {
      name: 'foo',
      parameters: ['bar'],
      type: HIR_FUNCTION_TYPE([INT], INT),
      body: [],
      returnValue: HIR_VARIABLE('bar', INT),
    },
    `define i32 @foo(i32 %bar) local_unnamed_addr nounwind {
l0_start:
  ret i32 %bar
}`
  );
});

it('LLVM lowering works for base expressions 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_INDEX_ACCESS({
        name: 'foo',
        type: INT,
        pointerExpression: HIR_VARIABLE('bar', HIR_IDENTIFIER_TYPE('Bar')),
        index: 3,
      }),
    ],
    `  %_temp_0_index_pointer_temp = getelementptr %Bar, %Bar* %bar, i32 0, i32 3
  %foo = load i32, i32* %_temp_0_index_pointer_temp`
  );
});

it('LLVM lowering works for base expressions 4/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_BINARY({
        name: 'foo',
        operator: '/',
        e1: HIR_VARIABLE('bar', INT),
        e2: HIR_VARIABLE('baz', INT),
      }),
    ],
    '  %foo = sdiv i32 %bar, %baz'
  );
});

it('LLVM lowering works for HIR_FUNCTION_CALL', () => {
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
    `  %_temp_0_string_name_cast = bitcast [1 x i32]* @ss to i32*
  call i32 @println(i32* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [1 x i32]* @ss to i32*
  %r = call i32 @stringToInt(i32* %_temp_1_string_name_cast) nounwind`,
    { ss: 1 }
  );
});

it('LLVM lowering works for HIR_IF_ELSE 1/n', () => {
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
        s1: [],
        s2: [],
        finalAssignments: [],
      }),
    ],
    `  %bb = icmp eq i32 %t, 2`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bb', HIR_BOOL_TYPE),
        s1: [],
        s2: [],
        finalAssignments: [
          {
            name: 'ma',
            type: INT,
            branch1Value: HIR_INT(2),
            branch2Value: HIR_ZERO,
          },
        ],
      }),
    ],
    `  br i1 %bb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  br label %l3_if_else_end
l2_if_else_false:
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i32 [ 2, %l1_if_else_true ], [ 0, %l2_if_else_false ]`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bb', HIR_BOOL_TYPE),
        s1: [],
        s2: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
          }),
        ],
        finalAssignments: [
          {
            name: 'ma',
            type: INT,
            branch1Value: HIR_INT(2),
            branch2Value: HIR_ZERO,
          },
        ],
      }),
    ],
    `  br i1 %bb, label %l3_if_else_end, label %l2_if_else_false
l2_if_else_false:
  call i32 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i32 [ 2, %l0_start ], [ 0, %l2_if_else_false ]`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 4/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_IF_ELSE({
        booleanExpression: HIR_VARIABLE('bb', HIR_BOOL_TYPE),
        s1: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('bar', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
          }),
        ],
        s2: [],
        finalAssignments: [
          {
            name: 'ma',
            type: INT,
            branch1Value: HIR_INT(2),
            branch2Value: HIR_ZERO,
          },
        ],
      }),
    ],
    `  br i1 %bb, label %l1_if_else_true, label %l3_if_else_end
l1_if_else_true:
  call i32 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i32 [ 2, %l1_if_else_true ], [ 0, %l0_start ]`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 5/n', () => {
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
        finalAssignments: [],
      }),
    ],
    `  %bb = icmp eq i32 %t, 2
  br i1 %bb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  call i32 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  call i32 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 6/n', () => {
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
        finalAssignments: [
          {
            name: 'ma',
            type: INT,
            branch1Value: HIR_VARIABLE('b1', INT),
            branch2Value: HIR_VARIABLE('b2', INT),
          },
        ],
      }),
    ],
    `  br i1 %bbb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  %b1 = call i32 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  %b2 = call i32 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i32 [ %b1, %l1_if_else_true ], [ %b2, %l2_if_else_false ]`
  );
});

it('LLVM lowering works for HIR_IF_ELSE 7/n', () => {
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
            finalAssignments: [
              {
                name: 'ma_nested',
                type: INT,
                branch1Value: HIR_VARIABLE('b2', INT),
                branch2Value: HIR_VARIABLE('b3', INT),
              },
            ],
          }),
        ],
        finalAssignments: [
          {
            name: 'ma',
            type: INT,
            branch1Value: HIR_VARIABLE('b1', INT),
            branch2Value: HIR_VARIABLE('ma_nested', INT),
          },
        ],
      }),
    ],
    `  br i1 %bbb, label %l1_if_else_true, label %l2_if_else_false
l1_if_else_true:
  %b1 = call i32 @foo() nounwind
  br label %l3_if_else_end
l2_if_else_false:
  br i1 %bbb, label %l4_if_else_true, label %l5_if_else_false
l4_if_else_true:
  %b2 = call i32 @foo() nounwind
  br label %l6_if_else_end
l5_if_else_false:
  %b3 = call i32 @bar() nounwind
  br label %l6_if_else_end
l6_if_else_end:
  %ma_nested = phi i32 [ %b2, %l4_if_else_true ], [ %b3, %l5_if_else_false ]
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i32 [ %b1, %l1_if_else_true ], [ %ma_nested, %l6_if_else_end ]`
  );
});

it('LLVM lowering works for HIR_SINGLE_IF 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_SINGLE_IF({
        booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
        invertCondition: false,
        statements: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b1',
          }),
        ],
      }),
    ],
    `  br i1 %bbb, label %l1_single_if_block, label %l2_single_if_end
l1_single_if_block:
  %b1 = call i32 @foo() nounwind
  br label %l2_single_if_end
l2_single_if_end:`
  );
});

it('LLVM lowering works for HIR_SINGLE_IF 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_SINGLE_IF({
        booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
        invertCondition: true,
        statements: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b1',
          }),
        ],
      }),
    ],
    `  br i1 %bbb, label %l2_single_if_end, label %l1_single_if_block
l1_single_if_block:
  %b1 = call i32 @foo() nounwind
  br label %l2_single_if_end
l2_single_if_end:`
  );
});

it('LLVM lowering works for HIR_SINGLE_IF 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME('foo', HIR_FUNCTION_TYPE([], INT)),
        functionArguments: [],
        returnType: INT,
        returnCollector: 'b1',
      }),
      HIR_SINGLE_IF({
        booleanExpression: HIR_VARIABLE('bbb', HIR_BOOL_TYPE),
        invertCondition: true,
        statements: [],
      }),
    ],
    `  %b1 = call i32 @foo() nounwind`
  );
});

it('LLVM lowering works for HIR_WHILE 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_WHILE({
        loopVariables: [{ name: 'n', type: INT, initialValue: HIR_ZERO, loopValue: HIR_ZERO }],
        statements: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME('foo', INT),
            functionArguments: [],
            returnType: INT,
            returnCollector: 'b2',
          }),
        ],
      }),
    ],
    `  br label %l1_loop_start
l1_loop_start:
  %n = phi i32 [ 0, %l0_start ], [ 0, %l1_loop_start ]
  %b2 = call i32 @foo() nounwind
  br label %l1_loop_start`,
    {},
    false
  );
});

it('LLVM lowering works for HIR_WHILE 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_WHILE({
        loopVariables: [{ name: 'n', type: INT, initialValue: HIR_ZERO, loopValue: HIR_ZERO }],
        statements: [
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: false,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
        breakCollector: { name: 'v', type: INT },
      }),
    ],
    `  br label %l1_loop_start
l1_loop_start:
  %n = phi i32 [ 0, %l0_start ], [ 0, %l4_single_if_end ]
  br i1 0, label %l3_single_if_block, label %l4_single_if_end
l3_single_if_block:
  br label %l2_loop_end
l4_single_if_end:
  br label %l1_loop_start
l2_loop_end:
  %v = phi i32 [ 0, %l3_single_if_block ]`
  );
});

it('LLVM lowering works for HIR_WHILE 3/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_WHILE({
        loopVariables: [{ name: 'n', type: INT, initialValue: HIR_ZERO, loopValue: HIR_ZERO }],
        statements: [
          HIR_SINGLE_IF({
            booleanExpression: HIR_ZERO,
            invertCondition: true,
            statements: [HIR_BREAK(HIR_ZERO)],
          }),
        ],
        breakCollector: { name: 'v', type: INT },
      }),
    ],
    `  br label %l1_loop_start
l1_loop_start:
  %n = phi i32 [ 0, %l0_start ], [ 0, %l4_single_if_end ]
  br i1 0, label %l4_single_if_end, label %l3_single_if_block
l3_single_if_block:
  br label %l2_loop_end
l4_single_if_end:
  br label %l1_loop_start
l2_loop_end:
  %v = phi i32 [ 0, %l3_single_if_block ]`
  );
});

it('LLVM lowering works for HIR_STRUCT_INITIALIZATION 1/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_STRUCT_TYPE([INT, INT]),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_ptr_raw = call i32* @_builtin_malloc(i32 8) nounwind
  %s = bitcast i32* %_temp_0_struct_ptr_raw to { i32, i32 }*
  %_temp_1_struct_ptr_0 = getelementptr { i32, i32 }, { i32, i32 }* %s, i32 0, i32 0
  store i32 0, i32* %_temp_1_struct_ptr_0
  %_temp_2_struct_ptr_1 = getelementptr { i32, i32 }, { i32, i32 }* %s, i32 0, i32 1
  store i32 0, i32* %_temp_2_struct_ptr_1`
  );
});

it('LLVM lowering works for HIR_STRUCT_INITIALIZATION 2/n', () => {
  assertStatementLoweringWorks(
    [
      HIR_STRUCT_INITIALIZATION({
        structVariableName: 's',
        type: HIR_IDENTIFIER_TYPE('Foo'),
        expressionList: [HIR_ZERO, HIR_ZERO],
      }),
    ],
    `  %_temp_0_struct_ptr_raw = call i32* @_builtin_malloc(i32 8) nounwind
  %s = bitcast i32* %_temp_0_struct_ptr_raw to %Foo*
  %_temp_1_struct_ptr_0 = getelementptr %Foo, %Foo* %s, i32 0, i32 0
  store i32 0, i32* %_temp_1_struct_ptr_0
  %_temp_2_struct_ptr_1 = getelementptr %Foo, %Foo* %s, i32 0, i32 1
  store i32 0, i32* %_temp_2_struct_ptr_1`
  );
});

it('LLVM lowering works for HIR_CAST with type conversion', () => {
  assertStatementLoweringWorks(
    [HIR_CAST({ name: 's', type: HIR_STRING_TYPE, assignedExpression: HIR_ZERO })],
    '  %s = inttoptr i32 0 to i32*'
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
            returnValue: HIR_ZERO,
          },
        ],
      })
    )
  ).toEqual(`declare i32* @_builtin_malloc(i32) nounwind
declare i32 @_module__class_Builtins_function_println(i32*) nounwind
declare i32* @_module__class_Builtins_function_panic(i32*) nounwind
declare i32* @_module__class_Builtins_function_intToString(i32) nounwind
declare i32 @_module__class_Builtins_function_stringToInt(i32*) nounwind
declare i32* @_builtin_stringConcat(i32*, i32*) nounwind

; @ss = 'S'
@ss = private unnamed_addr constant [2 x i32] [i32 1, i32 83], align 8
%A = type { i32, i32 }
define i32 @test() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [2 x i32]* @ss to i32*
  call i32 @println(i32* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [2 x i32]* @ss to i32*
  %r = call i32 @stringToInt(i32* %_temp_1_string_name_cast) nounwind
  ret i32 0
}`);
});
