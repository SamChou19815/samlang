use super::loop_induction_analysis::{
  merge_invariant_multiplication_for_loop_optimization, GeneralBasicInductionVariable,
  OptimizableWhileLoop,
};
use crate::{
  ast::hir::{Expression, Operator, Statement, INT_TYPE},
  Heap,
};
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
  heap: &mut Heap,
) -> LoopStrengthReductionOptimizationResult {
  let mut basic_induction_variable_map = HashMap::from([(
    basic_induction_variable_with_loop_guard.name,
    basic_induction_variable_with_loop_guard.as_general_basic_induction_variable(),
  )]);
  for v in &general_induction_variables {
    basic_induction_variable_map.insert(v.name, v.clone());
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
      let new_initial_value_temp_temporary = heap.alloc_temp_str();
      let new_initial_value_name = heap.alloc_temp_str();
      prefix_statements.push(Statement::Binary(Statement::binary_flexible_unwrapped(
        new_initial_value_temp_temporary,
        Operator::MUL,
        derived_induction_variable.multiplier.to_expression(),
        associated_basic_induction_variable.initial_value.clone(),
      )));
      prefix_statements.push(Statement::Binary(Statement::binary_flexible_unwrapped(
        new_initial_value_name,
        Operator::PLUS,
        derived_induction_variable.immediate.to_expression(),
        Expression::var_name(new_initial_value_temp_temporary, INT_TYPE),
      )));
      new_general_induction_variables.push(GeneralBasicInductionVariable {
        name: derived_induction_variable.name,
        initial_value: Expression::var_name(new_initial_value_name, INT_TYPE),
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
    ast::hir::{VariableName, INT_TYPE, ONE},
    optimization::loop_induction_analysis::{
      BasicInductionVariableWithLoopGuard, DerivedInductionVariableWithName,
      GeneralBasicInductionVariable, GuardOperator, OptimizableWhileLoop,
      PotentialLoopInvariantExpression,
    },
    Heap,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();

    let super::LoopStrengthReductionOptimizationResult {
      prefix_statements,
      optimizable_while_loop,
    } = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: heap.alloc_str("i"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: heap.alloc_str("j"),
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            heap.alloc_str("c"),
            INT_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![
          DerivedInductionVariableWithName {
            name: heap.alloc_str("x"),
            base_name: heap.alloc_str("i"),
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
              heap.alloc_str("a"),
              INT_TYPE,
            )),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new(
              heap.alloc_str("b"),
              INT_TYPE,
            )),
          },
          DerivedInductionVariableWithName {
            name: heap.alloc_str("y"),
            base_name: heap.alloc_str("j"),
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
              heap.alloc_str("a"),
              INT_TYPE,
            )),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new(
              heap.alloc_str("b"),
              INT_TYPE,
            )),
          },
        ],
        statements: vec![],
        break_collector: None,
      },
      heap,
    );

    assert_eq!(
      "let _t10: int = (a: int) * 1;\nlet _t11: int = (_t10: int) + (b: int);",
      prefix_statements.iter().map(|s| s.debug_print(heap)).join("\n")
    );
    assert_eq!(
      vec![
        "{name: j, initial_value: 1, increment_amount: (c: int)}",
        "{name: x, initial_value: (_t11: int), increment_amount: (a: int)}",
      ],
      optimizable_while_loop
        .general_induction_variables
        .iter()
        .map(|v| v.debug_print(heap))
        .collect_vec()
    );
    assert_eq!(
      vec!["{name: y, base_name: j, multiplier: (a: int), immediate: (b: int)}",],
      optimizable_while_loop
        .derived_induction_variables
        .iter()
        .map(|v| v.debug_print(heap))
        .collect_vec()
    );
  }
}
