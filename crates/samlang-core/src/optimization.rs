use self::optimization_common::ResourceAllocator;
use crate::ast::hir::{Function, Sources};

mod common_subexpression_elimination;
mod conditional_constant_propagation;
mod conditional_constant_propagation_tests;
mod dead_code_elimination;
mod dead_code_elimination_tests;
mod inlining;
mod inlining_tests;
mod local_value_numbering;
mod local_value_numbering_tests;
mod loop_algebraic_optimization;
mod loop_induction_analysis;
mod loop_induction_variable_elimination;
mod loop_invariant_code_motion;
mod loop_optimizations;
mod loop_strength_reduction;
mod optimization_common;
mod unused_name_elimination;

pub(super) struct OptimizationConfiguration {
  pub(super) does_perform_local_value_numbering: bool,
  pub(super) does_perform_common_sub_expression_elimination: bool,
  pub(super) does_perform_loop_optimization: bool,
  pub(super) does_perform_inlining: bool,
}

pub(super) const ALL_ENABLED_CONFIGURATION: OptimizationConfiguration = OptimizationConfiguration {
  does_perform_local_value_numbering: true,
  does_perform_common_sub_expression_elimination: true,
  does_perform_loop_optimization: true,
  does_perform_inlining: false,
};

pub(super) const ALL_DISABLED_CONFIGURATION: OptimizationConfiguration =
  OptimizationConfiguration {
    does_perform_local_value_numbering: false,
    does_perform_common_sub_expression_elimination: false,
    does_perform_loop_optimization: false,
    does_perform_inlining: true,
  };

fn optimize_function_for_one_round(
  function: Function,
  allocator: &mut ResourceAllocator,
  configuration: &OptimizationConfiguration,
) -> Function {
  let mut optimized_fn = conditional_constant_propagation::optimize_function(function);
  if configuration.does_perform_loop_optimization {
    optimized_fn = loop_optimizations::optimize_function(optimized_fn, allocator);
  }
  if configuration.does_perform_local_value_numbering {
    optimized_fn = local_value_numbering::optimize_function(optimized_fn);
  }
  if configuration.does_perform_common_sub_expression_elimination {
    optimized_fn = common_subexpression_elimination::optimize_function(optimized_fn, allocator);
  }
  dead_code_elimination::optimize_function(optimized_fn)
}

fn optimize_function_for_rounds(
  function: Function,
  allocator: &mut ResourceAllocator,
  configuration: &OptimizationConfiguration,
) -> Function {
  let mut optimized_fn = function;
  for _ in 0..5 {
    optimized_fn = optimize_function_for_one_round(optimized_fn, allocator, configuration);
  }
  conditional_constant_propagation::optimize_function(dead_code_elimination::optimize_function(
    conditional_constant_propagation::optimize_function(optimized_fn),
  ))
}

fn optimize_functions_for_rounds(
  functions: Vec<Function>,
  allocator: &mut ResourceAllocator,
  configuration: &OptimizationConfiguration,
) -> Vec<Function> {
  functions.into_iter().map(|f| optimize_function_for_rounds(f, allocator, configuration)).collect()
}

pub(super) fn optimize_sources(
  sources: Sources,
  configuration: &OptimizationConfiguration,
) -> Sources {
  let mut allocator = ResourceAllocator::new();

  let mut intermediate = sources;
  for _ in 0..4 {
    let Sources {
      global_variables,
      closure_types,
      type_definitions,
      main_function_names,
      functions,
    } = intermediate;
    let mut optimized_functions =
      optimize_functions_for_rounds(functions, &mut allocator, configuration);
    if configuration.does_perform_inlining {
      optimized_functions = inlining::optimize_functions(optimized_functions, &mut allocator);
    }
    intermediate = unused_name_elimination::optimize_sources(Sources {
      global_variables,
      closure_types,
      type_definitions,
      main_function_names,
      functions: optimized_functions,
    });
  }

  let Sources { global_variables, closure_types, type_definitions, main_function_names, functions } =
    intermediate;
  Sources {
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions: optimize_functions_for_rounds(functions, &mut allocator, configuration),
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{Function, Sources, Type, INT_TYPE, ZERO},
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  fn sources() -> Sources {
    Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![rcs("main")],
      functions: vec![Function {
        name: rcs("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    }
  }

  #[test]
  fn coverage_tests() {
    let common_expected = r#"function main(): int {
  return 0;
}

sources.mains = [main]"#;

    assert_eq!(
      common_expected,
      super::optimize_sources(sources(), &super::ALL_ENABLED_CONFIGURATION).debug_print()
    );
    assert_eq!(
      common_expected,
      super::optimize_sources(sources(), &super::ALL_DISABLED_CONFIGURATION).debug_print()
    );
  }
}
