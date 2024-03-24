use super::dead_code_elimination;
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use samlang_ast::{
  hir::BinaryOperator,
  mir::{Binary, Expression, GenenalLoopVariable, Statement, Type, VariableName},
};
use samlang_heap::PStr;
use std::collections::{HashMap, HashSet};

#[derive(Clone, EnumAsInner)]
pub(super) enum PotentialLoopInvariantExpression {
  Int(i32),
  Var(VariableName),
}

impl PotentialLoopInvariantExpression {
  pub(super) fn to_expression(&self) -> Expression {
    match self {
      PotentialLoopInvariantExpression::Int(i) => Expression::IntLiteral(*i),
      PotentialLoopInvariantExpression::Var(n) => Expression::Variable(*n),
    }
  }
}

impl PotentialLoopInvariantExpression {
  #[cfg(test)]
  fn debug_print(
    &self,
    heap: &samlang_heap::Heap,
    table: &samlang_ast::mir::SymbolTable,
  ) -> String {
    self.to_expression().debug_print(heap, table)
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

  pub(super) fn to_op(self) -> BinaryOperator {
    match self {
      GuardOperator::LT => BinaryOperator::LT,
      GuardOperator::LE => BinaryOperator::LE,
      GuardOperator::GT => BinaryOperator::GT,
      GuardOperator::GE => BinaryOperator::GE,
    }
  }
}

pub(super) struct BasicInductionVariableWithLoopGuard {
  pub(super) name: PStr,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
  pub(super) guard_operator: GuardOperator,
  pub(super) guard_expression: PotentialLoopInvariantExpression,
}

impl BasicInductionVariableWithLoopGuard {
  pub(super) fn as_general_basic_induction_variable(&self) -> GeneralBasicInductionVariable {
    GeneralBasicInductionVariable {
      name: self.name,
      initial_value: self.initial_value,
      increment_amount: self.increment_amount.clone(),
    }
  }
}

impl BasicInductionVariableWithLoopGuard {
  #[cfg(test)]
  pub(super) fn debug_print(
    &self,
    heap: &samlang_heap::Heap,
    table: &samlang_ast::mir::SymbolTable,
  ) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}, guard_operator: {:?}, guard_expression: {}}}",
      self.name.as_str(heap),
      self.initial_value.debug_print(heap, table),
      self.increment_amount.debug_print(heap, table),
      self.guard_operator,
      self.guard_expression.debug_print(heap, table)
    )
  }
}

#[derive(Clone)]
pub(super) struct GeneralBasicInductionVariable {
  pub(super) name: PStr,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
}

impl GeneralBasicInductionVariable {
  #[cfg(test)]
  pub(super) fn debug_print(
    &self,
    heap: &samlang_heap::Heap,
    table: &samlang_ast::mir::SymbolTable,
  ) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}}}",
      self.name.as_str(heap),
      self.initial_value.debug_print(heap, table),
      self.increment_amount.debug_print(heap, table),
    )
  }
}

#[derive(Clone)]
pub(super) struct GeneralBasicInductionVariableWithLoopValueCollector {
  pub(super) name: PStr,
  pub(super) initial_value: Expression,
  pub(super) increment_amount: PotentialLoopInvariantExpression,
  pub(super) loop_value_collector: PStr,
}

impl GeneralBasicInductionVariableWithLoopValueCollector {
  #[cfg(test)]
  fn debug_print(
    &self,
    heap: &samlang_heap::Heap,
    table: &samlang_ast::mir::SymbolTable,
  ) -> String {
    format!(
      "{{name: {}, initial_value: {}, increment_amount: {}, loop_value_collector: {}}}",
      self.name.as_str(heap),
      self.initial_value.debug_print(heap, table),
      self.increment_amount.debug_print(heap, table),
      self.loop_value_collector.as_str(heap)
    )
  }
}

