use samlang_ast::{
  hir::Operator,
  mir::{Binary, Callee, Expression, Function, GenenalLoopVariable, Statement},
};
use samlang_heap::PStr;
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
    Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
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
      collect_use_from_while_parts(loop_variables, statements, set);
    }
    Statement::Cast { name: _, type_: _, assigned_expression }
    | Statement::LateInitAssignment { name: _, assigned_expression } => {
      collect_use_from_expression(assigned_expression, set);
    }
    Statement::LateInitDeclaration { name: _, type_: _ } => {}
    Statement::StructInit { struct_variable_name: _, type_name: _, expression_list } => {
      for e in expression_list {
        collect_use_from_expression(e, set);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name: _,
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

fn optimize_stmt(stmt: &mut Statement, set: &mut HashSet<PStr>) -> bool {
  match stmt {
    Statement::Binary(binary) => {
      if !set.contains(&binary.name)
        && binary.operator != Operator::DIV
        && binary.operator != Operator::MOD
      {
        false
      } else {
        collect_use_from_expression(&binary.e1, set);
        collect_use_from_expression(&binary.e2, set);
        true
      }
    }
    Statement::IndexedAccess { name, type_: _, pointer_expression, index: _ } => {
      if !set.contains(name) {
        false
      } else {
        collect_use_from_expression(pointer_expression, set);
        true
      }
    }
    Statement::Call { callee, arguments, return_type: _, return_collector } => {
      *return_collector = match return_collector {
        Some(n) if set.contains(n) => Some(*n),
        _ => None,
      };
      if let Callee::Variable(v) = &callee {
        set.insert(v.name);
      }
      for e in arguments {
        collect_use_from_expression(e, set);
      }
      true
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      final_assignments.retain(|(n, _, e1, e2)| {
        if set.contains(n) {
          collect_use_from_expression(e1, set);
          collect_use_from_expression(e2, set);
          true
        } else {
          false
        }
      });
      optimize_stmts(s1, set);
      optimize_stmts(s2, set);
      if s1.is_empty() && s2.is_empty() && final_assignments.is_empty() {
        false
      } else {
        collect_use_from_expression(condition, set);
        true
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      optimize_stmts(statements, set);
      if statements.is_empty() {
        false
      } else {
        collect_use_from_expression(condition, set);
        true
      }
    }
    Statement::Break(e) => {
      collect_use_from_expression(e, set);
      true
    }
    Statement::While { loop_variables, statements, break_collector } => {
      *break_collector = match break_collector {
        Some(v) if set.contains(&v.name) => Some(*v),
        _ => None,
      };
      let mut used_inside_loop = HashSet::new();
      collect_use_from_while_parts(loop_variables, statements, &mut used_inside_loop);
      loop_variables.retain(|it| used_inside_loop.contains(&it.name));
      for v in loop_variables.iter() {
        collect_use_from_expression(&v.loop_value, set);
      }
      optimize_stmts(statements, set);
      loop_variables.retain(|variable| {
        if set.contains(&variable.name) {
          collect_use_from_expression(&variable.initial_value, set);
          true
        } else {
          false
        }
      });
      true
    }
    Statement::Cast { name, type_: _, assigned_expression }
    | Statement::LateInitAssignment { name, assigned_expression } => {
      if !set.contains(name) {
        false
      } else {
        collect_use_from_expression(assigned_expression, set);
        true
      }
    }
    Statement::LateInitDeclaration { name, type_: _ } => set.contains(name),
    Statement::StructInit { struct_variable_name, type_name: _, expression_list } => {
      if !set.contains(struct_variable_name) {
        false
      } else {
        for e in expression_list {
          collect_use_from_expression(e, set);
        }
        true
      }
    }
    Statement::ClosureInit {
      closure_variable_name,
      closure_type_name: _,
      function_name: _,
      context,
    } => {
      if !set.contains(closure_variable_name) {
        false
      } else {
        collect_use_from_expression(context, set);
        true
      }
    }
  }
}

pub(super) fn optimize_stmts(stmts: &mut Vec<Statement>, set: &mut HashSet<PStr>) {
  let mut indices = vec![];
  for (i, s) in stmts.iter_mut().enumerate().rev() {
    if optimize_stmt(s, set) {
      indices.push(i);
    }
  }
  let mut curr_index = 0;
  stmts.retain(|_| {
    if let Some(to_keep) = indices.pop() {
      if to_keep == curr_index {
        curr_index += 1;
        true
      } else {
        indices.push(to_keep);
        curr_index += 1;
        false
      }
    } else {
      curr_index += 1;
      false
    }
  });
}

pub(super) fn optimize_function(function: &mut Function) {
  let mut set = HashSet::new();
  collect_use_from_expression(&function.return_value, &mut set);
  optimize_stmts(&mut function.body, &mut set);
}
