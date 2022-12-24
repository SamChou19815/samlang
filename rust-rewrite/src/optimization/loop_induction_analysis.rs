use super::dead_code_elimination;
use crate::{
  ast::hir::{Binary, Expression, GenenalLoopVariable, Operator, Statement, Type, VariableName},
  common::Str,
};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use std::collections::{HashMap, HashSet};

#[derive(Clone, EnumAsInner)]
pub(super) enum PotentialLoopInvariantExpression {
  Int(i32),
  Var(VariableName),
}

impl PotentialLoopInvariantExpression {
  pub(super) fn to_expression(&self) -> Expression {
    match self {
      PotentialLoopInvariantExpression::Int(i) => Expression::IntLiteral(*i, true),
      PotentialLoopInvariantExpression::Var(n) => Expression::Variable(n.clone()),
    }
  }
}

impl ToString for PotentialLoopInvariantExpression {
  fn to_string(&self) -> String {
    self.to_expression().debug_print()
  }
}

#[derive(Debug, Clone, Copy)]
pub(super) enum GuardOperator {
  LT,
  LE,
  GT,
  GE,
}

impl GuardOperator {
  pub(super) fn invert(&self) -> GuardOperator {
    match self {
      GuardOperator::LT => GuardOperator::GE,
      GuardOperator::LE => GuardOperator::GT,
      GuardOperator::GT => GuardOperator::LE,
      GuardOperator::GE => GuardOperator::LT,
    }
  }

  pub(super) fn to_op(self) -> Operator {
    match self {
      GuardOperator::LT => Operator::LT,
      GuardOperator::LE => Operator::LE,
      GuardOperator::GT => Operator::GT,
      GuardOperator::GE => Operator::GE,
    }
  }
}

pub(super) struct BasicInductionVariableWithLoopGuard {
  pub(super) name: Str,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
  pub(super) guard_operator: GuardOperator,
  pub(super) guard_expression: PotentialLoopInvariantExpression,
}

impl BasicInductionVariableWithLoopGuard {
  pub(super) fn as_general_basic_induction_variable(&self) -> GeneralBasicInductionVariable {
    GeneralBasicInductionVariable {
      name: self.name.clone(),
      initial_value: self.initial_value.clone(),
      increment_amount: self.increment_amount.clone(),
    }
  }
}

impl ToString for BasicInductionVariableWithLoopGuard {
  fn to_string(&self) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}, guard_operator: {:?}, guard_expression: {}}}",
      self.name,
      self.initial_value.debug_print(),
      self.increment_amount.to_string(),
      self.guard_operator,
      self.guard_expression.to_string()
    )
  }
}

#[derive(Clone)]
pub(super) struct GeneralBasicInductionVariable {
  pub(super) name: Str,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
}

impl ToString for GeneralBasicInductionVariable {
  fn to_string(&self) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}}}",
      self.name,
      self.initial_value.debug_print(),
      self.increment_amount.to_string(),
    )
  }
}

#[derive(Clone)]
pub(super) struct GeneralBasicInductionVariableWithLoopValueCollector {
  pub(super) name: Str,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
  pub(super) loop_value_collector: Str,
}

impl ToString for GeneralBasicInductionVariableWithLoopValueCollector {
  fn to_string(&self) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}, loop_value_collector: {}}}",
      self.name,
      self.initial_value.debug_print(),
      self.increment_amount.to_string(),
      self.loop_value_collector
    )
  }
}

#[derive(Clone)]
struct DerivedInductionVariable {
  base_name: Str,
  multiplier: PotentialLoopInvariantExpression,
  immediate: PotentialLoopInvariantExpression,
}

#[derive(Clone)]
pub(super) struct DerivedInductionVariableWithName {
  pub(super) name: Str,
  pub(super) base_name: Str,
  pub(super) multiplier: PotentialLoopInvariantExpression,
  pub(super) immediate: PotentialLoopInvariantExpression,
}

impl ToString for DerivedInductionVariableWithName {
  fn to_string(&self) -> String {
    format!(
      "{{name: {}, base_name: {}, multiplier: {}, immediate: {}}}",
      self.name,
      self.base_name,
      self.multiplier.to_string(),
      self.immediate.to_string(),
    )
  }
}

pub(super) struct OptimizableWhileLoop {
  pub(super) basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard,
  pub(super) general_induction_variables: Vec<GeneralBasicInductionVariable>,
  pub(super) loop_variables_that_are_not_basic_induction_variables: Vec<GenenalLoopVariable>,
  pub(super) derived_induction_variables: Vec<DerivedInductionVariableWithName>,
  pub(super) statements: Vec<Statement>,
  pub(super) break_collector: Option<(Str, Type, Expression)>,
}

