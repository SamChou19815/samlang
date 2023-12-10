#![allow(clippy::upper_case_acronyms, clippy::or_fun_call, clippy::expect_fun_call)]
#![cfg_attr(coverage_nightly, feature(no_coverage))]

use std::{
  fs,
  path::{Path, PathBuf},
};

mod configuration;
mod logo;

mod utils {
  use super::*;
  use std::collections::HashMap;

  pub(super) fn get_configuration() -> configuration::ProjectConfiguration {
    match configuration::load_project_configuration() {
      Ok(c) => c,
      Err(e) => {
        eprintln!("{}", e.to_str());
        std::process::exit(2)
      }
    }
  }

  pub(super) fn file_path_to_module_reference_parts(
    absolute_source_path: &Path,
    absolute_file_path: &Path,
  ) -> Option<Vec<String>> {
    let relative_path = absolute_file_path.strip_prefix(absolute_source_path).ok()?;
    let mut relative_path_no_extension_chars = relative_path.to_str()?.chars().collect::<Vec<_>>();
    relative_path_no_extension_chars.pop(); // m
    relative_path_no_extension_chars.pop(); // a
    relative_path_no_extension_chars.pop(); // s
    relative_path_no_extension_chars.pop(); // .
    Some(
      relative_path_no_extension_chars
        .into_iter()
        .collect::<String>()
        .split(std::path::MAIN_SEPARATOR)
        .map(|part| part.to_string())
        .collect(),
    )
  }

  pub(super) fn file_path_to_module_reference_alloc(
    heap: &mut samlang_heap::Heap,
    absolute_source_path: &Path,
    absolute_file_path: &Path,
  ) -> Option<samlang_heap::ModuleReference> {
    file_path_to_module_reference_parts(absolute_source_path, absolute_file_path)
      .map(|parts| heap.alloc_module_reference_from_string_vec(parts))
  }

  fn walk(
    heap: &mut samlang_heap::Heap,
    configuration: &configuration::ProjectConfiguration,
    absolute_source_path: &Path,
    start_path: &Path,
    sources: &mut HashMap<samlang_heap::ModuleReference, String>,
  ) {
    for ignore in &configuration.ignores {
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
        file_path_to_module_reference_alloc(heap, absolute_source_path, start_path),
        fs::read_to_string(start_path),
      ) {
        if !configuration.dangerously_allow_libdef_shadowing && mod_ref.is_std(heap) {
          eprintln!("Modules under std namespace cannot be included.");
          eprintln!("They are reserved for builtin standard library.");
          std::process::exit(1)
        } else {
          sources.insert(mod_ref, src);
        }
      }
    } else if start_path.is_dir() {
      if let Ok(read_dir_result) = fs::read_dir(start_path) {
        for entry in read_dir_result.into_iter().flatten() {
          walk(heap, configuration, absolute_source_path, entry.path().as_path(), sources);
        }
      }
    }
  }

  pub(super) fn collect_sources(
    configuration: &configuration::ProjectConfiguration,
    heap: &mut samlang_heap::Heap,
  ) -> HashMap<samlang_heap::ModuleReference, String> {
    let mut sources = if configuration.dangerously_allow_libdef_shadowing {
      HashMap::new()
    } else {
      samlang_core::builtin_std_raw_sources(heap)
    };
    if let Ok(absolute_source_path) =
      fs::canonicalize(PathBuf::from(&configuration.source_directory))
    {
      let start_path = absolute_source_path.as_path();
      walk(heap, configuration, start_path, start_path, &mut sources);
    }
    sources
  }
}

mod lsp {
  use super::*;
  use std::collections::HashMap;
  use tokio::sync::RwLock;
  use tower_lsp::jsonrpc::Result;
  use tower_lsp::lsp_types::*;
  use tower_lsp::{Client, LanguageServer};

  fn lsp_pos_to_samlang_pos(position: Position) -> samlang_ast::Position {
    samlang_ast::Position(position.line as i32, position.character as i32)
  }

  fn samlang_loc_to_lsp_range(loc: &samlang_ast::Location) -> Range {
    Range {
      start: Position { line: loc.start.0 as u32, character: loc.start.1 as u32 },
      end: Position { line: loc.end.0 as u32, character: loc.end.1 as u32 },
    }
  }

  pub(super) struct Backend {
    client: Client,
    absolute_source_path: PathBuf,
    state: RwLock<WrappedState>,
  }

  struct WrappedState(samlang_services::server_state::ServerState);

