use crate::{
  ast::hir::{
    Callee, Expression, Function, GenenalLoopVariables, Operator, Statement, Type, VariableName,
    ZERO,
  },
  common::{rc_string, Str},
};
use itertools::Itertools;

struct TempAllocator(i32);

impl TempAllocator {
  fn alloc(&mut self) -> Str {
    let temp = rc_string(format!("_tailrec_{}_", self.0));
    self.0 += 1;
    temp
  }
}

struct RewriteResult {
  stmts: Vec<Statement>,
  args: Vec<Expression>,
}

fn try_rewrite_stmts_for_tailrec_without_using_return_value(
  stmts: Vec<Statement>,
  function_name: &Str,
  function_parameter_types: &Vec<Type>,
  expected_return_collector: &Option<Str>,
  allocator: &mut TempAllocator,
) -> Result<RewriteResult, Vec<Statement>> {
  let mut rev_stmt_iterator = stmts.into_iter().rev();
  let last_stmt = if let Some(last_stmt) = rev_stmt_iterator.next() {
    last_stmt
  } else {
    return Err(vec![]);
  };
  let rest_stmts_iterator = rev_stmt_iterator.rev();

  match last_stmt {
    Statement::Call {
      callee: Callee::FunctionName(fn_name),
      arguments,
      return_type: _,
      return_collector,
    } if fn_name.name.eq(function_name) && expected_return_collector.eq(&return_collector) => {
      let stmts = if let Some(return_collector) = expected_return_collector {
        rest_stmts_iterator
          .chain(vec![Statement::Binary(Statement::binary_unwrapped(
            return_collector.clone(),
            Operator::PLUS,
            ZERO,
            ZERO,
          ))])
          .collect_vec()
      } else {
        rest_stmts_iterator.collect_vec()
      };
      Ok(RewriteResult { stmts, args: arguments })
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let relevant_final_assignment =
        final_assignments.iter().find(|it| expected_return_collector.eq(&Some(it.0.clone())));
      let new_expected_ret_collectors = if expected_return_collector.is_some() {
        if let Some((_, _, e1, e2)) = relevant_final_assignment {
          (e1.as_variable().cloned().map(|it| it.name), e2.as_variable().cloned().map(|it| it.name))
        } else {
          return Err(
            rest_stmts_iterator
              .chain(vec![Statement::IfElse { condition, s1, s2, final_assignments }])
              .collect_vec(),
          );
        }
      } else {
        (None, None)
      };
      let s1_result = try_rewrite_stmts_for_tailrec_without_using_return_value(
        s1,
        function_name,
        function_parameter_types,
        &new_expected_ret_collectors.0,
        allocator,
      );
      let s2_result = try_rewrite_stmts_for_tailrec_without_using_return_value(
        s2,
        function_name,
        function_parameter_types,
        &new_expected_ret_collectors.1,
        allocator,
      );
      match (s1_result, s2_result) {
        (Err(s1), Err(s2)) => {
          return Err(
            rest_stmts_iterator
              .chain(vec![Statement::IfElse { condition, s1, s2, final_assignments }])
              .collect_vec(),
          )
        }
        (Err(s1), Ok(RewriteResult { stmts, args })) => Ok(RewriteResult {
          stmts: rest_stmts_iterator
            .chain(vec![Statement::SingleIf {
              condition,
              invert_condition: false,
              statements: s1
                .into_iter()
                .chain(vec![Statement::Break(
                  relevant_final_assignment.map(|(_, _, e, _)| e).cloned().unwrap_or(ZERO),
                )])
                .collect_vec(),
            }])
            .chain(stmts)
            .collect_vec(),
          args,
        }),
        (Ok(RewriteResult { stmts, args }), Err(s2)) => Ok(RewriteResult {
          stmts: rest_stmts_iterator
            .chain(vec![Statement::SingleIf {
              condition,
              invert_condition: true,
              statements: s2
                .into_iter()
                .chain(vec![Statement::Break(
                  relevant_final_assignment.map(|(_, _, _, e)| e).cloned().unwrap_or(ZERO),
                )])
                .collect_vec(),
            }])
            .chain(stmts)
            .collect_vec(),
          args,
        }),
        (
          Ok(RewriteResult { stmts: result_s1, args: a1 }),
          Ok(RewriteResult { stmts: result_s2, args: a2 }),
        ) => {
          let mut new_final_assignments = final_assignments
            .into_iter()
            .filter(|it| expected_return_collector.ne(&Some(it.0.clone())))
            .collect_vec();
          let mut args = vec![];
          for ((e1, e2), t) in a1.into_iter().zip(a2).zip(function_parameter_types) {
            let name = allocator.alloc();
            args.push(Expression::var_name_str(name.clone(), t.clone()));
            new_final_assignments.push((name, t.clone(), e1, e2));
          }
          Ok(RewriteResult {
            stmts: rest_stmts_iterator
              .chain(vec![Statement::IfElse {
                condition,
                s1: result_s1,
                s2: result_s2,
                final_assignments: new_final_assignments,
              }])
              .collect_vec(),
            args,
          })
        }
      }
    }
    _ => Err(rest_stmts_iterator.chain(vec![last_stmt]).collect_vec()),
  }
}

