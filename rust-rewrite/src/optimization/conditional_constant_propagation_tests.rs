#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, FALSE, INT_TYPE, ONE, TRUE, ZERO,
    },
    common::rcs,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, return_value: Expression, expected: &str) {
    let Function { body, return_value, .. } =
      super::super::conditional_constant_propagation::optimize_function(Function {
        name: rcs(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: stmts,
        return_value,
      });
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(|it| it.debug_print()).join("\n"),
      return_value.debug_print()
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_sequence_test() {
    assert_correctly_optimized(
      vec![
        Statement::binary("a0", Operator::PLUS, Expression::int(3), Expression::int(3)),
        Statement::binary(
          "a1",
          Operator::MUL,
          Expression::var_name("a0", INT_TYPE),
          Expression::var_name("a0", INT_TYPE),
        ),
        Statement::binary(
          "a2",
          Operator::MINUS,
          Expression::var_name("a1", INT_TYPE),
          Expression::var_name("a0", INT_TYPE),
        ),
        Statement::IndexedAccess {
          name: rcs("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a0", INT_TYPE),
          index: 2,
        },
        Statement::binary("a3", Operator::MUL, Expression::var_name("a2", INT_TYPE), ONE),
        Statement::binary(
          "b1",
          Operator::DIV,
          Expression::var_name("a2", INT_TYPE),
          Expression::var_name("a2", INT_TYPE),
        ),
        Statement::binary(
          "b2",
          Operator::MINUS,
          Expression::var_name("a2", INT_TYPE),
          Expression::var_name("a2", INT_TYPE),
        ),
        Statement::binary(
          "b3",
          Operator::MUL,
          Expression::var_name("b1", INT_TYPE),
          Expression::var_name("b2", INT_TYPE),
        ),
        Statement::binary(
          "b4",
          Operator::MOD,
          Expression::var_name("b1", INT_TYPE),
          Expression::var_name("b1", INT_TYPE),
        ),
        Statement::binary(
          "b5",
          Operator::MINUS,
          Expression::var_name("i0", INT_TYPE),
          Expression::var_name("i0", INT_TYPE),
        ),
        Statement::binary(
          "b6",
          Operator::MOD,
          Expression::var_name("i0", INT_TYPE),
          Expression::var_name("i0", INT_TYPE),
        ),
        Statement::binary(
          "b7",
          Operator::DIV,
          Expression::var_name("i0", INT_TYPE),
          Expression::var_name("i0", INT_TYPE),
        ),
        Statement::binary(
          "b8",
          Operator::MUL,
          Expression::var_name("i0", INT_TYPE),
          Expression::var_name("i0", INT_TYPE),
        ),
        Statement::binary("a4", Operator::PLUS, Expression::var_name("a3", INT_TYPE), ZERO),
        Statement::binary(
          "a5",
          Operator::DIV,
          Expression::var_name("a4", INT_TYPE),
          Expression::var_name("b1", INT_TYPE),
        ),
        Statement::binary(
          "a6",
          Operator::DIV,
          Expression::var_name("i1", INT_TYPE),
          Expression::var_name("a5", INT_TYPE),
        ),
        Statement::StructInit {
          struct_variable_name: rcs("s"),
          type_: Type::new_id_no_targs_unwrapped("Id"),
          expression_list: vec![
            Expression::var_name("b2", INT_TYPE),
            Expression::var_name("a6", INT_TYPE),
            Expression::var_name("a5", INT_TYPE),
          ],
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("s"),
          closure_type: Type::new_id_no_targs_unwrapped("Id"),
          function_name: FunctionName::new("closure", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: Expression::var_name("b2", INT_TYPE),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "fff",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name("b1", INT_TYPE),
            Expression::var_name("b2", INT_TYPE),
            Expression::var_name("b3", INT_TYPE),
            Expression::var_name("b4", INT_TYPE),
            Expression::var_name("b5", INT_TYPE),
            Expression::var_name("b6", INT_TYPE),
            Expression::var_name("b7", INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::binary(
          "a7",
          Operator::MOD,
          Expression::var_name("a5", INT_TYPE),
          Expression::int(12),
        ),
        Statement::binary(
          "a8",
          Operator::MUL,
          Expression::var_name("a7", INT_TYPE),
          Expression::int(7),
        ),
        Statement::binary("a9", Operator::DIV, Expression::var_name("a7", INT_TYPE), ZERO),
        Statement::binary("a10", Operator::MOD, Expression::var_name("a7", INT_TYPE), ZERO),
        Statement::binary("a11", Operator::DIV, Expression::int(-11), Expression::int(10)),
        Statement::binary("a12", Operator::DIV, Expression::int(11), Expression::int(10)),
        Statement::binary(
          "a13",
          Operator::PLUS,
          Expression::var_name("a11", INT_TYPE),
          Expression::var_name("a8", INT_TYPE),
        ),
        Statement::binary(
          "a14",
          Operator::PLUS,
          Expression::var_name("a13", INT_TYPE),
          Expression::var_name("a12", INT_TYPE),
        ),
        Statement::binary(
          "a15",
          Operator::MUL,
          Expression::var_name("i0", INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          "a16",
          Operator::PLUS,
          Expression::var_name("a15", INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          "a17",
          Operator::PLUS,
          Expression::var_name("a14", INT_TYPE),
          Expression::var_name("a16", INT_TYPE),
        ),
        Statement::binary(
          "a18",
          Operator::DIV,
          Expression::var_name("a15", INT_TYPE),
          Expression::int(5),
        ),
      ],
      Expression::var_name("a17", INT_TYPE),
      r#"let i0: int = 6[2];
let b8: int = (i0: int) * (i0: int);
let a6: int = (i1: int) / 30;
let s: Id = [0, (a6: int), 30];
let s: Id = Closure { fun: (closure: () -> int), context: 0 };
fff(1, 0, 0, 0, 0, 0, 1);
let a9: int = 6 / 0;
let a10: int = 6 % 0;
let a15: int = (i0: int) * 5;
let a16: int = (a15: int) + 5;
let a17: int = (a15: int) + 47;
let a18: int = (a15: int) / 5;
return (a17: int);"#,
    );
  }

  #[test]
  fn index_sequence_test() {
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: rcs("a"),
          type_: Type::new_id_no_targs_unwrapped("Id"),
          expression_list: vec![ZERO, ONE],
        },
        Statement::IndexedAccess {
          name: rcs("v1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", Type::new_id_no_targs("Id")),
          index: 0,
        },
        Statement::IndexedAccess {
          name: rcs("v2"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("a", Type::new_id_no_targs("Id")),
          index: 1,
        },
        Statement::binary(
          "result",
          Operator::PLUS,
          Expression::var_name("v1", INT_TYPE),
          Expression::var_name("v2", INT_TYPE),
        ),
      ],
      Expression::var_name("result", INT_TYPE),
      r#"let a: Id = [0, 1];
return 1;"#,
    );
  }

  #[test]
  fn binary_sequence_tests() {
    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::PLUS,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(2),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: int = (a0: int) + 4;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::MINUS,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: int = (a0: int) + -1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::MINUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::PLUS,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + -2;
let a2: int = (a0: int) + 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::MINUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::MINUS,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + -2;
let a2: int = (a0: int) + -5;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::MUL,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::MUL,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          "a3",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a4",
          Operator::MUL,
          Expression::var_name("a3", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) * 2;
let a2: int = (a0: int) * 6;
let a3: int = (a0: int) + 2;
let a4: int = (a3: int) * 3;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::LT,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) < 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::LE,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) <= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::GT,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) > 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::GE,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) >= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::EQ,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) == 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::PLUS,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::NE,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) != 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          "a1",
          Operator::MUL,
          Expression::var_name("a0", INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          "a2",
          Operator::EQ,
          Expression::var_name("a1", INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      r#"let a1: int = (a0: int) * 2;
let a2: bool = (a1: int) == 3;
return 0;"#,
    );
  }

  #[test]
  fn if_else_tests() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b1", Operator::LT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b1", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::binary("b2", Operator::GT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b2", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::binary("b3", Operator::LE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b3", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a2")),
          }],
          final_assignments: vec![(
            rcs("ma1"),
            INT_TYPE,
            Expression::var_name("a1", INT_TYPE),
            Expression::var_name("a2", INT_TYPE),
          )],
        },
        Statement::binary("b4", Operator::GE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b4", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a11")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a22")),
          }],
          final_assignments: vec![(
            rcs("ma2"),
            INT_TYPE,
            Expression::var_name("a11", INT_TYPE),
            Expression::var_name("a22", INT_TYPE),
          )],
        },
        Statement::binary(
          "r1",
          Operator::EQ,
          Expression::var_name("ma1", INT_TYPE),
          Expression::var_name("ma2", INT_TYPE),
        ),
        Statement::binary("r2", Operator::NE, ONE, ZERO),
        Statement::binary("r3", Operator::XOR, TRUE, FALSE),
        Statement::binary("r4", Operator::NE, ONE, ZERO),
        Statement::binary(
          "r5",
          Operator::EQ,
          Expression::var_name("r4", BOOL_TYPE),
          Expression::var_name("r2", BOOL_TYPE),
        ),
      ],
      Expression::var_name("r5", BOOL_TYPE),
      r#"foo();
