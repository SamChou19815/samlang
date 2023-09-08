use super::optimization_common::{
  if_else_or_null, single_if_or_null, IndexAccessBindedValue, LocalValueContextForOptimization,
};
use crate::{ast::hir::Operator, ast::mir::*};
use itertools::Itertools;
use samlang_collections::local_stacked_context::LocalStackedContext;
use samlang_heap::{Heap, PStr};

fn evaluate_bin_op(operator: Operator, v1: i32, v2: i32) -> Option<i32> {
  match operator {
    Operator::MUL => Some(v1 * v2),
    Operator::DIV => {
      if v2 == 0 {
        None
      } else {
        Some(v1 / v2)
      }
    }
    Operator::MOD => {
      if v2 == 0 {
        None
      } else {
        Some(v1 % v2)
      }
    }
    Operator::PLUS => Some(v1 + v2),
    Operator::MINUS => Some(v1 - v2),
    Operator::LAND => Some(v1 & v2),
    Operator::LOR => Some(v1 | v2),
    Operator::SHL => Some(v1 << v2),
    Operator::SHR => {
      Some(i32::from_be_bytes(((u32::from_be_bytes(v1.to_be_bytes())) >> v2).to_be_bytes()))
    }
    Operator::XOR => Some(v1 ^ v2),
    Operator::LT => Some((v1 < v2) as i32),
    Operator::LE => Some((v1 <= v2) as i32),
    Operator::GT => Some((v1 > v2) as i32),
    Operator::GE => Some((v1 >= v2) as i32),
    Operator::EQ => Some((v1 == v2) as i32),
    Operator::NE => Some((v1 != v2) as i32),
  }
}

#[derive(Clone)]
struct BinaryExpression {
  operator: Operator,
  e1: VariableName,
  e2: i32,
}

fn merge_binary_expression(
  outer_operator: Operator,
  inner: &BinaryExpression,
  outer_const: i32,
) -> Option<BinaryExpression> {
  match outer_operator {
    Operator::PLUS => {
      if inner.operator == Operator::PLUS {
        Some(BinaryExpression {
          operator: Operator::PLUS,
          e1: inner.e1,
          e2: inner.e2 + outer_const,
        })
      } else {
        None
      }
    }
    Operator::MUL => {
      if inner.operator == Operator::MUL {
        Some(BinaryExpression { operator: Operator::MUL, e1: inner.e1, e2: inner.e2 * outer_const })
      } else {
        None
      }
    }
    Operator::LT | Operator::LE | Operator::GT | Operator::GE | Operator::EQ | Operator::NE => {
      if inner.operator == Operator::PLUS {
        Some(BinaryExpression {
          operator: outer_operator,
          e1: inner.e1,
          e2: outer_const - inner.e2,
        })
      } else {
        None
      }
    }
    _ => None,
  }
}

type BinaryExpressionContext = LocalStackedContext<PStr, BinaryExpression>;

fn optimize_variable_name(
  value_cx: &mut LocalValueContextForOptimization,
  VariableName { name, type_ }: &VariableName,
) -> Expression {
  if let Some(binded) = value_cx.get(name).copied() {
    binded
  } else {
    Expression::Variable(VariableName { name: *name, type_: *type_ })
  }
}

fn optimize_expr(value_cx: &mut LocalValueContextForOptimization, e: &Expression) -> Expression {
  match e {
    Expression::IntLiteral(_) | Expression::StringName(_) => *e,
    Expression::Variable(v) => optimize_variable_name(value_cx, v),
  }
}

fn optimize_callee(value_cx: &mut LocalValueContextForOptimization, callee: &Callee) -> Callee {
  match callee {
    Callee::FunctionName(n) => Callee::FunctionName(n.clone()),
    Callee::Variable(v) => optimize_variable_name(value_cx, v).convert_to_callee().unwrap(),
  }
}

fn optimize_expressions(
  value_cx: &mut LocalValueContextForOptimization,
  expressions: &[Expression],
) -> Vec<Expression> {
  expressions.iter().map(|e| optimize_expr(value_cx, e)).collect()
}

