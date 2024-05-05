use samlang_ast::hir::GlobalString;
use samlang_heap::PStr;
use std::collections::BTreeSet;

// TODO: move this to global variable since heap allows us to provide a better API
pub(super) struct StringManager {
  global_variable_reference_map: BTreeSet<PStr>,
}

impl StringManager {
  pub(super) fn new() -> StringManager {
    StringManager { global_variable_reference_map: BTreeSet::new() }
  }

  pub(super) fn all_global_variables(self) -> Vec<GlobalString> {
    self.global_variable_reference_map.into_iter().map(GlobalString).collect()
  }

  pub(super) fn allocate(&mut self, str: PStr) -> GlobalString {
    self.global_variable_reference_map.insert(str);
    GlobalString(str)
  }
}

#[cfg(test)]
mod tests {
  use super::StringManager;
  use pretty_assertions::assert_eq;
  use samlang_heap::PStr;

  #[test]
  fn tests() {
    let mut s = StringManager::new();
    assert_eq!(PStr::LOWER_A, s.allocate(PStr::LOWER_A).0);
    assert_eq!(PStr::LOWER_B, s.allocate(PStr::LOWER_B).0);
    assert_eq!(PStr::LOWER_A, s.allocate(PStr::LOWER_A).0);
    assert_eq!(2, s.all_global_variables().len());
  }
}
