use crate::{
  ast::{
    source::{annotation, TypeParameter},
    Location, Reason,
  },
  common::PStr,
  Heap, ModuleReference,
};
use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use std::{collections::HashMap, rc::Rc};

#[derive(Copy, Clone, PartialEq, Eq)]
pub(crate) enum PrimitiveTypeKind {
  Unit,
  Bool,
  Int,
  String,
}

impl ToString for PrimitiveTypeKind {
  fn to_string(&self) -> String {
    match self {
      Self::Unit => "unit".to_string(),
      Self::Bool => "bool".to_string(),
      Self::Int => "int".to_string(),
      Self::String => "string".to_string(),
    }
  }
}

pub(crate) trait ISourceType {
  fn pretty_print(&self, heap: &Heap) -> String;
  fn is_the_same_type(&self, other: &Self) -> bool;
}

#[derive(Clone)]
pub(crate) struct NominalType {
  pub(crate) reason: Reason,
  pub(crate) module_reference: ModuleReference,
  pub(crate) id: PStr,
  pub(crate) type_arguments: Vec<Rc<Type>>,
}

impl ISourceType for NominalType {
  fn pretty_print(&self, heap: &Heap) -> String {
    let NominalType { reason: _, module_reference: _, id, type_arguments } = self;
    if type_arguments.is_empty() {
      id.as_str(heap).to_string()
    } else {
      format!(
        "{}<{}>",
        id.as_str(heap),
        type_arguments.iter().map(|t| t.pretty_print(heap)).join(", ")
      )
    }
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    let NominalType { module_reference: mod_ref1, id: id1, type_arguments: targs1, .. } = self;
    let NominalType { module_reference: mod_ref2, id: id2, type_arguments: targs2, .. } = other;
    mod_ref1 == mod_ref2
      && id1 == id2
      && targs1.len() == targs2.len()
      && targs1.iter().zip(targs2.iter()).all(|(a, b)| a.is_the_same_type(b))
  }
}

impl NominalType {
  pub(crate) fn reposition(self, use_loc: Location) -> NominalType {
    NominalType {
      reason: self.reason.to_use_reason(use_loc),
      module_reference: self.module_reference,
      id: self.id,
      type_arguments: self.type_arguments,
    }
  }

  pub(crate) fn from_annotation(annotation: &annotation::Id) -> NominalType {
    NominalType {
      reason: Reason::new(annotation.location, Some(annotation.location)),
      module_reference: annotation.module_reference,
      id: annotation.id.name,
      type_arguments: annotation
        .type_arguments
        .iter()
        .map(|annot| Rc::new(Type::from_annotation(annot)))
        .collect(),
    }
  }
}

#[derive(Clone)]
pub(crate) struct FunctionType {
  pub(crate) reason: Reason,
  pub(crate) argument_types: Vec<Rc<Type>>,
  pub(crate) return_type: Rc<Type>,
}

impl ISourceType for FunctionType {
  fn pretty_print(&self, heap: &Heap) -> String {
    let FunctionType { reason: _, argument_types, return_type } = self;
    format!(
      "({}) -> {}",
      argument_types.iter().map(|t| t.pretty_print(heap)).join(", "),
      return_type.pretty_print(heap)
    )
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    let FunctionType { reason: _, argument_types: arguments1, return_type: return_t1 } = self;
    let FunctionType { reason: _, argument_types: arguments2, return_type: return_t2 } = other;
    arguments1.len() == arguments2.len()
      && arguments1.iter().zip(arguments2.iter()).all(|(a, b)| a.is_the_same_type(b))
      && return_t1.is_the_same_type(return_t2)
  }
}

impl FunctionType {
  pub(crate) fn reposition(self, use_loc: Location) -> FunctionType {
    FunctionType {
      reason: self.reason.to_use_reason(use_loc),
      argument_types: self.argument_types,
      return_type: self.return_type,
    }
  }

  pub(crate) fn from_annotation(annotation: &annotation::Function) -> FunctionType {
    FunctionType {
      reason: Reason::new(annotation.location, Some(annotation.location)),
      argument_types: annotation
        .argument_types
        .iter()
        .map(|annot| Rc::new(Type::from_annotation(annot)))
        .collect(),
      return_type: Rc::new(Type::from_annotation(&annotation.return_type)),
    }
  }
}

