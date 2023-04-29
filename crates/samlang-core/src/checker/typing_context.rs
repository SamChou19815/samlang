use super::{
  checker_utils, global_signature, ssa_analysis,
  type_::{
    GlobalSignature, ISourceType, MemberSignature, NominalType, Type, TypeDefinitionSignature,
    TypeParameterSignature,
  },
};
use crate::{
  ast::{Location, Position, Reason},
  common::{Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use std::{collections::HashMap, ops::Deref, rc::Rc};

pub(crate) struct LocalTypingContext {
  type_map: HashMap<Location, Rc<Type>>,
  ssa_analysis_result: ssa_analysis::SsaAnalysisResult,
}

impl LocalTypingContext {
  pub(super) fn new(ssa_analysis_result: ssa_analysis::SsaAnalysisResult) -> LocalTypingContext {
    LocalTypingContext { type_map: HashMap::new(), ssa_analysis_result }
  }

  fn read_opt(&self, loc: &Location) -> Option<Type> {
    let def_loc = self.ssa_analysis_result.use_define_map.get(loc)?;
    Some(self.type_map.get(def_loc)?.reposition(*loc))
  }

  pub(super) fn read(&self, loc: &Location) -> Type {
    if let Some(t) = self.read_opt(loc) {
      t
    } else {
      Type::Any(Reason::new(*loc, None), false)
    }
  }

  pub(crate) fn possibly_in_scope_local_variables(
    &self,
    position: Position,
  ) -> Vec<(&PStr, &Type)> {
    let mut collector = vec![];
    for (scope_loc, map) in &self.ssa_analysis_result.local_scoped_def_locs {
      if scope_loc.contains_position(position) {
        for (name, def_loc) in map {
          if let Some(t) = self.type_map.get(def_loc) {
            collector.push((name, t.as_ref()));
          }
        }
      }
    }
    collector.sort_by_key(|(n, _)| *n);
    collector
  }

  pub(super) fn write(&mut self, loc: Location, t: Rc<Type>) {
    self.type_map.insert(loc, t);
  }

  pub(super) fn get_captured(&self, heap: &Heap, lambda_loc: &Location) -> HashMap<PStr, Rc<Type>> {
    let mut map = HashMap::new();
    for (name, loc) in self.ssa_analysis_result.lambda_captures.get(lambda_loc).unwrap() {
      let first_letter = name.as_str(heap).chars().next().unwrap();
      if first_letter.is_ascii_uppercase() {
        // We captured a type id, which we don't care.
        continue;
      }
      map.insert(*name, self.type_map.get(loc).unwrap().clone());
    }
    map
  }
}

pub(crate) struct TypingContext<'a> {
  global_signature: &'a GlobalSignature,
  pub(crate) local_typing_context: &'a mut LocalTypingContext,
  pub(crate) error_set: &'a mut ErrorSet,
  pub(crate) current_module_reference: ModuleReference,
  current_class: PStr,
  available_type_parameters: Vec<TypeParameterSignature>,
  in_synthesis_mode: bool,
  produced_placeholders: bool,
}

impl<'a> TypingContext<'a> {
  pub(crate) fn new(
    global_signature: &'a GlobalSignature,
    local_typing_context: &'a mut LocalTypingContext,
    error_set: &'a mut ErrorSet,
    current_module_reference: ModuleReference,
    current_class: PStr,
    available_type_parameters: Vec<TypeParameterSignature>,
  ) -> TypingContext<'a> {
    TypingContext {
      global_signature,
      local_typing_context,
      error_set,
      current_module_reference,
      current_class,
      available_type_parameters,
      in_synthesis_mode: false,
      produced_placeholders: false,
    }
  }

  pub(super) fn in_synthesis_mode(&self) -> bool {
    self.in_synthesis_mode
  }

  pub(super) fn run_in_synthesis_mode<R, F: FnOnce(&mut TypingContext<'a>) -> R>(
    &mut self,
    f: F,
  ) -> (R, bool) {
    let saved_in_synthesis_mode = self.in_synthesis_mode;
    let saved_produced_placeholders = self.produced_placeholders;
    self.in_synthesis_mode = true;
    let result = f(self);
    let produced = self.produced_placeholders;
    self.produced_placeholders = saved_produced_placeholders;
    self.in_synthesis_mode = saved_in_synthesis_mode;
    (result, produced)
  }

  pub(super) fn mk_underconstrained_any_type(&mut self, reason: Reason) -> Type {
    if self.in_synthesis_mode {
      self.produced_placeholders = true;
      Type::Any(reason, true)
    } else {
      self.error_set.report_underconstrained_error(reason.use_loc);
      Type::Any(reason, false)
    }
  }

  fn resolve_to_potentially_in_scope_type_parameter_bound(
    &self,
    identifier: PStr,
  ) -> Option<&NominalType> {
    self.available_type_parameters.iter().find(|it| it.name == identifier).unwrap().bound.as_ref()
  }

  pub(crate) fn nominal_type_upper_bound(&'a self, type_: &'a Type) -> Option<&'a NominalType> {
    match type_ {
      Type::Any(_, _) | Type::Primitive(_, _) | Type::Fn(_) => None,
      Type::Nominal(t) => Some(t),
      Type::Generic(_, id) => self.resolve_to_potentially_in_scope_type_parameter_bound(*id),
    }
  }

  fn is_subtype_with_id_upper(&self, lower: &Type, upper: &NominalType) -> bool {
    let interface_type = if let Some(t) = self.nominal_type_upper_bound(lower) {
      t
    } else {
      return false;
    };
    vec![interface_type]
      .into_iter()
      .chain(
        global_signature::resolve_all_transitive_super_types(self.global_signature, interface_type)
          .types
          .iter(),
      )
      .any(|super_type| super_type.is_the_same_type(upper))
  }

  pub(super) fn is_subtype(&self, lower: &Type, upper: &Type) -> bool {
    upper.as_nominal().map(|u| self.is_subtype_with_id_upper(lower, u)).unwrap_or(false)
  }

  pub(super) fn validate_type_instantiation_allow_abstract_types(&mut self, heap: &Heap, t: &Type) {
    self.validate_type_instantiation_customized(heap, t, false)
  }

  pub(super) fn validate_type_instantiation_strictly(&mut self, heap: &Heap, t: &Type) {
    self.validate_type_instantiation_customized(heap, t, true)
  }

  fn validate_type_instantiation_customized(
    &mut self,
    heap: &Heap,
    t: &Type,
    enforce_concrete_types: bool,
  ) {
    let nominal_type = match t {
      Type::Any(_, _) | Type::Primitive(_, _) | Type::Generic(_, _) => return,
      Type::Fn(f) => {
        for arg in &f.argument_types {
          self.validate_type_instantiation_customized(heap, arg, true)
        }
        self.validate_type_instantiation_customized(heap, &f.return_type, true);
        return;
      }
      Type::Nominal(t) => t,
    };
    for targ in &nominal_type.type_arguments {
      self.validate_type_instantiation_customized(heap, targ, true)
    }
    if let Some(interface_info) = global_signature::resolve_interface_cx(
      self.global_signature,
      nominal_type.module_reference,
      nominal_type.id,
    ) {
      let interface_type_parameters = interface_info.type_parameters.clone();
      if interface_info.type_definition.is_none() && enforce_concrete_types {
        self.error_set.report_incompatible_type_error(
          nominal_type.reason.use_loc,
          "non-abstract type".to_string(),
          nominal_type.pretty_print(heap),
        )
      }
      if interface_type_parameters.len() != nominal_type.type_arguments.len() {
        self.error_set.report_invalid_arity_error(
          nominal_type.reason.use_loc,
          "type arguments",
          interface_type_parameters.len(),
          nominal_type.type_arguments.len(),
        );
        return;
      }
      for (tparam, targ) in interface_type_parameters.into_iter().zip(&nominal_type.type_arguments)
      {
        if let Some(bound) = tparam.bound {
          if !self.is_subtype_with_id_upper(targ, &bound) {
            self.error_set.report_incompatible_subtype_error(
              targ.get_reason().use_loc,
              bound.pretty_print(heap),
              targ.pretty_print(heap),
            )
          }
        }
      }
    }
  }

  pub(super) fn class_exists(
    &self,
    module_reference: ModuleReference,
    toplevel_name: PStr,
  ) -> bool {
    self
      .global_signature
      .get(&module_reference)
      .and_then(|module_cx| {
        module_cx.interfaces.get(&toplevel_name).map(|sig| sig.type_definition.is_some())
      })
      .unwrap_or(false)
  }

  pub(super) fn get_function_type(
    &self,
    module_reference: ModuleReference,
    class_name: PStr,
    function_name: PStr,
    use_loc: Location,
  ) -> Option<MemberSignature> {
    let resolved = global_signature::resolve_function_signature(
      self.global_signature,
      (module_reference, class_name),
      function_name,
    );
    let type_info = resolved.first()?.deref();
    if type_info.is_public || self.in_same_class(module_reference, class_name) {
      Some(type_info.reposition(use_loc))
    } else {
      None
    }
  }

  pub(super) fn get_method_type(
    &self,
    nominal_type: &NominalType,
    method_name: PStr,
    use_loc: Location,
  ) -> Option<MemberSignature> {
    let resolved =
      global_signature::resolve_method_signature(self.global_signature, nominal_type, method_name);
    let type_info = resolved.first()?;
    if type_info.is_public || self.in_same_class(nominal_type.module_reference, nominal_type.id) {
      Some(type_info.reposition(use_loc))
    } else {
      None
    }
  }

  fn in_same_class(&self, module_reference: ModuleReference, class_name: PStr) -> bool {
    self.current_module_reference == module_reference && class_name == self.current_class
  }

  pub(super) fn resolve_type_definition(
    &self,
    type_: &Type,
    expect_object: bool,
  ) -> TypeDefinitionSignature {
    let nominal_type = match self.nominal_type_upper_bound(type_) {
      Some(t) => t,
      None => {
        return TypeDefinitionSignature {
          is_object: expect_object,
          names: vec![],
          mappings: HashMap::new(),
        }
      }
    };
    if let Some(TypeDefinitionSignature { is_object, names, mappings }) =
      global_signature::resolve_interface_cx(
        self.global_signature,
        nominal_type.module_reference,
        nominal_type.id,
      )
      .and_then(|toplevel_cx| toplevel_cx.type_definition.as_ref())
    {
      if *is_object != expect_object {
        return TypeDefinitionSignature {
          is_object: *is_object,
          names: vec![],
          mappings: HashMap::new(),
        };
      }
      let mut subst_map = HashMap::new();
      for (tparam, targ) in global_signature::resolve_interface_cx(
        self.global_signature,
        nominal_type.module_reference,
        nominal_type.id,
      )
      .unwrap()
      .type_parameters
      .iter()
      .zip(&nominal_type.type_arguments)
      {
        subst_map.insert(tparam.name, targ.clone());
      }
      let mut new_mappings = HashMap::new();
      for (name, (t, is_public)) in mappings {
        if !expect_object || nominal_type.id.eq(&self.current_class) || *is_public {
          new_mappings
            .insert(*name, (checker_utils::perform_type_substitution(t, &subst_map), *is_public));
        }
      }
      TypeDefinitionSignature {
        is_object: expect_object,
        names: names.clone(),
        mappings: new_mappings,
      }
    } else {
      TypeDefinitionSignature { is_object: expect_object, names: vec![], mappings: HashMap::new() }
    }
  }
}
