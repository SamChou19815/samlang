#![cfg_attr(test, allow(clippy::clone_on_copy))]

mod hir_lowering;
mod hir_string_manager;
mod hir_type_conversion;
mod lir_lowering;
mod lir_unused_name_elimination;
mod mir_constant_param_elimination;
mod mir_generics_specialization;
mod mir_tail_recursion_rewrite;
mod mir_type_deduplication;
mod wasm_lowering;

pub use hir_lowering::compile_sources_to_mir;
pub use lir_lowering::compile_mir_to_lir;

pub fn compile_lir_to_wasm(
  heap: &mut samlang_heap::Heap,
  sources: &samlang_ast::lir::Sources,
) -> (String, Vec<u8>) {
  let whole_module_string = format!(
    "(module\n{}\n{}\n)\n",
    include_str!("libsam.wat"),
    wasm_lowering::compile_mir_to_wasm(heap, sources).pretty_print(heap, &sources.symbol_table)
  );
  let wat = wat::parse_str(&whole_module_string).unwrap();
  (whole_module_string, wat)
}

#[cfg(test)]
mod test {
  use pretty_assertions::assert_eq;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference};
  use std::collections::HashMap;

  #[test]
  fn integration_test() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut sources = HashMap::from([(
      ModuleReference::DUMMY,
      samlang_parser::parse_source_module_from_text(
        r#"
interface Foo {
  method foo(): unit
}
class Generic<T: Foo>(val a: T) {
  method callFoo(): unit = this.a.foo()
}
class HelloWorld {
  function main(): unit = Process.println("HW!")
}
"#,
        ModuleReference::DUMMY,
        &mut heap,
        &mut error_set,
      ),
    )]);
    for (mod_ref, parsed) in samlang_parser::builtin_parsed_std_sources_for_tests(&mut heap) {
      sources.insert(mod_ref, parsed);
    }
    let (checked_sources, _) = samlang_checker::type_check_sources(&sources, &mut error_set);
    assert_eq!("", error_set.pretty_print_error_messages_no_frame_for_test(&heap));
    let mir_sources = super::compile_sources_to_mir(&mut heap, &checked_sources);
    let lir_sources = super::compile_mir_to_lir(&mut heap, mir_sources);
    super::compile_lir_to_wasm(&mut heap, &lir_sources);
  }
}