fn stmt_contains_break(stmt: &Statement) -> bool {
  match stmt {
    Statement::Binary(_)
    | Statement::IndexedAccess { .. }
    | Statement::Call { .. }
    | Statement::StructInit { .. }
    | Statement::ClosureInit { .. } => false,
    // Although it might contain break, the break never affects the outer loop,
    Statement::While { .. } => false,
    Statement::Break(_) => true,
    Statement::IfElse { condition: _, s1, s2, final_assignments: _ } => {
      stmts_contains_break(s1) || stmts_contains_break(s2)
    }
    Statement::SingleIf { condition: _, invert_condition: _, statements } => {
      stmts_contains_break(statements)
    }
  }
}

fn stmts_contains_break(statements: &[Statement]) -> bool {
  statements.iter().any(stmt_contains_break)
}

fn merge_invariant_addition_for_loop_optimization(
  existing_value: &PotentialLoopInvariantExpression,
  added_value: &PotentialLoopInvariantExpression,
) -> Option<PotentialLoopInvariantExpression> {
  match (existing_value, added_value) {
    (PotentialLoopInvariantExpression::Int(i1), PotentialLoopInvariantExpression::Int(i2)) => {
      Some(PotentialLoopInvariantExpression::Int(i1 + i2))
    }
    (PotentialLoopInvariantExpression::Int(0), v)
    | (v, PotentialLoopInvariantExpression::Int(0)) => Some(v.clone()),
    _ => None,
  }
}

pub(super) fn merge_invariant_multiplication_for_loop_optimization(
  existing_value: &PotentialLoopInvariantExpression,
  added_value: &PotentialLoopInvariantExpression,
) -> Option<PotentialLoopInvariantExpression> {
  match (existing_value, added_value) {
    (PotentialLoopInvariantExpression::Int(i1), PotentialLoopInvariantExpression::Int(i2)) => {
      Some(PotentialLoopInvariantExpression::Int(i1 * i2))
    }
    (PotentialLoopInvariantExpression::Int(1), v)
    | (v, PotentialLoopInvariantExpression::Int(1)) => Some(v.clone()),
    _ => None,
  }
}

fn merge_constant_operation_into_derived_induction_variable(
  existing: &DerivedInductionVariable,
  is_plus_op: bool,
  loop_invariant_expression: &PotentialLoopInvariantExpression,
) -> Option<DerivedInductionVariable> {
  if is_plus_op {
    let DerivedInductionVariable { base_name, multiplier, immediate } = existing;
    merge_invariant_addition_for_loop_optimization(immediate, loop_invariant_expression).map(
      |merged_immediate| DerivedInductionVariable {
        base_name: base_name.clone(),
        multiplier: multiplier.clone(),
        immediate: merged_immediate,
      },
    )
  } else if let PotentialLoopInvariantExpression::Int(loop_invariant_expression_value) =
    loop_invariant_expression
  {
    if *loop_invariant_expression_value == 1 {
      Some(existing.clone())
    } else {
      match existing {
        DerivedInductionVariable {
          base_name,
          multiplier: PotentialLoopInvariantExpression::Int(m),
          immediate: PotentialLoopInvariantExpression::Int(i),
        } => Some(DerivedInductionVariable {
          base_name: base_name.clone(),
          multiplier: PotentialLoopInvariantExpression::Int(m * loop_invariant_expression_value),
          immediate: PotentialLoopInvariantExpression::Int(i * loop_invariant_expression_value),
        }),
        _ => None,
      }
    }
  } else {
    match existing {
      DerivedInductionVariable {
        base_name,
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(1),
      } => Some(DerivedInductionVariable {
        base_name: base_name.clone(),
        multiplier: loop_invariant_expression.clone(),
        immediate: loop_invariant_expression.clone(),
      }),
      _ => None,
    }
  }
}

fn merge_variable_addition_into_derived_induction_variable(
  existing: &DerivedInductionVariable,
  another_variable: &DerivedInductionVariable,
) -> Option<DerivedInductionVariable> {
  if existing.base_name.eq(&another_variable.base_name) {
    let merged_multiplier = merge_invariant_addition_for_loop_optimization(
      &existing.multiplier,
      &another_variable.multiplier,
    );
    let merged_immediate = merge_invariant_addition_for_loop_optimization(
      &existing.immediate,
      &another_variable.immediate,
    );
    match (merged_multiplier, merged_immediate) {
      (Some(merged_multiplier), Some(merged_immediate)) => Some(DerivedInductionVariable {
        base_name: existing.base_name.clone(),
        multiplier: merged_multiplier,
        immediate: merged_immediate,
      }),
      _ => None,
    }
  } else {
    None
  }
}

fn get_loop_invariant_expression_opt(
  expression: &Expression,
  non_loop_invariant_variables: &HashSet<Str>,
) -> Option<PotentialLoopInvariantExpression> {
  match expression {
    Expression::IntLiteral(i, true) => Some(PotentialLoopInvariantExpression::Int(*i)),
    Expression::IntLiteral(_, false) => None,
    // We are doing algebraic operations here. Name is hopeless.
    Expression::StringName(_) | Expression::FunctionName(_) => None,
    Expression::Variable(v) => {
      if !non_loop_invariant_variables.contains(&v.name) {
        Some(PotentialLoopInvariantExpression::Var(v.clone()))
      } else {
        None
      }
    }
  }
}

