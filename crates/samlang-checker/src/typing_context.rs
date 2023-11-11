use super::{
  global_signature, ssa_analysis,
  type_::{
    EnumVariantDefinitionSignature, GlobalSignature, ISourceType, MemberSignature, NominalType,
    StructItemDefinitionSignature, Type, TypeDefinitionSignature, TypeParameterSignature,
  },
  type_system,
};
use samlang_ast::{Description, Location, Position, Reason};
use samlang_errors::{ErrorSet, StackableError};
use samlang_heap::{ModuleReference, PStr};
use std::{collections::HashMap, rc::Rc};

pub struct LocalTypingContext {
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

  pub fn possibly_in_scope_local_variables(&self, position: Position) -> Vec<(&PStr, &Type)> {
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

  pub(super) fn get_captured(&self, lambda_loc: &Location) -> HashMap<PStr, Rc<Type>> {
    let mut map = HashMap::new();
    for (name, loc) in self.ssa_analysis_result.lambda_captures.get(lambda_loc).unwrap() {
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
      self.mk_placeholder_type(reason)
    } else {
      self.error_set.report_underconstrained_error(reason.use_loc);
      Type::Any(reason, false)
    }
  }

  pub(super) fn mk_placeholder_type(&mut self, reason: Reason) -> Type {
    self.produced_placeholders = true;
    Type::Any(reason, true)
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

  pub(super) fn validate_type_instantiation_allow_abstract_types(&mut self, t: &Type) {
    self.validate_type_instantiation_customized(t, false)
  }

  pub(super) fn validate_type_instantiation_strictly(&mut self, t: &Type) {
    self.validate_type_instantiation_customized(t, true)
  }

  fn validate_type_instantiation_customized(&mut self, t: &Type, enforce_concrete_types: bool) {
    let nominal_type = match t {
      Type::Any(_, _) | Type::Primitive(_, _) | Type::Generic(_, _) => return,
      Type::Fn(f) => {
        for arg in &f.argument_types {
          self.validate_type_instantiation_customized(arg, true)
        }
        self.validate_type_instantiation_customized(&f.return_type, true);
        return;
      }
      Type::Nominal(t) => t,
    };
    for targ in &nominal_type.type_arguments {
      self.validate_type_instantiation_customized(targ, true)
    }
    if let Some(interface_info) = global_signature::resolve_interface_cx(
      self.global_signature,
      nominal_type.module_reference,
      nominal_type.id,
    ) {
      let interface_type_parameters = interface_info.type_parameters.clone();
      if interface_info.type_definition.is_none() && enforce_concrete_types {
        self.error_set.report_incompatible_type_kind_error(
          nominal_type.reason.use_loc,
          nominal_type.to_description(),
          Description::GeneralNonAbstractType,
        )
      }
      if interface_type_parameters.len() != nominal_type.type_arguments.len() {
        let mut error = StackableError::new();
        error.add_type_args_arity_error(
          nominal_type.type_arguments.len(),
          interface_type_parameters.len(),
        );
        self.error_set.report_stackable_error(nominal_type.reason.use_loc, error);
        return;
      }
      for (tparam, targ) in interface_type_parameters.into_iter().zip(&nominal_type.type_arguments)
      {
        if let Some(bound) = tparam.bound {
          if !self.is_subtype_with_id_upper(targ, &bound) {
            self.error_set.report_incompatible_subtype_error(
              targ.get_reason().use_loc,
              targ.to_description(),
              bound.to_description(),
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

  pub(super) fn get_method_type(
    &self,
    nominal_type: &NominalType,
    method_name: PStr,
    use_loc: Location,
  ) -> Option<MemberSignature> {
    global_signature::resolve_interface_cx(
      self.global_signature,
      nominal_type.module_reference,
      nominal_type.id,
    )
    .filter(|it| !it.private || nominal_type.module_reference == self.current_module_reference)?;
    if nominal_type.is_class_statics {
      let resolved = global_signature::resolve_function_signature(
        self.global_signature,
        (nominal_type.module_reference, nominal_type.id),
        method_name,
      );
      let type_info = resolved.first()?;
      if type_info.is_public || self.in_same_class(nominal_type.module_reference, nominal_type.id) {
        Some(type_info.reposition(use_loc))
      } else {
        None
      }
    } else {
      let resolved = global_signature::resolve_method_signature(
        self.global_signature,
        nominal_type,
        method_name,
      );
      let type_info = resolved.first()?;
      if type_info.is_public || self.in_same_class(nominal_type.module_reference, nominal_type.id) {
        Some(type_info.reposition(use_loc))
      } else {
        None
      }
    }
  }

  fn in_same_class(&self, module_reference: ModuleReference, class_name: PStr) -> bool {
    self.current_module_reference == module_reference && class_name == self.current_class
  }

  pub(super) fn resolve_detailed_struct_definitions_opt(
    &self,
    type_: &Type,
  ) -> Option<(ModuleReference, PStr, Vec<StructItemDefinitionSignature>)> {
    match self.resolve_type_definition(type_) {
      None | Some((_, _, TypeDefinitionSignature::Enum(_))) => None,
      Some((mod_ref, t_id, TypeDefinitionSignature::Struct(items))) => Some((mod_ref, t_id, items)),
    }
  }

  pub(super) fn resolve_detailed_enum_definitions_opt(
    &self,
    type_: &Type,
  ) -> Option<(ModuleReference, PStr, Vec<EnumVariantDefinitionSignature>)> {
    match self.resolve_type_definition(type_) {
      None | Some((_, _, TypeDefinitionSignature::Struct(_))) => None,
      Some((mod_ref, t_id, TypeDefinitionSignature::Enum(variants))) => {
        Some((mod_ref, t_id, variants))
      }
    }
  }

  pub(super) fn resolve_struct_definitions(
    &self,
    type_: &Type,
  ) -> Vec<StructItemDefinitionSignature> {
    if let Some((_, _, result)) = self.resolve_detailed_struct_definitions_opt(type_) {
      result
    } else {
      Vec::with_capacity(0)
    }
  }

  fn resolve_type_definition(
    &self,
    type_: &Type,
  ) -> Option<(ModuleReference, PStr, TypeDefinitionSignature)> {
    let nominal_type = self.nominal_type_upper_bound(type_)?;
    let resolved_type_def = global_signature::resolve_interface_cx(
      self.global_signature,
      nominal_type.module_reference,
      nominal_type.id,
    )
    .filter(|toplevel_cx| {
      !toplevel_cx.private || nominal_type.module_reference == self.current_module_reference
    })
    .and_then(|toplevel_cx| toplevel_cx.type_definition.as_ref())?;
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
    let mod_ref = nominal_type.module_reference;
    let t_id = nominal_type.id;
    match resolved_type_def {
      TypeDefinitionSignature::Struct(items) => {
        let def = TypeDefinitionSignature::Struct(
          items
            .iter()
            .map(|item| StructItemDefinitionSignature {
              name: item.name,
              type_: type_system::subst_type(&item.type_, &subst_map),
              is_public: item.is_public || nominal_type.id.eq(&self.current_class),
            })
            .collect(),
        );
        Some((mod_ref, t_id, def))
      }
      TypeDefinitionSignature::Enum(variants) => {
        let def = TypeDefinitionSignature::Enum(
          variants
            .iter()
            .map(|variant| EnumVariantDefinitionSignature {
              name: variant.name,
              types: variant
                .types
                .iter()
                .map(|it| type_system::subst_type(it, &subst_map))
                .collect(),
            })
            .collect(),
        );
        Some((mod_ref, t_id, def))
      }
    }
  }
}

impl<'a> super::pattern_matching::PatternMatchingContext for TypingContext<'a> {
  fn variant_signature_incomplete_names(
    &self,
    module_reference: ModuleReference,
    class_name: PStr,
    variant_name: &[PStr],
  ) -> HashMap<PStr, usize> {
    let mut incomplete =
      global_signature::resolve_interface_cx(self.global_signature, module_reference, class_name)
        .expect("Should not be called with invalid enum.")
        .type_definition
        .as_ref()
        .expect("Should not be called with invalid enum.")
        .as_enum()
        .expect("Should not be called with invalid enum.")
        .iter()
        .map(|variant| (variant.name, variant.types.len()))
        .collect::<HashMap<_, _>>();
    for n in variant_name {
      incomplete.remove(n);
    }
    incomplete
  }
}
