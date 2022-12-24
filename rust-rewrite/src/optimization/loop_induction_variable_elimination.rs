use super::{
  loop_induction_analysis::{
    merge_invariant_multiplication_for_loop_optimization, BasicInductionVariableWithLoopGuard,
    GuardOperator, OptimizableWhileLoop, PotentialLoopInvariantExpression,
  },
  optimization_common::ResourceAllocator,
};
use crate::ast::hir::{Callee, Expression, Operator, Statement, VariableName, INT_TYPE};
use itertools::Itertools;

pub(super) struct LoopInductionVariableEliminationResult {
  pub(super) prefix_statements: Vec<Statement>,
  pub(super) optimizable_while_loop: OptimizableWhileLoop,
}

fn expr_uses_basic_induction_var(
  expr: &Expression,
  basic_induction_var: &BasicInductionVariableWithLoopGuard,
) -> bool {
  expr.as_variable().map(|v| v.name.eq(&basic_induction_var.name)).unwrap_or(false)
}

fn stmt_uses_basic_induction_var(
  stmt: &Statement,
  v: &BasicInductionVariableWithLoopGuard,
) -> bool {
  match stmt {
    Statement::Binary(b) => {
      expr_uses_basic_induction_var(&b.e1, v) || expr_uses_basic_induction_var(&b.e2, v)
    }
    Statement::IndexedAccess { name: _, type_: _, pointer_expression, index: _ } => {
      expr_uses_basic_induction_var(pointer_expression, v)
    }
    Statement::Call { callee, arguments, return_type: _, return_collector: _ } => {
      let in_callee = if let Callee::Variable(var) = callee { var.name.eq(&v.name) } else { false };
      in_callee || arguments.iter().any(|e| expr_uses_basic_induction_var(e, v))
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      expr_uses_basic_induction_var(condition, v)
        || stmts_uses_basic_induction_var(s1, v)
        || stmts_uses_basic_induction_var(s2, v)
        || final_assignments.iter().any(|(_, _, e1, e2)| {
          expr_uses_basic_induction_var(e1, v) || expr_uses_basic_induction_var(e2, v)
        })
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      expr_uses_basic_induction_var(condition, v) || stmts_uses_basic_induction_var(statements, v)
    }
    Statement::Break(e) => expr_uses_basic_induction_var(e, v),
    Statement::While { loop_variables, statements, break_collector: _ } => {
      loop_variables.iter().any(|loop_var| {
        expr_uses_basic_induction_var(&loop_var.initial_value, v)
          || expr_uses_basic_induction_var(&loop_var.loop_value, v)
      }) || stmts_uses_basic_induction_var(statements, v)
    }
    Statement::StructInit { struct_variable_name: _, type_: _, expression_list } => {
      expression_list.iter().any(|e| expr_uses_basic_induction_var(e, v))
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type: _,
      function_name: _,
      context,
    } => expr_uses_basic_induction_var(context, v),
  }
}

fn stmts_uses_basic_induction_var(
  stmts: &[Statement],
  v: &BasicInductionVariableWithLoopGuard,
) -> bool {
  stmts.iter().any(|stmt| stmt_uses_basic_induction_var(stmt, v))
}

fn optimizable_while_loop_uses_induction_var(l: &OptimizableWhileLoop) -> bool {
  stmts_uses_basic_induction_var(&l.statements, &l.basic_induction_variable_with_loop_guard)
    || l.loop_variables_that_are_not_basic_induction_variables.iter().any(|v| {
      expr_uses_basic_induction_var(&v.loop_value, &l.basic_induction_variable_with_loop_guard)
    })
    || l
      .break_collector
      .clone()
      .map(|v| expr_uses_basic_induction_var(&v.2, &l.basic_induction_variable_with_loop_guard))
      .unwrap_or(false)
}

