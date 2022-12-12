use itertools::Itertools;

use crate::ast::hir::{
  Binary, Callee, Expression, Function, FunctionName, GenenalLoopVariables, Operator, Statement,
  Type, VariableName, ZERO,
};
use crate::common::{rc_string, Str};
use std::collections::{HashMap, HashSet};

use super::conditional_constant_propagation;
use super::optimization_common::{LocalValueContextForOptimization, ResourceAllocator};

mod estimator {
  use super::*;

  /** The threshold max tolerable cost of inlining. */
  pub(super) const INLINE_THRESHOLD: usize = 20;
  /** The threshold max tolerable cost of performing inlining. */
  pub(super) const PERFORM_INLINE_THRESHOLD: usize = 1000;

  fn estimate_stmt_inline_cost(stmt: &Statement) -> usize {
    match stmt {
      Statement::Binary(_) => 1,
      Statement::IndexedAccess { .. } => 2,
      Statement::Call { .. } => 10,
      Statement::IfElse { condition: _, s1, s2, final_assignments } => {
        1 + estimate_stmts_inline_cost(s1)
          + estimate_stmts_inline_cost(s2)
          + final_assignments.len() * 2
      }
      Statement::SingleIf { condition: _, invert_condition: _, statements } => {
        1 + estimate_stmts_inline_cost(statements)
      }
      Statement::Break(_) => 1,
      Statement::While { loop_variables, statements, break_collector: _ } => {
        1 + loop_variables.len() * 2 + estimate_stmts_inline_cost(statements)
      }
      Statement::StructInit { expression_list, .. } => 1 + expression_list.len(),
      Statement::ClosureInit { .. } => 3,
    }
  }

  fn estimate_stmts_inline_cost(stmts: &Vec<Statement>) -> usize {
    let mut sum = 0;
    for s in stmts {
      sum += estimate_stmt_inline_cost(s);
    }
    sum
  }

  fn estimate_fn_inline_cost(function: &Function) -> usize {
    let mut sum = 0;
    for s in &function.body {
      sum += estimate_stmt_inline_cost(s);
    }
    sum
  }

  pub(super) struct FunctionsToInline {
    pub(super) functions_that_can_be_inlined: HashSet<Str>,
    pub(super) functions_that_can_perform_inlining: HashSet<Str>,
  }

  pub(super) fn get_functions_to_inline(functions: &Vec<Function>) -> FunctionsToInline {
    let mut functions_that_can_be_inlined = HashSet::new();
    let mut functions_that_can_perform_inlining = HashSet::new();
    for f in functions {
      let cost = estimate_fn_inline_cost(f);
      if cost <= INLINE_THRESHOLD {
        functions_that_can_be_inlined.insert(f.name.clone());
      }
      if cost <= PERFORM_INLINE_THRESHOLD {
        functions_that_can_perform_inlining.insert(f.name.clone());
      }
    }
    FunctionsToInline { functions_that_can_be_inlined, functions_that_can_perform_inlining }
  }

  #[cfg(test)]
  mod tests {
    use crate::{
      ast::hir::{
        Callee, Function, FunctionName, GenenalLoopVariables, Operator, Statement, Type, INT_TYPE,
        ZERO,
      },
      common::rcs,
    };

    #[test]
    fn cost_estimator_test() {
      let actual = super::estimate_fn_inline_cost(&Function {
        name: rcs(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![
          Statement::IndexedAccess {
            name: rcs("i0"),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 2,
          },
          Statement::binary("b0", Operator::PLUS, ZERO, ZERO),
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("name"),
            expression_list: vec![ZERO, ZERO, ZERO],
          },
          Statement::ClosureInit {
            closure_variable_name: rcs(""),
            closure_type: Type::new_id_no_targs_unwrapped("name"),
            function_name: FunctionName::new("name", Type::new_fn_unwrapped(vec![], INT_TYPE)),
            context: ZERO,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "name",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ZERO, ZERO],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(rcs(""), INT_TYPE, ZERO, ZERO)],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::binary("b0", Operator::PLUS, ZERO, ZERO)],
            s2: vec![Statement::binary("b0", Operator::PLUS, ZERO, ZERO)],
            final_assignments: vec![],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary("b0", Operator::PLUS, ZERO, ZERO)],
          },
          Statement::While {
            loop_variables: vec![GenenalLoopVariables {
              name: rcs(""),
              type_: INT_TYPE,
              initial_value: ZERO,
              loop_value: ZERO,
            }],
            statements: vec![Statement::binary("b0", Operator::PLUS, ZERO, ZERO)],
            break_collector: None,
          },
        ],
        return_value: ZERO,
      });
      assert_eq!(32, actual);
    }
  }
}

