#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]

use samlang_ast::source::Module;
use samlang_errors::ErrorSet;
use samlang_heap::ModuleReference;
use std::collections::HashMap;

mod checker_integration_tests;
mod checker_tests;
/// Responsible for building and querying the global signature environment.
mod global_signature;
/// The main checker that connects everything together.
mod main_checker;
/// The module that verify the usefulness and exhausiveness of patterns.
mod pattern_matching;
/// Computing the SSA graph.
mod ssa_analysis;
mod ssa_analysis_tests;
/// Definition of internal type language.
pub mod type_;
/// All the core type checker rules in one place.
mod type_system;
/// All the typing context in one place.
mod typing_context;
mod typing_context_tests;

pub use global_signature::build_module_signature;
pub use main_checker::type_check_module;
pub use ssa_analysis::{perform_ssa_analysis_on_module, SsaAnalysisResult};

pub fn type_check_sources(
  sources: &HashMap<ModuleReference, Module<()>>,
  error_set: &mut ErrorSet,
) -> (HashMap<ModuleReference, Module<std::rc::Rc<type_::Type>>>, type_::GlobalSignature) {
  let builtin_cx = type_::create_builtin_module_signature();
  let global_cx = global_signature::build_global_signature(sources, builtin_cx);
  let mut checked_sources = HashMap::new();
  for (module_reference, module) in sources {
    let (checked, _) = type_check_module(*module_reference, module, &global_cx, error_set);
    checked_sources.insert(*module_reference, checked);
  }
  (checked_sources, global_cx)
}
