use super::{
  checker_utils::{perform_fn_type_substitution, perform_type_substitution},
  ssa_analysis::SsaAnalysisResult,
  type_::{FunctionType, ISourceType, IdType, PrimitiveTypeKind, Type, TypeParameterSignature},
};
use crate::{
  ast::{Location, Reason},
  common::{Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  collections::{BTreeMap, HashMap},
  ops::Deref,
  rc::Rc,
};

pub(crate) struct LocalTypingContext {
  type_map: HashMap<Location, Rc<Type>>,
  ssa_analysis_result: SsaAnalysisResult,
}

impl LocalTypingContext {
  pub(super) fn new(ssa_analysis_result: SsaAnalysisResult) -> LocalTypingContext {
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
      Type::Unknown(Reason::new(*loc, None))
    }
  }

  pub(super) fn write(&mut self, loc: Location, t: Rc<Type>) {
    self.type_map.insert(loc, t);
  }

  pub(super) fn get_captured(&self, heap: &Heap, lambda_loc: &Location) -> HashMap<PStr, Rc<Type>> {
    let mut map = HashMap::new();
    for (name, loc) in self.ssa_analysis_result.lambda_captures.get(lambda_loc).unwrap() {
      let first_letter = name.as_str(heap).chars().next().unwrap();
      if ('A'..='Z').contains(&first_letter) {
        // We captured a type id, which we don't care.
        continue;
      }
      map.insert(*name, self.type_map.get(loc).unwrap().clone());
    }
    map
  }
}

pub(crate) struct MemberTypeInformation {
  pub(crate) is_public: bool,
  pub(crate) type_parameters: Vec<TypeParameterSignature>,
  pub(crate) type_: FunctionType,
}

impl MemberTypeInformation {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let access_str = if self.is_public { "public" } else { "private" };
    let tparam_str = TypeParameterSignature::pretty_print_list(&self.type_parameters, heap);
    format!("{} {}{}", access_str, tparam_str, self.type_.pretty_print(heap))
  }
}

impl MemberTypeInformation {
  fn create_custom_builtin_function(
    heap: &mut Heap,
    name: &'static str,
    is_public: bool,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<&'static str>,
  ) -> (PStr, Rc<MemberTypeInformation>) {
    (
      heap.alloc_str(name),
      Rc::new(MemberTypeInformation {
        is_public,
        type_parameters: type_parameters
          .into_iter()
          .map(|name| TypeParameterSignature { name: heap.alloc_str(name), bound: None })
          .collect_vec(),
        type_: FunctionType { reason: Reason::builtin(), argument_types, return_type },
      }),
    )
  }

  pub(super) fn create_builtin_function(
    heap: &mut Heap,
    name: &'static str,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<&'static str>,
  ) -> (PStr, Rc<MemberTypeInformation>) {
    MemberTypeInformation::create_custom_builtin_function(
      heap,
      name,
      true,
      argument_types,
      return_type,
      type_parameters,
    )
  }

  pub(super) fn create_private_builtin_function(
    heap: &mut Heap,
    name: &'static str,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<&'static str>,
  ) -> (PStr, Rc<MemberTypeInformation>) {
    MemberTypeInformation::create_custom_builtin_function(
      heap,
      name,
      false,
      argument_types,
      return_type,
      type_parameters,
    )
  }

  pub(crate) fn pretty_print(&self, name: &str, heap: &Heap) -> String {
    let access_str = if self.is_public { "public" } else { "private" };
    let tparam_str = TypeParameterSignature::pretty_print_list(&self.type_parameters, heap);
    format!("{} {}{}{}", access_str, name, tparam_str, self.type_.pretty_print(heap))
  }

  fn reposition(&self, use_loc: Location) -> MemberTypeInformation {
    MemberTypeInformation {
      is_public: self.is_public,
      type_parameters: self.type_parameters.clone(),
      type_: self.type_.clone().reposition(use_loc),
    }
  }
}

pub(crate) struct InterfaceTypingContext {
  pub(crate) is_concrete: bool,
  pub(crate) functions: Rc<BTreeMap<PStr, Rc<MemberTypeInformation>>>,
  pub(crate) methods: Rc<BTreeMap<PStr, Rc<MemberTypeInformation>>>,
  pub(crate) type_parameters: Vec<TypeParameterSignature>,
  pub(crate) super_types: Vec<IdType>,
}

