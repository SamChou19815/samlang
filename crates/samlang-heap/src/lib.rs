#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]

use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  convert::TryInto,
  hash::Hash,
  ops::Deref,
};

#[derive(Clone, Copy)]
struct PStrPrivateReprInline {
  size: u8,
  storage: [u8; 7],
}

#[derive(Clone, Copy)]
union PStrPrivateRepr {
  inline: PStrPrivateReprInline,
  heap_id: u64,
}

const ALL_ZERO_SLICE: [u8; 7] = [0; 7];

impl std::fmt::Debug for PStrPrivateRepr {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self.as_inline_str() {
      Ok(s) => f.debug_struct("PStrPrivateRepr").field("inline", &s).finish(),
      Err(id) => f.debug_struct("PStrPrivateRepr").field("heap_id", &id).finish(),
    }
  }
}

impl PStrPrivateRepr {
  fn as_inline_str(&self) -> Result<&str, u32> {
    unsafe {
      if (self.heap_id >> 56) != 255 {
        Ok(std::str::from_utf8_unchecked(&self.inline.storage[..(self.inline.size as usize)]))
      } else {
        Err((self.heap_id & (u32::MAX as u64)) as u32)
      }
    }
  }

  fn as_heap_id(&self) -> Option<u32> {
    unsafe {
      if (self.heap_id >> 56) as u8 == 255 {
        Some((self.heap_id & (u32::MAX as u64)) as u32)
      } else {
        None
      }
    }
  }

  fn from_str_opt(s: &str) -> Option<PStrPrivateRepr> {
    let bytes = s.as_bytes();
    let size = bytes.len();
    if size <= 7 {
      let mut storage = [0; 7];
      storage[..size].copy_from_slice(bytes);
      Some(PStrPrivateRepr { inline: PStrPrivateReprInline { size: size as u8, storage } })
    } else {
      None
    }
  }

  fn from_string(s: String) -> Result<PStrPrivateRepr, String> {
    let size = s.len();
    if size <= 7 {
      let mut bytes = s.into_bytes();
      bytes.extend_from_slice(&ALL_ZERO_SLICE[size..7]);
      Ok(PStrPrivateRepr {
        inline: PStrPrivateReprInline { size: size as u8, storage: bytes.try_into().unwrap() },
      })
    } else {
      Err(s)
    }
  }

  fn from_id(id: u32) -> PStrPrivateRepr {
    PStrPrivateRepr { heap_id: (id as u64) | (255_u64 << 56) }
  }
}

impl Eq for PStrPrivateRepr {}

impl PartialEq for PStrPrivateRepr {
  fn eq(&self, other: &Self) -> bool {
    unsafe { self.heap_id.eq(&other.heap_id) }
  }
}

impl Hash for PStrPrivateRepr {
  fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
    unsafe { self.heap_id.hash(state) }
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
pub struct PStr(PStrPrivateRepr);

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
    const __PAD_ARRAY_SIZE__: usize = 7 - $array.len();
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: $array.len() as u8,
        storage: concat_arrays!($array, [0; $pad]),
      },
    })
  }};
}

impl PStr {
  pub fn as_str<'a>(&'a self, heap: &'a Heap) -> &'a str {
    self.0.as_inline_str().unwrap_or_else(|id| &heap.str_pointer_table[id as usize])
  }

  fn create_inline_opt(s: &str) -> Option<PStr> {
    PStrPrivateRepr::from_str_opt(s).map(PStr)
  }

  pub const INVALID_PSTR: PStr = PStr(PStrPrivateRepr { heap_id: u64::MAX });
  pub const EMPTY: PStr = const_inline_pstr!(*b"", 7);

