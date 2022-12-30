use crate::{
  ast::hir::GlobalVariable,
  common::{rc_string, Str},
};
use std::collections::HashMap;

pub(super) struct StringManager {
  next_global_variable_id: i32,
  global_variable_reference_map: HashMap<String, GlobalVariable>,
}

impl StringManager {
  pub(super) fn new() -> StringManager {
    StringManager { next_global_variable_id: 0, global_variable_reference_map: HashMap::new() }
  }

  pub(super) fn all_global_variables(self) -> Vec<GlobalVariable> {
    let mut vars = vec![];
    for (_, v) in self.global_variable_reference_map {
      vars.push(v);
    }
    vars
  }

  pub(super) fn allocate(&mut self, str: &Str) -> GlobalVariable {
    let key = format!("STRING_CONTENT_{}", str);
    if let Some(existing) = self.global_variable_reference_map.get(&key) {
      existing.clone()
    } else {
      let v = GlobalVariable {
        name: rc_string(format!("GLOBAL_STRING_{}", self.next_global_variable_id)),
        content: str.clone(),
      };
      self.next_global_variable_id += 1;
      self.global_variable_reference_map.insert(key, v.clone());
      v
    }
  }
}

#[cfg(test)]
mod tests {
  use super::StringManager;
  use crate::common::rcs;
  use pretty_assertions::assert_eq;

  #[test]
  fn tests() {
    let mut s = StringManager::new();
    assert_eq!(rcs("a"), s.allocate(&rcs("a")).content);
    assert_eq!(rcs("b"), s.allocate(&rcs("b")).content);
    assert_eq!(rcs("a"), s.allocate(&rcs("a")).content);
    assert_eq!(2, s.all_global_variables().len());
  }
}
