use samlang_ast::{hir::BinaryOperator, mir::*};
use samlang_collections::local_stacked_context::LocalStackedContext;
use samlang_heap::PStr;
use std::ops::{Deref, DerefMut};

/// Forked from https://github.com/Sgeo/take_mut/blob/master/src/lib.rs
/// Assuming no panic
pub(super) fn take_mut<T, F: FnOnce(T) -> T>(mut_ref: &mut T, closure: F) {
  unsafe {
    let old_t = std::ptr::read(mut_ref);
    let new_t = closure(old_t);
    std::ptr::write(mut_ref, new_t);
  }
}

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct IndexAccessBindedValue {
  pub(super) type_: Type,
  pub(super) pointer_expression: Expression,
  pub(super) index: usize,
}

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct BinaryBindedValue {
  pub(super) operator: BinaryOperator,
  pub(super) e1: Expression,
  pub(super) e2: Expression,
}

#[derive(Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum BindedValue {
  IndexedAccess(IndexAccessBindedValue),
  Binary(BinaryBindedValue),
  IsPointer(Expression),
  Not(Expression),
}

pub(super) struct LocalValueContextForOptimization(LocalStackedContext<PStr, Expression>);

impl Deref for LocalValueContextForOptimization {
  type Target = LocalStackedContext<PStr, Expression>;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

impl DerefMut for LocalValueContextForOptimization {
  fn deref_mut(&mut self) -> &mut Self::Target {
    &mut self.0
  }
}

impl LocalValueContextForOptimization {
  pub(super) fn new() -> LocalValueContextForOptimization {
    LocalValueContextForOptimization(LocalStackedContext::new())
  }

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
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn take_mut_tests() {
    #[derive(PartialEq, Eq, Debug)]
    enum Foo {
      A,
      B,
    }
    assert_eq!("A", format!("{:?}", Foo::A));
    assert_eq!("B", format!("{:?}", Foo::B));
    impl Drop for Foo {
      fn drop(&mut self) {
        match *self {
          Foo::A => println!("Foo::A dropped"),
          Foo::B => println!("Foo::B dropped"),
        }
      }
    }
    let mut foo = Foo::A;
    super::take_mut(&mut foo, |f| {
      drop(f);
      Foo::B
    });
    assert_eq!(&foo, &Foo::B);
  }

  #[test]
  fn boilterplate() {
    assert_eq!(true, if_else_or_null(ZERO, vec![], vec![], vec![]).is_none());
    assert_eq!(true, if_else_or_null(ZERO, vec![], vec![Statement::Break(ZERO)], vec![]).is_some());
    assert_eq!(true, single_if_or_null(ZERO, false, vec![]).is_empty());
    assert_eq!(false, single_if_or_null(ZERO, false, vec![Statement::Break(ZERO)]).is_empty());

    let bv1 = BindedValue::IndexedAccess(IndexAccessBindedValue {
      type_: INT_32_TYPE,
      pointer_expression: ZERO,
      index: 0,
    });
    let bv2 =
      BindedValue::Binary(BinaryBindedValue { operator: BinaryOperator::PLUS, e1: ZERO, e2: ZERO });
    let bv3 = BindedValue::Not(ZERO);
    let bv4 = BindedValue::IsPointer(ZERO);
    assert_eq!(Some(std::cmp::Ordering::Equal), bv1.partial_cmp(&bv1));
    assert_eq!(Some(std::cmp::Ordering::Equal), bv2.partial_cmp(&bv2));
    assert_eq!(Some(std::cmp::Ordering::Equal), bv3.partial_cmp(&bv3));
    assert_eq!(Some(std::cmp::Ordering::Equal), bv4.partial_cmp(&bv4));
    assert_eq!(true, bv1.eq(&bv1));
    assert_eq!(true, bv2.eq(&bv2));
    assert_eq!(true, bv3.eq(&bv3));
    assert_eq!(true, bv4.eq(&bv4));
    let mut hasher = DefaultHasher::new();
    bv1.hash(&mut hasher);
    bv2.hash(&mut hasher);
    bv3.hash(&mut hasher);
    bv4.hash(&mut hasher);
  }

  #[should_panic]
  #[test]
  fn local_value_context_for_optimization_panic() {
    let mut cx = LocalValueContextForOptimization::new();
    cx.checked_bind(PStr::LOWER_A, ZERO);
    let _ = cx.deref();
    assert_eq!(ZERO, *cx.get(&PStr::LOWER_A).unwrap());
    cx.checked_bind(PStr::LOWER_A, ZERO);
  }
}
