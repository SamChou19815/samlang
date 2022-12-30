#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

pub use common::measure_time;
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
  let mut error_set = errors::ErrorSet::new();
  let module =
    parser::parse_source_module_from_text(source, &ast::ModuleReference::dummy(), &mut error_set);
  if error_set.has_errors() {
    source.to_string()
  } else {
    printer::pretty_print_source_module(100, &module)
  }
}

pub struct SourcesCompilationResult {
  pub text_code_results: BTreeMap<String, String>,
  pub wasm_file: Vec<u8>,
}

const EMITTED_WASM_FILE: &str = "__all__.wasm";
const EMITTED_WAT_FILE: &str = "__all__.wat";

pub fn compile_sources(
  source_handles: Vec<(ast::ModuleReference, String)>,
  entry_module_references: Vec<ast::ModuleReference>,
  enable_profiling: bool,
) -> Result<SourcesCompilationResult, Vec<String>> {
  let checker::TypeCheckSourceHandlesResult {
    checked_sources,
    global_typing_context: _,
    compile_time_errors,
  } = measure_time(enable_profiling, "Type checking", || {
    checker::type_check_source_handles(source_handles)
  });
  let mut errors = compile_time_errors.iter().map(|it| it.to_string()).sorted().collect_vec();
  for module_reference in &entry_module_references {
    if !checked_sources.contains_key(module_reference) {
      errors.insert(
        0,
        format!("Invalid entry point: {} does not exist.", module_reference.to_string()),
      );
    }
  }
  if !errors.is_empty() {
    return Err(errors);
  }

  let unoptimized_hir_sources = measure_time(enable_profiling, "Compile to HIR", || {
    compiler::compile_sources_to_hir(&checked_sources)
  });
  let optimized_hir_sources = measure_time(enable_profiling, "Optimize HIR", || {
    optimization::optimize_sources(
      unoptimized_hir_sources,
      &optimization::ALL_ENABLED_CONFIGURATION,
    )
  });
  let mid_ir_sources = measure_time(enable_profiling, "Compile to MIR", || {
    compiler::compile_hir_to_mir(optimized_hir_sources)
  });
  let common_ts_code = mid_ir_sources.pretty_print();
  let (wat_text, wasm_file) = measure_time(enable_profiling, "Compile to WASM", || {
    compiler::compile_mir_to_wasm(&mid_ir_sources)
  });

  let mut text_code_results = BTreeMap::new();
  for module_reference in &entry_module_references {
    let main_fn_name = ast::common_names::encode_main_function_name(module_reference);
    let ts_code = format!("{}\n{}();\n", common_ts_code, main_fn_name);
    let wasm_js_code = format!(
      r#"// @{}
const binary = require('fs').readFileSync(require('path').join(__dirname, '{}'));
require('@dev-sam/samlang-cli/loader')(binary).{}();
"#,
      "generated", EMITTED_WASM_FILE, main_fn_name
    );
    text_code_results.insert(format!("{}.ts", module_reference.to_string()), ts_code);
    text_code_results.insert(format!("{}.wasm.js", module_reference.to_string()), wasm_js_code);
  }
  text_code_results.insert(EMITTED_WAT_FILE.to_string(), wat_text);

  Ok(SourcesCompilationResult { text_code_results, wasm_file })
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;

  #[test]
  fn reformat_tests() {
    super::reformat_source("d");
    super::reformat_source("class Foo {}");
  }

  #[test]
  fn compile_tests() {
    assert_eq!(
      vec!["Invalid entry point: A does not exist.".to_string()],
      super::compile_sources(
        vec![],
        vec![crate::ast::ModuleReference::from_string_parts(vec!["A".to_string()])],
        false,
      )
      .err()
      .unwrap()
    );

    assert_eq!(
      vec![
        "Demo.sam:1:40-1:47: [UnexpectedType]: Expected: `string`, actual: `int`.".to_string(),
        "Demo.sam:1:45-1:47: [UnexpectedType]: Expected: `int`, actual: `string`.".to_string()
      ],
      super::compile_sources(
        vec![(
          crate::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()]),
          "class Main { function main(): string = 42 + \"\" }".to_string()
        )],
        vec![crate::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()])],
        false,
      )
      .err()
      .unwrap()
    );

    assert!(super::compile_sources(
      vec![(
        crate::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()]),
        "class Main { function main(): unit = Builtins.println(\"hello world\") }".to_string()
      )],
      vec![crate::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()])],
      false,
    )
    .is_ok());
  }
}