fn push_scope(
  value_cx: &mut LocalValueContextForOptimization,
  index_access_cx: &mut LocalStackedContext<IndexAccessBindedValue, Expression>,
  binary_expr_cx: &mut BinaryExpressionContext,
) {
  value_cx.push_scope();
  index_access_cx.push_scope();
  binary_expr_cx.push_scope();
}

fn pop_scope(
  value_cx: &mut LocalValueContextForOptimization,
  index_access_cx: &mut LocalStackedContext<IndexAccessBindedValue, Expression>,
  binary_expr_cx: &mut BinaryExpressionContext,
) {
  value_cx.pop_scope();
  index_access_cx.pop_scope();
  binary_expr_cx.pop_scope();
}

fn optimize_stmt(
  stmt: &Statement,
  heap: &mut Heap,
  value_cx: &mut LocalValueContextForOptimization,
  index_access_cx: &mut LocalStackedContext<IndexAccessBindedValue, Expression>,
  binary_expr_cx: &mut BinaryExpressionContext,
  collector: &mut Vec<Statement>,
) -> bool {
  match stmt {
    Statement::Binary(Binary { name, operator, e1, e2 }) => {
      let e1 = optimize_expr(value_cx, e1);
      let e2 = optimize_expr(value_cx, e2);
      let operator = *operator;
      if let Expression::IntLiteral(v2) = &e2 {
        if *v2 == 0 {
          if operator == Operator::PLUS {
            value_cx.checked_bind(*name, e1);
            return false;
          }
          if operator == Operator::MUL {
            value_cx.checked_bind(*name, ZERO);
            return false;
          }
        }
        if *v2 == 1 {
          if operator == Operator::MOD {
            value_cx.checked_bind(*name, ZERO);
            return false;
          }
          if operator == Operator::MUL || operator == Operator::DIV {
            value_cx.checked_bind(*name, e1);
            return false;
          }
        }
        if let Expression::IntLiteral(v1) = &e1 {
          if let Some(value) = evaluate_bin_op(operator, *v1, *v2) {
            value_cx.checked_bind(*name, Expression::IntLiteral(value));
            return false;
          }
        }
      }
      match (&e1, &e2) {
        (Expression::Variable(v1), Expression::Variable(v2)) if v1.name.eq(&v2.name) => {
          if operator == Operator::MINUS || operator == Operator::MOD {
            value_cx.checked_bind(*name, ZERO);
            return false;
          }
          if operator == Operator::DIV {
            value_cx.checked_bind(*name, ONE);
            return false;
          }
        }
        _ => {}
      }
      let partially_optimized_binary =
        Statement::binary_flexible_unwrapped(*name, operator, e1, e2);
      if let Binary {
        name,
        operator,
        e1: Expression::Variable(v1),
        e2: Expression::IntLiteral(v2),
      } = &partially_optimized_binary
      {
        if let Some(existing_b1) = binary_expr_cx.get(&v1.name) {
          if let Some(BinaryExpression { operator, e1, e2 }) =
            merge_binary_expression(*operator, existing_b1, *v2)
          {
            collector.push(Statement::Binary(Binary {
              name: *name,
              operator,
              e1: Expression::Variable(e1),
              e2: Expression::IntLiteral(e2),
            }));
            return false;
          }
        }
        binary_expr_cx.insert(*name, BinaryExpression { operator: *operator, e1: *v1, e2: *v2 });
      }
      collector.push(Statement::Binary(partially_optimized_binary));
      false
    }

    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      let pointer_expression = optimize_expr(value_cx, pointer_expression);
      if let Some(computed) = index_access_cx.get(&IndexAccessBindedValue {
        type_: INT_TYPE,
        pointer_expression,
        index: *index,
      }) {
        value_cx.checked_bind(*name, *computed);
      } else {
        collector.push(Statement::IndexedAccess {
          name: *name,
          type_: *type_,
          pointer_expression,
          index: *index,
        });
      }
      false
    }

    Statement::Call { callee, arguments, return_type, return_collector } => {
      let callee = optimize_callee(value_cx, callee);
      let arguments = optimize_expressions(value_cx, arguments);
      collector.push(Statement::Call {
        callee,
        arguments,
        return_type: *return_type,
        return_collector: *return_collector,
      });
      false
    }

    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let condition = optimize_expr(value_cx, condition);
      if let Expression::IntLiteral(v) = &condition {
        let is_true = (*v) != 0;
        let ends_with_break = optimize_stmts(
          if is_true { s1 } else { s2 },
          heap,
          value_cx,
          index_access_cx,
          binary_expr_cx,
          collector,
        );
        if ends_with_break {
          return true;
        }
        for (n, _, e1, e2) in final_assignments {
          let optimized =
            if is_true { optimize_expr(value_cx, e1) } else { optimize_expr(value_cx, e2) };
          value_cx.checked_bind(*n, optimized);
        }
        return false;
      }
      push_scope(value_cx, index_access_cx, binary_expr_cx);
      let mut s1_collector = vec![];
      optimize_stmts(s1, heap, value_cx, index_access_cx, binary_expr_cx, &mut s1_collector);
      let branch1_values =
        final_assignments.iter().map(|(_, _, e, _)| optimize_expr(value_cx, e)).collect_vec();
      pop_scope(value_cx, index_access_cx, binary_expr_cx);
      push_scope(value_cx, index_access_cx, binary_expr_cx);
      let mut s2_collector = vec![];
      optimize_stmts(s2, heap, value_cx, index_access_cx, binary_expr_cx, &mut s2_collector);
      let branch2_values =
        final_assignments.iter().map(|(_, _, _, e)| optimize_expr(value_cx, e)).collect_vec();
      pop_scope(value_cx, index_access_cx, binary_expr_cx);
      let mut optimized_final_assignments = vec![];
      for ((e1, e2), (n, t, _, _)) in
        branch1_values.into_iter().zip(branch2_values).zip(final_assignments)
      {
        if e1 == e2 {
          value_cx.checked_bind(*n, e1);
        } else {
          optimized_final_assignments.push((*n, *t, e1, e2));
        }
      }
      if let Some(stmt) =
        if_else_or_null(condition, s1_collector, s2_collector, optimized_final_assignments)
      {
        collector.push(stmt)
      }
      false
    }

    Statement::SingleIf { condition, invert_condition, statements } => {
      let condition = optimize_expr(value_cx, condition);
      if let Expression::IntLiteral(v) = &condition {
        let is_true = (*v ^ (*invert_condition as i32)) != 0;
        if is_true {
          optimize_stmts(statements, heap, value_cx, index_access_cx, binary_expr_cx, collector)
        } else {
          false
        }
      } else {
        let mut stmt_collector = vec![];
        optimize_stmts(
          statements,
          heap,
          value_cx,
          index_access_cx,
          binary_expr_cx,
          &mut stmt_collector,
        );
        collector.append(&mut single_if_or_null(condition, *invert_condition, stmt_collector));
        false
      }
    }

    Statement::Break(e) => {
      collector.push(Statement::Break(optimize_expr(value_cx, e)));
      true
    }

    Statement::While { loop_variables, statements, break_collector } => {
      let mut filtered_loop_variables = vec![];
      for v in loop_variables.iter() {
        if v.initial_value == v.loop_value {
          value_cx.checked_bind(v.name, v.initial_value);
        } else {
          filtered_loop_variables.push(v);
        }
      }
      let loop_variable_initial_values = filtered_loop_variables
        .iter()
        .map(|v| optimize_expr(value_cx, &v.initial_value))
        .collect_vec();
      push_scope(value_cx, index_access_cx, binary_expr_cx);
      let mut stmts = vec![];
      optimize_stmts(statements, heap, value_cx, index_access_cx, binary_expr_cx, &mut stmts);
      let loop_variable_loop_values = filtered_loop_variables
        .iter()
        .map(|v| optimize_expr(value_cx, &v.loop_value))
        .collect_vec();
      pop_scope(value_cx, index_access_cx, binary_expr_cx);
      let loop_variables = loop_variable_initial_values
        .into_iter()
        .zip(loop_variable_loop_values)
        .zip(filtered_loop_variables)
        .map(|((initial_value, loop_value), variable)| GenenalLoopVariable {
          name: variable.name,
          type_: variable.type_,
          initial_value,
          loop_value,
        })
        .collect_vec();
      if let Some((Statement::Break(e), rest)) = stmts.split_last() {
        // Now we know that the loop will only loop once!
        for v in loop_variables {
          value_cx.checked_bind(v.name, v.initial_value);
        }
        optimize_stmts(rest, heap, value_cx, index_access_cx, binary_expr_cx, collector);
        if let Some(v) = break_collector {
          let break_value = optimize_expr(value_cx, e);
          value_cx.checked_bind(v.name, break_value);
        }
        false
      } else {
        let mut stmts = try_optimize_loop_for_some_iterations(
          loop_variables,
          stmts,
          *break_collector,
          heap,
          value_cx,
          index_access_cx,
          binary_expr_cx,
        );
        collector.append(&mut stmts);
        false
      }
    }

    Statement::Cast { name, type_, assigned_expression } => {
      collector.push(Statement::Cast {
        name: *name,
        type_: *type_,
        assigned_expression: optimize_expr(value_cx, assigned_expression),
      });
      false
    }

    Statement::StructInit { struct_variable_name, type_name, expression_list } => {
      let mut optimized_expression_list = vec![];
      for (i, e) in expression_list.iter().enumerate() {
        let optimized = optimize_expr(value_cx, e);
        let key = IndexAccessBindedValue {
          type_: INT_TYPE,
          pointer_expression: Expression::Variable(VariableName {
            name: *struct_variable_name,
            type_: Type::Id(*type_name),
          }),
          index: i,
        };
        index_access_cx.insert(key, optimized);
        optimized_expression_list.push(optimized);
      }
      collector.push(Statement::StructInit {
        struct_variable_name: *struct_variable_name,
        type_name: *type_name,
        expression_list: optimized_expression_list,
      });
      false
    }

    Statement::ClosureInit { closure_variable_name, closure_type_name, function_name, context } => {
      collector.push(Statement::ClosureInit {
        closure_variable_name: *closure_variable_name,
        closure_type_name: *closure_type_name,
        function_name: function_name.clone(),
        context: optimize_expr(value_cx, context),
      });
      false
    }
  }
}