#[derive(Clone)]
struct DerivedInductionVariable {
  base_name: PStr,
  multiplier: PotentialLoopInvariantExpression,
  immediate: PotentialLoopInvariantExpression,
}

#[derive(Clone)]
pub(super) struct DerivedInductionVariableWithName {
  pub(super) name: PStr,
  pub(super) base_name: PStr,
  pub(super) multiplier: PotentialLoopInvariantExpression,
  pub(super) immediate: PotentialLoopInvariantExpression,
}

impl DerivedInductionVariableWithName {
  #[cfg(test)]
  pub(super) fn debug_print(
    &self,
    heap: &samlang_heap::Heap,
    table: &samlang_ast::mir::SymbolTable,
  ) -> String {
    format!(
      "{{name: {}, base_name: {}, multiplier: {}, immediate: {}}}",
      self.name.as_str(heap),
      self.base_name.as_str(heap),
      self.multiplier.debug_print(heap, table),
      self.immediate.debug_print(heap, table),
    )
  }
}

pub(super) struct OptimizableWhileLoop {
  pub(super) basic_induction_variable_with_loop_guard: BasicInductionVariableWithLoopGuard,
  pub(super) general_induction_variables: Vec<GeneralBasicInductionVariable>,
  pub(super) loop_variables_that_are_not_basic_induction_variables: Vec<GenenalLoopVariable>,
  pub(super) derived_induction_variables: Vec<DerivedInductionVariableWithName>,
  pub(super) statements: Vec<Statement>,
  pub(super) break_collector: Option<(PStr, Type, Expression)>,
}

