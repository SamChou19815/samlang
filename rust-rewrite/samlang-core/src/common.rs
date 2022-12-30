use std::{collections::HashMap, fmt::Display, ops::Deref, rc::Rc};

#[inline(always)]
pub(crate) fn boxed<T>(v: T) -> Box<T> {
  Box::from(v)
}

#[inline(always)]
pub(crate) fn rc<T>(v: T) -> Rc<T> {
  Rc::from(v)
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Str(Rc<String>);

impl Display for Str {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}", self.0)
  }
}

impl Deref for Str {
  type Target = String;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

#[inline(always)]
pub(crate) fn rcs(s: &'static str) -> Str {
  Str(Rc::from(String::from(s)))
}

#[inline(always)]
pub(crate) fn rc_string(s: String) -> Str {
  Str(Rc::from(s))
}

#[inline(always)]
fn byte_digit_to_char(byte: u8) -> char {
  let u = if byte < 10 { b'0' + byte } else { b'a' + byte - 10 };
  u as char
}

pub(crate) fn int_vec_to_data_string(array: &Vec<i32>) -> String {
  let mut collector = vec![];
  for i in array {
    for b in i.to_le_bytes() {
      collector.push('\\');
      collector.push(byte_digit_to_char(b / 16));
      collector.push(byte_digit_to_char(b % 16));
    }
  }
  String::from_iter(collector.iter())
}

pub(crate) struct LocalStackedContext<V: Clone> {
  local_values_stack: Vec<HashMap<Str, V>>,
  captured_values_stack: Vec<HashMap<Str, V>>,
}

impl<V: Clone> LocalStackedContext<V> {
  pub(crate) fn new() -> LocalStackedContext<V> {
    LocalStackedContext {
      local_values_stack: vec![HashMap::new()],
      captured_values_stack: vec![HashMap::new()],
    }
  }

  pub(crate) fn get(&mut self, name: &Str) -> Option<&V> {
    let closest_stack_value = self.local_values_stack.last().unwrap().get(name);
    if closest_stack_value.is_some() {
      return closest_stack_value;
    }
    for level in (0..(self.local_values_stack.len() - 1)).rev() {
      let value = self.local_values_stack[level].get(name);
      if let Some(v) = value {
        for captured_level in (level + 1)..(self.captured_values_stack.len()) {
          self.captured_values_stack[captured_level].insert(name.clone(), v.clone());
        }
        return Some(v);
      }
    }
    None
  }

  pub(crate) fn insert(&mut self, name: &Str, value: V) -> bool {
    let mut no_collision = true;
    for m in &self.local_values_stack {
      if m.contains_key(name) {
        no_collision = false;
      }
    }
    let stack = &mut self.local_values_stack;
    let last_index = stack.len() - 1;
    stack[last_index].insert(name.clone(), value);
    no_collision
  }

  pub(crate) fn insert_crash_on_error(&mut self, name: &Str, value: V) {
    if !self.insert(name, value) {
      panic!()
    }
  }

  pub(crate) fn push_scope(&mut self) {
    self.local_values_stack.push(HashMap::new());
    self.captured_values_stack.push(HashMap::new());
  }

  pub(crate) fn pop_scope(&mut self) -> HashMap<Str, V> {
    self.local_values_stack.pop();
    self.captured_values_stack.pop().unwrap()
  }
}

#[cfg(test)]
mod tests {
  use super::{int_vec_to_data_string, rcs, LocalStackedContext};
  use itertools::Itertools;
  use std::collections::HashSet;

  #[test]
  fn boilterplate() {
    assert!(rcs("foo") < rcs("zuck"));
    assert!(rcs("foo").cmp(&rcs("zuck")).is_lt());
    assert!(rcs("foo").partial_cmp(&rcs("zuck")).is_some());
    assert!(rcs("foo") == rcs("foo"));
    assert!(!format!("{:?}", rcs("debug")).is_empty());
    assert_eq!(rcs("zuck"), rcs("zuck"));
    assert_eq!(Some('h'), rcs("hiya").chars().next());

    let mut set = HashSet::new();
    set.insert(rcs("sam"));
  }

  #[test]
  fn int_vec_to_data_string_tests() {
    assert_eq!(
      "\\01\\00\\00\\00\\02\\00\\00\\00\\03\\00\\00\\00\\04\\00\\00\\00",
      int_vec_to_data_string(&vec![1, 2, 3, 4])
    );
    assert_eq!(
      "\\01\\00\\00\\00\\7c\\00\\00\\00\\b3\\11\\00\\00\\21\\00\\00\\00",
      int_vec_to_data_string(&vec![1, 124, 4531, 33])
    );
  }

  #[test]
  fn local_stacked_context_basic_methods_tests() {
    let mut context = LocalStackedContext::new();
    assert!(context.get(&rcs("b")).is_none());
    context.insert_crash_on_error(&rcs("a"), 3);
    assert_eq!(3, *context.get(&rcs("a")).unwrap());
    context.push_scope();
    context.pop_scope();
  }

  #[should_panic]
  #[test]
  fn local_stacked_context_conflict_detection_tests() {
    let mut context = LocalStackedContext::new();
    let a = rcs("a");
    context.insert(&a, 3);
    context.insert(&a, 3);
    context.insert_crash_on_error(&a, 3);
  }

  #[test]
  fn local_stacked_context_captured_values_tests() {
    let mut context = LocalStackedContext::new();
    context.insert_crash_on_error(&rcs("a"), 3);
    context.insert_crash_on_error(&rcs("b"), 3);
    context.push_scope();
    context.insert_crash_on_error(&rcs("c"), 3);
    context.insert_crash_on_error(&rcs("d"), 3);
    context.get(&rcs("a"));
    context.push_scope();
    context.get(&rcs("a"));
    context.get(&rcs("b"));
    context.get(&rcs("d"));
    let captured_inner = context.pop_scope();
    let captured_outer = context.pop_scope();

    assert_eq!(
      vec!["a", "b", "d"],
      captured_inner.keys().into_iter().map(|s| s.as_str()).sorted().collect_vec()
    );
    assert_eq!(
      vec!["a", "b"],
      captured_outer.keys().into_iter().map(|s| s.as_str()).sorted().collect_vec()
    );
  }
}
