use super::{
  global_searcher::search_modules_globally,
  location_cover::{search_module_locally, LocationCoverSearchResult},
  server_state::ServerState,
  variable_definition::{apply_renaming, VariableDefinitionLookup},
};
use crate::{
  ast::{
    source::{
      expr, ClassMemberDeclaration, CommentKind, CommentReference, CommentStore, FieldDefinition,
      Id, ModuleMembersImport, Toplevel, TypeDefinition, NO_COMMENT_REFERENCE,
    },
    Location, Position,
  },
  checker::{
    type_::{FunctionType, ISourceType, InterfaceSignature, MemberSignature, Type},
    type_check_module,
  },
  common::{ModuleReference, PStr},
  errors::{ErrorDetail, ErrorSet},
  printer,
};
use itertools::Itertools;
use std::rc::Rc;

mod state_searcher_utils {
  use super::*;

  pub(super) fn search_at_pos<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    position: Position,
    stop_at_call: bool,
  ) -> Option<LocationCoverSearchResult<'a>> {
    search_module_locally(
      *module_reference,
      state.checked_modules.get(module_reference)?,
      position,
      stop_at_call,
    )
  }

  pub(super) fn find_toplevel<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&'a Toplevel<Rc<Type>>> {
    state
      .checked_modules
      .get(module_reference)?
      .toplevels
      .iter()
      .find(|it| it.name().name.eq(class_name))
  }

  pub(super) fn find_interface_type<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&'a InterfaceSignature> {
    state.global_cx.get(module_reference).and_then(|cx| cx.interfaces.get(class_name))
  }

  pub(super) fn find_type_def<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&'a TypeDefinition> {
    find_toplevel(state, module_reference, class_name).and_then(|it| it.type_definition())
  }

  pub(super) fn find_field_def<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    class_name: &PStr,
    field_name: &PStr,
  ) -> Option<&'a FieldDefinition> {
    find_type_def(state, module_reference, class_name)
      .and_then(|it| it.as_struct())
      .and_then(|(_, fields)| fields.iter().find(|it| it.name.name.eq(field_name)))
  }

  pub(super) fn find_class_member<'a>(
    state: &'a ServerState,
    module_reference: &ModuleReference,
    class_name: &PStr,
    member_name: &PStr,
  ) -> Option<&'a ClassMemberDeclaration> {
    find_toplevel(state, module_reference, class_name)?
      .members_iter()
      .find(|it| it.name.name.eq(member_name))
  }

  pub(super) fn find_class_name(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> PStr {
    let module = state.checked_modules.get(module_reference).unwrap();
    module
      .toplevels
      .iter()
      .find(|toplevel| toplevel.loc().contains_position(position))
      .unwrap()
      .name()
      .name
  }
}

pub mod query {
  use super::*;

  pub struct TypeQueryContent {
    pub language: &'static str,
    pub value: String,
  }

  impl ToString for TypeQueryContent {
    fn to_string(&self) -> String {
      format!("{} [lang={}]", self.value, self.language)
    }
  }

  pub struct TypeQueryResult {
    pub contents: Vec<TypeQueryContent>,
    pub location: Location,
  }

  pub struct SignatureHelpResult {
    pub label: String,
    pub parameters: Vec<String>,
    pub active_parameter: usize,
  }

  impl ToString for SignatureHelpResult {
    fn to_string(&self) -> String {
      format!(
        "{} [params={}, active={}]",
        self.label,
        self.parameters.join(","),
        self.active_parameter
      )
    }
  }

