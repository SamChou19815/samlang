use super::{
  location_cover::{search_module, LocationCoverSearchResult},
  variable_definition::{apply_renaming, VariableDefinitionLookup},
};
use crate::{
  ast::{
    source::{expr, ClassMemberDeclaration, Comment, CommentKind, ISourceType, Module, Toplevel},
    Location, Position,
  },
  checker::{
    type_check_sources, GlobalTypingContext, InterfaceTypingContext, MemberTypeInformation,
  },
  common::{Heap, ModuleReference, PStr},
  errors::{CompileTimeError, ErrorSet},
  parser::parse_source_module_from_text,
  printer,
};
use itertools::Itertools;
use std::{collections::HashMap, rc::Rc};

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

fn get_last_doc_comment(comments: &[Comment]) -> Option<PStr> {
  comments.iter().rev().find(|c| c.kind == CommentKind::DOC).map(|c| c.text)
}

pub struct LanguageServices {
  pub heap: Heap,
  raw_sources: HashMap<ModuleReference, String>,
  checked_modules: HashMap<ModuleReference, Module>,
  errors: HashMap<ModuleReference, Vec<CompileTimeError>>,
  global_cx: GlobalTypingContext,
}

impl LanguageServices {
  // Section 1: Init

  pub fn new(heap: Heap, source_handles: Vec<(ModuleReference, String)>) -> LanguageServices {
    let mut state = LanguageServices {
      heap,
      raw_sources: source_handles.into_iter().collect(),
      checked_modules: HashMap::new(),
      errors: HashMap::new(),
      global_cx: HashMap::new(),
    };
    state.init();
    state
  }

  fn init(&mut self) {
    let mut error_set = ErrorSet::new();
    let (checked_modules, global_cx) = type_check_sources(
      self
        .raw_sources
        .iter()
        .map(|(mod_ref, text)| {
          (*mod_ref, parse_source_module_from_text(text, *mod_ref, &mut self.heap, &mut error_set))
        })
        .collect(),
      &mut self.heap,
      &mut error_set,
    );
    self.checked_modules = checked_modules;
    self.global_cx = global_cx;
    self.update_errors(error_set.errors());
  }

  fn update_errors(&mut self, errors: Vec<&CompileTimeError>) {
    let grouped = errors.into_iter().group_by(|e| e.location.module_reference);
    self.errors =
      grouped.into_iter().map(|(k, v)| (k, v.cloned().collect_vec())).collect::<HashMap<_, _>>();
  }

  // Section 2: Getters and Setters

