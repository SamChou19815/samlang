use crate::{
  ast::hir::{
    Binary, Callee, Expression, Function, FunctionName, FunctionType, GenenalLoopVariable, Sources,
    Statement, VariableName,
  },
  common::PStr,
};
use itertools::Itertools;
use std::collections::HashMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ParamUsageAnalysisState {
  Unused,
  Referenced,
  IntConstant(i32),
  StrConstant(PStr),
  Unoptimizable,
}

fn meet_param_state(
  a: ParamUsageAnalysisState,
  b: ParamUsageAnalysisState,
) -> ParamUsageAnalysisState {
  match (a, b) {
    (ParamUsageAnalysisState::Unused, _) | (_, ParamUsageAnalysisState::Unused) => {
      ParamUsageAnalysisState::Unused
    }
    (ParamUsageAnalysisState::Unoptimizable, _) | (_, ParamUsageAnalysisState::Unoptimizable) => {
      ParamUsageAnalysisState::Unoptimizable
    }
    (ParamUsageAnalysisState::Referenced, other) | (other, ParamUsageAnalysisState::Referenced) => {
      other
    }
    _ => {
      if a == b {
        a
      } else {
        ParamUsageAnalysisState::Unoptimizable
      }
    }
  }
}

enum FunctionAnalysisState {
  Unoptimizable,
  Optimizable(Vec<ParamUsageAnalysisState>),
}

fn collect_def_function_usages_var(
  state: &mut HashMap<PStr, ParamUsageAnalysisState>,
  v: &VariableName,
) {
  state.entry(v.name).and_modify(|state| *state = ParamUsageAnalysisState::Referenced);
}

fn collect_def_function_usages_expr(
  state: &mut HashMap<PStr, ParamUsageAnalysisState>,
  expr: &Expression,
) {
  if let Expression::Variable(v) = expr {
    collect_def_function_usages_var(state, v);
  }
}

fn collect_def_function_usages_stmts(
  state: &mut HashMap<PStr, ParamUsageAnalysisState>,
  f: &Function,
  stmts: &[Statement],
) {
  for stmt in stmts {
    collect_def_function_usages_stmt(state, f, stmt);
  }
}