fn inline_rewrite_variable(
  VariableName { name, type_ }: &VariableName,
  cx: &mut LocalValueContextForOptimization,
) -> Expression {
  if let Some(binded) = cx.get(name) {
    binded.clone()
  } else {
    Expression::Variable(VariableName { name: name.clone(), type_: type_.clone() })
  }
}

fn inline_rewrite_expr(expr: &Expression, cx: &mut LocalValueContextForOptimization) -> Expression {
  if let Expression::Variable(v) = expr {
    inline_rewrite_variable(v, cx)
  } else {
    expr.clone()
  }
}

fn inline_rewrite_expressions(
  expressions: &Vec<Expression>,
  cx: &mut LocalValueContextForOptimization,
) -> Vec<Expression> {
  expressions.iter().map(|e| inline_rewrite_expr(e, cx)).collect()
}

fn inline_rewrite_callee(callee: &Callee, cx: &mut LocalValueContextForOptimization) -> Callee {
  match callee {
    Callee::FunctionName(n) => Callee::FunctionName(n.clone()),
    Callee::Variable(v) => inline_rewrite_variable(v, cx).as_callee().unwrap(),
  }
}

fn bind_with_mangled_name(
  cx: &mut LocalValueContextForOptimization,
  prefix: &str,
  name: &Str,
  type_: &Type,
) -> Str {
  let mangled_name = rc_string(format!("{}{}", prefix, name));
  cx.checked_bind(&name, Expression::var_name_str(mangled_name.clone(), type_.clone()));
  mangled_name
}

