use crate::ast::source;

mod prettier;
mod source_printer;

pub(crate) fn pretty_print_source_module(
  available_width: usize,
  module: &source::Module,
) -> String {
  prettier::pretty_print(available_width, source_printer::source_module_to_document(module))
}