impl InterfaceTypingContext {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push(format!(
      "{} {} : [{}]",
      if self.is_concrete { "class".to_string() } else { "interface".to_string() },
      TypeParameterSignature::pretty_print_list(&self.type_parameters, heap),
      self.super_types.iter().map(|it| it.pretty_print(heap)).join(", "),
    ));
    lines.push("functions:".to_string());
    for (name, info) in self.functions.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}: {}", name.as_str(heap), info.to_string(heap)));
    }
    lines.push("methods:".to_string());
    for (name, info) in self.methods.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}: {}", name.as_str(heap), info.to_string(heap)));
    }
    lines.join("\n")
  }
}

#[derive(Clone)]
pub(crate) struct TypeDefinitionTypingContext {
  pub(crate) is_object: bool,
  pub(crate) names: Vec<PStr>,
  pub(crate) mappings: HashMap<PStr, (Rc<Type>, bool)>,
}

impl TypeDefinitionTypingContext {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let is_object = self.is_object;
    let mut collector = vec![];
    for name in &self.names {
      let (t, is_public) = self.mappings.get(name).unwrap();
      let type_str =
        format!("{}{}", if *is_public { "" } else { "(private) " }, t.pretty_print(heap));
      if is_object {
        collector.push(format!("{}:{}", name.as_str(heap), type_str));
      } else {
        collector.push(format!("{}({})", name.as_str(heap), type_str));
      }
    }
    collector.join(", ")
  }
}

pub(crate) struct ModuleTypingContext {
  pub(crate) type_definitions: BTreeMap<PStr, TypeDefinitionTypingContext>,
  pub(crate) interfaces: BTreeMap<PStr, Rc<InterfaceTypingContext>>,
}

impl ModuleTypingContext {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push("type_definitions:".to_string());
    for (name, def) in self.type_definitions.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}:[{}]", name.as_str(heap), def.to_string(heap)));
    }
    lines.push("\ninterfaces:".to_string());
    for (name, i) in self.interfaces.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}: {}", name.as_str(heap), i.to_string(heap)));
    }
    lines.join("\n")
  }
}

pub(crate) fn create_builtin_module_typing_context(heap: &mut Heap) -> ModuleTypingContext {
  heap.alloc_str("init");
  heap.alloc_str("this");
  let str_t = heap.alloc_str("T");
  ModuleTypingContext {
    type_definitions: BTreeMap::new(),
    interfaces: BTreeMap::from([(
      heap.alloc_str("Builtins"),
      Rc::new(InterfaceTypingContext {
        is_concrete: true,
        type_parameters: vec![],
        super_types: vec![],
        methods: Rc::new(BTreeMap::new()),
        functions: Rc::new(BTreeMap::from([
          MemberTypeInformation::create_builtin_function(
            heap,
            "stringToInt",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int)),
            vec![],
          ),
          MemberTypeInformation::create_builtin_function(
            heap,
            "intToString",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            vec![],
          ),
          MemberTypeInformation::create_builtin_function(
            heap,
            "println",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Unit)),
            vec![],
          ),
          MemberTypeInformation::create_builtin_function(
            heap,
            "panic",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Id(IdType {
              reason: Reason::builtin(),
              module_reference: ModuleReference::root(),
              id: str_t,
              type_arguments: vec![],
            })),
            vec!["T"],
          ),
          MemberTypeInformation::create_builtin_function(
            heap,
            "stringConcat",
            vec![
              Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
              Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            ],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            vec![],
          ),
        ])),
      }),
    )]),
  }
}

pub(crate) type GlobalTypingContext = HashMap<ModuleReference, ModuleTypingContext>;

fn instantiate_interface_context(
  potentially_not_instantiated_interface_information: Rc<InterfaceTypingContext>,
  id_type: &IdType,
) -> InterfaceTypingContext {
  let mut subst_map = HashMap::new();
  for (tparam, targ) in potentially_not_instantiated_interface_information
    .type_parameters
    .iter()
    .zip(&id_type.type_arguments)
  {
    subst_map.insert(tparam.name, targ.clone());
  }
  let mut methods = BTreeMap::new();
  for (name, info) in potentially_not_instantiated_interface_information.methods.iter() {
    methods.insert(
      *name,
      Rc::new(MemberTypeInformation {
        is_public: info.is_public,
        type_parameters: info.type_parameters.clone(),
        type_: perform_fn_type_substitution(&info.type_, &subst_map),
      }),
    );
  }
  let mut super_types = potentially_not_instantiated_interface_information.super_types.clone();
  super_types.push(id_type.clone());
  InterfaceTypingContext {
    is_concrete: potentially_not_instantiated_interface_information.is_concrete,
    functions: potentially_not_instantiated_interface_information.functions.clone(),
    methods: Rc::new(methods),
    type_parameters: vec![],
    super_types,
  }
}

