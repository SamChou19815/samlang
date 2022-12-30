#![allow(dead_code, clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

use std::{
  fs,
  path::{Path, PathBuf},
};

mod configuration;
mod logo;

mod utils {
  use super::*;

  pub(super) fn get_configuration() -> configuration::ProjectConfiguration {
    match configuration::load_project_configuration() {
      Ok(c) => c,
      Err(e) => {
        eprintln!("{}", e.to_str());
        std::process::exit(2)
      }
    }
  }

  fn file_path_to_module_reference(
    absolute_source_path: &Path,
    absolute_file_path: &Path,
  ) -> Option<samlang_core::ast::ModuleReference> {
    let relative_path = absolute_file_path.strip_prefix(absolute_source_path).ok()?;
    let mut relative_path_no_extension_chars = relative_path.to_str()?.chars().collect::<Vec<_>>();
    relative_path_no_extension_chars.pop(); // m
    relative_path_no_extension_chars.pop(); // a
    relative_path_no_extension_chars.pop(); // s
    relative_path_no_extension_chars.pop(); // .
    Some(samlang_core::ast::ModuleReference::from_string_parts(
      relative_path_no_extension_chars
        .into_iter()
        .collect::<String>()
        .split(std::path::MAIN_SEPARATOR)
        .map(|part| part.to_string())
        .collect(),
    ))
  }

  fn walk(
    ignores: &Vec<String>,
    absolute_source_path: &Path,
    start_path: &Path,
    sources: &mut Vec<(samlang_core::ast::ModuleReference, String)>,
  ) {
    for ignore in ignores {
      if start_path.to_str().map(|s| s.contains(ignore)).unwrap_or(false) {
        return;
      }
    }
    if start_path.is_file() && start_path.to_str().unwrap().ends_with(".sam") {
      if let (Some(mod_ref), Ok(src)) = (
        file_path_to_module_reference(absolute_source_path, start_path),
        fs::read_to_string(start_path),
      ) {
        sources.push((mod_ref, src));
      }
    } else if start_path.is_dir() {
      if let Ok(read_dir_result) = fs::read_dir(start_path) {
        for entry in read_dir_result.into_iter().flatten() {
          walk(ignores, absolute_source_path, entry.path().as_path(), sources);
        }
      }
    }
  }

  pub(super) fn collect_sources(
    configuration: &configuration::ProjectConfiguration,
  ) -> Vec<(samlang_core::ast::ModuleReference, String)> {
    let mut sources = vec![];
    if let Ok(absolute_source_path) =
      fs::canonicalize(PathBuf::from(configuration.source_directory.clone()))
    {
      let start_path = absolute_source_path.as_path();
      walk(&configuration.ignores, start_path, start_path, &mut sources);
    }
    sources
  }
}

// TODO LSP

mod runners {
  use super::*;

  pub(super) fn format(need_help: bool) {
    if need_help {
      println!("samlang format: Format your codebase according to sconfig.json.")
    } else {
      let configuration = utils::get_configuration();
      for (module_reference, source) in utils::collect_sources(&configuration) {
        fs::write(
          PathBuf::from(configuration.source_directory.clone())
            .join(module_reference.to_filename()),
          samlang_core::reformat_source(&source),
        )
        .unwrap();
      }
    }
  }

  pub(super) fn compile(need_help: bool) {
    if need_help {
      println!("samlang compile: Compile your codebase according to sconfig.json.")
    } else {
      let configuration = utils::get_configuration();
      let entry_module_references = configuration
        .entry_points
        .iter()
        .map(|entry_point| {
          samlang_core::ast::ModuleReference::from_string_parts(
            entry_point.split('.').map(|s| s.to_string()).collect(),
          )
        })
        .collect::<Vec<_>>();
      match samlang_core::compile_sources(
        utils::collect_sources(&configuration),
        entry_module_references,
      ) {
        Ok(samlang_core::SourcesCompilationResult { text_code_results, wasm_file }) => {
          if fs::create_dir_all(configuration.output_directory.clone()).is_ok() {
            for (file, content) in text_code_results {
              fs::write(PathBuf::from(configuration.output_directory.clone()).join(file), content)
                .unwrap();
            }
            fs::write(
              PathBuf::from(configuration.output_directory.clone()).join("__all__.wasm"),
              wasm_file,
            )
            .unwrap();
          }
        }
        Err(errors) => {
          eprintln!("Found {} error(s).", errors.len());
          for e in errors {
            eprintln!("{}", e);
          }
          std::process::exit(1)
        }
      }
    }
  }

  pub(super) fn lsp(need_help: bool) {
    if need_help {
      println!("samlang lsp: Start a language server according to sconfig.json.")
    } else {
      todo!("TODO LSP")
    }
  }

  pub(super) fn help() {
    println!(
      r#"`${}
Usage:
samlang [command]

Commands:
[no command]: defaults to check command specified below.
compile: Compile your codebase according to sconfig.json.
help: Show this message.`"#,
      logo::get_logo()
    )
  }
}

fn main() {
  let arguments = std::env::args().skip(1).collect::<Vec<_>>();
  let does_need_help =
    arguments.contains(&"--help".to_string()) || arguments.contains(&"-h".to_string());
  if arguments.is_empty() {
    runners::compile(false);
  } else {
    match arguments[0].as_str() {
      "format" => runners::format(does_need_help),
      "compile" => runners::compile(does_need_help),
      "lsp" => runners::lsp(does_need_help),
      _ => runners::help(),
    }
  }
}
