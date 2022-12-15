#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariables, Operator, Statement, Type,
      VariableName, BOOL_TYPE, FALSE, INT_TYPE, ONE, TRUE, ZERO,
    },
    common::rcs,
    optimization::local_value_numbering,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, return_value: Expression, expected: &str) {
    let Function { body, return_value, .. } = local_value_numbering::optimize_function(Function {
      name: rcs(""),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: stmts,
      return_value,
    });
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(Statement::debug_print).join("\n"),
      return_value.debug_print()
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_statements_tests() {
    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: rcs("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", INT_TYPE),
          index: 2,
        },
        Statement::IndexedAccess {
          name: rcs("i1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", INT_TYPE),
          index: 2,
        },
        Statement::binary(
          "b0",
          Operator::PLUS,
          Expression::var_name("i0", INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          "b1",
          Operator::PLUS,
          Expression::var_name("i0", INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          "b3",
          Operator::PLUS,
          Expression::var_name("i1", INT_TYPE),
          Expression::var_name("b1", INT_TYPE),
        ),
        Statement::StructInit {
          struct_variable_name: rcs("s"),
          type_: Type::new_id_no_targs_unwrapped("S"),
          expression_list: vec![
            Expression::var_name("i1", INT_TYPE),
            Expression::var_name("b1", INT_TYPE),
            Expression::var_name("b3", INT_TYPE),
          ],
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("s"),
          closure_type: Type::new_id_no_targs_unwrapped("S"),
          function_name: FunctionName::new("a", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "fff",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name("i1", INT_TYPE),
            Expression::var_name("b1", INT_TYPE),
            Expression::var_name("b3", INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName::new("fff", INT_TYPE)),
          arguments: vec![],
          return_type: INT_TYPE,
          return_collector: None,
        },
      ],
      Expression::var_name("ss", INT_TYPE),
      r#"let i0: int = (a: int)[2];
let b0: int = (i0: int) + 3;
let b3: int = (i0: int) + (b0: int);
let s: S = [(i0: int), (b0: int), (b3: int)];
let s: S = Closure { fun: (a: () -> int), context: 0 };
fff((i0: int), (b0: int), (b3: int));
(fff: int)();
return (ss: int);"#,
    );
  }

  #[test]
  fn if_else_tests() {
    assert_correctly_optimized(
      vec![
        Statement::IndexedAccess {
          name: rcs("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", INT_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: rcs("i1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: rcs("i3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("i1", INT_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: rcs("i2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: rcs("i4"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("i2", INT_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![],
        },
        Statement::IndexedAccess {
          name: rcs("i5"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("i0", INT_TYPE),
          index: 1,
        },
      ],
      ZERO,
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
          name: rcs("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", INT_TYPE),
          index: 2,
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![
            Statement::IndexedAccess {
              name: rcs("i1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: rcs("i3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("i1", INT_TYPE),
              index: 1,
            },
          ],
          s2: vec![
            Statement::IndexedAccess {
              name: rcs("i2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 2,
            },
            Statement::IndexedAccess {
              name: rcs("i4"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("i2", INT_TYPE),
              index: 1,
            },
          ],
          final_assignments: vec![(
            rcs("bar"),
            INT_TYPE,
            Expression::var_name("i1", INT_TYPE),
            Expression::var_name("i2", INT_TYPE),
          )],
        },
      ],
      ZERO,
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
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariables {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("_tmp_n", INT_TYPE),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              "s2_n",
              Operator::MINUS,
              Expression::var_name("n", INT_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (rcs("c"), INT_TYPE, FALSE, TRUE),
              (
                rcs("_tmp_n"),
                INT_TYPE,
                Expression::var_name("n", INT_TYPE),
                Expression::var_name("s2_n", INT_TYPE),
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
      r#"let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
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
        loop_variables: vec![GenenalLoopVariables {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("_tmp_n", INT_TYPE),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            s1: vec![],
            s2: vec![Statement::binary(
              "s2_n",
              Operator::MINUS,
              Expression::var_name("n", INT_TYPE),
              ONE,
            )],
            final_assignments: vec![
              (rcs("c"), INT_TYPE, FALSE, TRUE),
              (
                rcs("_tmp_n"),
                INT_TYPE,
                Expression::var_name("n", INT_TYPE),
                Expression::var_name("s2_n", INT_TYPE),
              ),
            ],
          },
        ],
        break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
      }],
      Expression::var_name("v", INT_TYPE),
      r#"let n: int = 10;
let v: int;
while (true) {
  let is_zero: bool = (n: int) == 0;
  let c: int;
  let _tmp_n: int;
  if (is_zero: bool) {
    c = 0;
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    c = 1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return (v: int);"#,
    );
  }
}
