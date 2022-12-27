use self::{
  global_typing_context_builder::build_global_typing_context, main_checker::type_check_module,
  typing_context::create_builtin_module_typing_context,
  undefined_imports_checker::check_undefined_imports_error,
};
use crate::{
  ast::{source::Module, ModuleReference},
  common::rcs,
  errors::{CompileTimeError, ErrorSet},
  parser::parse_source_module_from_text,
};
use std::collections::HashMap;

mod checker_tests;
/** Utilities operating on types */
mod checker_utils;
mod checker_utils_tests;
/** Responsible for building the global typing environment as part of pre-processing phase. */
mod global_typing_context_builder;
/** The main checker that connects everything together. */
mod main_checker;
/** Computing the SSA graph. */
mod ssa_analysis;
mod ssa_analysis_tests;
/** All the typing context in one place. */
mod typing_context;
mod typing_context_tests;
/** Responsible for checking undefined imports. */
mod undefined_imports_checker;

pub(crate) use ssa_analysis::{perform_ssa_analysis_on_module, SsaAnalysisResult};
pub(crate) use typing_context::GlobalTypingContext;

pub(crate) fn type_check_sources(
  sources: HashMap<ModuleReference, Module>,
  error_set: &mut ErrorSet,
) -> (HashMap<ModuleReference, Module>, GlobalTypingContext) {
  let global_cx =
    build_global_typing_context(&sources, error_set, create_builtin_module_typing_context());
  let mut checked_sources = HashMap::new();
  for (_, module) in sources.iter() {
    check_undefined_imports_error(&sources, error_set, module);
  }
  for (module_reference, module) in sources {
    let checked = type_check_module(&module_reference, module, &global_cx, error_set);
    checked_sources.insert(module_reference, checked);
  }
  (checked_sources, global_cx)
}

pub(crate) struct TypeCheckSourceHandlesResult {
  pub(crate) checked_sources: HashMap<ModuleReference, Module>,
  pub(crate) global_typing_context: GlobalTypingContext,
  pub(crate) compile_time_errors: Vec<CompileTimeError>,
}

pub(crate) fn type_check_source_handles(
  source_handles: Vec<(ModuleReference, &str)>,
) -> TypeCheckSourceHandlesResult {
  let mut error_set = ErrorSet::new();
  let mut parsed_sources = HashMap::new();
  for (module_reference, source) in source_handles {
    let parsed = parse_source_module_from_text(source, &module_reference, &mut error_set);
    parsed_sources.insert(module_reference, parsed);
  }
  let (checked_sources, global_typing_context) = type_check_sources(parsed_sources, &mut error_set);
  let mut compile_time_errors = vec![];
  for e in error_set.errors() {
    compile_time_errors.push(e.clone());
  }
  TypeCheckSourceHandlesResult { checked_sources, global_typing_context, compile_time_errors }
}

pub(crate) fn type_check_single_module_source(module: Module, error_set: &mut ErrorSet) -> Module {
  let module_reference = ModuleReference::ordinary(vec![rcs("Test")]);
  type_check_sources(HashMap::from([(module_reference.clone(), module)]), error_set)
    .0
    .remove(&module_reference)
    .unwrap()
}
