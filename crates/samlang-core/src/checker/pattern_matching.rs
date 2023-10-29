use itertools::Itertools;
use samlang_collections::list::{cons, list, one, PersistentList};
use samlang_heap::{ModuleReference, PStr};
use std::{
  collections::{HashMap, VecDeque},
  rc::Rc,
};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub(super) struct VariantPatternConstructor {
  pub(super) module_reference: ModuleReference,
  pub(super) class_name: PStr,
  pub(super) variant_name: PStr,
}

#[derive(Debug)]
enum AbstractPatternNodeInner {
  // We assume the elements are normalized to add wildcard to not-mentioned fields.
  StructLike {
    variant: Option<VariantPatternConstructor>,
    elements: PersistentList<AbstractPatternNode>,
  },
  Wildcard,
  Or(Vec<AbstractPatternNode>),
}

#[derive(Debug, Clone)]
pub(super) struct AbstractPatternNode(Rc<AbstractPatternNodeInner>);

impl AbstractPatternNode {
  pub(super) fn wildcard() -> Self {
    Self(Rc::new(AbstractPatternNodeInner::Wildcard))
  }

  pub(super) fn tuple(elements: Vec<AbstractPatternNode>) -> Self {
    Self(Rc::new(AbstractPatternNodeInner::StructLike { variant: None, elements: list(elements) }))
  }

  pub(super) fn variant(c: VariantPatternConstructor, elements: Vec<AbstractPatternNode>) -> Self {
    Self(Rc::new(AbstractPatternNodeInner::StructLike {
      variant: Some(c),
      elements: list(elements),
    }))
  }

  pub(super) fn enum_(c: VariantPatternConstructor) -> Self {
    Self(Rc::new(AbstractPatternNodeInner::StructLike {
      variant: Some(c),
      elements: PersistentList::NULL,
    }))
  }

  pub(super) fn nothing() -> Self {
    Self(Rc::new(AbstractPatternNodeInner::Or(Vec::with_capacity(0))))
  }

  pub(super) fn or(possibilities: Vec<AbstractPatternNode>) -> Self {
    Self(Rc::new(AbstractPatternNodeInner::Or(possibilities)))
  }
}

struct PatternVector(PersistentList<AbstractPatternNode>);

struct PatternMatrix(Vec<PatternVector>);

pub(super) trait PatternMatchingContext {
  fn is_variant_signature_complete(
    module_reference: ModuleReference,
    class_name: PStr,
    variant_name: &[PStr],
  ) -> bool;
}

pub(super) fn is_additional_pattern_useful<CX: PatternMatchingContext>(
  existing_patterns: &[AbstractPatternNode],
  pattern: AbstractPatternNode,
) -> bool {
  useful_internal::<CX>(
    &PatternMatrix(existing_patterns.iter().map(|p| PatternVector(one(p.clone()))).collect_vec()),
    PatternVector(one(pattern)),
  )
}

