use itertools::Itertools;
use samlang_ast::Description;
use samlang_collections::list::{cons, list, one, PersistentList};
use samlang_heap::{ModuleReference, PStr};
use std::{
  collections::{HashMap, VecDeque},
  rc::Rc,
};

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub(super) struct VariantPatternConstructor {
  pub(super) module_reference: ModuleReference,
  pub(super) class_name: PStr,
  pub(super) variant_name: PStr,
}

#[derive(Debug, PartialEq, Eq)]
enum AbstractPatternNodeInner {
  // We assume the elements are normalized to add wildcard to not-mentioned fields.
  StructLike {
    variant: Option<VariantPatternConstructor>,
    elements: PersistentList<AbstractPatternNode>,
  },
  Wildcard,
  Or(Vec<AbstractPatternNode>),
}

impl AbstractPatternNodeInner {
  fn to_description(&self) -> Description {
    match self {
      Self::StructLike { variant: None, elements } => Description::TuplePattern(
        elements.iter().map(AbstractPatternNode::to_description).collect(),
      ),
      Self::StructLike {
        variant:
          Some(VariantPatternConstructor { module_reference: _, class_name: _, variant_name }),
        elements,
      } => Description::VariantPattern(
        *variant_name,
        elements.iter().map(AbstractPatternNode::to_description).collect(),
      ),
      Self::Wildcard => Description::WildcardPattern,
      Self::Or(choices) => {
        Description::OrPattern(choices.iter().map(AbstractPatternNode::to_description).collect())
      }
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AbstractPatternNode(Rc<AbstractPatternNodeInner>);

impl AbstractPatternNode {
  fn to_description(&self) -> Description {
    self.0.to_description()
  }

  fn toplevel_elements_to_description(PatternVector(elements): PatternVector) -> Description {
    if elements.len() == 1 {
      elements.first().unwrap().to_description()
    } else {
      AbstractPatternNodeInner::StructLike { variant: None, elements }.to_description()
    }
  }
}

impl AbstractPatternNode {
  pub(super) fn wildcard() -> Self {
    Self(Rc::new(AbstractPatternNodeInner::Wildcard))
  }

  pub(super) fn tuple(elements: Vec<AbstractPatternNode>) -> Self {
    Self::tuple_or_variant(None, elements)
  }

  pub(super) fn variant(c: VariantPatternConstructor, elements: Vec<AbstractPatternNode>) -> Self {
    Self::tuple_or_variant(Some(c), elements)
  }

  pub(super) fn tuple_or_variant(
    variant: Option<VariantPatternConstructor>,
    elements: Vec<AbstractPatternNode>,
  ) -> Self {
    Self(Rc::new(AbstractPatternNodeInner::StructLike { variant, elements: list(elements) }))
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
  fn variant_signature_incomplete_names(
    &self,
    module_reference: ModuleReference,
    class_name: PStr,
    variant_name: &[PStr],
  ) -> HashMap<PStr, usize>;
}

pub(super) fn is_additional_pattern_useful<CX: PatternMatchingContext>(
  cx: &CX,
  existing_patterns: &[AbstractPatternNode],
  pattern: AbstractPatternNode,
) -> bool {
  useful_internal(
    cx,
    &PatternMatrix(existing_patterns.iter().map(|p| PatternVector(one(p.clone()))).collect_vec()),
    PatternVector(one(pattern)),
  )
}

pub(super) fn incomplete_counterexample<CX: PatternMatchingContext>(
  cx: &CX,
  existing_patterns: &[AbstractPatternNode],
) -> Option<Description> {
  incomplete_counterexample_internal(
    cx,
    &PatternMatrix(existing_patterns.iter().map(|p| PatternVector(one(p.clone()))).collect_vec()),
    1,
  )
  .map(AbstractPatternNode::toplevel_elements_to_description)
}

/// http://moscova.inria.fr/~maranget/papers/warn/warn.pdf.
/// Section 3.1
fn useful_internal<CX: PatternMatchingContext>(
  cx: &CX,
  p: &PatternMatrix,
  q: PatternVector,
) -> bool {
  if p.0.is_empty() {
    return true;
  }
  let Some((q_first, q_rest)) = q.0.pop() else {
    return p.0.is_empty();
  };
  match q_first.0.as_ref() {
    AbstractPatternNodeInner::StructLike { variant, elements: rs } => {
      let rs_len = rs.len();
      useful_internal(
        cx,
        &convert_into_specialized_matrix(p, *variant, rs_len),
        PatternVector(rs.clone().append(q_rest)),
      )
    }
    AbstractPatternNodeInner::Wildcard => {
      let root_constructors = find_roots_constructors(p);
      if signature_incomplete_names(cx, &root_constructors).is_none() {
        for (variant, rs_len) in root_constructors {
          let mut new_q = q_rest.clone();
          for _ in 0..rs_len {
            new_q = cons(AbstractPatternNode::wildcard(), new_q);
          }
          if useful_internal(
            cx,
            &convert_into_specialized_matrix(p, variant, rs_len),
            PatternVector(new_q),
          ) {
            return true;
          }
        }
        false
      } else {
        let default_matrix = default_matrix(p);
        useful_internal(cx, &default_matrix, PatternVector(q_rest))
      }
    }
    AbstractPatternNodeInner::Or(possibilities) => possibilities
      .iter()
      .any(|r| useful_internal(cx, p, PatternVector(cons(r.clone(), q_rest.clone())))),
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

fn find_roots_constructors(p: &PatternMatrix) -> HashMap<Option<VariantPatternConstructor>, usize> {
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
  root_constructors
}

fn default_matrix(p: &PatternMatrix) -> PatternMatrix {
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
  PatternMatrix(default_matrix_rows)
}

fn signature_incomplete_names<CX: PatternMatchingContext>(
  cx: &CX,
  root_constructors: &HashMap<Option<VariantPatternConstructor>, usize>,
) -> Option<Vec<(VariantPatternConstructor, usize)>> {
  if root_constructors.contains_key(&None) {
    return None;
  }
  if root_constructors.is_empty() {
    return Some(Vec::with_capacity(0));
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
  let result = cx
    .variant_signature_incomplete_names(mod_ref, class_name, &variants)
    .into_iter()
    .map(|(n, size)| {
      (VariantPatternConstructor { module_reference: mod_ref, class_name, variant_name: n }, size)
    })
    .collect_vec();
  if result.is_empty() {
    None
  } else {
    Some(result)
  }
}

/// http://moscova.inria.fr/~maranget/papers/warn/warn.pdf
/// Section 5
fn incomplete_counterexample_internal<CX: PatternMatchingContext>(
  cx: &CX,
  p: &PatternMatrix,
  n: usize,
) -> Option<PatternVector> {
  if n == 0 {
    if p.0.is_empty() {
      return Some(PatternVector(PersistentList::NULL));
    }
    return None;
  }
  let root_constructors = find_roots_constructors(p);
  if let Some(incomplete_names) = signature_incomplete_names(cx, &root_constructors) {
    let incomplete_vector = incomplete_counterexample_internal(cx, &default_matrix(p), n - 1)?;
    let head = if let Some((variant, size)) = incomplete_names.into_iter().min() {
      AbstractPatternNode::variant(
        variant,
        (0..size).map(|_| AbstractPatternNode::wildcard()).collect(),
      )
    } else {
      AbstractPatternNode::wildcard()
    };
    Some(PatternVector(cons(head, incomplete_vector.0)))
  } else {
    for (variant, a_k) in root_constructors.into_iter().sorted_by_key(|(k, _)| *k) {
      if let Some(incomplete_vector) = incomplete_counterexample_internal(
        cx,
        &convert_into_specialized_matrix(p, variant, a_k),
        a_k + n - 1,
      ) {
        let mut split_remaining_count = a_k;
        let mut split_remaining = incomplete_vector.0;
        let mut first_part_vec = Vec::with_capacity(a_k);
        while split_remaining_count > 0 {
          let (head, tail) = split_remaining.pop().unwrap();
          split_remaining = tail;
          first_part_vec.push(head);
          split_remaining_count -= 1;
        }
        return Some(PatternVector(cons(
          AbstractPatternNode::tuple_or_variant(variant, first_part_vec),
          split_remaining,
        )));
      }
    }
    None
  }
}

#[cfg(test)]
mod tests {
  use super::{
    AbstractPatternNode as P, PatternMatchingContext, PatternVector, VariantPatternConstructor,
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{ModuleReference, PStr};

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
    fn variant_signature_incomplete_names(
      &self,
      _module_reference: ModuleReference,
      class_name: PStr,
      variant_name: &[PStr],
    ) -> super::HashMap<PStr, usize> {
      if class_name == OPTION {
        let mut incomplete = super::HashMap::from([(SOME, 1), (NONE, 0)]);
        for n in variant_name {
          incomplete.remove(n);
        }
        incomplete
      } else if class_name == LETTERS {
        let mut incomplete = super::HashMap::from([
          (PStr::UPPER_A, 0),
          (PStr::UPPER_B, 0),
          (PStr::UPPER_C, 0),
          (PStr::UPPER_D, 0),
          (PStr::UPPER_E, 0),
          (PStr::UPPER_F, 0),
          (PStr::UPPER_G, 0),
        ]);
        for n in variant_name {
          incomplete.remove(n);
        }
        incomplete
      } else {
        super::HashMap::from([(SOME, 1), (NONE, 0)])
      }
    }
  }

  fn useful_and_counter_example(matrix: &[&[P]], vector: &[P]) -> (bool, Option<String>) {
    let matrix = super::PatternMatrix(
      matrix.iter().map(|r| super::PatternVector(super::list(r.to_vec()))).collect(),
    );
    let useful = super::useful_internal(
      &MockingPatternMatchingContext,
      &matrix,
      super::PatternVector(super::list(vector.to_vec())),
    );
    let counter_example = super::incomplete_counterexample_internal(
      &MockingPatternMatchingContext,
      &matrix,
      vector.len(),
    )
    .map(P::toplevel_elements_to_description)
    .map(|d| d.pretty_print(&samlang_heap::Heap::new()));
    (useful, counter_example)
  }

  fn useful(matrix: &[&[P]], vector: &[P]) -> bool {
    let (useful, counter_example) = useful_and_counter_example(matrix, vector);
    if useful {
      assert!(counter_example.is_some());
    }
    useful
  }

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", OPTION_NONE).is_empty());
    assert!(!format!("{:?}", P::wildcard()).is_empty());
    assert_eq!(LETTERS, LETTERS_A.clone().class_name);
    assert!(!MockingPatternMatchingContext
      .variant_signature_incomplete_names(ModuleReference::ROOT, PStr::PANIC, &[],)
      .is_empty());
    assert!(P::wildcard().eq(&P::wildcard()));
    assert_eq!(
      "_ | _",
      P::toplevel_elements_to_description(PatternVector(super::list(vec![P::or(vec![
        P::wildcard(),
        P::wildcard()
      ])])))
      .pretty_print(&samlang_heap::Heap::new())
    );
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
    assert_eq!(
      (true, Some("F".to_string())),
      useful_and_counter_example(
        &[
          &[P::enum_(LETTERS_A)],
          &[P::enum_(LETTERS_B)],
          &[P::enum_(LETTERS_C)],
          &[P::enum_(LETTERS_D)],
          &[P::enum_(LETTERS_E)],
        ],
        &[P::or(vec![P::enum_(LETTERS_F), P::enum_(LETTERS_G)])]
      )
    );
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
    assert_eq!(
      (true, Some("(G, C)".to_string())),
      useful_and_counter_example(
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
      )
    );
    assert_eq!(
      (true, Some("(C, G)".to_string())),
      useful_and_counter_example(
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
      )
    );
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
    assert_eq!(
      "(Some(_), Some(_))",
      super::incomplete_counterexample(
        &MockingPatternMatchingContext,
        &[
          P::tuple(vec![P::enum_(OPTION_NONE), P::wildcard()]),
          P::tuple(vec![P::wildcard(), P::enum_(OPTION_NONE)]),
        ],
      )
      .unwrap()
      .pretty_print(&samlang_heap::Heap::new())
    );
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
    assert!(!super::is_additional_pattern_useful(
      &MockingPatternMatchingContext,
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
