use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  convert::TryInto,
  hash::Hash,
  mem,
  ops::Deref,
  rc::Rc,
  time::Instant,
};

#[derive(Debug, Clone, Eq, Copy)]
enum PStrPrivateRepr {
  Inline { size: u8, storage: [u8; 6] },
  Heap { id: u32, padding: [u8; 3] },
}

const ALL_ZERO_SLICE: [u8; 6] = [0; 6];

impl PStrPrivateRepr {
  fn as_inline_str(&self) -> Result<&str, u32> {
    match self {
      Self::Heap { id, .. } => Err(*id),
      Self::Inline { size, storage } => {
        Ok(unsafe { std::str::from_utf8_unchecked(&storage[..(*size as usize)]) })
      }
    }
  }

  fn from_str_opt(s: &str) -> Option<PStrPrivateRepr> {
    let bytes = s.as_bytes();
    let size = bytes.len();
    if size <= 6 {
      let mut storage = [0; 6];
      storage[..size].copy_from_slice(bytes);
      Some(Self::Inline { size: size as u8, storage })
    } else {
      None
    }
  }

  fn from_string(s: String) -> Result<PStrPrivateRepr, String> {
    let size = s.len();
    if size <= 6 {
      let mut bytes = s.into_bytes();
      bytes.extend_from_slice(&ALL_ZERO_SLICE[size..6]);
      Ok(Self::Inline { size: size as u8, storage: bytes.try_into().unwrap() })
    } else {
      Err(s)
    }
  }
}

impl PartialEq for PStrPrivateRepr {
  fn eq(&self, other: &Self) -> bool {
    unsafe { mem::transmute::<_, &u64>(self).eq(mem::transmute::<_, &u64>(other)) }
  }
}

impl Hash for PStrPrivateRepr {
  fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
    unsafe { mem::transmute::<_, &u64>(self).hash(state) }
  }
}

impl Ord for PStrPrivateRepr {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    match (self.as_inline_str(), other.as_inline_str()) {
      (Ok(s1), Ok(s2)) => s1.cmp(s2),
      (Err(id1), Err(id2)) => id1.cmp(&id2),
      (Ok(_), Err(_)) => std::cmp::Ordering::Less,
      (Err(_), Ok(_)) => std::cmp::Ordering::Greater,
    }
  }
}

impl PartialOrd for PStrPrivateRepr {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
/// A string pointer free to be copied. However, we have to do GC manually.
pub(crate) struct PStr(PStrPrivateRepr);

pub(crate) const INVALID_PSTR: PStr = PStr(PStrPrivateRepr::Heap { id: u32::MAX, padding: [0; 3] });

impl PStr {
  pub(crate) fn as_str<'a>(&'a self, heap: &'a Heap) -> &'a str {
    self.0.as_inline_str().unwrap_or_else(|id| &heap.str_pointer_table[id as usize])
  }

  pub(crate) fn debug_string(&self) -> String {
    self.0.as_inline_str().map(|s| s.to_string()).unwrap_or_else(|id| id.to_string())
  }

  fn create_inline_opt(s: &str) -> Option<PStr> {
    PStrPrivateRepr::from_str_opt(s).map(PStr)
  }
}

pub(crate) mod well_known_pstrs {
  use super::{PStr, PStrPrivateRepr};

  macro_rules! concat_arrays {
    ($( $array:expr ),*) => ({
        const __ARRAY_SIZE__: usize = 0 $(+ $array.len())*;

        #[repr(C)]
        struct ArrayConcatDecomposed<T>($([T; $array.len()]),*);

        #[repr(C)]
        union ArrayConcatComposed<T, const N: usize> {
            full: core::mem::ManuallyDrop<[T; N]>,
            decomposed: core::mem::ManuallyDrop<ArrayConcatDecomposed<T>>,
        }

        let composed = ArrayConcatComposed { decomposed: core::mem::ManuallyDrop::new(ArrayConcatDecomposed ( $($array),* ))};

        // SAFETY: Sizes of both fields in composed are the same so this assignment should be sound
        core::mem::ManuallyDrop::into_inner(unsafe { composed.full })
    });
  }

