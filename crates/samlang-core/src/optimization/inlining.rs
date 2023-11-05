use super::optimization_common::LocalValueContextForOptimization;
use itertools::Itertools;
use samlang_ast::{
  hir::Operator,
  mir::{
    Binary, Callee, Expression, Function, FunctionName, FunctionNameExpression,
    GenenalLoopVariable, Statement, Type, VariableName, INT_TYPE, ZERO,
  },
};
use samlang_heap::{Heap, PStr};
use std::collections::{HashMap, HashSet};

mod estimator {
  use super::*;

  /** The threshold max tolerable cost of inlining. */
  pub(super) const INLINE_THRESHOLD: usize = 20;
  /** The threshold max tolerable cost of performing inlining. */
  pub(super) const PERFORM_INLINE_THRESHOLD: usize = 1000;

  fn estimate_stmt_inline_cost(stmt: &Statement) -> usize {
    match stmt {
      Statement::LateInitDeclaration { .. } => 0,
      Statement::Binary(_) | Statement::Cast { .. } | Statement::LateInitAssignment { .. } => 1,
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
    pub(super) functions_that_can_be_inlined: HashSet<FunctionName>,
    pub(super) functions_that_can_perform_inlining: HashSet<FunctionName>,
  }

  pub(super) fn get_functions_to_inline(functions: &Vec<Function>) -> FunctionsToInline {
    let mut functions_that_can_be_inlined = HashSet::new();
    let mut functions_that_can_perform_inlining = HashSet::new();
    for f in functions {
      let cost = estimate_fn_inline_cost(f);
      if cost <= INLINE_THRESHOLD {
        functions_that_can_be_inlined.insert(f.name);
      }
      if cost <= PERFORM_INLINE_THRESHOLD {
        functions_that_can_perform_inlining.insert(f.name);
      }
    }
    FunctionsToInline { functions_that_can_be_inlined, functions_that_can_perform_inlining }
  }

  #[cfg(test)]
  mod tests {
    use samlang_ast::{
      hir::Operator,
      mir::{
        Callee, Function, FunctionName, FunctionNameExpression, GenenalLoopVariable, Statement,
        SymbolTable, Type, INT_TYPE, ZERO,
      },
    };
    use samlang_heap::PStr;

    #[test]
    fn cost_estimator_test() {
      let mut table = SymbolTable::new();

      let actual = super::estimate_fn_inline_cost(&Function {
        name: FunctionName::new_for_test(PStr::EMPTY),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![
          Statement::IndexedAccess {
            name: PStr::EMPTY,
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 2,
          },
          Statement::binary(PStr::EMPTY, Operator::PLUS, ZERO, ZERO),
          Statement::StructInit {
            struct_variable_name: PStr::EMPTY,
            type_name: table.create_type_name_for_test(PStr::EMPTY),
            expression_list: vec![ZERO, ZERO, ZERO],
          },
          Statement::ClosureInit {
            closure_variable_name: PStr::EMPTY,
            closure_type_name: table.create_type_name_for_test(PStr::EMPTY),
            function_name: FunctionNameExpression {
              name: FunctionName::new_for_test(PStr::EMPTY),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            },
            context: ZERO,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(PStr::EMPTY),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![ZERO, ZERO],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(PStr::EMPTY, INT_TYPE, ZERO, ZERO)],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::binary(PStr::EMPTY, Operator::PLUS, ZERO, ZERO)],
            s2: vec![Statement::binary(PStr::EMPTY, Operator::PLUS, ZERO, ZERO)],
            final_assignments: vec![],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary(PStr::EMPTY, Operator::PLUS, ZERO, ZERO)],
          },
          Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: PStr::EMPTY,
              type_: INT_TYPE,
              initial_value: ZERO,
              loop_value: ZERO,
            }],
            statements: vec![Statement::binary(PStr::EMPTY, Operator::PLUS, ZERO, ZERO)],
            break_collector: None,
          },
          Statement::Cast { name: PStr::EMPTY, type_: INT_TYPE, assigned_expression: ZERO },
          Statement::LateInitDeclaration { name: PStr::EMPTY, type_: INT_TYPE },
          Statement::LateInitAssignment { name: PStr::EMPTY, assigned_expression: ZERO },
        ],
        return_value: ZERO,
      });
      assert_eq!(34, actual);
    }
  }
}

