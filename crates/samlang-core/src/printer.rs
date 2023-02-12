mod prettier;
mod source_printer;

pub(crate) fn pretty_print_source_module(
  heap: &crate::common::Heap,
  available_width: usize,
  module: &crate::ast::source::Module<()>,
) -> String {
  prettier::pretty_print(available_width, source_printer::source_module_to_document(heap, module))
}
