use super::loc::Location;

#[derive(Debug, Clone, PartialEq, Eq)]
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

  pub(crate) fn to_use_reason(&self, use_loc: Location) -> Reason {
    Reason { use_loc, def_loc: self.def_loc }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn boilterplate() {
    assert!(!format!("{:?}", Reason::dummy().clone()).is_empty());
    assert_eq!(Reason::builtin(), Reason::builtin());
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
