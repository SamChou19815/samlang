use std::rc::Rc;

use crate::{ast, checker, common};

mod mir_interpreter;
mod source_interpreter;

pub(super) fn run_source_module(
  heap: &mut common::Heap,
  module: &ast::source::Module<Rc<checker::type_::Type>>,
) -> String {
  source_interpreter::run(heap, module)
}

pub(super) fn run_mir_sources(
  heap: &mut common::Heap,
  sources: &ast::lir::Sources,
  main_function: common::PStr,
) -> String {
  mir_interpreter::run(heap, sources, main_function)
}