fn collect_def_function_usages_stmt(
  state: &mut HashMap<PStr, ParamUsageAnalysisState>,
  f: &Function,
  stmt: &Statement,
) {
  match stmt {
    Statement::Binary(b) => {
      collect_def_function_usages_expr(state, &b.e1);
      collect_def_function_usages_expr(state, &b.e2);
    }
    Statement::IndexedAccess { name: _, type_: _, pointer_expression, index: _ } => {
      collect_def_function_usages_expr(state, pointer_expression);
    }
    Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
      match callee {
        Callee::FunctionName(n) if n.name == f.name => {
          debug_assert_eq!(f.parameters.len(), arguments.len());
          // For self recursive functions, we don't count simply copied params as usage.
          for (n, arg) in f.parameters.iter().zip(arguments) {
            match arg {
              Expression::Variable(v) if v.name == *n => {}
              _ => collect_def_function_usages_expr(state, arg),
            }
          }
          return;
        }
        Callee::FunctionName(_) => {}
        Callee::Variable(v) => collect_def_function_usages_var(state, v),
      }
      for arg in arguments {
        collect_def_function_usages_expr(state, arg);
      }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      collect_def_function_usages_expr(state, condition);
      collect_def_function_usages_stmts(state, f, s1);
      collect_def_function_usages_stmts(state, f, s2);
      for (_, _, e1, e2) in final_assignments {
        collect_def_function_usages_expr(state, e1);
        collect_def_function_usages_expr(state, e2);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      collect_def_function_usages_expr(state, condition);
      collect_def_function_usages_stmts(state, f, statements);
    }
    Statement::Break(e) => collect_def_function_usages_expr(state, e),
    Statement::While { loop_variables, statements, break_collector: _ } => {
      for v in loop_variables {
        collect_def_function_usages_expr(state, &v.initial_value);
        collect_def_function_usages_expr(state, &v.loop_value);
      }
      collect_def_function_usages_stmts(state, f, statements);
    }
    Statement::Cast { name: _, type_: _, assigned_expression } => {
      collect_def_function_usages_expr(state, assigned_expression)
    }
    Statement::StructInit { struct_variable_name: _, type_: _, expression_list } => {
      for e in expression_list {
        collect_def_function_usages_expr(state, e);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type: _,
      function_name: _,
      context,
    } => collect_def_function_usages_expr(state, context),
  }
}

fn collect_global_usages_stmts(
  state: &mut HashMap<PStr, FunctionAnalysisState>,
  stmts: &[Statement],
) {
  for stmt in stmts {
    collect_global_usages_stmt(state, stmt);
  }
}

fn collect_global_usages_stmt(state: &mut HashMap<PStr, FunctionAnalysisState>, stmt: &Statement) {
  match stmt {
    Statement::Binary(_)
    | Statement::IndexedAccess { .. }
    | Statement::Break(_)
    | Statement::Cast { .. }
    | Statement::StructInit { .. }
    | Statement::Call {
      callee: Callee::Variable(_),
      arguments: _,
      return_type: _,
      return_collector: _,
    } => {}
    Statement::IfElse { condition: _, s1, s2, final_assignments: _ } => {
      collect_global_usages_stmts(state, s1);
      collect_global_usages_stmts(state, s2);
    }
    Statement::SingleIf { condition: _, invert_condition: _, statements }
    | Statement::While { loop_variables: _, statements, break_collector: _ } => {
      collect_global_usages_stmts(state, statements)
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type: _,
      function_name,
      context: _,
    } => {
      state.insert(function_name.name, FunctionAnalysisState::Unoptimizable);
    }
    Statement::Call {
      callee: Callee::FunctionName(FunctionName { name: fn_name, type_: _, type_arguments: _ }),
      arguments,
      return_type: _,
      return_collector: _,
    } => {
      if let Some(FunctionAnalysisState::Optimizable(param_states)) = state.get_mut(fn_name) {
        for (i, arg) in arguments.iter().enumerate() {
          param_states[i] = meet_param_state(
            param_states[i],
            match arg {
              Expression::IntLiteral(n) => ParamUsageAnalysisState::IntConstant(*n),
              Expression::StringName(p) => ParamUsageAnalysisState::StrConstant(*p),
              Expression::Variable(_) => ParamUsageAnalysisState::Unoptimizable,
            },
          )
        }
      }
    }
  }
}

fn collect_all_usages(sources: &Sources) -> HashMap<PStr, FunctionAnalysisState> {
  let mut state = HashMap::new();
  for f in &sources.functions {
    let mut local_state = f
      .parameters
      .iter()
      .map(|param| (*param, ParamUsageAnalysisState::Unused))
      .collect::<HashMap<_, _>>();
    collect_def_function_usages_stmts(&mut local_state, f, &f.body);
    collect_def_function_usages_expr(&mut local_state, &f.return_value);
    state.insert(
      f.name,
      FunctionAnalysisState::Optimizable(
        f.parameters.iter().map(|p| local_state.remove(p).unwrap()).collect(),
      ),
    );
  }
  for f in &sources.functions {
    collect_global_usages_stmts(&mut state, &f.body);
  }
  state
}

enum VariableRewriteInstruction {
  IntConstant(i32),
  StrConstant(PStr),
}

struct RewriteState<'a> {
  all_functions: &'a HashMap<PStr, Vec<bool>>,
  local_rewrite: HashMap<PStr, VariableRewriteInstruction>,
}

fn rewrite_expr(state: &RewriteState, expr: Expression) -> Expression {
  match &expr {
    Expression::IntLiteral(_) | Expression::StringName(_) => expr,
    Expression::Variable(v) => match state.local_rewrite.get(&v.name) {
      None => expr,
      Some(VariableRewriteInstruction::IntConstant(n)) => Expression::IntLiteral(*n),
      Some(VariableRewriteInstruction::StrConstant(s)) => Expression::StringName(*s),
    },
  }
}

