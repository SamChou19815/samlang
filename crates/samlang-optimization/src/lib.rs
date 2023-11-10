#![cfg_attr(test, allow(clippy::clone_on_copy))]

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

pub struct OptimizationConfiguration {
  pub does_perform_local_value_numbering: bool,
  pub does_perform_common_sub_expression_elimination: bool,
  pub does_perform_loop_optimization: bool,
  pub does_perform_inlining: bool,
}

pub const ALL_ENABLED_CONFIGURATION: OptimizationConfiguration = OptimizationConfiguration {
  does_perform_local_value_numbering: true,
  does_perform_common_sub_expression_elimination: true,
  does_perform_loop_optimization: true,
  does_perform_inlining: true,
};

pub const ALL_DISABLED_CONFIGURATION: OptimizationConfiguration = OptimizationConfiguration {
  does_perform_local_value_numbering: false,
  does_perform_common_sub_expression_elimination: false,
  does_perform_loop_optimization: false,
  does_perform_inlining: false,
};

fn optimize_function_for_one_round(
  function: &mut samlang_ast::mir::Function,
  heap: &mut samlang_heap::Heap,
  configuration: &OptimizationConfiguration,
) {
  conditional_constant_propagation::optimize_function(function, heap);
  if configuration.does_perform_loop_optimization {
    loop_optimizations::optimize_function(function, heap);
  }
  if configuration.does_perform_common_sub_expression_elimination {
    common_subexpression_elimination::optimize_function(function, heap);
  }
  if configuration.does_perform_local_value_numbering {
    local_value_numbering::optimize_function(function);
  }
  dead_code_elimination::optimize_function(function);
}

fn optimize_function_for_rounds(
  function: &mut samlang_ast::mir::Function,
  heap: &mut samlang_heap::Heap,
  configuration: &OptimizationConfiguration,
) {
  for _ in 0..2 {
    optimize_function_for_one_round(function, heap, configuration);
  }
  conditional_constant_propagation::optimize_function(function, heap);
  dead_code_elimination::optimize_function(function);
  conditional_constant_propagation::optimize_function(function, heap);
}

fn optimize_functions_for_rounds(
  functions: &mut [samlang_ast::mir::Function],
  heap: &mut samlang_heap::Heap,
  configuration: &OptimizationConfiguration,
) {
  for f in functions {
    optimize_function_for_rounds(f, heap, configuration);
  }
}

pub fn optimize_sources(
  heap: &mut samlang_heap::Heap,
  mut sources: samlang_ast::mir::Sources,
  configuration: &OptimizationConfiguration,
) -> samlang_ast::mir::Sources {
  for _ in 0..4 {
    let samlang_ast::mir::Sources {
      symbol_table,
      global_variables,
      closure_types,
      type_definitions,
      main_function_names,
      mut functions,
    } = sources;
    optimize_functions_for_rounds(&mut functions, heap, configuration);
    if configuration.does_perform_inlining {
      functions = inlining::optimize_functions(functions, heap);
    }
    sources = samlang_ast::mir::Sources {
      symbol_table,
      global_variables,
      closure_types,
      type_definitions,
      main_function_names,
      functions,
    };
    unused_name_elimination::optimize_sources(&mut sources);
  }
  optimize_functions_for_rounds(&mut sources.functions, heap, configuration);
  sources
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{Function, FunctionName, Sources, SymbolTable, Type, INT_TYPE, ZERO};
  use samlang_heap::{Heap, PStr};

  fn sources() -> Sources {
    Sources {
      symbol_table: SymbolTable::new(),
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    }
  }

  #[test]
  fn coverage_tests() {
    let heap = &mut Heap::new();
    let common_expected = r#"function __$main(): int {
  return 0;
}

sources.mains = [__$main]"#;

    let s = sources();
    assert_eq!(
      common_expected,
      super::optimize_sources(heap, s, &super::ALL_ENABLED_CONFIGURATION).debug_print(heap)
    );
    let s = sources();
    assert_eq!(
      common_expected,
      super::optimize_sources(heap, s, &super::ALL_DISABLED_CONFIGURATION).debug_print(heap)
    );
  }
}
