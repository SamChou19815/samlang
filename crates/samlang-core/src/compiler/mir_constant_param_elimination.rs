use crate::{
  ast::mir::{
    Binary, Callee, Expression, Function, FunctionName, FunctionType, Sources, Statement,
    VariableName,
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
    Statement::StructInit { struct_variable_name: _, type_name: _, expression_list } => {
      for e in expression_list {
        collect_def_function_usages_expr(state, e);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name: _,
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
      closure_type_name: _,
      function_name,
      context: _,
    } => {
      state.insert(function_name.name, FunctionAnalysisState::Unoptimizable);
    }
    Statement::Call {
      callee: Callee::FunctionName(FunctionName { name: fn_name, type_: _ }),
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

fn rewrite_expr(state: &RewriteState, expr: &mut Expression) {
  match &expr {
    Expression::IntLiteral(_) | Expression::StringName(_) => {}
    Expression::Variable(v) => match state.local_rewrite.get(&v.name) {
      None => {}
      Some(VariableRewriteInstruction::IntConstant(n)) => *expr = Expression::IntLiteral(*n),
      Some(VariableRewriteInstruction::StrConstant(s)) => *expr = Expression::StringName(*s),
    },
  }
}

fn rewrite_stmt(state: &RewriteState, stmt: &mut Statement) {
  match stmt {
    Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
      rewrite_expr(state, e1);
      rewrite_expr(state, e2);
    }
    Statement::IndexedAccess { name: _, type_: _, pointer_expression, index: _ } => {
      rewrite_expr(state, pointer_expression);
    }
    Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
      if let Some(keep_states) =
        callee.as_function_name().and_then(|n| state.all_functions.get(&n.name))
      {
        let FunctionName { name: _, type_: FunctionType { argument_types, return_type: _ } } =
          callee.as_function_name_mut().unwrap();
        debug_assert_eq!(arguments.len(), argument_types.len());
        debug_assert_eq!(arguments.len(), keep_states.len());
        let mut current_index = 0;
        argument_types.retain(|_| {
          let keep = keep_states[current_index];
          current_index += 1;
          keep
        });
        current_index = 0;
        arguments.retain_mut(|e| {
          let keep = keep_states[current_index];
          if keep {
            rewrite_expr(state, e);
          }
          current_index += 1;
          keep
        });
      } else {
        for e in arguments {
          rewrite_expr(state, e);
        }
      }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      rewrite_expr(state, condition);
      rewrite_stmts(state, s1);
      rewrite_stmts(state, s2);
      for (_, _, e1, e2) in final_assignments {
        rewrite_expr(state, e1);
        rewrite_expr(state, e2);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      rewrite_expr(state, condition);
      rewrite_stmts(state, statements);
    }
    Statement::While { loop_variables, statements, break_collector: _ } => {
      for v in loop_variables {
        rewrite_expr(state, &mut v.initial_value);
        rewrite_expr(state, &mut v.loop_value);
      }
      rewrite_stmts(state, statements);
    }
    Statement::Break(e) => rewrite_expr(state, e),
    Statement::Cast { name: _, type_: _, assigned_expression } => {
      rewrite_expr(state, assigned_expression)
    }
    Statement::StructInit { struct_variable_name: _, type_name: _, expression_list } => {
      for e in expression_list {
        rewrite_expr(state, e);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name: _,
      function_name: _,
      context,
    } => {
      rewrite_expr(state, context);
    }
  }
}

fn rewrite_stmts(state: &RewriteState, stmts: &mut Vec<Statement>) {
  for stmt in stmts {
    rewrite_stmt(state, stmt);
  }
}

pub(super) fn rewrite_sources(mut sources: Sources) -> Sources {
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
  for f in &mut sources.functions {
    let mut local_rewrite = HashMap::new();
    if let Some(FunctionAnalysisState::Optimizable(param_states)) = global_state.get(&f.name) {
      debug_assert_eq!(f.parameters.len(), param_states.len());
      debug_assert_eq!(f.parameters.len(), f.type_.argument_types.len());

      let mut current_index = 0;
      f.parameters.retain(|name| {
        let state = param_states[current_index];
        current_index += 1;
        match state {
          ParamUsageAnalysisState::IntConstant(i) => {
            local_rewrite.insert(*name, VariableRewriteInstruction::IntConstant(i));
            false
          }
          ParamUsageAnalysisState::StrConstant(s) => {
            local_rewrite.insert(*name, VariableRewriteInstruction::StrConstant(s));
            false
          }
          ParamUsageAnalysisState::Unoptimizable => true,
          _ => false,
        }
      });
      current_index = 0;
      f.type_.argument_types.retain(|_| {
        let keep = param_states[current_index] == ParamUsageAnalysisState::Unoptimizable;
        current_index += 1;
        keep
      });
    }
    let state = RewriteState { all_functions: &all_functions, local_rewrite };
    rewrite_stmts(&state, &mut f.body);
    rewrite_expr(&state, &mut f.return_value);
  }
  sources
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, Function, FunctionName, FunctionType, GenenalLoopVariable, Sources,
      Statement, Type, VariableName, INT_TYPE, ZERO,
    },
    common::well_known_pstrs,
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
          parameters: vec![well_known_pstrs::LOWER_A, well_known_pstrs::LOWER_B],
          type_: FunctionType {
            argument_types: vec![INT_TYPE, INT_TYPE],
            return_type: Box::new(INT_TYPE),
          },
          body: vec![],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("str_const"),
          parameters: vec![well_known_pstrs::LOWER_A],
          type_: FunctionType { argument_types: vec![INT_TYPE], return_type: Box::new(INT_TYPE) },
          body: vec![Statement::Break(Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE))],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("func_with_consts"),
          parameters: vec![
            well_known_pstrs::LOWER_A,
            well_known_pstrs::LOWER_B,
            well_known_pstrs::LOWER_C,
            well_known_pstrs::LOWER_D,
            well_known_pstrs::LOWER_E,
          ],
          type_: FunctionType {
            argument_types: vec![
              Type::Id(well_known_pstrs::UPPER_A),
              Type::Id(well_known_pstrs::UPPER_B),
              Type::Id(well_known_pstrs::UPPER_C),
              Type::Id(well_known_pstrs::UPPER_D),
              Type::Id(well_known_pstrs::UPPER_E),
            ],
            return_type: Box::new(INT_TYPE),
          },
          body: vec![
            Statement::binary(
              dummy_name,
              Operator::PLUS,
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              Expression::var_name(well_known_pstrs::LOWER_B, INT_TYPE),
            ),
            Statement::IndexedAccess {
              name: dummy_name,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              index: 0,
            },
            Statement::ClosureInit {
              closure_variable_name: dummy_name,
              closure_type_name: dummy_name,
              function_name: FunctionName {
                name: heap.alloc_str_for_test("otherwise_optimizable"),
                type_: FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) },
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
                Expression::var_name(well_known_pstrs::LOWER_D, INT_TYPE),
                Expression::var_name(well_known_pstrs::LOWER_E, INT_TYPE),
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
                Expression::var_name(well_known_pstrs::LOWER_D, INT_TYPE),
                Expression::var_name(well_known_pstrs::LOWER_E, INT_TYPE),
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
              condition: Expression::var_name(well_known_pstrs::LOWER_E, INT_TYPE),
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
              type_name: dummy_name,
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
