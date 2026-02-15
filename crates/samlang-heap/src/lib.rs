use dupe::Dupe;
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
  storage: [u8; 15],
}

#[derive(Clone, Copy)]
union PStrPrivateRepr {
  inline: PStrPrivateReprInline,
  heap_id: u128,
}

const ALL_ZERO_SLICE: [u8; 15] = [0; 15];

impl std::fmt::Debug for PStrPrivateRepr {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self.as_inline_str() {
      Ok(s) => f.write_fmt(format_args!("\"{s}\"")),
      Err(id) => f.write_fmt(format_args!("id={id}")),
    }
  }
}

impl PStrPrivateRepr {
  fn as_inline_str(&self) -> Result<&str, u32> {
    unsafe {
      if (self.heap_id >> 120) != 255 {
        Ok(std::str::from_utf8_unchecked(&self.inline.storage[..(self.inline.size as usize)]))
      } else {
        Err((self.heap_id & (u32::MAX as u128)) as u32)
      }
    }
  }

  fn as_heap_id(&self) -> Option<u32> {
    unsafe {
      if (self.heap_id >> 120) as u8 == 255 {
        Some((self.heap_id & (u32::MAX as u128)) as u32)
      } else {
        None
      }
    }
  }

  fn from_str_opt(s: &str) -> Option<PStrPrivateRepr> {
    let bytes = s.as_bytes();
    let size = bytes.len();
    if size <= 15 {
      let mut storage = [0; 15];
      storage[..size].copy_from_slice(bytes);
      Some(PStrPrivateRepr { inline: PStrPrivateReprInline { size: size as u8, storage } })
    } else {
      None
    }
  }

  fn from_string(s: String) -> Result<PStrPrivateRepr, String> {
    let size = s.len();
    if size <= 15 {
      let mut bytes = s.into_bytes();
      bytes.extend_from_slice(&ALL_ZERO_SLICE[size..15]);
      Ok(PStrPrivateRepr {
        inline: PStrPrivateReprInline { size: size as u8, storage: bytes.try_into().unwrap() },
      })
    } else {
      Err(s)
    }
  }