fn stmt_contains_break(stmt: &Statement) -> bool {
  match stmt {
    Statement::Unary { .. }
    | Statement::Binary(_)
    | Statement::IndexedAccess { .. }
    | Statement::Call { .. }
    | Statement::Cast { .. }
    | Statement::LateInitDeclaration { .. }
    | Statement::LateInitAssignment { .. }
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
        base_name: *base_name,
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
          base_name: *base_name,
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
        base_name: *base_name,
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
        base_name: existing.base_name,
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
  non_loop_invariant_variables: &HashSet<PStr>,
) -> Option<PotentialLoopInvariantExpression> {
  match expression {
    Expression::IntLiteral(i) => Some(PotentialLoopInvariantExpression::Int(*i)),
    // We are doing algebraic operations here. Name is hopeless.
    Expression::StringName(_) => None,
    Expression::Variable(v) => {
      if !non_loop_invariant_variables.contains(&v.name) {
        Some(PotentialLoopInvariantExpression::Var(*v))
      } else {
        None
      }
    }
  }
}

fn try_merge_into_derived_induction_variable_without_swap(
  existing_set: &mut HashMap<PStr, DerivedInductionVariable>,
  non_loop_invariant_variables: &HashSet<PStr>,
  binary_statement: &Binary,
) -> bool {
  if let Some(existing) =
    binary_statement.e1.as_variable().and_then(|it| existing_set.get(&it.name))
  {
    if let Some(another_variable) =
      binary_statement.e2.as_variable().and_then(|it| existing_set.get(&it.name))
    {
      if binary_statement.operator == BinaryOperator::PLUS {
        if let Some(merged) =
          merge_variable_addition_into_derived_induction_variable(existing, another_variable)
        {
          existing_set.insert(binary_statement.name, merged);
          return true;
        }
      }
    }
    if let Some(e2) =
      get_loop_invariant_expression_opt(&binary_statement.e2, non_loop_invariant_variables)
    {
      match binary_statement.operator {
        BinaryOperator::PLUS | BinaryOperator::MUL => {
          if let Some(merged) = merge_constant_operation_into_derived_induction_variable(
            existing,
            binary_statement.operator == BinaryOperator::PLUS,
            &e2,
          ) {
            existing_set.insert(binary_statement.name, merged);
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
  existing_set: &mut HashMap<PStr, DerivedInductionVariable>,
  non_loop_invariant_variables: &HashSet<PStr>,
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
    BinaryOperator::PLUS | BinaryOperator::MUL => {}
    _ => return,
  }
  let Binary { name, operator, e1, e2 } = binary_statement.clone();
  let swapped = Binary { name, operator, e1: e2, e2: e1 };
  try_merge_into_derived_induction_variable_without_swap(
    existing_set,
    non_loop_invariant_variables,
    &swapped,
  );
}

struct LoopGuardStructure {
  potential_basic_induction_variable_with_loop_guard: PStr,
  guard_operator: GuardOperator,
  guard_expression: PotentialLoopInvariantExpression,
  break_collector: Option<(PStr, Type, Expression)>,
}

fn get_guard_operator(operator: BinaryOperator, invert_condition: bool) -> Option<GuardOperator> {
  let guard_op = match operator {
    BinaryOperator::LT => GuardOperator::LT,
    BinaryOperator::LE => GuardOperator::LE,
    BinaryOperator::GT => GuardOperator::GT,
    BinaryOperator::GE => GuardOperator::GE,
    _ => return None,
  };
  Some(if invert_condition { guard_op } else { guard_op.invert() })
}

fn extract_loop_guard_structure(
  (stmts, original_break_collector): (&Vec<Statement>, &Option<VariableName>),
  non_loop_invariant_variables: &HashSet<PStr>,
) -> Option<LoopGuardStructure> {
  let (first_binary_stmt, second_single_if_stmt) =
    (stmts.first().and_then(Statement::as_binary), stmts.get(1).and_then(Statement::as_single_if));
  match (first_binary_stmt, second_single_if_stmt) {
    (
      Some(Binary { name, operator, e1: Expression::Variable(e1_var), e2 }),
      Some((Expression::Variable(condition_var), invert_condition, single_if_stmts)),
    ) if name.eq(&condition_var.name)
      && single_if_stmts.len() == 1
      && stmts_contains_break(single_if_stmts)
      && !stmts_contains_break(&stmts[2..]) =>
    {
      if let (Some(guard_operator), Some(guard_expression)) = (
        get_guard_operator(*operator, *invert_condition),
        get_loop_invariant_expression_opt(e2, non_loop_invariant_variables),
      ) {
        let potential_basic_induction_variable_with_loop_guard = e1_var.name;
        let break_collector = original_break_collector
          .as_ref()
          .map(|v| (v.name, v.type_, *single_if_stmts[0].as_break().unwrap()));
        Some(LoopGuardStructure {
          potential_basic_induction_variable_with_loop_guard,
          guard_operator,
          guard_expression,
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
  potential_basic_induction_variable_name_with_loop_guard: &PStr,
  loop_variables: &Vec<GenenalLoopVariable>,
  rest_stmts: &[Statement],
  non_loop_invariant_variables: &HashSet<PStr>,
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
            operator: BinaryOperator::PLUS,
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
                  name: loop_variable.name,
                  initial_value: loop_variable.initial_value,
                  increment_amount,
                  loop_value_collector: basic_induction_loop_increment_collector.name,
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
  all_basic_induction_variables: &[GeneralBasicInductionVariableWithLoopValueCollector],
  rest_stmts: &[Statement],
  non_loop_invariant_variables: &HashSet<PStr>,
) -> Vec<DerivedInductionVariableWithName> {
  let mut existing_derived_induction_variable_set = HashMap::new();
  for v in all_basic_induction_variables {
    existing_derived_induction_variable_set.insert(
      v.name,
      DerivedInductionVariable {
        base_name: v.name,
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
    induction_loop_variable_collector_names.insert(v.loop_value_collector);
  }
  let mut collector = vec![];
  for stmt in rest_stmts {
    if let Statement::Binary(b) = stmt {
      if let Some(derived_induction_variable) = existing_derived_induction_variable_set.get(&b.name)
      {
        if !induction_loop_variable_collector_names.contains(&b.name) {
          collector.push(DerivedInductionVariableWithName {
            name: b.name,
            base_name: derived_induction_variable.base_name,
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
  rest_stmts: &mut Vec<Statement>,
) {
  let mut live_variable_set = HashSet::new();
  for v in other_loop_variables {
    if let Some(var_name) = &v.loop_value.as_variable() {
      live_variable_set.insert(var_name.name);
    }
  }
  dead_code_elimination::optimize_stmts(rest_stmts, &mut live_variable_set)
}

type ExtractOptimizableWhileLoopTuple =
  (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>);

pub(super) fn extract_optimizable_while_loop(
  (loop_variables, stmts, original_break_collector): ExtractOptimizableWhileLoopTuple,
  non_loop_invariant_variables: &HashSet<PStr>,
) -> Result<OptimizableWhileLoop, ExtractOptimizableWhileLoopTuple> {
  // Phase 1: Check the structure for loop guard.
  let LoopGuardStructure {
    potential_basic_induction_variable_with_loop_guard,
    guard_operator,
    guard_expression,
    break_collector,
  } = match extract_loop_guard_structure(
    (&stmts, &original_break_collector),
    non_loop_invariant_variables,
  ) {
    Some(r) => r,
    None => {
      return Err((loop_variables, stmts, original_break_collector));
    }
  };
  // Phase 2: Extract basic induction variables.
  let ExtractedBasicInductionVariables {
    loop_variables_that_are_not_basic_induction_variables,
    all_basic_induction_variables,
    basic_induction_variable_with_associated_loop_guard,
  } = if let Some(r) = extract_basic_induction_variables(
    &potential_basic_induction_variable_with_loop_guard,
    &loop_variables,
    &stmts[2..],
    non_loop_invariant_variables,
  ) {
    r
  } else {
    return Err((loop_variables, stmts, original_break_collector));
  };
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
      name: it.name,
      initial_value: it.initial_value,
      increment_amount: it.increment_amount.clone(),
    })
    .collect_vec();

  // Phase 3: Compute all the derived induction variables.
  let derived_induction_variables = extract_derived_induction_variables(
    &all_basic_induction_variables,
    &stmts[2..],
    non_loop_invariant_variables,
  );
  let derived_induction_variable_names =
    derived_induction_variables.iter().map(|it| it.name).collect::<HashSet<_>>();

  // Phase 4: Remove undundant statements after getting all the induction variables.
  let mut statements = stmts.into_iter().skip(2).collect_vec();
  remove_dead_code_inside_loop(
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
    &mut statements,
  );

  Ok(OptimizableWhileLoop {
    basic_induction_variable_with_loop_guard,
    general_induction_variables,
    loop_variables_that_are_not_basic_induction_variables,
    derived_induction_variables,
    statements,
    break_collector,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{
    Callee, FunctionName, FunctionNameExpression, SymbolTable, INT_TYPE, ONE, ZERO,
  };

  #[test]
  fn boilterplate() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &SymbolTable::new();

    get_guard_operator(BinaryOperator::LT, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::LE, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::GE, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::GT, false).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::LT, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::LE, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::GE, true).unwrap().invert().clone().invert().to_op();
    get_guard_operator(BinaryOperator::GT, true).unwrap().invert().clone().invert().to_op();
    assert!(get_guard_operator(BinaryOperator::EQ, true).is_none());

    BasicInductionVariableWithLoopGuard {
      name: PStr::LOWER_A,
      initial_value: ZERO,
      increment_amount: PotentialLoopInvariantExpression::Int(0),
      guard_operator: GuardOperator::GE,
      guard_expression: PotentialLoopInvariantExpression::Int(0),
    }
    .as_general_basic_induction_variable()
    .clone()
    .debug_print(heap, table);
    DerivedInductionVariableWithName {
      name: PStr::LOWER_A,
      base_name: PStr::LOWER_A,
      multiplier: PotentialLoopInvariantExpression::Int(0),
      immediate: PotentialLoopInvariantExpression::Int(0),
    }
    .clone()
    .debug_print(heap, table);
  }

  #[test]
  fn merge_invariant_multiplication_for_loop_optimization_tests() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &SymbolTable::new();

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
        &PotentialLoopInvariantExpression::Var(VariableName::new(
          heap.alloc_str_for_test("v"),
          INT_TYPE
        ))
      )
      .unwrap()
      .to_expression()
      .debug_print(heap, table)
    );
    assert_eq!(
      "(v: int)",
      merge_invariant_multiplication_for_loop_optimization(
        &PotentialLoopInvariantExpression::Var(VariableName::new(
          heap.alloc_str_for_test("v"),
          INT_TYPE
        )),
        &PotentialLoopInvariantExpression::Int(1),
      )
      .unwrap()
      .to_expression()
      .debug_print(heap, table)
    );
    assert!(merge_invariant_multiplication_for_loop_optimization(
      &PotentialLoopInvariantExpression::Var(VariableName::new(
        heap.alloc_str_for_test("v"),
        INT_TYPE
      )),
      &PotentialLoopInvariantExpression::Var(VariableName::new(
        heap.alloc_str_for_test("v"),
        INT_TYPE
      )),
    )
    .is_none());
  }

  #[test]
  fn merge_variable_addition_into_derived_induction_variable_test() {
    let heap = &mut samlang_heap::Heap::new();

    assert!(merge_variable_addition_into_derived_induction_variable(
      &DerivedInductionVariable {
        base_name: PStr::LOWER_A,
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
      &DerivedInductionVariable {
        base_name: PStr::LOWER_A,
        multiplier: PotentialLoopInvariantExpression::Var(VariableName::new(
          heap.alloc_str_for_test("vv"),
          INT_TYPE
        )),
        immediate: PotentialLoopInvariantExpression::Int(1),
      }
    )
    .is_none());

    let successful = merge_variable_addition_into_derived_induction_variable(
      &DerivedInductionVariable {
        base_name: PStr::LOWER_A,
        multiplier: PotentialLoopInvariantExpression::Int(1),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
      &DerivedInductionVariable {
        base_name: PStr::LOWER_A,
        multiplier: PotentialLoopInvariantExpression::Int(2),
        immediate: PotentialLoopInvariantExpression::Int(1),
      },
    )
    .unwrap();
    assert_eq!(3, *successful.multiplier.as_int().unwrap());
    assert_eq!(2, *successful.immediate.as_int().unwrap());
  }

  #[test]
  fn extract_basic_induction_variables_tests() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &mut SymbolTable::new();

    assert!(extract_basic_induction_variables(
      &PStr::LOWER_I,
      &vec![
        GenenalLoopVariable {
          name: PStr::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO
        },
        GenenalLoopVariable {
          name: PStr::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO
        },
      ],
      &[],
      &HashSet::new()
    )
    .is_none());

    assert!(extract_basic_induction_variables(
      &PStr::LOWER_I,
      &vec![
        GenenalLoopVariable {
          name: PStr::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: PStr::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
      ],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          Expression::StringName(PStr::LOWER_A)
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_J, INT_TYPE),
          Expression::StringName(PStr::LOWER_A),
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j")
      ]),
    )
    .is_none());

    let ExtractedBasicInductionVariables {
      loop_variables_that_are_not_basic_induction_variables,
      all_basic_induction_variables,
      basic_induction_variable_with_associated_loop_guard,
    } = extract_basic_induction_variables(
      &PStr::LOWER_I,
      &vec![
        GenenalLoopVariable {
          name: PStr::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: PStr::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
      ],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_J, INT_TYPE),
          Expression::int(3),
        ),
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j"),
      ]),
    )
    .unwrap();
    assert!(loop_variables_that_are_not_basic_induction_variables.is_empty());
    assert_eq!(
      vec![
        "{name: i, initial_value: 0, increment_amount: 1, loop_value_collector: tmp_i}",
        "{name: j, initial_value: 0, increment_amount: 3, loop_value_collector: tmp_j}",
      ],
      all_basic_induction_variables.iter().map(|it| it.debug_print(heap, table)).collect_vec()
    );
    assert_eq!(
      "{name: i, initial_value: 0, increment_amount: 1, loop_value_collector: tmp_i}",
      basic_induction_variable_with_associated_loop_guard.debug_print(heap, table)
    );
  }

  #[test]
  fn extract_derived_induction_variables_tests() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &SymbolTable::new();

    assert_eq!(
      vec![
        "{name: tmp_x, base_name: i, multiplier: 5, immediate: 5}",
        "{name: tmp_y, base_name: i, multiplier: 5, immediate: 11}",
        "{name: tmp_z, base_name: i, multiplier: 10, immediate: 16}"
      ],
      extract_derived_induction_variables(
        &[
          GeneralBasicInductionVariableWithLoopValueCollector {
            name: PStr::LOWER_I,
            initial_value: ZERO,
            increment_amount: PotentialLoopInvariantExpression::Int(1),
            loop_value_collector: heap.alloc_str_for_test("tmp_i"),
          },
          GeneralBasicInductionVariableWithLoopValueCollector {
            name: PStr::LOWER_J,
            initial_value: ZERO,
            increment_amount: PotentialLoopInvariantExpression::Int(3),
            loop_value_collector: heap.alloc_str_for_test("tmp_j"),
          }
        ],
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ONE
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_J, INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_x"),
            BinaryOperator::MUL,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            Expression::int(5),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_y"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
            Expression::int(6),
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(PStr::LOWER_A),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(PStr::LOWER_A),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_z"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("tmp_y"), INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_useless_1"),
            BinaryOperator::MINUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("tmp_y"), INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_useless_2"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("tmp_useless_1"), INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_useless_3"),
            BinaryOperator::PLUS,
            ZERO,
            Expression::var_name(heap.alloc_str_for_test("tmp_useless_1"), INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_useless_4"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_useless_1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("tmp_useless_1"), INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_useless_6"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            Expression::var_name(PStr::LOWER_J, INT_TYPE),
          ),
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j"),
          heap.alloc_str_for_test("tmp_x"),
          heap.alloc_str_for_test("tmp_y"),
          heap.alloc_str_for_test("tmp_useless_1"),
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &[GeneralBasicInductionVariableWithLoopValueCollector {
        name: PStr::LOWER_I,
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: heap.alloc_str_for_test("tmp_i"),
      }],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ONE
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_J, INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE),
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j")
      ]),
    )
    .is_empty());

    assert!(extract_derived_induction_variables(
      &[GeneralBasicInductionVariableWithLoopValueCollector {
        name: PStr::LOWER_I,
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: heap.alloc_str_for_test("tmp_i"),
      }],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ONE
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_J, INT_TYPE),
          Expression::StringName(heap.alloc_str_for_test("outside")),
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j")
      ]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &[GeneralBasicInductionVariableWithLoopValueCollector {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: heap.alloc_str_for_test("tmp_i"),
        }],
        &[
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            ZERO,
          )
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j")
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &[GeneralBasicInductionVariableWithLoopValueCollector {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: heap.alloc_str_for_test("tmp_i"),
        }],
        &[
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO,
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
          )
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j")
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: 1, immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &[GeneralBasicInductionVariableWithLoopValueCollector {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            heap.alloc_str_for_test("outside"),
            INT_TYPE
          )),
          loop_value_collector: heap.alloc_str_for_test("tmp_i"),
        }],
        &[
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::MUL,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            ONE
          )
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j")
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &[GeneralBasicInductionVariableWithLoopValueCollector {
        name: PStr::LOWER_I,
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
          heap.alloc_str_for_test("outside"),
          INT_TYPE
        )),
        loop_value_collector: heap.alloc_str_for_test("tmp_i"),
      }],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          Expression::int(2)
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j")
      ]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: tmp_j, base_name: i, multiplier: (outside: int), immediate: (outside: int)}"],
      extract_derived_induction_variables(
        &[GeneralBasicInductionVariableWithLoopValueCollector {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Var(VariableName::new(
            heap.alloc_str_for_test("outside"),
            INT_TYPE
          )),
          loop_value_collector: heap.alloc_str_for_test("tmp_i"),
        }],
        &[
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ONE
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::MUL,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
          )
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j")
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &[GeneralBasicInductionVariableWithLoopValueCollector {
        name: PStr::LOWER_I,
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(2),
        loop_value_collector: heap.alloc_str_for_test("tmp_i"),
      }],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          Expression::int(2)
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("outside"), INT_TYPE)
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j")
      ]),
    )
    .is_empty());

    assert_eq!(
      vec!["{name: t1, base_name: i, multiplier: 1, immediate: 2}"],
      extract_derived_induction_variables(
        &[GeneralBasicInductionVariableWithLoopValueCollector {
          name: PStr::LOWER_I,
          initial_value: ZERO,
          increment_amount: PotentialLoopInvariantExpression::Int(1),
          loop_value_collector: heap.alloc_str_for_test("tmp_i"),
        }],
        &[
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ONE
          ),
          Statement::binary(
            heap.alloc_str_for_test("t1"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            ONE
          )
        ],
        &HashSet::from([
          PStr::LOWER_A,
          PStr::LOWER_I,
          PStr::LOWER_J,
          heap.alloc_str_for_test("tmp_i"),
          heap.alloc_str_for_test("tmp_j"),
          heap.alloc_str_for_test("t1")
        ]),
      )
      .iter()
      .map(|it| it.debug_print(heap, table))
      .collect_vec()
    );

    assert!(extract_derived_induction_variables(
      &[GeneralBasicInductionVariableWithLoopValueCollector {
        name: PStr::LOWER_I,
        initial_value: ZERO,
        increment_amount: PotentialLoopInvariantExpression::Int(1),
        loop_value_collector: heap.alloc_str_for_test("tmp_i"),
      }],
      &[
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          BinaryOperator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ONE
        ),
        Statement::binary(
          heap.alloc_str_for_test("t1"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          ONE
        )
      ],
      &HashSet::from([
        PStr::LOWER_A,
        PStr::LOWER_I,
        PStr::LOWER_J,
        heap.alloc_str_for_test("tmp_i"),
        heap.alloc_str_for_test("tmp_j"),
        heap.alloc_str_for_test("t1")
      ]),
    )
    .is_empty());
  }

  #[test]
  fn remove_dead_code_inside_loop_coverage_test() {
    let heap = &mut samlang_heap::Heap::new();

    remove_dead_code_inside_loop(
      &vec![
        GenenalLoopVariable {
          name: PStr::LOWER_A,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        },
        GenenalLoopVariable {
          name: PStr::LOWER_A,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("name"), INT_TYPE),
        },
      ],
      &mut vec![],
    );
  }

  #[test]
  fn extract_loop_guard_structure_rejection_rests() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &mut SymbolTable::new();

    let non_loop_invariant_variables =
      HashSet::from([PStr::LOWER_A, PStr::LOWER_A, PStr::LOWER_B, heap.alloc_str_for_test("cc")]);

    assert!(extract_loop_guard_structure((&vec![], &None), &non_loop_invariant_variables).is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          },
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![Statement::binary(
          heap.alloc_str_for_test("cc"),
          BinaryOperator::LT,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ZERO
        ),],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          },
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(PStr::LOWER_A, BinaryOperator::PLUS, ZERO, ZERO),
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          }
        ],
        &None
      ),
      &HashSet::new()
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::StructInit {
            struct_variable_name: PStr::LOWER_A,
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("T")),
            expression_list: vec![],
          },
          Statement::SingleIf { condition: ZERO, invert_condition: false, statements: vec![] }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf { condition: ZERO, invert_condition: false, statements: vec![] }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          }
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
              expression_list: vec![]
            }]
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
              expression_list: vec![]
            }],
            s2: vec![Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
              expression_list: vec![]
            }],
            final_assignments: vec![]
          },
          Statement::IndexedAccess {
            name: PStr::LOWER_A,
            type_: INT_TYPE,
            pointer_expression: ZERO,
            index: 0
          },
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(PStr::LOWER_A),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE)
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None
          },
          Statement::Break(ZERO)
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::EQ,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
              expression_list: vec![]
            }]
          },
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());

    assert!(extract_loop_guard_structure(
      (
        &vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::StringName(heap.alloc_str_for_test("cc")),
            invert_condition: false,
            statements: vec![Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
              expression_list: vec![]
            }]
          },
        ],
        &None
      ),
      &non_loop_invariant_variables
    )
    .is_none());
  }

  #[test]
  fn extract_optimizable_while_loop_rejection_tests() {
    let heap = &mut samlang_heap::Heap::new();

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::StringName(heap.alloc_str_for_test("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
        ],
        None
      ),
      &HashSet::new()
    )
    .is_err());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::EQ,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::StringName(heap.alloc_str_for_test("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          )
        ],
        None
      ),
      &HashSet::new()
    )
    .is_err());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::LT,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::StringName(heap.alloc_str_for_test("cc")),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)]
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          )
        ],
        None
      ),
      &HashSet::new()
    )
    .is_err());

    assert!(extract_optimizable_while_loop(
      (
        vec![],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::GE,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ONE
          ),
        ],
        None
      ),
      &HashSet::new()
    )
    .is_err());
  }

  #[test]
  fn extract_optimizable_while_loop_acceptance_test() {
    let heap = &mut samlang_heap::Heap::new();
    let table = &SymbolTable::new();

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
            name: PStr::LOWER_I,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: PStr::LOWER_J,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("x"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
          },
        ],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            BinaryOperator::GE,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_I, INT_TYPE),
            ONE,
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_J, INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_x"),
            BinaryOperator::MUL,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            Expression::int(5),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_y"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
            Expression::int(6),
          ),
        ],
        Some(VariableName { name: heap.alloc_str_for_test("bc"), type_: INT_TYPE }),
      ),
      &HashSet::new(),
    )
    .unwrap();
    assert_eq!(
      "{name: i, initial_value: 0, increment_amount: 1, guard_operator: LT, guard_expression: 0}",
      basic_induction_variable_with_loop_guard.debug_print(heap, table)
    );
    assert_eq!(
      vec!["{name: j, initial_value: 0, increment_amount: 3}"],
      general_induction_variables.iter().map(|it| it.debug_print(heap, table)).collect_vec()
    );
    assert_eq!(
      vec!["{name: x, initial_value: 0, loop_value: (tmp_x: int)}"],
      loop_variables_that_are_not_basic_induction_variables
        .iter()
        .map(|it| it.pretty_print(heap, table))
        .collect_vec()
    );
    assert_eq!(
      vec![
        "{name: tmp_x, base_name: i, multiplier: 5, immediate: 5}",
        "{name: tmp_y, base_name: i, multiplier: 5, immediate: 11}",
      ],
      derived_induction_variables.iter().map(|it| it.debug_print(heap, table)).collect_vec()
    );
    assert!(statements.is_empty());
    let (n, _, v) = break_collector.unwrap();
    assert_eq!("bc", n.as_str(heap));
    assert_eq!("0", v.debug_print(heap, table));
  }
}