fn tail_rec_param_name(name: &Str) -> Str {
  rc_string(format!("_tailrec_param_{}", name))
}

fn optimize_function_by_tailrec_rewrite_aux(function: Function) -> Result<Function, Function> {
  let expected_return_collector = match &function.return_value {
    Expression::IntLiteral(_, _) => None,
    Expression::Variable(v) => Some(v.name.clone()),
    Expression::StringName(_) | Expression::FunctionName(_) => return Err(function),
  };
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  let RewriteResult { stmts, args } = match try_rewrite_stmts_for_tailrec_without_using_return_value(
    body,
    &name,
    &type_.argument_types,
    &expected_return_collector,
    &mut TempAllocator(0),
  ) {
    Ok(result) => result,
    Err(body) => {
      return Err(Function { name, parameters, type_parameters, type_, body, return_value })
    }
  };
  let while_loop = Statement::While {
    loop_variables: parameters
      .iter()
      .zip(type_.argument_types.iter())
      .zip(args)
      .map(|((n, t), loop_value)| GenenalLoopVariables {
        name: n.clone(),
        type_: t.clone(),
        initial_value: Expression::var_name_str(tail_rec_param_name(n), t.clone()),
        loop_value,
      })
      .collect_vec(),
    statements: stmts,
    break_collector: if let Some(name) = expected_return_collector {
      Some(VariableName { name, type_: type_.return_type.as_ref().clone() })
    } else {
      None
    },
  };
  let parameters = parameters.iter().map(tail_rec_param_name).collect_vec();
  Ok(Function { name, parameters, type_parameters, type_, body: vec![while_loop], return_value })
}