  macro_rules! const_inline_pstr {
    ($array:expr, $pad: expr) => {{
      const __PAD_ARRAY_SIZE__: usize = 6 - $array.len();
      PStr(PStrPrivateRepr::Inline {
        size: $array.len() as u8,
        storage: concat_arrays!($array, $pad),
      })
    }};
  }

  pub(crate) const DUMMY_MODULE: PStr = const_inline_pstr!(*b"DUMMY", [0; 1]);

  pub(crate) const INIT: PStr = const_inline_pstr!(*b"init", [0; 2]);
  pub(crate) const THIS: PStr = const_inline_pstr!(*b"this", [0; 2]);

  pub(crate) const UNDERSCORE_THIS: PStr = const_inline_pstr!(*b"_this", [0; 1]);
  pub(crate) const UNDERSCORE_TMP: PStr = const_inline_pstr!(*b"_tmp", [0; 2]);

  pub(crate) const UPPER_A: PStr = const_inline_pstr!(*b"A", [0; 5]);
  pub(crate) const UPPER_B: PStr = const_inline_pstr!(*b"B", [0; 5]);
  pub(crate) const UPPER_C: PStr = const_inline_pstr!(*b"C", [0; 5]);
  pub(crate) const UPPER_D: PStr = const_inline_pstr!(*b"D", [0; 5]);
  pub(crate) const UPPER_E: PStr = const_inline_pstr!(*b"E", [0; 5]);
  pub(crate) const UPPER_F: PStr = const_inline_pstr!(*b"F", [0; 5]);
  pub(crate) const UPPER_G: PStr = const_inline_pstr!(*b"G", [0; 5]);
  pub(crate) const UPPER_T: PStr = const_inline_pstr!(*b"T", [0; 5]);

  pub(crate) const LOWER_A: PStr = const_inline_pstr!(*b"a", [0; 5]);
  pub(crate) const LOWER_B: PStr = const_inline_pstr!(*b"b", [0; 5]);
  pub(crate) const LOWER_C: PStr = const_inline_pstr!(*b"c", [0; 5]);
  pub(crate) const LOWER_D: PStr = const_inline_pstr!(*b"d", [0; 5]);
  pub(crate) const LOWER_E: PStr = const_inline_pstr!(*b"e", [0; 5]);
  pub(crate) const LOWER_F: PStr = const_inline_pstr!(*b"f", [0; 5]);
  pub(crate) const LOWER_G: PStr = const_inline_pstr!(*b"g", [0; 5]);
  pub(crate) const LOWER_H: PStr = const_inline_pstr!(*b"h", [0; 5]);
  pub(crate) const LOWER_I: PStr = const_inline_pstr!(*b"i", [0; 5]);
  pub(crate) const LOWER_J: PStr = const_inline_pstr!(*b"j", [0; 5]);
  pub(crate) const LOWER_K: PStr = const_inline_pstr!(*b"k", [0; 5]);
  pub(crate) const LOWER_L: PStr = const_inline_pstr!(*b"l", [0; 5]);
  pub(crate) const LOWER_M: PStr = const_inline_pstr!(*b"m", [0; 5]);
  pub(crate) const LOWER_N: PStr = const_inline_pstr!(*b"n", [0; 5]);
  pub(crate) const LOWER_O: PStr = const_inline_pstr!(*b"o", [0; 5]);
  pub(crate) const LOWER_P: PStr = const_inline_pstr!(*b"p", [0; 5]);
  pub(crate) const LOWER_Q: PStr = const_inline_pstr!(*b"q", [0; 5]);
  pub(crate) const LOWER_V: PStr = const_inline_pstr!(*b"v", [0; 5]);
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
  Temporary(String, /** marked */ bool),
  Deallocated(Option<String>),
}

impl Deref for StringStoredInHeap {
  type Target = str;

