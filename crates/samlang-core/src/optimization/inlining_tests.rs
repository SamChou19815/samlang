#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
    optimization::optimization_common::ResourceAllocator,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn empty_test() {
    assert!(
      super::super::inlining::optimize_functions(vec![], &mut ResourceAllocator::new()).is_empty()
    );
  }

  fn assert_correctly_inlined(functions: Vec<Function>, expected: &str) {
    let actual =
      super::super::inlining::optimize_functions(functions, &mut ResourceAllocator::new())
        .into_iter()
        .map(|f| {
          Function::debug_print(&super::super::conditional_constant_propagation::optimize_function(
            f,
          ))
        })
        .join("\n");
    assert_eq!(expected, actual);
  }

  fn big_stmts() -> Vec<Statement> {
    let mut stmts = vec![];
    for _ in 0..100 {
      stmts.push(Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs(""),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        }],
        statements: vec![
          Statement::IndexedAccess {
            name: rcs("i0"),
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
          Statement::StructInit {
            struct_variable_name: rcs("s"),
            type_: Type::new_id_no_targs_unwrapped("SS"),
            expression_list: vec![
              Expression::var_name("i1", INT_TYPE),
              Expression::var_name("b1", INT_TYPE),
              Expression::var_name("b3", INT_TYPE),
            ],
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
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::binary(
              "",
              Operator::PLUS,
              Expression::var_name("", INT_TYPE),
              Expression::int(3),
            )],
            s2: vec![Statement::binary(
              "",
              Operator::PLUS,
              Expression::var_name("", INT_TYPE),
              Expression::int(3),
            )],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(rcs("a"), INT_TYPE, ZERO, ZERO)],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary(
              "",
              Operator::PLUS,
              Expression::var_name("", INT_TYPE),
              Expression::int(3),
            )],
          },
          Statement::binary(
            "",
            Operator::PLUS,
            Expression::var_name("", INT_TYPE),
            Expression::int(3),
          ),
        ],
        break_collector: None,
      });
    }
    stmts
  }

  #[test]
  fn abort_tests() {
    super::super::inlining::optimize_functions(
      vec![Function {
        name: rcs(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: big_stmts(),
        return_value: ZERO,
      }],
      &mut ResourceAllocator::new(),
    );

    super::super::inlining::optimize_functions(
      vec![
        Function {
          name: rcs("loop"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "loop",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs(""),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: big_stmts(),
          return_value: ZERO,
        },
      ],
      &mut ResourceAllocator::new(),
    );
  }

  #[test]
  fn test1() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("factorial"),
          parameters: vec![rcs("n"), rcs("acc")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::binary("c", Operator::EQ, Expression::var_name("n", INT_TYPE), ZERO),
            Statement::IfElse {
              condition: Expression::var_name("c", BOOL_TYPE),
              s1: vec![],
              s2: vec![
                Statement::binary("n1", Operator::MINUS, Expression::var_name("n", INT_TYPE), ONE),
                Statement::binary(
                  "acc1",
                  Operator::MUL,
                  Expression::var_name("n", INT_TYPE),
                  Expression::var_name("acc", INT_TYPE),
                ),
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    "factorial",
                    Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
                  )),
                  arguments: vec![
                    Expression::var_name("n1", INT_TYPE),
                    Expression::var_name("acc1", INT_TYPE),
                  ],
                  return_type: INT_TYPE,
                  return_collector: Some(rcs("v")),
                },
              ],
              final_assignments: vec![(
                rcs("fa"),
                INT_TYPE,
                Expression::var_name("acc", INT_TYPE),
                Expression::var_name("v", INT_TYPE),
              )],
            },
          ],
          return_value: Expression::var_name("fa", INT_TYPE),
        },
        Function {
          name: rcs("loop"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "loop",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("insanelyBigFunction"),
          parameters: vec![rcs("a")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "bb",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "cc",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "moveMove",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new("a", INT_TYPE)),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ]
          .into_iter()
          .chain((0..10).into_iter().map(|_| Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "non-existing-function",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }))
          .collect(),
          return_value: ZERO,
        },
        Function {
          name: rcs("moveMove"),
          parameters: vec![rcs("a")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::IndexedAccess {
            name: rcs("c"),
            type_: INT_TYPE,
            pointer_expression: Expression::var_name("a", INT_TYPE),
            index: 0,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("bb"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::IndexedAccess {
              name: rcs("c"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 0,
            }],
            s2: vec![Statement::IndexedAccess {
              name: rcs("c"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", INT_TYPE),
              index: 0,
            }],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("cc"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new("a", INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
      ],
      r#"function bb(): int {
  let c: int = (a: int)[0];
  return 0;
}

function cc(): int {
  (a: int)();
  return 0;
}

function factorial(n: int, acc: int): int {
  let c: bool = (n: int) == 0;
  let fa: int;
  if (c: bool) {
    fa = (acc: int);
  } else {
    let n1: int = (n: int) + -1;
    let acc1: int = (n: int) * (acc: int);
    let v: int = factorial((n1: int), (acc1: int));
    fa = (v: int);
  }
  return (fa: int);
}

function insanelyBigFunction(a: int): int {
  let _inline_0_c: int = (a: int)[0];
  (a: int)();
  let _inline_2_c: int = (a: int)[0];
  (a: int)();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  return 0;
}

function loop(): int {
  loop();
  return 0;
}

function moveMove(a: int): int {
  let c: int = (a: int)[0];
  return 0;
}
"#,
    );
  }

  #[test]
  fn test2() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name("bar", INT_TYPE),
            s1: vec![],
            s2: vec![
              Statement::binary("vvv", Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  "fooBar",
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                )),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
            ],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
      ],
      r#"function fooBar(): int {
  if (bar: int) {
  } else {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
  } else {
    if (bar: int) {
    } else {
      if (bar: int) {
      } else {
        if (bar: int) {
        } else {
          if (bar: int) {
          } else {
            fooBar();
          }
        }
      }
    }
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test3() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::SingleIf {
            condition: Expression::var_name("bar", INT_TYPE),
            invert_condition: false,
            statements: vec![
              Statement::binary("vvv", Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  "fooBar",
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                )),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
            ],
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
      ],
      r#"function fooBar(): int {
  if (bar: int) {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
    if (bar: int) {
      if (bar: int) {
        if (bar: int) {
          if (bar: int) {
            fooBar();
          }
        }
      }
    }
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test4() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name("bar", INT_TYPE),
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "fooBar",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![(
              rcs("b"),
              INT_TYPE,
              ZERO,
              Expression::var_name("a", INT_TYPE),
            )],
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
      ],
      r#"function fooBar(): int {
  let b: int;
  if (bar: int) {
    fooBar();
    b = 0;
  } else {
    b = (a: int);
  }
  return 0;
}

