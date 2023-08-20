use itertools::Itertools;

use super::loc::Location;
use crate::common::{Heap, PStr};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub(crate) enum Description {
  UnitType,
  BoolType,
  IntType,
  AnyType,
  PrivateMember,
  PublicMember,
  GeneralFunctionType,
  GeneralNominalType,
  GeneralInterfaceType,
  GeneralClassType,
  GeneralNonAbstractType,
  GenericType(PStr),
  Class(PStr),
  NominalType { name: PStr, type_args: Vec<Description> },
  FunctionType(Vec<Description>, Box<Description>),
  TypeParameter(PStr, Option<Box<Description>>),
}

impl Description {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Self::UnitType => "unit".to_string(),
      Self::BoolType => "bool".to_string(),
      Self::IntType => "int".to_string(),
      Self::AnyType => "any".to_string(),
      Self::PrivateMember => "private member".to_string(),
      Self::PublicMember => "public member".to_string(),
      Self::GeneralFunctionType => "function type".to_string(),
      Self::GeneralNominalType => "nominal type".to_string(),
      Self::GeneralInterfaceType => "interface type".to_string(),
      Self::GeneralClassType => "class type".to_string(),
      Self::GeneralNonAbstractType => "non-abstract type".to_string(),
      Self::GenericType(n) => n.as_str(heap).to_string(),
      Self::Class(n) => format!("class {}", n.as_str(heap)),
      Self::NominalType { name, type_args } if type_args.is_empty() => {
        name.as_str(heap).to_string()
      }
      Self::NominalType { name, type_args } => {
        format!(
          "{}<{}>",
          name.as_str(heap),
          type_args.iter().map(|t| t.pretty_print(heap)).join(", ")
        )
      }
      Self::FunctionType(param_types, return_type) => {
        format!(
          "({}) -> {}",
          param_types.iter().map(|t| t.pretty_print(heap)).join(", "),
          return_type.pretty_print(heap)
        )
      }
      Self::TypeParameter(name, None) => name.as_str(heap).to_string(),
      Self::TypeParameter(name, Some(bound)) => {
        format!("{} : {}", name.as_str(heap), bound.pretty_print(heap))
      }
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
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
    assert!(Description::UnitType <= Description::UnitType);
    assert_eq!(Description::UnitType.cmp(&Description::UnitType), std::cmp::Ordering::Equal);
    assert!(Reason::dummy() <= Reason::dummy());
    assert_eq!(Reason::dummy().cmp(&Reason::dummy()), std::cmp::Ordering::Equal);
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
    assert_eq!("private member", Description::PrivateMember.pretty_print(heap));
    assert_eq!("public member", Description::PublicMember.pretty_print(heap));
    assert_eq!("function type", Description::GeneralFunctionType.pretty_print(heap));
    assert_eq!("nominal type", Description::GeneralNominalType.pretty_print(heap));
    assert_eq!("interface type", Description::GeneralInterfaceType.pretty_print(heap));
    assert_eq!("class type", Description::GeneralClassType.pretty_print(heap));
    assert_eq!("non-abstract type", Description::GeneralNonAbstractType.pretty_print(heap));
    assert_eq!("A", Description::GenericType(well_known_pstrs::UPPER_A).pretty_print(heap));
    assert_eq!("class A", Description::Class(well_known_pstrs::UPPER_A).pretty_print(heap));
    assert_eq!(
      "A",
      Description::NominalType { name: well_known_pstrs::UPPER_A, type_args: vec![] }
        .pretty_print(heap)
    );
    assert_eq!(
      "A<int>",
      Description::NominalType {
        name: well_known_pstrs::UPPER_A,
        type_args: vec![Description::IntType]
      }
      .clone()
      .pretty_print(heap)
    );
    assert_eq!(
      "(int) -> int",
      Description::FunctionType(vec![Description::IntType], Box::new(Description::IntType))
        .pretty_print(heap)
    );
    assert_eq!("A", Description::TypeParameter(well_known_pstrs::UPPER_A, None).pretty_print(heap));
    assert_eq!(
      "A : int",
      Description::TypeParameter(well_known_pstrs::UPPER_A, Some(Box::new(Description::IntType)))
        .pretty_print(heap)
    );
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
