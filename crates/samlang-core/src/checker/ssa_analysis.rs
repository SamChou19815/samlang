use crate::{
  ast::{
    source::{
      annotation,
      expr::{self, DeclarationStatement},
      ClassMemberDeclaration, Module, OptionallyAnnotatedId, Toplevel,
    },
    Location,
  },
  common::{Heap, LocalStackedContext, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::collections::{HashMap, HashSet};

struct SsaAnalysisState<'a> {
  unbound_names: HashSet<PStr>,
  invalid_defines: HashSet<Location>,
  use_define_map: HashMap<Location, Location>,
  def_locs: HashSet<Location>,
  lambda_captures: HashMap<Location, HashMap<PStr, Location>>,
  context: LocalStackedContext<PStr, Location>,
  error_set: &'a mut ErrorSet,
}

impl<'a> SsaAnalysisState<'a> {
  fn new(error_set: &'a mut ErrorSet) -> SsaAnalysisState<'a> {
    SsaAnalysisState {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      def_locs: HashSet::new(),
      lambda_captures: HashMap::new(),
      context: LocalStackedContext::new(),
      error_set,
    }
  }

  fn visit_module(&mut self, heap: &Heap, module: &Module<()>) {
    for import in &module.imports {
      for member in &import.imported_members {
        self.define_id(heap, &member.name, member.loc);
      }
    }

    // Hoist toplevel names
    for toplevel in &module.toplevels {
      let name = toplevel.name();
      self.define_id(heap, &name.name, name.loc);
    }

    for toplevel in &module.toplevels {
      let type_parameters = toplevel.type_parameters();
      let type_definition = toplevel.type_definition();

      for t in toplevel.extends_or_implements_nodes() {
        self.use_id(heap, &t.id.name, t.id.loc);
      }

      self.context.push_scope();
      {
        self.context.push_scope();
        {
          for tparam in type_parameters {
            let id = &tparam.name;
            self.define_id(heap, &id.name, id.loc);
          }
          for tparam in type_parameters {
            if let Some(bound) = &tparam.bound {
              self.visit_id_annot(heap, bound);
            };
          }
          for t in toplevel.extends_or_implements_nodes() {
            for annot in &t.type_arguments {
              self.visit_annot(heap, annot);
            }
          }
          if let Some(type_def) = type_definition {
            for name in &type_def.names {
              self.define_id(heap, &name.name, name.loc);
            }
            for name in &type_def.names {
              self.visit_annot(heap, &type_def.mappings.get(&name.name).unwrap().0)
            }
          }
        }
        self.context.pop_scope();

        // Pull member names into another scope for conflict test,
        // as they cannot be referenced by name without class prefix.
        self.context.push_scope();
        for m in toplevel.members_iter() {
          let id = &m.name;
          self.define_id(heap, &id.name, id.loc);
        }
        self.context.pop_scope();
        // Visit instance methods
        self.context.push_scope();
        if type_definition.is_some() {
          // If this is not allocated, then this is never used, so omitting its define is safe.
          if let Some(this_string) = heap.get_allocated_str_opt("this") {
            self.define_id(heap, &this_string, toplevel.loc());
          }
        }
        for tparam in type_parameters {
          let id = &tparam.name;
          self.define_id(heap, &id.name, id.loc);
        }
        self.visit_members(heap, toplevel, true);
        self.context.pop_scope();
        // Visit static methods
        self.context.push_scope();
        self.visit_members(heap, toplevel, false);
        self.context.pop_scope();
      }
      self.context.pop_scope();
    }
  }

  fn visit_members(&mut self, heap: &Heap, toplevel: &Toplevel<()>, is_method: bool) {
    match toplevel {
      Toplevel::Class(c) => {
        for m in &c.members {
          if m.decl.is_method == is_method {
            self.visit_member_declaration(heap, &m.decl, Some(&m.body));
          }
        }
      }
      Toplevel::Interface(d) => {
        for m in &d.members {
          if m.is_method == is_method {
            self.visit_member_declaration(heap, m, None);
          }
        }
      }
    }
  }

  fn visit_member_declaration(
    &mut self,
    heap: &Heap,
    member: &ClassMemberDeclaration,
    body: Option<&expr::E<()>>,
  ) {
    self.context.push_scope();
    for tparam in member.type_parameters.iter() {
      let id = &tparam.name;
      self.define_id(heap, &id.name, id.loc);
    }
    for tparam in member.type_parameters.iter() {
      if let Some(bound) = &tparam.bound {
        self.visit_id_annot(heap, bound);
      }
    }
    for param in member.parameters.iter() {
      let id = &param.name;
      self.define_id(heap, &id.name, id.loc);
      self.visit_annot(heap, &param.annotation);
    }
    self.visit_annot(heap, &member.type_.return_type);
    if let Some(b) = body {
      self.visit_expression(heap, b);
    }
    self.context.pop_scope();
  }

  fn visit_expression(&mut self, heap: &Heap, expression: &expr::E<()>) {
    match expression {
      expr::E::Literal(_, _) => {}
      expr::E::Id(_, id) => self.use_id(heap, &id.name, id.loc),
      expr::E::ClassFn(e) => {
        for targ in &e.explicit_type_arguments {
          self.visit_annot(heap, targ);
        }
      }
      expr::E::FieldAccess(e) => {
        self.visit_expression(heap, &e.object);
        for targ in &e.explicit_type_arguments {
          self.visit_annot(heap, targ);
        }
      }
      expr::E::MethodAccess(e) => {
        self.visit_expression(heap, &e.object);
        for targ in &e.explicit_type_arguments {
          self.visit_annot(heap, targ);
        }
      }
      expr::E::Unary(e) => self.visit_expression(heap, &e.argument),
      expr::E::Call(e) => {
        self.visit_expression(heap, &e.callee);
        for arg in &e.arguments {
          self.visit_expression(heap, arg);
        }
      }
      expr::E::Binary(e) => {
        self.visit_expression(heap, &e.e1);
        self.visit_expression(heap, &e.e2);
      }
      expr::E::IfElse(e) => {
        self.visit_expression(heap, &e.condition);
        self.visit_expression(heap, &e.e1);
        self.visit_expression(heap, &e.e2);
      }
      expr::E::Match(e) => {
        self.visit_expression(heap, &e.matched);
        for case in &e.cases {
          self.context.push_scope();
          if let Some((id, _)) = &case.data_variable {
            self.define_id(heap, &id.name, id.loc);
          }
          self.visit_expression(heap, &case.body);
          self.context.pop_scope();
        }
      }
      expr::E::Lambda(e) => {
        self.context.push_scope();
        for OptionallyAnnotatedId { name, annotation } in &e.parameters {
          self.define_id(heap, &name.name, name.loc);
          if let Some(annot) = annotation {
            self.visit_annot(heap, annot)
          }
        }
        self.visit_expression(heap, &e.body);
        let captured = self.context.pop_scope();
        self.lambda_captures.insert(e.common.loc, captured);
      }
      expr::E::Block(e) => {
        self.context.push_scope();
        for DeclarationStatement {
          loc: _,
          associated_comments: _,
          pattern,
          annotation,
          assigned_expression,
        } in &e.statements
        {
          self.visit_expression(heap, assigned_expression);
          if let Some(annot) = annotation {
            self.visit_annot(heap, annot);
          }
          match pattern {
            expr::Pattern::Object(_, names) => {
              for name in names {
                let id = name.alias.unwrap_or(name.field_name);
                self.define_id(heap, &id.name, id.loc);
              }
            }
            expr::Pattern::Id(loc, id) => self.define_id(heap, id, *loc),
            expr::Pattern::Wildcard(_) => {}
          }
        }
        if let Some(final_expr) = &e.expression {
          self.visit_expression(heap, final_expr);
        }
        self.context.pop_scope();
      }
    }
  }

  fn visit_id_annot(
    &mut self,
    heap: &Heap,
    annotation::Id { location, module_reference: _, id, type_arguments }: &annotation::Id,
  ) {
    self.use_id(heap, &id.name, *location);
    for targ in type_arguments {
      self.visit_annot(heap, targ);
    }
  }

  fn visit_annot(&mut self, heap: &Heap, annot: &annotation::T) {
    match annot {
      annotation::T::Primitive(_, _, _) => {}
      annotation::T::Id(annot) => self.visit_id_annot(heap, annot),
      annotation::T::Fn(annotation::Function {
        location: _,
        associated_comments: _,
        argument_types,
        return_type,
      }) => {
        for arg in argument_types {
          self.visit_annot(heap, arg);
        }
        self.visit_annot(heap, return_type);
      }
    }
  }

  fn define_id(&mut self, heap: &Heap, name: &PStr, loc: Location) {
    if !self.context.insert(name, loc) && !self.invalid_defines.contains(&loc) {
      // Never error on an illegal define twice, since they might be visited multiple times.
      self.error_set.report_collision_error(loc, name.as_str(heap).to_string());
      self.invalid_defines.insert(loc);
    }
    self.def_locs.insert(loc);
  }

  fn use_id(&mut self, heap: &Heap, name: &PStr, loc: Location) {
    if let Some(definition) = self.context.get(name) {
      self.use_define_map.insert(loc, *definition);
    } else {
      self.unbound_names.insert(*name);
      self.error_set.report_unresolved_name_error(loc, name.as_str(heap).to_string());
    }
  }
}

pub(crate) struct SsaAnalysisResult {
  pub(crate) unbound_names: HashSet<PStr>,
  pub(crate) invalid_defines: HashSet<Location>,
  pub(crate) use_define_map: HashMap<Location, Location>,
  pub(crate) def_to_use_map: HashMap<Location, Vec<Location>>,
  pub(crate) lambda_captures: HashMap<Location, HashMap<PStr, Location>>,
}

impl SsaAnalysisResult {
  pub(super) fn to_string(&self, heap: &Heap) -> String {
    format!(
      "Unbound names: [{}]\nInvalid defines: [{}]\nLambda Capture Locs: [{}]\ndef_to_use_map:\n{}",
      self.unbound_names.iter().map(|n| n.as_str(heap)).join(", "),
      self.invalid_defines.iter().map(Location::pretty_print_without_file).sorted().join(", "),
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
      lambda_captures: state.lambda_captures,
    }
  }
}

pub(super) fn perform_ssa_analysis_on_expression(
  expression: &expr::E<()>,
  heap: &Heap,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(error_set);
  state.visit_expression(heap, expression);
  SsaAnalysisResult::from(state)
}

pub(crate) fn perform_ssa_analysis_on_module(
  module: &Module<()>,
  heap: &Heap,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(error_set);
  state.visit_module(heap, module);
  SsaAnalysisResult::from(state)
}
