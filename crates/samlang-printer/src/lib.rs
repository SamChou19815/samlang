mod prettier;
mod source_printer;

pub fn pretty_print_annotation(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &samlang_ast::source::CommentStore,
  annotation: &samlang_ast::source::annotation::T,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::annotation_to_doc(heap, comment_store, annotation),
  )
}

pub fn pretty_print_expression(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &samlang_ast::source::CommentStore,
  expression: &samlang_ast::source::expr::E<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::expression_to_document(heap, comment_store, expression),
  )
}

pub fn pretty_print_statement(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &samlang_ast::source::CommentStore,
  statement: &samlang_ast::source::expr::DeclarationStatement<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::statement_to_document(heap, comment_store, statement),
  )
}

pub fn pretty_print_import(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &samlang_ast::source::CommentStore,
  import: &samlang_ast::source::ModuleMembersImport,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::import_to_document(
      heap,
      comment_store,
      import.imported_module,
      &import.imported_members,
    ),
  )
}

pub fn pretty_print_toplevel(
  heap: &samlang_heap::Heap,
  available_width: usize,
  comment_store: &samlang_ast::source::CommentStore,
  toplevel: &samlang_ast::source::Toplevel<()>,
) -> String {
  prettier::pretty_print(
    available_width,
    source_printer::toplevel_to_document(heap, comment_store, toplevel),
  )
}

pub fn pretty_print_source_module(
  heap: &samlang_heap::Heap,
  available_width: usize,
  module: &samlang_ast::source::Module<()>,
) -> String {
  prettier::pretty_print(available_width, source_printer::source_module_to_document(heap, module))
}
