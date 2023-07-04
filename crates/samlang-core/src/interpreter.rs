use std::rc::Rc;

use crate::{ast, checker, common};

mod lir_interpreter;
mod source_interpreter;

pub(super) fn run_source_module(
  heap: &mut common::Heap,
  module: &ast::source::Module<Rc<checker::type_::Type>>,
) -> String {
  source_interpreter::run(heap, module)
}

pub(super) fn run_lir_sources(
  heap: &mut common::Heap,
  sources: &ast::lir::Sources,
  main_function: ast::mir::FunctionName,
) -> String {
  lir_interpreter::run(heap, sources, main_function)
}
