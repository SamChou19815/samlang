use crate::{ast::source::Module, errors::ErrorSet};
use samlang_heap::ModuleReference;
use std::collections::HashMap;

mod checker_tests;
/// Responsible for building and querying the global signature environment.
mod global_signature;
/// The main checker that connects everything together.
mod main_checker;
/// Computing the SSA graph.
mod ssa_analysis;
mod ssa_analysis_tests;
/// Definition of internal type language.
pub(crate) mod type_;
/// All the core type checker rules in one place.
mod type_system;
/// All the typing context in one place.
mod typing_context;
mod typing_context_tests;

pub(crate) use global_signature::build_module_signature;
pub(crate) use main_checker::type_check_module;
pub(crate) use ssa_analysis::{perform_ssa_analysis_on_module, SsaAnalysisResult};

pub(crate) fn type_check_sources(
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
