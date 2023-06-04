use crate::common::{Heap, ModuleReference, PStr};

pub(crate) fn encode_function_name_globally(
  heap: &Heap,
  module_reference: &ModuleReference,
  class_name: &str,
  function_name: &str,
) -> String {
  format!("_{}_{}${}", module_reference.encoded(heap), class_name, function_name)
}
pub(crate) fn encode_samlang_type(
  heap: &Heap,
  module_reference: &ModuleReference,
  identifier: PStr,
) -> String {
  format!("{}_{}", module_reference.encoded(heap), identifier.as_str(heap))
}
pub(crate) fn encode_samlang_variant_subtype(
  heap: &Heap,
  module_reference: &ModuleReference,
  identifier: PStr,
  variant: PStr,
) -> String {
  format!("{}_{}_{}", module_reference.encoded(heap), identifier.as_str(heap), variant.as_str(heap))
}
pub(crate) fn encode_generic_function_name_globally(
  class_name: &str,
  function_name: &str,
) -> String {
  format!("$GENERICS$_{class_name}${function_name}")
}

fn encode_builtin_function_name_globally(class_name: &str, function_name: &str) -> String {
  format!("__{class_name}${function_name}")
}
pub(crate) fn encode_main_function_name(heap: &Heap, module_reference: &ModuleReference) -> String {
  encode_function_name_globally(heap, module_reference, "Main", "main")
}

pub(crate) const ENCODED_FN_NAME_MALLOC: &str = "_builtin_malloc";
pub(crate) const ENCODED_FN_NAME_FREE: &str = "_builtin_free";
pub(crate) const ENCODED_FN_NAME_INC_REF: &str = "_builtin_inc_ref";
pub(crate) const ENCODED_FN_NAME_DEC_REF: &str = "_builtin_dec_ref";

pub(crate) fn encoded_fn_name_string_concat() -> String {
  encode_builtin_function_name_globally("Builtins", "stringConcat")
}
pub(crate) fn encoded_fn_name_panic() -> String {
  encode_builtin_function_name_globally("Builtins", "panic")
}
pub(crate) fn encoded_fn_name_string_to_int() -> String {
  encode_builtin_function_name_globally("Builtins", "stringToInt")
}
pub(crate) fn encoded_fn_name_int_to_string() -> String {
  encode_builtin_function_name_globally("Builtins", "intToString")
}
pub(crate) fn encoded_fn_name_println() -> String {
  encode_builtin_function_name_globally("Builtins", "println")
}

pub(crate) const ENCODED_COMPILED_PROGRAM_MAIN: &str = "_compiled_program_main";

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;

  #[test]
  fn snapshot_tests() {
    let heap = &mut Heap::new();
    assert_eq!("$GENERICS$_T$bar", encode_generic_function_name_globally("T", "bar"));

    let t = heap.alloc_str_for_test("T");
    assert_eq!("DUMMY_T", encode_samlang_type(heap, &ModuleReference::dummy(), t));
    assert_eq!("DUMMY_T_T", encode_samlang_variant_subtype(heap, &ModuleReference::dummy(), t, t));

    assert_eq!("_DUMMY_Main$main", encode_main_function_name(heap, &ModuleReference::dummy()));
    let mod_ref = heap.alloc_module_reference_from_string_vec(vec!["Demo".to_string()]);
    assert_eq!("_Demo_Main$main", encode_main_function_name(heap, &mod_ref));
    let mod_ref =
      heap.alloc_module_reference_from_string_vec(vec!["Foo".to_string(), "Bar".to_string()]);
    assert_eq!("_Foo$Bar_Main$main", encode_main_function_name(heap, &mod_ref));
    let mod_ref = heap
      .alloc_module_reference_from_string_vec(vec!["Foo-Bar-Derp".to_string(), "Baz".to_string()]);
    assert_eq!("_Foo_Bar_Derp$Baz_Main$main", encode_main_function_name(heap, &mod_ref));

    assert_eq!("__Builtins$stringConcat", encoded_fn_name_string_concat());
    assert_eq!("__Builtins$panic", encoded_fn_name_panic());
    assert_eq!("__Builtins$intToString", encoded_fn_name_int_to_string());
    assert_eq!("__Builtins$stringToInt", encoded_fn_name_string_to_int());
    assert_eq!("__Builtins$println", encoded_fn_name_println());
  }
}