bar();
let a1: int = foo();
let a22: int = bar();
let r1: bool = (a22: int) == (a1: int);
return 1;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary("a0", Operator::PLUS, Expression::int(3), Expression::int(3)),
        Statement::binary("a1", Operator::MUL, Expression::int(3), Expression::int(3)),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a0", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a1", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a0", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "bar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a1", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a2")),
          }],
          final_assignments: vec![(
            rcs("ma1"),
            INT_TYPE,
            Expression::var_name("a1", INT_TYPE),
            Expression::var_name("a2", INT_TYPE),
          )],
        },
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![],
          s2: vec![],
          final_assignments: vec![(
            rcs("ma2"),
            INT_TYPE,
            Expression::var_name("a0", INT_TYPE),
            Expression::var_name("a0", INT_TYPE),
          )],
        },
      ],
      Expression::var_name("ma2", INT_TYPE),
      r#"if (b: bool) {
  foo(6);
} else {
  bar(9);
}
let ma1: int;
if (b: bool) {
  let a1: int = foo(6);
  ma1 = 9;
} else {
  let a2: int = bar(9);
  ma1 = (a2: int);
}
return 6;"#,
    );

    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: false,
        statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
      }],
      ZERO,
      "\nreturn 0;",
    );
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: true,
        statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
      }],
      ZERO,
      "undefined = (n: int);\nbreak;\nreturn 0;",
    );
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: Expression::var_name("n", INT_TYPE),
        invert_condition: false,
        statements: vec![],
      }],
      ZERO,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_tests() {
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(4),
          loop_value: Expression::var_name("_tmp_n", INT_TYPE),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
          },
          Statement::binary("_tmp_n", Operator::MINUS, Expression::var_name("n", INT_TYPE), ONE),
        ],
        break_collector: None,
      }],
      ZERO,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(4),
          loop_value: Expression::var_name("_tmp_n", INT_TYPE),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
          },
          Statement::binary("_tmp_n", Operator::MINUS, Expression::var_name("n", INT_TYPE), ONE),
        ],
        break_collector: Some(VariableName { name: rcs("b"), type_: INT_TYPE }),
      }],
      Expression::var_name("b", INT_TYPE),
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("_tmp_n", INT_TYPE),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
          },
          Statement::binary("_tmp_n", Operator::MINUS, Expression::var_name("n", INT_TYPE), ONE),
        ],
        break_collector: None,
      }],
      ZERO,
      r#"let n: int = 4;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = (n: int);
    break;
  }
  let _tmp_n: int = (n: int) + -1;
  n = (_tmp_n: int);
}
return 0;"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(10),
        }],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            invert_condition: true,
            statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
          },
          Statement::binary("_tmp_n", Operator::MINUS, Expression::var_name("n", INT_TYPE), ONE),
        ],
        break_collector: None,
      }],
      ZERO,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("t", INT_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
        break_collector: None,
      }],
      ZERO,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("t", INT_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name("n", INT_TYPE))],
        break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
      }],
      Expression::var_name("v", INT_TYPE),
      "\nreturn 10;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(11),
        }],
        statements: vec![],
        break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
      }],
      Expression::var_name("v", INT_TYPE),
      r#"let n: int = 11;
let v: int;
while (true) {
  n = 11;
}
return (v: int);"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![],
        statements: vec![Statement::binary(
          "a",
          Operator::PLUS,
          Expression::var_name("v1", INT_TYPE),
          Expression::var_name("v2", INT_TYPE),
        )],
        break_collector: None,
      }],
      ZERO,
      r#"while (true) {
  let a: int = (v2: int) + (v1: int);
}
return 0;"#,
    );
  }
}
