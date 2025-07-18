use super::loop_induction_analysis::{
  BasicInductionVariableWithLoopGuard, GuardOperator, OptimizableWhileLoop,
  PotentialLoopInvariantExpression,
};
use samlang_ast::{
  hir::BinaryOperator,
  mir::{Binary, Expression, INT_32_TYPE, Statement, ZERO},
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
  let count =
    difference / guard_increment_amount + ((difference % guard_increment_amount != 0) as i32);
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
  heap: &mut samlang_heap::Heap,
) -> Option<Vec<Statement>> {
  let BasicInductionVariableWithLoopGuard {
    name: basic_induction_variable_with_loop_guard_name,
    initial_value: Expression::Int32Literal(initial_guard_value),
    increment_amount: PotentialLoopInvariantExpression::Int(guard_increment_amount),
    guard_operator,
    guard_expression: PotentialLoopInvariantExpression::Int(guarded_value),
  } = &optimizable_while_loop.basic_induction_variable_with_loop_guard
  else {
    return None;
  };
  if !optimizable_while_loop.loop_variables_that_are_not_basic_induction_variables.is_empty()
    || !optimizable_while_loop.derived_induction_variables.is_empty()
    || !optimizable_while_loop.statements.is_empty()
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
          name: *n,
          operator: BinaryOperator::PLUS,
          e1: Expression::i32(basic_induction_variable_with_loop_guard_final_value),
          e2: ZERO,
        })]);
      }
      (n, t, v)
    } else {
      // Now we know that the break value is a constant, so we can directly return the assignment
      // without looping around.
      return Some(vec![Statement::Binary(Binary {
        name: *n,
        operator: BinaryOperator::PLUS,
        e1: *e,
        e2: ZERO,
      })]);
    }
  } else {
    // Now we know there is nothing to get from this loop, and the loop has no side effects.
    // Therefore, it is safe to remove everything.
    return Some(Vec::new());
  };
  if let Some(relevant_general_induction_variable) = optimizable_while_loop
    .general_induction_variables
    .iter()
    .find(|v| v.name.eq(&break_collector.2.name))
  {
    let increment_temporary = heap.alloc_temp_str();
    Some(vec![
      Statement::Binary(Statement::binary_flexible_unwrapped(
        increment_temporary,
        BinaryOperator::MUL,
        relevant_general_induction_variable.increment_amount.to_expression(),
        Expression::i32(num_of_loop_iterations),
      )),
      Statement::Binary(Statement::binary_flexible_unwrapped(
        *break_collector.0,
        BinaryOperator::PLUS,
        relevant_general_induction_variable.initial_value,
        Expression::var_name(increment_temporary, INT_32_TYPE),
      )),
    ])
  } else {
    // Now we know that the break value is a constant, so we can directly return the assignment
    // without looping around.
    Some(vec![Statement::Binary(Binary {
      name: *break_collector.0,
      operator: BinaryOperator::PLUS,
      e1: Expression::Variable(*break_collector.2),
      e2: ZERO,
    })])
  }
}

#[cfg(test)]
mod tests {
  use super::super::loop_induction_analysis::{
    BasicInductionVariableWithLoopGuard, GeneralBasicInductionVariable, GuardOperator,
    OptimizableWhileLoop, PotentialLoopInvariantExpression,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{Expression, INT_32_TYPE, Statement, SymbolTable, VariableName, ZERO};
  use samlang_heap::{Heap, PStr};

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

  fn assert_rejected(optimizable_while_loop: OptimizableWhileLoop, heap: &mut Heap) {
    assert!(super::optimize(&optimizable_while_loop, heap).is_none());
  }

  #[test]
  fn rejection_tests() {
    let heap = &mut Heap::new();

    assert_rejected(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: Expression::var_name(PStr::LOWER_A, INT_32_TYPE),
          increment_amount: PotentialLoopInvariantExpression::Int(0),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(0),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: None,
      },
      heap,
    );

    assert_rejected(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(0),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(0),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: vec![Statement::While {
          loop_variables: Vec::new(),
          statements: Vec::new(),
          break_collector: None,
        }],
        break_collector: None,
      },
      heap,
    );

    assert_rejected(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(0),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(1),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: None,
      },
      heap,
    );
  }

  fn assert_optimized(
    optimizable_while_loop: OptimizableWhileLoop,
    heap: &mut Heap,
    expected: &str,
  ) {
    assert_eq!(
      expected,
      super::optimize(&optimizable_while_loop, heap)
        .unwrap()
        .iter()
        .map(|s| s.debug_print(heap, &SymbolTable::new()))
        .join("\n")
    );
  }

  #[test]
  fn optimizable_tests() {
    let heap = &mut Heap::new();

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(0),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(0),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: None,
      },
      heap,
      "",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: Expression::i32(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: Some((heap.alloc_str_for_test("bc"), INT_32_TYPE, Expression::i32(3))),
      },
      heap,
      "let bc = 3 + 0;",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: Expression::i32(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: Vec::new(),
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: Some((
          heap.alloc_str_for_test("bc"),
          INT_32_TYPE,
          Expression::var_name(PStr::LOWER_I, INT_32_TYPE),
        )),
      },
      heap,
      "let bc = 20 + 0;",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: Expression::i32(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: PStr::LOWER_J,
          initial_value: Expression::var_name(heap.alloc_str_for_test("j_init"), INT_32_TYPE),
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            heap.alloc_str_for_test("outside"),
            INT_32_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: Some((
          heap.alloc_str_for_test("bc"),
          INT_32_TYPE,
          Expression::var_name(PStr::LOWER_J, INT_32_TYPE),
        )),
      },
      heap,
      "let _t0 = (outside: int) * 15;\nlet bc = (j_init: int) + (_t0: int);",
    );

    assert_optimized(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: PStr::LOWER_I,
          initial_value: Expression::i32(5),
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(20),
        },
        general_induction_variables: vec![GeneralBasicInductionVariable {
          name: PStr::LOWER_J,
          initial_value: Expression::var_name(heap.alloc_str_for_test("j_init"), INT_32_TYPE),
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            heap.alloc_str_for_test("outside"),
            INT_32_TYPE,
          )),
        }],
        loop_variables_that_are_not_basic_induction_variables: Vec::new(),
        derived_induction_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: Some((
          heap.alloc_str_for_test("bc"),
          INT_32_TYPE,
          Expression::var_name(heap.alloc_str_for_test("aa"), INT_32_TYPE),
        )),
      },
      heap,
      "let bc = (aa: int) + 0;",
    );
  }
}