/// http://moscova.inria.fr/~maranget/papers/warn/warn.pdf
fn useful_internal<CX: PatternMatchingContext>(p: &PatternMatrix, q: PatternVector) -> bool {
  if p.0.is_empty() {
    return true;
  }
  let Some((q_first, q_rest)) = q.0.pop() else {
    return p.0.is_empty();
  };
  match q_first.0.as_ref() {
    AbstractPatternNodeInner::StructLike { variant, elements: rs } => {
      let rs_len = rs.len();
      useful_internal::<CX>(
        &convert_into_specialized_matrix(p, *variant, rs_len),
        PatternVector(rs.clone().append(q_rest)),
      )
    }
    AbstractPatternNodeInner::Wildcard => {
      let mut root_constructors = HashMap::new();
      let mut find_constructor_pattern_queue =
        p.0.iter().filter_map(|r| r.0.first()).collect::<VecDeque<_>>();
      while let Some(pattern) = find_constructor_pattern_queue.pop_front() {
        match pattern.0.as_ref() {
          AbstractPatternNodeInner::Wildcard => {}
          AbstractPatternNodeInner::StructLike { variant, elements } => {
            root_constructors.insert(*variant, elements.len());
          }
          AbstractPatternNodeInner::Or(possibilities) => {
            find_constructor_pattern_queue.extend(possibilities.iter())
          }
        }
      }
      if is_signature_complete::<CX>(&root_constructors) {
        for (variant, rs_len) in root_constructors {
          let mut new_q = q_rest.clone();
          for _ in 0..rs_len {
            new_q = cons(AbstractPatternNode::wildcard(), new_q);
          }
          if useful_internal::<CX>(
            &convert_into_specialized_matrix(p, variant, rs_len),
            PatternVector(new_q),
          ) {
            return true;
          }
        }
        false
      } else {
        let mut default_matrix_rows = vec![];
        let mut convert_to_default_matrix_queue =
          p.0.iter().map(|PatternVector(r)| r.clone()).collect::<VecDeque<_>>();
        while let Some(p_row) = convert_to_default_matrix_queue.pop_front() {
          match p_row.first().unwrap().0.as_ref() {
            AbstractPatternNodeInner::StructLike { .. } => { /* skip */ }
            AbstractPatternNodeInner::Wildcard => {
              default_matrix_rows.push(PatternVector(p_row.rest()));
            }
            AbstractPatternNodeInner::Or(possibilities) => {
              for r in possibilities {
                convert_to_default_matrix_queue.push_front(cons(r.clone(), p_row.rest()));
              }
            }
          }
        }
        useful_internal::<CX>(&PatternMatrix(default_matrix_rows), PatternVector(q_rest))
      }
    }
    AbstractPatternNodeInner::Or(possibilities) => possibilities
      .iter()
      .any(|r| useful_internal::<CX>(p, PatternVector(cons(r.clone(), q_rest.clone())))),
  }
}

fn convert_into_specialized_matrix_row(
  new_rows: &mut Vec<PatternVector>,
  PatternVector(p_row): &PatternVector,
  variant: Option<VariantPatternConstructor>,
  rs_len: usize,
) {
  let p_first = p_row.first().unwrap();
  match p_first.0.as_ref() {
    AbstractPatternNodeInner::StructLike { variant: p_last_variant, elements: rs } => {
      match (p_last_variant.as_ref(), variant) {
        (Some(a), Some(b)) if a != &b => {
          // Different constructors. Skip
        }
        _ => {
          debug_assert_eq!(rs_len, rs.len());
          new_rows.push(PatternVector(rs.clone().append(p_row.rest())));
        }
      }
    }
    AbstractPatternNodeInner::Wildcard => {
      let mut new_row = p_row.rest();
      for _ in 0..rs_len {
        new_row = cons(AbstractPatternNode::wildcard(), new_row);
      }
      new_rows.push(PatternVector(new_row));
    }
    AbstractPatternNodeInner::Or(possibilities) => {
      for r in possibilities {
        convert_into_specialized_matrix_row(
          new_rows,
          &PatternVector(cons(r.clone(), p_row.rest())),
          variant,
          rs_len,
        )
      }
    }
  }
}

fn convert_into_specialized_matrix(
  p: &PatternMatrix,
  variant: Option<VariantPatternConstructor>,
  rs_len: usize,
) -> PatternMatrix {
  let mut new_rows = vec![];
  for p_row in &p.0 {
    convert_into_specialized_matrix_row(&mut new_rows, p_row, variant, rs_len)
  }
  PatternMatrix(new_rows)
}

fn is_signature_complete<CX: PatternMatchingContext>(
  root_constructors: &HashMap<Option<VariantPatternConstructor>, usize>,
) -> bool {
  if root_constructors.contains_key(&None) {
    return true;
  }
  if root_constructors.is_empty() {
    return false;
  }
  let mut variants_grouped = vec![];
  for (key, group) in
    &root_constructors.keys().filter_map(|c| *c).group_by(|c| (c.module_reference, c.class_name))
  {
    variants_grouped.push((key, group.map(|g| g.variant_name).collect_vec()));
  }
  assert!(variants_grouped.len() == 1);
  let ((mod_ref, class_name), variants) =
    variants_grouped.pop().expect("Already checked it's non-empty.");
  CX::is_variant_signature_complete(mod_ref, class_name, &variants)
}

