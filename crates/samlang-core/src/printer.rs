use crate::{ast::source, common::Heap};

mod prettier;
mod source_printer;

pub(crate) fn pretty_print_source_module(
  heap: &Heap,
  available_width: usize,
  module: &source::Module,
) -> String {
  prettier::pretty_print(available_width, source_printer::source_module_to_document(heap, module))
}
