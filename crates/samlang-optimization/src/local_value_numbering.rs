use super::optimization_common::{
  BinaryBindedValue, BindedValue, IndexAccessBindedValue, UnaryBindedValue,
};
use samlang_ast::mir::{Binary, Callee, Expression, Function, Statement, VariableName};
use samlang_collections::local_stacked_context::LocalStackedContext;
use samlang_heap::PStr;

type LocalContext = LocalStackedContext<PStr, PStr>;
type LocalBindedValueContext = LocalStackedContext<BindedValue, PStr>;

fn lvn_bind_var(cx: &mut LocalContext, name: PStr, value: PStr) {
  let value = cx.get(&name).cloned().unwrap_or(value);
  let inserted = cx.insert(name, value);
  debug_assert!(inserted.is_none());
}

fn lvn_bind_value(cx: &mut LocalBindedValueContext, value: &BindedValue, name: PStr) {
  let inserted = cx.insert(*value, name);
  debug_assert!(inserted.is_none());
}

fn optimize_variable(
  VariableName { name, type_: _ }: &mut VariableName,
  variable_cx: &mut LocalContext,
) {
  *name = variable_cx.get(name).cloned().unwrap_or(*name);
}

fn optimize_expr(expression: &mut Expression, variable_cx: &mut LocalContext) {
  if let Expression::Variable(v) = expression {
    optimize_variable(v, variable_cx);
  }
}

fn optimize_stmt(
  stmt: &mut Statement,
  variable_cx: &mut LocalContext,
  binded_value_cx: &mut LocalBindedValueContext,
) -> bool {
  match stmt {
    Statement::Unary { name, operator, operand } => {
      optimize_expr(operand, variable_cx);
      let value = BindedValue::Unary(UnaryBindedValue { operator: *operator, operand: *operand });
      if let Some(binded) = binded_value_cx.get(&value) {
        lvn_bind_var(variable_cx, *name, *binded);
        false
      } else {
        lvn_bind_value(binded_value_cx, &value, *name);
        true
      }
    }
    Statement::Binary(Binary { name, operator, e1, e2 }) => {
      optimize_expr(e1, variable_cx);
      optimize_expr(e2, variable_cx);
      let value = BindedValue::Binary(BinaryBindedValue { operator: *operator, e1: *e1, e2: *e2 });
      if let Some(binded) = binded_value_cx.get(&value) {
        lvn_bind_var(variable_cx, *name, *binded);
        false
      } else {
        lvn_bind_value(binded_value_cx, &value, *name);
        true
      }
    }
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      optimize_expr(pointer_expression, variable_cx);
      let value = BindedValue::IndexedAccess(IndexAccessBindedValue {
        type_: *type_,
        pointer_expression: *pointer_expression,
        index: *index,
      });
      if let Some(binded) = binded_value_cx.get(&value) {
        lvn_bind_var(variable_cx, *name, *binded);
        false
      } else {
        lvn_bind_value(binded_value_cx, &value, *name);
        true
      }
    }
    Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
      match callee {
        Callee::FunctionName(_) => {}
        Callee::Variable(v) => optimize_variable(v, variable_cx),
      }
      for e in arguments {
        optimize_expr(e, variable_cx);
      }
      true
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      optimize_expr(condition, variable_cx);

      variable_cx.push_scope();
      binded_value_cx.push_scope();
      optimize_stmts(s1, variable_cx, binded_value_cx);
      final_assignments.iter_mut().for_each(|(_, _, e, _)| optimize_expr(e, variable_cx));
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();

      variable_cx.push_scope();
      binded_value_cx.push_scope();
      optimize_stmts(s2, variable_cx, binded_value_cx);
      final_assignments.iter_mut().for_each(|(_, _, _, e)| optimize_expr(e, variable_cx));
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();

      true
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      optimize_expr(condition, variable_cx);
      variable_cx.push_scope();
      binded_value_cx.push_scope();
      optimize_stmts(statements, variable_cx, binded_value_cx);
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();
      true
    }
    Statement::Break(e) => {
      optimize_expr(e, variable_cx);
      true
    }
    Statement::While { loop_variables, statements, break_collector: _ } => {
      loop_variables.iter_mut().for_each(|v| optimize_expr(&mut v.initial_value, variable_cx));
      variable_cx.push_scope();
      binded_value_cx.push_scope();
      optimize_stmts(statements, variable_cx, binded_value_cx);
      loop_variables.iter_mut().for_each(|v| optimize_expr(&mut v.loop_value, variable_cx));
      binded_value_cx.pop_scope();
      variable_cx.pop_scope();
      true
    }
    Statement::Cast { name: _, type_: _, assigned_expression }
    | Statement::LateInitAssignment { name: _, assigned_expression } => {
      optimize_expr(assigned_expression, variable_cx);
      true
    }
    Statement::LateInitDeclaration { name: _, type_: _ } => true,
    Statement::StructInit { struct_variable_name: _, type_name: _, expression_list } => {
      for e in expression_list {
        optimize_expr(e, variable_cx);
      }
      true
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name: _,
      function_name: _,
      context,
    } => {
      optimize_expr(context, variable_cx);
      true
    }
  }
}

fn optimize_stmts(
  stmts: &mut Vec<Statement>,
  variable_cx: &mut LocalContext,
  binded_value_cx: &mut LocalBindedValueContext,
) {
  stmts.retain_mut(|s| optimize_stmt(s, variable_cx, binded_value_cx))
}

pub(super) fn optimize_function(function: &mut Function) {
  let mut variable_cx = LocalContext::new();
  let mut binded_value_cx = LocalBindedValueContext::new();
  optimize_stmts(&mut function.body, &mut variable_cx, &mut binded_value_cx);
  optimize_expr(&mut function.return_value, &mut variable_cx);
}
