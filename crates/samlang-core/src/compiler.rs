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

#[allow(unused_imports)]
pub(crate) use hir_lowering::compile_sources_to_mir;
#[allow(unused_imports)]
pub(crate) use lir_lowering::compile_mir_to_lir;

pub(crate) fn compile_lir_to_wasm(
  heap: &mut samlang_heap::Heap,
  sources: &crate::ast::lir::Sources,
) -> (String, Vec<u8>) {
  let whole_module_string = format!(
    "(module\n{}\n{}\n)\n",
    include_str!("libsam.wat"),
    wasm_lowering::compile_mir_to_wasm(heap, sources).pretty_print(heap, &sources.symbol_table)
  );
  let wat = wat::parse_str(&whole_module_string).unwrap();
  (whole_module_string, wat)
}
