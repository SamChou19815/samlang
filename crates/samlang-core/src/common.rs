use itertools::Itertools;
use std::{collections::HashMap, hash::Hash, ops::Deref, rc::Rc, time::Instant};

/// A string pointer free to be copied. However, we have to do GC manually.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct PStr(usize);

pub(crate) const INVALID_PSTR: PStr = PStr(usize::MAX);

impl PStr {
  pub(crate) fn opaque_id(&self) -> usize {
    self.0
  }

  pub(crate) fn as_str<'a>(&self, heap: &'a Heap) -> &'a str {
    &heap.str_pointer_table[self.0]
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ModuleReference(usize);

impl ModuleReference {
  pub const fn root() -> ModuleReference {
    ModuleReference(0)
  }

  pub(crate) const fn dummy() -> ModuleReference {
    ModuleReference(1)
  }

  pub(crate) fn get_parts<'a>(&self, heap: &'a Heap) -> &'a [PStr] {
    heap.module_reference_pointer_table[self.0]
  }

  pub fn pretty_print(&self, heap: &Heap) -> String {
    self.get_parts(heap).iter().map(|p| p.as_str(heap)).join(".")
  }

  pub fn to_filename(&self, heap: &Heap) -> String {
    self.get_parts(heap).iter().map(|p| p.as_str(heap)).join("/") + ".sam"
  }

  pub fn encoded(&self, heap: &Heap) -> String {
    self
      .get_parts(heap)
      .iter()
      .map(|it| it.as_str(heap).replace('-', "_"))
      .collect::<Vec<String>>()
      .join("$")
  }
}

enum StringStoredInHeap {
  Permanent(&'static str),
  Temporary(String),
}

impl Deref for StringStoredInHeap {
  type Target = str;

  fn deref(&self) -> &Self::Target {
    match self {
      StringStoredInHeap::Permanent(s) => s,
      StringStoredInHeap::Temporary(s) => s,
    }
  }
}

/// Users of the heap is responsible for calling retain at appropriate places to do GC.
pub struct Heap {
  str_pointer_table: Vec<StringStoredInHeap>,
  module_reference_pointer_table: Vec<&'static [PStr]>,
  interned_string: HashMap<&'static str, PStr>,
  interned_static_str: HashMap<&'static str, PStr>,
  interned_module_reference: HashMap<&'static [PStr], ModuleReference>,
}

impl Heap {
  pub fn new() -> Heap {
    let mut heap = Heap {
      str_pointer_table: vec![],
      module_reference_pointer_table: vec![],
      interned_string: HashMap::new(),
      interned_static_str: HashMap::new(),
      interned_module_reference: HashMap::new(),
    };
    heap.alloc_module_reference(vec![]); // Root
    let dummy_parts = vec![heap.alloc_str("__DUMMY__")];
    let allocated_dummy = heap.alloc_module_reference(dummy_parts);
    debug_assert!(ModuleReference::dummy() == allocated_dummy); // Dummy
    heap
  }

  pub(crate) fn get_allocated_str_opt(&self, str: &str) -> Option<PStr> {
    self.interned_static_str.get(&str).or_else(|| self.interned_string.get(&str)).copied()
  }

  pub(crate) fn alloc_str(&mut self, str: &'static str) -> PStr {
    if let Some(id) = self.interned_static_str.get(&str) {
      *id
    } else if let Some(p_str) = self.interned_string.remove(&str) {
      // If for some reasons, the string is already allocated by regular strings,
      // we will promote this to the permanent generation.
      self.str_pointer_table[p_str.0] = StringStoredInHeap::Permanent(str);
      self.interned_static_str.insert(str, p_str);
      p_str
    } else {
      let p_str = PStr(self.str_pointer_table.len());
      self.interned_static_str.insert(str, p_str);
      self.str_pointer_table.push(StringStoredInHeap::Permanent(str));
      p_str
    }
  }

  /// This function can only be called in compiler code.
  pub(crate) fn alloc_temp_str(&mut self) -> PStr {
    let string = format!("_t{}", self.str_pointer_table.len());
    self.alloc_string(string)
  }

