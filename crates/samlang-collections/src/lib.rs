use std::{collections::HashMap, hash::Hash};

pub struct LocalStackedContext<K: Clone + Eq + Hash, V: Clone> {
  local_values_stack: Vec<HashMap<K, V>>,
}

impl<K: Clone + Eq + Hash, V: Clone> LocalStackedContext<K, V> {
  pub fn new() -> LocalStackedContext<K, V> {
    LocalStackedContext { local_values_stack: vec![HashMap::new()] }
  }

  pub fn get(&mut self, name: &K) -> Option<&V> {
    self.local_values_stack.iter().rev().find_map(|level| level.get(name))
  }

  pub fn insert(&mut self, name: K, value: V) -> Option<V> {
    let previous = self.local_values_stack.iter().find_map(|m| m.get(&name)).cloned();
    let stack = &mut self.local_values_stack;
    let last_index = stack.len() - 1;
    stack[last_index].insert(name, value);
    previous
  }

  pub fn push_scope(&mut self) {
    self.local_values_stack.push(HashMap::new());
  }

  pub fn pop_scope(&mut self) {
    self.local_values_stack.pop();
  }
}

impl<K: Clone + Eq + Hash, V: Clone> Default for LocalStackedContext<K, V> {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::LocalStackedContext;
  use pretty_assertions::assert_eq;

  fn insert_crash_on_error(
    cx: &mut LocalStackedContext<&'static str, i32>,
    name: &'static str,
    value: i32,
  ) {
    if cx.insert(name, value).is_some() {
      panic!()
    }
  }

  #[test]
  fn local_stacked_context_basic_methods_tests() {
    let mut context = LocalStackedContext::default();
    assert!(context.get(&"b").is_none());
    insert_crash_on_error(&mut context, "a", 3);
    assert_eq!(3, *context.get(&"a").unwrap());
    context.push_scope();
    context.pop_scope();
  }

  #[should_panic]
  #[test]
  fn local_stacked_context_conflict_detection_tests() {
    let mut context = LocalStackedContext::new();
    let a = "a";
    context.insert(a.clone(), 3);
    context.insert(a.clone(), 3);
    insert_crash_on_error(&mut context, a, 3);
  }

  #[test]
  fn local_stacked_context_captured_values_tests() {
    let mut context = LocalStackedContext::new();
    insert_crash_on_error(&mut context, "a", 3);
    insert_crash_on_error(&mut context, "b", 3);
    context.push_scope();
    insert_crash_on_error(&mut context, "c", 3);
    insert_crash_on_error(&mut context, "d", 3);
    context.get(&"a");
    context.push_scope();
    context.get(&"a");
    context.get(&"b");
    context.get(&"d");
  }
}
