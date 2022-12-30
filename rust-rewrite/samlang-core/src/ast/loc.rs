use crate::common::{rc, rc_string, rcs, Str};
use itertools::join;
use std::{collections::HashMap, rc::Rc};

#[derive(Debug, Copy, Clone, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Position(pub i32, pub i32);

pub(crate) const DUMMY_POSITION: Position = Position(-1, -1);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ModuleReferenceEnum {
  Root,
  Ordinary(Vec<Str>),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ModuleReference(Rc<ModuleReferenceEnum>);

impl ToString for ModuleReference {
  fn to_string(&self) -> String {
    match &*self.0 {
      ModuleReferenceEnum::Root => "".to_string(),
      ModuleReferenceEnum::Ordinary(parts) => join(parts, "."),
    }
  }
}

impl ModuleReference {
  pub(crate) fn dummy() -> ModuleReference {
    ModuleReference(rc(ModuleReferenceEnum::Ordinary(vec![rcs("__DUMMY__")])))
  }

  pub(crate) fn root() -> ModuleReference {
    ModuleReference(rc(ModuleReferenceEnum::Root))
  }

  pub(crate) fn ordinary(parts: Vec<Str>) -> ModuleReference {
    ModuleReference(rc(ModuleReferenceEnum::Ordinary(parts)))
  }

  pub fn from_string_parts(parts: Vec<String>) -> ModuleReference {
    ModuleReference(rc(ModuleReferenceEnum::Ordinary(parts.into_iter().map(rc_string).collect())))
  }

  pub fn to_filename(&self) -> String {
    match &*self.0 {
      ModuleReferenceEnum::Root => ".sam".to_string(),
      ModuleReferenceEnum::Ordinary(parts) => join(parts, "/") + ".sam",
    }
  }

  pub fn encoded(&self) -> String {
    match &*self.0 {
      ModuleReferenceEnum::Root => "".to_string(),
      ModuleReferenceEnum::Ordinary(parts) => {
        parts.iter().map(|it| it.replace('-', "_")).collect::<Vec<String>>().join("$")
      }
    }
  }
}

type Sources<M> = HashMap<ModuleReference, M>;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Location {
  pub module_reference: ModuleReference,
  pub start: Position,
  pub end: Position,
}

impl ToString for Location {
  fn to_string(&self) -> String {
    format!("{}:{}", self.module_reference.to_filename(), self.to_string_without_file())
  }
}

impl Location {
  pub(crate) fn dummy() -> Location {
    Location {
      module_reference: ModuleReference::dummy(),
      start: DUMMY_POSITION,
      end: DUMMY_POSITION,
    }
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
    Location { module_reference: self.module_reference.clone(), start, end }
  }

  pub(crate) fn to_string_without_file(&self) -> String {
    format!("{}:{}-{}:{}", self.start.0 + 1, self.start.1 + 1, self.end.0 + 1, self.end.1 + 1)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::{cmp::Ordering, collections::HashSet};

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", DUMMY_POSITION.clone()).is_empty());
    assert!(!format!("{:?}", ModuleReferenceEnum::Root.clone()).is_empty());
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
  fn module_reference_to_string_tests() {
    assert_eq!("__DUMMY__", ModuleReference::dummy().to_string());
    assert_eq!("", ModuleReference::root().to_string());
    assert_eq!("Foo", ModuleReference::from_string_parts(vec!["Foo".to_string()]).to_string());
    assert_eq!("Foo.Bar", ModuleReference::ordinary(vec![rcs("Foo"), rcs("Bar")]).to_string());
  }

  #[test]
  fn module_reference_to_filename_tests() {
    assert_eq!(".sam", ModuleReference::root().to_filename());
    assert_eq!("__DUMMY__.sam", ModuleReference::dummy().to_filename());
    assert_eq!("Foo.sam", ModuleReference::ordinary(vec![rcs("Foo")]).to_filename());
    assert_eq!(
      "Foo/Bar.sam",
      ModuleReference::ordinary(vec![rcs("Foo"), rcs("Bar")]).to_filename()
    );
  }

  #[test]
  fn module_reference_encoded_tests() {
    assert_eq!("", ModuleReference::root().encoded());
    assert_eq!("__DUMMY__", ModuleReference::dummy().encoded());
    assert_eq!("Foo$Bar", ModuleReference::ordinary(vec![rcs("Foo"), rcs("Bar")]).encoded());
  }

  #[test]
  fn location_to_string_tests() {
    assert_eq!("__DUMMY__.sam:0:0-0:0", Location::dummy().to_string());
    assert_eq!("__DUMMY__.sam:2:2-3:5", Location::from_pos(1, 1, 2, 4).to_string());
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
