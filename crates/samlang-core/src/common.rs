use std::{
  collections::{HashMap, HashSet},
  fmt::Display,
  hash::Hash,
  ops::Deref,
  rc::Rc,
  time::Instant,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
enum PStrInner {
  Temp(u32),
  Permanent(&'static str),
}

/// A string pointer free to be copied. However, we have to do GC manually.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct PStr(PStrInner);

impl PStr {
  pub(crate) fn permanent(str: &'static str) -> PStr {
    PStr(PStrInner::Permanent(str))
  }

  pub(crate) fn as_str<'a>(&self, heap: &'a Heap) -> &'a str {
    match &self.0 {
      PStrInner::Temp(_) => {
        if let Some(s) = heap.str_pointer_table.get(self) {
          s
        } else {
          panic!("Use of freed string {:?}", self)
        }
      }
      PStrInner::Permanent(s) => s,
    }
  }
}

/// Users of the string heap is responsible for calling retain at appropriate places to do GC.
pub(crate) struct Heap {
  interned_str: HashMap<Rc<str>, PStr>,
  str_pointer_table: HashMap<PStr, Rc<str>>,
  id: u32,
}

impl Heap {
  pub(crate) fn new() -> Heap {
    Heap { interned_str: HashMap::new(), str_pointer_table: HashMap::new(), id: 0 }
  }

  pub(crate) fn get_allocated_str_opt(&self, str: &str) -> Option<PStr> {
    self.interned_str.get(&Rc::from(str)).cloned()
  }

  pub(crate) fn alloc_str(&mut self, str: &str) -> PStr {
    let rc_str = Rc::from(str);
    if let Some(id) = self.interned_str.get(&rc_str) {
      *id
    } else {
      let id = self.id;
      let p_str = PStr(PStrInner::Temp(id));
      self.interned_str.insert(rc_str.clone(), p_str);
      self.str_pointer_table.insert(p_str, rc_str);
      self.id += 1;
      p_str
    }
  }

  pub(crate) fn retain(&mut self, retain_set: &HashSet<PStr>) {
    self.str_pointer_table.retain(|p, _| retain_set.contains(p));
    let str_retain_set = self.str_pointer_table.values().cloned().collect::<HashSet<_>>();
    self.interned_str.retain(|p, _| str_retain_set.contains(p));
  }
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

pub fn measure_time<R, F: FnOnce() -> R>(enabled: bool, name: &'static str, f: F) -> R {
  if enabled {
    let now = Instant::now();
    let result = f();
    let time = now.elapsed().as_millis();
    eprintln!("{} takes {}ms.", name, time);
    result
  } else {
    f()
  }
}

pub(crate) fn rcs(s: &'static str) -> Str {
  Str(Rc::new(String::from(s)))
}

pub(crate) fn rc_string(s: String) -> Str {
  Str(Rc::new(s))
}

pub(crate) fn rc_pstr(heap: &Heap, s: PStr) -> Str {
  Str(Rc::new(String::from(s.as_str(heap))))
}

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

pub(crate) struct LocalStackedContext<K: Clone + Eq + Hash, V: Clone> {
  local_values_stack: Vec<HashMap<K, V>>,
  captured_values_stack: Vec<HashMap<K, V>>,
}

impl<K: Clone + Eq + Hash, V: Clone> LocalStackedContext<K, V> {
  pub(crate) fn new() -> LocalStackedContext<K, V> {
    LocalStackedContext {
      local_values_stack: vec![HashMap::new()],
      captured_values_stack: vec![HashMap::new()],
    }
  }

  pub(crate) fn get(&mut self, name: &K) -> Option<&V> {
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

  pub(crate) fn insert(&mut self, name: &K, value: V) -> bool {
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

  pub(crate) fn insert_crash_on_error(&mut self, name: &K, value: V) {
    if !self.insert(name, value) {
      panic!()
    }
  }

  pub(crate) fn push_scope(&mut self) {
    self.local_values_stack.push(HashMap::new());
    self.captured_values_stack.push(HashMap::new());
  }

  pub(crate) fn pop_scope(&mut self) -> HashMap<K, V> {
    self.local_values_stack.pop();
    self.captured_values_stack.pop().unwrap()
  }
}

#[cfg(test)]
mod tests {
  use crate::common::PStr;

  use super::{int_vec_to_data_string, measure_time, rcs, Heap, LocalStackedContext};
  use itertools::Itertools;
  use std::{cmp::Ordering, collections::HashSet};

  fn test_closure() {}

  #[test]
  fn boilterplate() {
    assert!(rcs("foo") < rcs("zuck"));
    assert!(rcs("foo").cmp(&rcs("zuck")).is_lt());
    assert!(rcs("foo").partial_cmp(&rcs("zuck")).is_some());
    assert!(rcs("foo") == rcs("foo"));
    assert!(!format!("{:?}", rcs("debug")).is_empty());
    assert_eq!(rcs("zuck"), rcs("zuck"));
    assert_eq!(Some('h'), rcs("hiya").chars().next());

    measure_time(true, "", test_closure);
    measure_time(false, "", test_closure);

    let mut set = HashSet::new();
    set.insert(rcs("sam"));
  }

  #[test]
  fn p_str_tests() {
    let mut heap = Heap::new();
    let a1 = heap.alloc_str("a");
    let b = heap.alloc_str("b");
    let a2 = heap.alloc_str("a");
    assert!(heap.get_allocated_str_opt("a").is_some());
    assert!(heap.get_allocated_str_opt("d").is_none());
    let c = PStr::permanent("c");
    assert!(!format!("{:?}", b).is_empty());
    assert!(!format!("{:?}", c.0.clone()).is_empty());
    assert_eq!(a1.clone(), a2.clone());
    assert_ne!(a1, b);
    assert_ne!(a2, b);
    assert_eq!(Ordering::Equal, a1.cmp(&a2));
    assert_eq!(Some(Ordering::Equal), a1.partial_cmp(&a2));
    heap.retain(&HashSet::from([a1, b]));
    a1.as_str(&heap);
    a2.as_str(&heap);
    c.clone().as_str(&heap);
  }

  #[should_panic]
  #[test]
  fn p_str_gc_panic() {
    let mut heap = Heap::new();
    let a = heap.alloc_str("a");
    heap.retain(&HashSet::new());
    a.as_str(&heap);
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
