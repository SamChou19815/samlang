use crate::{ast, common::Str};

mod mir_interpreter;
mod source_interpreter;

pub(super) fn run_source_module(module: &ast::source::Module) -> String {
  source_interpreter::run(module)
}

pub(super) fn run_mir_sources(sources: &ast::mir::Sources, main_function: Str) -> String {
  mir_interpreter::run(sources, main_function)
}