  pub const DUMMY_MODULE: PStr = const_inline_pstr!(*b"DUMMY", 2);
  pub const STR_TYPE: PStr = const_inline_pstr!(*b"Str", 4);
  pub const MAIN_TYPE: PStr = const_inline_pstr!(*b"Main", 3);
  pub const MAIN_FN: PStr = const_inline_pstr!(*b"main", 3);
  pub const PROCESS_TYPE: PStr = const_inline_pstr!(*b"Process", 0);
  pub const CONCAT: PStr = const_inline_pstr!(*b"concat", 1);
  pub const TO_INT: PStr = const_inline_pstr!(*b"toInt", 2);
  pub const FROM_INT: PStr = const_inline_pstr!(*b"fromInt", 0);
  pub const PRINTLN: PStr = const_inline_pstr!(*b"println", 0);
  pub const PANIC: PStr = const_inline_pstr!(*b"panic", 2);
  pub const MALLOC_FN: PStr = const_inline_pstr!(*b"malloc", 1);
  pub const FREE_FN: PStr = const_inline_pstr!(*b"free", 3);
  pub const INC_REF_FN: PStr = const_inline_pstr!(*b"inc_ref", 0);
  pub const DEC_REF_FN: PStr = const_inline_pstr!(*b"dec_ref", 0);
  pub const INIT: PStr = const_inline_pstr!(*b"init", 3);
  pub const THIS: PStr = const_inline_pstr!(*b"this", 3);

  pub const STD: PStr = const_inline_pstr!(*b"std", 4);
  pub const TUPLES: PStr = const_inline_pstr!(*b"tuples", 1);
  pub const PAIR: PStr = const_inline_pstr!(*b"Pair", 3);
  pub const TRIPLE: PStr = const_inline_pstr!(*b"Triple", 1);
  pub const TUPLE_4: PStr = const_inline_pstr!(*b"Tuple4", 1);
  pub const TUPLE_5: PStr = const_inline_pstr!(*b"Tuple5", 1);
  pub const TUPLE_6: PStr = const_inline_pstr!(*b"Tuple6", 1);
  pub const TUPLE_7: PStr = const_inline_pstr!(*b"Tuple7", 1);
  pub const TUPLE_8: PStr = const_inline_pstr!(*b"Tuple8", 1);
  pub const TUPLE_9: PStr = const_inline_pstr!(*b"Tuple9", 1);
  pub const TUPLE_10: PStr = const_inline_pstr!(*b"Tuple10", 0);
  pub const TUPLE_11: PStr = const_inline_pstr!(*b"Tuple11", 0);
  pub const TUPLE_12: PStr = const_inline_pstr!(*b"Tuple12", 0);
  pub const TUPLE_13: PStr = const_inline_pstr!(*b"Tuple13", 0);
  pub const TUPLE_14: PStr = const_inline_pstr!(*b"Tuple14", 0);
  pub const TUPLE_15: PStr = const_inline_pstr!(*b"Tuple15", 0);
  pub const TUPLE_16: PStr = const_inline_pstr!(*b"Tuple16", 0);

  pub const UNDERSCORE: PStr = const_inline_pstr!(*b"_", 6);
  pub const UNDERSCORE_THIS: PStr = const_inline_pstr!(*b"_this", 2);
  pub const UNDERSCORE_TMP: PStr = const_inline_pstr!(*b"_tmp", 3);
  pub const UNDERSCORE_STR: PStr = const_inline_pstr!(*b"_Str", 3);
  pub const UNDERSCORE_GENERATED_FN: PStr = const_inline_pstr!(*b"_GenFn", 1);
  pub const UNDERSCORE_GENERATED_TYPE: PStr = const_inline_pstr!(*b"_GenT", 2);

  pub const UPPER_A: PStr = const_inline_pstr!(*b"A", 6);
  pub const UPPER_B: PStr = const_inline_pstr!(*b"B", 6);
  pub const UPPER_C: PStr = const_inline_pstr!(*b"C", 6);
  pub const UPPER_D: PStr = const_inline_pstr!(*b"D", 6);
  pub const UPPER_E: PStr = const_inline_pstr!(*b"E", 6);
  pub const UPPER_F: PStr = const_inline_pstr!(*b"F", 6);
  pub const UPPER_G: PStr = const_inline_pstr!(*b"G", 6);
  pub const UPPER_H: PStr = const_inline_pstr!(*b"H", 6);
  pub const UPPER_I: PStr = const_inline_pstr!(*b"I", 6);
  pub const UPPER_J: PStr = const_inline_pstr!(*b"J", 6);
  pub const UPPER_T: PStr = const_inline_pstr!(*b"T", 6);