#[derive(Clone, EnumAsInner)]
pub(crate) enum Type {
  Any(Reason, /** is_placeholder */ bool),
  Primitive(Reason, PrimitiveTypeKind),
  Nominal(NominalType),
  Generic(Reason, PStr),
  Fn(FunctionType),
}

impl ISourceType for Type {
  fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Self::Any(_, is_placeholder) => {
        String::from(if *is_placeholder { "placeholder" } else { "any" })
      }
      Self::Primitive(_, p) => p.to_string(),
      Self::Nominal(t) => t.pretty_print(heap),
      Self::Generic(_, s) => s.as_str(heap).to_string(),
      Self::Fn(t) => t.pretty_print(heap),
    }
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::Any(_, _), Self::Any(_, _)) => true,
      (Self::Primitive(_, p1), Self::Primitive(_, p2)) => p1 == p2,
      (Self::Nominal(n1), Self::Nominal(n2)) => n1.is_the_same_type(n2),
      (Self::Generic(_, s1), Self::Generic(_, s2)) => s1 == s2,
      (Self::Fn(f1), Self::Fn(f2)) => f1.is_the_same_type(f2),
      _ => false,
    }
  }
}

impl Type {
  pub(crate) fn unit_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Unit)
  }
  pub(crate) fn bool_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Bool)
  }
  pub(crate) fn int_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Int)
  }
  pub(crate) fn string_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::String)
  }

  pub(crate) fn get_reason(&self) -> &Reason {
    match self {
      Self::Any(reason, _) => reason,
      Self::Primitive(reason, _) => reason,
      Self::Nominal(NominalType { reason, .. }) => reason,
      Self::Generic(reason, _) => reason,
      Self::Fn(FunctionType { reason, .. }) => reason,
    }
  }

  pub(crate) fn reposition(&self, use_loc: Location) -> Type {
    match self {
      Self::Any(reason, is_placeholder) => {
        Type::Any(reason.to_use_reason(use_loc), *is_placeholder)
      }
      Self::Primitive(reason, p) => Type::Primitive(reason.to_use_reason(use_loc), *p),
      Self::Nominal(NominalType { reason, module_reference, id, type_arguments }) => {
        Type::Nominal(NominalType {
          reason: reason.to_use_reason(use_loc),
          module_reference: *module_reference,
          id: *id,
          type_arguments: type_arguments.clone(),
        })
      }
      Self::Generic(reason, s) => Type::Generic(reason.to_use_reason(use_loc), *s),
      Self::Fn(FunctionType { reason, argument_types, return_type }) => Type::Fn(FunctionType {
        reason: reason.to_use_reason(use_loc),
        argument_types: argument_types.clone(),
        return_type: return_type.clone(),
      }),
    }
  }

  pub(crate) fn from_annotation(annotation: &annotation::T) -> Type {
    match annotation {
      annotation::T::Primitive(loc, _, annotation::PrimitiveTypeKind::Unit) => {
        Type::Primitive(Reason::new(*loc, Some(*loc)), PrimitiveTypeKind::Unit)
      }
      annotation::T::Primitive(loc, _, annotation::PrimitiveTypeKind::Bool) => {
        Type::Primitive(Reason::new(*loc, Some(*loc)), PrimitiveTypeKind::Bool)
      }
      annotation::T::Primitive(loc, _, annotation::PrimitiveTypeKind::Int) => {
        Type::Primitive(Reason::new(*loc, Some(*loc)), PrimitiveTypeKind::Int)
      }
      annotation::T::Primitive(loc, _, annotation::PrimitiveTypeKind::String) => {
        Type::Primitive(Reason::new(*loc, Some(*loc)), PrimitiveTypeKind::String)
      }
      annotation::T::Primitive(loc, _, annotation::PrimitiveTypeKind::Any) => {
        Type::Any(Reason::new(*loc, Some(*loc)), false)
      }
      annotation::T::Id(annot) => Type::Nominal(NominalType::from_annotation(annot)),
      annotation::T::Generic(loc, id) => Type::Generic(Reason::new(*loc, Some(*loc)), id.name),
      annotation::T::Fn(annot) => Type::Fn(FunctionType::from_annotation(annot)),
    }
  }
}

#[derive(Clone)]
pub(crate) struct TypeParameterSignature {
  pub(crate) name: PStr,
  pub(crate) bound: Option<NominalType>,
}