pub(super) fn optimize(
  optimizable_while_loop: OptimizableWhileLoop,
  allocator: &mut ResourceAllocator,
) -> Result<LoopInductionVariableEliminationResult, OptimizableWhileLoop> {
  if optimizable_while_loop_uses_induction_var(&optimizable_while_loop) {
    return Result::Err(optimizable_while_loop);
  }

  let relevant_derived_induction_variables = optimizable_while_loop
    .derived_induction_variables
    .iter()
    .filter(|v| {
      v.base_name.eq(&optimizable_while_loop.basic_induction_variable_with_loop_guard.name)
    })
    .collect_vec();
  if relevant_derived_induction_variables.len() != 1 {
    return Result::Err(optimizable_while_loop);
  }
  let only_relevant_induction_loop_variables = relevant_derived_induction_variables[0];
  let Some(added_invariant_expression_in_loop) =
    merge_invariant_multiplication_for_loop_optimization(
      &optimizable_while_loop.basic_induction_variable_with_loop_guard.increment_amount,
      &only_relevant_induction_loop_variables.multiplier,
    )
  else {
    return Result::Err(optimizable_while_loop);
  };

  let new_initial_value_temp_temporary = allocator.alloc_loop_temp();
  let new_initial_value_name = allocator.alloc_loop_temp();
  let new_guard_value_temp_temporary = allocator.alloc_loop_temp();
  let new_guard_value_name = allocator.alloc_loop_temp();
  let prefix_statements = vec![
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_initial_value_temp_temporary.clone(),
      Operator::MUL,
      only_relevant_induction_loop_variables.multiplier.to_expression(),
      optimizable_while_loop.basic_induction_variable_with_loop_guard.initial_value.clone(),
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_initial_value_name.clone(),
      Operator::PLUS,
      only_relevant_induction_loop_variables.immediate.to_expression(),
      Expression::var_name_str(new_initial_value_temp_temporary, INT_TYPE),
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_guard_value_temp_temporary.clone(),
      Operator::MUL,
      only_relevant_induction_loop_variables.multiplier.to_expression(),
      optimizable_while_loop
        .basic_induction_variable_with_loop_guard
        .guard_expression
        .to_expression(),
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_guard_value_name.clone(),
      Operator::PLUS,
      only_relevant_induction_loop_variables.immediate.to_expression(),
      Expression::var_name_str(new_guard_value_temp_temporary, INT_TYPE),
    )),
  ];

  let basic_induction_variable_with_loop_guard = BasicInductionVariableWithLoopGuard {
    name: only_relevant_induction_loop_variables.name.clone(),
    initial_value: Expression::var_name_str(new_initial_value_name, INT_TYPE),
    increment_amount: added_invariant_expression_in_loop,
    guard_operator: GuardOperator::LT,
    guard_expression: PotentialLoopInvariantExpression::Var(VariableName {
      name: new_guard_value_name,
      type_: INT_TYPE,
    }),
  };
  let derived_induction_variables = optimizable_while_loop
    .derived_induction_variables
    .iter()
    .filter(|v| v.name.ne(&only_relevant_induction_loop_variables.name))
    .cloned()
    .collect_vec();

  let OptimizableWhileLoop {
    basic_induction_variable_with_loop_guard: _,
    general_induction_variables,
    loop_variables_that_are_not_basic_induction_variables,
    derived_induction_variables: _,
    statements,
    break_collector,
  } = optimizable_while_loop;

  Result::Ok(LoopInductionVariableEliminationResult {
    prefix_statements,
    optimizable_while_loop: OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard,
      general_induction_variables,
      loop_variables_that_are_not_basic_induction_variables,
      derived_induction_variables,
      statements,
      break_collector,
    },
  })
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
    optimization::{
      loop_induction_analysis::{
        BasicInductionVariableWithLoopGuard, DerivedInductionVariableWithName, GuardOperator,
        OptimizableWhileLoop, PotentialLoopInvariantExpression,
      },
      optimization_common::ResourceAllocator,
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn rejection_tests() {
    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs(""),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("i", INT_TYPE)
        }],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: None
      },
      &mut ResourceAllocator::new()
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((rcs(""), INT_TYPE, Expression::var_name("i", INT_TYPE)))
      },
      &mut ResourceAllocator::new()
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![
          Statement::IndexedAccess {
            name: rcs(""),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3
          },
          Statement::binary("", Operator::NE, ZERO, ZERO),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)]
            }],
            s2: vec![Statement::ClosureInit {
              closure_variable_name: rcs(""),
              closure_type: Type::new_id_no_targs_unwrapped("I"),
              function_name: FunctionName::new("", Type::new_fn_unwrapped(vec![], INT_TYPE)),
              context: ZERO
            }],
            final_assignments: vec![(rcs(""), INT_TYPE, ZERO, ZERO)]
          },
          Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: rcs(""),
              type_: INT_TYPE,
              initial_value: ZERO,
              loop_value: ZERO
            }],
            statements: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![ZERO]
            }],
            break_collector: None
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "",
              Type::new_fn_unwrapped(vec![], INT_TYPE)
            )),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: None
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new("", INT_TYPE)),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: None
          },
        ],
        break_collector: None
      },
      &mut ResourceAllocator::new()
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE)
        }],
        derived_induction_variables: vec![
          DerivedInductionVariableWithName {
            name: rcs("tmp_j"),
            base_name: rcs("i"),
            multiplier: PotentialLoopInvariantExpression::Int(3),
            immediate: PotentialLoopInvariantExpression::Int(5)
          },
          DerivedInductionVariableWithName {
            name: rcs("tmp_k"),
            base_name: rcs("i"),
            multiplier: PotentialLoopInvariantExpression::Int(3),
            immediate: PotentialLoopInvariantExpression::Int(5)
          }
        ],
        statements: vec![],
        break_collector: None
      },
      &mut ResourceAllocator::new()
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new("", INT_TYPE)),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: rcs("tmp_j"),
          base_name: rcs("i"),
          multiplier: PotentialLoopInvariantExpression::Var(VariableName::new("a", INT_TYPE)),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      &mut ResourceAllocator::new(),
    )
    .is_err());
  }

  #[test]
  fn optimizable_test_1() {
    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: rcs("tmp_j"),
          base_name: rcs("i"),
          multiplier: PotentialLoopInvariantExpression::Int(3),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      &mut ResourceAllocator::new(),
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _loop_0: int = 3 * 1;",
        "let _loop_1: int = (_loop_0: int) + 5;",
        "let _loop_2: int = 10 * 3;",
        "let _loop_3: int = (_loop_2: int) + 5;",
      ],
      optimized.prefix_statements.iter().map(Statement::debug_print).collect_vec()
    );
    assert_eq!(
      "{name: tmp_j, initial_value: (_loop_1: int), increment_amount: 6, guard_operator: LT, guard_expression: (_loop_3: int)}",
      optimized.optimizable_while_loop.basic_induction_variable_with_loop_guard.to_string()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }

  #[test]
  fn optimizable_test_2() {
    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: rcs("tmp_j"),
          base_name: rcs("i"),
          multiplier: PotentialLoopInvariantExpression::Var(VariableName::new("a", INT_TYPE)),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      &mut ResourceAllocator::new(),
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _loop_0: int = (a: int) * 1;",
        "let _loop_1: int = (_loop_0: int) + 5;",
        "let _loop_2: int = (a: int) * 10;",
        "let _loop_3: int = (_loop_2: int) + 5;",
      ],
      optimized.prefix_statements.iter().map(Statement::debug_print).collect_vec()
    );
    assert_eq!(
      "{name: tmp_j, initial_value: (_loop_1: int), increment_amount: (a: int), guard_operator: LT, guard_expression: (_loop_3: int)}",
      optimized.optimizable_while_loop.basic_induction_variable_with_loop_guard.to_string()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }

  #[test]
  fn optimizable_test_3() {
    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new("a", INT_TYPE)),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: rcs("tmp_j"),
          base_name: rcs("i"),
          multiplier: PotentialLoopInvariantExpression::Int(1),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      &mut ResourceAllocator::new(),
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _loop_0: int = 1 * 1;",
        "let _loop_1: int = (_loop_0: int) + 5;",
        "let _loop_2: int = 10 * 1;",
        "let _loop_3: int = (_loop_2: int) + 5;",
      ],
      optimized.prefix_statements.iter().map(Statement::debug_print).collect_vec()
    );
    assert_eq!(
      "{name: tmp_j, initial_value: (_loop_1: int), increment_amount: (a: int), guard_operator: LT, guard_expression: (_loop_3: int)}",
      optimized.optimizable_while_loop.basic_induction_variable_with_loop_guard.to_string()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }
}