  pub const LOWER_A: PStr = const_inline_pstr!(*b"a", 6);
  pub const LOWER_B: PStr = const_inline_pstr!(*b"b", 6);
  pub const LOWER_C: PStr = const_inline_pstr!(*b"c", 6);
  pub const LOWER_D: PStr = const_inline_pstr!(*b"d", 6);
  pub const LOWER_E: PStr = const_inline_pstr!(*b"e", 6);
  pub const LOWER_F: PStr = const_inline_pstr!(*b"f", 6);
  pub const LOWER_G: PStr = const_inline_pstr!(*b"g", 6);
  pub const LOWER_H: PStr = const_inline_pstr!(*b"h", 6);
  pub const LOWER_I: PStr = const_inline_pstr!(*b"i", 6);
  pub const LOWER_J: PStr = const_inline_pstr!(*b"j", 6);
  pub const LOWER_K: PStr = const_inline_pstr!(*b"k", 6);
  pub const LOWER_L: PStr = const_inline_pstr!(*b"l", 6);
  pub const LOWER_M: PStr = const_inline_pstr!(*b"m", 6);
  pub const LOWER_N: PStr = const_inline_pstr!(*b"n", 6);
  pub const LOWER_O: PStr = const_inline_pstr!(*b"o", 6);
  pub const LOWER_P: PStr = const_inline_pstr!(*b"p", 6);
  pub const LOWER_Q: PStr = const_inline_pstr!(*b"q", 6);
  pub const LOWER_V: PStr = const_inline_pstr!(*b"v", 6);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ModuleReference(usize);

impl ModuleReference {
  pub const ROOT: ModuleReference = ModuleReference(0);
  pub const DUMMY: ModuleReference = ModuleReference(1);
  pub const STD_TUPLES: ModuleReference = ModuleReference(2);

