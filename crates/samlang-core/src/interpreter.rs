use crate::{ast, common};

mod lir_interpreter;

pub(super) fn run_lir_sources(
  heap: &mut common::Heap,
  sources: &ast::lir::Sources,
  main_function: ast::mir::FunctionName,
) -> String {
  lir_interpreter::run(heap, sources, main_function)
}
