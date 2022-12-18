#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
    optimization::dead_code_elimination,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(stmts: Vec<Statement>, return_value: Expression, expected: &str) {
    let Function { body, return_value, .. } = dead_code_elimination::optimize_function(Function {
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
  fn simple_test_1() {
    assert_correctly_optimized(
      vec![
        Statement::binary("u1", Operator::DIV, ZERO, ONE),
        Statement::binary("u2", Operator::MOD, ZERO, ONE),
        Statement::binary("u3", Operator::PLUS, ZERO, ONE),
        Statement::binary("p", Operator::PLUS, ZERO, ONE),
        Statement::IndexedAccess {
          name: rcs("i"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("p", INT_TYPE),
          index: 3,
        },
        Statement::StructInit {
          struct_variable_name: rcs("s"),
          type_: Type::new_id_no_targs_unwrapped("S"),
          expression_list: vec![Expression::var_name("p", INT_TYPE)],
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "ff",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name("s", INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
      ],
      Expression::var_name("ii", INT_TYPE),
      r#"let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let s: S = [(p: int)];
ff((s: int));
return (ii: int);"#,
    );
  }

  #[test]
  fn simple_test_2() {
    assert_correctly_optimized(
      vec![
        Statement::binary("u1", Operator::DIV, ZERO, ONE),
        Statement::binary("u2", Operator::MOD, ZERO, ONE),
        Statement::binary("u3", Operator::PLUS, ZERO, ONE),
        Statement::binary("p", Operator::PLUS, ZERO, ONE),
        Statement::IndexedAccess {
          name: rcs("i"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("p", INT_TYPE),
          index: 3,
        },
        Statement::IndexedAccess {
          name: rcs("i1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("p", INT_TYPE),
          index: 3,
        },
        Statement::StructInit {
          struct_variable_name: rcs("s"),
          type_: Type::new_id_no_targs_unwrapped("S"),
          expression_list: vec![Expression::var_name("p", INT_TYPE)],
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("s"),
          closure_type: Type::new_id_no_targs_unwrapped("Id"),
          function_name: FunctionName::new("closure", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: Expression::var_name("b2", INT_TYPE),
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("s1"),
          closure_type: Type::new_id_no_targs_unwrapped("Id"),
          function_name: FunctionName::new("closure", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: Expression::var_name("b2", INT_TYPE),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "ff",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name("i1", INT_TYPE),
            Expression::var_name("s1", INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      r#"let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let i1: int = (p: int)[3];
let s1: Id = Closure { fun: (closure: () -> int), context: (b2: int) };
ff((i1: int), (s1: int));
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_1() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
      ],
      ZERO,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_2() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a2")),
          }],
          final_assignments: vec![(
            rcs("ma"),
            INT_TYPE,
            Expression::var_name("a1", INT_TYPE),
            Expression::var_name("a2", INT_TYPE),
          )],
        },
      ],
      Expression::var_name("ma", INT_TYPE),
      r#"let b: bool = 0 == 1;
let ma: int;
if (b: bool) {
  let a1: int = s1();
  ma = (a1: int);
} else {
  let a2: int = s1();
  ma = (a2: int);
}
return (ma: int);"#,
    );
  }

  #[test]
  fn if_else_test_3() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new("s1", INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![(
            rcs("ma"),
            INT_TYPE,
            Expression::var_name("a1", INT_TYPE),
            Expression::var_name("a2", INT_TYPE),
          )],
        },
      ],
      ZERO,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  (s1: int)();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_4() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a2")),
          }],
          final_assignments: vec![(
            rcs("ma"),
            INT_TYPE,
            Expression::var_name("a1", INT_TYPE),
            Expression::var_name("a2", INT_TYPE),
          )],
        },
      ],
      ZERO,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_5() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name("b", BOOL_TYPE),
          s1: vec![],
          s2: vec![],
          final_assignments: vec![],
        },
      ],
      ZERO,
      "\nreturn 0;",
    );
  }

  #[test]
  fn single_if_test() {
    assert_correctly_optimized(
      vec![
        Statement::binary("b", Operator::EQ, ZERO, ONE),
        Statement::SingleIf {
          condition: Expression::var_name("is_zero", BOOL_TYPE),
          invert_condition: false,
          statements: vec![],
        },
      ],
      ZERO,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_test_1() {
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: rcs("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name("_tmp_n", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("unused"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::int(20),
          },
        ],
        statements: vec![
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "s1",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: Some(rcs("a2")),
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new("s1", INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            s1: vec![
              Statement::IndexedAccess {
                name: rcs("s"),
                type_: INT_TYPE,
                pointer_expression: ZERO,
                index: 0,
              },
              Statement::StructInit {
                struct_variable_name: rcs("s"),
                type_: Type::new_id_no_targs_unwrapped("S"),
                expression_list: vec![Expression::var_name("p", INT_TYPE)],
              },
              Statement::ClosureInit {
                closure_variable_name: rcs("s"),
                closure_type: Type::new_id_no_targs_unwrapped("Id"),
                function_name: FunctionName::new(
                  "closure",
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                ),
                context: Expression::var_name("b2", INT_TYPE),
              },
            ],
            s2: vec![Statement::binary(
              "s2_n",
              Operator::MINUS,
              Expression::var_name("n", INT_TYPE),
              ONE,
            )],
            final_assignments: vec![(
              rcs("_tmp_n"),
              INT_TYPE,
              Expression::var_name("n", INT_TYPE),
              Expression::var_name("s2_n", INT_TYPE),
            )],
          },
        ],
        break_collector: None,
      }],
      ZERO,
      r#"let n: int = 10;
while (true) {
  s1(0);
  (s1: int)();
  while (true) {
  }
  let is_zero: bool = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: bool) {
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return 0;"#,
    );
  }

  #[test]
  fn while_test_2() {
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: rcs("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name("_tmp_n", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("n1"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::int(20),
          },
        ],
        statements: vec![
          Statement::binary("is_zero", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("is_zero", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
        ],
        break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
      }],
      ZERO,
      r#"let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = 0;
    break;
  }
  n = (_tmp_n: int);
}
return 0;"#,
    );
  }

  #[test]
  fn while_test_3() {
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name("n1", INT_TYPE),
        }],
        statements: vec![Statement::binary(
          "n1",
          Operator::PLUS,
          Expression::var_name("n", INT_TYPE),
          ZERO,
        )],
        break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
      }],
      Expression::var_name("v", INT_TYPE),
      r#"let n: int = 10;
let v: int;
while (true) {
  let n1: int = (n: int) + 0;
  n = (n1: int);
}
return (v: int);"#,
    );
  }

  #[test]
  fn while_test_4() {
    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(11),
        }],
        statements: vec![Statement::binary(
          "n1",
          Operator::PLUS,
          Expression::var_name("n", INT_TYPE),
          ZERO,
        )],
        break_collector: None,
      }],
      Expression::var_name("v", INT_TYPE),
      r#"while (true) {
}
return (v: int);"#,
    );
  }
}