fn inline_rewrite_variable(
  VariableName { name, type_ }: &VariableName,
  cx: &mut LocalValueContextForOptimization,
) -> Expression {
  if let Some(binded) = cx.get(name) {
    *binded
  } else {
    Expression::Variable(VariableName { name: *name, type_: *type_ })
  }
}

fn inline_rewrite_expr(expr: &Expression, cx: &mut LocalValueContextForOptimization) -> Expression {
  if let Expression::Variable(v) = expr {
    inline_rewrite_variable(v, cx)
  } else {
    *expr
  }
}

fn inline_rewrite_expressions(
  expressions: &[Expression],
  cx: &mut LocalValueContextForOptimization,
) -> Vec<Expression> {
  expressions.iter().map(|e| inline_rewrite_expr(e, cx)).collect()
}

fn inline_rewrite_callee(callee: &Callee, cx: &mut LocalValueContextForOptimization) -> Callee {
  match callee {
    Callee::FunctionName(n) => Callee::FunctionName(n.clone()),
    Callee::Variable(v) => inline_rewrite_variable(v, cx).convert_to_callee().unwrap(),
  }
}

fn bind_with_mangled_name(
  cx: &mut LocalValueContextForOptimization,
  heap: &mut Heap,
  prefix: &PStr,
  name: &PStr,
  type_: &Type,
) -> PStr {
  let mangled_name = heap.alloc_string(format!("{}{}", prefix.as_str(heap), name.as_str(heap)));
  cx.checked_bind(*name, Expression::var_name(mangled_name, *type_));
  mangled_name
}