  fn from_id(id: u32) -> PStrPrivateRepr {
    PStrPrivateRepr { heap_id: (id as u128) | (255_u128 << 120) }
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

impl Dupe for PStrPrivateRepr {}

#[derive(Debug, Clone, Dupe, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
/// A string pointer free to be copied. However, we have to do GC manually.
pub struct PStr(PStrPrivateRepr);

impl PStr {
  pub fn as_str<'a>(&'a self, heap: &'a Heap) -> &'a str {
    self.0.as_inline_str().unwrap_or_else(|id| &heap.str_pointer_table[id as usize])
  }

  fn create_inline_opt(s: &str) -> Option<PStr> {
    PStrPrivateRepr::from_str_opt(s).map(PStr)
  }

  pub const fn one_letter_literal(c: char) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 1,
        storage: [c as u8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
  }

  pub const fn two_letter_literal(bytes: &[u8; 2]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 2,
        storage: [bytes[0], bytes[1], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
  }

  pub const fn three_letter_literal(bytes: &[u8; 3]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 3,
        storage: [bytes[0], bytes[1], bytes[2], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
  }

  pub const fn four_letter_literal(bytes: &[u8; 4]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 4,
        storage: [bytes[0], bytes[1], bytes[2], bytes[3], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
  }

  pub const fn five_letter_literal(bytes: &[u8; 5]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 5,
        storage: [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      },
    })
  }

  pub const fn six_letter_literal(bytes: &[u8; 6]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 6,
        storage: [
          bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], 0, 0, 0, 0, 0, 0, 0, 0, 0,
        ],
      },
    })
  }

  pub const fn seven_letter_literal(bytes: &[u8; 7]) -> PStr {
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline {
        size: 7,
        storage: [
          bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], 0, 0, 0, 0, 0, 0,
          0, 0,
        ],
      },
    })
  }

  pub const INVALID_PSTR: PStr = PStr(PStrPrivateRepr { heap_id: u128::MAX });
  pub const EMPTY: PStr =
    PStr(PStrPrivateRepr { inline: PStrPrivateReprInline { size: 0, storage: [0; 15] } });

  pub const DUMMY_MODULE: PStr = Self::five_letter_literal(b"DUMMY");
  pub const MISSING: PStr = Self::seven_letter_literal(b"MISSING");
  pub const STR_TYPE: PStr = Self::three_letter_literal(b"Str");
  pub const MAIN_TYPE: PStr = Self::four_letter_literal(b"Main");
  pub const MAIN_FN: PStr = Self::four_letter_literal(b"main");
  pub const PROCESS_TYPE: PStr = Self::seven_letter_literal(b"Process");
  pub const CONCAT: PStr = Self::six_letter_literal(b"concat");
  pub const TO_INT: PStr = Self::five_letter_literal(b"toInt");
  pub const FROM_INT: PStr = Self::seven_letter_literal(b"fromInt");
  pub const PRINTLN: PStr = Self::seven_letter_literal(b"println");
  pub const PANIC: PStr = Self::five_letter_literal(b"panic");
  pub const FREE_FN: PStr = Self::four_letter_literal(b"free");
  pub const INC_REF_FN: PStr = Self::seven_letter_literal(b"inc_ref");
  pub const DEC_REF_FN: PStr = Self::seven_letter_literal(b"dec_ref");
  pub const INIT: PStr = Self::four_letter_literal(b"init");
  pub const THIS: PStr = Self::four_letter_literal(b"this");

  pub const STD: PStr = Self::three_letter_literal(b"std");
  pub const TUPLES: PStr = Self::six_letter_literal(b"tuples");
  pub const PAIR: PStr = Self::four_letter_literal(b"Pair");
  pub const TRIPLE: PStr = Self::six_letter_literal(b"Triple");
  pub const TUPLE_4: PStr = Self::six_letter_literal(b"Tuple4");
  pub const TUPLE_5: PStr = Self::six_letter_literal(b"Tuple5");
  pub const TUPLE_6: PStr = Self::six_letter_literal(b"Tuple6");
  pub const TUPLE_7: PStr = Self::six_letter_literal(b"Tuple7");
  pub const TUPLE_8: PStr = Self::six_letter_literal(b"Tuple8");
  pub const TUPLE_9: PStr = Self::six_letter_literal(b"Tuple9");
  pub const TUPLE_10: PStr = Self::seven_letter_literal(b"Tuple10");
  pub const TUPLE_11: PStr = Self::seven_letter_literal(b"Tuple11");
  pub const TUPLE_12: PStr = Self::seven_letter_literal(b"Tuple12");
  pub const TUPLE_13: PStr = Self::seven_letter_literal(b"Tuple13");
  pub const TUPLE_14: PStr = Self::seven_letter_literal(b"Tuple14");
  pub const TUPLE_15: PStr = Self::seven_letter_literal(b"Tuple15");
  pub const TUPLE_16: PStr = Self::seven_letter_literal(b"Tuple16");

  pub const UNDERSCORE: PStr = Self::one_letter_literal('_');
  pub const UNDERSCORE_THIS: PStr = Self::five_letter_literal(b"_this");
  pub const UNDERSCORE_TMP: PStr = Self::four_letter_literal(b"_tmp");
  pub const UNDERSCORE_STR: PStr = Self::four_letter_literal(b"_Str");
  pub const UNDERSCORE_GENERATED_FN: PStr = Self::six_letter_literal(b"_GenFn");
  pub const UNDERSCORE_GENERATED_TYPE: PStr = Self::five_letter_literal(b"_GenT");

  pub const UPPER_A: PStr = Self::one_letter_literal('A');
  pub const UPPER_B: PStr = Self::one_letter_literal('B');
  pub const UPPER_C: PStr = Self::one_letter_literal('C');
  pub const UPPER_D: PStr = Self::one_letter_literal('D');
  pub const UPPER_E: PStr = Self::one_letter_literal('E');
  pub const UPPER_F: PStr = Self::one_letter_literal('F');
  pub const UPPER_G: PStr = Self::one_letter_literal('G');
  pub const UPPER_H: PStr = Self::one_letter_literal('H');
  pub const UPPER_I: PStr = Self::one_letter_literal('I');
  pub const UPPER_J: PStr = Self::one_letter_literal('J');
  pub const UPPER_K: PStr = Self::one_letter_literal('K');
  pub const UPPER_L: PStr = Self::one_letter_literal('L');
  pub const UPPER_M: PStr = Self::one_letter_literal('M');
  pub const UPPER_N: PStr = Self::one_letter_literal('N');
  pub const UPPER_O: PStr = Self::one_letter_literal('O');
  pub const UPPER_P: PStr = Self::one_letter_literal('P');
  pub const UPPER_Q: PStr = Self::one_letter_literal('Q');
  pub const UPPER_R: PStr = Self::one_letter_literal('R');
  pub const UPPER_S: PStr = Self::one_letter_literal('S');
  pub const UPPER_T: PStr = Self::one_letter_literal('T');
  pub const UPPER_U: PStr = Self::one_letter_literal('U');
  pub const UPPER_V: PStr = Self::one_letter_literal('V');
  pub const UPPER_W: PStr = Self::one_letter_literal('W');
  pub const UPPER_X: PStr = Self::one_letter_literal('X');
  pub const UPPER_Y: PStr = Self::one_letter_literal('Y');
  pub const UPPER_Z: PStr = Self::one_letter_literal('Z');

  pub const LOWER_A: PStr = Self::one_letter_literal('a');
  pub const LOWER_B: PStr = Self::one_letter_literal('b');
  pub const LOWER_C: PStr = Self::one_letter_literal('c');
  pub const LOWER_D: PStr = Self::one_letter_literal('d');
  pub const LOWER_E: PStr = Self::one_letter_literal('e');
  pub const LOWER_F: PStr = Self::one_letter_literal('f');
  pub const LOWER_G: PStr = Self::one_letter_literal('g');
  pub const LOWER_H: PStr = Self::one_letter_literal('h');
  pub const LOWER_I: PStr = Self::one_letter_literal('i');
  pub const LOWER_J: PStr = Self::one_letter_literal('j');
  pub const LOWER_K: PStr = Self::one_letter_literal('k');
  pub const LOWER_L: PStr = Self::one_letter_literal('l');
  pub const LOWER_M: PStr = Self::one_letter_literal('m');
  pub const LOWER_N: PStr = Self::one_letter_literal('n');
  pub const LOWER_O: PStr = Self::one_letter_literal('o');
  pub const LOWER_P: PStr = Self::one_letter_literal('p');
  pub const LOWER_Q: PStr = Self::one_letter_literal('q');
  pub const LOWER_R: PStr = Self::one_letter_literal('r');
  pub const LOWER_S: PStr = Self::one_letter_literal('s');
  pub const LOWER_T: PStr = Self::one_letter_literal('t');
  pub const LOWER_U: PStr = Self::one_letter_literal('u');
  pub const LOWER_V: PStr = Self::one_letter_literal('v');
  pub const LOWER_W: PStr = Self::one_letter_literal('w');
  pub const LOWER_X: PStr = Self::one_letter_literal('x');
  pub const LOWER_Y: PStr = Self::one_letter_literal('y');
  pub const LOWER_Z: PStr = Self::one_letter_literal('z');
}

