#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(test, allow(clippy::redundant_clone, clippy::clone_on_copy))]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

pub use common::{measure_time, Heap, ModuleReference};
use std::collections::{BTreeMap, HashMap};

pub mod ast;
mod checker;
mod common;
mod compiler;
pub mod errors;
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
  source_handles: HashMap<ModuleReference, String>,
  entry_module_references: Vec<ModuleReference>,
  enable_profiling: bool,
) -> Result<SourcesCompilationResult, String> {
  let mut error_set = errors::ErrorSet::new();
  let mut parsed_sources = HashMap::new();
  crate::common::measure_time(enable_profiling, "Parsing", || {
    for (module_reference, source) in &source_handles {
      let parsed =
        parser::parse_source_module_from_text(source, *module_reference, heap, &mut error_set);
      parsed_sources.insert(*module_reference, parsed);
    }
  });
  for module_reference in &entry_module_references {
    if !parsed_sources.contains_key(module_reference) {
      return Err(format!(
        "Invalid entry point: {} does not exist.",
        module_reference.pretty_print(heap)
      ));
    }
  }
  let checked_sources = measure_time(enable_profiling, "Type checking", || {
    checker::type_check_sources(&parsed_sources, heap, &mut error_set).0
  });
  let errors = error_set.pretty_print_error_messages(heap, &source_handles);
  if error_set.has_errors() {
    return Err(errors);
  }

  let unoptimized_mir_sources = measure_time(enable_profiling, "Compile to MIR", || {
    compiler::compile_sources_to_mir(heap, &checked_sources)
  });
  let optimized_mir_sources = measure_time(enable_profiling, "Optimize MIR", || {
    optimization::optimize_sources(
      heap,
      unoptimized_mir_sources,
      &optimization::ALL_ENABLED_CONFIGURATION,
    )
  });
  let mut lir_sources = measure_time(enable_profiling, "Compile to LIR", || {
    compiler::compile_mir_to_lir(heap, optimized_mir_sources)
  });
  let common_ts_code = lir_sources.pretty_print(heap);
  let (wat_text, wasm_file) = measure_time(enable_profiling, "Compile to WASM", || {
    compiler::compile_lir_to_wasm(heap, &lir_sources)
  });

  let mut text_code_results = BTreeMap::new();
  for module_reference in &entry_module_references {
    let mut main_fn_name = String::new();
    ast::mir::FunctionName {
      type_name: lir_sources.symbol_table.create_main_type_name(*module_reference),
      fn_name: common::well_known_pstrs::MAIN_FN,
    }
    .write_encoded(&mut main_fn_name, heap, &lir_sources.symbol_table);
    let ts_code = format!("{common_ts_code}\n{main_fn_name}();\n");
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
  use std::collections::HashMap;

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
      "Invalid entry point: A does not exist.",
      super::compile_sources(heap, HashMap::new(), vec![mod_ref_a], false,).err().unwrap()
    );

    assert_eq!(
      r#"
Error ----------------------------------- Demo.sam:1:37-1:44

Expected: `Str`, actual: `int`.

  1| class Main { function main(): Str = 42 + "" }
                                         ^^^^^^^


Error ----------------------------------- Demo.sam:1:42-1:44

Expected: `int`, actual: `Str`.

  1| class Main { function main(): Str = 42 + "" }
                                              ^^


Found 2 errors.
"#
      .trim(),
      super::compile_sources(
        heap,
        HashMap::from([(
          mod_ref_demo,
          "class Main { function main(): Str = 42 + \"\" }".to_string()
        )]),
        vec![mod_ref_demo],
        false,
      )
      .err()
      .unwrap()
    );

    assert!(super::compile_sources(
      heap,
      HashMap::from([(
        mod_ref_demo,
        "class Main { function main(): unit = Process.println(\"hello world\") }".to_string()
      )]),
      vec![mod_ref_demo],
      false,
    )
    .is_ok());
  }
}
