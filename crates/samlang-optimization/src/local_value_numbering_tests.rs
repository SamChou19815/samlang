#[cfg(test)]
mod tests {
  use super::super::local_value_numbering;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::BinaryOperator,
    mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, GenenalLoopVariable,
      Statement, SymbolTable, Type, VariableName, INT_32_TYPE, ONE, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  fn assert_correctly_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    table: &SymbolTable,
    expected: &str,
  ) {
    let mut f = Function {
      name: FunctionName::new_for_test(PStr::LOWER_A),
      parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
      body: stmts,
      return_value,
    };
    local_value_numbering::optimize_function(&mut f);
    let actual = format!(
      "{}\nreturn {};",
      f.body.iter().map(|s| s.debug_print(heap, table)).join("\n"),
      f.return_value.debug_print(heap, table)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_statements_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
          index: 2,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i1"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
          index: 2,
        },
        Statement::binary(
          heap.alloc_str_for_test("b0"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::i32(3),
        ),
        Statement::IsPointer {
          name: heap.alloc_str_for_test("u0"),
          operand: Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
        },
        Statement::binary(
          heap.alloc_str_for_test("b1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::i32(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b3"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
        ),
        Statement::Cast {
          name: heap.alloc_str_for_test("c1"),
          type_: INT_32_TYPE,
          assigned_expression: ZERO,
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("c2"), type_: INT_32_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("c2"),
          assigned_expression: ZERO,
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("S")),
          expression_list: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b3"), INT_32_TYPE),
          ],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s"),
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("S")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_A),
            type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          },
          context: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("fff")),
            type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          }),
          arguments: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b3"), INT_32_TYPE),
          ],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("fff"), INT_32_TYPE)),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("ss"), INT_32_TYPE),
      heap,
      table,
      r#"let i0: int = (a: int)[2];
let b0 = (i0: int) + 3;
let u0 = is_pointer((i0: int));
let b3 = (i0: int) + (b0: int);
let c1 = 0 as int;
let c2: int;
c2 = 0;
let s: _S = [(i0: int), (b0: int), (b3: int)];
let s: _S = Closure { fun: (__$a: () -> int), context: 0 };
__$fff((i0: int), (b0: int), (b3: int));
(fff: int)();
return (ss: int);"#,
    );
  }

  #[test]
  fn if_else_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i1"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i3"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i2"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i4"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i2"), INT_32_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![],
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i5"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          index: 1,
        },
      ],
      ZERO,
      heap,
      table,
      r#"let i0: int = (a: int)[2];
if 0 {
  let i3: int = (i0: int)[1];
} else {
  let i4: int = (i0: int)[1];
}
let i5: int = (i0: int)[1];
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i1"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i3"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i2"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i4"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i2"), INT_32_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![(
            heap.alloc_str_for_test("bar"),
            INT_32_TYPE,
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("i2"), INT_32_TYPE),
          )],
        },
      ],
      ZERO,
      heap,
      table,
      r#"let i0: int = (a: int)[2];
let bar: int;
if 0 {
  let i3: int = (i0: int)[1];
  bar = (i0: int);
} else {
  let i4: int = (i0: int)[1];
  bar = (i0: int);
}
return 0;"#,
    );
  }

  #[test]
  fn while_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            BinaryOperator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              BinaryOperator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (PStr::LOWER_C, INT_32_TYPE, ZERO, ONE),
              (
                heap.alloc_str_for_test("_tmp_n"),
                INT_32_TYPE,
                Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
                Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_32_TYPE),
              ),
            ],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      r#"let n: int = 10;
while (true) {
  let is_zero = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: int) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  if 0 {
    undefined = 0;
    break;
  }
  n = (_tmp_n: int);
}
return 0;"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            BinaryOperator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              BinaryOperator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (PStr::LOWER_C, INT_32_TYPE, ZERO, ONE),
              (
                heap.alloc_str_for_test("_tmp_n"),
                INT_32_TYPE,
                Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
                Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_32_TYPE),
              ),
            ],
          },
        ],
        break_collector: Some(VariableName {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
        }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      r#"let n: int = 10;
let v: int;
while (true) {
  let is_zero = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: int) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return (v: int);"#,
    );
  }
}