  pub(crate) fn alloc_string(&mut self, string: String) -> PStr {
    if let Some(id) = self.interned_static_str.get(string.deref()) {
      *id
    } else if let Some(id) = self.interned_string.get(string.as_str()) {
      *id
    } else {
      let p_str = PStr(self.str_pointer_table.len());
      // The string pointer is managed by the the string pointer table.
      let unmanaged_str_ptr: &'static str = unsafe { (&string as *const String).as_ref().unwrap() };
      self.str_pointer_table.push(StringStoredInHeap::Temporary(string));
      self.interned_string.insert(unmanaged_str_ptr, p_str);
      p_str
    }
  }

  pub fn get_allocated_module_reference_opt(&self, parts: Vec<String>) -> Option<ModuleReference> {
    let mut p_str_parts = vec![];
    for part in &parts {
      p_str_parts.push(self.get_allocated_str_opt(part)?);
    }
    self.interned_module_reference.get(p_str_parts.deref()).cloned()
  }

  pub(crate) fn alloc_module_reference(&mut self, parts: Vec<PStr>) -> ModuleReference {
    if let Some(id) = self.interned_module_reference.get(parts.deref()) {
      *id
    } else {
      let mod_ref = ModuleReference(self.module_reference_pointer_table.len());
      // We don't plan to gc module
      let leaked_parts = Vec::leak(parts);
      self.interned_module_reference.insert(leaked_parts, mod_ref);
      self.module_reference_pointer_table.push(leaked_parts);
      mod_ref
    }
  }

  pub fn alloc_module_reference_from_string_vec(&mut self, parts: Vec<String>) -> ModuleReference {
    let parts = parts.into_iter().map(|p| self.alloc_string(p)).collect_vec();
    self.alloc_module_reference(parts)
  }

  pub(crate) fn alloc_dummy_module_reference(&mut self) -> ModuleReference {
    let parts = vec![self.alloc_str("__DUMMY__")];
    self.alloc_module_reference(parts)
  }
}

impl Default for Heap {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) struct Str(Rc<String>);

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
    eprintln!("{name} takes {time}ms.");
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
  use super::{
    int_vec_to_data_string, measure_time, rcs, Heap, LocalStackedContext, ModuleReference, PStr,
  };
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
  fn heap_tests() {
    let mut heap = Heap::default();
    assert_eq!(1, heap.alloc_dummy_module_reference().0);
    let a1 = heap.alloc_str("a");
    let b = heap.alloc_str("b");
    let a2 = heap.alloc_str("a");
    a1.opaque_id();
    heap.alloc_temp_str();
    assert!(heap.get_allocated_str_opt("a").is_some());
    assert!(heap.get_allocated_str_opt("d").is_none());
    assert!(!format!("{b:?}").is_empty());
    assert_eq!(a1.clone(), a2.clone());
    assert_ne!(a1, b);
    assert_ne!(a2, b);
    assert_eq!(Ordering::Equal, a1.cmp(&a2));
    assert_eq!(Some(Ordering::Equal), a1.partial_cmp(&a2));
    a1.as_str(&heap);
    a2.as_str(&heap);
    b.clone().as_str(&heap);

    let ma1 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let mb = heap.alloc_module_reference_from_string_vec(vec!["b".to_string(), "d-c".to_string()]);
    let ma2 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let m_dummy = heap.alloc_dummy_module_reference();
    assert!(heap.get_allocated_module_reference_opt(vec!["a".to_string()]).is_some());
    assert!(heap.get_allocated_module_reference_opt(vec!["d-c".to_string()]).is_none());
    assert!(heap.get_allocated_module_reference_opt(vec!["ddasdasdas".to_string()]).is_none());
    assert!(!format!("{mb:?}").is_empty());
    assert_eq!(ma1.clone(), ma2.clone());
    assert_ne!(ma1, mb);
    assert_ne!(ma2, mb);
    assert_eq!(Ordering::Equal, ma1.cmp(&ma2));
    assert_eq!(Some(Ordering::Equal), ma1.partial_cmp(&ma2));
    assert_eq!("a", ma1.pretty_print(&heap));
    assert_eq!("b/d-c.sam", mb.to_filename(&heap));
    assert_eq!("b$d_c", mb.encoded(&heap));
    assert_eq!("__DUMMY__", m_dummy.pretty_print(&heap));
    mb.clone().pretty_print(&heap);
  }

  #[should_panic]
  #[test]
  fn heap_str_crash() {
    let heap = Heap::new();
    PStr(100).as_str(&heap);
  }

  #[should_panic]
  #[test]
  fn heap_mod_ref_crash() {
    let heap = Heap::new();
    ModuleReference(100).pretty_print(&heap);
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
