use super::loop_induction_analysis::{
  merge_invariant_multiplication_for_loop_optimization, BasicInductionVariableWithLoopGuard,
  GuardOperator, OptimizableWhileLoop, PotentialLoopInvariantExpression,
};
use crate::{
  ast::hir::Operator,
  ast::mir::{Callee, Expression, Statement, VariableName, INT_TYPE},
  Heap,
};
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
    Statement::Cast { name: _, type_: _, assigned_expression } => {
      expr_uses_basic_induction_var(assigned_expression, v)
    }
    Statement::StructInit { struct_variable_name: _, type_name: _, expression_list } => {
      expression_list.iter().any(|e| expr_uses_basic_induction_var(e, v))
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name: _,
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
      .map(|v| expr_uses_basic_induction_var(&v.2, &l.basic_induction_variable_with_loop_guard))
      .unwrap_or(false)
}

pub(super) fn optimize(
  optimizable_while_loop: OptimizableWhileLoop,
  heap: &mut Heap,
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

  let new_initial_value_temp_temporary = heap.alloc_temp_str();
  let new_initial_value_name = heap.alloc_temp_str();
  let new_guard_value_temp_temporary = heap.alloc_temp_str();
  let new_guard_value_name = heap.alloc_temp_str();
  let prefix_statements = vec![
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_initial_value_temp_temporary,
      Operator::MUL,
      only_relevant_induction_loop_variables.multiplier.to_expression(),
      optimizable_while_loop.basic_induction_variable_with_loop_guard.initial_value,
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_initial_value_name,
      Operator::PLUS,
      only_relevant_induction_loop_variables.immediate.to_expression(),
      Expression::var_name(new_initial_value_temp_temporary, INT_TYPE),
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_guard_value_temp_temporary,
      Operator::MUL,
      only_relevant_induction_loop_variables.multiplier.to_expression(),
      optimizable_while_loop
        .basic_induction_variable_with_loop_guard
        .guard_expression
        .to_expression(),
    )),
    Statement::Binary(Statement::binary_flexible_unwrapped(
      new_guard_value_name,
      Operator::PLUS,
      only_relevant_induction_loop_variables.immediate.to_expression(),
      Expression::var_name(new_guard_value_temp_temporary, INT_TYPE),
    )),
  ];

  let basic_induction_variable_with_loop_guard = BasicInductionVariableWithLoopGuard {
    name: only_relevant_induction_loop_variables.name,
    initial_value: Expression::var_name(new_initial_value_name, INT_TYPE),
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
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, FunctionName, GenenalLoopVariable, Statement, Type, VariableName,
      INT_TYPE, ONE, ZERO,
    },
    common::{well_known_pstrs, Heap},
    optimization::loop_induction_analysis::{
      BasicInductionVariableWithLoopGuard, DerivedInductionVariableWithName, GuardOperator,
      OptimizableWhileLoop, PotentialLoopInvariantExpression,
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn rejection_tests() {
    let heap = &mut Heap::new();

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_A,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE)
        }],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: None
      },
      heap,
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![],
        derived_induction_variables: vec![],
        statements: vec![],
        break_collector: Some((
          well_known_pstrs::LOWER_A,
          INT_TYPE,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE)
        ))
      },
      heap,
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
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
            name: well_known_pstrs::LOWER_A,
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 3
          },
          Statement::binary(well_known_pstrs::LOWER_A, Operator::NE, ZERO, ZERO),
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)]
            }],
            s2: vec![Statement::ClosureInit {
              closure_variable_name: well_known_pstrs::LOWER_A,
              closure_type_name: heap.alloc_str_for_test("I"),
              function_name: FunctionName::new(
                well_known_pstrs::LOWER_A,
                Type::new_fn_unwrapped(vec![], INT_TYPE)
              ),
              context: ZERO
            }],
            final_assignments: vec![(well_known_pstrs::LOWER_A, INT_TYPE, ZERO, ZERO)]
          },
          Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: well_known_pstrs::LOWER_A,
              type_: INT_TYPE,
              initial_value: ZERO,
              loop_value: ZERO
            }],
            statements: vec![
              Statement::Cast {
                name: well_known_pstrs::LOWER_A,
                type_: INT_TYPE,
                assigned_expression: ZERO,
              },
              Statement::StructInit {
                struct_variable_name: well_known_pstrs::LOWER_A,
                type_name: heap.alloc_str_for_test("I"),
                expression_list: vec![ZERO]
              }
            ],
            break_collector: None
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              well_known_pstrs::LOWER_A,
              Type::new_fn_unwrapped(vec![], INT_TYPE)
            )),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: None
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(well_known_pstrs::LOWER_A, INT_TYPE)),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: None
          },
        ],
        break_collector: None
      },
      heap,
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE)
        }],
        derived_induction_variables: vec![
          DerivedInductionVariableWithName {
            name: heap.alloc_str_for_test("tmp_j"),
            base_name: well_known_pstrs::LOWER_I,
            multiplier: PotentialLoopInvariantExpression::Int(3),
            immediate: PotentialLoopInvariantExpression::Int(5)
          },
          DerivedInductionVariableWithName {
            name: heap.alloc_str_for_test("tmp_k"),
            base_name: well_known_pstrs::LOWER_I,
            multiplier: PotentialLoopInvariantExpression::Int(3),
            immediate: PotentialLoopInvariantExpression::Int(5)
          }
        ],
        statements: vec![],
        break_collector: None
      },
      heap,
    )
    .is_err());

    assert!(super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            well_known_pstrs::LOWER_A,
            INT_TYPE
          )),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: heap.alloc_str_for_test("tmp_j"),
          base_name: well_known_pstrs::LOWER_I,
          multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
            well_known_pstrs::LOWER_A,
            INT_TYPE
          )),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      heap,
    )
    .is_err());
  }

  #[test]
  fn optimizable_test_1() {
    let heap = &mut Heap::new();

    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(2),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: heap.alloc_str_for_test("tmp_j"),
          base_name: well_known_pstrs::LOWER_I,
          multiplier: PotentialLoopInvariantExpression::Int(3),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      heap,
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _t0 = 3 * 1;",
        "let _t1 = (_t0: int) + 5;",
        "let _t2 = 10 * 3;",
        "let _t3 = (_t2: int) + 5;",
        "{name: tmp_j, initial_value: (_t1: int), increment_amount: 6, guard_operator: LT, guard_expression: (_t3: int)}",
      ],
      optimized
        .prefix_statements
        .iter()
        .map(|s| s.debug_print(heap))
        .chain(vec![optimized
          .optimizable_while_loop
          .basic_induction_variable_with_loop_guard
          .debug_print(heap)])
        .collect_vec()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }

  #[test]
  fn optimizable_test_2() {
    let heap = &mut Heap::new();

    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: heap.alloc_str_for_test("tmp_j"),
          base_name: well_known_pstrs::LOWER_I,
          multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
            well_known_pstrs::LOWER_A,
            INT_TYPE,
          )),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      heap,
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _t0 = (a: int) * 1;",
        "let _t1 = (_t0: int) + 5;",
        "let _t2 = (a: int) * 10;",
        "let _t3 = (_t2: int) + 5;",
        "{name: tmp_j, initial_value: (_t1: int), increment_amount: (a: int), guard_operator: LT, guard_expression: (_t3: int)}",
      ],
      optimized.prefix_statements
        .iter()
        .map(|s| s.debug_print(heap))
        .chain(vec![
          optimized.optimizable_while_loop.basic_induction_variable_with_loop_guard.debug_print(heap)
        ])
        .collect_vec()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }

  #[test]
  fn optimizable_test_3() {
    let heap = &mut Heap::new();

    let optimized = super::optimize(
      OptimizableWhileLoop {
        basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard {
          name: well_known_pstrs::LOWER_I,
          initial_value: ONE,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            well_known_pstrs::LOWER_A,
            INT_TYPE,
          )),
          guard_operator: GuardOperator::LT,
          guard_expression: PotentialLoopInvariantExpression::Int(10),
        },
        general_induction_variables: vec![],
        loop_variables_that_are_not_basic_induction_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        }],
        derived_induction_variables: vec![DerivedInductionVariableWithName {
          name: heap.alloc_str_for_test("tmp_j"),
          base_name: well_known_pstrs::LOWER_I,
          multiplier: PotentialLoopInvariantExpression::Int(1),
          immediate: PotentialLoopInvariantExpression::Int(5),
        }],
        statements: vec![],
        break_collector: None,
      },
      heap,
    )
    .ok()
    .unwrap();

    assert_eq!(
      vec![
        "let _t0 = 1 * 1;",
        "let _t1 = (_t0: int) + 5;",
        "let _t2 = 10 * 1;",
        "let _t3 = (_t2: int) + 5;",
        "{name: tmp_j, initial_value: (_t1: int), increment_amount: (a: int), guard_operator: LT, guard_expression: (_t3: int)}",
      ],
      optimized.prefix_statements
        .iter()
        .map(|s| s.debug_print(heap))
        .chain(vec![
          optimized.optimizable_while_loop.basic_induction_variable_with_loop_guard.debug_print(heap)
        ])
        .collect_vec()
    );
    assert!(optimized.optimizable_while_loop.derived_induction_variables.is_empty());
  }
}
