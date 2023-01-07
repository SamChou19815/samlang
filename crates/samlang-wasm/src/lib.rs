#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

use js_sys::Uint8Array;
use serde::Serialize;
use wasm_bindgen::prelude::*;

fn demo_mod_ref() -> samlang_core::ast::ModuleReference {
  samlang_core::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()])
}

#[wasm_bindgen]
pub struct SourcesCompilationResult {
  #[wasm_bindgen(getter_with_clone)]
  pub ts_code: String,
  #[wasm_bindgen(getter_with_clone)]
  pub wasm_bytes: Uint8Array,
}

#[wasm_bindgen]
pub fn compile(source: String) -> Result<SourcesCompilationResult, String> {
  match samlang_core::compile_sources(vec![(demo_mod_ref(), source)], vec![demo_mod_ref()], false) {
    Ok(samlang_core::SourcesCompilationResult { text_code_results, wasm_file }) => {
      let ts_code = text_code_results.get("Demo.ts").unwrap().clone();
      let wasm_bytes = Uint8Array::from(&wasm_file as &[u8]);
      Ok(SourcesCompilationResult { ts_code, wasm_bytes })
    }
    Err(errors) => Err(errors.iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n")),
  }
}

#[derive(Serialize)]
pub struct Range {
  #[serde(rename(serialize = "startLineNumber"))]
  pub start_line: i32,
  #[serde(rename(serialize = "startColumn"))]
  pub start_col: i32,
  #[serde(rename(serialize = "endLineNumber"))]
  pub end_line: i32,
  #[serde(rename(serialize = "endColumn"))]
  pub end_col: i32,
}

#[derive(Serialize)]
struct TypeQueryContent {
  language: String,
  value: String,
}

#[derive(Serialize)]
struct TypeQueryResult {
  contents: Vec<TypeQueryContent>,
  range: Range,
}

#[derive(Serialize)]
struct AutoCompletionItem {
  range: Range,
  label: String,
  #[serde(rename(serialize = "insertText"))]
  insert_text: String,
  #[serde(rename(serialize = "insertTextRules"))]
  insert_text_rules: i32,
  kind: i32,
  detail: String,
}

impl Range {
  fn from(loc: &samlang_core::ast::Location) -> Range {
    Range {
      start_line: loc.start.0 + 1,
      start_col: loc.start.1 + 1,
      end_line: loc.end.0 + 1,
      end_col: loc.end.1 + 1,
    }
  }
}

fn new_services(source: String) -> samlang_core::services::api::LanguageServices {
  samlang_core::services::api::LanguageServices::new(vec![(demo_mod_ref(), source)])
}

#[wasm_bindgen(js_name=queryType)]
pub fn query_type(source: String, line: i32, column: i32) -> JsValue {
  new_services(source)
    .query_for_hover(&demo_mod_ref(), samlang_core::ast::Position(line - 1, column - 1))
    .map(|result| {
      serde_wasm_bindgen::to_value(&TypeQueryResult {
        range: Range::from(&result.location),
        contents: result
          .contents
          .into_iter()
          .map(|c| TypeQueryContent { language: c.language.to_string(), value: c.value })
          .collect(),
      })
      .unwrap()
    })
    .unwrap_or(JsValue::NULL)
}

#[wasm_bindgen(js_name=queryDefinitionLocation)]
pub fn query_definition_location(source: String, line: i32, column: i32) -> JsValue {
  new_services(source)
    .query_definition_location(&demo_mod_ref(), samlang_core::ast::Position(line - 1, column - 1))
    .map(|loc| serde_wasm_bindgen::to_value(&Range::from(&loc)).unwrap())
    .unwrap_or(JsValue::NULL)
}

#[wasm_bindgen(js_name=autoComplete)]
pub fn autocomplete(source: String, line: i32, column: i32) -> JsValue {
  serde_wasm_bindgen::to_value(
    &(new_services(source)
      .auto_complete(&demo_mod_ref(), samlang_core::ast::Position(line - 1, column))
      .into_iter()
      .map(|item| AutoCompletionItem {
        range: Range { start_line: line, start_col: column, end_line: line, end_col: column },
        label: item.label,
        insert_text: item.insert_text,
        insert_text_rules: match item.insert_text_format {
          samlang_core::services::api::InsertTextFormat::PlainText => 1,
          samlang_core::services::api::InsertTextFormat::Snippet => 4,
        },
        kind: item.kind as i32,
        detail: item.detail,
      })
      .collect::<Vec<_>>()),
  )
  .unwrap()
}
