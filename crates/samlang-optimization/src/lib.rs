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
  counter: &samlang_heap::TempPStrCounter,
  configuration: &OptimizationConfiguration,
) {
  conditional_constant_propagation::optimize_function(function);
  if configuration.does_perform_loop_optimization {
    loop_optimizations::optimize_function(function, counter);
  }
  if configuration.does_perform_common_sub_expression_elimination {
    common_subexpression_elimination::optimize_function(function, counter);
  }
  if configuration.does_perform_local_value_numbering {
    local_value_numbering::optimize_function(function);
  }
  dead_code_elimination::optimize_function(function);
}

fn optimize_function_for_rounds(
  function: &mut samlang_ast::mir::Function,
  counter: &samlang_heap::TempPStrCounter,
  configuration: &OptimizationConfiguration,
) {
  for _ in 0..2 {
    optimize_function_for_one_round(function, counter, configuration);
  }
  conditional_constant_propagation::optimize_function(function);
  dead_code_elimination::optimize_function(function);
  conditional_constant_propagation::optimize_function(function);
}

fn optimize_functions_for_rounds(
  functions: &mut [samlang_ast::mir::Function],
  counter: &samlang_heap::TempPStrCounter,
  configuration: &OptimizationConfiguration,
) {
  use rayon::prelude::*;
  functions.par_iter_mut().for_each(|f| {
    optimize_function_for_rounds(f, counter, configuration);
  });
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
    let counter = heap.create_temp_counter();
    optimize_functions_for_rounds(&mut functions, &counter, configuration);
    heap.sync_temp_counter(&counter);
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
  let counter = heap.create_temp_counter();
  optimize_functions_for_rounds(&mut sources.functions, &counter, configuration);
  heap.sync_temp_counter(&counter);
  sources
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{Function, FunctionName, INT_32_TYPE, Sources, SymbolTable, Type, ZERO};
  use samlang_heap::{Heap, PStr};

  fn sources() -> Sources {
    Sources {
      symbol_table: SymbolTable::new(),
      global_variables: Vec::new(),
      closure_types: Vec::new(),
      type_definitions: Vec::new(),
      main_function_names: vec![FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: Vec::new(),
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
