use crate::{
  ast::hir::*,
  common::{LocalStackedContext, PStr},
};

#[derive(Clone, PartialEq, Eq)]
pub(super) struct IndexAccessBindedValue {
  pub(super) type_: Type,
  pub(super) pointer_expression: Expression,
  pub(super) index: usize,
}

impl IndexAccessBindedValue {
  pub(super) fn dump_to_string(&self) -> String {
    format!("{}[{}]", self.pointer_expression.dump_to_string(), self.index)
  }
}

#[derive(Clone, PartialEq, Eq)]
pub(super) struct BinaryBindedValue {
  pub(super) operator: Operator,
  pub(super) e1: Expression,
  pub(super) e2: Expression,
}

impl BinaryBindedValue {
  pub(super) fn dump_to_string(&self) -> String {
    format!(
      "({}{}{})",
      self.e1.dump_to_string(),
      self.operator.to_string(),
      self.e2.dump_to_string()
    )
  }
}

#[derive(Clone, PartialEq, Eq)]
pub(super) enum BindedValue {
  IndexedAccess(IndexAccessBindedValue),
  Binary(BinaryBindedValue),
}

impl BindedValue {
  pub(super) fn dump_to_string(&self) -> String {
    match self {
      BindedValue::IndexedAccess(e) => e.dump_to_string(),
      BindedValue::Binary(e) => e.dump_to_string(),
    }
  }
}

impl PartialOrd for BindedValue {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

impl Ord for BindedValue {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    self.dump_to_string().cmp(&other.dump_to_string())
  }
}

pub(super) type LocalValueContextForOptimization = LocalStackedContext<PStr, Expression>;

impl LocalValueContextForOptimization {
  pub(super) fn checked_bind(&mut self, name: &PStr, expression: Expression) {
    if !self.insert(name, expression) {
      panic!()
    }
  }
}

pub(super) fn if_else_or_null(
  condition: Expression,
  s1: Vec<Statement>,
  s2: Vec<Statement>,
  final_assignments: Vec<(PStr, Type, Expression, Expression)>,
) -> Vec<Statement> {
  if s1.is_empty() && s2.is_empty() && final_assignments.is_empty() {
    vec![]
  } else {
    vec![Statement::IfElse { condition, s1, s2, final_assignments }]
  }
}

pub(super) fn single_if_or_null(
  condition: Expression,
  invert_condition: bool,
  statements: Vec<Statement>,
) -> Vec<Statement> {
  if statements.is_empty() {
    vec![]
  } else {
    vec![Statement::SingleIf { condition, invert_condition, statements }]
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn boilterplate() {
    assert!(if_else_or_null(ZERO, vec![], vec![], vec![]).is_empty());
    assert!(!if_else_or_null(ZERO, vec![], vec![Statement::Break(ZERO)], vec![]).is_empty());
    assert!(single_if_or_null(ZERO, false, vec![]).is_empty());
    assert!(!single_if_or_null(ZERO, false, vec![Statement::Break(ZERO)]).is_empty());

    let bv1 = BindedValue::IndexedAccess(IndexAccessBindedValue {
      type_: INT_TYPE,
      pointer_expression: ZERO,
      index: 0,
    });
    let bv2 =
      BindedValue::Binary(BinaryBindedValue { operator: Operator::PLUS, e1: ZERO, e2: ZERO });
    bv1.dump_to_string();
    bv2.dump_to_string();
    let _ = bv1.clone();
    let _ = bv2.clone();
    assert!(bv1.eq(&bv1));
    assert!(bv2.eq(&bv2));
  }

  #[should_panic]
  #[test]
  fn local_value_context_for_optimization_panic() {
    let mut cx = LocalValueContextForOptimization::new();
    let heap = &mut crate::common::Heap::new();
    cx.checked_bind(&heap.alloc_str("a"), ZERO);
    cx.checked_bind(&heap.alloc_str("a"), ZERO);
  }
}