  pub fn all_modules(&self) -> Vec<&ModuleReference> {
    self.raw_sources.keys().into_iter().collect()
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

  pub fn update(&mut self, module_reference: ModuleReference, source_code: String) {
    self.raw_sources.insert(module_reference, source_code);
    self.init();
  }

  pub fn remove(&mut self, module_reference: &ModuleReference) {
    self.raw_sources.remove(module_reference);
    self.init();
  }

  // Section 3: LSP Providers

  fn search_at_pos(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<LocationCoverSearchResult> {
    search_module(*module_reference, self.checked_modules.get(module_reference)?, position)
  }

  pub fn query_for_hover(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<TypeQueryResult> {
    match self.search_at_pos(module_reference, position)? {
      LocationCoverSearchResult::ClassMemberName(
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
          value: relevant_fn.type_.pretty_print(&self.heap),
        };
        Some(self.query_result_with_optional_document(
          loc,
          type_content,
          get_last_doc_comment(&relevant_fn.associated_comments),
        ))
      }
      LocationCoverSearchResult::ClassName(loc, module_reference, class_name) => {
        let type_content = TypeQueryContent {
          language: "samlang",
          value: format!("class {}", class_name.as_str(&self.heap)),
        };
        Some(
          self.query_result_with_optional_document(
            loc,
            type_content,
            self
              .find_toplevel(&module_reference, &class_name)
              .and_then(|toplevel| get_last_doc_comment(toplevel.associated_comments())),
          ),
        )
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
  ) -> Option<&Toplevel> {
    self
      .checked_modules
      .get(module_reference)?
      .toplevels
      .iter()
      .find(|it| it.name().name.eq(class_name))
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

  pub fn query_definition_location(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Location> {
    let module = self.checked_modules.get(module_reference)?;
    match search_module(*module_reference, module, position)? {
      LocationCoverSearchResult::Expression(
        expr::E::Literal(_, _)
        | expr::E::ClassFn(_)
        | expr::E::MethodAccess(_)
        | expr::E::Unary(_)
        | expr::E::Call(_)
        | expr::E::Binary(_)
        | expr::E::IfElse(_)
        | expr::E::Match(_)
        | expr::E::Lambda(_)
        | expr::E::Block(_),
      ) => None,
      LocationCoverSearchResult::ClassMemberName(_, mod_ref, class_name, member_name, _) => {
        Some(self.find_class_member(&mod_ref, &class_name, &member_name)?.loc)
      }
      LocationCoverSearchResult::ClassName(_, mod_ref, class_name) => {
        Some(self.find_toplevel(&mod_ref, &class_name)?.loc())
      }
      LocationCoverSearchResult::TypedName(loc, _, _) => {
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(&loc)
          .map(|it| it.definition_location)
      }
      LocationCoverSearchResult::Expression(expr::E::Id(expr::ExpressionCommon { loc, .. }, _)) => {
        VariableDefinitionLookup::new(&self.heap, module)
          .find_all_definition_and_uses(loc)
          .map(|it| it.definition_location)
      }
      LocationCoverSearchResult::Expression(expr::E::FieldAccess(e)) => {
        let t = e.object.type_();
        let id_t = t.as_id().unwrap();
        self.find_toplevel(&id_t.module_reference, &id_t.id).map(|it| it.loc())
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
        LocationCoverSearchResult::ClassMemberName(_, module_ref, class_name, _, false) => {
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
              .collect()
          });
        }
        LocationCoverSearchResult::ClassMemberName(_, module_ref, class_name, _, true) => {
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
    let relevant_type_def = self
      .global_cx
      .get(&instance_mod_ref)
      .and_then(|module_cx| module_cx.type_definitions.get(&instance_class_name));
    let mut completion_results = vec![];
    let is_inside_class = class_of_expr.eq(&instance_class_name);
    match relevant_type_def {
      Some(def) if is_inside_class && def.is_object => {
        for name in &def.names {
          let field_type = def.mappings.get(name).unwrap();
          completion_results.push(AutoCompletionItem {
            label: name.as_str(&self.heap).to_string(),
            insert_text: name.as_str(&self.heap).to_string(),
            insert_text_format: InsertTextFormat::PlainText,
            kind: CompletionItemKind::Field,
            detail: field_type.type_.pretty_print(&self.heap),
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
    Some(completion_results)
  }

  fn get_interface_type(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
  ) -> Option<&Rc<InterfaceTypingContext>> {
    self.global_cx.get(module_reference).and_then(|cx| cx.interfaces.get(class_name))
  }

  fn get_completion_result_from_type_info(
    &self,
    name: &str,
    type_information: &MemberTypeInformation,
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

  fn pretty_print_type_info(&self, type_information: &MemberTypeInformation) -> String {
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
      (format!("{}()", name), InsertTextFormat::PlainText)
    } else {
      let mut items = vec![];
      for i in 0..argument_length {
        items.push(format!("${}", i));
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

    let module = self.checked_modules.get(module_reference).unwrap();
    let def_and_uses = VariableDefinitionLookup::new(&self.heap, module)
      .find_all_definition_and_uses(&def_or_use_loc)?;
    let renamed =
      apply_renaming(module, &def_and_uses, self.heap.alloc_string(new_name.to_string()));
    Some(printer::pretty_print_source_module(&self.heap, 100, &renamed))
  }

  pub fn format_entire_document(&self, module_reference: &ModuleReference) -> Option<String> {
    let mut temp_heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let module = parse_source_module_from_text(
      self.raw_sources.get(module_reference)?,
      *module_reference,
      &mut temp_heap,
      &mut error_set,
    );
    if error_set.has_errors() {
      None
    } else {
      Some(printer::pretty_print_source_module(&temp_heap, 100, &module))
    }
  }
}
