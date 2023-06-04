#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, INT_TYPE, ONE, ZERO,
    },
    common::Heap,
    optimization::local_value_numbering,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    expected: &str,
  ) {
    let Function { body, return_value, .. } = local_value_numbering::optimize_function(Function {
      name: heap.alloc_str_for_test(""),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: stmts,
      return_value,
    });
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(|s| s.debug_print(heap)).join("\n"),
      return_value.debug_print(heap)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_statements_tests() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
          index: 2,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
          index: 2,
        },
        Statement::binary(
          heap.alloc_str_for_test("b0"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b3"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
        ),
        Statement::Cast {
          name: heap.alloc_str_for_test("c1"),
          type_: INT_TYPE,
          assigned_expression: ZERO,
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("S")),
          expression_list: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b3"), INT_TYPE),
          ],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("S")),
          function_name: FunctionName::new(
            heap.alloc_str_for_test("a"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          ),
          context: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str_for_test("fff"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b3"), INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("fff"), INT_TYPE)),
          arguments: vec![],
          return_type: INT_TYPE,
          return_collector: None,
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("ss"), INT_TYPE),
      heap,
      r#"let i0: int = (a: int)[2];
let b0 = (i0: int) + 3;
let b3 = (i0: int) + (b0: int);
let c1 = 0 as int;
let s: S = [(i0: int), (b0: int), (b3: int)];
let s: S = Closure { fun: (a: () -> int), context: 0 };
fff((i0: int), (b0: int), (b3: int));
(fff: int)();
return (ss: int);"#,
    );
  }

  #[test]
  fn if_else_tests() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i4"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i2"), INT_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![],
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i5"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("i0"), INT_TYPE),
          index: 1,
        },
      ],
      ZERO,
      heap,
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
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("i4"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("i2"), INT_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![(
            heap.alloc_str_for_test("bar"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("i2"), INT_TYPE),
          )],
        },
      ],
      ZERO,
      heap,
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

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              Operator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (heap.alloc_str_for_test("c"), INT_TYPE, ZERO, ONE),
              (
                heap.alloc_str_for_test("_tmp_n"),
                INT_TYPE,
                Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_TYPE),
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
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              Operator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (heap.alloc_str_for_test("c"), INT_TYPE, ZERO, ONE),
              (
                heap.alloc_str_for_test("_tmp_n"),
                INT_TYPE,
                Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_TYPE),
              ),
            ],
          },
        ],
        break_collector: Some(VariableName { name: heap.alloc_str_for_test("v"), type_: INT_TYPE }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
      heap,
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
