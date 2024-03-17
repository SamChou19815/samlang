use super::loop_induction_analysis::{
  merge_invariant_multiplication_for_loop_optimization, GeneralBasicInductionVariable,
  OptimizableWhileLoop,
};
use samlang_ast::{
  hir::BinaryOperator,
  mir::{Expression, Statement, INT_TYPE},
};
use samlang_heap::Heap;
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
        BinaryOperator::MUL,
        derived_induction_variable.multiplier.to_expression(),
        associated_basic_induction_variable.initial_value,
      )));
      prefix_statements.push(Statement::Binary(Statement::binary_flexible_unwrapped(
        new_initial_value_name,
        BinaryOperator::PLUS,
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
  use super::super::loop_induction_analysis::{
    BasicInductionVariableWithLoopGuard, DerivedInductionVariableWithName,
    GeneralBasicInductionVariable, GuardOperator, OptimizableWhileLoop,
    PotentialLoopInvariantExpression,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{SymbolTable, VariableName, INT_TYPE, ONE};
  use samlang_heap::{Heap, PStr};

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    let super::LoopStrengthReductionOptimizationResult {
      prefix_statements,
      optimizable_while_loop,
    } = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: PStr::LOWER_J,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            PStr::LOWER_C,
            INT_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![
          DerivedInductionVariableWithName {
            name: heap.alloc_str_for_test("x"),
            base_name: PStr::LOWER_I,
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
              PStr::LOWER_A,
              INT_TYPE,
            )),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new(
              PStr::LOWER_B,
              INT_TYPE,
            )),
          },
          DerivedInductionVariableWithName {
            name: heap.alloc_str_for_test("y"),
            base_name: PStr::LOWER_J,
            multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
              PStr::LOWER_A,
              INT_TYPE,
            )),
            immediate: PotentialLoopInvariantExpression::Var(VariableName::new(
              PStr::LOWER_B,
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
      "let _t0 = (a: int) * 1;\nlet _t1 = (b: int) + (_t0: int);",
      prefix_statements.iter().map(|s| s.debug_print(heap, &SymbolTable::new())).join("\n")
    );
    assert_eq!(
      vec![
        "{name: j, initial_value: 1, increment_amount: (c: int)}",
        "{name: x, initial_value: (_t1: int), increment_amount: (a: int)}",
      ],
      optimizable_while_loop
        .general_induction_variables
        .iter()
        .map(|v| v.debug_print(heap, table))
        .collect_vec()
    );
    assert_eq!(
      vec!["{name: y, base_name: j, multiplier: (a: int), immediate: (b: int)}",],
      optimizable_while_loop
        .derived_induction_variables
        .iter()
        .map(|v| v.debug_print(heap, table))
        .collect_vec()
    );
  }
}
