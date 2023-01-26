use crate::{ast, common};

mod mir_interpreter;
mod source_interpreter;

pub(super) fn run_source_module(heap: &mut common::Heap, module: &ast::source::Module) -> String {
  source_interpreter::run(heap, module)
}

pub(super) fn run_mir_sources(
  heap: &mut common::Heap,
  sources: &ast::mir::Sources,
  main_function: common::PStr,
) -> String {
  mir_interpreter::run(heap, sources, main_function)
}
