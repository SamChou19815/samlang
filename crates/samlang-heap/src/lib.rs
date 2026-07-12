use dupe::Dupe;
use itertools::Itertools;
use std::{
  collections::HashMap,
  mem::ManuallyDrop,
  ops::Deref,
  sync::{
    Arc,
    atomic::{AtomicU32, Ordering},
  },
};

const INLINE_STR_CAPACITY: usize = 15;
/// Flag bit set in the tag byte of every inline string, so that the tag byte is never zero.
const INLINE_TAG_FLAG: u8 = 0x80;
const INVALID_TAG: u8 = u8::MAX;

#[repr(C)]
#[derive(Clone, Copy)]
struct PStrPrivateReprInline {
  storage: [u8; INLINE_STR_CAPACITY],
  /// `INLINE_TAG_FLAG | size` for inline strings, or `INVALID_TAG`: always nonzero.
  /// This byte doubles as the tag of the union (see `PStrPrivateRepr::tag`).
  tagged_size: u8,
}

/// A 16-byte tagged union: either 15 bytes of inline string data, or a plain `Arc<str>`.
///
/// The tag is the last byte. For the inline/invalid variants it is always nonzero.
/// For the heap variant, the last byte of an `Arc<str>` is the most significant byte of
/// either its length (< 2^56) or its data pointer (canonical 64-bit userspace address),
/// so it is always zero on every supported (little-endian) 64-bit target. On 32-bit
/// targets (wasm32) the `Arc<str>` covers only the first 8 bytes, so `heap_variant`
/// explicitly zeroes the repr before writing the `Arc`. This invariant is asserted at
/// every new heap allocation in `from_arc_str`, so a layout change would fail fast
/// rather than misbehave.
#[repr(C)]
union PStrPrivateRepr {
  inline: PStrPrivateReprInline,
  heap: ManuallyDrop<Arc<str>>,
}

const _: () = assert!(std::mem::size_of::<PStrPrivateRepr>() == 16);
const _: () = assert!(cfg!(target_endian = "little"));

enum PStrPrivateView<'a> {
  Inline(&'a str),
  Heap(&'a str),
  Invalid,
}

impl PStrPrivateRepr {
  fn tag(&self) -> u8 {
    // SAFETY: the last byte is always initialized in both variants,
    // and every bit pattern is a valid u8.
    unsafe { self.inline.tagged_size }
  }

  fn view(&self) -> PStrPrivateView<'_> {
    let tag = self.tag();
    if tag == 0 {
      // SAFETY: a zero tag byte means the repr holds a live `Arc<str>` (see type docs).
      PStrPrivateView::Heap(unsafe { &self.heap })
    } else if tag != INVALID_TAG {
      debug_assert!(tag & INLINE_TAG_FLAG != 0);
      let size = (tag & !INLINE_TAG_FLAG) as usize;
      // SAFETY: inline-tagged repr always holds bytes copied from a valid str.
      PStrPrivateView::Inline(unsafe {
        std::str::from_utf8_unchecked(&self.inline.storage[..size])
      })
    } else {
      PStrPrivateView::Invalid
    }
  }

  fn as_str_opt(&self) -> Option<&str> {
    match self.view() {
      PStrPrivateView::Inline(s) | PStrPrivateView::Heap(s) => Some(s),
      PStrPrivateView::Invalid => None,
    }
  }

  fn from_str_opt(s: &str) -> Option<PStrPrivateRepr> {
    let bytes = s.as_bytes();
    let size = bytes.len();
    if size <= INLINE_STR_CAPACITY {
      let mut storage = [0; INLINE_STR_CAPACITY];
      storage[..size].copy_from_slice(bytes);
      Some(PStrPrivateRepr {
        inline: PStrPrivateReprInline { storage, tagged_size: INLINE_TAG_FLAG | (size as u8) },
      })
    } else {
      None
    }
  }

  #[cfg(target_pointer_width = "64")]
  fn heap_variant(arc: Arc<str>) -> PStrPrivateRepr {
    PStrPrivateRepr { heap: ManuallyDrop::new(arc) }
  }

  #[cfg(not(target_pointer_width = "64"))]
  fn heap_variant(arc: Arc<str>) -> PStrPrivateRepr {
    // The `Arc<str>` covers only the first 8 of the repr's 16 bytes, so start from an
    // all-zero repr to keep the tag byte initialized (to the heap-variant tag of zero).
    let mut repr = PStrPrivateRepr {
      inline: PStrPrivateReprInline { storage: [0; INLINE_STR_CAPACITY], tagged_size: 0 },
    };
    repr.heap = ManuallyDrop::new(arc);
    repr
  }

  fn from_arc_str(arc: Arc<str>) -> PStrPrivateRepr {
    let repr = Self::heap_variant(arc);
    // Guards the tagging invariant documented on the type.
    assert_eq!(0, repr.tag(), "Unsupported Arc<str> layout on this platform");
    repr
  }

  /// Returns a new strong reference to the underlying `Arc<str>` for heap strings.
  fn as_heap_arc(&self) -> Option<Arc<str>> {
    if self.tag() == 0 {
      // SAFETY: a zero tag byte means the repr holds a live `Arc<str>`.
      Some(Arc::clone(unsafe { &self.heap }))
    } else {
      None
    }
  }
}

