use super::{
  dep_graph::DependencyGraph,
  gc::perform_gc_after_recheck,
  global_searcher::search_modules_globally,
  location_cover::{search_module_locally, LocationCoverSearchResult},
  variable_definition::{apply_renaming, VariableDefinitionLookup},
};
use crate::{
  ast::{
    source::{
      expr, ClassMemberDeclaration, CommentKind, CommentReference, CommentStore, FieldDefinition,
      Module, Toplevel, TypeDefinition,
    },
    Location, Position,
  },
  checker::{
    build_module_signature,
    type_::{
      FunctionType, GlobalSignature, ISourceType, InterfaceSignature, MemberSignature, Type,
    },
    type_check_module, type_check_sources,
  },
  common::{Heap, ModuleReference, PStr},
  errors::{CompileTimeError, ErrorSet},
  measure_time,
  parser::parse_source_module_from_text,
  printer,
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

#[derive(Debug, PartialEq, Eq)]
pub enum CompletionItemKind {
  Method = 2,
  Function = 3,
  Field = 5,
}

#[derive(Debug, PartialEq, Eq)]
pub enum InsertTextFormat {
  PlainText = 1,
  Snippet = 2,
}

#[derive(Debug, PartialEq, Eq)]
pub struct TypeQueryContent {
  pub language: &'static str,
  pub value: String,
}

pub struct TypeQueryResult {
  pub contents: Vec<TypeQueryContent>,
  pub location: Location,
}

#[derive(Debug, PartialEq, Eq)]
pub struct AutoCompletionItem {
  pub label: String,
  pub insert_text: String,
  pub insert_text_format: InsertTextFormat,
  pub kind: CompletionItemKind,
  pub detail: String,
}

fn get_last_doc_comment(
  comment_store: &CommentStore,
  comment_ref: CommentReference,
) -> Option<PStr> {
  comment_store.get(comment_ref).iter().rev().find(|c| c.kind == CommentKind::DOC).map(|c| c.text)
}

pub struct LanguageServices {
  pub heap: Heap,
  enable_profiling: bool,
  parsed_modules: HashMap<ModuleReference, Module<()>>,
  dep_graph: DependencyGraph,
  checked_modules: HashMap<ModuleReference, Module<Rc<Type>>>,
  global_cx: GlobalSignature,
  errors: HashMap<ModuleReference, Vec<CompileTimeError>>,
}

impl LanguageServices {
  // Section 1: Init

  pub fn new(
    mut heap: Heap,
    enable_profiling: bool,
    source_handles: Vec<(ModuleReference, String)>,
  ) -> LanguageServices {
    measure_time(enable_profiling, "LSP Init", || {
      let mut error_set = ErrorSet::new();
      let parsed_modules = source_handles
        .iter()
        .map(|(mod_ref, text)| {
          (*mod_ref, parse_source_module_from_text(text, *mod_ref, &mut heap, &mut error_set))
        })
        .collect::<HashMap<_, _>>();
      let dep_graph = DependencyGraph::new(&parsed_modules);
      let (checked_modules, global_cx) =
        type_check_sources(&parsed_modules, &mut heap, &mut error_set);
      let errors = Self::group_errors(error_set);
      LanguageServices {
        heap,
        enable_profiling,
        parsed_modules,
        dep_graph,
        checked_modules,
        global_cx,
        errors,
      }
    })
  }

  fn group_errors(error_set: ErrorSet) -> HashMap<ModuleReference, Vec<CompileTimeError>> {
    let grouped = error_set.errors().into_iter().group_by(|e| e.location.module_reference);
    grouped.into_iter().map(|(k, v)| (k, v.cloned().collect_vec())).collect::<HashMap<_, _>>()
  }

  /// Preconditions:
  /// - Parsed modules updated
  /// - Global context updated
  /// - Dependency graph updated
  /// - recheck_set is the conservative estimate of moduled need to recheck
  fn recheck(&mut self, mut error_set: ErrorSet, recheck_set: &HashSet<ModuleReference>) {
    // Type Checking
    for recheck_mod_ref in recheck_set {
      if let Some(parsed) = self.parsed_modules.get(recheck_mod_ref) {
        let checked =
          type_check_module(*recheck_mod_ref, parsed, &self.global_cx, &self.heap, &mut error_set);
        self.checked_modules.insert(*recheck_mod_ref, checked);
      }
    }

    // Collating Errors
    let mut grouped_errors = Self::group_errors(error_set);
    for rechecked_module in recheck_set {
      if !grouped_errors.contains_key(rechecked_module) {
        grouped_errors.insert(*rechecked_module, vec![]);
      }
    }
    for (mod_ref, mod_scoped_errors) in grouped_errors {
      self.errors.insert(mod_ref, mod_scoped_errors);
    }

    // GC
    measure_time(self.enable_profiling, "GC", || {
      perform_gc_after_recheck(
        &mut self.heap,
        &self.checked_modules,
        self.checked_modules.keys().copied().collect(),
      )
    });
  }

  // Section 2: Getters and Setters

  pub fn all_modules(&self) -> Vec<&ModuleReference> {
    self.parsed_modules.keys().into_iter().collect()
  }

  pub fn get_errors(&self, module_reference: &ModuleReference) -> &[CompileTimeError] {
    if let Some(errors) = self.errors.get(module_reference) {
      errors
    } else {
      &[]
    }
  }

  pub fn get_error_strings(&self, module_reference: &ModuleReference) -> Vec<String> {
    self.get_errors(module_reference).iter().map(|e| e.pretty_print(&self.heap)).collect()
  }

  pub fn update(&mut self, updates: Vec<(ModuleReference, String)>) {
    let mut error_set = ErrorSet::new();
    let initial_update_set = updates.iter().map(|(m, _)| *m).collect::<HashSet<_>>();
    for (mod_ref, source_code) in updates {
      let parsed =
        parse_source_module_from_text(&source_code, mod_ref, &mut self.heap, &mut error_set);
      self.global_cx.insert(mod_ref, build_module_signature(mod_ref, &parsed, &self.heap));
      self.parsed_modules.insert(mod_ref, parsed);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    let recheck_set = self.dep_graph.affected_set(initial_update_set);
    self.recheck(error_set, &recheck_set);
  }

  pub fn rename_module(&mut self, renames: Vec<(ModuleReference, ModuleReference)>) {
    let recheck_set = self
      .dep_graph
      .affected_set(renames.iter().flat_map(|(a, b)| vec![*a, *b].into_iter()).collect());
    for (old_mod_ref, new_mod_ref) in renames {
      if let Some(parsed) = self.parsed_modules.remove(&old_mod_ref) {
        self.parsed_modules.insert(new_mod_ref, parsed);
        let mod_cx = self.global_cx.remove(&old_mod_ref).unwrap();
        self.global_cx.insert(new_mod_ref, mod_cx);
      }
      self.checked_modules.remove(&old_mod_ref);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    self.recheck(ErrorSet::new(), &recheck_set);
  }

  pub fn remove(&mut self, module_references: &[ModuleReference]) {
    let recheck_set = self.dep_graph.affected_set(module_references.iter().copied().collect());
    for mod_ref in module_references {
      self.parsed_modules.remove(mod_ref);
      self.checked_modules.remove(mod_ref);
      self.global_cx.remove(mod_ref);
    }
    self.dep_graph = DependencyGraph::new(&self.parsed_modules);
    self.recheck(ErrorSet::new(), &recheck_set);
  }

  // Section 3: LSP Providers

  fn search_at_pos(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<LocationCoverSearchResult> {
    search_module_locally(*module_reference, self.checked_modules.get(module_reference)?, position)
  }

  pub fn query_for_hover(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<TypeQueryResult> {
    match self.search_at_pos(module_reference, position)? {
      LocationCoverSearchResult::PropertyName(
        loc,
        fetched_function_module_reference,
        class_name,
        field_name,
      ) => {
        let relevant_field =
          self.find_field_def(&fetched_function_module_reference, &class_name, &field_name)?;
        let type_content = TypeQueryContent {
          language: "samlang",
          value: Type::from_annotation(&relevant_field.annotation).pretty_print(&self.heap),
        };
        Some(self.query_result_with_optional_document(
          loc,
          type_content,
          get_last_doc_comment(
            &self.checked_modules.get(&fetched_function_module_reference).unwrap().comment_store,
            relevant_field.name.associated_comments,
          ),
        ))
      }
      LocationCoverSearchResult::InterfaceMemberName(
        loc,
        fetched_function_module_reference,
        class_name,
        fn_name,
        _,
      ) => {
        let relevant_fn =
          self.find_class_member(&fetched_function_module_reference, &class_name, &fn_name)?;
        let type_content = TypeQueryContent {
          language: "samlang",
          value: FunctionType::from_annotation(&relevant_fn.type_).pretty_print(&self.heap),
        };
        Some(self.query_result_with_optional_document(
          loc,
          type_content,
          get_last_doc_comment(
            &self.checked_modules.get(&fetched_function_module_reference).unwrap().comment_store,
            relevant_fn.associated_comments,
          ),
        ))
      }
      LocationCoverSearchResult::ToplevelName(loc, module_reference, class_name) => {
        let type_content = TypeQueryContent {
          language: "samlang",
          value: format!("class {}", class_name.as_str(&self.heap)),
        };
        Some(self.query_result_with_optional_document(
          loc,
          type_content,
          self.find_toplevel(&module_reference, &class_name).and_then(|toplevel| {
            get_last_doc_comment(
              &self.checked_modules.get(&module_reference).unwrap().comment_store,
              toplevel.associated_comments(),
            )
          }),
        ))
      }
      LocationCoverSearchResult::Expression(expression) => Some(TypeQueryResult {
        contents: vec![TypeQueryContent {
          language: "samlang",
          value: expression.type_().pretty_print(&self.heap),
        }],
        location: expression.loc(),
      }),
      LocationCoverSearchResult::TypedName(location, _, type_) => Some(TypeQueryResult {
        contents: vec![TypeQueryContent {
          language: "samlang",
          value: type_.pretty_print(&self.heap),
        }],
        location,
      }),
    }
  }

  fn find_toplevel(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&Toplevel<Rc<Type>>> {
    self
      .checked_modules
      .get(module_reference)?
      .toplevels
      .iter()
      .find(|it| it.name().name.eq(class_name))
  }

  fn find_type_def(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&TypeDefinition> {
    self.find_toplevel(module_reference, class_name).and_then(|it| it.type_definition())
  }

  fn find_field_def(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
    field_name: &PStr,
  ) -> Option<&FieldDefinition> {
    self
      .find_type_def(module_reference, class_name)
      .and_then(|it| it.as_struct())
      .and_then(|(_, fields)| fields.iter().find(|it| it.name.name.eq(field_name)))
  }

  fn find_class_member(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
    member_name: &PStr,
  ) -> Option<&ClassMemberDeclaration> {
    self
      .find_toplevel(module_reference, class_name)?
      .members_iter()
      .find(|it| it.name.name.eq(member_name))
  }

  fn query_result_with_optional_document(
    &self,
    location: Location,
    type_content: TypeQueryContent,
    document_opt: Option<PStr>,
  ) -> TypeQueryResult {
    let contents = if let Some(document) = document_opt {
      vec![
        type_content,
        TypeQueryContent { language: "markdown", value: document.as_str(&self.heap).to_string() },
      ]
    } else {
      vec![type_content]
    };
    TypeQueryResult { contents, location }
  }

  pub fn query_folding_ranges(&self, module_reference: &ModuleReference) -> Option<Vec<Location>> {
    let module = self.checked_modules.get(module_reference)?;
    Some(
      module
        .toplevels
        .iter()
        .flat_map(|toplevel| {
          toplevel.members_iter().map(|member| member.loc).chain(vec![toplevel.loc()])
        })
        .collect(),
    )
  }

  pub fn query_all_references(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Vec<Location> {
    self
      .query_all_references_opt(module_reference, position)
      .unwrap_or(vec![])
      .into_iter()
      .sorted()
      .dedup()
      .collect()
  }

  fn query_all_references_opt(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Vec<Location>> {
    match search_module_locally(
      *module_reference,
      self.checked_modules.get(module_reference)?,
      position,
    )? {
      LocationCoverSearchResult::Expression(
        expr::E::Literal(_, _)
        | expr::E::ClassFn(_)
        | expr::E::FieldAccess(_)
        | expr::E::MethodAccess(_)
        | expr::E::Unary(_)
        | expr::E::Call(_)
        | expr::E::Binary(_)
        | expr::E::IfElse(_)
        | expr::E::Match(_)
        | expr::E::Lambda(_)
        | expr::E::Block(_),
      ) => None,
      LocationCoverSearchResult::PropertyName(_, mod_ref, class_name, field_name) => {
        Some(search_modules_globally(
          &self.checked_modules,
          &super::global_searcher::GlobalNameSearchRequest::Property(
            mod_ref, class_name, field_name,
          ),
        ))
      }
      LocationCoverSearchResult::InterfaceMemberName(
        _,
        mod_ref,
        class_name,
        member_name,
        is_method,
      ) => Some(search_modules_globally(
        &self.checked_modules,
        &super::global_searcher::GlobalNameSearchRequest::InterfaceMember(
          mod_ref,
          class_name,
          member_name,
          is_method,
        ),
      )),
      LocationCoverSearchResult::ToplevelName(_, mod_ref, class_name) => {
        Some(search_modules_globally(
          &self.checked_modules,
          &super::global_searcher::GlobalNameSearchRequest::Toplevel(mod_ref, class_name),
        ))
      }
      LocationCoverSearchResult::TypedName(loc, _, _) => {
        let module = self.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(&loc)
          .map(|it| it.all_locations())
      }
      LocationCoverSearchResult::Expression(expr::E::Id(expr::ExpressionCommon { loc, .. }, _)) => {
        let module = self.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(loc)
          .map(|it| it.all_locations())
      }
    }
  }

  pub fn query_definition_location(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Location> {
    match search_module_locally(
      *module_reference,
      self.checked_modules.get(module_reference)?,
      position,
    )? {
      LocationCoverSearchResult::Expression(
        expr::E::Literal(_, _)
        | expr::E::ClassFn(_)
        | expr::E::FieldAccess(_)
        | expr::E::MethodAccess(_)
        | expr::E::Unary(_)
        | expr::E::Call(_)
        | expr::E::Binary(_)
        | expr::E::IfElse(_)
        | expr::E::Match(_)
        | expr::E::Lambda(_)
        | expr::E::Block(_),
      ) => None,
      LocationCoverSearchResult::PropertyName(_, mod_ref, class_name, field_name) => {
        Some(self.find_field_def(&mod_ref, &class_name, &field_name)?.name.loc)
      }
      LocationCoverSearchResult::InterfaceMemberName(_, mod_ref, class_name, member_name, _) => {
        Some(self.find_class_member(&mod_ref, &class_name, &member_name)?.loc)
      }
      LocationCoverSearchResult::ToplevelName(_, mod_ref, class_name) => {
        Some(self.find_toplevel(&mod_ref, &class_name)?.loc())
      }
      LocationCoverSearchResult::TypedName(loc, _, _) => {
        let module = self.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(&loc)
          .map(|it| it.definition_location)
      }
      LocationCoverSearchResult::Expression(expr::E::Id(expr::ExpressionCommon { loc, .. }, _)) => {
        let module = self.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(loc)
          .map(|it| it.definition_location)
      }
    }
  }

  pub fn auto_complete(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Vec<AutoCompletionItem> {
    self.autocomplete_opt(module_reference, position).unwrap_or(vec![])
  }

  fn find_class_name(&self, module_reference: &ModuleReference, position: Position) -> PStr {
    let module = self.checked_modules.get(module_reference).unwrap();
    module
      .toplevels
      .iter()
      .find(|toplevel| toplevel.loc().contains_position(position))
      .unwrap()
      .name()
      .name
  }

  fn autocomplete_opt(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Vec<AutoCompletionItem>> {
    let (instance_mod_ref, instance_class_name) =
      match self.search_at_pos(module_reference, position)? {
        LocationCoverSearchResult::InterfaceMemberName(_, module_ref, class_name, _, false) => {
          return self.get_interface_type(&module_ref, &class_name).map(|cx| {
            cx.functions
              .iter()
              .map(|(name, info)| {
                self.get_completion_result_from_type_info(
                  name.as_str(&self.heap),
                  info,
                  CompletionItemKind::Function,
                )
              })
              .sorted_by_key(|r| r.label.to_string())
              .collect()
          });
        }
        LocationCoverSearchResult::InterfaceMemberName(_, module_ref, class_name, _, true) => {
          (module_ref, class_name)
        }
        LocationCoverSearchResult::Expression(expr::E::FieldAccess(e)) => {
          e.object.type_().as_id().map(|id_type| (id_type.module_reference, id_type.id))?
        }
        _ => return None,
      };
    let class_of_expr = self.find_class_name(module_reference, position);
    let relevant_interface_type =
      self.get_interface_type(&instance_mod_ref, &instance_class_name)?;
    let mut completion_results = vec![];
    let is_inside_class = class_of_expr.eq(&instance_class_name);
    match &relevant_interface_type.type_definition {
      Some(def) if is_inside_class && def.is_object => {
        for name in &def.names {
          let field_type = def.mappings.get(name).unwrap();
          completion_results.push(AutoCompletionItem {
            label: name.as_str(&self.heap).to_string(),
            insert_text: name.as_str(&self.heap).to_string(),
            insert_text_format: InsertTextFormat::PlainText,
            kind: CompletionItemKind::Field,
            detail: field_type.0.pretty_print(&self.heap),
          });
        }
      }
      _ => {}
    }
    for (name, info) in relevant_interface_type.methods.iter() {
      if is_inside_class || info.is_public {
        completion_results.push(self.get_completion_result_from_type_info(
          name.as_str(&self.heap),
          info,
          CompletionItemKind::Method,
        ));
      }
    }
    completion_results.sort_by_key(|r| r.label.to_string());
    Some(completion_results)
  }

  fn get_interface_type(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&InterfaceSignature> {
    self.global_cx.get(module_reference).and_then(|cx| cx.interfaces.get(class_name))
  }

  fn get_completion_result_from_type_info(
    &self,
    name: &str,
    type_information: &MemberSignature,
    kind: CompletionItemKind,
  ) -> AutoCompletionItem {
    let (insert_text, insert_text_format) =
      Self::get_insert_text(name, type_information.type_.argument_types.len());
    AutoCompletionItem {
      label: format!(
        "{}({}): {}",
        name,
        type_information
          .type_
          .argument_types
          .iter()
          .enumerate()
          .map(|(id, t)| format!("a{}: {}", id, t.pretty_print(&self.heap)))
          .join(", "),
        type_information.type_.return_type.pretty_print(&self.heap)
      ),
      insert_text,
      insert_text_format,
      kind,
      detail: self.pretty_print_type_info(type_information),
    }
  }

  fn pretty_print_type_info(&self, type_information: &MemberSignature) -> String {
    if type_information.type_parameters.is_empty() {
      type_information.type_.pretty_print(&self.heap)
    } else {
      format!(
        "<{}>({})",
        type_information.type_parameters.iter().map(|it| it.pretty_print(&self.heap)).join(", "),
        type_information.type_.pretty_print(&self.heap)
      )
    }
  }

  fn get_insert_text(name: &str, argument_length: usize) -> (String, InsertTextFormat) {
    if argument_length == 0 {
      (format!("{name}()"), InsertTextFormat::PlainText)
    } else {
      let mut items = vec![];
      for i in 0..argument_length {
        items.push(format!("${i}"));
      }
      (format!("{}({})${}", name, items.join(", "), argument_length), InsertTextFormat::Snippet)
    }
  }

  pub fn rename_variable(
    &mut self,
    module_reference: &ModuleReference,
    position: Position,
    new_name: &str,
  ) -> Option<String> {
    let trimmed_new_name = new_name.trim();
    if !(trimmed_new_name.starts_with(|c: char| c.is_ascii_lowercase())
      && trimmed_new_name.chars().all(|c: char| c.is_ascii_alphanumeric()))
    {
      return None;
    }
    let def_or_use_loc = match self.search_at_pos(module_reference, position) {
      Some(LocationCoverSearchResult::TypedName(loc, _, _)) => loc,
      Some(LocationCoverSearchResult::Expression(e)) => e.loc(),
      _ => return None,
    };

    let module = self.parsed_modules.get(module_reference).unwrap();
    let def_and_uses = VariableDefinitionLookup::new(&self.heap, module)
      .find_all_definition_and_uses(&def_or_use_loc)?;
    let renamed =
      apply_renaming(module, &def_and_uses, self.heap.alloc_string(new_name.to_string()));
    Some(printer::pretty_print_source_module(&self.heap, 100, &renamed))
  }

  pub fn format_entire_document(&self, module_reference: &ModuleReference) -> Option<String> {
    let module = self.parsed_modules.get(module_reference)?;
    let errors = self.errors.get(module_reference).unwrap();
    if errors.iter().any(|e| e.is_syntax_error()) {
      None
    } else {
      Some(printer::pretty_print_source_module(&self.heap, 100, module))
    }
  }
}
