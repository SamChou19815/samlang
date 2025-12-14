use samlang_heap::{Heap, ModuleReference};

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Position(pub u32, pub u32);

pub const DUMMY_POSITION: Position = Position(u32::MAX, u32::MAX);

impl Position {
  pub fn is_dummy(self) -> bool {
    self == DUMMY_POSITION
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Location {
  pub module_reference: ModuleReference,
  pub start: Position,
  pub end: Position,
}

impl Location {
  pub fn dummy() -> Self {
    Self { module_reference: ModuleReference::DUMMY, start: DUMMY_POSITION, end: DUMMY_POSITION }
  }

  pub fn document_start(module_reference: ModuleReference) -> Self {
    Self { module_reference, start: Position(0, 0), end: Position(0, 0) }
  }

  pub fn full_document(module_reference: ModuleReference) -> Self {
    Self { module_reference, start: Position(0, 0), end: Position(u32::MAX, u32::MAX) }
  }

  pub fn from_pos(sl: u32, sc: u32, el: u32, ec: u32) -> Self {
    Self {
      module_reference: ModuleReference::DUMMY,
      start: Position(sl, sc),
      end: Position(el, ec),
    }
  }

  pub fn contains_position(&self, position: Position) -> bool {
    self.start <= position && self.end >= position
  }

  pub fn contains(&self, other: &Self) -> bool {
    self.contains_position(other.start) && self.contains_position(other.end)
  }

  pub fn union(&self, other: &Self) -> Self {
    assert!(self.module_reference == other.module_reference);
    let start = if self.start < other.start { self.start } else { other.start };
    let end = if self.end > other.end { self.end } else { other.end };
    Self { module_reference: self.module_reference, start, end }
  }

  pub fn pretty_print_without_file(&self) -> String {
    if self.start.is_dummy() && self.end.is_dummy() {
      return "DUMMY".to_owned();
    }
    let (a, b, c, d) = (
      self.start.0 as u64 + 1,
      self.start.1 as u64 + 1,
      self.end.0 as u64 + 1,
      self.end.1 as u64 + 1,
    );
    format!("{}:{}-{}:{}", a, b, c, d)
  }

  pub fn pretty_print(&self, heap: &Heap) -> String {
    format!("{}:{}", self.module_reference.to_filename(heap), self.pretty_print_without_file())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use std::{cmp::Ordering, collections::HashSet};

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?} {:?}", DUMMY_POSITION.clone(), Location::dummy().clone()).is_empty());
    HashSet::new().insert(DUMMY_POSITION);
    HashSet::new().insert(ModuleReference::DUMMY);
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
    assert_eq!("DUMMY.sam:DUMMY", Location::dummy().pretty_print(&heap));
    assert_eq!("DUMMY.sam:2:2-3:5", Location::from_pos(1, 1, 2, 4).pretty_print(&heap));
  }

  #[test]
  fn location_contains_position_tests() {
    assert_eq!(true, Location::from_pos(1, 3, 3, 1).contains_position(Position(2, 2)));
    assert_eq!(true, Location::from_pos(1, 3, 3, 1).contains_position(Position(1, 3)));
    assert_eq!(true, Location::from_pos(1, 3, 3, 1).contains_position(Position(3, 1)));
    assert_eq!(false, Location::from_pos(1, 3, 3, 1).contains_position(Position(1, 2)));
    assert_eq!(false, Location::from_pos(1, 3, 3, 1).contains_position(Position(3, 2)));
  }

  #[test]
  fn location_contains_test() {
    assert_eq!(true, Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 3, 3, 1)));
    assert_eq!(true, Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 4, 3, 0)));
    assert_eq!(false, Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 3, 3, 2)));
    assert_eq!(false, Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 2, 3, 1)));
    assert_eq!(false, Location::from_pos(1, 3, 3, 1).contains(&Location::from_pos(1, 2, 3, 2)));
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