impl Clone for PStrPrivateRepr {
  fn clone(&self) -> Self {
    match self.as_heap_arc() {
      Some(arc) => PStrPrivateRepr::heap_variant(arc),
      // SAFETY: non-heap variants are plain bytes.
      None => PStrPrivateRepr { inline: unsafe { self.inline } },
    }
  }
}

impl Drop for PStrPrivateRepr {
  fn drop(&mut self) {
    if self.tag() == 0 {
      // SAFETY: a zero tag byte means the repr holds a live `Arc<str>`,
      // whose strong reference is owned by this repr and released exactly once here.
      unsafe { ManuallyDrop::drop(&mut self.heap) }
    }
  }
}

impl std::fmt::Debug for PStrPrivateRepr {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self.as_str_opt() {
      Some(s) => f.write_fmt(format_args!("\"{s}\"")),
      None => f.write_str("INVALID"),
    }
  }
}

impl PartialEq for PStrPrivateRepr {
  fn eq(&self, other: &Self) -> bool {
    match (self.view(), other.view()) {
      (PStrPrivateView::Inline(s1), PStrPrivateView::Inline(s2)) => s1 == s2,
      (PStrPrivateView::Heap(s1), PStrPrivateView::Heap(s2)) => {
        // Duped PStrs share one allocation, so try pointer equality first.
        std::ptr::eq(s1, s2) || s1 == s2
      }
      (PStrPrivateView::Invalid, PStrPrivateView::Invalid) => true,
      _ => false,
    }
  }
}

impl Eq for PStrPrivateRepr {}

impl std::hash::Hash for PStrPrivateRepr {
  fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
    match self.view() {
      PStrPrivateView::Inline(s) | PStrPrivateView::Heap(s) => s.hash(state),
      PStrPrivateView::Invalid => INVALID_TAG.hash(state),
    }
  }
}

impl Ord for PStrPrivateRepr {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    match (self.view(), other.view()) {
      (PStrPrivateView::Inline(s1), PStrPrivateView::Inline(s2)) => s1.cmp(s2),
      (PStrPrivateView::Inline(_), PStrPrivateView::Heap(_)) => std::cmp::Ordering::Less,
      (PStrPrivateView::Heap(_), PStrPrivateView::Inline(_)) => std::cmp::Ordering::Greater,
      (PStrPrivateView::Heap(s1), PStrPrivateView::Heap(s2)) => s1.cmp(s2),
      (PStrPrivateView::Invalid, PStrPrivateView::Invalid) => std::cmp::Ordering::Equal,
      (PStrPrivateView::Invalid, _) => std::cmp::Ordering::Greater,
      (_, PStrPrivateView::Invalid) => std::cmp::Ordering::Less,
    }
  }
}

impl PartialOrd for PStrPrivateRepr {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

impl Dupe for PStrPrivateRepr {}

#[derive(Debug, Clone, Dupe, PartialEq, Eq, PartialOrd, Ord, Hash)]
/// A string pointer that is cheap to clone/dupe. Short strings are stored inline, while long
/// strings are shared reference-counted `Arc<str>` allocations. Equality, ordering and hashing
/// are all content-based, so two independently allocated `PStr`s of the same string are equal.
pub struct PStr(PStrPrivateRepr);

impl PStr {
  pub fn as_str<'a>(&'a self, _heap: &'a Heap) -> &'a str {
    self.0.as_str_opt().expect("Dereferencing PStr::INVALID_PSTR")
  }