impl TypeParameterSignature {
  pub(crate) fn from_list(type_parameters: &[TypeParameter]) -> Vec<TypeParameterSignature> {
    let mut tparam_sigs = vec![];
    for tparam in type_parameters {
      tparam_sigs.push(TypeParameterSignature {
        name: tparam.name.name,
        bound: tparam.bound.as_ref().map(NominalType::from_annotation),
      });
    }
    tparam_sigs
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match &self.bound {
      Option::None => self.name.as_str(heap).to_string(),
      Option::Some(t) => {
        format!("{} : {}", self.name.as_str(heap), t.pretty_print(heap))
      }
    }
  }

  pub(crate) fn pretty_print_list(list: &Vec<TypeParameterSignature>, heap: &Heap) -> String {
    if list.is_empty() {
      "".to_string()
    } else {
      format!("<{}>", list.iter().map(|t| t.pretty_print(heap)).collect::<Vec<_>>().join(", "))
    }
  }
}

#[cfg(test)]
pub(crate) mod test_type_builder {
  use super::*;

  pub(crate) struct CustomizedTypeBuilder {
    reason: Reason,
    module_reference: ModuleReference,
  }

  impl CustomizedTypeBuilder {
    pub(crate) fn unit_type(&self) -> Rc<Type> {
      Rc::new(Type::unit_type(self.reason))
    }
    pub(crate) fn bool_type(&self) -> Rc<Type> {
      Rc::new(Type::bool_type(self.reason))
    }
    pub(crate) fn int_type(&self) -> Rc<Type> {
      Rc::new(Type::int_type(self.reason))
    }
    pub(crate) fn string_type(&self) -> Rc<Type> {
      Rc::new(Type::string_type(self.reason))
    }

    pub(crate) fn simple_nominal_type_unwrapped(&self, id: PStr) -> NominalType {
      NominalType {
        reason: self.reason,
        module_reference: self.module_reference,
        id,
        type_arguments: vec![],
      }
    }

    pub(crate) fn general_nominal_type_unwrapped(
      &self,
      id: PStr,
      type_arguments: Vec<Rc<Type>>,
    ) -> NominalType {
      NominalType {
        reason: self.reason,
        module_reference: self.module_reference,
        id,
        type_arguments,
      }
    }

    pub(crate) fn simple_nominal_type(&self, id: PStr) -> Rc<Type> {
      Rc::new(Type::Nominal(self.simple_nominal_type_unwrapped(id)))
    }

    pub(crate) fn general_nominal_type(&self, id: PStr, type_arguments: Vec<Rc<Type>>) -> Rc<Type> {
      Rc::new(Type::Nominal(self.general_nominal_type_unwrapped(id, type_arguments)))
    }

    pub(crate) fn generic_type(&self, id: PStr) -> Rc<Type> {
      Rc::new(Type::Generic(self.reason, id))
    }

    pub(crate) fn fun_type(
      &self,
      argument_types: Vec<Rc<Type>>,
      return_type: Rc<Type>,
    ) -> Rc<Type> {
      Rc::new(Type::Fn(FunctionType { reason: self.reason.clone(), argument_types, return_type }))
    }
  }

  pub(crate) fn create() -> CustomizedTypeBuilder {
    CustomizedTypeBuilder { reason: Reason::dummy(), module_reference: ModuleReference::dummy() }
  }
}

pub(crate) struct MemberSignature {
  pub(crate) is_public: bool,
  pub(crate) type_parameters: Vec<TypeParameterSignature>,
  pub(crate) type_: FunctionType,
}

impl MemberSignature {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let access_str = if self.is_public { "public" } else { "private" };
    let tparam_str = TypeParameterSignature::pretty_print_list(&self.type_parameters, heap);
    format!("{} {}{}", access_str, tparam_str, self.type_.pretty_print(heap))
  }
}

impl MemberSignature {
  fn create_custom_builtin_function(
    heap: &mut Heap,
    name: &'static str,
    is_public: bool,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<&'static str>,
  ) -> (PStr, MemberSignature) {
    (
      heap.alloc_str_permanent(name),
      MemberSignature {
        is_public,
        type_parameters: type_parameters
          .into_iter()
          .map(|name| TypeParameterSignature { name: heap.alloc_str_permanent(name), bound: None })
          .collect_vec(),
        type_: FunctionType { reason: Reason::builtin(), argument_types, return_type },
      },
    )
  }