  fn deref(&self) -> &Self::Target {
    match self {
      StringStoredInHeap::Permanent(s) => s,
      StringStoredInHeap::Temporary(s, _) => s,
      StringStoredInHeap::Deallocated(s) => {
        panic!("Dereferencing deallocated string: {}", s.as_deref().unwrap_or("???"))
      }
    }
  }
}

impl StringStoredInHeap {
  fn deallocated(keep: bool, str: &str) -> StringStoredInHeap {
    if keep {
      StringStoredInHeap::Deallocated(Some(str.to_string()))
    } else {
      StringStoredInHeap::Deallocated(None)
    }
  }
}

/// Users of the heap is responsible for calling retain at appropriate places to do GC.
pub struct Heap {
  str_pointer_table: Vec<StringStoredInHeap>,
  module_reference_pointer_table: Vec<&'static [PStr]>,
  interned_string: HashMap<&'static str, u32>,
  interned_static_str: HashMap<&'static str, u32>,
  interned_module_reference: HashMap<&'static [PStr], ModuleReference>,
  unmarked_module_references: HashSet<ModuleReference>,
  // invariant: 0 <= sweep_index < str_pointer_table.len()
  sweep_index: usize,
}

impl Heap {
  pub fn new() -> Heap {
    let mut heap = Heap {
      str_pointer_table: vec![],
      module_reference_pointer_table: vec![],
      interned_string: HashMap::new(),
      interned_static_str: HashMap::new(),
      interned_module_reference: HashMap::new(),
      unmarked_module_references: HashSet::new(),
      sweep_index: 0,
    };
    heap.alloc_module_reference(vec![]); // Root
    let dummy_parts = vec![well_known_pstrs::DUMMY_MODULE];
    let allocated_dummy = heap.alloc_module_reference(dummy_parts);
    debug_assert!(ModuleReference::dummy() == allocated_dummy); // Dummy
    heap
  }

  pub(crate) fn get_allocated_str_opt(&self, str: &str) -> Option<PStr> {
    let inlined = PStr::create_inline_opt(str);
    if inlined.is_some() {
      inlined
    } else {
      self
        .interned_static_str
        .get(&str)
        .or_else(|| self.interned_string.get(&str))
        .copied()
        .map(|id| PStr(PStrPrivateRepr::Heap { id, padding: [0; 3] }))
    }
  }

  pub(crate) fn alloc_str_permanent(&mut self, s: &'static str) -> PStr {
    self.alloc_str_internal(s)
  }

  #[cfg(test)]
  pub(crate) fn alloc_str_for_test(&mut self, s: &'static str) -> PStr {
    self.alloc_str_internal(s)
  }

  fn alloc_str_internal(&mut self, str: &'static str) -> PStr {
    if let Some(p) = PStr::create_inline_opt(str) {
      p
    } else if let Some(id) = self.interned_static_str.get(&str) {
      PStr(PStrPrivateRepr::Heap { id: *id, padding: [0; 3] })
    } else if let Some(id) = self.interned_string.remove(&str) {
      // If for some reasons, the string is already allocated by regular strings,
      // we will promote this to the permanent generation.
      self.str_pointer_table[id as usize] = StringStoredInHeap::Permanent(str);
      self.interned_static_str.insert(str, id);
      PStr(PStrPrivateRepr::Heap { id, padding: [0; 3] })
    } else {
      let id = self.str_pointer_table.len() as u32;
      self.interned_static_str.insert(str, id);
      self.str_pointer_table.push(StringStoredInHeap::Permanent(str));
      PStr(PStrPrivateRepr::Heap { id, padding: [0; 3] })
    }
  }

