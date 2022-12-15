use itertools::Itertools;

use super::optimization_common::{BinaryBindedValue, BindedValue, IndexAccessBindedValue};
use crate::{
  ast::hir::{Binary, Callee, Expression, Function, GenenalLoopVariables, Statement, VariableName},
  common::{rc_string, LocalStackedContext, Str},
};

type LocalContext = LocalStackedContext<Str>;

impl LocalContext {
  fn lvn_bind_var(&mut self, name: &Str, value: Str) {
    let value = self.get(name).cloned().unwrap_or(value);
    assert!(self.insert(&name, value));
  }

  fn lvn_bind_value(&mut self, value: &BindedValue, name: Str) {
    assert!(self.insert(&rc_string(value.to_string()), name));
  }
}

fn optimize_variable(
  VariableName { name, type_ }: VariableName,
  variable_cx: &mut LocalContext,
) -> VariableName {
  let binded = variable_cx.get(&name).cloned().unwrap_or(name);
  VariableName { name: binded, type_ }
}

fn optimize_expr(expression: Expression, variable_cx: &mut LocalContext) -> Expression {
  if let Expression::Variable(v) = expression {
    Expression::Variable(optimize_variable(v, variable_cx))
  } else {
    expression
  }
}

fn optimize_stmt(
  stmt: Statement,
  variable_cx: &mut LocalContext,
  binded_value_cx: &mut LocalContext,
) -> Option<Statement> {
  match stmt {
    Statement::Binary(Binary { name, type_, operator, e1, e2 }) => {
      let e1 = optimize_expr(e1, variable_cx);
      let e2 = optimize_expr(e2, variable_cx);
      let value =
        BindedValue::Binary(BinaryBindedValue { operator, e1: e1.clone(), e2: e2.clone() });
      if let Some(binded) = binded_value_cx.get(&rc_string(value.to_string())) {
        variable_cx.lvn_bind_var(&name, binded.clone());
        None
      } else {
        binded_value_cx.lvn_bind_value(&value, name.clone());
        Some(Statement::Binary(Binary { name, type_, operator, e1, e2 }))
      }
    }
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      let pointer_expression = optimize_expr(pointer_expression, variable_cx);
      let value = BindedValue::IndexedAccess(IndexAccessBindedValue {
        type_: type_.clone(),
        pointer_expression: pointer_expression.clone(),
        index,
      });
      if let Some(binded) = binded_value_cx.get(&rc_string(value.to_string())) {
        variable_cx.lvn_bind_var(&name, binded.clone());
        None
      } else {
        binded_value_cx.lvn_bind_value(&value, name.clone());
        Some(Statement::IndexedAccess { name, type_, pointer_expression, index })
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => Some(Statement::Call {
      callee: match callee {
        Callee::FunctionName(n) => Callee::FunctionName(n),
        Callee::Variable(v) => Callee::Variable(optimize_variable(v, variable_cx)),
      },
      arguments: arguments.into_iter().map(|e| optimize_expr(e, variable_cx)).collect(),
      return_type,
      return_collector,
    }),
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let condition = optimize_expr(condition, variable_cx);

      variable_cx.push_scope();
      binded_value_cx.push_scope();
      let s1 = optimize_stmts(s1, variable_cx, binded_value_cx);
      let branch1_values = final_assignments
        .iter()
        .map(|(_, _, e, _)| optimize_expr(e.clone(), variable_cx))
        .collect_vec();
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();

      variable_cx.push_scope();
      binded_value_cx.push_scope();
      let s2 = optimize_stmts(s2, variable_cx, binded_value_cx);
      let branch2_values = final_assignments
        .iter()
        .map(|(_, _, _, e)| optimize_expr(e.clone(), variable_cx))
        .collect_vec();
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();

      let final_assignments = branch1_values
        .into_iter()
        .zip(branch2_values)
        .zip(final_assignments)
        .map(|((e1, e2), (n, t, _, _))| (n, t, e1, e2))
        .collect_vec();

      Some(Statement::IfElse { condition, s1, s2, final_assignments })
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      let condition = optimize_expr(condition, variable_cx);
      variable_cx.push_scope();
      binded_value_cx.push_scope();
      let statements = optimize_stmts(statements, variable_cx, binded_value_cx);
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();
      Some(Statement::SingleIf { condition, invert_condition, statements })
    }
    Statement::Break(e) => Some(Statement::Break(optimize_expr(e, variable_cx))),
    Statement::While { loop_variables, statements, break_collector } => {
      let loop_variables_without_loop_values = loop_variables
        .iter()
        .map(|v| {
          (v.name.clone(), v.type_.clone(), optimize_expr(v.initial_value.clone(), variable_cx))
        })
        .collect_vec();
      variable_cx.push_scope();
      binded_value_cx.push_scope();
      let statements = optimize_stmts(statements, variable_cx, binded_value_cx);
      let loop_variables_loop_values =
        loop_variables.into_iter().map(|v| optimize_expr(v.loop_value, variable_cx)).collect_vec();
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();
      let loop_variables = loop_variables_without_loop_values
        .into_iter()
        .zip(loop_variables_loop_values)
        .map(|((name, type_, initial_value), loop_value)| GenenalLoopVariables {
          name,
          type_,
          initial_value,
          loop_value,
        })
        .collect_vec();
      Some(Statement::While { loop_variables, statements, break_collector })
    }
    Statement::StructInit { struct_variable_name, type_, expression_list } => {
      Some(Statement::StructInit {
        struct_variable_name,
        type_,
        expression_list: expression_list
          .into_iter()
          .map(|e| optimize_expr(e, variable_cx))
          .collect(),
      })
    }
    Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
      Some(Statement::ClosureInit {
        closure_variable_name,
        closure_type,
        function_name,
        context: optimize_expr(context, variable_cx),
      })
    }
  }
}

fn optimize_stmts(
  stmts: Vec<Statement>,
  variable_cx: &mut LocalContext,
  binded_value_cx: &mut LocalContext,
) -> Vec<Statement> {
  stmts.into_iter().filter_map(|s| optimize_stmt(s, variable_cx, binded_value_cx)).collect()
}

pub(super) fn optimize_function(function: Function) -> Function {
  let mut variable_cx = LocalContext::new();
  let mut binded_value_cx = LocalContext::new();
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  Function {
    name,
    parameters,
    type_parameters,
    type_,
    body: optimize_stmts(body, &mut variable_cx, &mut binded_value_cx),
    return_value: optimize_expr(return_value, &mut variable_cx),
  }
}
