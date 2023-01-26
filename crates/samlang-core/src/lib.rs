#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

pub use common::{measure_time, Heap, ModuleReference};
use itertools::Itertools;
use std::collections::BTreeMap;

pub mod ast;
mod checker;
mod common;
mod compiler;
mod errors;
mod integration_tests;
mod interpreter;
mod optimization;
mod parser;
mod printer;
pub mod services;

pub fn reformat_source(source: &str) -> String {
  let mut heap = Heap::new();
  let mut error_set = errors::ErrorSet::new();
  let module = parser::parse_source_module_from_text(
    source,
    ModuleReference::dummy(),
    &mut heap,
    &mut error_set,
  );
  if error_set.has_errors() {
    source.to_string()
  } else {
    printer::pretty_print_source_module(&heap, 100, &module)
  }
}

pub struct SourcesCompilationResult {
  pub text_code_results: BTreeMap<String, String>,
  pub wasm_file: Vec<u8>,
}

const EMITTED_WASM_FILE: &str = "__all__.wasm";
const EMITTED_WAT_FILE: &str = "__all__.wat";

pub fn compile_sources(
  heap: &mut Heap,
  source_handles: Vec<(ModuleReference, String)>,
  entry_module_references: Vec<ModuleReference>,
  enable_profiling: bool,
) -> Result<SourcesCompilationResult, Vec<String>> {
  let checker::TypeCheckSourceHandlesResult {
    checked_sources,
    global_typing_context: _,
    compile_time_errors,
  } = measure_time(enable_profiling, "Type checking", || {
    checker::type_check_source_handles(heap, source_handles)
  });
  let mut errors =
    compile_time_errors.iter().sorted().map(|it| it.pretty_print(heap)).collect_vec();
  for module_reference in &entry_module_references {
    if !checked_sources.contains_key(module_reference) {
      errors.insert(
        0,
        format!("Invalid entry point: {} does not exist.", module_reference.pretty_print(heap)),
      );
    }
  }
  if !errors.is_empty() {
    return Err(errors);
  }

  let unoptimized_hir_sources = measure_time(enable_profiling, "Compile to HIR", || {
    compiler::compile_sources_to_hir(heap, &checked_sources)
  });
  let optimized_hir_sources = measure_time(enable_profiling, "Optimize HIR", || {
    optimization::optimize_sources(
      heap,
      unoptimized_hir_sources,
      &optimization::ALL_ENABLED_CONFIGURATION,
    )
  });
  let mid_ir_sources = measure_time(enable_profiling, "Compile to MIR", || {
    compiler::compile_hir_to_mir(heap, optimized_hir_sources)
  });
  let common_ts_code = mid_ir_sources.pretty_print(heap);
  let (wat_text, wasm_file) = measure_time(enable_profiling, "Compile to WASM", || {
    compiler::compile_mir_to_wasm(heap, &mid_ir_sources)
  });

  let mut text_code_results = BTreeMap::new();
  for module_reference in &entry_module_references {
    let main_fn_name = ast::common_names::encode_main_function_name(heap, module_reference);
    let ts_code = format!("{}\n{}();\n", common_ts_code, main_fn_name);
    let wasm_js_code = format!(
      r#"// @{}
const binary = require('fs').readFileSync(require('path').join(__dirname, '{}'));
require('@dev-sam/samlang-cli/loader')(binary).{}();
"#,
      "generated", EMITTED_WASM_FILE, main_fn_name
    );
    text_code_results.insert(format!("{}.ts", module_reference.pretty_print(heap)), ts_code);
    text_code_results
      .insert(format!("{}.wasm.js", module_reference.pretty_print(heap)), wasm_js_code);
  }
  text_code_results.insert(EMITTED_WAT_FILE.to_string(), wat_text);

  Ok(SourcesCompilationResult { text_code_results, wasm_file })
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;

  use crate::Heap;

  #[test]
  fn reformat_tests() {
    super::reformat_source("d");
    super::reformat_source("class Foo {}");
  }

  #[test]
  fn compile_tests() {
    let heap = &mut Heap::new();
    let mod_ref_a = heap.alloc_module_reference_from_string_vec(vec!["A".to_string()]);
    let mod_ref_demo = heap.alloc_module_reference_from_string_vec(vec!["Demo".to_string()]);

    assert_eq!(
      vec!["Invalid entry point: A does not exist.".to_string()],
      super::compile_sources(heap, vec![], vec![mod_ref_a], false,).err().unwrap()
    );

    assert_eq!(
      vec![
        "Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.".to_string(),
        "Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.".to_string()
      ],
      super::compile_sources(
        heap,
        vec![(mod_ref_demo, "class Main { function main(): string = 42 + \"\" }".to_string())],
        vec![mod_ref_demo],
        false,
      )
      .err()
      .unwrap()
    );

    assert!(super::compile_sources(
      heap,
      vec![(
        mod_ref_demo,
        "class Main { function main(): unit = Builtins.println(\"hello world\") }".to_string()
      )],
      vec![mod_ref_demo],
      false,
    )
    .is_ok());
  }
}