#[derive(Debug, Clone, Dupe, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ModuleReference(usize);

impl ModuleReference {
  pub const ROOT: ModuleReference = ModuleReference(0);
  pub const DUMMY: ModuleReference = ModuleReference(1);
  pub const STD_TUPLES: ModuleReference = ModuleReference(2);

  pub fn get_parts<'a>(&self, heap: &'a Heap) -> &'a [PStr] {
    heap.module_reference_pointer_table[self.0]
  }

  pub fn is_std(&self, heap: &Heap) -> bool {
    self.get_parts(heap).first() == Some(&PStr::STD)
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
      str_pointer_table: Vec::new(),
      module_reference_pointer_table: Vec::new(),
      interned_string: HashMap::new(),
      interned_static_str: HashMap::new(),
      interned_module_reference: HashMap::new(),
      unmarked_module_references: HashSet::new(),
      sweep_index: 0,
    };
    heap.alloc_module_reference(Vec::new()); // Root
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
    // We are going to run out of memory before hitting the case when we cannot inline alloc the string
    let p = PStr::create_inline_opt(&string).expect("Too many temporary strings");
    // We will never read from here, but we just need the ID to increase,
    // so we push some cheap value there.
    self.str_pointer_table.push(StringStoredInHeap::Permanent(""));
    p
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
    let mut p_str_parts = Vec::new();
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
    let parts =
      parts.into_iter().map(|p| self.alloc_str_internal(Self::make_string_static(p))).collect_vec();
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
  use dupe::Dupe;
  use pretty_assertions::assert_eq;
  use std::{cmp::Ordering, ops::Deref};

  #[test]
  fn boilterplate() {
    assert!(PStrPrivateReprInline { size: 0, storage: [0; 15] }.storage.contains(&0));
    assert!(
      !format!(
        "{:?} {:?}",
        PStr(PStrPrivateRepr { inline: PStrPrivateReprInline { size: 0, storage: [0; 15] } })
          .dupe(),
        PStr::INVALID_PSTR
      )
      .is_empty()
    );

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
    assert!(PStrPrivateRepr { heap_id: 0 }.dupe().eq(&PStrPrivateRepr { heap_id: 0 }));
    assert!(heap.get_allocated_str_opt("aaaaaaaaaaaaaaaaaaaaaaaaaaa").is_some());
    assert!(heap.get_allocated_str_opt("dddddddddddddddddddddddddddddddddddddddd").is_none());
    assert!(a1.dupe().eq(&a2.dupe()));
    assert!(a1.ne(&b));
    assert!(a2.ne(&b));
    assert_eq!(Ordering::Equal, a1.cmp(&a2));
    assert_eq!(Some(Ordering::Equal), a1.partial_cmp(&a2));
    a1.as_str(&heap);
    a2.as_str(&heap);
    b.dupe().as_str(&heap);

    let ma1 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let mb = heap.alloc_module_reference_from_string_vec(vec!["b".to_string(), "d-c".to_string()]);
    let ma2 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let std_a =
      heap.alloc_module_reference_from_string_vec(vec!["std".to_string(), "a".to_string()]);
    let m_dummy = heap.alloc_dummy_module_reference();
    assert_eq!(true, heap.get_allocated_module_reference_opt(vec!["a".to_string()]).is_some());
    assert_eq!(true, heap.get_allocated_module_reference_opt(vec!["d-c".to_string()]).is_none());
    assert_eq!(true, std_a.is_std(&heap));
    assert_eq!(false, ma2.is_std(&heap));
    assert_eq!(
      true,
      heap
        .get_allocated_module_reference_opt(vec!["ddasdasdassdfasdfasdfasdfasdf".to_string()])
        .is_none()
    );
    assert!(!format!("{mb:?}").is_empty());
    assert_eq!(ma1.dupe(), ma2.dupe());
    assert_ne!(ma1, mb);
    assert_ne!(ma2, mb);
    assert_eq!(Ordering::Equal, ma1.cmp(&ma2));
    assert_eq!(Some(Ordering::Equal), ma1.partial_cmp(&ma2));
    assert_eq!("a", ma1.pretty_print(&heap));
    assert_eq!("b/d-c.sam", mb.to_filename(&heap));
    assert_eq!("b$d_c", mb.encoded(&heap));
    assert_eq!("DUMMY", m_dummy.pretty_print(&heap));
    mb.dupe().pretty_print(&heap);
  }

  #[test]
  fn heap_create_temp_str_coverage_tests() {
    let mut heap = Heap::default();
    for _ in 0..11 {
      heap.alloc_temp_str();
    }
  }

  #[test]
  fn pstr_comparison() {
    let heap = &mut Heap::new();
    let s1 = PStr::LOWER_A;
    let s2 = heap.alloc_str_for_test("dfsdadasdasdasdasdasdasdasd");

    assert!(s1 <= s1);
    assert!(s1 <= s2);
    assert!(s2 >= s2);
    assert!(s2 >= s1);
  }

  #[test]
  fn pstr_const_ctor_fns() {
    let heap = &Heap::new();
    assert_eq!("a", PStr::one_letter_literal('a').as_str(heap));
    assert_eq!("aa", PStr::two_letter_literal(b"aa").as_str(heap));
    assert_eq!("aaa", PStr::three_letter_literal(b"aaa").as_str(heap));
    assert_eq!("aaaa", PStr::four_letter_literal(b"aaaa").as_str(heap));
    assert_eq!("aaaaa", PStr::five_letter_literal(b"aaaaa").as_str(heap));
    assert_eq!("aaaaaa", PStr::six_letter_literal(b"aaaaaa").as_str(heap));
    assert_eq!("aaaaaaa", PStr::seven_letter_literal(b"aaaaaaa").as_str(heap));
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
    let s1 = heap.alloc_string(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew"
        .to_string(),
    );
    assert_eq!(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew",
      s1.as_str(heap)
    );
    let s2 = heap.alloc_str_for_test(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew",
    );
    assert_eq!(s1, s2);
  }

  #[test]
  fn heap_alloc_permanent_before_regular_string() {
    let heap = &mut Heap::new();
    let s1 = heap.alloc_str_for_test(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew",
    );
    let s2 = heap.alloc_str_for_test(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew",
    );
    let s3 = heap.alloc_string(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew"
        .to_string(),
    );
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