function main(): int {
  let _inline_0_b: int;
  if (bar: int) {
    let _inline_1_b: int;
    if (bar: int) {
      let _inline_2_b: int;
      if (bar: int) {
        let _inline_3_b: int;
        if (bar: int) {
          let _inline_4_b: int;
          if (bar: int) {
            fooBar();
            _inline_4_b = 0;
          } else {
            _inline_4_b = (a: int);
          }
          _inline_3_b = 0;
        } else {
          _inline_3_b = (a: int);
        }
        _inline_2_b = 0;
      } else {
        _inline_2_b = (a: int);
      }
      _inline_1_b = 0;
    } else {
      _inline_1_b = (a: int);
    }
    _inline_0_b = 0;
  } else {
    _inline_0_b = (a: int);
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test5() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![rcs("bar"), rcs("baz")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: rcs("ff"),
              type_: Type::new_id_no_targs_unwrapped("FF"),
              expression_list: vec![
                Expression::var_name("bar", INT_TYPE),
                Expression::var_name("baz", INT_TYPE),
              ],
            },
            Statement::ClosureInit {
              closure_variable_name: rcs("s"),
              closure_type: Type::new_id_no_targs_unwrapped("SS"),
              function_name: FunctionName::new("aaa", Type::new_fn_unwrapped(vec![], INT_TYPE)),
              context: ZERO,
            },
            Statement::Break(ZERO),
          ],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ONE, ZERO],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: ZERO,
        },
      ],
      r#"function fooBar(bar: int, baz: int): int {
  let ff: FF = [(bar: int), (baz: int)];
  let s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}

function main(): int {
  let _inline_0_ff: FF = [1, 0];
  let _inline_0_s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}
"#,
    );
  }

  #[test]
  fn test6() {
    assert_correctly_inlined(
      vec![Function {
        name: rcs("fooBar"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: rcs("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name("_tmp_n", INT_TYPE),
          }],
          statements: vec![Statement::SingleIf {
            condition: Expression::var_name("n", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
        }],
        return_value: Expression::var_name("v", INT_TYPE),
      }],
      r#"function fooBar(): int {
  return 0;
}
"#,
    );
  }

  #[test]
  fn test7() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: rcs("n"),
              type_: INT_TYPE,
              initial_value: Expression::int(10),
              loop_value: Expression::var_name("_tmp_n", INT_TYPE),
            }],
            statements: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "fooBar",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: Some(rcs("_tmp_n")),
            }],
            break_collector: None,
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
      ],
      r#"function fooBar(): int {
  let n: int = 10;
  while (true) {
    let _tmp_n: int = fooBar();
    n = (_tmp_n: int);
  }
  return (v: int);
}

function main(): int {
  let _inline_0_n: int = 10;
  while (true) {
    let _inline_1_n: int = 10;
    while (true) {
      let _inline_2_n: int = 10;
      while (true) {
        let _inline_3_n: int = 10;
        while (true) {
          let _inline_4_n: int = 10;
          while (true) {
            let _inline_4__tmp_n: int = fooBar();
            _inline_4_n = (_inline_4__tmp_n: int);
          }
          _inline_3_n = (v: int);
        }
        _inline_2_n = (v: int);
      }
      _inline_1_n = (v: int);
    }
    _inline_0_n = (v: int);
  }
  return (v: int);
}
"#,
    );
  }

  #[test]
  fn test8() {
    assert_correctly_inlined(
      vec![
        Function {
          name: rcs("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![],
            statements: vec![Statement::Break(ZERO)],
            break_collector: Some(VariableName { name: rcs("v"), type_: INT_TYPE }),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "fooBar",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(rcs("v")),
          }],
          return_value: Expression::var_name("v", INT_TYPE),
        },
      ],
      r#"function fooBar(): int {
  return 0;
}

function main(): int {
  return 0;
}
"#,
    );
  }
}
