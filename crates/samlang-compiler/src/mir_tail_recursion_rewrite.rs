use itertools::Itertools;
use samlang_ast::{
  hir::BinaryOperator,
  mir::{
    Callee, Expression, Function, FunctionName, GenenalLoopVariable, Statement, Type, VariableName,
    ZERO,
  },
};
use samlang_heap::{Heap, PStr};

struct RewriteResult {
  stmts: Vec<Statement>,
  args: Vec<Expression>,
}

fn try_rewrite_stmts_for_tailrec_without_using_return_value(
  stmts: Vec<Statement>,
  function_name: &FunctionName,
  function_parameter_types: &Vec<Type>,
  expected_return_collector: &Option<PStr>,
  heap: &mut Heap,
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
            *return_collector,
            BinaryOperator::PLUS,
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
        final_assignments.iter().find(|it| expected_return_collector.eq(&Some(it.0)));
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
        heap,
      );
      let s2_result = try_rewrite_stmts_for_tailrec_without_using_return_value(
        s2,
        function_name,
        function_parameter_types,
        &new_expected_ret_collectors.1,
        heap,
      );
      match (s1_result, s2_result) {
        (Err(s1), Err(s2)) => Err(
          rest_stmts_iterator
            .chain(vec![Statement::IfElse { condition, s1, s2, final_assignments }])
            .collect_vec(),
        ),
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
            .filter(|it| expected_return_collector.ne(&Some(it.0)))
            .collect_vec();
          let mut args = vec![];
          for ((e1, e2), t) in a1.into_iter().zip(a2).zip(function_parameter_types) {
            let name = heap.alloc_temp_str();
            args.push(Expression::var_name(name, *t));
            new_final_assignments.push((name, *t, e1, e2));
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

fn tail_rec_param_name(name: &str) -> String {
  format!("_tailrec_param_{name}")
}

fn optimize_function_by_tailrec_rewrite_aux(
  heap: &mut Heap,
  function: Function,
) -> Result<Function, Function> {
  let expected_return_collector = match &function.return_value {
    Expression::Int32Literal(_) | Expression::Int31Literal(_) => None,
    Expression::Variable(v) => Some(v.name),
    Expression::StringName(_) => return Err(function),
  };
  let Function { name, parameters, type_, body, return_value } = function;
  let RewriteResult { stmts, args } = match try_rewrite_stmts_for_tailrec_without_using_return_value(
    body,
    &name,
    &type_.argument_types,
    &expected_return_collector,
    heap,
  ) {
    Ok(result) => result,
    Err(body) => return Err(Function { name, parameters, type_, body, return_value }),
  };
  let while_loop = Statement::While {
    loop_variables: parameters
      .iter()
      .zip(type_.argument_types.iter())
      .zip(args)
      .map(|((n, t), loop_value)| GenenalLoopVariable {
        name: *n,
        type_: *t,
        initial_value: Expression::var_name(
          heap.alloc_string(tail_rec_param_name(n.as_str(heap))),
          *t,
        ),
        loop_value,
      })
      .collect_vec(),
    statements: stmts,
    break_collector: if let Some(name) = expected_return_collector {
      Some(VariableName { name, type_: *type_.return_type })
    } else {
      None
    },
  };
  let parameters =
    parameters.iter().map(|n| heap.alloc_string(tail_rec_param_name(n.as_str(heap)))).collect_vec();
  Ok(Function { name, parameters, type_, body: vec![while_loop], return_value })
}

pub(super) fn optimize_function_by_tailrec_rewrite(
  heap: &mut Heap,
  function: Function,
) -> Function {
  match optimize_function_by_tailrec_rewrite_aux(heap, function) {
    Ok(f) | Err(f) => f,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{FunctionNameExpression, SymbolTable, INT_32_TYPE};

  fn assert_optimization_failed(f: Function, heap: &mut Heap) {
    assert!(optimize_function_by_tailrec_rewrite_aux(heap, f).is_err())
  }

  fn assert_optimization_succeed(
    f: Function,
    heap: &mut Heap,
    table: &SymbolTable,
    expected: &str,
  ) {
    assert_eq!(expected, optimize_function_by_tailrec_rewrite(heap, f).debug_print(heap, table));
  }

  #[test]
  fn optimization_failing_cases() {
    let heap = &mut Heap::new();

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![],
        return_value: Expression::StringName(PStr::LOWER_A),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![],
        return_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::binary(PStr::LOWER_A, BinaryOperator::PLUS, ZERO, ZERO)],
        return_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Call {
          callee: Callee::Variable(VariableName::new(PStr::LOWER_A, INT_32_TYPE)),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: None,
        }],
        return_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_A),
            type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          }),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: None,
        }],
        return_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![],
        }],
        return_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![],
        }],
        return_value: ZERO,
      },
      heap,
    );

    assert_optimization_failed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        body: vec![Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
            type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          }),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: None,
        }],
        return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      },
      heap,
    );
  }

  #[test]
  fn simple_infinite_loop_tests() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();
    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
              type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("r")),
          },
        ],
        return_value: Expression::var_name(heap.alloc_str_for_test("r"), INT_32_TYPE),
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a = (n: int) + 0;
    let r = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