fn expression_is_loop_invariant(
  expression: &Expression,
  non_loop_invariant_variables: &HashSet<Str>,
) -> bool {
  get_loop_invariant_expression_opt(expression, non_loop_invariant_variables).is_some()
}

fn try_merge_into_derived_induction_variable_without_swap(
  existing_set: &mut HashMap<Str, DerivedInductionVariable>,
  non_loop_invariant_variables: &HashSet<Str>,
  binary_statement: &Binary,
) -> bool {
  if let Some(existing) =
    binary_statement.e1.as_variable().and_then(|it| existing_set.get(&it.name))
  {
    if let Some(another_variable) =
      binary_statement.e2.as_variable().and_then(|it| existing_set.get(&it.name))
    {
      if binary_statement.operator == Operator::PLUS {
        if let Some(merged) =
          merge_variable_addition_into_derived_induction_variable(existing, another_variable)
        {
          existing_set.insert(binary_statement.name.clone(), merged);
          return true;
        }
      }
    }
    if let Some(e2) =
      get_loop_invariant_expression_opt(&binary_statement.e2, non_loop_invariant_variables)
    {
      match binary_statement.operator {
        Operator::PLUS | Operator::MUL => {
          if let Some(merged) = merge_constant_operation_into_derived_induction_variable(
            existing,
            binary_statement.operator == Operator::PLUS,
            &e2,
          ) {
            existing_set.insert(binary_statement.name.clone(), merged);
            return true;
          }
        }
        _ => {}
      }
    }
  }
  false
}

fn try_merge_into_derived_induction_variable(
  existing_set: &mut HashMap<Str, DerivedInductionVariable>,
  non_loop_invariant_variables: &HashSet<Str>,
  binary_statement: &Binary,
) {
  if try_merge_into_derived_induction_variable_without_swap(
    existing_set,
    non_loop_invariant_variables,
    binary_statement,
  ) {
    return;
  }
  match binary_statement.operator {
    Operator::PLUS | Operator::MUL => {}
    _ => return,
  }
  let Binary { name, type_, operator, e1, e2 } = binary_statement.clone();
  let swapped = Binary { name, type_, operator, e1: e2, e2: e1 };
  try_merge_into_derived_induction_variable_without_swap(
    existing_set,
    non_loop_invariant_variables,
    &swapped,
  );
}

struct LoopGuardStructure {
  potential_basic_induction_variable_with_loop_guard: Str,
  guard_operator: GuardOperator,
  guard_expression: PotentialLoopInvariantExpression,
  rest_statements: Vec<Statement>,
  break_collector: Option<(Str, Type, Expression)>,
}

fn get_guard_operator(operator: Operator, invert_condition: bool) -> Option<GuardOperator> {
  let guard_op = match operator {
    Operator::LT => GuardOperator::LT,
    Operator::LE => GuardOperator::LE,
    Operator::GT => GuardOperator::GT,
    Operator::GE => GuardOperator::GE,
    _ => return None,
  };
  Some(if invert_condition { guard_op } else { guard_op.invert() })
}

fn extract_loop_guard_structure(
  (stmts, original_break_collector): (Vec<Statement>, Option<VariableName>),
  non_loop_invariant_variables: &HashSet<Str>,
) -> Option<LoopGuardStructure> {
  let (first_binary_stmt, second_single_if_stmt, rest_statements) = {
    let mut iter = stmts.into_iter();
    let first = iter.next()?;
    let second = iter.next()?;
    let rest = iter.collect_vec();
    (first, second, rest)
  };
  match (first_binary_stmt, second_single_if_stmt) {
    (
      Statement::Binary(Binary { name, type_: _, operator, e1: Expression::Variable(e1_var), e2 }),
      Statement::SingleIf {
        condition: Expression::Variable(condition_var),
        invert_condition,
        statements: single_if_stmts,
      },
    ) if name.eq(&condition_var.name)
      && single_if_stmts.len() == 1
      && stmts_contains_break(&single_if_stmts)
      && !stmts_contains_break(&rest_statements) =>
    {
      if let (Some(guard_operator), Some(guard_expression)) = (
        get_guard_operator(operator, invert_condition),
        get_loop_invariant_expression_opt(&e2, non_loop_invariant_variables),
      ) {
        let potential_basic_induction_variable_with_loop_guard = e1_var.name;
        let break_collector = original_break_collector
          .map(|v| (v.name, v.type_, single_if_stmts[0].as_break().unwrap().clone()));
        Some(LoopGuardStructure {
          potential_basic_induction_variable_with_loop_guard,
          guard_operator,
          guard_expression,
          rest_statements,
          break_collector,
        })
      } else {
        None
      }
    }
    _ => None,
  }
}