  fn create_inline_opt(s: &str) -> Option<PStr> {
    PStrPrivateRepr::from_str_opt(s).map(PStr)
  }

  const fn inline_literal<const N: usize>(bytes: &[u8; N]) -> PStr {
    let mut storage = [0; INLINE_STR_CAPACITY];
    let mut i = 0;
    while i < N {
      storage[i] = bytes[i];
      i += 1;
    }
    PStr(PStrPrivateRepr {
      inline: PStrPrivateReprInline { storage, tagged_size: INLINE_TAG_FLAG | (N as u8) },
    })
  }

  pub const fn one_letter_literal(c: char) -> PStr {
    Self::inline_literal(&[c as u8])
  }

  pub const fn two_letter_literal(bytes: &[u8; 2]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn three_letter_literal(bytes: &[u8; 3]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn four_letter_literal(bytes: &[u8; 4]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn five_letter_literal(bytes: &[u8; 5]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn six_letter_literal(bytes: &[u8; 6]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn seven_letter_literal(bytes: &[u8; 7]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn eight_letter_literal(bytes: &[u8; 8]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn nine_letter_literal(bytes: &[u8; 9]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const fn twelve_letter_literal(bytes: &[u8; 12]) -> PStr {
    Self::inline_literal(bytes)
  }

  pub const INVALID_PSTR: PStr = PStr(PStrPrivateRepr {
    inline: PStrPrivateReprInline { storage: [0; INLINE_STR_CAPACITY], tagged_size: INVALID_TAG },
  });
  pub const EMPTY: PStr = PStr(PStrPrivateRepr {
    inline: PStrPrivateReprInline {
      storage: [0; INLINE_STR_CAPACITY],
      tagged_size: INLINE_TAG_FLAG,
    },
  });
  pub const DUMMY_MODULE: PStr = Self::five_letter_literal(b"DUMMY");
  pub const MISSING: PStr = Self::seven_letter_literal(b"missing");
  pub const STR_TYPE: PStr = Self::three_letter_literal(b"Str");
  pub const MAIN_TYPE: PStr = Self::four_letter_literal(b"Main");
  pub const MAIN_FN: PStr = Self::four_letter_literal(b"main");
  pub const PROCESS_TYPE: PStr = Self::seven_letter_literal(b"Process");
  pub const VEC_TYPE: PStr = Self::three_letter_literal(b"Vec");
  pub const CONCAT: PStr = Self::six_letter_literal(b"concat");
  pub const STR_EQ: PStr = Self::two_letter_literal(b"eq");
  pub const TO_INT: PStr = Self::five_letter_literal(b"toInt");
  pub const FROM_INT: PStr = Self::seven_letter_literal(b"fromInt");
  pub const PRINTLN: PStr = Self::seven_letter_literal(b"println");
  pub const PANIC: PStr = Self::five_letter_literal(b"panic");
  pub const FREE_FN: PStr = Self::four_letter_literal(b"free");
  pub const INC_REF_FN: PStr = Self::seven_letter_literal(b"inc_ref");
  pub const DEC_REF_FN: PStr = Self::seven_letter_literal(b"dec_ref");
  pub const INIT: PStr = Self::four_letter_literal(b"init");
  pub const THIS: PStr = Self::four_letter_literal(b"this");

  pub const EMPTY_FN: PStr = Self::five_letter_literal(b"empty");
  pub const OF: PStr = Self::two_letter_literal(b"of");
  pub const WITH_CAPACITY: PStr = Self::twelve_letter_literal(b"withCapacity");
  pub const LENGTH: PStr = Self::six_letter_literal(b"length");
  pub const CAPACITY: PStr = Self::eight_letter_literal(b"capacity");
  pub const RESERVE: PStr = Self::seven_letter_literal(b"reserve");
  pub const PUSH: PStr = Self::four_letter_literal(b"push");
  pub const POP: PStr = Self::three_letter_literal(b"pop");
  pub const GET: PStr = Self::three_letter_literal(b"get");
  pub const SET: PStr = Self::three_letter_literal(b"set");
  pub const FOR_EACH: PStr = Self::seven_letter_literal(b"forEach");
  pub const MAP: PStr = Self::three_letter_literal(b"map");
  pub const FOLD: PStr = Self::four_letter_literal(b"fold");
  pub const UNWRAP_I31: PStr = Self::nine_letter_literal(b"unwrapI31");

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

/// Thread-safe counter for allocating temporary PStr names during parallel optimization.
/// Replaces `&mut Heap` in per-function passes that only need `alloc_temp_str()`.
pub struct TempPStrCounter {
  counter: AtomicU32,
}

impl TempPStrCounter {
  pub fn new(start: u32) -> Self {
    Self { counter: AtomicU32::new(start) }
  }

  pub fn alloc_temp_str(&self) -> PStr {
    let id = self.counter.fetch_add(1, Ordering::Relaxed);
    let string = format!("_t{id}");
    PStr::create_inline_opt(&string).expect("Too many temporary strings")
  }

  fn current(&self) -> u32 {
    self.counter.load(Ordering::Relaxed)
  }
}

/// The heap interns module references and allocates the globally unique temp string names.
/// Strings themselves are not interned: every `PStr` fully owns its string (inline or via a
/// reference-counted allocation), so no GC of the heap is ever needed.
pub struct Heap {
  module_reference_pointer_table: Vec<&'static [PStr]>,
  interned_module_reference: HashMap<&'static [PStr], ModuleReference>,
  alloc_counter: u32,
}

impl Heap {
  pub fn new() -> Heap {
    let mut heap = Heap {
      module_reference_pointer_table: Vec::new(),
      interned_module_reference: HashMap::new(),
      alloc_counter: 0,
    };
    heap.alloc_module_reference(Vec::new()); // Root
    let dummy_parts = vec![PStr::DUMMY_MODULE];
    let allocated_dummy = heap.alloc_module_reference(dummy_parts);
    let allocated_std_tuples = heap.alloc_module_reference(vec![PStr::STD, PStr::TUPLES]);
    debug_assert!(ModuleReference::DUMMY == allocated_dummy); // Dummy
    debug_assert!(ModuleReference::STD_TUPLES == allocated_std_tuples); // Dummy
    heap
  }

  pub fn alloc_str_for_test(&self, s: &'static str) -> PStr {
    Self::alloc_str_internal(s)
  }

  fn alloc_str_internal(str: &str) -> PStr {
    if let Some(p) = PStr::create_inline_opt(str) {
      p
    } else {
      PStr(PStrPrivateRepr::from_arc_str(Arc::from(str)))
    }
  }

  pub fn create_temp_counter(&self) -> TempPStrCounter {
    TempPStrCounter::new(self.alloc_counter)
  }

  pub fn sync_temp_counter(&mut self, counter: &TempPStrCounter) {
    self.alloc_counter = self.alloc_counter.max(counter.current());
  }

  /// This function can only be called in compiler code.
  pub fn alloc_temp_str(&mut self) -> PStr {
    // We use a more specialized implementation here,
    // since the generated strings are guaranteed to be globally unique.
    let id = self.alloc_counter;
    self.alloc_counter += 1;
    let string = format!("_t{id}");
    // We are going to run out of memory before hitting the case when we cannot inline alloc the string
    PStr::create_inline_opt(&string).expect("Too many temporary strings")
  }

  pub fn alloc_string(string: String) -> PStr {
    if let Some(repr) = PStrPrivateRepr::from_str_opt(&string) {
      PStr(repr)
    } else {
      PStr(PStrPrivateRepr::from_arc_str(Arc::from(string)))
    }
  }

  pub fn get_allocated_module_reference_opt(&self, parts: Vec<String>) -> Option<ModuleReference> {
    let p_str_parts = parts.iter().map(|p| Self::alloc_str_internal(p)).collect_vec();
    self.interned_module_reference.get(p_str_parts.deref()).cloned()
  }

  pub fn alloc_module_reference(&mut self, parts: Vec<PStr>) -> ModuleReference {
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
    let parts = parts.into_iter().map(Heap::alloc_string).collect_vec();
    self.alloc_module_reference(parts)
  }

  pub fn alloc_dummy_module_reference(&mut self) -> ModuleReference {
    let parts = vec![PStr::DUMMY_MODULE];
    self.alloc_module_reference(parts)
  }
}

impl Default for Heap {
  fn default() -> Self {
    Self::new()
  }
}

#[cfg(test)]
mod tests {
  use super::{Heap, ModuleReference, PStr, TempPStrCounter};
  use dupe::Dupe;
  use pretty_assertions::assert_eq;
  use std::{cmp::Ordering, collections::HashSet};

  #[test]
  fn pstr_size_test() {
    assert_eq!(16, std::mem::size_of::<PStr>());
  }

  #[test]
  fn boilterplate() {
    let long = Heap::alloc_string("a_string_that_is_intentionally_very_long".to_string());
    assert_eq!("PStr(\"\")", format!("{:?}", PStr::EMPTY.dupe()));
    assert_eq!("PStr(\"b\")", format!("{:?}", PStr::LOWER_B));
    assert_eq!("PStr(INVALID)", format!("{:?}", PStr::INVALID_PSTR.dupe()));
    assert_eq!("PStr(\"a_string_that_is_intentionally_very_long\")", format!("{long:?}"));
    assert_eq!(PStr::INVALID_PSTR, PStr::INVALID_PSTR);

    let mut set = HashSet::new();
    set.insert(long.dupe());
    set.insert(PStr::LOWER_A);
    set.insert(PStr::INVALID_PSTR);
    assert!(set.contains(&long));
  }

  #[test]
  fn heap_tests() {
    let mut heap = Heap::default();
    assert_eq!(1, heap.alloc_dummy_module_reference().0);
    let a1 = heap.alloc_str_for_test("aaaaaaaaaaaaaaaaaaaaaaaaaaa");
    let b = PStr::LOWER_B;
    let a2 = Heap::alloc_string("aaaaaaaaaaaaaaaaaaaaaaaaaaa".to_string());
    Heap::alloc_string("aa".to_string());
    let temp_only = Heap::alloc_string("a_long_string_only_known_to_alloc_string".to_string());
    assert_eq!(PStr::LOWER_C, heap.alloc_str_for_test("c"));
    assert!(a1.dupe().eq(&a2.dupe()));
    assert!(a1.ne(&b));
    assert!(a2.ne(&b));
    assert_eq!(Ordering::Equal, a1.cmp(&a2));
    assert_eq!(Some(Ordering::Equal), a1.partial_cmp(&a2));
    assert_eq!("aaaaaaaaaaaaaaaaaaaaaaaaaaa", a1.as_str(&heap));
    assert_eq!("a_long_string_only_known_to_alloc_string", temp_only.as_str(&heap));
    a2.as_str(&heap);
    b.dupe().as_str(&heap);

    let ma1 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let mb = heap.alloc_module_reference_from_string_vec(vec!["b".to_string(), "d-c".to_string()]);
    let ma2 = heap.alloc_module_reference_from_string_vec(vec!["a".to_string()]);
    let std_a =
      heap.alloc_module_reference_from_string_vec(vec!["std".to_string(), "a".to_string()]);
    let m_long = heap.alloc_module_reference_from_string_vec(vec![
      "a_module_part_that_is_intentionally_very_long".to_string(),
    ]);
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
    assert_eq!("a_module_part_that_is_intentionally_very_long", m_long.pretty_print(&heap));
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
  fn temp_str_name_test() {
    let heap = &mut Heap::new();
    // String allocations do not affect temp string names.
    Heap::alloc_string("a_string_that_is_intentionally_very_long".to_string());
    heap.alloc_str_for_test("another_intentionally_very_long_string");
    assert_eq!("_t0", heap.alloc_temp_str().as_str(heap));
    assert_eq!("_t1", heap.alloc_temp_str().as_str(heap));
  }

  #[test]
  fn pstr_comparison() {
    let heap = &mut Heap::new();
    let s1 = PStr::LOWER_A;
    let s2 = heap.alloc_str_for_test("dfsdadasdasdasdasdasdasdasd");
    let s3 = heap.alloc_str_for_test("dfsdadasdasdasdasdasdasdase");
    let a_with_nul = Heap::alloc_string("a\u{0}".to_string());

    assert!(s1 <= s1);
    assert!(s1 < PStr::LOWER_B);
    // Storage bytes tie; the size is the tiebreak.
    assert_eq!(Ordering::Less, s1.cmp(&a_with_nul));
    assert!(s1 <= s2);
    assert!(s2 >= s2);
    assert!(s2 >= s1);
    assert!(s2 < s3);
    assert!(s2 != s3);
    assert_eq!(Ordering::Equal, PStr::INVALID_PSTR.cmp(&PStr::INVALID_PSTR));
    assert_eq!(Ordering::Greater, PStr::INVALID_PSTR.cmp(&s1));
    assert_eq!(Ordering::Less, s2.cmp(&PStr::INVALID_PSTR));
    assert_eq!(Some(Ordering::Less), s1.partial_cmp(&s2));
  }

  #[test]
  fn pstr_const_ctor_fns() {
    let heap = &Heap::new();
    assert_eq!("", PStr::EMPTY.as_str(heap));
    assert_eq!("a", PStr::one_letter_literal('a').as_str(heap));
    assert_eq!("aa", PStr::two_letter_literal(b"aa").as_str(heap));
    assert_eq!("aaa", PStr::three_letter_literal(b"aaa").as_str(heap));
    assert_eq!("aaaa", PStr::four_letter_literal(b"aaaa").as_str(heap));
    assert_eq!("aaaaa", PStr::five_letter_literal(b"aaaaa").as_str(heap));
    assert_eq!("aaaaaa", PStr::six_letter_literal(b"aaaaaa").as_str(heap));
    assert_eq!("aaaaaaa", PStr::seven_letter_literal(b"aaaaaaa").as_str(heap));
    assert_eq!("aaaaaaaa", PStr::eight_letter_literal(b"aaaaaaaa").as_str(heap));
    assert_eq!("aaaaaaaaa", PStr::nine_letter_literal(b"aaaaaaaaa").as_str(heap));
    assert_eq!("aaaaaaaaaaaa", PStr::twelve_letter_literal(b"aaaaaaaaaaaa").as_str(heap));
  }

  #[test]
  fn heap_alloc_regular_before_permanent_string() {
    let heap = &mut Heap::new();
    let s1 = Heap::alloc_string(
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
    let s3 = Heap::alloc_string(
      "dfsdadasdasdasdasdasdasdasdqwerwerqwerwerqwerqwereqwrqwereqwrqwerqwerqwerqwerqwerqwerqwerew"
        .to_string(),
    );
    assert_eq!(s1, s2);
    assert_eq!(s1, s3);
  }

  #[test]
  fn alloc_same_string_twice_still_equal_test() {
    let p1 = Heap::alloc_string("a_string_that_is_intentionally_very_long_string1".to_string());
    let p2 = Heap::alloc_string("a_string_that_is_intentionally_very_long_string1".to_string());
    assert_eq!(p1, p2);
  }

  #[should_panic]
  #[test]
  fn heap_str_crash() {
    let heap = Heap::new();
    PStr::INVALID_PSTR.as_str(&heap);
  }

  #[should_panic]
  #[test]
  fn heap_mod_ref_crash() {
    let heap = Heap::new();
    ModuleReference(100).pretty_print(&heap);
  }

  #[test]
  fn temp_pstr_counter_sync_test() {
    let mut heap = Heap::new();
    let counter = heap.create_temp_counter();
    counter.alloc_temp_str();
    counter.alloc_temp_str();
    counter.alloc_temp_str();
    // Counter allocates independently, not through heap
    assert_eq!(3, counter.current());
    // Sync moves the heap counter forward to match.
    heap.sync_temp_counter(&counter);
    assert_eq!("_t3", heap.alloc_temp_str().as_str(&heap));
    // Syncing with a stale counter does not move the counter backwards.
    let stale_counter = TempPStrCounter::new(0);
    heap.sync_temp_counter(&stale_counter);
    assert_eq!("_t4", heap.alloc_temp_str().as_str(&heap));
    // After sync, new counter starts at the synced position
    let counter2 = heap.create_temp_counter();
    assert_eq!(5, counter2.current());
  }
}