fn inline_rewrite_stmt(
  cx: &mut LocalValueContextForOptimization,
  heap: &mut Heap,
  prefix: &PStr,
  stmt: &Statement,
) -> Statement {
  match stmt {
    Statement::Binary(Binary { name, operator, e1, e2 }) => Statement::Binary(Binary {
      name: bind_with_mangled_name(cx, heap, prefix, name, &INT_TYPE),
      operator: *operator,
      e1: inline_rewrite_expr(e1, cx),
      e2: inline_rewrite_expr(e2, cx),
    }),
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      Statement::IndexedAccess {
        name: bind_with_mangled_name(cx, heap, prefix, name, type_),
        type_: *type_,
        pointer_expression: inline_rewrite_expr(pointer_expression, cx),
        index: *index,
      }
    }
    Statement::Call { callee, arguments, return_type, return_collector } => {
      let callee = inline_rewrite_callee(callee, cx);
      let arguments = inline_rewrite_expressions(arguments, cx);
      let return_collector =
        return_collector.as_ref().map(|c| bind_with_mangled_name(cx, heap, prefix, c, return_type));
      Statement::Call { callee, arguments, return_type: *return_type, return_collector }
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      let condition = inline_rewrite_expr(condition, cx);
      cx.push_scope();
      let s1 = inline_rewrite_stmts(cx, heap, prefix, s1);
      let branch1_values =
        final_assignments.iter().map(|(_, _, e, _)| inline_rewrite_expr(e, cx)).collect_vec();
      cx.pop_scope();
      cx.push_scope();
      let s2 = inline_rewrite_stmts(cx, heap, prefix, s2);
      let branch2_values =
        final_assignments.iter().map(|(_, _, _, e)| inline_rewrite_expr(e, cx)).collect_vec();
      cx.pop_scope();
      let final_assignments = branch1_values
        .into_iter()
        .zip(branch2_values)
        .zip(final_assignments)
        .map(|((e1, e2), (n, t, _, _))| {
          (bind_with_mangled_name(cx, heap, prefix, n, t), *t, e1, e2)
        })
        .collect_vec();
      Statement::IfElse { condition, s1, s2, final_assignments }
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      let condition = inline_rewrite_expr(condition, cx);
      cx.push_scope();
      let statements = inline_rewrite_stmts(cx, heap, prefix, statements);
      cx.pop_scope();
      Statement::SingleIf { condition, invert_condition: *invert_condition, statements }
    }
    Statement::Break(e) => Statement::Break(inline_rewrite_expr(e, cx)),
    Statement::While { loop_variables, statements, break_collector } => {
      let loop_variables_with_all_but_loop_value_rewritten = loop_variables
        .iter()
        .map(|GenenalLoopVariable { name, type_, initial_value, loop_value }| GenenalLoopVariable {
          name: bind_with_mangled_name(cx, heap, prefix, name, type_),
          type_: *type_,
          initial_value: inline_rewrite_expr(initial_value, cx),
          loop_value: *loop_value,
        })
        .collect_vec();
      let statements = inline_rewrite_stmts(cx, heap, prefix, statements);
      let loop_variables = loop_variables_with_all_but_loop_value_rewritten
        .into_iter()
        .map(|GenenalLoopVariable { name, type_, initial_value, loop_value }| GenenalLoopVariable {
          name,
          type_,
          initial_value,
          loop_value: inline_rewrite_expr(&loop_value, cx),
        })
        .collect_vec();
      let break_collector = if let Some(VariableName { name, type_ }) = break_collector {
        Some(VariableName {
          name: bind_with_mangled_name(cx, heap, prefix, name, type_),
          type_: *type_,
        })
      } else {
        None
      };
      Statement::While { loop_variables, statements, break_collector }
    }
    Statement::Cast { name, type_, assigned_expression } => Statement::Cast {
      name: bind_with_mangled_name(cx, heap, prefix, name, type_),
      type_: *type_,
      assigned_expression: inline_rewrite_expr(assigned_expression, cx),
    },
    Statement::LateInitDeclaration { name, type_ } => Statement::LateInitDeclaration {
      name: bind_with_mangled_name(cx, heap, prefix, name, type_),
      type_: *type_,
    },
    Statement::LateInitAssignment { name, assigned_expression } => Statement::LateInitAssignment {
      name: cx.get(name).unwrap().into_variable().unwrap().name,
      assigned_expression: inline_rewrite_expr(assigned_expression, cx),
    },
    Statement::StructInit { struct_variable_name, type_name, expression_list } => {
      Statement::StructInit {
        struct_variable_name: bind_with_mangled_name(
          cx,
          heap,
          prefix,
          struct_variable_name,
          &Type::Id(*type_name),
        ),
        type_name: *type_name,
        expression_list: inline_rewrite_expressions(expression_list, cx),
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type_name, function_name, context } => {
      Statement::ClosureInit {
        closure_variable_name: bind_with_mangled_name(
          cx,
          heap,
          prefix,
          closure_variable_name,
          &Type::Id(*closure_type_name),
        ),
        closure_type_name: *closure_type_name,
        function_name: function_name.clone(),
        context: inline_rewrite_expr(context, cx),
      }
    }
  }
}

fn inline_rewrite_stmts(
  cx: &mut LocalValueContextForOptimization,
  heap: &mut Heap,
  prefix: &PStr,
  stmts: &[Statement],
) -> Vec<Statement> {
  stmts.iter().map(|s| inline_rewrite_stmt(cx, heap, prefix, s)).collect()
}

