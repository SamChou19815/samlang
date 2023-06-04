use crate::common::{Heap, ModuleReference};
use std::collections::HashMap;

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Position(pub i32, pub i32);

pub(crate) const DUMMY_POSITION: Position = Position(-1, -1);

type Sources<M> = HashMap<ModuleReference, M>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Location {
  pub module_reference: ModuleReference,
  pub start: Position,
  pub end: Position,
}

impl Location {
  pub(crate) fn dummy() -> Location {
    Location {
      module_reference: ModuleReference::dummy(),
      start: DUMMY_POSITION,
      end: DUMMY_POSITION,
    }
  }

  pub(crate) fn document_start(module_reference: ModuleReference) -> Location {
    Location { module_reference, start: Position(0, 0), end: Position(0, 0) }
  }

  pub(crate) fn full_document(module_reference: ModuleReference) -> Location {
    Location { module_reference, start: Position(0, 0), end: Position(i32::MAX - 1, i32::MAX - 1) }
  }

  pub(crate) fn from_pos(sl: i32, sc: i32, el: i32, ec: i32) -> Location {
    Location {
      module_reference: ModuleReference::dummy(),
      start: Position(sl, sc),
      end: Position(el, ec),
    }
  }

  pub fn contains_position(&self, position: Position) -> bool {
    self.start <= position && self.end >= position
  }

  pub fn contains(&self, other: &Location) -> bool {
    self.contains_position(other.start) && self.contains_position(other.end)
  }

  pub fn union(&self, other: &Location) -> Location {
    assert!(self.module_reference == other.module_reference);
    let start = if self.start < other.start { self.start } else { other.start };
    let end = if self.end > other.end { self.end } else { other.end };
    Location { module_reference: self.module_reference, start, end }
  }

  pub(crate) fn pretty_print_without_file(&self) -> String {
    format!("{}:{}-{}:{}", self.start.0 + 1, self.start.1 + 1, self.end.0 + 1, self.end.1 + 1)
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    format!("{}:{}", self.module_reference.to_filename(heap), self.pretty_print_without_file())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::{cmp::Ordering, collections::HashSet};

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", DUMMY_POSITION.clone()).is_empty());
    assert!(!format!("{:?}", ModuleReference::dummy().clone()).is_empty());
    assert!(!format!("{:?}", Location::dummy().clone()).is_empty());

    HashSet::new().insert(DUMMY_POSITION);
    HashSet::new().insert(ModuleReference::dummy());
    HashSet::new().insert(Location::dummy());
  }

  #[test]
  fn position_compare_test() {
    assert!(Position(1, 1) == Position(1, 1));
    assert!(Position(1, 1) != Position(1, 2));
    assert!(Position(1, 1) < Position(1, 2));
    assert!(Position(1, 4) < Position(2, 1));
    assert!(Position(1, 4).cmp(&Position(2, 1)) == Ordering::Less);
  }

  #[test]
  fn location_to_string_tests() {
    let heap = Heap::new();
    assert_eq!("DUMMY.sam:0:0-0:0", Location::dummy().pretty_print(&heap));
    assert_eq!("DUMMY.sam:2:2-3:5", Location::from_pos(1, 1, 2, 4).pretty_print(&heap));
  }

  #[test]
  fn location_contains_position_tests() {
    assert!(Location::from_pos(1, 3, 3, 1).contains_position(Position(2, 2)));
    assert!(!Location::from_pos(1, 3, 3, 1).contains_position(Position(1, 2)));
    assert!(!Location::from_pos(1, 3, 3, 1).contains_position(Position(3, 2)));
  }

  #[test]
  fn location_contains_test() {
    assert!(Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 3, 3, 1)));
    assert!(Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 4, 3, 0)));
    assert!(!Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 3, 3, 2)));
    assert!(!Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 2, 3, 1)));
    assert!(!Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 2, 3, 2)));
  }

  #[test]
  fn location_union_test() {
    assert_eq!(
      Location::from_pos(1, 3, 4, 1),
      Location::from_pos(1, 3, 3, 1).union(&Location::from_pos(2, 3, 4, 1))
    );
    assert_eq!(
      Location::from_pos(1, 3, 4, 1),
      Location::from_pos(2, 3, 4, 1).union(&Location::from_pos(1, 3, 3, 1))
    );
    assert_eq!(
      Location::from_pos(1, 3, 4, 1),
      Location::from_pos(1, 3, 2, 3).union(&Location::from_pos(3, 1, 4, 1))
    );
    assert_eq!(
      Location::from_pos(1, 3, 4, 1),
      Location::from_pos(3, 1, 4, 1).union(&Location::from_pos(1, 3, 2, 3))
    );
  }
}
