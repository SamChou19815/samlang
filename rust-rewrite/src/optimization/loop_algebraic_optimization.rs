use crate::ast::hir::{Binary, Expression, Operator, Statement, INT_TYPE, ZERO};

use super::{
  loop_induction_analysis::{
    BasicInductionVariableWithLoopGuard, GuardOperator, OptimizableWhileLoop,
    PotentialLoopInvariantExpression,
  },
  optimization_common::ResourceAllocator,
};

fn analyze_number_of_iterations_to_break_less_than_guard(
  initial_guard_value: i32,
  guard_increment_amount: i32,
  guarded_value: i32,
) -> Option<i32> {
  // Condition is already satisfied, so it does not loop.
  if initial_guard_value >= guarded_value {
    return Some(0);
  }
  // The guardIncrementAmount does not helps to make any progress,
  // so it can loop forever (until wraparound...)
  if guard_increment_amount <= 0 {
    return None;
  }
  let difference = guarded_value - initial_guard_value;
  let count = difference / guard_increment_amount
    + (if difference % guard_increment_amount == 0 { 0 } else { 1 });
  Some(count)
}

fn analyze_number_of_iterations_to_break_guard(
  initial_guard_value: i32,
  guard_increment_amount: i32,
  operator: GuardOperator,
  guarded_value: i32,
) -> Option<i32> {
  match operator {
    GuardOperator::LT => analyze_number_of_iterations_to_break_less_than_guard(
      initial_guard_value,
      guard_increment_amount,
      guarded_value,
    ),
    GuardOperator::LE => analyze_number_of_iterations_to_break_less_than_guard(
      initial_guard_value,
      guard_increment_amount,
      guarded_value + 1,
    ),
    GuardOperator::GT => analyze_number_of_iterations_to_break_less_than_guard(
      -initial_guard_value,
      -guard_increment_amount,
      -guarded_value,
    ),
    GuardOperator::GE => analyze_number_of_iterations_to_break_less_than_guard(
      -initial_guard_value,
      -guard_increment_amount,
      -(guarded_value - 1),
    ),
  }
}