pub(super) fn optimize_function_by_tailrec_rewrite(function: Function) -> Function {
  match optimize_function_by_tailrec_rewrite_aux(function) {
    Ok(f) | Err(f) => f,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::hir::{FunctionName, INT_TYPE},
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  fn assert_optimization_failed(f: Function) {
    assert!(optimize_function_by_tailrec_rewrite_aux(f).is_err())
  }

  fn assert_optimization_succeed(f: Function, expected: &str) {
    assert_eq!(expected, optimize_function_by_tailrec_rewrite(f).debug_print());
  }

  #[test]
  fn optimization_failing_cases() {
    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![],
      return_value: Expression::StringName(rcs("")),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![],
      return_value: Expression::var_name("", INT_TYPE),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::binary("", Operator::PLUS, ZERO, ZERO)],
      return_value: Expression::var_name("", INT_TYPE),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::Call {
        callee: Callee::Variable(VariableName::new("", INT_TYPE)),
        arguments: vec![],
        return_type: INT_TYPE,
        return_collector: None,
      }],
      return_value: Expression::var_name("", INT_TYPE),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::Call {
        callee: Callee::FunctionName(FunctionName::new(
          "",
          Type::new_fn_unwrapped(vec![], INT_TYPE),
        )),
        arguments: vec![],
        return_type: INT_TYPE,
        return_collector: None,
      }],
      return_value: Expression::var_name("", INT_TYPE),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::IfElse {
        condition: ZERO,
        s1: vec![],
        s2: vec![],
        final_assignments: vec![],
      }],
      return_value: Expression::var_name("", INT_TYPE),
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::IfElse {
        condition: ZERO,
        s1: vec![],
        s2: vec![],
        final_assignments: vec![],
      }],
      return_value: ZERO,
    });

    assert_optimization_failed(Function {
      name: rcs("ff"),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: vec![Statement::Call {
        callee: Callee::FunctionName(FunctionName::new(
          "ff",
          Type::new_fn_unwrapped(vec![], INT_TYPE),
        )),
        arguments: vec![],
        return_type: INT_TYPE,
        return_collector: None,
      }],
      return_value: Expression::var_name("v", INT_TYPE),
    });
  }

  #[test]
  fn simple_infinite_loop_tests() {
    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![
          Statement::binary("a", Operator::PLUS, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "loopy",
              Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: Some(rcs("r")),
          },
        ],
        return_value: Expression::var_name("r", INT_TYPE),
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    let r: int = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
"#,
    );

    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![
          Statement::binary("a", Operator::PLUS, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "loopy",
              Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("a", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
        ],
        return_value: ZERO,
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a: int = (n: int) + 0;
    n = (a: int);
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn if_else_loop_tests() {
    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![
          Statement::binary("a", Operator::PLUS, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "loopy",
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              )),
              arguments: vec![Expression::var_name("a", INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("r1")),
            }],
            s2: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "loopy",
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              )),
              arguments: vec![Expression::var_name("a", INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("r2")),
            }],
            final_assignments: vec![(
              rcs("r"),
              INT_TYPE,
              Expression::var_name("r1", INT_TYPE),
              Expression::var_name("r2", INT_TYPE),
            )],
          },
        ],
        return_value: Expression::var_name("r", INT_TYPE),
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    let _tailrec_0_: int;
    if 0 {
      let r1: int = 0 + 0;
      _tailrec_0_ = (a: int);
    } else {
      let r2: int = 0 + 0;
      _tailrec_0_ = (a: int);
    }
    n = (_tailrec_0_: int);
  }
  return (r: int);
}
"#,
    );

    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![
          Statement::binary("a", Operator::PLUS, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "loopy",
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              )),
              arguments: vec![Expression::var_name("a", INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: Some(rcs("r1")),
            }],
            s2: vec![],
            final_assignments: vec![(
              rcs("r"),
              INT_TYPE,
              Expression::var_name("r1", INT_TYPE),
              ZERO,
            )],
          },
        ],
        return_value: Expression::var_name("r", INT_TYPE),
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a: int = (n: int) + 0;
    if !0 {
      r = 0;
      break;
    }
    let r1: int = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
"#,
    );

    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![
          Statement::binary("a", Operator::PLUS, Expression::var_name("n", INT_TYPE), ZERO),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "loopy",
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              )),
              arguments: vec![Expression::var_name("a", INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![],
          },
        ],
        return_value: ZERO,
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a: int = (n: int) + 0;
    if !0 {
      undefined = 0;
      break;
    }
    n = (a: int);
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn complex_test() {
    assert_optimization_succeed(
      Function {
        name: rcs("loopy"),
        parameters: vec![rcs("n")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![
              Statement::binary(
                "nn",
                Operator::MINUS,
                Expression::var_name("n", INT_TYPE),
                Expression::int(1),
              ),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  "loopy",
                  Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
                )),
                arguments: vec![Expression::var_name("nn", INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: Some(rcs("r")),
              },
            ],
            final_assignments: vec![(
              rcs("nested_return"),
              INT_TYPE,
              Expression::int(1),
              Expression::var_name("r", INT_TYPE),
            )],
          }],
          final_assignments: vec![(
            rcs("v"),
            INT_TYPE,
            ZERO,
            Expression::var_name("nested_return", INT_TYPE),
          )],
        }],
        return_value: Expression::var_name("v", INT_TYPE),
      },
      r#"function loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let v: int;
  while (true) {
    if 0 {
      v = 0;
      break;
    }
    if 0 {
      v = 1;
      break;
    }
    let nn: int = (n: int) + -1;
    let r: int = 0 + 0;
    n = (nn: int);
  }
  return (v: int);
}
"#,
    );
  }
}