  /// This function can only be called in compiler code.
  pub(crate) fn alloc_temp_str(&mut self) -> PStr {
    // We use a more specialized implementation here,
    // since the generated strings are guaranteed to be globally unique.
    let id = self.str_pointer_table.len() as u32;
    let string = format!("_t{id}");
    if let Some(p) = PStr::create_inline_opt(&string) {
      self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
      p
    } else {
      self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
      PStr(PStrPrivateRepr::Heap { id, padding: [0; 3] })
    }
  }

  pub(crate) fn alloc_string(&mut self, string: String) -> PStr {
    match PStrPrivateRepr::from_string(string) {
      Ok(repr) => PStr(repr),
      Err(string) => {
        let key = string.as_str();
        if let Some(id) = self.interned_static_str.get(&key) {
          PStr(PStrPrivateRepr::Heap { id: *id, padding: [0; 3] })
        } else if let Some(id) = self.interned_string.get(&key) {
          PStr(PStrPrivateRepr::Heap { id: *id, padding: [0; 3] })
        } else {
          let id = self.str_pointer_table.len() as u32;
          // The string pointer is managed by the the string pointer table.
          let unmanaged_str_ptr: &'static str = unsafe { (key as *const str).as_ref().unwrap() };
          self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
          self.interned_string.insert(unmanaged_str_ptr, id);
          PStr(PStrPrivateRepr::Heap { id, padding: [0; 3] })
        }
      }
    }
  }

  fn make_string_static(string: String) -> &'static str {
    Box::leak(Box::new(string))
  }

  fn make_string_permanent(&mut self, p_str: PStr) {
    if let PStrPrivateRepr::Heap { id, padding: _ } = p_str.0 {
      let stored_string = &mut self.str_pointer_table[id as usize];
      match stored_string {
        StringStoredInHeap::Permanent(_) | StringStoredInHeap::Deallocated(_) => {}
        StringStoredInHeap::Temporary(s, _) => {
          let removed = self.interned_string.remove(s.as_str()).expect(s);
          let static_str: &'static str = Self::make_string_static(s.to_string());
          *stored_string = StringStoredInHeap::Permanent(static_str);
          debug_assert_eq!(removed, id);
          self.interned_static_str.insert(static_str, id);
        }
      }
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
      for p in &parts {
        self.make_string_permanent(*p);
      }
      // We don't plan to gc module
      let leaked_parts = Vec::leak(parts);
      self.interned_module_reference.insert(leaked_parts, mod_ref);
      self.module_reference_pointer_table.push(leaked_parts);
      mod_ref
    }
  }

  pub fn alloc_module_reference_from_string_vec(&mut self, parts: Vec<String>) -> ModuleReference {
    let parts = parts
      .into_iter()
      .map(|p| self.alloc_str_permanent(Self::make_string_static(p)))
      .collect_vec();
    self.alloc_module_reference(parts)
  }

  pub(crate) fn alloc_dummy_module_reference(&mut self) -> ModuleReference {
    let parts = vec![well_known_pstrs::DUMMY_MODULE];
    self.alloc_module_reference(parts)
  }

  /// Returns the statistics of heap to help debugging
  pub(crate) fn stat(&self) -> String {
    let total_slots = self.str_pointer_table.len();
    let total_unused = self
      .str_pointer_table
      .iter()
      .filter(|it| matches!(it, StringStoredInHeap::Deallocated(_)))
      .count();
    let total_used = total_slots - total_unused;
    format!("Total slots: {total_slots}. Total used: {total_used}. Total unused: {total_unused}")
  }