pub(super) fn optimize(
  optimizable_while_loop: &OptimizableWhileLoop,
  allocator: &mut ResourceAllocator,
) -> Option<Vec<Statement>> {
  let BasicInductionVariableWithLoopGuard {
    name: basic_induction_variable_with_loop_guard_name,
    initial_value: Expression::IntLiteral(initial_guard_value, true),
    increment_amount: PotentialLoopInvariantExpression::Int(guard_increment_amount),
    guard_operator,
    guard_expression: PotentialLoopInvariantExpression::Int(guarded_value),
  } = &optimizable_while_loop.basic_induction_variable_with_loop_guard else {
    return None;
  };
  if optimizable_while_loop.loop_variables_that_are_not_basic_induction_variables.len() > 0
    || optimizable_while_loop.derived_induction_variables.len() > 0
    || optimizable_while_loop.statements.len() > 0
  {
    return None;
  }
  let num_of_loop_iterations = analyze_number_of_iterations_to_break_guard(
    *initial_guard_value,
    *guard_increment_amount,
    *guard_operator,
    *guarded_value,
  )?;
  let break_collector = if let Some((n, t, e)) = &optimizable_while_loop.break_collector {
    if let Expression::Variable(v) = e {
      if v.name.eq(basic_induction_variable_with_loop_guard_name) {
        // We simply want the final value of the basic_induction_variable_with_loop_guard_name.
        let basic_induction_variable_with_loop_guard_final_value =
          *initial_guard_value + *guard_increment_amount * num_of_loop_iterations;
        return Some(vec![Statement::Binary(Binary {
          name: n.clone(),
          type_: t.clone(),
          operator: Operator::PLUS,
          e1: Expression::int(basic_induction_variable_with_loop_guard_final_value),
          e2: ZERO,
        })]);
      }
      (n, t, v)
    } else {
      // Now we know that the break value is a constant, so we can directly return the assignment
      // without looping around.
      return Some(vec![Statement::Binary(Binary {
        name: n.clone(),
        type_: t.clone(),
        operator: Operator::PLUS,
        e1: e.clone(),
        e2: ZERO,
      })]);
    }
  } else {
    // Now we know there is nothing to get from this loop, and the loop has no side effects.
    // Therefore, it is safe to remove everything.
    return Some(vec![]);
  };
  if let Some(relevant_general_induction_variable) = optimizable_while_loop
    .general_induction_variables
    .iter()
    .find(|v| v.name.eq(&break_collector.2.name))
  {
    let increment_temporary = allocator.alloc_loop_temp();
    Some(vec![
      Statement::Binary(Statement::binary_flexible_unwrapped(
        increment_temporary.clone(),
        Operator::MUL,
        relevant_general_induction_variable.increment_amount.to_expression(),
        Expression::int(num_of_loop_iterations),
      )),
      Statement::Binary(Statement::binary_flexible_unwrapped(
        break_collector.0.clone(),
        Operator::PLUS,
        relevant_general_induction_variable.initial_value.clone(),
        Expression::var_name_str(increment_temporary, INT_TYPE),
      )),
    ])
  } else {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    Some(vec![Statement::Binary(Binary {
      name: break_collector.0.clone(),
      type_: break_collector.1.clone(),
      operator: Operator::PLUS,
      e1: Expression::Variable(break_collector.2.clone()),
      e2: ZERO,
    })])
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{Expression, Statement, VariableName, INT_TYPE, ZERO},
    common::rcs,
    optimization::{
      loop_induction_analysis::{
        BasicInductionVariableWithLoopGuard, GeneralBasicInductionVariable, GuardOperator,
        OptimizableWhileLoop, PotentialLoopInvariantExpression,
      },
      optimization_common::ResourceAllocator,
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn analyze_number_of_iterations_to_break_guard_tests() {
    assert_eq!(
      Some(0),
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::LT, 1)
    );
    assert_eq!(
      Some(0),
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::LE, 1)
    );
    assert_eq!(
      Some(0),
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::GT, 3)
    );
    assert_eq!(
      Some(0),
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::GE, 3)
    );

    assert_eq!(
      None,
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::LT, 3)
    );
    assert_eq!(
      None,
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::LE, 3)
    );
    assert_eq!(
      None,
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::GT, 1)
    );
    assert_eq!(
      None,
      super::analyze_number_of_iterations_to_break_guard(2, 0, GuardOperator::GE, 1)
    );

    assert_eq!(
      Some(4),
      super::analyze_number_of_iterations_to_break_guard(2, 2, GuardOperator::LT, 10)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(2, 2, GuardOperator::LT, 11)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(2, 2, GuardOperator::LE, 10)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(2, 2, GuardOperator::LE, 11)
    );
    assert_eq!(
      Some(4),
      super::analyze_number_of_iterations_to_break_guard(10, -2, GuardOperator::GT, 2)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(11, -2, GuardOperator::GT, 2)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(10, -2, GuardOperator::GE, 2)
    );
    assert_eq!(
      Some(5),
      super::analyze_number_of_iterations_to_break_guard(11, -2, GuardOperator::GE, 2)
    );
  }

  fn assert_rejected(optimizable_while_loop: OptimizableWhileLoop) {
    assert!(super::optimize(&optimizable_while_loop, &mut ResourceAllocator::new()).is_none());
  }

  #[test]
  fn rejection_tests() {
    assert_rejected(OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
        name: rcs("i"),
        initial_value: Expression::var_name("a", INT_TYPE),
        increment_amount: PotentialLoopInvariantExpression::Int(0),
        guard_operator: GuardOperator::LT,
        guard_expression: PotentialLoopInvariantExpression::Int(0),
      },
      general_induction_variables: vec![],
      loop_variables_that_are_not_basic_induction_variables: vec![],
      derived_induction_variables: vec![],
      statements: vec![],
      break_collector: None,
    });

    assert_rejected(OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(0),
        guard_operator: GuardOperator::LT,
        guard_expression: PotentialLoopInvariantExpression::Int(0),
      },
      general_induction_variables: vec![],
      loop_variables_that_are_not_basic_induction_variables: vec![],
      derived_induction_variables: vec![],
      statements: vec![Statement::While {
        loop_variables: vec![],
        statements: vec![],
        break_collector: None,
      }],
      break_collector: None,
    });

    assert_rejected(OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(0),
        guard_operator: GuardOperator::LT,
        guard_expression: PotentialLoopInvariantExpression::Int(1),
      },
      general_induction_variables: vec![],
      loop_variables_that_are_not_basic_induction_variables: vec![],
      derived_induction_variables: vec![],
      statements: vec![],
      break_collector: None,
    });
  }

  fn assert_optimized(optimizable_while_loop: OptimizableWhileLoop, expected: &str) {
    assert_eq!(
      expected,
      super::optimize(&optimizable_while_loop, &mut ResourceAllocator::new())
        .unwrap()
        .iter()
        .map(Statement::debug_print)
        .join("\n")
    );
  }

  #[test]
  fn optimizable_tests() {
    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(0),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(0),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: None,
      },
      "",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: Expression::int(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((rcs("bc"), INT_TYPE, Expression::int(3))),
      },
      "let bc: int = 3 + 0;",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: Expression::int(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((rcs("bc"), INT_TYPE, Expression::var_name("i", INT_TYPE))),
      },
      "let bc: int = 20 + 0;",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: Expression::int(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: rcs("j"),
          initial_value: Expression::var_name("j_init", INT_TYPE),
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            "outside", INT_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((rcs("bc"), INT_TYPE, Expression::var_name("j", INT_TYPE))),
      },
      "let _loop_0: int = (outside: int) * 15;\nlet bc: int = (j_init: int) + (_loop_0: int);",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: rcs("i"),
          initial_value: Expression::int(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: rcs("j"),
          initial_value: Expression::var_name("j_init", INT_TYPE),
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            "outside", INT_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((rcs("bc"), INT_TYPE, Expression::var_name("aa", INT_TYPE))),
      },
      "let bc: int = (aa: int) + 0;",
    );
  }
}