pub(crate) struct TypingContext<'a> {
  global_typing_context: &'a GlobalTypingContext,
  pub(crate) local_typing_context: &'a mut LocalTypingContext,
  pub(crate) error_set: &'a mut ErrorSet,
  pub(crate) current_module_reference: ModuleReference,
  pub(crate) current_class: PStr,
  pub(crate) available_type_parameters: Vec<TypeParameterSignature>,
}

impl<'a> TypingContext<'a> {
  pub(crate) fn new(
    global_typing_context: &'a GlobalTypingContext,
    local_typing_context: &'a mut LocalTypingContext,
    error_set: &'a mut ErrorSet,
    current_module_reference: ModuleReference,
    current_class: PStr,
    available_type_parameters: Vec<TypeParameterSignature>,
  ) -> TypingContext<'a> {
    TypingContext {
      global_typing_context,
      local_typing_context,
      error_set,
      current_module_reference,
      current_class,
      available_type_parameters,
    }
  }

  fn get_interface_information(
    &self,
    module_reference: &ModuleReference,
    identifier: &PStr,
  ) -> Option<Rc<InterfaceTypingContext>> {
    if let Some(relevant_type_parameter) =
      self.available_type_parameters.iter().find(|it| it.name == *identifier)
    {
      if let Some(relevant_tparam_bound) = &relevant_type_parameter.bound {
        self
          .dangerously_get_information_without_considering_type_parameters_in_bound(
            &relevant_tparam_bound.module_reference,
            &relevant_tparam_bound.id,
          )
          .map(|interface_context| {
            Rc::new(instantiate_interface_context(interface_context, relevant_tparam_bound))
          })
      } else {
        Some(Rc::new(InterfaceTypingContext {
          is_concrete: true,
          functions: Rc::new(BTreeMap::new()),
          methods: Rc::new(BTreeMap::new()),
          type_parameters: vec![],
          super_types: vec![],
        }))
      }
    } else {
      self.dangerously_get_information_without_considering_type_parameters_in_bound(
        module_reference,
        identifier,
      )
    }
  }

  fn dangerously_get_information_without_considering_type_parameters_in_bound(
    &self,
    module_reference: &ModuleReference,
    identifier: &PStr,
  ) -> Option<Rc<InterfaceTypingContext>> {
    self.global_typing_context.get(module_reference)?.interfaces.get(identifier).cloned()
  }

  pub(crate) fn is_subtype(&self, lower: &Type, upper: &Type) -> bool {
    if let Type::Id(lower_id_type) = lower {
      if let Some(interface_typing_context) =
        self.get_interface_information(&lower_id_type.module_reference, &lower_id_type.id)
      {
        if lower_id_type.type_arguments.len() != interface_typing_context.type_parameters.len() {
          return false;
        }
        let mut subst_map = HashMap::new();
        for (name, arg) in
          interface_typing_context.type_parameters.iter().zip(&lower_id_type.type_arguments)
        {
          subst_map.insert(name.name, arg.clone());
        }
        for potential_super_type in &interface_typing_context.super_types {
          let substituted_potential_super_type =
            perform_type_substitution(&Type::Id(potential_super_type.clone()), &subst_map);
          if substituted_potential_super_type.is_the_same_type(upper) {
            return true;
          }
        }
      }
    }
    false
  }

  pub(crate) fn validate_type_instantiation_allow_abstract_types(&mut self, heap: &Heap, t: &Type) {
    self.validate_type_instantiation_customized(heap, t, false)
  }

  pub(crate) fn validate_type_instantiation_strictly(&mut self, heap: &Heap, t: &Type) {
    self.validate_type_instantiation_customized(heap, t, true)
  }

  fn validate_type_instantiation_customized(
    &mut self,
    heap: &Heap,
    t: &Type,
    enforce_concrete_types: bool,
  ) {
    let id_type = match t {
      Type::Unknown(_) | Type::Primitive(_, _) => return,
      Type::Fn(f) => {
        for arg in &f.argument_types {
          self.validate_type_instantiation_customized(heap, arg, true)
        }
        self.validate_type_instantiation_customized(heap, &f.return_type, true);
        return;
      }
      Type::Id(id_type) => id_type,
    };
    // Generic type is assumed to be good, but it must have zero type args.\
    if self.available_type_parameters.iter().any(|it| it.name == id_type.id) {
      if !id_type.type_arguments.is_empty() {
        self.error_set.report_arity_mismatch_error(
          id_type.reason.use_loc,
          "type arguments",
          0,
          id_type.type_arguments.len(),
        )
      }
      return;
    }
    for targ in &id_type.type_arguments {
      self.validate_type_instantiation_customized(heap, targ, true)
    }
    if let Some(interface_info) =
      self.get_interface_information(&id_type.module_reference, &id_type.id)
    {
      if !interface_info.is_concrete && enforce_concrete_types {
        self.error_set.report_unexpected_type_kind_error(
          id_type.reason.use_loc,
          "non-abstract type".to_string(),
          id_type.pretty_print(heap),
        )
      }
      if interface_info.type_parameters.len() != id_type.type_arguments.len() {
        self.error_set.report_arity_mismatch_error(
          id_type.reason.use_loc,
          "type arguments",
          interface_info.type_parameters.len(),
          id_type.type_arguments.len(),
        );
        return;
      }
      for (tparam, targ) in interface_info.type_parameters.iter().zip(&id_type.type_arguments) {
        if let Some(bound) = &tparam.bound {
          if !self.is_subtype(targ, &Type::Id(bound.deref().clone())) {
            self.error_set.report_unexpected_subtype_error(
              targ.get_reason().use_loc,
              bound.pretty_print(heap),
              targ.pretty_print(heap),
            )
          }
        }
      }
    }
  }

  pub(crate) fn get_function_type(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
    function_name: &PStr,
    use_loc: Location,
  ) -> Option<MemberTypeInformation> {
    let relevant_class = self.get_interface_information(module_reference, class_name)?;
    let type_info = relevant_class.functions.get(function_name)?;
    if type_info.is_public || self.in_same_class(module_reference, class_name) {
      Some(type_info.reposition(use_loc))
    } else {
      None
    }
  }

  pub(crate) fn get_method_type(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
    method_name: &PStr,
    class_type_arguments: Vec<Rc<Type>>,
    use_loc: Location,
  ) -> Option<MemberTypeInformation> {
    let relevant_class = self.get_interface_information(module_reference, class_name)?;
    let instantiated_cx = instantiate_interface_context(
      relevant_class,
      &IdType {
        reason: Reason::new(use_loc, None),
        module_reference: *module_reference,
        id: *class_name,
        type_arguments: class_type_arguments,
      },
    );
    let type_info = instantiated_cx.methods.get(method_name)?;
    if type_info.is_public || self.in_same_class(module_reference, class_name) {
      Some(type_info.reposition(use_loc))
    } else {
      None
    }
  }

  fn in_same_class(&self, module_reference: &ModuleReference, class_name: &PStr) -> bool {
    self.current_module_reference.eq(module_reference) && *class_name == self.current_class
  }

  pub(crate) fn resolve_type_definition(
    &self,
    id_type: &IdType,
    expect_object: bool,
  ) -> TypeDefinitionTypingContext {
    let relevant_type_parameters =
      if let Some(cx) = self.get_interface_information(&id_type.module_reference, &id_type.id) {
        cx.type_parameters.clone()
      } else {
        vec![]
      };
    if let Some(TypeDefinitionTypingContext { is_object, names, mappings }) = self
      .global_typing_context
      .get(&id_type.module_reference)
      .and_then(|d| d.type_definitions.get(&id_type.id))
    {
      if *is_object != expect_object {
        return TypeDefinitionTypingContext {
          is_object: *is_object,
          names: vec![],
          mappings: HashMap::new(),
        };
      }
      let mut subst_map = HashMap::new();
      for (tparam, targ) in relevant_type_parameters.into_iter().zip(&id_type.type_arguments) {
        subst_map.insert(tparam.name, targ.clone());
      }
      let mut new_mappings = HashMap::new();
      for (name, (t, is_public)) in mappings {
        new_mappings.insert(*name, (perform_type_substitution(t, &subst_map), *is_public));
      }
      TypeDefinitionTypingContext {
        is_object: expect_object,
        names: names.clone(),
        mappings: new_mappings,
      }
    } else {
      TypeDefinitionTypingContext {
        is_object: expect_object,
        names: vec![],
        mappings: HashMap::new(),
      }
    }
  }
}