  /// Returns all unmarked strings for debugging
  #[cfg(test)]
  pub(crate) fn debug_unmarked_strings(&self) -> String {
    self
      .str_pointer_table
      .iter()
      .filter_map(|stored| match stored {
        StringStoredInHeap::Permanent(_)
        | StringStoredInHeap::Deallocated(_)
        | StringStoredInHeap::Temporary(_, true) => None,
        StringStoredInHeap::Temporary(s, false) => Some(s),
      })
      .sorted()
      .join("\n")
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function informs the heap that a new module reference has been touched, so that
  /// everything related to the module need to be marked again.
  ///
  /// Adding the full set of changed modules since the last GC is critical for the correctness of GC.
  pub(crate) fn add_unmarked_module_reference(&mut self, module_reference: ModuleReference) {
    self.unmarked_module_references.insert(module_reference);
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function informs the heap that marking of a module has completed.
  ///
  /// It should be called at the end of one slice of incremental marking.
  pub(crate) fn pop_unmarked_module_reference(&mut self) -> Option<ModuleReference> {
    let item = self.unmarked_module_references.iter().next().copied()?;
    self.unmarked_module_references.remove(&item);
    Some(item)
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function marks a string as being used, thus excluding it from the next around of GC.
  ///
  /// It should be called during incremental marking.
  pub(crate) fn mark(&mut self, p_str: PStr) {
    if let PStrPrivateRepr::Heap { id, padding: _ } = p_str.0 {
      match &mut self.str_pointer_table[id as usize] {
        StringStoredInHeap::Permanent(_) | StringStoredInHeap::Deallocated(_) => {}
        StringStoredInHeap::Temporary(_, marked) => *marked = true,
      }
    }
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function is a no-op if there are remaining unmarked module references. If there are not,
  /// then it will retain all the marked temporary strings, and purge the rest of the temporarily
  /// strings. It doesn't compactify the heap.
  ///
  /// It should be called at the end of a GC round. Sweep is still incremental. The amount of work
  /// is controled by `work_unit`.
  pub(crate) fn sweep(&mut self, work_unit: usize) {
    if !self.unmarked_module_references.is_empty() {
      return;
    }
    let sweep_start = self.sweep_index;
    let mut sweep_end = self.sweep_index + work_unit;
    let max_sweep = self.str_pointer_table.len();
    if sweep_end >= max_sweep {
      self.sweep_index = 0;
      sweep_end = max_sweep;
    } else {
      self.sweep_index = sweep_end
    }
    for string_stored in self.str_pointer_table[sweep_start..sweep_end].iter_mut() {
      match string_stored {
        StringStoredInHeap::Permanent(_) | StringStoredInHeap::Deallocated(_) => {}
        StringStoredInHeap::Temporary(str, marked) => {
          if *marked {
            *marked = false;
          } else {
            self.interned_string.remove(str.as_str());
            // In dev mode, we keep the string to help debug
            *string_stored = StringStoredInHeap::deallocated(cfg!(test), str)
          }
        }
      }
    }
  }

  // compactify is not implemented for now. It's likely not needed for a while.
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
    let time = now.elapsed().as_micros();
    eprintln!("{name} takes {}ms.", (time as f64) / 1000.0);
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

pub(crate) fn byte_vec_to_data_string(array: &Vec<u8>) -> String {
  let mut collector = vec![];
  for b in array {
    collector.push('\\');
    collector.push(byte_digit_to_char(b / 16));
    collector.push(byte_digit_to_char(b % 16));
  }
  String::from_iter(collector.iter())
}

pub(crate) struct LocalStackedContext<K: Clone + Eq + Hash, V: Clone> {
  local_values_stack: Vec<HashMap<K, V>>,
}

impl<K: Clone + Eq + Hash, V: Clone> LocalStackedContext<K, V> {
  pub(crate) fn new() -> LocalStackedContext<K, V> {
    LocalStackedContext { local_values_stack: vec![HashMap::new()] }
  }

  pub(crate) fn get(&mut self, name: &K) -> Option<&V> {
    self.local_values_stack.iter().rev().find_map(|level| level.get(name))
  }

  pub(crate) fn insert(&mut self, name: K, value: V) -> Option<V> {
    let previous = self.local_values_stack.iter().find_map(|m| m.get(&name)).cloned();
    let stack = &mut self.local_values_stack;
    let last_index = stack.len() - 1;
    stack[last_index].insert(name, value);
    previous
  }

  pub(crate) fn push_scope(&mut self) {
    self.local_values_stack.push(HashMap::new());
  }

  pub(crate) fn pop_scope(&mut self) {
    self.local_values_stack.pop();
  }
}

#[cfg(test)]
mod tests {
  use super::{
    byte_vec_to_data_string, measure_time, rcs, Heap, LocalStackedContext, ModuleReference, PStr,
    PStrPrivateRepr, StringStoredInHeap,
  };
  use pretty_assertions::assert_eq;
  use std::{cmp::Ordering, collections::HashSet, ops::Deref};

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

    StringStoredInHeap::deallocated(true, "");
    StringStoredInHeap::deallocated(false, "");

    let mut set = HashSet::new();
    set.insert(rcs("sam"));
  }

  #[test]
  fn heap_tests() {
    let mut heap = Heap::default();
    assert_eq!(1, heap.alloc_dummy_module_reference().0);
    let a1 = heap.alloc_str_for_test("aaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let b = heap.alloc_str_for_test("b");
    let a2 = heap.alloc_str_for_test("aaaaaaaaaaaaaaaaaaaaaaaaaaa");
    a1.debug_string();
    assert!(PStrPrivateRepr::Heap { id: 0, padding: [0; 3] }
      .clone()
      .eq(&PStrPrivateRepr::Heap { id: 0, padding: [0; 3] }));
    assert!(heap.get_allocated_str_opt("aaaaaaaaaaaaaaaaaaaaaaaaaaa").is_some());
    assert!(heap.get_allocated_str_opt("dddddddddddddddddddddddddddddddddddddddd").is_none());
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
    assert!(heap
      .get_allocated_module_reference_opt(vec!["ddasdasdassdfasdfasdfasdfasdf".to_string()])
      .is_none());
    assert!(!format!("{mb:?}").is_empty());
    assert_eq!(ma1.clone(), ma2.clone());
    assert_ne!(ma1, mb);
    assert_ne!(ma2, mb);
    assert_eq!(Ordering::Equal, ma1.cmp(&ma2));
    assert_eq!(Some(Ordering::Equal), ma1.partial_cmp(&ma2));
    assert_eq!("a", ma1.pretty_print(&heap));
    assert_eq!("b/d-c.sam", mb.to_filename(&heap));
    assert_eq!("b$d_c", mb.encoded(&heap));
    assert_eq!("DUMMY", m_dummy.pretty_print(&heap));
    mb.clone().pretty_print(&heap);

    for _ in 0..11111 {
      heap.alloc_temp_str();
    }
  }

  #[test]
  fn gc_successful_sweep_test() {
    let heap = &mut Heap::new();
    heap.alloc_string("a_string_that_is_intentionally_very_long".to_string());
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    assert_eq!("a_string_that_is_intentionally_very_long", heap.debug_unmarked_strings());
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 0. Total unused: 1", heap.stat());
    assert_eq!("", heap.debug_unmarked_strings());
  }

  #[test]
  fn gc_do_not_collect_permanent_sweep_test() {
    let heap = &mut Heap::new();
    let p = heap.alloc_string("a_string_that_is_intentionally_very_long".to_string());
    heap.make_string_permanent(p);
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    assert_eq!("", heap.debug_unmarked_strings());
  }

  #[test]
  fn gc_partial_sweep_test() {
    let heap = &mut Heap::new();
    heap.alloc_string("a_string_that_is_intentionally_very_long_1".to_string());
    heap.alloc_string("a_string_that_is_intentionally_very_long_2".to_string());
    assert_eq!("Total slots: 2. Total used: 2. Total unused: 0", heap.stat());
    heap.sweep(0);
    assert_eq!("Total slots: 2. Total used: 2. Total unused: 0", heap.stat());
    heap.sweep(1);
    assert_eq!("Total slots: 2. Total used: 1. Total unused: 1", heap.stat());
    heap.sweep(1);
    assert_eq!("Total slots: 2. Total used: 0. Total unused: 2", heap.stat());
    heap.sweep(1);
    assert_eq!("Total slots: 2. Total used: 0. Total unused: 2", heap.stat());
    assert_eq!(1, heap.sweep_index);
  }

  #[test]
  fn gc_marked_full_sweep_test() {
    let heap = &mut Heap::new();
    let p1 = heap.alloc_str_for_test("a_string_that_is_intentionally_very_long_static1");
    heap.alloc_str_for_test("a_string_that_is_intentionally_very_long_static2");
    let p2 = heap.alloc_string("a_string_that_is_intentionally_very_long_string1".to_string());
    heap.alloc_string("a_string_that_is_intentionally_very_long_string2".to_string());
    heap.mark(p1);
    heap.mark(p2);
    assert_eq!("Total slots: 4. Total used: 4. Total unused: 0", heap.stat());
    heap.sweep(1000);
    assert_eq!("Total slots: 4. Total used: 3. Total unused: 1", heap.stat());
  }

  #[test]
  fn gc_has_unmarked_no_op_sweep_test() {
    let heap = &mut Heap::new();
    heap.alloc_string("a_string_that_is_intentionally_very_long_1".to_string());
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    heap.add_unmarked_module_reference(ModuleReference::dummy());
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
  }

  #[test]
  fn gc_mark_unmark_module_reference_sweep_test() {
    let heap = &mut Heap::new();
    heap.alloc_string("a_string_that_is_intentionally_very_long_1".to_string());
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    heap.add_unmarked_module_reference(ModuleReference::dummy());
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    assert!(heap.pop_unmarked_module_reference().is_some());
    assert!(heap.pop_unmarked_module_reference().is_none());
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 0. Total unused: 1", heap.stat());
  }

  #[should_panic]
  #[test]
  fn heap_str_crash() {
    let heap = Heap::new();
    PStr(PStrPrivateRepr::Heap { id: 1000, padding: [0; 3] }).as_str(&heap);
  }

  #[should_panic]
  #[test]
  fn heap_str_stored_crash() {
    let _ = StringStoredInHeap::Deallocated(None).deref();
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
      byte_vec_to_data_string(&vec![1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0,])
    );
    assert_eq!(
      "\\01\\00\\00\\00\\7c\\00\\00\\00\\16\\00\\00\\00\\21\\00\\00\\00",
      byte_vec_to_data_string(&vec![1, 0, 0, 0, 124, 0, 0, 0, 22, 0, 0, 0, 33, 0, 0, 0,])
    );
  }

  fn insert_crash_on_error(
    cx: &mut LocalStackedContext<super::Str, i32>,
    name: super::Str,
    value: i32,
  ) {
    if cx.insert(name, value).is_some() {
      panic!()
    }
  }

  #[test]
  fn local_stacked_context_basic_methods_tests() {
    let mut context = LocalStackedContext::new();
    assert!(context.get(&rcs("b")).is_none());
    insert_crash_on_error(&mut context, rcs("a"), 3);
    assert_eq!(3, *context.get(&rcs("a")).unwrap());
    context.push_scope();
    context.pop_scope();
  }

  #[should_panic]
  #[test]
  fn local_stacked_context_conflict_detection_tests() {
    let mut context = LocalStackedContext::new();
    let a = rcs("a");
    context.insert(a.clone(), 3);
    context.insert(a.clone(), 3);
    insert_crash_on_error(&mut context, a, 3);
  }

  #[test]
  fn local_stacked_context_captured_values_tests() {
    let mut context = LocalStackedContext::new();
    insert_crash_on_error(&mut context, rcs("a"), 3);
    insert_crash_on_error(&mut context, rcs("b"), 3);
    context.push_scope();
    insert_crash_on_error(&mut context, rcs("c"), 3);
    insert_crash_on_error(&mut context, rcs("d"), 3);
    context.get(&rcs("a"));
    context.push_scope();
    context.get(&rcs("a"));
    context.get(&rcs("b"));
    context.get(&rcs("d"));
  }
}
