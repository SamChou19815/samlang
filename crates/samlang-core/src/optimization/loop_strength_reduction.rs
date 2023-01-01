use super::{
  loop_induction_analysis::{
    merge_invariant_multiplication_for_loop_optimization, GeneralBasicInductionVariable,
    OptimizableWhileLoop,
  },
  optimization_common::ResourceAllocator,
};
use crate::ast::hir::{Expression, Operator, Statement, INT_TYPE};
use std::collections::HashMap;

pub(super) struct LoopStrengthReductionOptimizationResult {
  pub(super) prefix_statements: Vec<Statement>,
  pub(super) optimizable_while_loop: OptimizableWhileLoop,
}

pub(super) fn optimize(
  OptimizableWhileLoop {
    basic_induction_variable_with_loop_guard,
    general_induction_variables,
    loop_variables_that_are_not_basic_induction_variables,
    derived_induction_variables,
    statements,
    break_collector,
  }: OptimizableWhileLoop,
  allocator: &mut ResourceAllocator,
) -> LoopStrengthReductionOptimizationResult {
  let mut basic_induction_variable_map = HashMap::from([(
    basic_induction_variable_with_loop_guard.name.clone(),
    basic_induction_variable_with_loop_guard.as_general_basic_induction_variable(),
  )]);
  for v in &general_induction_variables {
    basic_induction_variable_map.insert(v.name.clone(), v.clone());
  }
  let mut prefix_statements = vec![];
  let mut new_general_induction_variables = vec![];
  let mut remaining_derived_induction_variables = vec![];
  for derived_induction_variable in derived_induction_variables {
    let associated_basic_induction_variable =
      basic_induction_variable_map.get(&derived_induction_variable.base_name).unwrap();
    if let Some(added_invariant_expression_in_loop) =
      merge_invariant_multiplication_for_loop_optimization(
        &associated_basic_induction_variable.increment_amount,
        &derived_induction_variable.multiplier,
      )
    {
      let new_initial_value_temp_temporary = allocator.alloc_loop_temp();
      let new_initial_value_name = allocator.alloc_loop_temp();
      prefix_statements.push(Statement::Binary(Statement::binary_flexible_unwrapped(
        new_initial_value_temp_temporary.clone(),
        Operator::MUL,
        derived_induction_variable.multiplier.to_expression(),
        associated_basic_induction_variable.initial_value.clone(),
      )));
      prefix_statements.push(Statement::Binary(Statement::binary_flexible_unwrapped(
        new_initial_value_name.clone(),
        Operator::PLUS,
        derived_induction_variable.immediate.to_expression(),
        Expression::var_name_str(new_initial_value_temp_temporary, INT_TYPE),
      )));
      new_general_induction_variables.push(GeneralBasicInductionVariable {
        name: derived_induction_variable.name.clone(),
        initial_value: Expression::var_name_str(new_initial_value_name, INT_TYPE),
        increment_amount: added_invariant_expression_in_loop,
      });
    } else {
      remaining_derived_induction_variables.push(derived_induction_variable);
    }
  }

  LoopStrengthReductionOptimizationResult {
    prefix_statements,
    optimizable_while_loop: OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard,
      general_induction_variables: general_induction_variables
        .into_iter()
        .chain(new_general_induction_variables)
        .collect(),
      loop_variables_that_are_not_basic_induction_variables,
      derived_induction_variables: remaining_derived_induction_variables,
      statements,
      break_collector,
    },
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{Statement, VariableName, INT_TYPE, ONE},
    common::rcs,
    optimization::{
      loop_induction_analysis::{
        BasicInductionVariableWithLoopGuard, DerivedInductionVariableWithName,
        GeneralBasicInductionVariable, GuardOperator, OptimizableWhileLoop,
        PotentialLoopInvariantExpression,
      },
      optimization_common::ResourceAllocator,
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let super::LoopStrengthReductionOptimizationResult {
      prefix_statements,
      optimizable_while_loop,
    } = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: rcs("j"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new("c", INT_TYPE)),
        }],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![
          DerivedInductionVariableWithName {
            name: rcs("x"),
            base_name: rcs("i"),
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new("a", INT_TYPE)),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new("b", INT_TYPE)),
          },
          DerivedInductionVariableWithName {
            name: rcs("y"),
            base_name: rcs("j"),
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new("a", INT_TYPE)),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new("b", INT_TYPE)),
          },
        ],
        statements: vec![],
        break_collector: None,
      },
      &mut ResourceAllocator::new(),
    );

    assert_eq!(
      "let _loop_0: int = (a: int) * 1;\nlet _loop_1: int = (b: int) + (_loop_0: int);",
      prefix_statements.iter().map(Statement::debug_print).join("\n")
    );
    assert_eq!(
      vec![
        "{name: j, initial_value: 1, increment_amount: (c: int)}",
        "{name: x, initial_value: (_loop_1: int), increment_amount: (a: int)}",
      ],
      optimizable_while_loop
        .general_induction_variables
        .iter()
        .map(|v| v.to_string())
        .collect_vec()
    );
    assert_eq!(
      vec!["{name: y, base_name: j, multiplier: (a: int), immediate: (b: int)}",],
      optimizable_while_loop
        .derived_induction_variables
        .iter()
        .map(|v| v.to_string())
        .collect_vec()
    );
  }
}