  pub fn get_parts<'a>(&self, heap: &'a Heap) -> &'a [PStr] {
    heap.module_reference_pointer_table[self.0]
  }

  pub fn is_std(&self, heap: &Heap) -> bool {
    self.get_parts(heap).get(0) == Some(&PStr::STD)
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
  Temporary(String, bool), // bool: marked
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
    let dummy_parts = vec![PStr::DUMMY_MODULE];
    let allocated_dummy = heap.alloc_module_reference(dummy_parts);
    let allocated_std_tuples = heap.alloc_module_reference(vec![PStr::STD, PStr::TUPLES]);
    debug_assert!(ModuleReference::DUMMY == allocated_dummy); // Dummy
    debug_assert!(ModuleReference::STD_TUPLES == allocated_std_tuples); // Dummy
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
        .map(|id| PStr(PStrPrivateRepr::from_id(id)))
    }
  }

  pub fn alloc_str_permanent(&mut self, s: &'static str) -> PStr {
    self.alloc_str_internal(s)
  }

  // TODO
  // #[cfg(test)]
  pub fn alloc_str_for_test(&mut self, s: &'static str) -> PStr {
    self.alloc_str_internal(s)
  }

  fn alloc_str_internal(&mut self, str: &'static str) -> PStr {
    if let Some(p) = PStr::create_inline_opt(str) {
      p
    } else if let Some(id) = self.interned_static_str.get(&str) {
      PStr(PStrPrivateRepr::from_id(*id))
    } else if let Some(id) = self.interned_string.remove(&str) {
      // If for some reasons, the string is already allocated by regular strings,
      // we will promote this to the permanent generation.
      self.str_pointer_table[id as usize] = StringStoredInHeap::Permanent(str);
      self.interned_static_str.insert(str, id);
      PStr(PStrPrivateRepr::from_id(id))
    } else {
      let id = self.str_pointer_table.len() as u32;
      self.interned_static_str.insert(str, id);
      self.str_pointer_table.push(StringStoredInHeap::Permanent(str));
      PStr(PStrPrivateRepr::from_id(id))
    }
  }

  /// This function can only be called in compiler code.
  pub fn alloc_temp_str(&mut self) -> PStr {
    // We use a more specialized implementation here,
    // since the generated strings are guaranteed to be globally unique.
    let id = self.str_pointer_table.len() as u32;
    let string = format!("_t{id}");
    if let Some(p) = PStr::create_inline_opt(&string) {
      self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
      p
    } else {
      self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
      PStr(PStrPrivateRepr::from_id(id))
    }
  }

  pub fn alloc_string(&mut self, string: String) -> PStr {
    match PStrPrivateRepr::from_string(string) {
      Ok(repr) => PStr(repr),
      Err(string) => {
        let key = string.as_str();
        if let Some(id) = self.interned_static_str.get(&key) {
          PStr(PStrPrivateRepr::from_id(*id))
        } else if let Some(id) = self.interned_string.get(&key) {
          PStr(PStrPrivateRepr::from_id(*id))
        } else {
          let id = self.str_pointer_table.len() as u32;
          // The string pointer is managed by the the string pointer table.
          let unmanaged_str_ptr: &'static str = unsafe { (key as *const str).as_ref().unwrap() };
          self.str_pointer_table.push(StringStoredInHeap::Temporary(string, false));
          self.interned_string.insert(unmanaged_str_ptr, id);
          PStr(PStrPrivateRepr::from_id(id))
        }
      }
    }
  }

  fn make_string_static(string: String) -> &'static str {
    Box::leak(Box::new(string))
  }

  fn make_string_permanent(&mut self, p_str: PStr) {
    if let Some(id) = p_str.0.as_heap_id() {
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

  pub fn alloc_module_reference(&mut self, parts: Vec<PStr>) -> ModuleReference {
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

  pub fn alloc_dummy_module_reference(&mut self) -> ModuleReference {
    let parts = vec![PStr::DUMMY_MODULE];
    self.alloc_module_reference(parts)
  }

  /// Returns the statistics of heap to help debugging
  pub fn stat(&self) -> String {
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
  pub fn debug_unmarked_strings(&self) -> String {
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
  pub fn add_unmarked_module_reference(&mut self, module_reference: ModuleReference) {
    self.unmarked_module_references.insert(module_reference);
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function informs the heap that marking of a module has completed.
  ///
  /// It should be called at the end of one slice of incremental marking.
  pub fn pop_unmarked_module_reference(&mut self) -> Option<ModuleReference> {
    let item = self.unmarked_module_references.iter().next().copied()?;
    self.unmarked_module_references.remove(&item);
    Some(item)
  }

  /// This function can be used for GC purposes only. Use with caution.
  ///
  /// This function marks a string as being used, thus excluding it from the next around of GC.
  ///
  /// It should be called during incremental marking.
  pub fn mark(&mut self, p_str: PStr) {
    if let Some(id) = p_str.0.as_heap_id() {
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
  pub fn sweep(&mut self, work_unit: usize) {
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

#[cfg(test)]
mod tests {
  use super::{
    Heap, ModuleReference, PStr, PStrPrivateRepr, PStrPrivateReprInline, StringStoredInHeap,
  };
  use pretty_assertions::assert_eq;
  use std::{cmp::Ordering, ops::Deref};

  #[test]
  fn boilterplate() {
    assert!(PStrPrivateReprInline { size: 0, storage: [0; 7] }.clone().storage.contains(&0));
    assert!(!format!(
      "{:?}",
      PStr(PStrPrivateRepr { inline: PStrPrivateReprInline { size: 0, storage: [0; 7] } }).clone()
    )
    .is_empty());
    assert!(!format!("{:?}", PStr::INVALID_PSTR).is_empty());

    StringStoredInHeap::deallocated(true, "");
    StringStoredInHeap::deallocated(false, "");
  }

  #[test]
  fn heap_tests() {
    let mut heap = Heap::default();
    assert_eq!(1, heap.alloc_dummy_module_reference().0);
    let a1 = heap.alloc_str_for_test("aaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let b = PStr::LOWER_B;
    let a2 = heap.alloc_string("aaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string());
    heap.alloc_string("aa".to_string());
    assert!(PStrPrivateRepr { heap_id: 0 }.clone().eq(&PStrPrivateRepr { heap_id: 0 }));
    assert!(heap.get_allocated_str_opt("aaaaaaaaaaaaaaaaaaaaaaaaaaa").is_some());
    assert!(heap.get_allocated_str_opt("dddddddddddddddddddddddddddddddddddddddd").is_none());
    assert!(a1.clone().eq(&a2.clone()));
    assert!(a1.ne(&b));
    assert!(a2.ne(&b));
    assert_eq!(Ordering::Equal, a1.cmp(&a2));
    assert_eq!(Some(Ordering::Equal), a1.partial_cmp(&a2));
    a1.as_str(&heap);
    a2.as_str(&heap);
    b.clone().as_str(&heap);

    let ma1 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let mb = heap.alloc_module_reference_from_string_vec(vec!["b".to_string(), "d-c".to_string()]);
    let ma2 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let std_a =
      heap.alloc_module_reference_from_string_vec(vec!["std".to_string(), "a".to_string()]);
    let m_dummy = heap.alloc_dummy_module_reference();
    assert!(heap.get_allocated_module_reference_opt(vec!["a".to_string()]).is_some());
    assert!(heap.get_allocated_module_reference_opt(vec!["d-c".to_string()]).is_none());
    assert!(std_a.is_std(&heap));
    assert!(!ma2.is_std(&heap));
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

    for _ in 0..111111 {
      heap.alloc_temp_str();
    }
  }

  #[test]
  fn pstr_comparison() {
    let heap = &mut Heap::new();
    let s1 = PStr::LOWER_A;
    let s2 = heap.alloc_str_permanent("dfsdadasdasdasdasdasdasdasd");

    assert!(s1 <= s1);
    assert!(s1 <= s2);
    assert!(s2 >= s2);
    assert!(s2 >= s1);
  }

  #[test]
  fn heap_no_ops_on_inline_pstrs() {
    let heap = &mut Heap::new();
    heap.mark(PStr::LOWER_A);
    heap.make_string_permanent(PStr::CONCAT);
  }

  #[test]
  fn heap_mk_permanent_test() {
    let heap = &mut Heap::new();
    let s = heap.alloc_string("dfsdadasdasdasdasdasdasdasd".to_string());
    heap.alloc_string("dfsdadasdasdasdasdasdasdasd".to_string());
    heap.make_string_permanent(s);
    heap.make_string_permanent(s);
  }

  #[test]
  fn heap_alloc_regular_before_permanent_string() {
    let heap = &mut Heap::new();
    let s1 = heap.alloc_string("dfsdadasdasdasdasdasdasdasd".to_string());
    assert_eq!("dfsdadasdasdasdasdasdasdasd", s1.as_str(heap));
    let s2 = heap.alloc_str_permanent("dfsdadasdasdasdasdasdasdasd");
    assert_eq!(s1, s2);
  }

  #[test]
  fn heap_alloc_permanent_before_regular_string() {
    let heap = &mut Heap::new();
    let s1 = heap.alloc_str_permanent("dfsdadasdasdasdasdasdasdasd");
    let s2 = heap.alloc_str_permanent("dfsdadasdasdasdasdasdasdasd");
    let s3 = heap.alloc_string("dfsdadasdasdasdasdasdasdasd".to_string());
    assert_eq!(s1, s2);
    assert_eq!(s1, s3);
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
    heap.add_unmarked_module_reference(ModuleReference::DUMMY);
    heap.sweep(1000);
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
  }

  #[test]
  fn gc_mark_unmark_module_reference_sweep_test() {
    let heap = &mut Heap::new();
    heap.alloc_string("a_string_that_is_intentionally_very_long_1".to_string());
    assert_eq!("Total slots: 1. Total used: 1. Total unused: 0", heap.stat());
    heap.add_unmarked_module_reference(ModuleReference::DUMMY);
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
    PStr(PStrPrivateRepr::from_id(1000)).as_str(&heap);
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
}