struct ExtractedBasicInductionVariables {
  loop_variables_that_are_not_basic_induction_variables: Vec<GenenalLoopVariable>,
  all_basic_induction_variables: Vec<GeneralBasicInductionVariableWithLoopValueCollector>,
  basic_induction_variable_with_associated_loop_guard:
    GeneralBasicInductionVariableWithLoopValueCollector,
}

fn extract_basic_induction_variables(
  potential_basic_induction_variable_name_with_loop_guard: &Str,
  loop_variables: &Vec<GenenalLoopVariable>,
  rest_stmts: &Vec<Statement>,
  non_loop_invariant_variables: &HashSet<Str>,
) -> Option<ExtractedBasicInductionVariables> {
  let mut all_basic_induction_variables = vec![];
  let mut loop_variables_that_are_not_basic_induction_variables = vec![];
  'outer: for loop_variable in loop_variables {
    if let Expression::Variable(basic_induction_loop_increment_collector) =
      &loop_variable.loop_value
    {
      for stmt in rest_stmts {
        match stmt {
          Statement::Binary(Binary {
            name,
            type_: _,
            operator: Operator::PLUS,
            e1: Expression::Variable(e1_var),
            e2,
          }) if name.eq(&basic_induction_loop_increment_collector.name)
            && e1_var.name.eq(&loop_variable.name) =>
          {
            if let Some(increment_amount) =
              get_loop_invariant_expression_opt(e2, non_loop_invariant_variables)
            {
              all_basic_induction_variables.push(
                GeneralBasicInductionVariableWithLoopValueCollector {
                  name: loop_variable.name.clone(),
                  initial_value: loop_variable.initial_value.clone(),
                  increment_amount,
                  loop_value_collector: basic_induction_loop_increment_collector.name.clone(),
                },
              );
              continue 'outer;
            }
          }
          _ => {}
        }
      }
    }
    loop_variables_that_are_not_basic_induction_variables.push(loop_variable.clone());
  }
  let basic_induction_variable_with_associated_loop_guard = all_basic_induction_variables
    .iter()
    .find(|it| it.name.eq(potential_basic_induction_variable_name_with_loop_guard))
    .cloned()?;
  Some(ExtractedBasicInductionVariables {
    loop_variables_that_are_not_basic_induction_variables,
    all_basic_induction_variables,
    basic_induction_variable_with_associated_loop_guard,
  })
}

fn extract_derived_induction_variables(
  all_basic_induction_variables: &Vec<GeneralBasicInductionVariableWithLoopValueCollector>,
  rest_stmts: &Vec<Statement>,
  non_loop_invariant_variables: &HashSet<Str>,
) -> Vec<DerivedInductionVariableWithName> {
  let mut existing_derived_induction_variable_set = HashMap::new();
  for v in all_basic_induction_variables {
    existing_derived_induction_variable_set.insert(
      v.name.clone(),
      DerivedInductionVariable {
        base_name: v.name.clone(),
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(0),
      },
    );
  }
  for stmt in rest_stmts {
    if let Statement::Binary(b) = stmt {
      try_merge_into_derived_induction_variable(
        &mut existing_derived_induction_variable_set,
        non_loop_invariant_variables,
        b,
      );
    }
  }
  let mut induction_loop_variable_collector_names = HashSet::new();
  for v in all_basic_induction_variables {
    induction_loop_variable_collector_names.insert(v.loop_value_collector.clone());
  }
  let mut collector = vec![];
  for stmt in rest_stmts {
    if let Statement::Binary(b) = stmt {
      if let Some(derived_induction_variable) = existing_derived_induction_variable_set.get(&b.name)
      {
        if !induction_loop_variable_collector_names.contains(&b.name) {
          collector.push(DerivedInductionVariableWithName {
            name: b.name.clone(),
            base_name: derived_induction_variable.base_name.clone(),
            multiplier: derived_induction_variable.multiplier.clone(),
            immediate: derived_induction_variable.immediate.clone(),
          });
        }
      }
    }
  }
  collector
}

fn remove_dead_code_inside_loop(
  other_loop_variables: &Vec<GenenalLoopVariable>,
  rest_stmts: Vec<Statement>,
) -> Vec<Statement> {
  let mut live_variable_set = HashSet::new();
  for v in other_loop_variables {
    if let Some(var_name) = &v.loop_value.as_variable() {
      live_variable_set.insert(var_name.name.clone());
    }
  }
  dead_code_elimination::optimize_stmts(rest_stmts, &mut live_variable_set)
}