fn optimize_stmts(
  stmts: &[Statement],
  heap: &mut Heap,
  value_cx: &mut LocalValueContextForOptimization,
  index_access_cx: &mut LocalStackedContext<IndexAccessBindedValue, Expression>,
  binary_expr_cx: &mut BinaryExpressionContext,
  collector: &mut Vec<Statement>,
) -> bool {
  for stmt in stmts {
    let ends_with_break =
      optimize_stmt(stmt, heap, value_cx, index_access_cx, binary_expr_cx, collector);
    if ends_with_break {
      return true;
    }
  }
  false
}

fn try_optimize_loop_for_some_iterations(
  mut loop_variables: Vec<GenenalLoopVariable>,
  mut stmts: Vec<Statement>,
  mut break_collector: Option<VariableName>,
  heap: &mut Heap,
  value_cx: &mut LocalValueContextForOptimization,
  index_access_cx: &mut LocalStackedContext<IndexAccessBindedValue, Expression>,
  binary_expr_cx: &mut BinaryExpressionContext,
) -> Vec<Statement> {
  let mut max_depth = 5;
  loop {
    push_scope(value_cx, index_access_cx, binary_expr_cx);
    for v in &loop_variables {
      value_cx.checked_bind(v.name, v.initial_value);
    }
    let mut first_run_optimized_stmts = vec![];
    optimize_stmts(
      &stmts,
      heap,
      value_cx,
      index_access_cx,
      binary_expr_cx,
      &mut first_run_optimized_stmts,
    );
    if let Some(last_stmt) = first_run_optimized_stmts.last() {
      if !matches!(last_stmt, Statement::Break(_)) {
        pop_scope(value_cx, index_access_cx, binary_expr_cx);
        return vec![Statement::While { loop_variables, statements: stmts, break_collector }];
      }
    } else {
      // Empty loop in first run except new loop values, so we can change the initial values!
      let advanced_loop_variables = loop_variables
        .into_iter()
        .map(|GenenalLoopVariable { name, type_, initial_value: _, loop_value }| {
          GenenalLoopVariable {
            name,
            type_,
            initial_value: optimize_expr(value_cx, &loop_value),
            loop_value,
          }
        })
        .collect_vec();
      first_run_optimized_stmts = vec![Statement::While {
        loop_variables: advanced_loop_variables,
        statements: stmts,
        break_collector,
      }];
    }
    pop_scope(value_cx, index_access_cx, binary_expr_cx);
    let last_stmt_of_first_run_optimized_stmt = first_run_optimized_stmts.last().unwrap();
    if let Statement::Break(break_v) = last_stmt_of_first_run_optimized_stmt {
      if let Some(v) = break_collector {
        let optimized_break_v = optimize_expr(value_cx, break_v);
        value_cx.checked_bind(v.name, optimized_break_v);
      }
      first_run_optimized_stmts.pop();
      return first_run_optimized_stmts;
    } else if max_depth == 0 {
      return first_run_optimized_stmts;
    } else {
      debug_assert!(first_run_optimized_stmts.len() == 1);
      (loop_variables, stmts, break_collector) =
        first_run_optimized_stmts.remove(0).into_while().unwrap();
      max_depth -= 1;
    }
  }
}

