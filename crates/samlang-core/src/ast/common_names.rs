use super::loc::ModuleReference;

pub(crate) fn encode_function_name_globally(
  module_reference: &ModuleReference,
  class_name: &str,
  function_name: &str,
) -> String {
  format!("_{}_{}${}", module_reference.encoded(), class_name, function_name)
}
pub(crate) fn encode_samlang_type(module_reference: &ModuleReference, identifier: &str) -> String {
  format!("{}_{}", module_reference.encoded(), identifier)
}
pub(crate) fn encode_generic_function_name_globally(
  class_name: &str,
  function_name: &str,
) -> String {
  format!("$GENERICS$_{}${}", class_name, function_name)
}

pub(crate) fn encode_builtin_name(name: &str) -> String {
  format!("_builtin_{}", name)
}
pub(crate) fn encode_main_function_name(module_reference: &ModuleReference) -> String {
  encode_function_name_globally(module_reference, "Main", "main")
}

pub(crate) fn encoded_fn_name_malloc() -> String {
  encode_builtin_name("malloc")
}
pub(crate) fn encoded_fn_name_free() -> String {
  encode_builtin_name("free")
}
pub(crate) fn encoded_fn_name_string_concat() -> String {
  encode_function_name_globally(&ModuleReference::root(), "Builtins", "stringConcat")
}
pub(crate) fn encoded_fn_name_panic() -> String {
  encode_function_name_globally(&ModuleReference::root(), "Builtins", "panic")
}
pub(crate) fn encoded_fn_name_string_to_int() -> String {
  encode_function_name_globally(&ModuleReference::root(), "Builtins", "stringToInt")
}
pub(crate) fn encoded_fn_name_int_to_string() -> String {
  encode_function_name_globally(&ModuleReference::root(), "Builtins", "intToString")
}
pub(crate) fn encoded_fn_name_println() -> String {
  encode_function_name_globally(&ModuleReference::root(), "Builtins", "println")
}

pub(crate) const ENCODED_COMPILED_PROGRAM_MAIN: &str = "_compiled_program_main";

#[cfg(test)]
mod tests {
  use super::*;
  use crate::common::rcs;
  use pretty_assertions::assert_eq;

  #[test]
  fn snapshot_tests() {
    assert_eq!("$GENERICS$_T$bar", encode_generic_function_name_globally("T", "bar"));

    assert_eq!("__DUMMY___T", encode_samlang_type(&ModuleReference::dummy(), "T"));

    assert_eq!("___DUMMY___Main$main", encode_main_function_name(&ModuleReference::dummy()));
    assert_eq!(
      "_Demo_Main$main",
      encode_main_function_name(&ModuleReference::ordinary(vec![rcs("Demo")]))
    );
    assert_eq!(
      "_Foo$Bar_Main$main",
      encode_main_function_name(&ModuleReference::ordinary(vec![rcs("Foo"), rcs("Bar"),]))
    );
    assert_eq!(
      "_Foo_Bar_Derp$Baz_Main$main",
      encode_main_function_name(&ModuleReference::ordinary(vec![rcs("Foo-Bar-Derp"), rcs("Baz"),]))
    );

    assert_eq!("_builtin_malloc", encoded_fn_name_malloc());
    assert_eq!("_builtin_free", encoded_fn_name_free());
    assert_eq!("__Builtins$stringConcat", encoded_fn_name_string_concat());
    assert_eq!("__Builtins$panic", encoded_fn_name_panic());
    assert_eq!("__Builtins$intToString", encoded_fn_name_int_to_string());
    assert_eq!("__Builtins$stringToInt", encoded_fn_name_string_to_int());
    assert_eq!("__Builtins$println", encoded_fn_name_println());
  }
}
