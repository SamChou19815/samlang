use super::loc::Location;
use crate::common::{Heap, PStr};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Description {
  UnitType,
  BoolType,
  IntType,
  AnyType,
  GenericType(PStr),
  Class(PStr),
  NominalType { name: PStr, has_type_arguments: bool },
  FunctionType,
}

impl Description {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Description::UnitType => "unit".to_string(),
      Description::BoolType => "bool".to_string(),
      Description::IntType => "int".to_string(),
      Description::AnyType => "any".to_string(),
      Description::GenericType(n) => format!("generic type {}", n.as_str(heap)),
      Description::Class(n) => format!("class {}", n.as_str(heap)),
      Description::NominalType { name, has_type_arguments: false } => name.as_str(heap).to_string(),
      Description::NominalType { name, has_type_arguments: true } => {
        format!("{}<...>", name.as_str(heap))
      }
      Description::FunctionType => "function type".to_string(),
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct Reason {
  pub(crate) use_loc: Location,
  pub(crate) def_loc: Option<Location>,
}

impl Reason {
  pub(crate) fn dummy() -> Reason {
    Reason { use_loc: Location::dummy(), def_loc: Option::Some(Location::dummy()) }
  }

  // TODO(reason): Wait until we migrate to location only.
  pub(crate) fn builtin() -> Reason {
    Reason::dummy()
  }

  pub(crate) fn new(use_loc: Location, def_loc: Option<Location>) -> Reason {
    Reason { use_loc, def_loc }
  }

  pub(crate) fn to_use_reason(self, use_loc: Location) -> Reason {
    Reason { use_loc, def_loc: self.def_loc }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::common::well_known_pstrs;
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", Description::UnitType).is_empty());
    assert!(!format!("{:?}", Reason::dummy()).is_empty());
    assert_eq!(Reason::builtin(), Reason::builtin());
  }

  #[test]
  fn desc_tests() {
    let heap = &Heap::new();

    assert_eq!(Description::UnitType, Description::UnitType);

    assert_eq!("unit", Description::UnitType.pretty_print(heap));
    assert_eq!("bool", Description::BoolType.pretty_print(heap));
    assert_eq!("int", Description::IntType.pretty_print(heap));
    assert_eq!("any", Description::AnyType.pretty_print(heap));
    assert_eq!(
      "generic type A",
      Description::GenericType(well_known_pstrs::UPPER_A).pretty_print(heap)
    );
    assert_eq!("class A", Description::Class(well_known_pstrs::UPPER_A).pretty_print(heap));
    assert_eq!(
      "A",
      Description::NominalType { name: well_known_pstrs::UPPER_A, has_type_arguments: false }
        .pretty_print(heap)
    );
    assert_eq!(
      "A<...>",
      Description::NominalType { name: well_known_pstrs::UPPER_A, has_type_arguments: true }
        .clone()
        .pretty_print(heap)
    );
    assert_eq!("function type", Description::FunctionType.pretty_print(heap));
  }

  #[test]
  fn reposition_test() {
    assert_eq!(
      Reason::new(Location::from_pos(5, 6, 7, 8), Option::None),
      Reason::new(Location::from_pos(1, 2, 3, 4), Option::None)
        .to_use_reason(Location::from_pos(5, 6, 7, 8))
    );
  }
}