fn rewrite_stmt(state: &RewriteState, stmt: Statement) -> Statement {
  match stmt {
    Statement::Binary(Binary { name, operator, e1, e2 }) => Statement::Binary(Binary {
      name,
      operator,
      e1: rewrite_expr(state, e1),
      e2: rewrite_expr(state, e2),
    }),
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      Statement::IndexedAccess {
        name,
        type_,
        pointer_expression: rewrite_expr(state, pointer_expression),
        index,
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => {
      if let Some(keep_states) =
        callee.as_function_name().and_then(|n| state.all_functions.get(&n.name))
      {
        let FunctionName {
          name,
          type_: FunctionType { argument_types, return_type: fn_ret_type },
          type_arguments,
        } = callee.into_function_name().unwrap();
        let mut kept_args = vec![];
        let mut kept_arg_ts = vec![];
        debug_assert_eq!(arguments.len(), argument_types.len());
        debug_assert_eq!(arguments.len(), keep_states.len());
        for ((arg, arg_t), keep) in arguments.into_iter().zip(argument_types).zip(keep_states) {
          if *keep {
            kept_args.push(rewrite_expr(state, arg));
            kept_arg_ts.push(arg_t);
          }
        }
        Statement::Call {
          callee: Callee::FunctionName(FunctionName {
            name,
            type_: FunctionType { argument_types: kept_arg_ts, return_type: fn_ret_type },
            type_arguments,
          }),
          arguments: kept_args,
          return_type,
          return_collector,
        }
      } else {
        Statement::Call {
          callee,
          arguments: arguments.into_iter().map(|e| rewrite_expr(state, e)).collect(),
          return_type,
          return_collector,
        }
      }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => Statement::IfElse {
      condition: rewrite_expr(state, condition),
      s1: rewrite_stmts(state, s1),
      s2: rewrite_stmts(state, s2),
      final_assignments: final_assignments
        .into_iter()
        .map(|(n, t, e1, e2)| (n, t, rewrite_expr(state, e1), rewrite_expr(state, e2)))
        .collect(),
    },
    Statement::SingleIf { condition, invert_condition, statements } => Statement::SingleIf {
      condition: rewrite_expr(state, condition),
      invert_condition,
      statements: rewrite_stmts(state, statements),
    },
    Statement::While { loop_variables, statements, break_collector } => Statement::While {
      loop_variables: loop_variables
        .into_iter()
        .map(|GenenalLoopVariable { name, type_, initial_value, loop_value }| GenenalLoopVariable {
          name,
          type_,
          initial_value: rewrite_expr(state, initial_value),
          loop_value: rewrite_expr(state, loop_value),
        })
        .collect(),
      statements: rewrite_stmts(state, statements),
      break_collector,
    },
    Statement::Break(e) => Statement::Break(rewrite_expr(state, e)),
    Statement::Cast { name, type_, assigned_expression } => {
      Statement::Cast { name, type_, assigned_expression: rewrite_expr(state, assigned_expression) }
    }
    Statement::StructInit { struct_variable_name, type_, expression_list } => {
      Statement::StructInit {
        struct_variable_name,
        type_,
        expression_list: expression_list.into_iter().map(|e| rewrite_expr(state, e)).collect(),
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
      Statement::ClosureInit {
        closure_variable_name,
        closure_type,
        function_name,
        context: rewrite_expr(state, context),
      }
    }
  }
}

fn rewrite_stmts(state: &RewriteState, stmts: Vec<Statement>) -> Vec<Statement> {
  stmts.into_iter().map(|stmt| rewrite_stmt(state, stmt)).collect()
}

pub(super) fn rewrite_sources(sources: Sources) -> Sources {
  let global_state = collect_all_usages(&sources);
  let mut all_functions = HashMap::new();
  for (n, fn_state) in &global_state {
    match fn_state {
      FunctionAnalysisState::Unoptimizable => {}
      FunctionAnalysisState::Optimizable(param_states) => {
        all_functions.insert(
          *n,
          param_states.iter().map(|s| s == &ParamUsageAnalysisState::Unoptimizable).collect_vec(),
        );
      }
    }
  }
  let Sources { global_variables, closure_types, type_definitions, main_function_names, functions } =
    sources;
  let mut new_functions = vec![];
  for Function {
    name,
    parameters,
    type_parameters,
    type_: FunctionType { argument_types, return_type },
    body,
    return_value,
  } in functions
  {
    let mut local_rewrite = HashMap::new();
    let (kept_params, kept_arg_types) =
      if let Some(FunctionAnalysisState::Optimizable(param_states)) = global_state.get(&name) {
        let mut kept_params = vec![];
        let mut kept_arg_types = vec![];
        debug_assert_eq!(parameters.len(), param_states.len());
        debug_assert_eq!(parameters.len(), argument_types.len());
        for ((name, state), arg_type) in
          parameters.into_iter().zip(param_states).zip(argument_types)
        {
          match state {
            ParamUsageAnalysisState::IntConstant(i) => {
              local_rewrite.insert(name, VariableRewriteInstruction::IntConstant(*i));
            }
            ParamUsageAnalysisState::StrConstant(s) => {
              local_rewrite.insert(name, VariableRewriteInstruction::StrConstant(*s));
            }
            ParamUsageAnalysisState::Unoptimizable => {
              kept_params.push(name);
              kept_arg_types.push(arg_type);
            }
            _ => {}
          }
        }
        (kept_params, kept_arg_types)
      } else {
        (parameters, argument_types)
      };
    let state = RewriteState { all_functions: &all_functions, local_rewrite };
    new_functions.push(Function {
      name,
      parameters: kept_params,
      type_parameters,
      type_: FunctionType { argument_types: kept_arg_types, return_type },
      body: rewrite_stmts(&state, body),
      return_value: rewrite_expr(&state, return_value),
    })
  }
  Sources {
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions: new_functions,
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, FunctionType, GenenalLoopVariable, IdType,
      Operator, Sources, Statement, Type, VariableName, INT_TYPE, ZERO,
    },
    Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilerplate() {
    assert!(!format!("{:?}", super::ParamUsageAnalysisState::Unoptimizable.clone()).is_empty());
    assert_eq!(
      super::ParamUsageAnalysisState::IntConstant(1),
      super::meet_param_state(
        super::ParamUsageAnalysisState::IntConstant(1),
        super::ParamUsageAnalysisState::Referenced,
      ),
    );
  }

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let dummy_name = heap.alloc_str_for_test("_");

    let input = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![
        Function {
          name: heap.alloc_str_for_test("otherwise_optimizable"),
          parameters: vec![heap.alloc_str_for_test("a"), heap.alloc_str_for_test("b")],
          type_parameters: vec![],
          type_: FunctionType {
            argument_types: vec![INT_TYPE, INT_TYPE],
            return_type: Box::new(INT_TYPE),
          },
          body: vec![],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("str_const"),
          parameters: vec![heap.alloc_str_for_test("a")],
          type_parameters: vec![],
          type_: FunctionType { argument_types: vec![INT_TYPE], return_type: Box::new(INT_TYPE) },
          body: vec![Statement::Break(Expression::var_name(
            heap.alloc_str_for_test("a"),
            INT_TYPE,
          ))],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("func_with_consts"),
          parameters: vec![
            heap.alloc_str_for_test("a"),
            heap.alloc_str_for_test("b"),
            heap.alloc_str_for_test("c"),
            heap.alloc_str_for_test("d"),
            heap.alloc_str_for_test("e"),
          ],
          type_parameters: vec![],
          type_: FunctionType {
            argument_types: vec![
              Type::new_id_no_targs(heap.alloc_str_for_test("A")),
              Type::new_id_no_targs(heap.alloc_str_for_test("B")),
              Type::new_id_no_targs(heap.alloc_str_for_test("C")),
              Type::new_id_no_targs(heap.alloc_str_for_test("D")),
              Type::new_id_no_targs(heap.alloc_str_for_test("E")),
            ],
            return_type: Box::new(INT_TYPE),
          },
          body: vec![
            Statement::binary(
              dummy_name,
              Operator::PLUS,
              Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b"), INT_TYPE),
            ),
            Statement::IndexedAccess {
              name: dummy_name,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
              index: 0,
            },
            Statement::ClosureInit {
              closure_variable_name: dummy_name,
              closure_type: IdType { name: dummy_name, type_arguments: vec![] },
              function_name: FunctionName {
                name: heap.alloc_str_for_test("otherwise_optimizable"),
                type_: FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) },
                type_arguments: vec![],
              },
              context: ZERO,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName { name: dummy_name, type_: INT_TYPE }),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("func_with_consts"),
                FunctionType {
                  argument_types: vec![INT_TYPE, INT_TYPE, INT_TYPE, INT_TYPE, INT_TYPE],
                  return_type: Box::new(INT_TYPE),
                },
              )),
              // a: matching constant
              // b: non-matching used constant
              // c: non-matching unused constant
              // d: recursive param unused
              // e: recursive param used
              arguments: vec![
                ZERO,
                Expression::int(1),
                Expression::int(2),
                Expression::var_name(heap.alloc_str_for_test("d"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("e"), INT_TYPE),
              ],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("func_with_consts"),
                FunctionType {
                  argument_types: vec![INT_TYPE, INT_TYPE, INT_TYPE, INT_TYPE, INT_TYPE],
                  return_type: Box::new(INT_TYPE),
                },
              )),
              arguments: vec![
                ZERO,
                Expression::int(3),
                Expression::int(3),
                Expression::var_name(heap.alloc_str_for_test("d"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("e"), INT_TYPE),
              ],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("str_const"),
                FunctionType { argument_types: vec![INT_TYPE], return_type: Box::new(INT_TYPE) },
              )),
              arguments: vec![Expression::StringName(heap.alloc_str_for_test("STR"))],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("otherwise_optimizable"),
                FunctionType {
                  argument_types: vec![INT_TYPE, INT_TYPE],
                  return_type: Box::new(INT_TYPE),
                },
              )),
              arguments: vec![ZERO, ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IfElse {
              condition: Expression::var_name(heap.alloc_str_for_test("e"), INT_TYPE),
              s1: vec![Statement::Break(ZERO)],
              s2: vec![Statement::Break(ZERO)],
              final_assignments: vec![(dummy_name, INT_TYPE, ZERO, ZERO)],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)],
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: dummy_name,
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![Statement::Break(ZERO)],
              break_collector: None,
            },
            Statement::Cast { name: dummy_name, type_: INT_TYPE, assigned_expression: ZERO },
            Statement::StructInit {
              struct_variable_name: dummy_name,
              type_: IdType { name: dummy_name, type_arguments: vec![] },
              expression_list: vec![ZERO, ZERO],
            },
          ],
          return_value: ZERO,
        },
      ],
    };
    let actual = super::rewrite_sources(input).debug_print(heap);
    let expected = r#"
function otherwise_optimizable(a: int, b: int): int {
  return 0;
}

function str_const(): int {
  undefined = STR;
  break;
  return 0;
}

function func_with_consts(b: B, e: E): int {
  let _ = 0 + (b: int);
  let _: int = 0[0];
  let _: _ = Closure { fun: (otherwise_optimizable: () -> int), context: 0 };
  (_: int)(0);
  func_with_consts(1, (e: int));
  func_with_consts(3, (e: int));
  str_const();
  otherwise_optimizable(0, 0);
  let _: int;
  if (e: int) {
    undefined = 0;
    break;
    _ = 0;
  } else {
    undefined = 0;
    break;
    _ = 0;
  }
  if 0 {
    undefined = 0;
    break;
  }
  let _: int = 0;
  while (true) {
    undefined = 0;
    break;
    _ = 0;
  }
  let _ = 0 as int;
  let _: _ = [0, 0];
  return 0;
}
    "#
    .trim();
    assert_eq!(expected, actual.trim());
  }
}
