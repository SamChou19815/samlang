#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

use js_sys::Uint8Array;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

fn demo_mod_ref() -> samlang_core::ast::ModuleReference {
  samlang_core::ast::ModuleReference::from_string_parts(vec!["Demo".to_string()])
}

#[wasm_bindgen]
pub fn reformat_source(source: &str) -> String {
  samlang_core::reformat_source(source)
}

#[wasm_bindgen]
pub struct SourcesCompilationResult {
  #[wasm_bindgen(getter_with_clone)]
  pub emitted_ts_code: String,
  #[wasm_bindgen(getter_with_clone)]
  pub wasm_code: Uint8Array,
  #[wasm_bindgen(getter_with_clone)]
  // Error vector, separated by \n
  pub errors: String,
}

#[wasm_bindgen]
pub fn compile_single_source(source: String) -> SourcesCompilationResult {
  match samlang_core::compile_sources(vec![(demo_mod_ref(), source)], vec![demo_mod_ref()], false) {
    Ok(samlang_core::SourcesCompilationResult { text_code_results, wasm_file }) => {
      let emitted_ts_code = text_code_results.get("Demo.ts").unwrap().clone();
      let wasm_code = Uint8Array::from(&wasm_file as &[u8]);
      SourcesCompilationResult { emitted_ts_code, wasm_code, errors: "".to_string() }
    }
    Err(errors) => SourcesCompilationResult {
      emitted_ts_code: "".to_string(),
      wasm_code: Uint8Array::new_with_length(0),
      errors: errors.join("\n"),
    },
  }
}

#[derive(Serialize, Deserialize)]
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
  label: String,
  #[serde(rename(serialize = "insertText"))]
  insert_text: String,
  #[serde(rename(serialize = "insertTextFormat"))]
  insert_text_format: i32,
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

#[wasm_bindgen]
pub struct LanguageService(samlang_core::services::api::LanguageServices);

#[wasm_bindgen]
impl LanguageService {
  #[wasm_bindgen(constructor)]
  pub fn new(source: String) -> LanguageService {
    LanguageService(samlang_core::services::api::LanguageServices::new(vec![(
      demo_mod_ref(),
      source,
    )]))
  }

  #[wasm_bindgen]
  pub fn get_errors(&self) -> String {
    self.0.get_errors(&demo_mod_ref()).iter().map(|e| e.to_string()).collect::<Vec<_>>().join("\n")
  }

  #[wasm_bindgen]
  pub fn update(&mut self, source: String) {
    self.0.update(demo_mod_ref(), source);
  }

  #[wasm_bindgen]
  pub fn query_type(&self, line: i32, column: i32) -> JsValue {
    self
      .0
      .query_for_hover(&demo_mod_ref(), samlang_core::ast::Position(line, column))
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

  #[wasm_bindgen]
  pub fn query_definition(&self, line: i32, column: i32) -> JsValue {
    self
      .0
      .query_definition_location(&demo_mod_ref(), samlang_core::ast::Position(line, column))
      .map(|loc| serde_wasm_bindgen::to_value(&Range::from(&loc)).unwrap())
      .unwrap_or(JsValue::NULL)
  }

  #[wasm_bindgen]
  pub fn autocomplete(&self, line: i32, column: i32) -> JsValue {
    serde_wasm_bindgen::to_value(
      &(self
        .0
        .auto_complete(&demo_mod_ref(), samlang_core::ast::Position(line, column))
        .into_iter()
        .map(|item| AutoCompletionItem {
          label: item.label,
          insert_text: item.insert_text,
          insert_text_format: match item.insert_text_format {
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
}
