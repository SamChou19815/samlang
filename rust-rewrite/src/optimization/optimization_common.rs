use crate::{
  ast::hir::*,
  common::{rc_string, LocalStackedContext, Str},
};

pub(super) struct ResourceAllocator {
  cse_hoisting_temp_id: i32,
  inlining_prefix_id: i32,
  loop_temp_id: i32,
}

impl ResourceAllocator {
  pub(super) fn new() -> ResourceAllocator {
    ResourceAllocator { cse_hoisting_temp_id: 0, inlining_prefix_id: 0, loop_temp_id: 0 }
  }

  pub(super) fn alloc_cse_hoisted_temp(&mut self) -> Str {
    let temp = rc_string(format!("_cse_{}_", self.cse_hoisting_temp_id));
    self.cse_hoisting_temp_id += 1;
    temp
  }

  pub(super) fn alloc_inlining_temp_prefix(&mut self) -> Str {
    let temp = rc_string(format!("_inline_{}_", self.inlining_prefix_id));
    self.inlining_prefix_id += 1;
    temp
  }

  pub(super) fn alloc_loop_temp(&mut self) -> Str {
    let temp = rc_string(format!("_loop_{}", self.loop_temp_id));
    self.loop_temp_id += 1;
    temp
  }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct IndexAccessBindedValue {
  pub(super) type_: Type,
  pub(super) pointer_expression: Expression,
  pub(super) index: usize,
}

impl ToString for IndexAccessBindedValue {
  fn to_string(&self) -> String {
    format!("{}[{}]", self.pointer_expression.debug_print(), self.index)
  }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) struct BinaryBindedValue {
  pub(super) operator: Operator,
  pub(super) e1: Expression,
  pub(super) e2: Expression,
}

impl ToString for BinaryBindedValue {
  fn to_string(&self) -> String {
    format!("({}{}{})", self.e1.debug_print(), self.operator.to_string(), self.e2.debug_print())
  }
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub(super) enum BindedValue {
  IndexedAccess(IndexAccessBindedValue),
  Binary(BinaryBindedValue),
}

impl ToString for BindedValue {
  fn to_string(&self) -> String {
    match self {
      BindedValue::IndexedAccess(e) => e.to_string(),
      BindedValue::Binary(e) => e.to_string(),
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
    self.to_string().cmp(&other.to_string())
  }
}

pub(super) type LocalValueContextForOptimization = LocalStackedContext<Expression>;

impl LocalValueContextForOptimization {
  pub(super) fn checked_bind(&mut self, name: &Str, expression: Expression) {
    if !self.insert(name, expression) {
      panic!()
    }
  }
}

pub(super) fn if_else_or_null(
  condition: Expression,
  s1: Vec<Statement>,
  s2: Vec<Statement>,
  final_assignments: Vec<(Str, Type, Expression, Expression)>,
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
  use crate::common::rcs;
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let mut allocator = ResourceAllocator::new();
    assert_eq!("_cse_0_", allocator.alloc_cse_hoisted_temp().as_str());
    assert_eq!("_inline_0_", allocator.alloc_inlining_temp_prefix().as_str());
    assert_eq!("_loop_0", allocator.alloc_loop_temp().as_str());
    assert_eq!("_cse_1_", allocator.alloc_cse_hoisted_temp().as_str());
    assert_eq!("_inline_1_", allocator.alloc_inlining_temp_prefix().as_str());
    assert_eq!("_loop_1", allocator.alloc_loop_temp().as_str());

    assert!(if_else_or_null(ZERO, vec![], vec![], vec![]).is_empty());
    assert!(!if_else_or_null(ZERO, vec![], vec![Statement::Break(ZERO)], vec![]).is_empty());
    assert!(single_if_or_null(ZERO, false, vec![]).is_empty());
    assert!(!single_if_or_null(ZERO, false, vec![Statement::Break(ZERO)]).is_empty());

    let mut hasher = DefaultHasher::new();
    let bv1 = BindedValue::IndexedAccess(IndexAccessBindedValue {
      type_: INT_TYPE,
      pointer_expression: ZERO,
      index: 0,
    });
    let bv2 =
      BindedValue::Binary(BinaryBindedValue { operator: Operator::PLUS, e1: ZERO, e2: ZERO });
    assert_eq!("0[0]", bv1.clone().to_string());
    assert_eq!("(0+0)", bv2.clone().to_string());
    bv1.hash(&mut hasher);
    bv2.hash(&mut hasher);
    assert!(bv1.eq(&bv1));
    assert!(bv2.eq(&bv2));
  }

  #[should_panic]
  #[test]
  fn local_value_context_for_optimization_panic() {
    let mut cx = LocalValueContextForOptimization::new();
    cx.checked_bind(&rcs("a"), ZERO);
    cx.checked_bind(&rcs("a"), ZERO);
  }
}