pub(super) fn optimize_function(function: &mut Function, heap: &mut Heap) {
  let mut value_cx = LocalValueContextForOptimization::new();
  let mut index_access_cx = LocalStackedContext::new();
  let mut binary_expr_cx = BinaryExpressionContext::new();
  let mut collector = vec![];
  optimize_stmts(
    &function.body,
    heap,
    &mut value_cx,
    &mut index_access_cx,
    &mut binary_expr_cx,
    &mut collector,
  );
  function.body = collector;
  function.return_value = optimize_expr(&mut value_cx, &function.return_value);
}

#[cfg(test)]
mod boilterplate_tests {
  use super::{optimize_callee, BinaryExpression};
  use crate::{
    ast::hir::Operator, ast::mir::*,
    optimization::optimization_common::LocalValueContextForOptimization,
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    assert_eq!(
      1,
      BinaryExpression {
        operator: Operator::PLUS,
        e1: VariableName { name: PStr::INVALID_PSTR, type_: INT_TYPE },
        e2: 1,
      }
      .clone()
      .e2
    );
  }

  #[should_panic]
  #[test]
  fn panic_test() {
    let mut value_cx = LocalValueContextForOptimization::new();
    let heap = &mut Heap::new();
    value_cx.checked_bind(PStr::LOWER_A, Expression::var_name(PStr::LOWER_A, INT_TYPE));
    value_cx.checked_bind(PStr::LOWER_B, Expression::StringName(heap.alloc_str_for_test("1")));
    value_cx.checked_bind(PStr::LOWER_C, Expression::StringName(PStr::UPPER_A));
    optimize_callee(
      &mut value_cx,
      &Callee::Variable(VariableName { name: PStr::LOWER_A, type_: INT_TYPE }),
    );
    optimize_callee(
      &mut value_cx,
      &Callee::Variable(VariableName { name: PStr::LOWER_B, type_: INT_TYPE }),
    );
    optimize_callee(
      &mut value_cx,
      &Callee::Variable(VariableName { name: PStr::LOWER_C, type_: INT_TYPE }),
    );
  }
}
