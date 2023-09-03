mod prettier;
mod source_printer;

pub(crate) fn pretty_print_annotation(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &crate::ast::source::CommentStore,
  annotation: &crate::ast::source::annotation::T,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::annotation_to_doc(heap, comment_store, annotation),
  )
}

pub(crate) fn pretty_print_expression(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &crate::ast::source::CommentStore,
  expression: &crate::ast::source::expr::E<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::expression_to_document(heap, comment_store, expression),
  )
}

pub(crate) fn pretty_print_statement(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &crate::ast::source::CommentStore,
  statement: &crate::ast::source::expr::DeclarationStatement<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::statement_to_document(heap, comment_store, statement),
  )
}

pub(crate) fn pretty_print_import(
  heap: &samlang_heap::Heap,
  available_width: usize,
  import: &crate::ast::source::ModuleMembersImport,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::import_to_document(heap, import.imported_module, &import.imported_members),
  )
}

pub(crate) fn pretty_print_toplevel(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &crate::ast::source::CommentStore,
  toplevel: &crate::ast::source::Toplevel<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::toplevel_to_document(heap, comment_store, toplevel),
  )
}

pub(crate) fn pretty_print_source_module(
  heap: &samlang_heap::Heap,
  available_width: usize,
  module: &crate::ast::source::Module<()>,
) -> String {
  prettier::pretty_print(available_width, source_printer::source_module_to_document(heap, module))
}
