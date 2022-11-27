use crate::{
  ast::{
    source::{
      expr::{self, DeclarationStatement},
      ClassMemberDeclaration, FunctionType, IdType, Module, OptionallyAnnotatedId, Toplevel, Type,
    },
    Location,
  },
  common::{rcs, LocalStackedContext, Str},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  ops::Deref,
};

struct SsaAnalysisState<'a> {
  unbound_names: HashSet<Str>,
  invalid_defines: HashSet<Location>,
  use_define_map: HashMap<Location, Location>,
  lambda_captures: HashMap<Location, HashMap<Str, Location>>,
  context: LocalStackedContext<Location>,
  error_set: &'a mut ErrorSet,
}

impl<'a> SsaAnalysisState<'a> {
  fn new(error_set: &mut ErrorSet) -> SsaAnalysisState {
    SsaAnalysisState {
      unbound_names: HashSet::new(),
      invalid_defines: HashSet::new(),
      use_define_map: HashMap::new(),
      lambda_captures: HashMap::new(),
      context: LocalStackedContext::new(),
      error_set,
    }
  }

  fn visit_module(&mut self, module: &Module) {
    for import in &module.imports {
      for member in &import.imported_members {
        self.define_id(&member.name, &member.loc);
      }
    }

    // Hoist toplevel names
    for toplevel in &module.toplevels {
      let name = toplevel.name();
      self.define_id(&name.name, &name.loc)
    }

    for toplevel in &module.toplevels {
      let type_parameters = toplevel.type_parameters();
      let type_definition = toplevel.type_definition();

      self.context.push_scope();
      {
        self.context.push_scope();
        {
          for tparam in type_parameters {
            let id = &tparam.name;
            self.define_id(&id.name, &id.loc);
          }
          for tparam in type_parameters {
            if let Some(bound) = &tparam.bound {
              self.visit_type(&Type::Id(bound.deref().clone()));
            };
          }
          for t in toplevel.extends_or_implements_nodes() {
            self.visit_type(&Type::Id(t.clone()));
          }
          if let Some(type_def) = type_definition {
            for name in &type_def.names {
              self.define_id(&name.name, &name.loc);
            }
            for name in &type_def.names {
              self.visit_type(&type_def.mappings.get(&name.name).unwrap().type_)
            }
          }
        }
        self.context.pop_scope();

        // Pull member names into another scope for conflict test,
        // as they cannot be referenced by name without class prefix.
        self.context.push_scope();
        for m in toplevel.members_iter() {
          let id = &m.name;
          self.define_id(&id.name, &id.loc);
        }
        self.context.pop_scope();
        // Visit instance methods
        self.context.push_scope();
        if let Some(_) = type_definition {
          self.define_id(&rcs("this"), toplevel.loc());
        }
        for tparam in type_parameters {
          let id = &tparam.name;
          self.define_id(&id.name, &id.loc);
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

  fn visit_members(&mut self, toplevel: &Toplevel, is_method: bool) {
    match toplevel {
      Toplevel::Class(c) => {
        for m in &c.members {
          if m.decl.is_method == is_method {
            self.visit_member_declaration(&m.decl, Some(&m.body));
          }
        }
      }
      Toplevel::Interface(d) => {
        for m in &d.members {
          if m.is_method == is_method {
            self.visit_member_declaration(&m, None);
          }
        }
      }
    }
  }

  fn visit_member_declaration(&mut self, member: &ClassMemberDeclaration, body: Option<&expr::E>) {
    self.context.push_scope();
    for tparam in member.type_parameters.iter() {
      let id = &tparam.name;
      self.define_id(&id.name, &id.loc);
    }
    for tparam in member.type_parameters.iter() {
      if let Some(bound) = &tparam.bound {
        self.visit_type(&Type::Id(bound.deref().clone()));
      }
    }
    for param in member.parameters.iter() {
      let id = &param.name;
      self.define_id(&id.name, &id.loc);
      self.visit_type(&param.annotation);
    }
    self.visit_type(&member.type_.return_type);
    if let Some(b) = body {
      self.visit_expression(b);
    }
    self.context.pop_scope();
  }

  fn visit_expression(&mut self, expression: &expr::E) {
    match expression {
      expr::E::Literal(_, _) => {}
      expr::E::This(c) => self.use_id(&rcs("this"), &c.loc),
      expr::E::Id(_, id) => self.use_id(&id.name, &id.loc),
      expr::E::ClassFn(e) => {
        for targ in &e.type_arguments {
          self.visit_type(&targ);
        }
      }
      expr::E::FieldAccess(e) => {
        self.visit_expression(&e.object);
        for targ in &e.type_arguments {
          self.visit_type(&targ);
        }
      }
      expr::E::MethodAccess(e) => {
        self.visit_expression(&e.object);
        for targ in &e.type_arguments {
          self.visit_type(&targ);
        }
      }
      expr::E::Unary(e) => self.visit_expression(&e.argument),
      expr::E::Call(e) => {
        self.visit_expression(&e.callee);
        for arg in &e.arguments {
          self.visit_expression(&arg);
        }
      }
      expr::E::Binary(e) => {
        self.visit_expression(&e.e1);
        self.visit_expression(&e.e2);
      }
      expr::E::IfElse(e) => {
        self.visit_expression(&e.condition);
        self.visit_expression(&e.e1);
        self.visit_expression(&e.e2);
      }
      expr::E::Match(e) => {
        self.visit_expression(&e.matched);
        for case in &e.cases {
          self.context.push_scope();
          if let Some((id, _)) = &case.data_variable {
            self.define_id(&id.name, &id.loc);
          }
          self.visit_expression(&case.body);
          self.context.pop_scope();
        }
      }
      expr::E::Lambda(e) => {
        self.context.push_scope();
        for OptionallyAnnotatedId { name, annotation } in &e.parameters {
          self.define_id(&name.name, &name.loc);
          if let Some(t) = annotation {
            self.visit_type(t)
          }
        }
        self.visit_expression(&e.body);
        let captured = self.context.pop_scope();
        self.lambda_captures.insert(e.common.loc.clone(), captured);
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
          self.visit_expression(assigned_expression);
          if let Some(t) = annotation {
            self.visit_type(t);
          }
          match pattern {
            expr::Pattern::Object(_, names) => {
              for name in names {
                let id = name.alias.clone().unwrap_or(name.field_name.clone());
                self.define_id(&id.name, &id.loc);
              }
            }
            expr::Pattern::Id(loc, id) => self.define_id(id, loc),
            expr::Pattern::Wildcard(_) => {}
          }
        }
        if let Some(final_expr) = &e.expression {
          self.visit_expression(final_expr);
        }
        self.context.pop_scope();
      }
    }
  }

  fn visit_type(&mut self, t: &Type) {
    match t {
      Type::Unknown(_) | Type::Primitive(_, _) => {}
      Type::Id(IdType { reason, module_reference: _, id, type_arguments }) => {
        self.use_id(id, &reason.use_loc);
        for targ in type_arguments {
          self.visit_type(targ);
        }
      }
      Type::Fn(FunctionType { reason: _, argument_types, return_type }) => {
        for arg in argument_types {
          self.visit_type(arg);
        }
        self.visit_type(return_type);
      }
    }
  }

  fn define_id(&mut self, name: &Str, loc: &Location) {
    if !self.context.insert(name, loc.clone()) {
      if !self.invalid_defines.contains(loc) {
        // Never error on an illegal define twice, since they might be visited multiple times.
        self.error_set.report_collision_error(loc, name);
        self.invalid_defines.insert(loc.clone());
      }
    }
  }

  fn use_id(&mut self, name: &Str, loc: &Location) {
    if let Some(definition) = self.context.get(name) {
      self.use_define_map.insert(loc.clone(), definition.clone());
    } else {
      self.unbound_names.insert(name.clone());
      self.error_set.report_unresolved_name_error(loc, &name);
    }
  }
}

pub(super) struct SsaAnalysisResult {
  pub(super) unbound_names: HashSet<Str>,
  pub(super) invalid_defines: HashSet<Location>,
  pub(super) use_define_map: HashMap<Location, Location>,
  pub(super) def_to_use_map: HashMap<Location, Vec<Location>>,
  pub(super) lambda_captures: HashMap<Location, HashMap<Str, Location>>,
}

impl ToString for SsaAnalysisResult {
  fn to_string(&self) -> String {
    format!(
      "Unbound names: [{}]\nInvalid defines: [{}]\nLambda Capture Locs: [{}]\ndef_to_use_map:\n{}",
      self.unbound_names.iter().map(Str::to_string).join(", "),
      self.invalid_defines.iter().map(Location::to_string_without_file).sorted().join(", "),
      self.lambda_captures.iter().map(|(k, _)| k.to_string_without_file()).sorted().join(", "),
      self
        .def_to_use_map
        .iter()
        .sorted_by(|(l1, _), (l2, _)| l1.to_string_without_file().cmp(&l2.to_string_without_file()))
        .map(|(def_loc, uses)| format!(
          "{} -> [{}]",
          def_loc.to_string_without_file(),
          uses.iter().map(Location::to_string_without_file).sorted().join(", ")
        ))
        .join("\n")
    )
  }
}

impl SsaAnalysisResult {
  fn from(state: SsaAnalysisState) -> SsaAnalysisResult {
    let mut def_to_use_map: HashMap<Location, Vec<Location>> = HashMap::new();
    for (use_loc, def_loc) in &state.use_define_map {
      if let Some(uses) = def_to_use_map.get_mut(def_loc) {
        uses.push(use_loc.clone());
      } else {
        def_to_use_map.insert(def_loc.clone(), vec![use_loc.clone()]);
      }
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
  expression: &expr::E,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(error_set);
  state.visit_expression(expression);
  SsaAnalysisResult::from(state)
}

pub(super) fn perform_ssa_analysis_on_module(
  module: &Module,
  error_set: &mut ErrorSet,
) -> SsaAnalysisResult {
  let mut state = SsaAnalysisState::new(error_set);
  state.visit_module(module);
  SsaAnalysisResult::from(state)
}
