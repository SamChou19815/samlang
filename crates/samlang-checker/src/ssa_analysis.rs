use samlang_ast::{
  source::{
    annotation, expr, pattern, ClassMemberDeclaration, Module, OptionallyAnnotatedId, Toplevel,
    TypeDefinition,
  },
  Location,
};
use samlang_errors::ErrorSet;
use samlang_heap::{ModuleReference, PStr};
use std::collections::{HashMap, HashSet};

struct SsaLocalStackedContext {
  local_values_stack: Vec<HashMap<PStr, Location>>,
  captured_values_stack: Vec<HashMap<PStr, Location>>,
}

impl SsaLocalStackedContext {
  fn new() -> SsaLocalStackedContext {
    SsaLocalStackedContext {
      local_values_stack: vec![HashMap::new()],
      captured_values_stack: vec![HashMap::new()],
    }
  }

  fn get(&mut self, name: &PStr, for_type: bool) -> Option<&Location> {
    let closest_stack_value = self.local_values_stack.last().unwrap().get(name);
    if closest_stack_value.is_some() {
      return closest_stack_value;
    }
    for level in (0..(self.local_values_stack.len() - 1)).rev() {
      let value = self.local_values_stack[level].get(name);
      if let Some(v) = value {
        if !for_type {
          for captured_level in (level + 1)..(self.captured_values_stack.len()) {
            self.captured_values_stack[captured_level].insert(*name, *v);
          }
        }
        return Some(v);
      }
    }
    None
  }

  fn insert(&mut self, name: PStr, value: Location) -> Option<Location> {
    let previous = self.local_values_stack.iter().find_map(|m| m.get(&name)).cloned();
    let stack = &mut self.local_values_stack;
    let last_index = stack.len() - 1;
    stack[last_index].insert(name, value);
    previous
  }

  fn push_scope(&mut self) {
    self.local_values_stack.push(HashMap::new());
    self.captured_values_stack.push(HashMap::new());
  }

  fn pop_scope(&mut self) -> (HashMap<PStr, Location>, HashMap<PStr, Location>) {
    (self.local_values_stack.pop().unwrap(), self.captured_values_stack.pop().unwrap())
  }
}

struct SsaAnalysisState<'a> {
  module_reference: ModuleReference,
  unbound_names: HashSet<PStr>,
  invalid_defines: HashSet<Location>,
  use_define_map: HashMap<Location, Location>,
  def_locs: HashSet<Location>,
  local_scoped_def_locs: HashMap<Location, HashMap<PStr, Location>>,
  lambda_captures: HashMap<Location, HashMap<PStr, Location>>,
  context: SsaLocalStackedContext,
  error_set: &'a mut ErrorSet,
}

