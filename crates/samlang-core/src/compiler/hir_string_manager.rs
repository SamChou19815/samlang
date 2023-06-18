use crate::{ast::hir::GlobalVariable, common::PStr, Heap};
use std::collections::HashMap;

// TODO: move this to global variable since heap allows us to provide a better API
pub(super) struct StringManager {
  global_variable_reference_map: HashMap<PStr, GlobalVariable>,
}

impl StringManager {
  pub(super) fn new() -> StringManager {
    StringManager { global_variable_reference_map: HashMap::new() }
  }

  pub(super) fn all_global_variables(self) -> Vec<GlobalVariable> {
    let mut vars = vec![];
    for (_, v) in self.global_variable_reference_map {
      vars.push(v);
    }
    vars
  }

  pub(super) fn allocate(&mut self, heap: &mut Heap, str: PStr) -> GlobalVariable {
    if let Some(existing) = self.global_variable_reference_map.get(&str) {
      *existing
    } else {
      let v = GlobalVariable {
        name: heap
          .alloc_string(format!("GLOBAL_STRING_{}", self.global_variable_reference_map.len())),
        content: str,
      };
      self.global_variable_reference_map.insert(str, v);
      v
    }
  }
}

#[cfg(test)]
mod tests {
  use super::StringManager;
  use crate::{common::well_known_pstrs, Heap};
  use pretty_assertions::assert_eq;

  #[test]
  fn tests() {
    let heap = &mut Heap::new();
    let mut s = StringManager::new();
    assert_eq!(well_known_pstrs::LOWER_A, s.allocate(heap, well_known_pstrs::LOWER_A).content);
    assert_eq!(well_known_pstrs::LOWER_B, s.allocate(heap, well_known_pstrs::LOWER_B).content);
    assert_eq!(well_known_pstrs::LOWER_A, s.allocate(heap, well_known_pstrs::LOWER_A).content);
    assert_eq!(2, s.all_global_variables().len());
  }
}
