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

  pub(super) fn file_path_to_module_reference(
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
      if start_path
        .strip_prefix(absolute_source_path)
        .ok()
        .and_then(|s| s.to_str())
        .map(|s| s.contains(ignore))
        .unwrap_or(false)
      {
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

mod lsp {
  use super::*;
  use samlang_core::services;
  use std::sync::Arc;
  use tokio::sync::Mutex;
  use tower_lsp::jsonrpc::Result;
  use tower_lsp::lsp_types::*;
  use tower_lsp::{Client, LanguageServer};

  fn lsp_pos_to_samlang_pos(position: Position) -> samlang_core::ast::Position {
    samlang_core::ast::Position(position.line as i32, position.character as i32)
  }

  fn samlang_loc_to_lsp_range(loc: &samlang_core::ast::Location) -> Range {
    Range {
      start: Position { line: loc.start.0 as u32, character: loc.start.1 as u32 },
      end: Position { line: loc.end.0 as u32, character: loc.end.1 as u32 },
    }
  }

  pub(super) struct Backend {
    client: Client,
    absolute_source_path: PathBuf,
    service: Arc<Mutex<services::api::LanguageServices>>,
  }

  const ENTIRE_DOCUMENT_RANGE: Range = Range {
    start: Position { line: 0, character: 0 },
    end: Position { line: u32::MAX, character: u32::MAX },
  };

  impl Backend {
    pub(super) fn new(
      client: Client,
      absolute_source_path: PathBuf,
      service: services::api::LanguageServices,
    ) -> Backend {
      Backend { client, absolute_source_path, service: Arc::new(Mutex::new(service)) }
    }

    fn convert_url_to_module_reference(&self, url: &Url) -> samlang_core::ast::ModuleReference {
      let url_str = url.as_str();
      let url_protocol_stripped_str = PathBuf::from(if url_str.starts_with("file://") {
        url_str.chars().skip("file://".len()).collect::<String>()
      } else {
        url_str.to_string()
      });
      utils::file_path_to_module_reference(
        self.absolute_source_path.as_path(),
        url_protocol_stripped_str.as_path(),
      )
      .unwrap()
    }

    fn convert_module_reference_to_url(
      &self,
      module_reference: &samlang_core::ast::ModuleReference,
    ) -> Url {
      if let Ok(path) = fs::canonicalize(
        self.absolute_source_path.join(PathBuf::from(module_reference.to_filename())),
      ) {
        match Url::from_file_path(path) {
          Ok(url) => url,
          Err(_) => panic!("{}", module_reference.to_filename()),
        }
      } else {
        panic!("{}", module_reference.to_filename())
      }
    }

    async fn publish_diagnostics(&self) {
      let cloned_locked_service = self.service.clone();
      let service = cloned_locked_service.lock().await;
      for module_reference in service.all_modules() {
        let diagnostics = service
          .get_errors(module_reference)
          .iter()
          .map(|e| Diagnostic {
            range: samlang_loc_to_lsp_range(&e.0),
            severity: Some(DiagnosticSeverity::ERROR),
            message: e.to_string(),
            source: Some("samlang".to_string()),
            ..Default::default()
          })
          .collect::<Vec<_>>();
        self
          .client
          .publish_diagnostics(
            self.convert_module_reference_to_url(module_reference),
            diagnostics,
            None,
          )
          .await;
      }
    }
  }

  #[tower_lsp::async_trait]
  impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> Result<InitializeResult> {
      Ok(InitializeResult {
        capabilities: ServerCapabilities {
          text_document_sync: Some(TextDocumentSyncCapability::Kind(TextDocumentSyncKind::FULL)),
          hover_provider: Some(HoverProviderCapability::Simple(true)),
          definition_provider: Some(OneOf::Right(DefinitionOptions {
            work_done_progress_options: Default::default(),
          })),
          folding_range_provider: Some(FoldingRangeProviderCapability::Simple(true)),
          completion_provider: Some(CompletionOptions {
            resolve_provider: Some(false),
            trigger_characters: Some(vec![".".to_string()]),
            all_commit_characters: None,
            work_done_progress_options: Default::default(),
          }),
          document_formatting_provider: Some(OneOf::Right(DocumentFormattingOptions::default())),
          ..Default::default()
        },
        ..InitializeResult::default()
      })
    }

    async fn initialized(&self, _: InitializedParams) {
      self.client.log_message(MessageType::INFO, "[lsp] initialized").await;
      self.publish_diagnostics().await;
    }

    async fn shutdown(&self) -> Result<()> {
      self.client.log_message(MessageType::INFO, "[lsp] shutdown").await;
      Ok(())
    }

    async fn did_change(&self, mut params: DidChangeTextDocumentParams) {
      self.client.log_message(MessageType::INFO, "[lsp] did_change_watched_files").await;
      let module_reference = self.convert_url_to_module_reference(&params.text_document.uri);
      if let Some(TextDocumentContentChangeEvent { text, .. }) = params.content_changes.pop() {
        self.service.lock().await.update(module_reference, text);
        self.publish_diagnostics().await;
      }
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
      self.client.log_message(MessageType::INFO, "[lsp] hover").await;
      Ok(
        self
          .service
          .lock()
          .await
          .query_for_hover(
            &self.convert_url_to_module_reference(
              &params.text_document_position_params.text_document.uri,
            ),
            lsp_pos_to_samlang_pos(params.text_document_position_params.position),
          )
          .map(|samlang_core::services::api::TypeQueryResult { location, contents }| Hover {
            contents: HoverContents::Array(
              contents
                .into_iter()
                .map(|content| {
                  MarkedString::LanguageString(LanguageString {
                    language: content.language.to_string(),
                    value: content.value,
                  })
                })
                .collect(),
            ),
            range: Some(samlang_loc_to_lsp_range(&location)),
          }),
      )
    }

    async fn goto_definition(
      &self,
      params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
      self.client.log_message(MessageType::INFO, "[lsp] goto_definition").await;
      Ok(
        self
          .service
          .lock()
          .await
          .query_definition_location(
            &self.convert_url_to_module_reference(
              &params.text_document_position_params.text_document.uri,
            ),
            lsp_pos_to_samlang_pos(params.text_document_position_params.position),
          )
          .map(|location| {
            GotoDefinitionResponse::Scalar(Location {
              uri: self.convert_module_reference_to_url(&location.module_reference),
              range: samlang_loc_to_lsp_range(&location),
            })
          }),
      )
    }

    async fn folding_range(&self, params: FoldingRangeParams) -> Result<Option<Vec<FoldingRange>>> {
      self.client.log_message(MessageType::INFO, "[lsp] folding_range").await;
      Ok(
        self
          .service
          .lock()
          .await
          .query_folding_ranges(&self.convert_url_to_module_reference(&params.text_document.uri))
          .map(|ranges| {
            ranges
              .into_iter()
              .map(|location| FoldingRange {
                start_line: location.start.0 as u32,
                start_character: Some(location.start.1 as u32),
                end_line: location.end.0 as u32,
                end_character: Some(location.end.1 as u32),
                kind: None,
              })
              .collect()
          }),
      )
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
      self.client.log_message(MessageType::INFO, "[lsp] completion").await;
      Ok(Some(CompletionResponse::Array(
        self
          .service
          .lock()
          .await
          .auto_complete(
            &self.convert_url_to_module_reference(&params.text_document_position.text_document.uri),
            lsp_pos_to_samlang_pos(params.text_document_position.position),
          )
          .into_iter()
          .map(|item| CompletionItem {
            label: item.label,
            kind: Some(match item.kind {
              services::api::CompletionItemKind::Method => CompletionItemKind::METHOD,
              services::api::CompletionItemKind::Function => CompletionItemKind::FUNCTION,
              services::api::CompletionItemKind::Field => CompletionItemKind::FIELD,
            }),
            detail: Some(item.detail),
            insert_text: Some(item.insert_text),
            insert_text_format: Some(match item.insert_text_format {
              services::api::InsertTextFormat::PlainText => InsertTextFormat::PLAIN_TEXT,
              services::api::InsertTextFormat::Snippet => InsertTextFormat::SNIPPET,
            }),
            ..Default::default()
          })
          .collect(),
      )))
    }

    async fn rename(&self, params: RenameParams) -> Result<Option<WorkspaceEdit>> {
      self.client.log_message(MessageType::INFO, "[lsp] rename").await;
      Ok(
        self
          .service
          .lock()
          .await
          .rename_variable(
            &self.convert_url_to_module_reference(&params.text_document_position.text_document.uri),
            lsp_pos_to_samlang_pos(params.text_document_position.position),
            &params.new_name,
          )
          .map(|new_text| WorkspaceEdit {
            changes: None,
            document_changes: Some(DocumentChanges::Edits(vec![TextDocumentEdit {
              text_document: OptionalVersionedTextDocumentIdentifier {
                uri: params.text_document_position.text_document.uri,
                version: None,
              },
              edits: vec![OneOf::Left(TextEdit { range: ENTIRE_DOCUMENT_RANGE, new_text })],
            }])),
            change_annotations: None,
          }),
      )
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
      self.client.log_message(MessageType::INFO, "[lsp] formatting").await;
      Ok(
        self
          .service
          .lock()
          .await
          .format_entire_document(&self.convert_url_to_module_reference(&params.text_document.uri))
          .map(|new_text| vec![TextEdit { range: ENTIRE_DOCUMENT_RANGE, new_text }]),
      )
    }
  }
}

mod runners {
  use super::*;
  use tower_lsp::{LspService, Server};

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
      let enable_profiling = std::env::var("PROFILE").is_ok();
      let collected_sources =
        samlang_core::measure_time(enable_profiling, "Collecting sources", || {
          utils::collect_sources(&configuration)
        });
      match samlang_core::compile_sources(
        collected_sources,
        entry_module_references,
        enable_profiling,
      ) {
        Ok(samlang_core::SourcesCompilationResult { text_code_results, wasm_file }) => {
          if fs::create_dir_all(configuration.output_directory.clone()).is_ok() {
            for (file, content) in text_code_results {
              fs::write(PathBuf::from(configuration.output_directory.clone()).join(file), content)
                .unwrap();
            }
            fs::write(
              PathBuf::from(&configuration.output_directory).join("__all__.wasm"),
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

  pub(super) async fn lsp(need_help: bool) {
    if need_help {
      println!("samlang lsp: Start a language server according to sconfig.json.")
    } else {
      let configuration = utils::get_configuration();
      if let Ok(absolute_source_path) =
        fs::canonicalize(PathBuf::from(configuration.source_directory.clone()))
      {
        let collected_sources = utils::collect_sources(&configuration);
        let service = samlang_core::services::api::LanguageServices::new(collected_sources);
        let (service, socket) =
          LspService::new(|client| lsp::Backend::new(client, absolute_source_path, service));

        let stdin = tokio::io::stdin();
        let stdout = tokio::io::stdout();
        Server::new(stdin, stdout, socket).serve(service).await;
      }
    }
  }

  pub(super) fn help() {
    println!(
      r#"{}
Usage:
samlang [command]

Commands:
[no command]: defaults to compile command specified below.
format: Format your codebase according to sconfig.json.
compile: Compile your codebase according to sconfig.json.
lsp: Start a language server according to sconfig.json.
help: Show this message."#,
      logo::get_logo()
    )
  }
}

#[tokio::main]
async fn main() {
  let arguments = std::env::args().skip(1).collect::<Vec<_>>();
  let does_need_help =
    arguments.contains(&"--help".to_string()) || arguments.contains(&"-h".to_string());
  if arguments.is_empty() {
    runners::compile(false);
  } else {
    match arguments[0].as_str() {
      "format" => runners::format(does_need_help),
      "compile" => runners::compile(does_need_help),
      "lsp" => runners::lsp(does_need_help).await,
      _ => runners::help(),
    }
  }
}