impl<'a> SsaAnalysisState<'a> {
  fn new(module_reference: ModuleReference, error_set: &'a mut ErrorSet) -> SsaAnalysisState<'a> {
    SsaAnalysisState {
      module_reference,
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_locs: HashSet::new(),
      local_scoped_def_locs: HashMap::new(),
      lambda_captures: HashMap::new(),
      context: SsaLocalStackedContext::new(),
      error_set,
    }
  }

  fn visit_module(&mut self, module: &Module<()>) {
    for import in &module.imports {
      for member in &import.imported_members {
        self.define_id(member.name, member.loc);
      }
    }

    // Hoist toplevel names
    for toplevel in &module.toplevels {
      let name = toplevel.name();
      self.define_id(name.name, name.loc);
    }

    for toplevel in &module.toplevels {
      let type_parameters = toplevel.type_parameters();
      let type_definition = toplevel.type_definition();

      for t in toplevel.extends_or_implements_nodes().iter().flat_map(|it| &it.nodes) {
        self.use_id(&t.id.name, t.id.loc, true);
      }

      self.context.push_scope();
      {
        self.context.push_scope();
        {
          self.visit_type_parameters_with_bounds(type_parameters);
          for t in toplevel.extends_or_implements_nodes().iter().flat_map(|it| &it.nodes) {
            for annot in t.type_arguments.iter().flat_map(|it| &it.arguments) {
              self.visit_annot(annot);
            }
          }
          if let Some(type_def) = type_definition {
            let mut names = vec![];
            let mut annots = vec![];
            match type_def {
              TypeDefinition::Struct {
                loc: _,
                start_associated_comments: _,
                ending_associated_comments: _,
                fields,
              } => {
                for field in fields {
                  names.push(&field.name);
                  annots.push(&field.annotation);
                }
              }
              TypeDefinition::Enum {
                loc: _,
                start_associated_comments: _,
                ending_associated_comments: _,
                variants,
              } => {
                for variant in variants {
                  names.push(&variant.name);
                  for annot in variant.associated_data_types.iter().flat_map(|it| &it.annotations) {
                    annots.push(annot);
                  }
                }
              }
            }
            for annot in annots {
              self.visit_annot(annot)
            }
            for name in names {
              self.define_id(name.name, name.loc);
            }
          }
        }
        self.context.pop_scope();

        // Pull member names into another scope for conflict test,
        // as they cannot be referenced by name without class prefix.
        self.context.push_scope();
        for m in toplevel.members_iter() {
          let id = &m.name;
          self.define_id(id.name, id.loc);
        }
        self.context.pop_scope();
        // Visit instance methods
        self.context.push_scope();
        if toplevel.is_class() {
          self.define_id(PStr::THIS, toplevel.loc());
        }
        for tparam in type_parameters.iter().flat_map(|it| &it.parameters) {
          let id = &tparam.name;
          self.define_id(id.name, id.loc);
        }
        self.visit_members(toplevel, true);
        self.context.pop_scope();
        // Visit static methods
        self.context.push_scope();
        self.visit_members(toplevel, false);
        self.context.pop_scope();
      }
      self.context.pop_scope();
    }
  }

  fn visit_members(&mut self, toplevel: &Toplevel<()>, is_method: bool) {
    match toplevel {
      Toplevel::Class(c) => {
        for m in &c.members.members {
          if m.decl.is_method == is_method {
            self.visit_member_declaration(&m.decl, Some(&m.body));
          }
        }
      }
      Toplevel::Interface(d) => {
        for m in &d.members.members {
          if m.is_method == is_method {
            self.visit_member_declaration(m, None);
          }
        }
      }
    }
  }

  fn visit_member_declaration(
    &mut self,
    member: &ClassMemberDeclaration,
    body: Option<&expr::E<()>>,
  ) {
    self.context.push_scope();
    self.visit_type_parameters_with_bounds(member.type_parameters.as_ref());
    for param in member.parameters.parameters.iter() {
      self.visit_annot(&param.annotation);
    }
    self.visit_annot(&member.return_type);
    self.context.push_scope();
    for param in member.parameters.parameters.iter() {
      let id = &param.name;
      self.define_id(id.name, id.loc);
    }
    if let Some(b) = body {
      self.visit_expression(b);
    }
    let (local_defs, _) = self.context.pop_scope();
    self.local_scoped_def_locs.insert(member.loc, local_defs);
    self.context.pop_scope();
  }

  fn visit_type_parameters_with_bounds(
    &mut self,
    type_parameters_opt: Option<&annotation::TypeParameters>,
  ) {
    if let Some(annotation::TypeParameters {
      location: _,
      start_associated_comments: _,
      ending_associated_comments: _,
      parameters,
    }) = type_parameters_opt
    {
      for tparam in parameters {
        if let Some(bound) = &tparam.bound {
          self.use_id(&bound.id.name, bound.id.loc, true)
        }
      }
      for tparam in parameters {
        let id = &tparam.name;
        self.define_id(id.name, id.loc);
      }
      for tparam in parameters {
        if let Some(bound) = &tparam.bound {
          for annot in bound.type_arguments.iter().flat_map(|it| &it.arguments) {
            self.visit_annot(annot);
          }
        }
      }
    }
  }

  fn visit_expression(&mut self, expression: &expr::E<()>) {
    match expression {
      expr::E::Literal(_, _) | expr::E::ClassId(_, _, _) => {}
      expr::E::LocalId(_, id) => self.use_id(&id.name, id.loc, false),
      expr::E::Tuple(_, expressions) => {
        for e in &expressions.expressions {
          self.visit_expression(e);
        }
      }
      expr::E::FieldAccess(e) => {
        self.visit_expression(&e.object);
        for targ in e.explicit_type_arguments.iter().flat_map(|it| &it.arguments) {
          self.visit_annot(targ);
        }
      }
      expr::E::MethodAccess(e) => {
        self.visit_expression(&e.object);
        for targ in e.explicit_type_arguments.iter().flat_map(|it| &it.arguments) {
          self.visit_annot(targ);
        }
      }
      expr::E::Unary(e) => self.visit_expression(&e.argument),
      expr::E::Call(e) => {
        self.visit_expression(&e.callee);
        for arg in &e.arguments.expressions {
          self.visit_expression(arg);
        }
      }
      expr::E::Binary(e) => {
        self.visit_expression(&e.e1);
        self.visit_expression(&e.e2);
      }
      expr::E::IfElse(e) => match e.condition.as_ref() {
        expr::IfElseCondition::Expression(guard) => {
          self.visit_expression(guard);
          self.visit_expression(&e.e1);
          self.visit_expression(&e.e2);
        }
        expr::IfElseCondition::Guard(p, guard) => {
          self.visit_expression(guard);
          self.context.push_scope();
          self.visit_matching_pattern(p);
          self.visit_expression(&e.e1);
          self.context.pop_scope();
          self.visit_expression(&e.e2);
        }
      },
      expr::E::Match(e) => {
        self.visit_expression(&e.matched);
        for case in &e.cases {
          self.context.push_scope();
          self.visit_matching_pattern(&case.pattern);
          self.visit_expression(&case.body);
          let (local_defs, _) = self.context.pop_scope();
          self.local_scoped_def_locs.insert(case.loc, local_defs);
        }
      }
      expr::E::Lambda(e) => {
        self.context.push_scope();
        for OptionallyAnnotatedId { name, type_: _, annotation } in &e.parameters.parameters {
          self.define_id(name.name, name.loc);
          if let Some(annot) = annotation {
            self.visit_annot(annot)
          }
        }
        self.visit_expression(&e.body);
        let (local_defs, captured) = self.context.pop_scope();
        self.local_scoped_def_locs.insert(e.common.loc, local_defs);
        self.lambda_captures.insert(e.common.loc, captured);
      }
      expr::E::Block(e) => {
        self.visit_block(e);
      }
    }
  }

  fn visit_block(&mut self, block: &expr::Block<()>) {
    self.context.push_scope();
    for expr::DeclarationStatement {
      loc: _,
      associated_comments: _,
      pattern,
      annotation,
      assigned_expression,
    } in &block.statements
    {
      self.visit_expression(assigned_expression);
      if let Some(annot) = annotation {
        self.visit_annot(annot);
      }
      self.visit_matching_pattern(pattern);
    }
    if let Some(final_expr) = &block.expression {
      self.visit_expression(final_expr);
    }
    let (local_defs, _) = self.context.pop_scope();
    self.local_scoped_def_locs.insert(block.common.loc, local_defs);
  }

  fn visit_matching_pattern(&mut self, pattern: &pattern::MatchingPattern<()>) {
    match pattern {
      pattern::MatchingPattern::Tuple(p) => self.visit_tuple_pattern(p),
      pattern::MatchingPattern::Object { elements, .. } => {
        for name in elements {
          self.visit_matching_pattern(&name.pattern);
        }
      }
      pattern::MatchingPattern::Variant(pattern::VariantPattern {
        loc: _,
        tag_order: _,
        tag: _,
        data_variables,
        type_: _,
      }) => {
        if let Some(p) = data_variables {
          self.visit_tuple_pattern(p);
        }
      }
      pattern::MatchingPattern::Id(id, ()) => self.define_id(id.name, id.loc),
      pattern::MatchingPattern::Wildcard { .. } => {}
    }
  }

  fn visit_tuple_pattern(&mut self, pattern: &pattern::TuplePattern<()>) {
    for pattern::TuplePatternElement { pattern, type_: _ } in &pattern.elements {
      self.visit_matching_pattern(pattern);
    }
  }

  fn visit_id_annot(
    &mut self,
    annotation::Id { location, module_reference, id, type_arguments }: &annotation::Id,
  ) {
    if self.module_reference.eq(module_reference) {
      self.use_id(&id.name, *location, true);
    }
    for targ in type_arguments.iter().flat_map(|it| &it.arguments) {
      self.visit_annot(targ);
    }
  }

  fn visit_annot(&mut self, annot: &annotation::T) {
    match annot {
      annotation::T::Primitive(_, _, _) => {}
      annotation::T::Id(annot) => self.visit_id_annot(annot),
      annotation::T::Generic(_, id) => self.use_id(&id.name, id.loc, true),
      annotation::T::Fn(annotation::Function {
        location: _,
        associated_comments: _,
        parameters,
        return_type,
      }) => {
        for arg in &parameters.annotations {
          self.visit_annot(arg);
        }
        self.visit_annot(return_type);
      }
    }
  }

  fn define_id(&mut self, name: PStr, loc: Location) {
    if let Some(previous) = self.context.insert(name, loc) {
      if !self.invalid_defines.contains(&loc) {
        // Never error on an illegal define twice, since they might be visited multiple times.
        self.error_set.report_name_already_bound_error(loc, name, previous);
        self.invalid_defines.insert(loc);
      }
    }
    self.def_locs.insert(loc);
  }

  fn use_id(&mut self, name: &PStr, loc: Location, for_type: bool) {
    if let Some(definition) = self.context.get(name, for_type) {
      self.use_define_map.insert(loc, *definition);
    } else {
      self.unbound_names.insert(*name);
      self.error_set.report_cannot_resolve_name_error(loc, *name);
    }
  }
}

pub struct SsaAnalysisResult {
  pub unbound_names: HashSet<PStr>,
  pub invalid_defines: HashSet<Location>,
  pub use_define_map: HashMap<Location, Location>,
  pub def_to_use_map: HashMap<Location, Vec<Location>>,
  pub local_scoped_def_locs: HashMap<Location, HashMap<PStr, Location>>,
  pub lambda_captures: HashMap<Location, HashMap<PStr, Location>>,
}

impl SsaAnalysisResult {
  #[cfg(test)]
  pub(super) fn to_string(&self, heap: &samlang_heap::Heap) -> String {
    use itertools::Itertools;
    format!(
      "Unbound names: [{}]\nInvalid defines: [{}]\nLocally Scoped Defs:\n{}\nLambda Capture Locs: [{}]\ndef_to_use_map:\n{}",
      self.unbound_names.iter().map(|n| n.as_str(heap)).join(", "),
      self.invalid_defines.iter().map(Location::pretty_print_without_file).sorted().join(", "),
      self
        .local_scoped_def_locs
        .iter()
        .map(|(k, v)| {
          let names = v.keys().sorted().map(|s| s.as_str(heap)).join(", ");
          format!("{}: [{}]", k.pretty_print_without_file(),names)
        })
        .sorted()
        .join("\n"),
      self.lambda_captures.keys().map(|k| k.pretty_print_without_file()).sorted().join(", "),
      self
        .def_to_use_map
        .iter()
        .sorted_by(|(l1, _), (l2, _)| l1
          .pretty_print_without_file()
          .cmp(&l2.pretty_print_without_file()))
        .map(|(def_loc, uses)| format!(
          "{} -> [{}]",
          def_loc.pretty_print_without_file(),
          uses.iter().map(Location::pretty_print_without_file).sorted().join(", ")
        ))
        .join("\n")
    )
  }
}

impl SsaAnalysisResult {
  fn from(state: SsaAnalysisState) -> SsaAnalysisResult {
    let mut def_to_use_map: HashMap<Location, Vec<Location>> = HashMap::new();
    for loc in state.def_locs {
      def_to_use_map.insert(loc, vec![loc]);
    }
    for (use_loc, def_loc) in &state.use_define_map {
      def_to_use_map.get_mut(def_loc).unwrap().push(*use_loc);
    }
    SsaAnalysisResult {
      unbound_names: state.unbound_names,
      invalid_defines: state.invalid_defines,
      use_define_map: state.use_define_map,
      def_to_use_map,
      local_scoped_def_locs: state.local_scoped_def_locs,
      lambda_captures: state.lambda_captures,
    }
  }
}

#[cfg(test)]
pub(super) fn perform_ssa_analysis_on_expression(
  module_reference: ModuleReference,
  expression: &expr::E<()>,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(module_reference, error_set);
  state.visit_expression(expression);
  SsaAnalysisResult::from(state)
}

pub fn perform_ssa_analysis_on_module(
  module_reference: ModuleReference,
  module: &Module<()>,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(module_reference, error_set);
  state.visit_module(module);
  SsaAnalysisResult::from(state)
}
