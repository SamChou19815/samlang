use super::{
  location_lookup::{self, LocationLookup},
  variable_definition::{apply_renaming, VariableDefinitionLookup},
};
use crate::{
  ast::{
    source::{
      expr, ClassMemberDeclaration, Comment, CommentKind, ISourceType, Module, Toplevel, Type,
    },
    Location, ModuleReference, Position,
  },
  checker::{
    type_check_sources, GlobalTypingContext, InterfaceTypingContext, MemberTypeInformation,
  },
  common::{rc_string, Str},
  errors::{CompileTimeError, ErrorSet},
  parser::parse_source_module_from_text,
  printer,
};
use itertools::Itertools;
use std::{collections::HashMap, rc::Rc};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum CompletionItemKind {
  Method = 2,
  Function = 3,
  Field = 5,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum InsertTextFormat {
  PlainText = 1,
  Snippet = 2,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct TypeQueryContent {
  pub(crate) language: &'static str,
  pub(crate) value: String,
}

pub(crate) struct TypeQueryResult {
  pub(crate) contents: Vec<TypeQueryContent>,
  pub(crate) location: Location,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct AutoCompletionItem {
  pub(crate) label: String,
  pub(crate) insert_text: String,
  pub(crate) insert_text_format: InsertTextFormat,
  pub(crate) kind: CompletionItemKind,
  pub(crate) detail: String,
}

fn get_last_doc_comment(comments: &[Comment]) -> Option<&Str> {
  comments.iter().rev().find(|c| c.kind == CommentKind::DOC).map(|c| &c.text)
}

pub(crate) struct LanguageServices<'a> {
  raw_sources: HashMap<ModuleReference, &'a str>,
  checked_modules: HashMap<ModuleReference, Module>,
  errors: HashMap<ModuleReference, Vec<CompileTimeError>>,
  global_cx: GlobalTypingContext,
  expression_loc_lookup: LocationLookup<expr::E>,
  class_loc_lookup: LocationLookup<Str>,
  variable_definition_lookup: VariableDefinitionLookup,
}

impl<'a> LanguageServices<'a> {
  // Section 1: Init

  pub(crate) fn new(source_handles: Vec<(ModuleReference, &'a str)>) -> LanguageServices<'a> {
    let mut state = LanguageServices {
      raw_sources: source_handles.into_iter().collect(),
      checked_modules: HashMap::new(),
      errors: HashMap::new(),
      global_cx: HashMap::new(),
      expression_loc_lookup: LocationLookup::new(),
      class_loc_lookup: LocationLookup::new(),
      variable_definition_lookup: VariableDefinitionLookup::new(&HashMap::new()),
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
          (mod_ref.clone(), parse_source_module_from_text(text, mod_ref, &mut error_set))
        })
        .collect(),
      &mut error_set,
    );
    self.checked_modules = checked_modules;
    self.global_cx = global_cx;
    self.update_errors(error_set.errors());
    self.update_location_lookups();
  }

  fn update_errors(&mut self, errors: Vec<&CompileTimeError>) {
    let grouped = errors.into_iter().group_by(|e| e.0.module_reference.clone());
    self.errors =
      grouped.into_iter().map(|(k, v)| (k, v.cloned().collect_vec())).collect::<HashMap<_, _>>();
  }

  fn update_location_lookups(&mut self) {
    for (module_reference, module) in &self.checked_modules {
      location_lookup::rebuild_expression_lookup_for_module(
        &mut self.expression_loc_lookup,
        module_reference,
        module,
      );
      for toplevel in &module.toplevels {
        if let Toplevel::Class(c) = toplevel {
          self.class_loc_lookup.set(c.loc.clone(), c.name.name.clone());
        }
      }
    }
    self.variable_definition_lookup = VariableDefinitionLookup::new(&self.checked_modules);
  }

  // Section 2: Getters and Setters

  pub(crate) fn all_modules_with_error(&self) -> Vec<&ModuleReference> {
    self.errors.keys().into_iter().collect()
  }

  pub(crate) fn get_errors(&self, module_reference: &ModuleReference) -> &[CompileTimeError] {
    if let Some(errors) = self.errors.get(module_reference) {
      errors
    } else {
      &[]
    }
  }

  pub(crate) fn update(&mut self, module_reference: ModuleReference, source_code: &'a str) {
    self.raw_sources.insert(module_reference, source_code);
    self.init();
  }

  pub(crate) fn remove(&mut self, module_reference: &ModuleReference) {
    self.raw_sources.remove(module_reference);
    self.init();
  }

  // Section 3: LSP Providers

  pub(crate) fn query_for_hover(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<TypeQueryResult> {
    let expression = self.expression_loc_lookup.get(module_reference, position)?;
    let function_reference = if let expr::E::ClassFn(e) = expression {
      Some((e.module_reference.clone(), e.class_name.name.clone(), &e.fn_name.name))
    } else if let expr::E::MethodAccess(e) = expression {
      let t = e.object.type_();
      let this_type = t.as_id().unwrap();
      Some((this_type.module_reference.clone(), this_type.id.clone(), &e.method_name.name))
    } else {
      None
    };
    if let Some((fetched_function_module_reference, class_name, fn_name)) = function_reference {
      let relevant_fn =
        self.find_class_member(&fetched_function_module_reference, &class_name, fn_name)?;
      let type_content =
        TypeQueryContent { language: "samlang", value: expression.type_().pretty_print() };
      Some(Self::query_result_with_optional_document(
        expression.loc().clone(),
        type_content,
        get_last_doc_comment(&relevant_fn.associated_comments),
      ))
    } else {
      let type_ = expression.type_().pretty_print();
      if type_.starts_with("class ") {
        let (expr_class_name, toplevel) = self.find_toplevel_from_synthetic_class_type(&type_);
        let type_content =
          TypeQueryContent { language: "samlang", value: format!("class {}", expr_class_name) };
        Some(Self::query_result_with_optional_document(
          expression.loc().clone(),
          type_content,
          toplevel.and_then(|toplevel| get_last_doc_comment(toplevel.associated_comments())),
        ))
      } else {
        Some(TypeQueryResult {
          contents: vec![TypeQueryContent { language: "samlang", value: type_ }],
          location: expression.loc().clone(),
        })
      }
    }
  }

  fn find_toplevel(
    &self,
    module_reference: &ModuleReference,
    class_name: &Str,
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
    class_name: &Str,
    member_name: &Str,
  ) -> Option<&ClassMemberDeclaration> {
    self
      .find_toplevel(module_reference, class_name)?
      .members_iter()
      .find(|it| it.name.name.eq(member_name))
  }

  fn find_toplevel_from_synthetic_class_type(&self, class_type: &str) -> (Str, Option<&Toplevel>) {
    let qualified_name = class_type.chars().skip(6).collect::<String>();
    let mut module_parts = qualified_name.split('.').collect_vec();
    let class_name = rc_string(module_parts.pop().unwrap().to_string());
    let module_reference = ModuleReference::ordinary(
      module_parts.into_iter().map(|s| rc_string(s.to_string())).collect(),
    );
    let toplevel = self.find_toplevel(&module_reference, &class_name);
    (class_name, toplevel)
  }

  fn query_result_with_optional_document(
    location: Location,
    type_content: TypeQueryContent,
    document_opt: Option<&Str>,
  ) -> TypeQueryResult {
    let contents = if let Some(document) = document_opt {
      vec![type_content, TypeQueryContent { language: "markdown", value: document.to_string() }]
    } else {
      vec![type_content]
    };
    TypeQueryResult { contents, location }
  }

  pub(crate) fn query_folding_ranges(
    &self,
    module_reference: &ModuleReference,
  ) -> Option<Vec<Location>> {
    let module = self.checked_modules.get(module_reference)?;
    Some(
      module
        .toplevels
        .iter()
        .flat_map(|toplevel| {
          toplevel
            .members_iter()
            .map(|member| member.loc.clone())
            .chain(vec![toplevel.loc().clone()])
        })
        .collect(),
    )
  }

  pub(crate) fn query_definition_location(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Location> {
    let expression = self.expression_loc_lookup.get(module_reference, position)?;
    match expression {
      expr::E::Literal(_, _)
      | expr::E::This(_)
      | expr::E::Unary(_)
      | expr::E::Call(_)
      | expr::E::Binary(_)
      | expr::E::IfElse(_)
      | expr::E::Match(_)
      | expr::E::Lambda(_)
      | expr::E::Block(_) => None,
      expr::E::Id(common, _) => match common.type_.as_ref() {
        Type::Id(id_type) if id_type.id.starts_with("class ") => {
          Some(self.find_toplevel_from_synthetic_class_type(&id_type.id).1?.loc().clone())
        }
        _ => self
          .variable_definition_lookup
          .find_all_definition_and_uses(&common.loc)
          .map(|it| it.definition_location.clone()),
      },
      expr::E::ClassFn(e) => self
        .find_class_member(&e.module_reference, &e.class_name.name, &e.fn_name.name)
        .map(|it| it.loc.clone()),
      expr::E::FieldAccess(e) => {
        let t = e.object.type_();
        let id_t = t.as_id().unwrap();
        self.find_toplevel(&id_t.module_reference, &id_t.id).map(|it| it.loc().clone())
      }
      expr::E::MethodAccess(e) => {
        let t = e.object.type_();
        let id_t = t.as_id().unwrap();
        self
          .find_class_member(&id_t.module_reference, &id_t.id, &e.method_name.name)
          .map(|it| it.loc.clone())
      }
    }
  }

  pub(crate) fn auto_complete(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Vec<AutoCompletionItem> {
    self.autocomplete_opt(module_reference, position).unwrap_or(vec![])
  }

  fn autocomplete_opt(
    &self,
    module_reference: &ModuleReference,
    position: Position,
  ) -> Option<Vec<AutoCompletionItem>> {
    let expression = self.expression_loc_lookup.get(module_reference, position)?;
    let class_of_expr = self.class_loc_lookup.get(module_reference, position).unwrap();
    if let expr::E::ClassFn(e) = expression {
      return Some(
        self
          .get_interface_type(&e.module_reference, &e.class_name.name)?
          .functions
          .iter()
          .map(|(name, info)| {
            Self::get_completion_result_from_type_info(&name, &info, CompletionItemKind::Function)
          })
          .collect(),
      );
    }
    let type_ = match expression {
      expr::E::FieldAccess(e) => e.object.type_().as_id().unwrap().clone(),
      expr::E::MethodAccess(e) => e.object.type_().as_id().unwrap().clone(),
      _ => {
        return None;
      }
    };
    let relevant_interface_type = self.get_interface_type(&type_.module_reference, &type_.id)?;
    let relevant_type_def = self
      .global_cx
      .get(&type_.module_reference)
      .and_then(|module_cx| module_cx.type_definitions.get(&type_.id));
    let mut completion_results = vec![];
    let is_inside_class = class_of_expr.eq(&type_.id);
    match relevant_type_def {
      Some(def) if is_inside_class && def.is_object => {
        for name in &def.names {
          let field_type = def.mappings.get(name).unwrap();
          completion_results.push(AutoCompletionItem {
            label: name.to_string(),
            insert_text: name.to_string(),
            insert_text_format: InsertTextFormat::PlainText,
            kind: CompletionItemKind::Field,
            detail: field_type.type_.pretty_print(),
          });
        }
      }
      _ => {}
    }
    for (name, info) in relevant_interface_type.methods.iter() {
      if is_inside_class || info.is_public {
        completion_results.push(Self::get_completion_result_from_type_info(
          name,
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
    class_name: &Str,
  ) -> Option<&Rc<InterfaceTypingContext>> {
    self.global_cx.get(module_reference).and_then(|cx| cx.interfaces.get(&class_name))
  }

  fn get_completion_result_from_type_info(
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
          .map(|(id, t)| format!("a{}: {}", id, t.pretty_print()))
          .join(", "),
        type_information.type_.return_type.pretty_print()
      ),
      insert_text,
      insert_text_format,
      kind,
      detail: Self::pretty_print_type_info(type_information),
    }
  }

  fn pretty_print_type_info(type_information: &MemberTypeInformation) -> String {
    if type_information.type_parameters.is_empty() {
      type_information.type_.pretty_print()
    } else {
      format!(
        "<{}>({})",
        type_information.type_parameters.iter().map(|it| it.pretty_print()).join(", "),
        type_information.type_.pretty_print()
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

  pub(crate) fn rename_variable(
    &self,
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
    let expr = self.expression_loc_lookup.get(module_reference, position)?;
    if !matches!(expr, expr::E::Id(_, _))
      || expr.type_().as_id().map(|id| id.id.starts_with("class ")).unwrap_or(false)
    {
      return None;
    }
    let def_and_uses = self.variable_definition_lookup.find_all_definition_and_uses(expr.loc())?;
    Some(printer::pretty_print_source_module(
      100,
      &apply_renaming(self.checked_modules.get(module_reference).unwrap(), &def_and_uses, new_name),
    ))
  }

  pub(crate) fn format_entire_document(
    &self,
    module_reference: &ModuleReference,
  ) -> Option<String> {
    let module = self.checked_modules.get(module_reference)?;
    if self.get_errors(module_reference).iter().any(|e| e.to_string().contains("SyntaxError")) {
      None
    } else {
      Some(printer::pretty_print_source_module(100, module))
    }
  }
}