  pub(super) fn create_builtin_function(
    heap: &mut Heap,
    name: &'static str,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<&'static str>,
  ) -> (PStr, MemberSignature) {
    MemberSignature::create_custom_builtin_function(
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
  ) -> (PStr, MemberSignature) {
    MemberSignature::create_custom_builtin_function(
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

  pub(super) fn reposition(&self, use_loc: Location) -> MemberSignature {
    MemberSignature {
      is_public: self.is_public,
      type_parameters: self.type_parameters.clone(),
      type_: self.type_.clone().reposition(use_loc),
    }
  }
}

pub(crate) struct InterfaceSignature {
  pub(crate) type_definition: Option<TypeDefinitionSignature>,
  pub(crate) functions: HashMap<PStr, MemberSignature>,
  pub(crate) methods: HashMap<PStr, MemberSignature>,
  pub(crate) type_parameters: Vec<TypeParameterSignature>,
  pub(crate) super_types: Vec<NominalType>,
}

impl InterfaceSignature {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push(format!(
      "{} {} : [{}]",
      if let Some(type_def) = &self.type_definition {
        format!("class({})", type_def.to_string(heap))
      } else {
        "interface".to_string()
      },
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

pub(crate) struct TypeDefinitionSignature {
  pub(crate) is_object: bool,
  pub(crate) names: Vec<PStr>,
  pub(crate) mappings: HashMap<PStr, (Rc<Type>, bool)>,
}

impl TypeDefinitionSignature {
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

pub(crate) struct ModuleSignature {
  pub(crate) interfaces: HashMap<PStr, InterfaceSignature>,
}

impl ModuleSignature {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push("\ninterfaces:".to_string());
    for (name, i) in self.interfaces.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}: {}", name.as_str(heap), i.to_string(heap)));
    }
    lines.join("\n")
  }
}

pub(crate) fn create_builtin_module_signature(heap: &mut Heap) -> ModuleSignature {
  heap.alloc_str_permanent("init");
  heap.alloc_str_permanent("this");
  let str_t = heap.alloc_str_permanent("T");
  ModuleSignature {
    interfaces: HashMap::from([(
      heap.alloc_str_permanent("Builtins"),
      InterfaceSignature {
        type_definition: Some(TypeDefinitionSignature {
          is_object: false,
          names: vec![],
          mappings: HashMap::new(),
        }),
        type_parameters: vec![],
        super_types: vec![],
        methods: HashMap::new(),
        functions: HashMap::from([
          MemberSignature::create_builtin_function(
            heap,
            "stringToInt",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int)),
            vec![],
          ),
          MemberSignature::create_builtin_function(
            heap,
            "intToString",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            vec![],
          ),
          MemberSignature::create_builtin_function(
            heap,
            "println",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Unit)),
            vec![],
          ),
          MemberSignature::create_builtin_function(
            heap,
            "panic",
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String))],
            Rc::new(Type::Generic(Reason::builtin(), str_t)),
            vec!["T"],
          ),
          MemberSignature::create_builtin_function(
            heap,
            "stringConcat",
            vec![
              Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
              Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            ],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::String)),
            vec![],
          ),
        ]),
      },
    )]),
  }
}

pub(crate) type GlobalSignature = HashMap<ModuleReference, ModuleSignature>;

#[cfg(test)]
mod type_tests {
  use super::*;
  use crate::ast::source::{test_builder, Id};
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(PrimitiveTypeKind::Unit == PrimitiveTypeKind::Unit);