fn inline_rewrite_stmt(
  cx: &mut LocalValueContextForOptimization,
  prefix: &str,
  stmt: &Statement,
) -> Statement {
  match stmt {
    Statement::Binary(Binary { name, type_, operator, e1, e2 }) => Statement::Binary(Binary {
      name: bind_with_mangled_name(cx, prefix, name, type_),
      type_: type_.clone(),
      operator: *operator,
      e1: inline_rewrite_expr(e1, cx),
      e2: inline_rewrite_expr(e2, cx),
    }),
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      Statement::IndexedAccess {
        name: bind_with_mangled_name(cx, prefix, name, type_),
        type_: type_.clone(),
        pointer_expression: inline_rewrite_expr(pointer_expression, cx),
        index: *index,
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => {
      let callee = inline_rewrite_callee(callee, cx);
      let arguments = inline_rewrite_expressions(arguments, cx);
      let return_collector = if let Some(c) = return_collector {
        Some(bind_with_mangled_name(cx, prefix, c, return_type))
      } else {
        None
      };
      Statement::Call { callee, arguments, return_type: return_type.clone(), return_collector }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let condition = inline_rewrite_expr(condition, cx);
      cx.push_scope();
      let s1 = inline_rewrite_stmts(cx, prefix, s1);
      let branch1_values =
        final_assignments.iter().map(|(_, _, e, _)| inline_rewrite_expr(e, cx)).collect_vec();
      cx.pop_scope();
      cx.push_scope();
      let s2 = inline_rewrite_stmts(cx, prefix, s2);
      let branch2_values =
        final_assignments.iter().map(|(_, _, _, e)| inline_rewrite_expr(e, cx)).collect_vec();
      cx.pop_scope();
      let final_assignments = branch1_values
        .into_iter()
        .zip(branch2_values)
        .zip(final_assignments)
        .map(|((e1, e2), (n, t, _, _))| {
          (bind_with_mangled_name(cx, prefix, n, t), t.clone(), e1, e2)
        })
        .collect_vec();
      Statement::IfElse { condition, s1, s2, final_assignments }
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      let condition = inline_rewrite_expr(condition, cx);
      cx.push_scope();
      let statements = inline_rewrite_stmts(cx, prefix, statements);
      cx.pop_scope();
      Statement::SingleIf { condition, invert_condition: *invert_condition, statements }
    }
    Statement::Break(e) => Statement::Break(inline_rewrite_expr(e, cx)),
    Statement::While { loop_variables, statements, break_collector } => {
      let loop_variables_with_all_but_loop_value_rewritten = loop_variables
        .into_iter()
        .map(|GenenalLoopVariables { name, type_, initial_value, loop_value }| {
          GenenalLoopVariables {
            name: bind_with_mangled_name(cx, prefix, name, type_),
            type_: type_.clone(),
            initial_value: inline_rewrite_expr(initial_value, cx),
            loop_value: loop_value.clone(),
          }
        })
        .collect_vec();
      let statements = inline_rewrite_stmts(cx, prefix, statements);
      let loop_variables = loop_variables_with_all_but_loop_value_rewritten
        .into_iter()
        .map(|GenenalLoopVariables { name, type_, initial_value, loop_value }| {
          GenenalLoopVariables {
            name,
            type_,
            initial_value,
            loop_value: inline_rewrite_expr(&loop_value, cx),
          }
        })
        .collect_vec();
      let break_collector = if let Some(VariableName { name, type_ }) = break_collector {
        Some(VariableName {
          name: bind_with_mangled_name(cx, prefix, name, type_),
          type_: type_.clone(),
        })
      } else {
        None
      };
      Statement::While { loop_variables, statements, break_collector }
    }
    Statement::StructInit { struct_variable_name, type_, expression_list } => {
      Statement::StructInit {
        struct_variable_name: bind_with_mangled_name(
          cx,
          prefix,
          struct_variable_name,
          &Type::Id(type_.clone()),
        ),
        type_: type_.clone(),
        expression_list: inline_rewrite_expressions(expression_list, cx),
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
      Statement::ClosureInit {
        closure_variable_name: bind_with_mangled_name(
          cx,
          prefix,
          closure_variable_name,
          &Type::Id(closure_type.clone()),
        ),
        closure_type: closure_type.clone(),
        function_name: function_name.clone(),
        context: inline_rewrite_expr(context, cx),
      }
    }
  }
}

fn inline_rewrite_stmts(
  cx: &mut LocalValueContextForOptimization,
  prefix: &str,
  stmts: &Vec<Statement>,
) -> Vec<Statement> {
  stmts.iter().map(|s| inline_rewrite_stmt(cx, prefix, s)).collect()
}

fn perform_inline_rewrite_on_function_stmt(
  stmt: &Statement,
  current_fn_name: &Str,
  functions_that_can_be_inlined: &HashSet<Str>,
  all_functions: &HashMap<Str, Function>,
  allocator: &mut ResourceAllocator,
) -> Vec<Statement> {
  match stmt {
    Statement::Call {
      callee: Callee::FunctionName(FunctionName { name, type_: _, type_arguments: _ }),
      arguments,
      return_type,
      return_collector,
    } if functions_that_can_be_inlined.contains(name) && name.ne(current_fn_name) => {
      let Function {
        parameters: parameters_of_function_to_be_inlined,
        body: main_body_stmts_of_function_to_be_inlined,
        return_value: return_value_of_function_to_be_inlined,
        ..
      } = all_functions.get(name).unwrap();
      let temporary_prefix = allocator.alloc_inlining_temp_prefix();
      let mut cx = LocalValueContextForOptimization::new();
      // Inline step 1: Bind args to args temp
      for (param, arg) in parameters_of_function_to_be_inlined.iter().zip(arguments) {
        cx.checked_bind(param, arg.clone());
      }
      // Inline step 2: Add in body code and change return statements
      let mut rewritten_body =
        inline_rewrite_stmts(&mut cx, &temporary_prefix, main_body_stmts_of_function_to_be_inlined);
      if let Some(c) = return_collector {
        // Using this to move the value around, will be optimized away eventually.
        rewritten_body.push(Statement::Binary(Binary {
          name: c.clone(),
          type_: return_type.clone(),
          operator: Operator::PLUS,
          e1: inline_rewrite_expr(return_value_of_function_to_be_inlined, &mut cx),
          e2: ZERO,
        }));
      }
      rewritten_body
    }

    Statement::IfElse { condition, s1, s2, final_assignments } => {
      vec![Statement::IfElse {
        condition: condition.clone(),
        s1: perform_inline_rewrite_on_function_stmts(
          s1,
          current_fn_name,
          functions_that_can_be_inlined,
          all_functions,
          allocator,
        ),
        s2: perform_inline_rewrite_on_function_stmts(
          s2,
          current_fn_name,
          functions_that_can_be_inlined,
          all_functions,
          allocator,
        ),
        final_assignments: final_assignments.clone(),
      }]
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      vec![Statement::SingleIf {
        condition: condition.clone(),
        invert_condition: *invert_condition,
        statements: perform_inline_rewrite_on_function_stmts(
          statements,
          current_fn_name,
          functions_that_can_be_inlined,
          all_functions,
          allocator,
        ),
      }]
    }
    Statement::While { loop_variables, statements, break_collector } => {
      vec![Statement::While {
        loop_variables: loop_variables.clone(),
        statements: perform_inline_rewrite_on_function_stmts(
          statements,
          current_fn_name,
          functions_that_can_be_inlined,
          all_functions,
          allocator,
        ),
        break_collector: break_collector.clone(),
      }]
    }

    _ => vec![stmt.clone()],
  }
}

fn perform_inline_rewrite_on_function_stmts(
  statements: &Vec<Statement>,
  current_fn_name: &Str,
  functions_that_can_be_inlined: &HashSet<Str>,
  all_functions: &HashMap<Str, Function>,
  allocator: &mut ResourceAllocator,
) -> Vec<Statement> {
  statements
    .iter()
    .flat_map(|s| {
      perform_inline_rewrite_on_function_stmt(
        s,
        current_fn_name,
        functions_that_can_be_inlined,
        all_functions,
        allocator,
      )
    })
    .collect()
}

fn perform_inline_rewrite_on_function(
  function: &Function,
  functions_that_can_be_inlined: &HashSet<Str>,
  all_functions: &HashMap<Str, Function>,
  allocator: &mut ResourceAllocator,
) -> Function {
  let body = perform_inline_rewrite_on_function_stmts(
    &function.body,
    &function.name,
    functions_that_can_be_inlined,
    all_functions,
    allocator,
  );
  conditional_constant_propagation::optimize_function(Function {
    name: function.name.clone(),
    parameters: function.parameters.clone(),
    type_parameters: function.type_parameters.clone(),
    type_: function.type_.clone(),
    body,
    return_value: function.return_value.clone(),
  })
}

pub(super) fn optimize_functions(
  functions: Vec<Function>,
  allocator: &mut ResourceAllocator,
) -> Vec<Function> {
  let mut temp_functions = functions;
  for _ in 0..5 {
    let estimator_result = estimator::get_functions_to_inline(&temp_functions);
    if estimator_result.functions_that_can_be_inlined.is_empty() {
      return temp_functions;
    }
    let mut all_functions = HashMap::new();
    let mut names = vec![];
    for f in temp_functions {
      names.push(f.name.clone());
      all_functions.insert(f.name.clone(), f);
    }
    let mut inlined = vec![];
    for n in names {
      if estimator_result.functions_that_can_perform_inlining.contains(&n) {
        inlined.push(perform_inline_rewrite_on_function(
          all_functions.get(&n).unwrap(),
          &estimator_result.functions_that_can_be_inlined,
          &all_functions,
          allocator,
        ))
      } else {
        // If a function cannot perform inlining, it cannot be inlined as well,
        // so it's safe to remove.
        inlined.push(all_functions.remove(&n).unwrap());
      }
    }
    inlined.sort_by(|a, b| a.name.cmp(&b.name));
    temp_functions = inlined;
  }
  temp_functions
}