pub(super) fn extract_optimizable_while_loop(
  (loop_variables, stmts, original_break_collector): (
    Vec<GenenalLoopVariable>,
    Vec<Statement>,
    Option<VariableName>,
  ),
  non_loop_invariant_variables: &HashSet<Str>,
) -> Option<OptimizableWhileLoop> {
  // Phase 1: Check the structure for loop guard.
  let LoopGuardStructure {
    potential_basic_induction_variable_with_loop_guard,
    guard_operator,
    guard_expression,
    rest_statements,
    break_collector,
  } =
    extract_loop_guard_structure((stmts, original_break_collector), non_loop_invariant_variables)?;
  // Phase 2: Extract basic induction variables.
  let ExtractedBasicInductionVariables {
    loop_variables_that_are_not_basic_induction_variables,
    all_basic_induction_variables,
    basic_induction_variable_with_associated_loop_guard,
  } = extract_basic_induction_variables(
    &potential_basic_induction_variable_with_loop_guard,
    &loop_variables,
    &rest_statements,
    non_loop_invariant_variables,
  )?;
  let basic_induction_variable_with_loop_guard = BasicInductionVariableWithLoopGuard {
    name: basic_induction_variable_with_associated_loop_guard.name,
    initial_value: basic_induction_variable_with_associated_loop_guard.initial_value,
    increment_amount: basic_induction_variable_with_associated_loop_guard.increment_amount,
    guard_operator,
    guard_expression,
  };
  let general_induction_variables = all_basic_induction_variables
    .iter()
    .filter(|it| it.name.ne(&potential_basic_induction_variable_with_loop_guard))
    .map(|it| GeneralBasicInductionVariable {
      name: it.name.clone(),
      initial_value: it.initial_value.clone(),
      increment_amount: it.increment_amount.clone(),
    })
    .collect_vec();

  // Phase 3: Compute all the derived induction variables.
  let derived_induction_variables = extract_derived_induction_variables(
    &all_basic_induction_variables,
    &rest_statements,
    non_loop_invariant_variables,
  );
  let derived_induction_variable_names =
    derived_induction_variables.iter().map(|it| it.name.clone()).collect::<HashSet<_>>();

  // Phase 4: Remove undundant statements after getting all the induction variables.
  let optimized_statements = remove_dead_code_inside_loop(
    &loop_variables_that_are_not_basic_induction_variables
      .iter()
      .filter(|it| {
        it.loop_value
          .as_variable()
          .map(|v| !derived_induction_variable_names.contains(&v.name))
          .unwrap_or(true)
      })
      .cloned()
      .collect(),
    rest_statements,
  );

  Some(OptimizableWhileLoop {
    basic_induction_variable_with_loop_guard,
    general_induction_variables,
    loop_variables_that_are_not_basic_induction_variables,
    derived_induction_variables,
    statements: optimized_statements,
    break_collector,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::hir::{Callee, FunctionName, BOOL_TYPE, INT_TYPE, ONE, TRUE, ZERO},
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    get_guard_operator(Operator::LT, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::LE, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::GE, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::GT, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::LT, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::LE, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::GE, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(Operator::GT, true).unwrap().invert().clone().invert().to_op();
    assert!(get_guard_operator(Operator::EQ, true).is_none());

    assert!(!BasicInductionVariableWithLoopGuard {
      name: rcs(""),
      initial_value: ZERO,
      increment_amount: PotentialLoopInvariantExpression::Int(0),
      guard_operator: GuardOperator::GE,
      guard_expression: PotentialLoopInvariantExpression::Int(0),
    }
    .as_general_basic_induction_variable()
    .clone()
    .to_string()
    .is_empty());
    DerivedInductionVariableWithName {
      name: rcs(""),
      base_name: rcs(""),
      multiplier: PotentialLoopInvariantExpression::Int(0),
      immediate: PotentialLoopInvariantExpression::Int(0),
    }
    .clone()
    .to_string();
  }

  #[test]
  fn merge_invariant_multiplication_for_loop_optimization_tests() {
    assert_eq!(
      6,
      *merge_invariant_multiplication_for_loop_optimization(
        &PotentialLoopInvariantExpression::Int(2),
        &PotentialLoopInvariantExpression::Int(3),
      )
      .unwrap()
      .as_int()
      .unwrap()
    );

    assert_eq!(
      "(v: int)",
      merge_invariant_multiplication_for_loop_optimization(
        &PotentialLoopInvariantExpression::Int(1),
        &PotentialLoopInvariantExpression::Var(VariableName::new("v", INT_TYPE))
      )
      .unwrap()
      .to_expression()
      .debug_print()
    );
    assert_eq!(
      "(v: int)",
      merge_invariant_multiplication_for_loop_optimization(
        &PotentialLoopInvariantExpression::Var(VariableName::new("v", INT_TYPE)),
        &PotentialLoopInvariantExpression::Int(1),
      )
      .unwrap()
      .to_expression()
      .debug_print()
    );
    assert!(merge_invariant_multiplication_for_loop_optimization(
      &PotentialLoopInvariantExpression::Var(VariableName::new("v", INT_TYPE)),
      &PotentialLoopInvariantExpression::Var(VariableName::new("v", INT_TYPE)),
    )
    .is_none());
  }

  #[test]
  fn merge_variable_addition_into_derived_induction_variable_test() {
    assert!(merge_variable_addition_into_derived_induction_variable(
      &DerivedInductionVariable {
        base_name: rcs("a"),
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
      &DerivedInductionVariable {
        base_name: rcs("a"),
        multiplier: PotentialLoopInvariantExpression::Var(VariableName::new("vv", INT_TYPE)),
        immediate: PotentialLoopInvariantExpression::Int(1),
      }
    )
    .is_none());

    let successful = merge_variable_addition_into_derived_induction_variable(
      &DerivedInductionVariable {
        base_name: rcs("a"),
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
      &DerivedInductionVariable {
        base_name: rcs("a"),
        multiplier: PotentialLoopInvariantExpression::Int(2),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
    )
    .clone()
    .unwrap();
    assert_eq!(3, *successful.multiplier.as_int().unwrap());
    assert_eq!(2, *successful.immediate.as_int().unwrap());
  }

  #[test]
  fn loop_invariant_tests() {
    assert!(!expression_is_loop_invariant(
      &Expression::StringName(rcs("")),
      &HashSet::from([rcs("a")])
    ));
    assert!(!expression_is_loop_invariant(
      &Expression::FunctionName(FunctionName::new("", Type::new_fn_unwrapped(vec![], INT_TYPE))),
      &HashSet::from([rcs("a")])
    ));
    assert!(expression_is_loop_invariant(&ZERO, &HashSet::from([rcs("a")])));
    assert!(!expression_is_loop_invariant(&TRUE, &HashSet::from([rcs("a")])));
    assert!(expression_is_loop_invariant(
      &Expression::var_name("", INT_TYPE),
      &HashSet::from([rcs("a")])
    ));
    assert!(!expression_is_loop_invariant(
      &Expression::var_name("a", INT_TYPE),
      &HashSet::from([rcs("a")])
    ));
  }

  #[test]
  fn extract_basic_induction_variables_tests() {
    assert!(extract_basic_induction_variables(
      &rcs("i"),
      &vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO
        },
      ],
      &vec![],
      &HashSet::new()
    )
    .is_none());

    assert!(extract_basic_induction_variables(
      &rcs("i"),
      &vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        },
      ],
      &vec![
        Statement::binary(
          "tmp_i",
          Operator::PLUS,
          Expression::var_name("i", INT_TYPE),
          Expression::StringName(rcs(""))
        ),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::StringName(rcs("")),
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .is_none());

    let ExtractedBasicInductionVariables {
      loop_variables_that_are_not_basic_induction_variables,
      all_basic_induction_variables,
      basic_induction_variable_with_associated_loop_guard,
    } = extract_basic_induction_variables(
      &rcs("i"),
      &vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        },
      ],
      &vec![
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::int(3),
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .unwrap();
    assert!(loop_variables_that_are_not_basic_induction_variables.is_empty());
    assert_eq!(
      vec![
        "{name: i, initial_value: 0, increment_amount: 1, loop_value_collector: tmp_i}",
        "{name: j, initial_value: 0, increment_amount: 3, loop_value_collector: tmp_j}",
      ],
      all_basic_induction_variables.iter().map(|it| it.to_string()).collect_vec()
    );
    assert_eq!(
      "{name: i, initial_value: 0, increment_amount: 1, loop_value_collector: tmp_i}",
      basic_induction_variable_with_associated_loop_guard.to_string()
    );
  }

  #[test]
  fn extract_derived_induction_variables_tests() {
    assert_eq!(
      vec![
        "{name: tmp_x, base_name: i, multiplier: 5, immediate: 5}",
        "{name: tmp_y, base_name: i, multiplier: 5, immediate: 11}",
        "{name: tmp_z, base_name: i, multiplier: 10, immediate: 16}"
      ],
      extract_derived_induction_variables(
        &vec![
          GeneralBasicInductionVariableWithLoopValueCollector {
            name: rcs("i"),
            initial_value: ZERO,
            increment_amount: PotentialLoopInvariantExpression::Int(1),
            loop_value_collector: rcs("tmp_i"),
          },
          GeneralBasicInductionVariableWithLoopValueCollector {
            name: rcs("j"),
            initial_value: ZERO,
            increment_amount: PotentialLoopInvariantExpression::Int(3),
            loop_value_collector: rcs("tmp_j"),
          },
        ],
        &vec![
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
          Statement::binary(
            "tmp_j",
            Operator::PLUS,
            Expression::var_name("j", INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            "tmp_x",
            Operator::MUL,
            Expression::var_name("tmp_i", INT_TYPE),
            Expression::int(5),
          ),
          Statement::binary(
            "tmp_y",
            Operator::PLUS,
            Expression::var_name("tmp_x", INT_TYPE),
            Expression::int(6),
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("tmp_x", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("tmp_x", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::binary(
            "tmp_z",
            Operator::PLUS,
            Expression::var_name("tmp_x", INT_TYPE),
            Expression::var_name("tmp_y", INT_TYPE),
          ),
          Statement::binary(
            "tmp_useless_1",
            Operator::MINUS,
            Expression::var_name("tmp_x", INT_TYPE),
            Expression::var_name("tmp_y", INT_TYPE),
          ),
          Statement::binary(
            "tmp_useless_2",
            Operator::PLUS,
            Expression::var_name("tmp_x", INT_TYPE),
            Expression::var_name("tmp_useless_1", INT_TYPE),
          ),
          Statement::binary(
            "tmp_useless_3",
            Operator::PLUS,
            ZERO,
            Expression::var_name("tmp_useless_1", INT_TYPE),
          ),
          Statement::binary(
            "tmp_useless_4",
            Operator::PLUS,
            Expression::var_name("tmp_useless_1", INT_TYPE),
            Expression::var_name("tmp_useless_1", INT_TYPE),
          ),
          Statement::binary(
            "tmp_useless_6",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("j", INT_TYPE),
          ),
        ],
        &HashSet::from([
          rcs(""),
          rcs("i"),
          rcs("j"),
          rcs("tmp_i"),
          rcs("tmp_j"),
          rcs("tmp_x"),
          rcs("tmp_y"),
          rcs("tmp_useless_1"),
        ]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &vec![GeneralBasicInductionVariableWithLoopValueCollector {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: rcs("tmp_i"),
      }],
      &vec![
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::var_name("outside", INT_TYPE),
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .is_empty());

    assert!(extract_derived_induction_variables(
      &vec![GeneralBasicInductionVariableWithLoopValueCollector {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: rcs("tmp_i"),
      }],
      &vec![
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::StringName(rcs("outside")),
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &vec![GeneralBasicInductionVariableWithLoopValueCollector {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: rcs("tmp_i"),
        }],
        &vec![
          Statement::binary(
            "tmp_i",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("outside", INT_TYPE)
          ),
          Statement::binary(
            "tmp_j",
            Operator::PLUS,
            Expression::var_name("tmp_i", INT_TYPE),
            ZERO,
          ),
        ],
        &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &vec![GeneralBasicInductionVariableWithLoopValueCollector {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: rcs("tmp_i"),
        }],
        &vec![
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO,),
          Statement::binary(
            "tmp_j",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("outside", INT_TYPE)
          ),
        ],
        &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &vec![GeneralBasicInductionVariableWithLoopValueCollector {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            "outside", INT_TYPE
          )),
          loop_value_collector: rcs("tmp_i"),
        }],
        &vec![
          Statement::binary(
            "tmp_i",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("outside", INT_TYPE)
          ),
          Statement::binary("tmp_j", Operator::MUL, Expression::var_name("tmp_i", INT_TYPE), ONE),
        ],
        &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &vec![GeneralBasicInductionVariableWithLoopValueCollector {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
          "outside", INT_TYPE
        )),
        loop_value_collector: rcs("tmp_i"),
      }],
      &vec![
        Statement::binary(
          "tmp_i",
          Operator::PLUS,
          Expression::var_name("i", INT_TYPE),
          Expression::var_name("outside", INT_TYPE)
        ),
        Statement::binary(
          "tmp_j",
          Operator::MUL,
          Expression::var_name("tmp_i", INT_TYPE),
          Expression::int(2)
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: (outside: int), immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &vec![GeneralBasicInductionVariableWithLoopValueCollector {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            "outside", INT_TYPE
          )),
          loop_value_collector: rcs("tmp_i"),
        }],
        &vec![
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
          Statement::binary(
            "tmp_j",
            Operator::MUL,
            Expression::var_name("tmp_i", INT_TYPE),
            Expression::var_name("outside", INT_TYPE)
          ),
        ],
        &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &vec![GeneralBasicInductionVariableWithLoopValueCollector {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(2),
        loop_value_collector: rcs("tmp_i"),
      }],
      &vec![
        Statement::binary(
          "tmp_i",
          Operator::PLUS,
          Expression::var_name("i", INT_TYPE),
          Expression::int(2)
        ),
        Statement::binary(
          "tmp_j",
          Operator::MUL,
          Expression::var_name("tmp_i", INT_TYPE),
          Expression::var_name("outside", INT_TYPE)
        ),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j")]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: t1, base_name: i, multiplier: 1, immediate: 2}"],
      extract_derived_induction_variables(
        &vec![GeneralBasicInductionVariableWithLoopValueCollector {
          name: rcs("i"),
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: rcs("tmp_i"),
        }],
        &vec![
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
          Statement::binary("t1", Operator::PLUS, Expression::var_name("tmp_i", INT_TYPE), ONE),
        ],
        &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j"), rcs("t1")]),
      )
      .iter()
      .map(|it| it.to_string())
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &vec![GeneralBasicInductionVariableWithLoopValueCollector {
        name: rcs("i"),
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: rcs("tmp_i"),
      }],
      &vec![
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary("t1", Operator::DIV, Expression::var_name("tmp_i", INT_TYPE), ONE),
      ],
      &HashSet::from([rcs(""), rcs("i"), rcs("j"), rcs("tmp_i"), rcs("tmp_j"), rcs("t1")]),
    )
    .is_empty());
  }

  #[test]
  fn remove_dead_code_inside_loop_coverage_test() {
    remove_dead_code_inside_loop(
      &vec![
        GenenalLoopVariable {
          name: rcs(""),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        },
        GenenalLoopVariable {
          name: rcs(""),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("name", INT_TYPE),
        },
      ],
      vec![],
    );
  }

  #[test]
  fn extract_loop_guard_structure_rejection_rests() {
    let non_loop_invariant_variables = HashSet::from([rcs(""), rcs("a"), rcs("b"), rcs("cc")]);

    assert!(extract_loop_guard_structure((vec![], None), &non_loop_invariant_variables).is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          },
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          },
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("", Operator::PLUS, ZERO, ZERO),
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          }
        ],
        None
      ),
      &HashSet::new()
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::StructInit {
            struct_variable_name: rcs(""),
            type_: Type::new_id_no_targs_unwrapped("T"),
            expression_list: vec![],
          },
          Statement::SingleIf { condition: ZERO, invert_condition: false, statements: vec![] }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf { condition: ZERO, invert_condition: false, statements: vec![] }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          }
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![]
            }]
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![]
            }],
            s2: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![]
            }],
            final_assignments: vec![]
          },
          Statement::IndexedAccess {
            name: rcs(""),
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 0
          },
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "",
              Type::new_fn_unwrapped(vec![], INT_TYPE)
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None
          },
          Statement::Break(ZERO)
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::EQ, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![]
            }]
          },
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::StringName(rcs("cc")),
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("I"),
              expression_list: vec![]
            }]
          },
        ],
        None
      ),
      &non_loop_invariant_variables
    )
    .is_none());
  }

  #[test]
  fn extract_optimizable_while_loop_rejection_tests() {
    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::StringName(rcs("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
        ],
        None
      ),
      &HashSet::new()
    )
    .is_none());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary("cc", Operator::EQ, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::StringName(rcs("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO)
        ],
        None
      ),
      &HashSet::new()
    )
    .is_none());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::StringName(rcs("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ZERO)
        ],
        None
      ),
      &HashSet::new()
    )
    .is_none());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary("cc", Operator::GE, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        ],
        None
      ),
      &HashSet::new()
    )
    .is_none());
  }

  #[test]
  fn extract_optimizable_while_loop_acceptance_test() {
    let OptimizableWhileLoop {
      basic_induction_variable_with_loop_guard,
      general_induction_variables,
      loop_variables_that_are_not_basic_induction_variables,
      derived_induction_variables,
      statements,
      break_collector,
    } = extract_optimizable_while_loop(
      (
        vec![
          GenenalLoopVariable {
            name: rcs("i"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_i", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("j"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_j", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("x"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_x", INT_TYPE),
          },
        ],
        vec![
          Statement::binary("cc", Operator::GE, Expression::var_name("i", INT_TYPE), ZERO),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
          Statement::binary(
            "tmp_j",
            Operator::PLUS,
            Expression::var_name("j", INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            "tmp_x",
            Operator::MUL,
            Expression::var_name("tmp_i", INT_TYPE),
            Expression::int(5),
          ),
          Statement::binary(
            "tmp_y",
            Operator::PLUS,
            Expression::var_name("tmp_x", INT_TYPE),
            Expression::int(6),
          ),
        ],
        Some(VariableName { name: rcs("bc"), type_: INT_TYPE }),
      ),
      &HashSet::new(),
    )
    .unwrap();
    assert_eq!(
      "{name: i, initial_value: 0, increment_amount: 1, guard_operator: LT, guard_expression: 0}",
      basic_induction_variable_with_loop_guard.to_string()
    );
    assert_eq!(
      vec!["{name: j, initial_value: 0, increment_amount: 3}"],
      general_induction_variables.iter().map(|it| it.to_string()).collect_vec()
    );
    assert_eq!(
      vec!["{name: x, initial_value: 0, loop_value: (tmp_x: int)}"],
      loop_variables_that_are_not_basic_induction_variables
        .iter()
        .map(|it| it.to_string())
        .collect_vec()
    );
    assert_eq!(
      vec![
        "{name: tmp_x, base_name: i, multiplier: 5, immediate: 5}",
        "{name: tmp_y, base_name: i, multiplier: 5, immediate: 11}",
      ],
      derived_induction_variables.iter().map(|it| it.to_string()).collect_vec()
    );
    assert!(statements.is_empty());
    let (n, _, v) = break_collector.unwrap();
    assert_eq!("bc", n.to_string());
    assert_eq!("0", v.debug_print());
  }
}