    let builder = test_type_builder::create();
    builder.int_type().as_nominal();
    builder.int_type().as_generic();
    builder.int_type().as_fn();
    builder.simple_nominal_type(Heap::new().alloc_str_for_test("")).as_nominal();
    builder.fun_type(vec![], builder.int_type()).as_fn();
  }

  #[test]
  fn pretty_print_tests() {
    let builder = test_type_builder::create();
    let mut heap = Heap::new();

    assert_eq!("any", Type::Any(Reason::dummy(), false).clone().pretty_print(&heap));
    assert_eq!("placeholder", Type::Any(Reason::dummy(), true).clone().pretty_print(&heap));
    assert_eq!("unit", builder.unit_type().clone().pretty_print(&heap));
    assert_eq!("int", builder.int_type().pretty_print(&heap));
    assert_eq!("bool", builder.bool_type().pretty_print(&heap));
    assert_eq!("string", builder.string_type().pretty_print(&heap));
    assert_eq!(
      "I",
      builder.simple_nominal_type(heap.alloc_str_for_test("I")).clone().pretty_print(&heap)
    );
    assert_eq!("I", builder.generic_type(heap.alloc_str_for_test("I")).clone().pretty_print(&heap));
    assert_eq!(
      "I",
      builder
        .simple_nominal_type_unwrapped(heap.alloc_str_for_test("I"))
        .reposition(Location::dummy())
        .clone()
        .pretty_print(&heap)
    );
    assert_eq!(
      "Foo<unit, Bar>",
      builder
        .general_nominal_type(
          heap.alloc_str_for_test("Foo"),
          vec![builder.unit_type(), builder.simple_nominal_type(heap.alloc_str_for_test("Bar"))]
        )
        .clone()
        .pretty_print(&heap)
    );
    assert_eq!("() -> unit", builder.fun_type(vec![], builder.unit_type()).pretty_print(&heap));
    assert_eq!(
      "() -> unit",
      FunctionType {
        reason: Reason::dummy(),
        argument_types: vec![],
        return_type: builder.unit_type()
      }
      .clone()
      .reposition(Location::dummy())
      .pretty_print(&heap)
    );
    assert_eq!(
      "(unit) -> unit",
      builder.fun_type(vec![builder.unit_type()], builder.unit_type()).pretty_print(&heap)
    );
    assert_eq!(
      "(int, bool) -> unit",
      builder
        .fun_type(vec![builder.int_type(), builder.bool_type()], builder.unit_type())
        .clone()
        .pretty_print(&heap)
    );

    assert_eq!(
      "A",
      TypeParameterSignature::from_list(&[TypeParameter {
        loc: Location::dummy(),
        name: Id::from(heap.alloc_str_for_test("A")),
        bound: None
      }])[0]
        .pretty_print(&heap)
    );
    assert_eq!(
      "A : B",
      TypeParameterSignature::from_list(&[TypeParameter {
        loc: Location::dummy(),
        name: Id::from(heap.alloc_str_for_test("A")),
        bound: Some(annotation::Id {
          location: Location::dummy(),
          module_reference: ModuleReference::dummy(),
          id: Id::from(heap.alloc_str_for_test("B")),
          type_arguments: vec![]
        })
      }])[0]
        .pretty_print(&heap)
    );

    assert_eq!("", TypeParameterSignature::pretty_print_list(&vec![], &heap));
    assert_eq!(
      "<A : B, C>",
      TypeParameterSignature::pretty_print_list(
        &vec![
          TypeParameterSignature {
            name: heap.alloc_str_for_test("A"),
            bound: Option::Some(
              builder.simple_nominal_type_unwrapped(heap.alloc_str_for_test("B"))
            )
          },
          TypeParameterSignature { name: heap.alloc_str_for_test("C"), bound: Option::None }
        ],
        &heap
      )
    );

    assert_eq!(
      r#"
class()  : []
functions:
stringToInt: public (string) -> int
intToString: public (int) -> string
println: public (string) -> unit
panic: public <T>(string) -> T
stringConcat: public (string, string) -> string
methods:

"#
      .trim(),
      create_builtin_module_signature(&mut heap)
        .interfaces
        .get(&heap.alloc_str_for_test("Builtins"))
        .unwrap()
        .to_string(&heap)
    );
    assert_eq!(
      r#"
class(a:bool, b:(private) bool)  : []
functions:
methods:
m1: public () -> any
m2: public () -> any
"#
      .trim(),
      InterfaceSignature {
        type_definition: Some(TypeDefinitionSignature {
          is_object: true,
          names: vec![heap.alloc_str_for_test("a"), heap.alloc_str_for_test("b")],
          mappings: HashMap::from([
            (heap.alloc_str_for_test("a"), (builder.bool_type(), true)),
            (heap.alloc_str_for_test("b"), (builder.bool_type(), false)),
          ])
        }),
        type_parameters: vec![],
        super_types: vec![],
        functions: HashMap::new(),
        methods: HashMap::from([
          (
            heap.alloc_str_for_test("m1"),
            MemberSignature {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: Rc::new(Type::Any(Reason::dummy(), false))
              }
            }
          ),
          (
            heap.alloc_str_for_test("m2"),
            MemberSignature {
              is_public: true,
              type_parameters: vec![],
              type_: FunctionType {
                reason: Reason::dummy(),
                argument_types: vec![],
                return_type: Rc::new(Type::Any(Reason::dummy(), false))
              }
            }
          )
        ]),
      }
      .to_string(&heap)
    );

    let builder = test_type_builder::create();
    assert_eq!(
      "A(bool)",
      TypeDefinitionSignature {
        is_object: false,
        names: vec![heap.alloc_str_for_test("A")],
        mappings: HashMap::from([(heap.alloc_str_for_test("A"), (builder.bool_type(), true))])
      }
      .to_string(&heap)
    );

    assert_eq!(
      "private a() -> bool",
      MemberSignature::create_private_builtin_function(
        &mut heap,
        "a",
        vec![],
        builder.bool_type(),
        vec![]
      )
      .1
      .pretty_print("a", &heap)
    );
    assert_eq!(
      "public a() -> bool",
      MemberSignature::create_builtin_function(&mut heap, "a", vec![], builder.bool_type(), vec![])
        .1
        .pretty_print("a", &heap)
    );
  }

  #[test]
  fn reposition_tests() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .int_type()
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .simple_nominal_type(heap.alloc_str_for_test("I"))
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .general_nominal_type(heap.alloc_str_for_test("I"), vec![builder.unit_type()])
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .fun_type(vec![], builder.unit_type())
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
  }

  #[test]
  fn conversion_test() {
    let heap = &mut Heap::new();
    let builder = test_builder::create();

    assert_eq!("any", Type::from_annotation(&builder.any_annot()).pretty_print(heap));
    assert_eq!("unit", Type::from_annotation(&builder.unit_annot()).pretty_print(heap));
    assert_eq!("bool", Type::from_annotation(&builder.bool_annot()).pretty_print(heap));
    assert_eq!("int", Type::from_annotation(&builder.int_annot()).pretty_print(heap));
    assert_eq!("string", Type::from_annotation(&builder.string_annot()).pretty_print(heap));
    assert_eq!(
      "(bool) -> I<int, A>",
      Type::from_annotation(&builder.fn_annot(
        vec![builder.bool_annot()],
        builder.general_id_annot(
          heap.alloc_str_for_test("I"),
          vec![builder.int_annot(), builder.generic_annot(heap.alloc_str_for_test("A"))]
        )
      ))
      .pretty_print(heap)
    )
  }

  #[test]
  fn test_equality_test() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    assert!(!builder
      .unit_type()
      .is_the_same_type(&builder.simple_nominal_type(heap.alloc_str_for_test("A"))));

    assert!(Type::Any(Reason::dummy(), true).is_the_same_type(&Type::Any(Reason::dummy(), false)));
    assert!(builder.unit_type().is_the_same_type(&builder.unit_type()));
    assert!(!builder.unit_type().is_the_same_type(&builder.int_type()));

    assert!(builder
      .simple_nominal_type(heap.alloc_str_for_test("A"))
      .is_the_same_type(&builder.simple_nominal_type(heap.alloc_str_for_test("A"))));
    assert!(!builder
      .simple_nominal_type(heap.alloc_str_for_test("A"))
      .is_the_same_type(&builder.simple_nominal_type(heap.alloc_str_for_test("B"))));
    assert!(builder
      .general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.bool_type()])
      .is_the_same_type(
        &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.bool_type()])
      ));
    assert!(!builder
      .general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.bool_type()])
      .is_the_same_type(
        &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.int_type()])
      ));
    assert!(!builder.simple_nominal_type(heap.alloc_str_for_test("A")).is_the_same_type(
      &builder.general_nominal_type(heap.alloc_str_for_test("A"), vec![builder.bool_type()])
    ));

    assert!(builder
      .fun_type(vec![builder.unit_type()], builder.string_type())
      .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.string_type())));
    assert!(!builder
      .fun_type(vec![], builder.string_type())
      .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.string_type())));
    assert!(!builder
      .fun_type(vec![builder.unit_type()], builder.string_type())
      .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.int_type())));
    assert!(!builder
      .fun_type(vec![builder.unit_type()], builder.string_type())
      .is_the_same_type(&builder.fun_type(vec![builder.int_type()], builder.string_type())));
  }
}
