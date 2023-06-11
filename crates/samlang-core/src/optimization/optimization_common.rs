use crate::{
  ast::hir::Operator,
  ast::mir::*,
  common::{LocalStackedContext, PStr},
};

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct IndexAccessBindedValue {
  pub(super) type_: Type,
  pub(super) pointer_expression: Expression,
  pub(super) index: usize,
}

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct BinaryBindedValue {
  pub(super) operator: Operator,
  pub(super) e1: Expression,
  pub(super) e2: Expression,
}

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum BindedValue {
  IndexedAccess(IndexAccessBindedValue),
  Binary(BinaryBindedValue),
}

pub(super) type LocalValueContextForOptimization = LocalStackedContext<PStr, Expression>;

impl LocalValueContextForOptimization {
  pub(super) fn checked_bind(&mut self, name: PStr, expression: Expression) {
    if self.insert(name, expression).is_some() {
      panic!()
    }
  }
}

pub(super) fn if_else_or_null(
  condition: Expression,
  s1: Vec<Statement>,
  s2: Vec<Statement>,
  final_assignments: Vec<(PStr, Type, Expression, Expression)>,
) -> Option<Statement> {
  if s1.is_empty() && s2.is_empty() && final_assignments.is_empty() {
    None
  } else {
    Some(Statement::IfElse { condition, s1, s2, final_assignments })
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
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    assert!(if_else_or_null(ZERO, vec![], vec![], vec![]).is_none());
    assert!(if_else_or_null(ZERO, vec![], vec![Statement::Break(ZERO)], vec![]).is_some());
    assert!(single_if_or_null(ZERO, false, vec![]).is_empty());
    assert!(!single_if_or_null(ZERO, false, vec![Statement::Break(ZERO)]).is_empty());

    let bv1 = BindedValue::IndexedAccess(
      IndexAccessBindedValue { type_: INT_TYPE, pointer_expression: ZERO, index: 0 }.clone(),
    );
    let bv2 = BindedValue::Binary(
      BinaryBindedValue { operator: Operator::PLUS, e1: ZERO, e2: ZERO }.clone(),
    );
    let _ = bv1.clone();
    let _ = bv2.clone();
    assert_eq!(Some(std::cmp::Ordering::Equal), bv1.partial_cmp(&bv1));
    assert_eq!(Some(std::cmp::Ordering::Equal), bv2.partial_cmp(&bv2));
    assert!(bv1.eq(&bv1));
    assert!(bv2.eq(&bv2));
    let mut hasher = DefaultHasher::new();
    bv1.hash(&mut hasher);
    bv2.hash(&mut hasher);
  }

  #[should_panic]
  #[test]
  fn local_value_context_for_optimization_panic() {
    let mut cx = LocalValueContextForOptimization::new();
    let heap = &mut crate::common::Heap::new();
    cx.checked_bind(heap.alloc_str_for_test("a"), ZERO);
    cx.checked_bind(heap.alloc_str_for_test("a"), ZERO);
  }
}