"#,
    );

    let heap = &mut Heap::new();
    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
              type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: None,
          },
        ],
        return_value: ZERO,
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a = (n: int) + 0;
    n = (a: int);
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn if_else_loop_tests() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              }),
              arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
              return_type: INT_32_TYPE,
              return_collector: Some(heap.alloc_str_for_test("r1")),
            }],
            s2: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              }),
              arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
              return_type: INT_32_TYPE,
              return_collector: Some(heap.alloc_str_for_test("r2")),
            }],
            final_assignments: vec![(
              heap.alloc_str_for_test("r"),
              INT_32_TYPE,
              Expression::var_name(heap.alloc_str_for_test("r1"), INT_32_TYPE),
              Expression::var_name(heap.alloc_str_for_test("r2"), INT_32_TYPE),
            )],
          },
        ],
        return_value: Expression::var_name(heap.alloc_str_for_test("r"), INT_32_TYPE),
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a = (n: int) + 0;
    let _t0: int;
    if 0 {
      let r1 = 0 + 0;
      _t0 = (a: int);
    } else {
      let r2 = 0 + 0;
      _t0 = (a: int);
    }
    n = (_t0: int);
  }
  return (r: int);
}
"#,
    );

    let heap = &mut Heap::new();
    let table = &SymbolTable::new();
    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              }),
              arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
              return_type: INT_32_TYPE,
              return_collector: Some(heap.alloc_str_for_test("r1")),
            }],
            s2: vec![],
            final_assignments: vec![(
              heap.alloc_str_for_test("r"),
              INT_32_TYPE,
              Expression::var_name(heap.alloc_str_for_test("r1"), INT_32_TYPE),
              ZERO,
            )],
          },
        ],
        return_value: Expression::var_name(heap.alloc_str_for_test("r"), INT_32_TYPE),
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  let r: int;
  while (true) {
    let a = (n: int) + 0;
    if !0 {
      r = 0;
      break;
    }
    let r1 = 0 + 0;
    n = (a: int);
  }
  return (r: int);
}
"#,
    );

    let heap = &mut Heap::new();
    let table = &SymbolTable::new();
    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              }),
              arguments: vec![Expression::var_name(PStr::LOWER_A, INT_32_TYPE)],
              return_type: INT_32_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![],
          },
        ],
        return_value: ZERO,
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
  let n: int = (_tailrec_param_n: int);
  while (true) {
    let a = (n: int) + 0;
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
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    assert_optimization_succeed(
      Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
        parameters: vec![heap.alloc_str_for_test("n")],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![
              Statement::binary(
                heap.alloc_str_for_test("nn"),
                BinaryOperator::MINUS,
                Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
                Expression::i32(1),
              ),
              Statement::Call {
                callee: Callee::FunctionName(FunctionNameExpression {
                  name: FunctionName::new_for_test(heap.alloc_str_for_test("loopy")),
                  type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
                }),
                arguments: vec![Expression::var_name(heap.alloc_str_for_test("nn"), INT_32_TYPE)],
                return_type: INT_32_TYPE,
                return_collector: Some(heap.alloc_str_for_test("r")),
              },
            ],
            final_assignments: vec![(
              heap.alloc_str_for_test("nested_return"),
              INT_32_TYPE,
              Expression::i32(1),
              Expression::var_name(heap.alloc_str_for_test("r"), INT_32_TYPE),
            )],
          }],
          final_assignments: vec![(
            heap.alloc_str_for_test("v"),
            INT_32_TYPE,
            ZERO,
            Expression::var_name(heap.alloc_str_for_test("nested_return"), INT_32_TYPE),
          )],
        }],
        return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      },
      heap,
      table,
      r#"function __$loopy(_tailrec_param_n: int): int {
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
    let nn = (n: int) + -1;
    let r = 0 + 0;
    n = (nn: int);
  }
  return (v: int);
}
"#,
    );
  }
}
