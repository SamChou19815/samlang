use super::optimization_common;
use crate::{
  ast::hir::{Binary, Callee, Expression, Function, GenenalLoopVariable, Operator, Statement},
  common::PStr,
};
use itertools::Itertools;
use std::collections::HashSet;

pub(super) fn collect_use_from_expression(expression: &Expression, set: &mut HashSet<PStr>) {
  if let Expression::Variable(v) = expression {
    set.insert(v.name);
  }
}

fn collect_use_from_while_parts(
  loop_variables: &Vec<GenenalLoopVariable>,
  stmts: &Vec<Statement>,
  set: &mut HashSet<PStr>,
) {
  for v in loop_variables {
    collect_use_from_expression(&v.initial_value, set);
    collect_use_from_expression(&v.loop_value, set);
  }
  collect_use_from_stmts(stmts, set);
}

fn collect_use_from_stmt(stmt: &Statement, set: &mut HashSet<PStr>) {
  match stmt {
    Statement::Binary(Binary { name: _, type_: _, operator: _, e1, e2 }) => {
      collect_use_from_expression(e1, set);
      collect_use_from_expression(e2, set);
    }
    Statement::IndexedAccess { name: _, type_: _, pointer_expression, index: _ } => {
      collect_use_from_expression(pointer_expression, set)
    }
    Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
      if let Callee::Variable(v) = callee {
        set.insert(v.name);
      }
      for e in arguments {
        collect_use_from_expression(e, set)
      }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      collect_use_from_expression(condition, set);
      collect_use_from_stmts(s1, set);
      collect_use_from_stmts(s2, set);
      for (_, _, e1, e2) in final_assignments {
        collect_use_from_expression(e1, set);
        collect_use_from_expression(e2, set);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      collect_use_from_expression(condition, set);
      collect_use_from_stmts(statements, set);
    }
    Statement::Break(e) => collect_use_from_expression(e, set),
    Statement::While { loop_variables, statements, break_collector: _ } => {
      collect_use_from_while_parts(loop_variables, statements, set)
    }
    Statement::StructInit { struct_variable_name: _, type_: _, expression_list } => {
      for e in expression_list {
        collect_use_from_expression(e, set);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type: _,
      function_name: _,
      context,
    } => {
      collect_use_from_expression(context, set);
    }
  }
}

pub(super) fn collect_use_from_stmts(stmts: &Vec<Statement>, set: &mut HashSet<PStr>) {
  for stmt in stmts {
    collect_use_from_stmt(stmt, set)
  }
}

fn optimize_stmt(stmt: Statement, set: &mut HashSet<PStr>) -> Option<Statement> {
  match stmt {
    Statement::Binary(binary) => {
      if !set.contains(&binary.name)
        && binary.operator != Operator::DIV
        && binary.operator != Operator::MOD
      {
        None
      } else {
        collect_use_from_expression(&binary.e1, set);
        collect_use_from_expression(&binary.e2, set);
        Some(Statement::Binary(binary))
      }
    }
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      if !set.contains(&name) {
        None
      } else {
        collect_use_from_expression(&pointer_expression, set);
        Some(Statement::IndexedAccess { name, type_, pointer_expression, index })
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => {
      let return_collector = match return_collector {
        Some(n) if set.contains(&n) => Some(n),
        _ => None,
      };
      if let Callee::Variable(v) = &callee {
        set.insert(v.name);
      }
      for e in &arguments {
        collect_use_from_expression(e, set);
      }
      Some(Statement::Call { callee, arguments, return_type, return_collector })
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let final_assignments = final_assignments
        .into_iter()
        .filter_map(|(n, t, e1, e2)| {
          if set.contains(&n) {
            collect_use_from_expression(&e1, set);
            collect_use_from_expression(&e2, set);
            Some((n, t, e1, e2))
          } else {
            None
          }
        })
        .collect_vec();
      let s1 = optimize_stmts(s1, set);
      let s2 = optimize_stmts(s2, set);
      let if_else =
        optimization_common::if_else_or_null(condition.clone(), s1, s2, final_assignments);
      if if_else.is_some() {
        collect_use_from_expression(&condition, set);
      }
      if_else
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      let statements = optimize_stmts(statements, set);
      if statements.is_empty() {
        None
      } else {
        collect_use_from_expression(&condition, set);
        Some(Statement::SingleIf { condition, invert_condition, statements })
      }
    }
    Statement::Break(e) => {
      collect_use_from_expression(&e, set);
      Some(Statement::Break(e))
    }
    Statement::While { loop_variables, statements, break_collector } => {
      let break_collector = match break_collector {
        Some(v) if set.contains(&v.name) => Some(v),
        _ => None,
      };
      let mut used_inside_loop = HashSet::new();
      collect_use_from_while_parts(&loop_variables, &statements, &mut used_inside_loop);
      let used_loop_variables_inside_loop =
        loop_variables.into_iter().filter(|it| used_inside_loop.contains(&it.name)).collect_vec();
      for v in &used_loop_variables_inside_loop {
        collect_use_from_expression(&v.loop_value, set);
      }
      let statements = optimize_stmts(statements, set);
      let loop_variables = used_loop_variables_inside_loop
        .into_iter()
        .filter_map(|variable| {
          if set.contains(&variable.name) {
            collect_use_from_expression(&variable.initial_value, set);
            Some(variable)
          } else {
            None
          }
        })
        .collect_vec();
      Some(Statement::While { loop_variables, statements, break_collector })
    }
    Statement::StructInit { struct_variable_name, type_, expression_list } => {
      if !set.contains(&struct_variable_name) {
        None
      } else {
        for e in &expression_list {
          collect_use_from_expression(e, set);
        }
        Some(Statement::StructInit { struct_variable_name, type_, expression_list })
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
      if !set.contains(&closure_variable_name) {
        None
      } else {
        collect_use_from_expression(&context, set);
        Some(Statement::ClosureInit { closure_variable_name, closure_type, function_name, context })
      }
    }
  }
}

pub(super) fn optimize_stmts(stmts: Vec<Statement>, set: &mut HashSet<PStr>) -> Vec<Statement> {
  let mut collector = vec![];
  for s in stmts.into_iter().rev() {
    if let Some(s) = optimize_stmt(s, set) {
      collector.push(s);
    }
  }
  collector.reverse();
  collector
}

pub(super) fn optimize_function(function: Function) -> Function {
  let mut set = HashSet::new();
  collect_use_from_expression(&function.return_value, &mut set);
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  Function {
    name,
    parameters,
    type_parameters,
    type_,
    body: optimize_stmts(body, &mut set),
    return_value,
  }
}