  impl WrappedState {
    fn update(&mut self, absolute_source_path: &Path, updates: Vec<(Url, String)>) {
      let mut mod_ref_updates = vec![];
      for (url, code) in updates {
        let mod_ref = self.0.heap.alloc_module_reference_from_string_vec(
          convert_url_to_module_reference_helper(absolute_source_path, &url),
        );
        mod_ref_updates.push((mod_ref, code));
      }
      self.0.update(mod_ref_updates);
    }

    fn get_diagnostics(&self, absolute_source_path: &Path) -> Vec<(Url, Vec<Diagnostic>)> {
      let heap = &self.0.heap;
      let mut collected = vec![];
      for module_reference in self.0.all_modules() {
        if let Some(url) =
          convert_module_reference_to_url_helper(heap, absolute_source_path, module_reference)
        {
          let diagnostics = self
            .0
            .get_errors(module_reference)
            .iter()
            .map(|e| {
              let (loc, message, related_locs) = e.to_ide_format(heap);
              Diagnostic {
                range: samlang_loc_to_lsp_range(&loc),
                severity: Some(DiagnosticSeverity::ERROR),
                message,
                source: Some("samlang".to_string()),
                related_information: Some(
                  related_locs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, l)| {
                      convert_module_reference_to_url_helper(
                        heap,
                        absolute_source_path,
                        &l.module_reference,
                      )
                      .map(|uri| DiagnosticRelatedInformation {
                        location: Location { uri, range: samlang_loc_to_lsp_range(l) },
                        message: format!("[{}]", i),
                      })
                    })
                    .collect(),
                ),
                ..Default::default()
              }
            })
            .collect::<Vec<_>>();
          collected.push((url, diagnostics));
        }
      }
      collected
    }
  }

  fn convert_module_reference_to_url_helper(
    heap: &samlang_heap::Heap,
    absolute_source_path: &Path,
    module_reference: &samlang_heap::ModuleReference,
  ) -> Option<Url> {
    let path = fs::canonicalize(
      absolute_source_path.join(PathBuf::from(module_reference.to_filename(heap))),
    )
    .ok()?;
    Url::from_file_path(path).ok()
  }

  fn convert_url_to_module_reference_helper(absolute_source_path: &Path, url: &Url) -> Vec<String> {
    let url_str = url.as_str();
    let url_protocol_stripped_str = PathBuf::from(if url_str.starts_with("file://") {
      url_str.chars().skip("file://".len()).collect::<String>()
    } else {
      url_str.to_string()
    });
    utils::file_path_to_module_reference_parts(
      absolute_source_path,
      url_protocol_stripped_str.as_path(),
    )
    .unwrap()
  }

  unsafe impl Send for WrappedState {}
  unsafe impl Sync for WrappedState {}

  const ENTIRE_DOCUMENT_RANGE: Range = Range {
    start: Position { line: 0, character: 0 },
    end: Position { line: u32::MAX, character: u32::MAX },
  };

  impl Backend {
    pub(super) fn new(
      client: Client,
      absolute_source_path: PathBuf,
      state: samlang_services::server_state::ServerState,
    ) -> Backend {
      Backend { client, absolute_source_path, state: RwLock::new(WrappedState(state)) }
    }

    fn convert_url_to_module_reference_readonly(
      &self,
      heap: &samlang_heap::Heap,
      url: &Url,
    ) -> samlang_heap::ModuleReference {
      let parts = convert_url_to_module_reference_helper(&self.absolute_source_path, url);
      heap.get_allocated_module_reference_opt(parts).unwrap_or(samlang_heap::ModuleReference::ROOT)
    }

    fn convert_url_to_module_reference_add_if_absent(
      &self,
      heap: &mut samlang_heap::Heap,
      url: &Url,
    ) -> samlang_heap::ModuleReference {
      let parts = convert_url_to_module_reference_helper(&self.absolute_source_path, url);
      heap.alloc_module_reference_from_string_vec(parts)
    }

    fn convert_module_reference_to_url(
      &self,
      heap: &samlang_heap::Heap,
      module_reference: &samlang_heap::ModuleReference,
    ) -> Option<Url> {
      convert_module_reference_to_url_helper(heap, &self.absolute_source_path, module_reference)
    }

    async fn publish_diagnostics(&self, state: &mut WrappedState) {
      let to_publish = state.get_diagnostics(&self.absolute_source_path);
      for (url, diagnostics) in to_publish {
        self.client.publish_diagnostics(url, diagnostics, None).await;
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
          completion_provider: Some(CompletionOptions {
            resolve_provider: Some(false),
            trigger_characters: Some(vec![".".to_string()]),
            all_commit_characters: None,
            work_done_progress_options: Default::default(),
          }),
          signature_help_provider: Some(SignatureHelpOptions {
            trigger_characters: Some(vec!["(".to_string(), ",".to_string()]),
            ..Default::default()
          }),
          code_action_provider: Some(CodeActionProviderCapability::Options(CodeActionOptions {
            code_action_kinds: Some(vec![CodeActionKind::QUICKFIX]),
            work_done_progress_options: WorkDoneProgressOptions { work_done_progress: Some(false) },
            resolve_provider: Some(false),
          })),
          definition_provider: Some(OneOf::Right(DefinitionOptions {
            work_done_progress_options: Default::default(),
          })),
          references_provider: Some(OneOf::Right(ReferencesOptions {
            work_done_progress_options: Default::default(),
          })),
          document_formatting_provider: Some(OneOf::Right(DocumentFormattingOptions::default())),
          folding_range_provider: Some(FoldingRangeProviderCapability::Simple(true)),
          workspace: Some(WorkspaceServerCapabilities {
            workspace_folders: None,
            file_operations: Some(WorkspaceFileOperationsServerCapabilities {
              did_create: Some(FileOperationRegistrationOptions {
                filters: vec![FileOperationFilter {
                  scheme: Some(String::from("file")),
                  pattern: FileOperationPattern {
                    glob: "**/*.sam".to_string(),
                    matches: None,
                    options: None,
                  },
                }],
              }),
              will_create: None,
              did_rename: Some(FileOperationRegistrationOptions {
                filters: vec![FileOperationFilter {
                  scheme: Some(String::from("file")),
                  pattern: FileOperationPattern {
                    glob: "**/*.sam".to_string(),
                    matches: None,
                    options: None,
                  },
                }],
              }),
              will_rename: None,
              did_delete: Some(FileOperationRegistrationOptions {
                filters: vec![FileOperationFilter {
                  scheme: Some(String::from("file")),
                  pattern: FileOperationPattern {
                    glob: "**/*.sam".to_string(),
                    matches: None,
                    options: None,
                  },
                }],
              }),
              will_delete: None,
            }),
          }),
          ..Default::default()
        },
        ..InitializeResult::default()
      })
    }

    async fn initialized(&self, _: InitializedParams) {
      self.client.log_message(MessageType::INFO, "[lsp] initialized").await;
      let mut state = self.state.write().await;
      self.publish_diagnostics(&mut state).await;
    }

    async fn shutdown(&self) -> Result<()> {
      self.client.log_message(MessageType::INFO, "[lsp] shutdown").await;
      Ok(())
    }

    async fn did_create_files(&self, params: CreateFilesParams) {
      self.client.log_message(MessageType::INFO, "[lsp] did_create_files").await;
      let mut state = self.state.write().await;
      let added_set = params
        .files
        .iter()
        .filter_map(|f| Url::parse(&f.uri).ok())
        .filter_map(|uri| {
          if let Ok(content) = fs::read_to_string(uri.path()) {
            Some((
              self.convert_url_to_module_reference_add_if_absent(&mut state.0.heap, &uri),
              content,
            ))
          } else {
            None
          }
        })
        .collect::<Vec<_>>();
      state.0.update(added_set);
      self.publish_diagnostics(&mut state).await;
    }

    async fn did_rename_files(&self, params: RenameFilesParams) {
      self.client.log_message(MessageType::INFO, "[lsp] did_rename_files").await;
      let mut state = self.state.write().await;
      let rename_set = params
        .files
        .iter()
        .filter_map(|f| Option::zip(Url::parse(&f.old_uri).ok(), Url::parse(&f.new_uri).ok()))
        .map(|(old_uri, new_uri)| {
          (
            self.convert_url_to_module_reference_add_if_absent(&mut state.0.heap, &old_uri),
            self.convert_url_to_module_reference_add_if_absent(&mut state.0.heap, &new_uri),
          )
        })
        .collect::<Vec<_>>();
      state.0.rename_module(rename_set);
      self.publish_diagnostics(&mut state).await;
    }

    async fn did_delete_files(&self, params: DeleteFilesParams) {
      self.client.log_message(MessageType::INFO, "[lsp] did_delete_files").await;
      let mut state = self.state.write().await;
      let remove_set = params
        .files
        .iter()
        .filter_map(|f| Url::parse(&f.uri).ok())
        .map(|uri| self.convert_url_to_module_reference_readonly(&state.0.heap, &uri))
        .collect::<Vec<_>>();
      state.0.remove(&remove_set);
      self.publish_diagnostics(&mut state).await;
    }

    async fn did_change(&self, mut params: DidChangeTextDocumentParams) {
      self.client.log_message(MessageType::INFO, "[lsp] did_change_watched_files").await;
      if let Some(TextDocumentContentChangeEvent { text, .. }) = params.content_changes.pop() {
        let mut state = self.state.write().await;
        state.update(&self.absolute_source_path, vec![(params.text_document.uri, text)]);
        self.publish_diagnostics(&mut state).await;
      }
    }

    async fn completion(&self, params: CompletionParams) -> Result<Option<CompletionResponse>> {
      self.client.log_message(MessageType::INFO, "[lsp] completion").await;
      let state = self.state.read().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position.text_document.uri,
      );
      use samlang_services::completion;
      Ok(Some(CompletionResponse::Array(
        samlang_services::completion::auto_complete(
          &state.0,
          &mod_ref,
          lsp_pos_to_samlang_pos(params.text_document_position.position),
        )
        .into_iter()
        .map(|item| CompletionItem {
          label: item.label,
          kind: Some(match item.kind {
            completion::CompletionItemKind::Method => CompletionItemKind::METHOD,
            completion::CompletionItemKind::Function => CompletionItemKind::FUNCTION,
            completion::CompletionItemKind::Field => CompletionItemKind::FIELD,
            completion::CompletionItemKind::Variable => CompletionItemKind::VARIABLE,
            completion::CompletionItemKind::Class => CompletionItemKind::CLASS,
            completion::CompletionItemKind::Interface => CompletionItemKind::INTERFACE,
          }),
          detail: Some(item.detail),
          insert_text: Some(item.insert_text),
          additional_text_edits: Some(
            item
              .additional_edits
              .into_iter()
              .map(|(loc, new_text)| TextEdit { range: samlang_loc_to_lsp_range(&loc), new_text })
              .collect(),
          ),
          ..Default::default()
        })
        .collect(),
      )))
    }

    async fn hover(&self, params: HoverParams) -> Result<Option<Hover>> {
      self.client.log_message(MessageType::INFO, "[lsp] hover").await;
      let state = self.state.read().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position_params.text_document.uri,
      );
      Ok(
        samlang_services::query::hover(
          &state.0,
          &mod_ref,
          lsp_pos_to_samlang_pos(params.text_document_position_params.position),
        )
        .map(|result| Hover {
          contents: HoverContents::Array(
            result
              .contents
              .into_iter()
              .map(|content| {
                MarkedString::LanguageString(LanguageString {
                  language: content.language.to_string(),
                  value: content.value,
                })
              })
              .collect(),
          ),
          range: Some(samlang_loc_to_lsp_range(&result.location)),
        }),
      )
    }

    async fn signature_help(&self, params: SignatureHelpParams) -> Result<Option<SignatureHelp>> {
      self.client.log_message(MessageType::INFO, "[lsp] signature_help").await;
      let state = self.state.read().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position_params.text_document.uri,
      );
      Ok(
        samlang_services::query::signature_help(
          &state.0,
          &mod_ref,
          lsp_pos_to_samlang_pos(params.text_document_position_params.position),
        )
        .map(|result| SignatureHelp {
          signatures: vec![SignatureInformation {
            label: result.label,
            documentation: None,
            parameters: Some(
              result
                .parameters
                .into_iter()
                .map(|s| ParameterInformation {
                  label: ParameterLabel::Simple(s),
                  documentation: None,
                })
                .collect(),
            ),
            active_parameter: Some(result.active_parameter as u32),
          }],
          active_parameter: Some(result.active_parameter as u32),
          active_signature: None,
        }),
      )
    }

    async fn goto_definition(
      &self,
      params: GotoDefinitionParams,
    ) -> Result<Option<GotoDefinitionResponse>> {
      self.client.log_message(MessageType::INFO, "[lsp] goto_definition").await;
      let state = self.state.read().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position_params.text_document.uri,
      );
      Ok(
        samlang_services::query::definition_location(
          &state.0,
          &mod_ref,
          lsp_pos_to_samlang_pos(params.text_document_position_params.position),
        )
        .and_then(|location| {
          self.convert_module_reference_to_url(&state.0.heap, &location.module_reference).map(
            |uri| {
              GotoDefinitionResponse::Scalar(Location {
                uri,
                range: samlang_loc_to_lsp_range(&location),
              })
            },
          )
        }),
      )
    }

    async fn references(&self, params: ReferenceParams) -> Result<Option<Vec<Location>>> {
      self.client.log_message(MessageType::INFO, "[lsp] references").await;
      let state = self.state.read().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position.text_document.uri,
      );
      Ok(Some(
        samlang_services::query::all_references(
          &state.0,
          &mod_ref,
          lsp_pos_to_samlang_pos(params.text_document_position.position),
        )
        .into_iter()
        .filter_map(|location| {
          self
            .convert_module_reference_to_url(&state.0.heap, &location.module_reference)
            .map(|uri| Location { uri, range: samlang_loc_to_lsp_range(&location) })
        })
        .collect(),
      ))
    }

    async fn code_action(&self, params: CodeActionParams) -> Result<Option<CodeActionResponse>> {
      self.client.log_message(MessageType::INFO, "[lsp] code_action").await;
      let state = self.state.read().await;
      let location = samlang_ast::Location {
        module_reference: self
          .convert_url_to_module_reference_readonly(&state.0.heap, &params.text_document.uri),
        start: lsp_pos_to_samlang_pos(params.range.start),
        end: lsp_pos_to_samlang_pos(params.range.end),
      };
      Ok(Some(
        samlang_services::rewrite::code_actions(&state.0, location)
          .into_iter()
          .map(|code_action| match code_action {
            samlang_services::rewrite::CodeAction::Quickfix { title, edits } => {
              CodeActionOrCommand::CodeAction(CodeAction {
                title,
                kind: Some(CodeActionKind::QUICKFIX),
                diagnostics: None,
                edit: Some(WorkspaceEdit {
                  changes: Some(HashMap::from([(
                    params.text_document.uri.clone(),
                    edits
                      .into_iter()
                      .map(|(loc, new_text)| TextEdit {
                        range: samlang_loc_to_lsp_range(&loc),
                        new_text,
                      })
                      .collect(),
                  )])),
                  document_changes: None,
                  change_annotations: None,
                }),
                command: None,
                is_preferred: None,
                disabled: None,
                data: None,
              })
            }
          })
          .collect(),
      ))
    }

    async fn formatting(&self, params: DocumentFormattingParams) -> Result<Option<Vec<TextEdit>>> {
      self.client.log_message(MessageType::INFO, "[lsp] formatting").await;
      let state = self.state.read().await;
      let mod_ref =
        self.convert_url_to_module_reference_readonly(&state.0.heap, &params.text_document.uri);
      Ok(
        samlang_services::rewrite::format_entire_document(&state.0, &mod_ref)
          .map(|new_text| vec![TextEdit { range: ENTIRE_DOCUMENT_RANGE, new_text }]),
      )
    }

    async fn rename(&self, params: RenameParams) -> Result<Option<WorkspaceEdit>> {
      self.client.log_message(MessageType::INFO, "[lsp] rename").await;
      let mut state = self.state.write().await;
      let mod_ref = self.convert_url_to_module_reference_readonly(
        &state.0.heap,
        &params.text_document_position.text_document.uri,
      );
      Ok(
        samlang_services::rewrite::rename(
          &mut state.0,
          &mod_ref,
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

    async fn folding_range(&self, params: FoldingRangeParams) -> Result<Option<Vec<FoldingRange>>> {
      self.client.log_message(MessageType::INFO, "[lsp] folding_range").await;
      let state = self.state.read().await;
      let mod_ref =
        self.convert_url_to_module_reference_readonly(&state.0.heap, &params.text_document.uri);
      Ok(samlang_services::query::folding_ranges(&state.0, &mod_ref).map(|ranges| {
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
      }))
    }
  }
}

mod runners {
  use super::*;
  #[cfg(not(release))]
  use tower_lsp::{LspService, Server};

  pub(super) fn format(need_help: bool, need_check: bool) {
    if need_help {
      println!("samlang format: Format your codebase according to sconfig.json.")
    } else {
      let configuration = utils::get_configuration();
      let heap = &mut samlang_heap::Heap::new();
      let mut has_violation = false;
      for (module_reference, source) in utils::collect_sources(&configuration, heap) {
        let path =
          PathBuf::from(&configuration.source_directory).join(module_reference.to_filename(heap));
        let formatted = samlang_core::reformat_source(&source);
        if need_check {
          if formatted != source {
            eprintln!("Changed: {}", path.to_str().unwrap());
            has_violation = true;
          }
          fs::write(&path, formatted).unwrap();
        } else {
          fs::write(&path, formatted).unwrap();
          eprintln!("Formatted: {}", path.to_str().unwrap())
        }
      }
      if has_violation {
        std::process::exit(1);
      }
    }
  }

  fn compile_single(enable_profiling: bool) {
    samlang_profiling::measure_time(enable_profiling, "Full run", || {
      let configuration = utils::get_configuration();
      let heap = &mut samlang_heap::Heap::new();
      let entry_module_references = configuration
        .entry_points
        .iter()
        .map(|entry_point| {
          heap.alloc_module_reference_from_string_vec(
            entry_point.split('.').map(|s| s.to_string()).collect(),
          )
        })
        .collect::<Vec<_>>();
      let collected_sources =
        samlang_profiling::measure_time(enable_profiling, "Collecting sources", || {
          utils::collect_sources(&configuration, heap)
        });
      match samlang_core::compile_sources(
        heap,
        collected_sources,
        entry_module_references,
        enable_profiling,
      ) {
        Ok(samlang_core::SourcesCompilationResult { text_code_results, wasm_file }) => {
          if fs::create_dir_all(&configuration.output_directory).is_ok() {
            for (file, content) in text_code_results {
              fs::write(PathBuf::from(&configuration.output_directory).join(file), content)
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
          eprintln!("{errors}");
          std::process::exit(1)
        }
      }
    });
  }

  pub(super) fn compile(need_help: bool) {
    if need_help {
      println!("samlang compile: Compile your codebase according to sconfig.json.")
    } else {
      let benchmark_repeat =
        std::env::var("BENCHMARK_REPEAT").ok().and_then(|s| s.parse::<usize>().ok()).unwrap_or(1);
      let enable_profiling = std::env::var("PROFILE").is_ok();
      for _ in 0..benchmark_repeat {
        compile_single(enable_profiling);
      }
    }
  }

  #[cfg(release)]
  pub(super) fn e2e(_need_help: bool) {
    eprintln!("samlang e2e: Compile samlang under test mode to make this useful.");
    std::process::exit(1)
  }

  #[cfg(not(release))]
  pub(super) fn e2e(need_help: bool) {
    if need_help {
      println!("samlang e2e: Run e2e tests.");
      return;
    }
    let expected = include_str!("../../../tests/snapshot.txt");

    eprintln!("==================== Step 1 ====================");
    eprintln!("Formatting samlang source code...");
    format(/* need_help */ false, /* need_check */ true);
    eprintln!("Formatted samlang source code.");

    eprintln!("==================== Step 2 ====================");
    eprintln!("Compiling samlang source code...");
    compile_single(/* enable_profiling */ false);
    eprintln!("Compiled samlang source code.");

    eprintln!("==================== Step 3 ====================");
    eprintln!("Checking generated TS code...");
    pretty_assertions::assert_eq!(
      expected,
      String::from_utf8(
        std::process::Command::new("bun")
          .args(["out/tests.AllTests.ts"])
          .output()
          .expect("JS execution failure")
          .stdout,
      )
      .unwrap()
    );
    eprintln!("Generated TS code is good.");

    eprintln!("==================== Step 4 ====================");
    eprintln!("Checking generated WebAssembly code...");
    pretty_assertions::assert_eq!(
      expected,
      String::from_utf8(
        std::process::Command::new("node")
          .args(["out/tests.AllTests.wasm.js"])
          .output()
          .expect("WASM/JS execution failure")
          .stdout,
      )
      .unwrap()
    );
    eprintln!("Generated WebAssembly code is good.");

    eprintln!("==================== PASSED ====================")
  }

  pub(super) async fn lsp(need_help: bool) {
    if need_help {
      println!("samlang lsp: Start a language server according to sconfig.json.")
    } else {
      let configuration = utils::get_configuration();
      if let Ok(absolute_source_path) =
        fs::canonicalize(PathBuf::from(&configuration.source_directory))
      {
        let mut heap = samlang_heap::Heap::new();
        let collected_sources = utils::collect_sources(&configuration, &mut heap);
        let state = samlang_services::server_state::ServerState::new(heap, true, collected_sources);
        let (service, socket) =
          LspService::new(|client| lsp::Backend::new(client, absolute_source_path, state));

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
      "format" => runners::format(does_need_help, arguments.contains(&"--check".to_string())),
      "compile" => runners::compile(does_need_help),
      "e2e" => runners::e2e(does_need_help),
      "lsp" => runners::lsp(does_need_help).await,
      _ => runners::help(),
    }
  }
}