fn perform_inline_rewrite_on_function_stmt(
  stmt: Statement,
  current_fn_name: &FunctionName,
  functions_that_can_be_inlined: &HashMap<FunctionName, Function>,
  heap: &mut Heap,
) -> Vec<Statement> {
  match stmt {
    Statement::Call {
      callee: Callee::FunctionName(FunctionNameExpression { name, type_: _ }),
      arguments,
      return_type: _,
      return_collector,
    } if functions_that_can_be_inlined.contains_key(&name) && name.ne(current_fn_name) => {
      let Function {
        parameters: parameters_of_function_to_be_inlined,
        body: main_body_stmts_of_function_to_be_inlined,
        return_value: return_value_of_function_to_be_inlined,
        ..
      } = functions_that_can_be_inlined.get(&name).unwrap();
      let temporary_prefix = heap.alloc_temp_str();
      let mut cx = LocalValueContextForOptimization::new();
      // Inline step 1: Bind args to args temp
      for (param, arg) in parameters_of_function_to_be_inlined.iter().zip(arguments) {
        cx.checked_bind(*param, arg);
      }
      // Inline step 2: Add in body code and change return statements
      let mut rewritten_body = inline_rewrite_stmts(
        &mut cx,
        heap,
        &temporary_prefix,
        main_body_stmts_of_function_to_be_inlined,
      );
      if let Some(c) = return_collector {
        // Using this to move the value around, will be optimized away eventually.
        rewritten_body.push(Statement::Binary(Binary {
          name: c,
          operator: Operator::PLUS,
          e1: inline_rewrite_expr(return_value_of_function_to_be_inlined, &mut cx),
          e2: ZERO,
        }));
      }
      rewritten_body
    }

    Statement::IfElse { condition, s1, s2, final_assignments } => {
      vec![Statement::IfElse {
        condition,
        s1: perform_inline_rewrite_on_function_stmts(
          s1,
          current_fn_name,
          functions_that_can_be_inlined,
          heap,
        ),
        s2: perform_inline_rewrite_on_function_stmts(
          s2,
          current_fn_name,
          functions_that_can_be_inlined,
          heap,
        ),
        final_assignments,
      }]
    }
    Statement::SingleIf { condition, invert_condition, statements } => {
      vec![Statement::SingleIf {
        condition,
        invert_condition,
        statements: perform_inline_rewrite_on_function_stmts(
          statements,
          current_fn_name,
          functions_that_can_be_inlined,
          heap,
        ),
      }]
    }
    Statement::While { loop_variables, statements, break_collector } => {
      vec![Statement::While {
        loop_variables,
        statements: perform_inline_rewrite_on_function_stmts(
          statements,
          current_fn_name,
          functions_that_can_be_inlined,
          heap,
        ),
        break_collector,
      }]
    }

    _ => vec![stmt],
  }
}

fn perform_inline_rewrite_on_function_stmts(
  statements: Vec<Statement>,
  current_fn_name: &FunctionName,
  functions_that_can_be_inlined: &HashMap<FunctionName, Function>,
  heap: &mut Heap,
) -> Vec<Statement> {
  statements
    .into_iter()
    .flat_map(|s| {
      perform_inline_rewrite_on_function_stmt(
        s,
        current_fn_name,
        functions_that_can_be_inlined,
        heap,
      )
    })
    .collect()
}

fn perform_inline_rewrite_on_function(
  function: Function,
  functions_that_can_be_inlined: &HashMap<FunctionName, Function>,
  heap: &mut Heap,
) -> Function {
  let body = perform_inline_rewrite_on_function_stmts(
    function.body,
    &function.name,
    functions_that_can_be_inlined,
    heap,
  );
  Function {
    name: function.name,
    parameters: function.parameters.clone(),
    type_: function.type_.clone(),
    body,
    return_value: function.return_value,
  }
}

pub(super) fn optimize_functions(functions: Vec<Function>, heap: &mut Heap) -> Vec<Function> {
  let mut temp_functions = functions;
  for _ in 0..5 {
    let estimator_result = estimator::get_functions_to_inline(&temp_functions);
    if estimator_result.functions_that_can_be_inlined.is_empty() {
      return temp_functions;
    }
    let mut functions_that_can_be_inlined = HashMap::new();
    let mut all_other_functions = vec![];
    let mut names = vec![];
    for f in temp_functions {
      names.push(f.name);
      if estimator_result.functions_that_can_be_inlined.contains(&f.name) {
        functions_that_can_be_inlined.insert(f.name, f);
      } else {
        all_other_functions.push(f);
      }
    }
    let mut inlined = vec![];
    for f in all_other_functions {
      if estimator_result.functions_that_can_perform_inlining.contains(&f.name) {
        inlined.push(perform_inline_rewrite_on_function(f, &functions_that_can_be_inlined, heap))
      } else {
        inlined.push(f);
      }
    }
    for f in functions_that_can_be_inlined.values() {
      inlined.push(perform_inline_rewrite_on_function(
        f.clone(),
        &functions_that_can_be_inlined,
        heap,
      ))
    }
    inlined.sort_by(|a, b| a.name.cmp(&b.name));
    temp_functions = inlined;
  }
  temp_functions
}
