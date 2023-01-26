mod hir_generics_specialization;
mod hir_lowering;
mod hir_string_manager;
mod hir_tail_recursion_rewrite;
mod hir_type_conversion;
mod hir_type_deduplication;
mod mir_lowering;
mod mir_unused_name_elimination;
mod wasm_lowering;

#[allow(unused_imports)]
pub(crate) use hir_lowering::compile_sources_to_hir;
#[allow(unused_imports)]
pub(crate) use mir_lowering::compile_hir_to_mir;

pub(crate) fn compile_mir_to_wasm(
  heap: &mut crate::common::Heap,
  sources: &crate::ast::mir::Sources,
) -> (String, Vec<u8>) {
  let whole_module_string = format!(
    "(module\n{}\n{}\n)\n",
    include_str!("libsam.wat"),
    wasm_lowering::compile_mir_to_wasm(heap, sources).pretty_print(heap)
  );
  let wat = wat::parse_str(&whole_module_string).unwrap();
  (whole_module_string, wat)
}