#[cfg(test)]
mod tests {
  use samlang_heap::{ModuleReference, PStr};

  use super::{AbstractPatternNode as P, PatternMatchingContext, VariantPatternConstructor};

  const OPTION: PStr = PStr::six_letter_literal(b"Option");
  const SOME: PStr = PStr::four_letter_literal(b"Some");
  const NONE: PStr = PStr::four_letter_literal(b"None");

  const OPTION_SOME: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: OPTION,
    variant_name: SOME,
  };
  const OPTION_NONE: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: OPTION,
    variant_name: NONE,
  };

  const LETTERS: PStr = PStr::seven_letter_literal(b"Letters");

  const LETTERS_A: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_A,
  };
  const LETTERS_B: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_B,
  };
  const LETTERS_C: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_C,
  };
  const LETTERS_D: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_D,
  };
  const LETTERS_E: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_E,
  };
  const LETTERS_F: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_F,
  };
  const LETTERS_G: VariantPatternConstructor = VariantPatternConstructor {
    module_reference: ModuleReference::ROOT,
    class_name: LETTERS,
    variant_name: PStr::UPPER_G,
  };

  struct MockingPatternMatchingContext;

  impl PatternMatchingContext for MockingPatternMatchingContext {
    fn is_variant_signature_complete(
      _module_reference: ModuleReference,
      class_name: PStr,
      variant_name: &[PStr],
    ) -> bool {
      if class_name == OPTION {
        variant_name.contains(&SOME) && variant_name.contains(&NONE)
      } else if class_name == LETTERS {
        variant_name.contains(&PStr::UPPER_A)
          && variant_name.contains(&PStr::UPPER_B)
          && variant_name.contains(&PStr::UPPER_C)
          && variant_name.contains(&PStr::UPPER_D)
          && variant_name.contains(&PStr::UPPER_E)
          && variant_name.contains(&PStr::UPPER_F)
          && variant_name.contains(&PStr::UPPER_G)
      } else {
        false
      }
    }
  }

  fn useful(matrix: &[&[P]], vector: &[P]) -> bool {
    super::useful_internal::<MockingPatternMatchingContext>(
      &super::PatternMatrix(
        matrix.iter().map(|r| super::PatternVector(super::list(r.to_vec()))).collect(),
      ),
      super::PatternVector(super::list(vector.to_vec())),
    )
  }

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", OPTION_NONE).is_empty());
    assert!(!format!("{:?}", P::wildcard()).is_empty());
    assert_eq!(LETTERS, LETTERS_A.clone().class_name);
    assert!(!MockingPatternMatchingContext::is_variant_signature_complete(
      ModuleReference::ROOT,
      PStr::PANIC,
      &[],
    ));
  }

  #[test]
  fn test_base_case() {
    assert!(useful(&[], &[]));
    assert!(!useful(&[&[]], &[]));
  }

  #[test]
  fn test_two_wildcards() {
    assert!(useful(&[], &[P::wildcard()]));
    assert!(!useful(&[&[P::wildcard()]], &[P::wildcard()]));
  }

  #[test]
  fn test_simple_enums() {
    assert!(useful(
      &[
        &[P::enum_(LETTERS_A)],
        &[P::enum_(LETTERS_B)],
        &[P::enum_(LETTERS_C)],
        &[P::enum_(LETTERS_D)],
        &[P::enum_(LETTERS_E)],
      ],
      &[P::or(vec![P::enum_(LETTERS_F), P::enum_(LETTERS_G)])]
    ));
    assert!(!useful(
      &[
        &[P::enum_(LETTERS_A)],
        &[P::enum_(LETTERS_B)],
        &[P::or(vec![P::enum_(LETTERS_C), P::enum_(LETTERS_D)])],
        &[P::enum_(LETTERS_E)],
        &[P::enum_(LETTERS_F)],
        &[P::enum_(LETTERS_G)],
      ],
      &[P::wildcard()]
    ));
  }

  #[test]
  fn test_simple_enums_two_columns() {
    assert!(useful(
      &[
        &[P::enum_(LETTERS_A), P::wildcard()],
        &[P::enum_(LETTERS_B), P::wildcard()],
        &[P::enum_(LETTERS_C), P::wildcard()],
        &[P::enum_(LETTERS_D), P::wildcard()],
        &[P::enum_(LETTERS_E), P::wildcard()],
        &[P::enum_(LETTERS_F), P::wildcard()],
        &[P::enum_(LETTERS_G), P::or(vec![P::enum_(LETTERS_A), P::enum_(LETTERS_B)])],
      ],
      &[P::wildcard(), P::wildcard()],
    ));
    assert!(useful(
      &[
        &[P::wildcard(), P::enum_(LETTERS_A)],
        &[P::wildcard(), P::enum_(LETTERS_B)],
        &[P::wildcard(), P::enum_(LETTERS_C)],
        &[P::wildcard(), P::enum_(LETTERS_D)],
        &[P::wildcard(), P::enum_(LETTERS_E)],
        &[P::wildcard(), P::enum_(LETTERS_F)],
        &[P::or(vec![P::enum_(LETTERS_A), P::enum_(LETTERS_B)]), P::enum_(LETTERS_G)],
      ],
      &[P::wildcard(), P::wildcard()],
    ));
  }

  #[test]
  fn option_test_1() {
    // None, _         => useful
    // _, None         => useful
    // Some _, Some _  => useful
    // _, _            => useless

    assert!(useful(&[], &[P::enum_(OPTION_NONE), P::wildcard()]));
    assert!(useful(
      &[&[P::enum_(OPTION_NONE), P::wildcard()]],
      &[P::wildcard(), P::enum_(OPTION_NONE)]
    ));
    assert!(useful(
      &[&[P::enum_(OPTION_NONE), P::wildcard()], &[P::wildcard(), P::enum_(OPTION_NONE)],],
      &[P::variant(OPTION_SOME, vec![P::wildcard()]), P::variant(OPTION_SOME, vec![P::wildcard()])]
    ));
    assert!(!useful(
      &[&[P::enum_(OPTION_NONE), P::wildcard()], &[P::wildcard(), P::enum_(OPTION_NONE)],],
      &[P::nothing()]
    ));
    assert!(!useful(
      &[
        &[P::enum_(OPTION_NONE), P::wildcard()],
        &[P::wildcard(), P::enum_(OPTION_NONE)],
        &[
          P::variant(OPTION_SOME, vec![P::wildcard()]),
          P::variant(OPTION_SOME, vec![P::wildcard()])
        ],
      ],
      &[P::wildcard(), P::wildcard()]
    ));
  }

  #[test]
  fn option_test_2() {
    // (None, _)         => useful
    // (_, None)         => useful
    // (Some _, Some _)  => useful
    // _                 => useless

    assert!(useful(&[], &[P::tuple(vec![P::enum_(OPTION_NONE), P::wildcard()])]));
    assert!(useful(
      &[&[P::tuple(vec![P::enum_(OPTION_NONE), P::wildcard()])]],
      &[P::tuple(vec![P::wildcard(), P::enum_(OPTION_NONE)])]
    ));
    assert!(useful(
      &[
        &[P::tuple(vec![P::enum_(OPTION_NONE), P::wildcard()])],
        &[P::tuple(vec![P::wildcard(), P::enum_(OPTION_NONE)])]
      ],
      &[P::tuple(vec![
        P::variant(OPTION_SOME, vec![P::wildcard()]),
        P::variant(OPTION_SOME, vec![P::wildcard()])
      ])]
    ));
    assert!(!super::is_additional_pattern_useful::<MockingPatternMatchingContext>(
      &[
        P::tuple(vec![P::enum_(OPTION_NONE), P::wildcard()]),
        P::tuple(vec![P::wildcard(), P::enum_(OPTION_NONE)]),
        P::tuple(vec![
          P::variant(OPTION_SOME, vec![P::wildcard()]),
          P::variant(OPTION_SOME, vec![P::wildcard()]),
        ]),
      ],
      P::wildcard()
    ));
  }
}