  pub fn hover(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<TypeQueryResult> {
    match state_searcher_utils::search_at_pos(state, module_reference, position, false)? {
      LocationCoverSearchResult::PropertyName(
        loc,
        fetched_function_module_reference,
        class_name,
        field_name,
      ) => {
        let relevant_field = state_searcher_utils::find_field_def(
          state,
          &fetched_function_module_reference,
          &class_name,
          &field_name,
        )?;
        let type_content = TypeQueryContent {
          language: "samlang",
          value: Type::from_annotation(&relevant_field.annotation).pretty_print(&state.heap),
        };
        Some(query_result_with_optional_document(
          state,
          loc,
          type_content,
          get_last_doc_comment(
            &state.checked_modules.get(&fetched_function_module_reference).unwrap().comment_store,
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
        let relevant_fn = state_searcher_utils::find_class_member(
          state,
          &fetched_function_module_reference,
          &class_name,
          &fn_name,
        )
        .unwrap();
        let type_content = TypeQueryContent {
          language: "samlang",
          value: FunctionType::from_annotation(&relevant_fn.type_).pretty_print(&state.heap),
        };
        Some(query_result_with_optional_document(
          state,
          loc,
          type_content,
          get_last_doc_comment(
            &state.checked_modules.get(&fetched_function_module_reference).unwrap().comment_store,
            relevant_fn.associated_comments,
          ),
        ))
      }
      LocationCoverSearchResult::ToplevelName(loc, module_reference, class_name) => {
        let type_content = TypeQueryContent {
          language: "samlang",
          value: format!("class {}", class_name.as_str(&state.heap)),
        };
        Some(query_result_with_optional_document(
          state,
          loc,
          type_content,
          state_searcher_utils::find_toplevel(state, &module_reference, &class_name).and_then(
            |toplevel| {
              get_last_doc_comment(
                &state.checked_modules.get(&module_reference).unwrap().comment_store,
                toplevel.associated_comments(),
              )
            },
          ),
        ))
      }
      LocationCoverSearchResult::Expression(expression) => Some(TypeQueryResult {
        contents: vec![TypeQueryContent {
          language: "samlang",
          value: expression.type_().pretty_print(&state.heap),
        }],
        location: expression.loc(),
      }),
      LocationCoverSearchResult::TypedName(location, _, type_) => Some(TypeQueryResult {
        contents: vec![TypeQueryContent {
          language: "samlang",
          value: type_.pretty_print(&state.heap),
        }],
        location,
      }),
    }
  }

  fn get_last_doc_comment(
    comment_store: &CommentStore,
    comment_ref: CommentReference,
  ) -> Option<PStr> {
    comment_store.get(comment_ref).iter().rev().find(|c| c.kind == CommentKind::DOC).map(|c| c.text)
  }

  fn query_result_with_optional_document(
    state: &ServerState,
    location: Location,
    type_content: TypeQueryContent,
    document_opt: Option<PStr>,
  ) -> TypeQueryResult {
    let contents = if let Some(document) = document_opt {
      vec![
        type_content,
        TypeQueryContent { language: "markdown", value: document.as_str(&state.heap).to_string() },
      ]
    } else {
      vec![type_content]
    };
    TypeQueryResult { contents, location }
  }

  pub fn folding_ranges(
    state: &ServerState,
    module_reference: &ModuleReference,
  ) -> Option<Vec<Location>> {
    let module = state.checked_modules.get(module_reference)?;
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

  pub fn all_references(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Vec<Location> {
    all_references_opt(state, module_reference, position)
      .unwrap_or(vec![])
      .into_iter()
      .sorted()
      .dedup()
      .collect()
  }

  fn all_references_opt(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Vec<Location>> {
    match search_module_locally(
      *module_reference,
      state.checked_modules.get(module_reference)?,
      position,
      false,
    )? {
      LocationCoverSearchResult::Expression(
        expr::E::Literal(_, _)
        | expr::E::ClassId(_, _, _)
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
          &state.checked_modules,
          &super::super::global_searcher::GlobalNameSearchRequest::Property(
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
        &state.checked_modules,
        &super::super::global_searcher::GlobalNameSearchRequest::InterfaceMember(
          mod_ref,
          class_name,
          member_name,
          is_method,
        ),
      )),
      LocationCoverSearchResult::ToplevelName(_, mod_ref, class_name) => {
        Some(search_modules_globally(
          &state.checked_modules,
          &super::super::global_searcher::GlobalNameSearchRequest::Toplevel(mod_ref, class_name),
        ))
      }
      LocationCoverSearchResult::TypedName(loc, _, _) => {
        let module = state.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(module)
          .find_all_definition_and_uses(&loc)
          .map(|it| it.all_locations())
      }
      LocationCoverSearchResult::Expression(expr::E::LocalId(
        expr::ExpressionCommon { loc, .. },
        _,
      )) => {
        let module = state.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(module)
          .find_all_definition_and_uses(loc)
          .map(|it| it.all_locations())
      }
    }
  }

  pub fn definition_location(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Location> {
    match state_searcher_utils::search_at_pos(state, module_reference, position, false)? {
      LocationCoverSearchResult::Expression(
        expr::E::Literal(_, _)
        | expr::E::ClassId(_, _, _)
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
      LocationCoverSearchResult::PropertyName(_, mod_ref, class_name, field_name) => Some(
        state_searcher_utils::find_field_def(state, &mod_ref, &class_name, &field_name)?.name.loc,
      ),
      LocationCoverSearchResult::InterfaceMemberName(_, mod_ref, class_name, member_name, _) => {
        Some(
          state_searcher_utils::find_class_member(state, &mod_ref, &class_name, &member_name)?.loc,
        )
      }
      LocationCoverSearchResult::ToplevelName(_, mod_ref, class_name) => {
        Some(state_searcher_utils::find_toplevel(state, &mod_ref, &class_name)?.loc())
      }
      LocationCoverSearchResult::TypedName(loc, _, _) => {
        let module = state.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(module)
          .find_all_definition_and_uses(&loc)
          .map(|it| it.definition_location)
      }
      LocationCoverSearchResult::Expression(expr::E::LocalId(
        expr::ExpressionCommon { loc, .. },
        _,
      )) => {
        let module = state.parsed_modules.get(module_reference).unwrap();
        VariableDefinitionLookup::new(module)
          .find_all_definition_and_uses(loc)
          .map(|it| it.definition_location)
      }
    }
  }

  pub fn signature_help(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<SignatureHelpResult> {
    match state_searcher_utils::search_at_pos(state, module_reference, position, true) {
      Some(LocationCoverSearchResult::Expression(expr::E::Call(call)))
        if !call.callee.loc().contains_position(position) =>
      {
        let signature = call.callee.type_().as_fn()?;
        let mut active_parameter = 0;
        for (i, e) in call.arguments.iter().enumerate() {
          if e.loc().contains_position(position) {
            active_parameter = i;
          }
        }
        if let Some(last_arg) = call.arguments.last() {
          if last_arg.loc().end.lt(&position)
            && call.arguments.len() < signature.argument_types.len()
          {
            active_parameter = call.arguments.len();
          }
        }
        let label = format!(
          "({}) -> {}",
          signature
            .argument_types
            .iter()
            .enumerate()
            .map(|(i, t)| format!("a{}: {}", i, t.pretty_print(&state.heap)))
            .join(", "),
          signature.return_type.pretty_print(&state.heap)
        );
        let parameters = signature
          .argument_types
          .iter()
          .enumerate()
          .map(|(i, t)| format!("a{}: {}", i, t.pretty_print(&state.heap)))
          .collect_vec();
        Some(SignatureHelpResult { label, parameters, active_parameter })
      }
      _ => None,
    }
  }
}

pub mod rewrite {
  use crate::services::ast_differ::compute_module_diff_edits;

  use super::*;

  #[derive(Debug, PartialEq, Eq)]
  pub enum CodeAction {
    Quickfix { title: String, edits: Vec<(Location, String)> },
  }

  pub fn format_entire_document(
    state: &ServerState,
    module_reference: &ModuleReference,
  ) -> Option<String> {
    let module = state.parsed_modules.get(module_reference)?;
    let errors = state.errors.get(module_reference).unwrap();
    if errors.iter().any(|e| e.is_syntax_error()) {
      None
    } else {
      Some(printer::pretty_print_source_module(&state.heap, 100, module))
    }
  }

  pub fn rename(
    state: &mut ServerState,
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
    let def_or_use_loc =
      match state_searcher_utils::search_at_pos(state, module_reference, position, false) {
        Some(LocationCoverSearchResult::TypedName(loc, _, _)) => loc,
        Some(LocationCoverSearchResult::Expression(e)) => e.loc(),
        _ => return None,
      };

    let module = state.parsed_modules.get(module_reference).unwrap();
    let def_and_uses =
      VariableDefinitionLookup::new(module).find_all_definition_and_uses(&def_or_use_loc)?;
    let renamed =
      apply_renaming(module, &def_and_uses, state.heap.alloc_string(new_name.to_string()));
    Some(printer::pretty_print_source_module(&state.heap, 100, &renamed))
  }

  pub fn code_actions(state: &ServerState, location: Location) -> Vec<CodeAction> {
    let mut actions = vec![];
    for error in state.errors.get(&location.module_reference).iter().flat_map(|it| it.iter()) {
      match &error.detail {
        ErrorDetail::CannotResolveClass { module_reference, name }
          if error.location.contains(&location)
            && module_reference.eq(&error.location.module_reference) =>
        {
          for (mod_ref, mod_cx) in state.global_cx.iter() {
            if mod_cx.interfaces.contains_key(name) {
              actions.push(generate_auto_import_code_action(
                state,
                *module_reference,
                location,
                *mod_ref,
                *name,
              ))
            }
          }
        }
        _ => {}
      }
    }
    actions
  }

  fn generate_auto_import_code_action(
    state: &ServerState,
    module_reference: ModuleReference,
    dummy_location: Location,
    imported_module: ModuleReference,
    imported_member: PStr,
  ) -> CodeAction {
    CodeAction::Quickfix {
      title: format!(
        "Import `{}` from `{}`",
        imported_member.as_str(&state.heap),
        imported_module.pretty_print(&state.heap)
      ),
      edits: generate_auto_import_edits(
        state,
        module_reference,
        dummy_location,
        imported_module,
        imported_member,
      ),
    }
  }

  pub(super) fn generate_auto_import_edits(
    state: &ServerState,
    module_reference: ModuleReference,
    dummy_location: Location,
    imported_module: ModuleReference,
    imported_member: PStr,
  ) -> Vec<(Location, String)> {
    let ast = state.parsed_modules.get(&module_reference).unwrap();
    let mut changed_ast = ast.clone();
    changed_ast.imports.push(ModuleMembersImport {
      loc: dummy_location,
      imported_members: vec![Id {
        loc: dummy_location,
        associated_comments: NO_COMMENT_REFERENCE,
        name: imported_member,
      }],
      imported_module,
      imported_module_loc: dummy_location,
    });
    compute_module_diff_edits(&state.heap, module_reference, ast, &changed_ast)
  }
}

pub mod completion {
  use std::collections::HashSet;

  use crate::checker::type_::TypeDefinitionSignature;

  use super::*;

  #[derive(Debug)]
  pub enum CompletionItemKind {
    Method = 2,
    Function = 3,
    Field = 5,
    Variable = 6,
    Class = 7,
    Interface = 8,
  }

  pub struct AutoCompletionItem {
    pub label: String,
    pub insert_text: String,
    pub kind: CompletionItemKind,
    pub detail: String,
    pub additional_edits: Vec<(Location, String)>,
  }

  impl ToString for AutoCompletionItem {
    fn to_string(&self) -> String {
      format!("{} [kind={:?}, detail={}]", self.label, self.kind, self.detail)
    }
  }

  pub fn auto_complete(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Vec<AutoCompletionItem> {
    autocomplete_opt(state, module_reference, position).unwrap_or(vec![])
  }

  fn autocomplete_opt(
    state: &ServerState,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Vec<AutoCompletionItem>> {
    let (instance_mod_ref, instance_class_name) =
      match state_searcher_utils::search_at_pos(state, module_reference, position, false)? {
        LocationCoverSearchResult::InterfaceMemberName(_, module_ref, class_name, _, false) => {
          return state_searcher_utils::find_interface_type(state, &module_ref, &class_name).map(
            |cx| {
              cx.functions
                .iter()
                .map(|(name, info)| {
                  get_completion_result_from_type_info(
                    state,
                    name.as_str(&state.heap),
                    info,
                    CompletionItemKind::Function,
                  )
                })
                .sorted_by_key(|r| r.label.to_string())
                .collect()
            },
          );
        }
        LocationCoverSearchResult::Expression(expr::E::LocalId(_, Id { .. })) => {
          let parsed = state.parsed_modules.get(module_reference).unwrap();
          let (_, local_cx) = type_check_module(
            *module_reference,
            parsed,
            &state.global_cx,
            &state.heap,
            &mut ErrorSet::new(),
          );
          return Some(
            local_cx
              .possibly_in_scope_local_variables(position)
              .into_iter()
              .map(|(n, t)| {
                let name = n.as_str(&state.heap);
                AutoCompletionItem {
                  label: name.to_string(),
                  insert_text: name.to_string(),
                  kind: CompletionItemKind::Variable,
                  detail: t.pretty_print(&state.heap),
                  additional_edits: vec![],
                }
              })
              .collect(),
          );
        }
        LocationCoverSearchResult::ToplevelName(_, _, _) => {
          let ast = state.checked_modules.get(module_reference).unwrap();
          let available_names = ast
            .imports
            .iter()
            .flat_map(|it| it.imported_members.iter())
            .chain(ast.toplevels.iter().map(|t| t.name()))
            .map(|id| id.name)
            .collect::<HashSet<_>>();
          let mut items = vec![];
          for (import_mod_ref, mod_cx) in &state.global_cx {
            for (n, interface_sig) in &mod_cx.interfaces {
              let name = n.as_str(&state.heap);
              let (kind, detail) = if interface_sig.type_definition.is_some() {
                (CompletionItemKind::Class, format!("class {}", name))
              } else {
                (CompletionItemKind::Interface, format!("interface {}", name))
              };
              let additional_edits = if available_names.contains(n) {
                vec![]
              } else {
                rewrite::generate_auto_import_edits(
                  state,
                  *module_reference,
                  Location { module_reference: *module_reference, start: position, end: position },
                  *import_mod_ref,
                  *n,
                )
              };
              items.push((
                n,
                AutoCompletionItem {
                  label: name.to_string(),
                  insert_text: name.to_string(),
                  kind,
                  detail,
                  additional_edits,
                },
              ));
            }
          }
          return Some(
            items.into_iter().sorted_by_key(|(n, _)| *n).map(|(_, item)| item).collect(),
          );
        }
        LocationCoverSearchResult::InterfaceMemberName(_, module_ref, class_name, _, true) => {
          (module_ref, class_name)
        }
        LocationCoverSearchResult::Expression(expr::E::FieldAccess(e)) => {
          e.object.type_().as_nominal().map(|t| (t.module_reference, t.id))?
        }
        _ => return None,
      };
    let class_of_expr = state_searcher_utils::find_class_name(state, module_reference, position);
    let relevant_interface_type =
      state_searcher_utils::find_interface_type(state, &instance_mod_ref, &instance_class_name)?;
    let mut completion_results = vec![];
    let is_inside_class = class_of_expr.eq(&instance_class_name);
    match &relevant_interface_type.type_definition {
      Some(TypeDefinitionSignature::Struct(fields)) if is_inside_class => {
        for field in fields {
          completion_results.push(AutoCompletionItem {
            label: field.name.as_str(&state.heap).to_string(),
            insert_text: field.name.as_str(&state.heap).to_string(),
            kind: CompletionItemKind::Field,
            detail: field.type_.pretty_print(&state.heap),
            additional_edits: vec![],
          });
        }
      }
      _ => {}
    }
    for (name, info) in relevant_interface_type.methods.iter() {
      if is_inside_class || info.is_public {
        completion_results.push(get_completion_result_from_type_info(
          state,
          name.as_str(&state.heap),
          info,
          CompletionItemKind::Method,
        ));
      }
    }
    completion_results.sort_by_key(|r| r.label.to_string());
    Some(completion_results)
  }

  fn get_completion_result_from_type_info(
    state: &ServerState,
    name: &str,
    type_information: &MemberSignature,
    kind: CompletionItemKind,
  ) -> AutoCompletionItem {
    AutoCompletionItem {
      label: name.to_string(),
      insert_text: name.to_string(),
      kind,
      detail: format!(
        "{}({}): {}",
        name,
        type_information
          .type_
          .argument_types
          .iter()
          .enumerate()
          .map(|(id, t)| format!("a{}: {}", id, t.pretty_print(&state.heap)))
          .join(", "),
        type_information.type_.return_type.pretty_print(&state.heap)
      ),
      additional_edits: vec![],
    }
  }
}
