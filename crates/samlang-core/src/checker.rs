use self::{
  global_signature::build_global_signature,
  main_checker::type_check_module,
  type_::{create_builtin_module_signature, Type},
  undefined_imports_checker::check_undefined_imports_error,
};
use crate::{
  ast::source::Module,
  common::{Heap, ModuleReference},
  errors::ErrorSet,
};
use std::{collections::HashMap, rc::Rc};

mod checker_tests;
/// Utilities operating on types
mod checker_utils;
mod checker_utils_tests;
/// Responsible for building and querying the global signature environment.
mod global_signature;
/// The main checker that connects everything together.
mod main_checker;
/// Computing the SSA graph.
mod ssa_analysis;
mod ssa_analysis_tests;
/// Definition of internal type language.
pub(crate) mod type_;
/// All the typing context in one place.
mod typing_context;
mod typing_context_tests;
/// Responsible for checking undefined imports.
mod undefined_imports_checker;

pub(crate) use ssa_analysis::{perform_ssa_analysis_on_module, SsaAnalysisResult};
pub(crate) use type_::{GlobalSignature, InterfaceSignature, MemberSignature};

pub(crate) fn type_check_sources(
  sources: HashMap<ModuleReference, Module<()>>,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
) -> (HashMap<ModuleReference, Module<Rc<Type>>>, GlobalSignature) {
  let builtin_cx = create_builtin_module_signature(heap);
  let global_cx = build_global_signature(&sources, heap, builtin_cx);
  let mut checked_sources = HashMap::new();
  for (_, module) in sources.iter() {
    check_undefined_imports_error(&sources, heap, error_set, module);
  }
  for (module_reference, module) in sources {
    let checked = type_check_module(module_reference, module, &global_cx, heap, error_set);
    checked_sources.insert(module_reference, checked);
  }
  (checked_sources, global_cx)
}
