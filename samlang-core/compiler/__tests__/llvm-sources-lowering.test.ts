import { prettyPrintLLVMFunction, prettyPrintLLVMSources } from '../../ast/llvm-nodes';
import {
  MidIRExpression,
  MidIRStatement,
  MIR_INT_TYPE as INT,
  MIR_BOOL_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_IDENTIFIER_TYPE,
  MIR_STRING_TYPE,
  MIR_FALSE,
  MIR_TRUE,
  MIR_NAME,
  MIR_VARIABLE,
  MIR_ZERO,
  MIR_BINARY,
  MIR_FUNCTION_CALL,
  MIR_IF_ELSE,
  MIR_SINGLE_IF,
  MIR_BREAK,
  MIR_WHILE,
  MIR_INDEX_ACCESS,
  MIR_INDEX_ASSIGN,
  MIR_INT,
  MIR_CAST,
  MIR_STRUCT_INITIALIZATION,
} from '../../ast/mir-nodes';
import type { MidIRFunction } from '../../ast/mir-nodes';
import lowerMidIRSourcesToLLVMSources, {
  lowerMidIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING,
} from '../llvm-sources-lowering';

function assertLoweringWorks(
  midIRFunction: MidIRFunction,
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void {
  expect(
    prettyPrintLLVMFunction(
      lowerMidIRFunctionToLLVMFunction_EXPOSED_FOR_TESTING(midIRFunction, globalStrings)
    )
  ).toBe(expectedString);
}

function assertStatementLoweringWorks(
  statements: readonly MidIRStatement[],
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {},
  hasReturn = true
): void {
  assertLoweringWorks(
    {
      name: 'testFunction',
      parameters: [],
      type: MIR_FUNCTION_TYPE([], INT),
      body: statements,
      returnValue: MIR_ZERO,
    },
    `define i64 @testFunction() local_unnamed_addr nounwind {
l0_start:
${expectedString}${hasReturn ? '\n  ret i64 0' : ''}
}`,
    globalStrings
  );
}

function assertExpressionLoweringWorks(
  expression: MidIRExpression,
  expectedString: string,
  globalStrings: Readonly<Record<string, number>> = {}
): void {
  assertLoweringWorks(
    {
      name: 'testFunction',
      parameters: [],
      type: MIR_FUNCTION_TYPE([], INT),
      body: [],
      returnValue: expression,
    },
    `define i64 @testFunction() local_unnamed_addr nounwind {
l0_start:
${expectedString}
}`,
    globalStrings
  );
}

describe('llvm-lowering-translator', () => {
  it('LLVM lowering works for base expressions 1/n', () => {
    assertExpressionLoweringWorks(MIR_INT(42), '  ret i64 42');
    assertExpressionLoweringWorks(MIR_TRUE, '  ret i64 1');
    assertExpressionLoweringWorks(MIR_FALSE, '  ret i64 0');
  });

  it('LLVM lowering works for base expressions 2/n', () => {
    assertExpressionLoweringWorks(MIR_INT(42), '  ret i64 42');
    assertExpressionLoweringWorks(MIR_NAME('bar', INT), '  ret i64 @bar');
    assertExpressionLoweringWorks(MIR_VARIABLE('bar', INT), '  ret i64 %bar');
    assertLoweringWorks(
      {
        name: 'foo',
        parameters: ['bar'],
        type: MIR_FUNCTION_TYPE([INT], INT),
        body: [],
        returnValue: MIR_VARIABLE('bar', INT),
      },
      `define i64 @foo(i64 %bar) local_unnamed_addr nounwind {
l0_start:
  ret i64 %bar
}`
    );
  });

  it('LLVM lowering works for base expressions 3/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_INDEX_ACCESS({
          name: 'foo',
          type: INT,
          pointerExpression: MIR_VARIABLE('bar', MIR_IDENTIFIER_TYPE('Bar')),
          index: 3,
        }),
        MIR_INDEX_ASSIGN({
          assignedExpression: MIR_VARIABLE('foo', INT),
          pointerExpression: MIR_VARIABLE('bar', MIR_IDENTIFIER_TYPE('Bar')),
          index: 3,
        }),
      ],
      `  %_temp_0_index_pointer_temp = getelementptr %Bar, %Bar* %bar, i32 0, i32 3
  %foo = load i64, i64* %_temp_0_index_pointer_temp
  %_temp_1_index_pointer_temp = getelementptr %Bar, %Bar* %bar, i32 0, i32 3
  store i64 %foo, i64* %_temp_1_index_pointer_temp`
    );
  });

  it('LLVM lowering works for base expressions 4/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_BINARY({
          name: 'foo',
          operator: '/',
          e1: MIR_VARIABLE('bar', INT),
          e2: MIR_VARIABLE('baz', INT),
        }),
      ],
      '  %foo = sdiv i64 %bar, %baz'
    );
  });

  it('LLVM lowering works for MIR_FUNCTION_CALL', () => {
    assertStatementLoweringWorks(
      [
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('println', MIR_FUNCTION_TYPE([MIR_STRING_TYPE], INT)),
          functionArguments: [MIR_NAME('ss', MIR_STRING_TYPE)],
          returnType: INT,
        }),
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('stringToInt', MIR_FUNCTION_TYPE([MIR_STRING_TYPE], INT)),
          functionArguments: [MIR_NAME('ss', MIR_STRING_TYPE)],
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

  it('LLVM lowering works for MIR_IF_ELSE 1/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_BINARY({
          name: 'bb',
          operator: '==',
          e1: MIR_VARIABLE('t', INT),
          e2: MIR_INT(2),
        }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
          s1: [],
          s2: [],
          finalAssignments: [],
        }),
      ],
      `  %bb = icmp eq i64 %t, 2`
    );
  });

  it('LLVM lowering works for MIR_IF_ELSE 2/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
          s1: [],
          s2: [],
          finalAssignments: [
            {
              name: 'ma',
              type: INT,
              branch1Value: MIR_INT(2),
              branch2Value: MIR_ZERO,
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
  %ma = phi i64 [ 2, %l1_if_else_true ], [ 0, %l2_if_else_false ]`
    );
  });

  it('LLVM lowering works for MIR_IF_ELSE 3/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
          s1: [],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('bar', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: INT,
              branch1Value: MIR_INT(2),
              branch2Value: MIR_ZERO,
            },
          ],
        }),
      ],
      `  br i1 %bb, label %l3_if_else_end, label %l2_if_else_false
l2_if_else_false:
  call i64 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i64 [ 2, %l0_start ], [ 0, %l2_if_else_false ]`
    );
  });

  it('LLVM lowering works for MIR_IF_ELSE 4/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('bar', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
            }),
          ],
          s2: [],
          finalAssignments: [
            {
              name: 'ma',
              type: INT,
              branch1Value: MIR_INT(2),
              branch2Value: MIR_ZERO,
            },
          ],
        }),
      ],
      `  br i1 %bb, label %l1_if_else_true, label %l3_if_else_end
l1_if_else_true:
  call i64 @bar() nounwind
  br label %l3_if_else_end
l3_if_else_end:
  %ma = phi i64 [ 2, %l1_if_else_true ], [ 0, %l0_start ]`
    );
  });

  it('LLVM lowering works for MIR_IF_ELSE 5/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_BINARY({
          name: 'bb',
          operator: '==',
          e1: MIR_VARIABLE('t', INT),
          e2: MIR_INT(2),
        }),
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bb', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('bar', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
            }),
          ],
          finalAssignments: [],
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

  it('LLVM lowering works for MIR_IF_ELSE 6/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b1',
            }),
          ],
          s2: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('bar', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b2',
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: INT,
              branch1Value: MIR_VARIABLE('b1', INT),
              branch2Value: MIR_VARIABLE('b2', INT),
            },
          ],
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

  it('LLVM lowering works for MIR_IF_ELSE 7/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_IF_ELSE({
          booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
          s1: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b1',
            }),
          ],
          s2: [
            MIR_IF_ELSE({
              booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
              s1: [
                MIR_FUNCTION_CALL({
                  functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
                  functionArguments: [],
                  returnType: INT,
                  returnCollector: 'b2',
                }),
              ],
              s2: [
                MIR_FUNCTION_CALL({
                  functionExpression: MIR_NAME('bar', MIR_FUNCTION_TYPE([], INT)),
                  functionArguments: [],
                  returnType: INT,
                  returnCollector: 'b3',
                }),
              ],
              finalAssignments: [
                {
                  name: 'ma_nested',
                  type: INT,
                  branch1Value: MIR_VARIABLE('b2', INT),
                  branch2Value: MIR_VARIABLE('b3', INT),
                },
              ],
            }),
          ],
          finalAssignments: [
            {
              name: 'ma',
              type: INT,
              branch1Value: MIR_VARIABLE('b1', INT),
              branch2Value: MIR_VARIABLE('ma_nested', INT),
            },
          ],
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

  it('LLVM lowering works for MIR_SINGLE_IF 1/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
          invertCondition: false,
          statements: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b1',
            }),
          ],
        }),
      ],
      `  br i1 %bbb, label %l1_single_if_block, label %l2_single_if_end
l1_single_if_block:
  %b1 = call i64 @foo() nounwind
  br label %l2_single_if_end
l2_single_if_end:`
    );
  });

  it('LLVM lowering works for MIR_SINGLE_IF 2/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
          invertCondition: true,
          statements: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b1',
            }),
          ],
        }),
      ],
      `  br i1 %bbb, label %l2_single_if_end, label %l1_single_if_block
l1_single_if_block:
  %b1 = call i64 @foo() nounwind
  br label %l2_single_if_end
l2_single_if_end:`
    );
  });

  it('LLVM lowering works for MIR_SINGLE_IF 3/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME('foo', MIR_FUNCTION_TYPE([], INT)),
          functionArguments: [],
          returnType: INT,
          returnCollector: 'b1',
        }),
        MIR_SINGLE_IF({
          booleanExpression: MIR_VARIABLE('bbb', MIR_BOOL_TYPE),
          invertCondition: true,
          statements: [],
        }),
      ],
      `  %b1 = call i64 @foo() nounwind`
    );
  });

  it('LLVM lowering works for MIR_WHILE 1/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_WHILE({
          loopVariables: [{ name: 'n', type: INT, initialValue: MIR_ZERO, loopValue: MIR_ZERO }],
          statements: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('foo', INT),
              functionArguments: [],
              returnType: INT,
              returnCollector: 'b2',
            }),
          ],
        }),
      ],
      `  br label %l1_loop_start
l1_loop_start:
  %n = phi i64 [ 0, %l0_start ], [ 0, %l1_loop_start ]
  %b2 = call i64 @foo() nounwind
  br label %l1_loop_start`,
      {},
      false
    );
  });

  it('LLVM lowering works for MIR_WHILE 2/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_WHILE({
          loopVariables: [{ name: 'n', type: INT, initialValue: MIR_ZERO, loopValue: MIR_ZERO }],
          statements: [
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: false,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          breakCollector: { name: 'v', type: INT },
        }),
      ],
      `  br label %l1_loop_start
l1_loop_start:
  %n = phi i64 [ 0, %l0_start ], [ 0, %l4_single_if_end ]
  br i1 0, label %l3_single_if_block, label %l4_single_if_end
l3_single_if_block:
  br label %l2_loop_end
l4_single_if_end:
  br label %l1_loop_start
l2_loop_end:
  %v = phi i64 [ 0, %l3_single_if_block ]`
    );
  });

  it('LLVM lowering works for MIR_WHILE 3/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_WHILE({
          loopVariables: [{ name: 'n', type: INT, initialValue: MIR_ZERO, loopValue: MIR_ZERO }],
          statements: [
            MIR_SINGLE_IF({
              booleanExpression: MIR_ZERO,
              invertCondition: true,
              statements: [MIR_BREAK(MIR_ZERO)],
            }),
          ],
          breakCollector: { name: 'v', type: INT },
        }),
      ],
      `  br label %l1_loop_start
l1_loop_start:
  %n = phi i64 [ 0, %l0_start ], [ 0, %l4_single_if_end ]
  br i1 0, label %l4_single_if_end, label %l3_single_if_block
l3_single_if_block:
  br label %l2_loop_end
l4_single_if_end:
  br label %l1_loop_start
l2_loop_end:
  %v = phi i64 [ 0, %l3_single_if_block ]`
    );
  });

  it('LLVM lowering works for MIR_STRUCT_INITIALIZATION 1/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: INT,
          expressionList: [MIR_ZERO, MIR_ZERO],
        }),
      ],
      `  %_temp_0_struct_ptr_raw = call i64* @_builtin_malloc(i64 16) nounwind
  %s = ptrtoint i64* %_temp_0_struct_ptr_raw to i64
  %_temp_1_struct_ptr_0 = getelementptr i6, i64 %s, i32 0, i32 0
  store i64 0, i64* %_temp_1_struct_ptr_0
  %_temp_2_struct_ptr_1 = getelementptr i6, i64 %s, i32 0, i32 1
  store i64 0, i64* %_temp_2_struct_ptr_1`
    );
  });

  it('LLVM lowering works for MIR_STRUCT_INITIALIZATION 2/n', () => {
    assertStatementLoweringWorks(
      [
        MIR_STRUCT_INITIALIZATION({
          structVariableName: 's',
          type: MIR_IDENTIFIER_TYPE('Foo'),
          expressionList: [MIR_ZERO, MIR_ZERO],
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

  it('LLVM lowering works for MIR_CAST with type conversion', () => {
    assertStatementLoweringWorks(
      [MIR_CAST({ name: 's', type: MIR_STRING_TYPE, assignedExpression: MIR_ZERO })],
      '  %s = inttoptr i64 0 to i64*'
    );
  });

  it('lowerMidIRSourcesToLLVMSources works', () => {
    const sources = lowerMidIRSourcesToLLVMSources({
      globalVariables: [{ name: 'ss', content: 'S' }],
      typeDefinitions: [{ identifier: 'A', mappings: [INT, INT] }],
      mainFunctionNames: ['___DUMMY___Main_main'],
      functions: [
        {
          name: '___DUMMY___Main_main',
          parameters: [],
          type: MIR_FUNCTION_TYPE([], INT),
          body: [
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME('println', MIR_FUNCTION_TYPE([MIR_STRING_TYPE], INT)),
              functionArguments: [MIR_NAME('ss', MIR_STRING_TYPE)],
              returnType: INT,
            }),
            MIR_FUNCTION_CALL({
              functionExpression: MIR_NAME(
                'stringToInt',
                MIR_FUNCTION_TYPE([MIR_STRING_TYPE], INT)
              ),
              functionArguments: [MIR_NAME('ss', MIR_STRING_TYPE)],
              returnType: INT,
              returnCollector: 'r',
            }),
          ],
          returnValue: MIR_ZERO,
        },
      ],
    });
    expect(prettyPrintLLVMSources(sources)).toBe(
      `declare i64* @_builtin_malloc(i64) nounwind
declare i64 @__Builtins_println(i64*) nounwind
declare i64 @__Builtins_panic(i64*) nounwind
declare i64* @__Builtins_intToString(i64) nounwind
declare i64 @__Builtins_stringToInt(i64*) nounwind
declare i64* @_builtin_stringConcat(i64*, i64*) nounwind
declare i64 @_builtin_free(i64*) nounwind

; @ss = 'S'
@ss = private unnamed_addr constant [3 x i64] [i64 0, i64 1, i64 83], align 8
%A = type { i64, i64 }
define i64 @___DUMMY___Main_main() local_unnamed_addr nounwind {
l0_start:
  %_temp_0_string_name_cast = bitcast [3 x i64]* @ss to i64*
  call i64 @println(i64* %_temp_0_string_name_cast) nounwind
  %_temp_1_string_name_cast = bitcast [3 x i64]* @ss to i64*
  %r = call i64 @stringToInt(i64* %_temp_1_string_name_cast) nounwind
  ret i64 0
}`
    );
  });
});
