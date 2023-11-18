use enum_as_inner::EnumAsInner;
use itertools::Itertools;
use samlang_ast::{
  source::{annotation, TypeParameter},
  Description, Location, Reason,
};
use samlang_heap::{Heap, ModuleReference, PStr};
use std::{collections::HashMap, rc::Rc};

#[derive(Copy, Clone, PartialEq, Eq)]
pub enum PrimitiveTypeKind {
  Unit,
  Bool,
  Int,
}

impl ToString for PrimitiveTypeKind {
  fn to_string(&self) -> String {
    match self {
      Self::Unit => "unit".to_string(),
      Self::Bool => "bool".to_string(),
      Self::Int => "int".to_string(),
    }
  }
}

impl PrimitiveTypeKind {
  pub fn to_description(self) -> Description {
    match self {
      PrimitiveTypeKind::Unit => Description::UnitType,
      PrimitiveTypeKind::Bool => Description::BoolType,
      PrimitiveTypeKind::Int => Description::IntType,
    }
  }
}

pub trait ISourceType {
  fn pretty_print(&self, heap: &Heap) -> String;
  fn to_description(&self) -> Description;
  fn is_the_same_type(&self, other: &Self) -> bool;
}

#[derive(Clone)]
pub struct NominalType {
  pub reason: Reason,
  pub is_class_statics: bool,
  pub module_reference: ModuleReference,
  pub id: PStr,
  pub type_arguments: Vec<Rc<Type>>,
}

impl ISourceType for NominalType {
  fn pretty_print(&self, heap: &Heap) -> String {
    let NominalType { reason: _, is_class_statics, module_reference: _, id, type_arguments } = self;
    let prefix = if *is_class_statics { "class " } else { "" };
    if type_arguments.is_empty() {
      format!("{}{}", prefix, id.as_str(heap))
    } else {
      format!(
        "{}{}<{}>",
        prefix,
        id.as_str(heap),
        type_arguments.iter().map(|t| t.pretty_print(heap)).join(", ")
      )
    }
  }

  fn to_description(&self) -> Description {
    if self.is_class_statics {
      debug_assert!(self.type_arguments.is_empty());
      Description::Class(self.id)
    } else {
      Description::NominalType {
        name: self.id,
        type_args: self.type_arguments.iter().map(|t| t.to_description()).collect(),
      }
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
  pub fn reposition(self, use_loc: Location) -> NominalType {
    NominalType {
      reason: self.reason.to_use_reason(use_loc),
      is_class_statics: self.is_class_statics,
      module_reference: self.module_reference,
      id: self.id,
      type_arguments: self.type_arguments,
    }
  }

  pub fn from_annotation(annotation: &annotation::Id) -> NominalType {
    NominalType {
      reason: Reason::new(annotation.location, Some(annotation.location)),
      is_class_statics: false,
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
pub struct FunctionType {
  pub reason: Reason,
  pub argument_types: Vec<Rc<Type>>,
  pub return_type: Rc<Type>,
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

  fn to_description(&self) -> Description {
    Description::FunctionType(
      self.argument_types.iter().map(|t| t.to_description()).collect(),
      Box::new(self.return_type.to_description()),
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
  pub fn reposition(self, use_loc: Location) -> FunctionType {
    FunctionType {
      reason: self.reason.to_use_reason(use_loc),
      argument_types: self.argument_types,
      return_type: self.return_type,
    }
  }

  pub fn from_annotation(annotation: &annotation::Function) -> FunctionType {
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
pub enum Type {
  Any(Reason, bool), // bool: is_placeholder
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

  fn to_description(&self) -> Description {
    match self {
      Self::Any(_, _) => Description::AnyType,
      Self::Primitive(_, p) => p.to_description(),
      Self::Nominal(t) => t.to_description(),
      Self::Generic(_, s) => Description::GenericType(*s),
      Self::Fn(t) => t.to_description(),
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
  pub fn unit_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Unit)
  }
  pub fn bool_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Bool)
  }
  pub fn int_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Int)
  }

  pub fn get_reason(&self) -> &Reason {
    match self {
      Self::Any(reason, _) => reason,
      Self::Primitive(reason, _) => reason,
      Self::Nominal(NominalType { reason, .. }) => reason,
      Self::Generic(reason, _) => reason,
      Self::Fn(FunctionType { reason, .. }) => reason,
    }
  }

  pub fn reposition(&self, use_loc: Location) -> Type {
    match self {
      Self::Any(reason, is_placeholder) => {
        Type::Any(reason.to_use_reason(use_loc), *is_placeholder)
      }
      Self::Primitive(reason, p) => Type::Primitive(reason.to_use_reason(use_loc), *p),
      Self::Nominal(NominalType {
        reason,
        is_class_statics,
        module_reference,
        id,
        type_arguments,
      }) => Type::Nominal(NominalType {
        reason: reason.to_use_reason(use_loc),
        is_class_statics: *is_class_statics,
        module_reference: *module_reference,
        id: *id,
        type_arguments: type_arguments.clone(),
      }),
      Self::Generic(reason, s) => Type::Generic(reason.to_use_reason(use_loc), *s),
      Self::Fn(FunctionType { reason, argument_types, return_type }) => Type::Fn(FunctionType {
        reason: reason.to_use_reason(use_loc),
        argument_types: argument_types.clone(),
        return_type: return_type.clone(),
      }),
    }
  }

  pub fn from_annotation(annotation: &annotation::T) -> Type {
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
pub struct TypeParameterSignature {
  pub name: PStr,
  pub bound: Option<NominalType>,
}

impl TypeParameterSignature {
  pub fn from_list(type_parameters: &[TypeParameter]) -> Vec<TypeParameterSignature> {
    let mut tparam_sigs = vec![];
    for tparam in type_parameters {
      tparam_sigs.push(TypeParameterSignature {
        name: tparam.name.name,
        bound: tparam.bound.as_ref().map(NominalType::from_annotation),
      });
    }
    tparam_sigs
  }

  pub fn to_description(&self) -> Description {
    Description::TypeParameter(self.name, self.bound.as_ref().map(|t| Box::new(t.to_description())))
  }

  pub fn pretty_print(&self, heap: &Heap) -> String {
    self.to_description().pretty_print(heap)
  }

  pub fn pretty_print_list(list: &Vec<TypeParameterSignature>, heap: &Heap) -> String {
    if list.is_empty() {
      "".to_string()
    } else {
      format!("<{}>", list.iter().map(|t| t.pretty_print(heap)).collect::<Vec<_>>().join(", "))
    }
  }
}

pub mod test_type_builder {
  use super::*;

  pub struct CustomizedTypeBuilder {
    reason: Reason,
    module_reference: ModuleReference,
  }

  impl CustomizedTypeBuilder {
    pub fn unit_type(&self) -> Rc<Type> {
      Rc::new(Type::unit_type(self.reason))
    }
    pub fn bool_type(&self) -> Rc<Type> {
      Rc::new(Type::bool_type(self.reason))
    }
    pub fn int_type(&self) -> Rc<Type> {
      Rc::new(Type::int_type(self.reason))
    }

    pub fn string_type(&self) -> Rc<Type> {
      Rc::new(Type::Nominal(NominalType {
        reason: self.reason,
        is_class_statics: false,
        module_reference: ModuleReference::ROOT,
        id: PStr::STR_TYPE,
        type_arguments: vec![],
      }))
    }

    pub fn simple_nominal_type_unwrapped(&self, id: PStr) -> NominalType {
      NominalType {
        reason: self.reason,
        is_class_statics: false,
        module_reference: self.module_reference,
        id,
        type_arguments: vec![],
      }
    }

    pub fn general_nominal_type_unwrapped(
      &self,
      id: PStr,
      type_arguments: Vec<Rc<Type>>,
    ) -> NominalType {
      NominalType {
        reason: self.reason,
        is_class_statics: false,
        module_reference: self.module_reference,
        id,
        type_arguments,
      }
    }

    pub fn simple_nominal_type(&self, id: PStr) -> Rc<Type> {
      Rc::new(Type::Nominal(self.simple_nominal_type_unwrapped(id)))
    }

    pub fn general_nominal_type(&self, id: PStr, type_arguments: Vec<Rc<Type>>) -> Rc<Type> {
      Rc::new(Type::Nominal(self.general_nominal_type_unwrapped(id, type_arguments)))
    }

    pub fn generic_type(&self, id: PStr) -> Rc<Type> {
      Rc::new(Type::Generic(self.reason, id))
    }

    pub fn fun_type(&self, argument_types: Vec<Rc<Type>>, return_type: Rc<Type>) -> Rc<Type> {
      Rc::new(Type::Fn(FunctionType { reason: self.reason, argument_types, return_type }))
    }
  }

  pub fn create() -> CustomizedTypeBuilder {
    CustomizedTypeBuilder { reason: Reason::dummy(), module_reference: ModuleReference::DUMMY }
  }
}

pub struct MemberSignature {
  pub is_public: bool,
  pub type_parameters: Vec<TypeParameterSignature>,
  pub type_: FunctionType,
}

impl MemberSignature {
  #[cfg(test)]
  pub fn to_string(&self, heap: &Heap) -> String {
    let access_str = if self.is_public { "public" } else { "private" };
    let tparam_str = TypeParameterSignature::pretty_print_list(&self.type_parameters, heap);
    format!("{} {}{}", access_str, tparam_str, self.type_.pretty_print(heap))
  }
}

impl MemberSignature {
  fn create_custom_builtin_function(
    name: PStr,
    is_public: bool,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<PStr>,
  ) -> (PStr, MemberSignature) {
    (
      name,
      MemberSignature {
        is_public,
        type_parameters: type_parameters
          .into_iter()
          .map(|name| TypeParameterSignature { name, bound: None })
          .collect_vec(),
        type_: FunctionType { reason: Reason::builtin(), argument_types, return_type },
      },
    )
  }

  pub(super) fn create_builtin_function(
    name: PStr,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<PStr>,
  ) -> (PStr, MemberSignature) {
    MemberSignature::create_custom_builtin_function(
      name,
      true,
      argument_types,
      return_type,
      type_parameters,
    )
  }

  #[cfg(test)]
  pub(super) fn create_private_builtin_function(
    name: PStr,
    argument_types: Vec<Rc<Type>>,
    return_type: Rc<Type>,
    type_parameters: Vec<PStr>,
  ) -> (PStr, MemberSignature) {
    MemberSignature::create_custom_builtin_function(
      name,
      false,
      argument_types,
      return_type,
      type_parameters,
    )
  }

  pub fn pretty_print(&self, name: &str, heap: &Heap) -> String {
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

pub struct InterfaceSignature {
  pub private: bool,
  pub type_definition: Option<TypeDefinitionSignature>,
  pub functions: HashMap<PStr, MemberSignature>,
  pub methods: HashMap<PStr, MemberSignature>,
  pub type_parameters: Vec<TypeParameterSignature>,
  pub super_types: Vec<NominalType>,
}

impl InterfaceSignature {
  #[cfg(test)]
  pub fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push(format!(
      "{}{} {} : [{}]",
      if self.private { "private " } else { "" },
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

pub struct StructItemDefinitionSignature {
  pub name: PStr,
  pub type_: Rc<Type>,
  pub is_public: bool,
}

pub struct EnumVariantDefinitionSignature {
  pub name: PStr,
  pub types: Vec<Rc<Type>>,
}

#[derive(EnumAsInner)]
pub enum TypeDefinitionSignature {
  Struct(Vec<StructItemDefinitionSignature>),
  Enum(Vec<EnumVariantDefinitionSignature>),
}

impl TypeDefinitionSignature {
  pub fn to_string(&self, heap: &Heap) -> String {
    let mut collector = vec![];
    match self {
      TypeDefinitionSignature::Struct(items) => {
        for StructItemDefinitionSignature { name, type_, is_public } in items {
          collector.push(format!(
            "{}:{}{}",
            name.as_str(heap),
            if *is_public { "" } else { "(private) " },
            type_.pretty_print(heap)
          ));
        }
      }
      TypeDefinitionSignature::Enum(variants) => {
        for EnumVariantDefinitionSignature { name, types } in variants {
          let mut line = name.as_str(heap).to_string();
          let mut iterator = types.iter();
          if let Some(first) = iterator.next() {
            line.push('(');
            line.push_str(&first.pretty_print(heap));
            for t in iterator {
              line.push_str(", ");
              line.push_str(&t.pretty_print(heap));
            }
            line.push(')');
          }
          collector.push(line);
        }
      }
    }
    collector.join(", ")
  }
}

pub struct ModuleSignature {
  pub interfaces: HashMap<PStr, InterfaceSignature>,
}

impl ModuleSignature {
  #[cfg(test)]
  pub fn to_string(&self, heap: &Heap) -> String {
    let mut lines = vec![];
    lines.push("\ninterfaces:".to_string());
    for (name, i) in self.interfaces.iter().sorted_by(|p1, p2| p1.0.cmp(p2.0)) {
      lines.push(format!("{}: {}", name.as_str(heap), i.to_string(heap)));
    }
    lines.join("\n")
  }
}

pub fn create_builtin_module_signature() -> ModuleSignature {
  ModuleSignature {
    interfaces: HashMap::from([
      (
        PStr::PROCESS_TYPE,
        InterfaceSignature {
          private: false,
          type_definition: Some(TypeDefinitionSignature::Enum(vec![])),
          type_parameters: vec![],
          super_types: vec![],
          methods: HashMap::new(),
          functions: HashMap::from([
            MemberSignature::create_builtin_function(
              PStr::PRINTLN,
              vec![Rc::new(Type::Nominal(NominalType {
                reason: Reason::builtin(),
                is_class_statics: false,
                module_reference: ModuleReference::ROOT,
                id: PStr::STR_TYPE,
                type_arguments: vec![],
              }))],
              Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Unit)),
              vec![],
            ),
            MemberSignature::create_builtin_function(
              PStr::PANIC,
              vec![Rc::new(Type::Nominal(NominalType {
                reason: Reason::builtin(),
                is_class_statics: false,
                module_reference: ModuleReference::ROOT,
                id: PStr::STR_TYPE,
                type_arguments: vec![],
              }))],
              Rc::new(Type::Generic(Reason::builtin(), PStr::UPPER_T)),
              vec![PStr::UPPER_T],
            ),
          ]),
        },
      ),
      (
        PStr::STR_TYPE,
        InterfaceSignature {
          private: false,
          type_definition: Some(TypeDefinitionSignature::Enum(vec![])),
          functions: HashMap::from([MemberSignature::create_builtin_function(
            PStr::FROM_INT,
            vec![Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int))],
            Rc::new(Type::Nominal(NominalType {
              reason: Reason::builtin(),
              is_class_statics: false,
              module_reference: ModuleReference::ROOT,
              id: PStr::STR_TYPE,
              type_arguments: vec![],
            })),
            vec![],
          )]),
          methods: HashMap::from([MemberSignature::create_builtin_function(
            PStr::TO_INT,
            vec![],
            Rc::new(Type::Primitive(Reason::builtin(), PrimitiveTypeKind::Int)),
            vec![],
          )]),
          type_parameters: vec![],
          super_types: vec![],
        },
      ),
    ]),
  }
}

pub type GlobalSignature = HashMap<ModuleReference, ModuleSignature>;

#[cfg(test)]
mod type_tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::source::{test_builder, Id};

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
    assert_eq!("Str", builder.string_type().pretty_print(&heap));
    assert_eq!(
      "I",
      builder.simple_nominal_type(heap.alloc_str_for_test("I")).clone().pretty_print(&heap)
    );
    assert_eq!(
      "class I",
      NominalType {
        reason: Reason::dummy(),
        is_class_statics: true,
        module_reference: ModuleReference::DUMMY,
        id: heap.alloc_str_for_test("I"),
        type_arguments: vec![]
      }
      .pretty_print(&heap)
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
        name: Id::from(PStr::UPPER_A),
        bound: None
      }])[0]
        .pretty_print(&heap)
    );
    assert_eq!(
      "A : B",
      TypeParameterSignature::from_list(&[TypeParameter {
        loc: Location::dummy(),
        name: Id::from(PStr::UPPER_A),
        bound: Some(annotation::Id {
          location: Location::dummy(),
          module_reference: ModuleReference::DUMMY,
          id: Id::from(PStr::UPPER_B),
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
            name: PStr::UPPER_A,
            bound: Option::Some(builder.simple_nominal_type_unwrapped(PStr::UPPER_B))
          },
          TypeParameterSignature { name: PStr::UPPER_C, bound: Option::None }
        ],
        &heap
      )
    );

    assert_eq!(
      r#"
class()  : []
functions:
panic: public <T>(Str) -> T
println: public (Str) -> unit
methods:

"#
      .trim(),
      create_builtin_module_signature()
        .interfaces
        .get(&PStr::PROCESS_TYPE)
        .unwrap()
        .to_string(&heap)
    );
    assert_eq!(
      r#"
private class(a:bool, b:(private) bool)  : []
functions:
methods:
m1: public () -> any
m2: public () -> any
"#
      .trim(),
      InterfaceSignature {
        private: true,
        type_definition: Some(TypeDefinitionSignature::Struct(vec![
          StructItemDefinitionSignature {
            name: PStr::LOWER_A,
            type_: builder.bool_type(),
            is_public: true
          },
          StructItemDefinitionSignature {
            name: PStr::LOWER_B,
            type_: builder.bool_type(),
            is_public: false
          },
        ])),
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
      TypeDefinitionSignature::Enum(vec![EnumVariantDefinitionSignature {
        name: PStr::UPPER_A,
        types: vec![builder.bool_type()]
      }])
      .to_string(&heap)
    );
    assert_eq!(
      "B(bool, bool)",
      TypeDefinitionSignature::Enum(vec![EnumVariantDefinitionSignature {
        name: PStr::UPPER_B,
        types: vec![builder.bool_type(), builder.bool_type()]
      }])
      .to_string(&heap)
    );
    assert_eq!(
      "C",
      TypeDefinitionSignature::Enum(vec![EnumVariantDefinitionSignature {
        name: PStr::UPPER_C,
        types: vec![]
      }])
      .to_string(&heap)
    );

    assert_eq!(
      "private a() -> bool",
      MemberSignature::create_private_builtin_function(
        PStr::LOWER_A,
        vec![],
        builder.bool_type(),
        vec![]
      )
      .1
      .pretty_print("a", &heap)
    );
    assert_eq!(
      "public a() -> bool",
      MemberSignature::create_builtin_function(PStr::LOWER_A, vec![], builder.bool_type(), vec![])
        .1
        .pretty_print("a", &heap)
    );
  }

  #[test]
  fn description_tests() {
    let builder = test_type_builder::create();
    let mut heap = Heap::new();

    assert_eq!("any", Type::Any(Reason::dummy(), false).to_description().pretty_print(&heap));
    assert_eq!("unit", builder.unit_type().to_description().pretty_print(&heap));
    assert_eq!("int", builder.int_type().to_description().pretty_print(&heap));
    assert_eq!("bool", builder.bool_type().to_description().pretty_print(&heap));
    assert_eq!("Str", builder.string_type().to_description().pretty_print(&heap));
    assert_eq!(
      "class I",
      NominalType {
        reason: Reason::dummy(),
        is_class_statics: true,
        module_reference: ModuleReference::DUMMY,
        id: heap.alloc_str_for_test("I"),
        type_arguments: vec![]
      }
      .to_description()
      .pretty_print(&heap)
    );
    assert_eq!(
      "I",
      builder.generic_type(heap.alloc_str_for_test("I")).to_description().pretty_print(&heap)
    );
    assert_eq!(
      "Foo<unit, Bar>",
      builder
        .general_nominal_type(
          heap.alloc_str_for_test("Foo"),
          vec![builder.unit_type(), builder.simple_nominal_type(heap.alloc_str_for_test("Bar"))]
        )
        .to_description()
        .pretty_print(&heap)
    );
    assert_eq!(
      "() -> unit",
      FunctionType {
        reason: Reason::dummy(),
        argument_types: vec![],
        return_type: builder.unit_type()
      }
      .to_description()
      .pretty_print(&heap)
    );
    assert_eq!(
      "(unit) -> unit",
      builder
        .fun_type(vec![builder.unit_type()], builder.unit_type())
        .to_description()
        .pretty_print(&heap)
    );
  }

  #[test]
  fn reposition_tests() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    assert_eq!(
      "DUMMY.sam:2:3-4:5",
      builder
        .int_type()
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "DUMMY.sam:2:3-4:5",
      builder
        .simple_nominal_type(heap.alloc_str_for_test("I"))
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "DUMMY.sam:2:3-4:5",
      builder
        .general_nominal_type(heap.alloc_str_for_test("I"), vec![builder.unit_type()])
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "DUMMY.sam:2:3-4:5",
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
    assert_eq!("Str", Type::from_annotation(&builder.string_annot()).pretty_print(heap));
    assert_eq!(
      "(bool) -> I<int, A>",
      Type::from_annotation(&builder.fn_annot(
        vec![builder.bool_annot()],
        builder.general_id_annot(
          heap.alloc_str_for_test("I"),
          vec![builder.int_annot(), builder.generic_annot(PStr::UPPER_A)]
        )
      ))
      .pretty_print(heap)
    )
  }

  #[test]
  fn test_equality_test() {
    let builder = test_type_builder::create();

    assert_eq!(
      false,
      builder.unit_type().is_the_same_type(&builder.simple_nominal_type(PStr::UPPER_A))
    );

    assert_eq!(
      true,
      Type::Any(Reason::dummy(), true).is_the_same_type(&Type::Any(Reason::dummy(), false))
    );
    assert_eq!(true, builder.unit_type().is_the_same_type(&builder.unit_type()));
    assert_eq!(false, builder.unit_type().is_the_same_type(&builder.int_type()));

    assert!(builder
      .simple_nominal_type(PStr::UPPER_A)
      .is_the_same_type(&builder.simple_nominal_type(PStr::UPPER_A)));
    assert_eq!(
      false,
      builder
        .simple_nominal_type(PStr::UPPER_A)
        .is_the_same_type(&builder.simple_nominal_type(PStr::UPPER_B))
    );
    assert_eq!(
      true,
      builder
        .general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()])
        .is_the_same_type(&builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()]))
    );
    assert_eq!(
      false,
      builder
        .general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()])
        .is_the_same_type(&builder.general_nominal_type(PStr::UPPER_A, vec![builder.int_type()]))
    );
    assert_eq!(
      false,
      builder
        .simple_nominal_type(PStr::UPPER_A)
        .is_the_same_type(&builder.general_nominal_type(PStr::UPPER_A, vec![builder.bool_type()]))
    );

    assert_eq!(
      true,
      builder
        .fun_type(vec![builder.unit_type()], builder.string_type())
        .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.string_type()))
    );
    assert_eq!(
      false,
      builder
        .fun_type(vec![], builder.string_type())
        .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.string_type()))
    );
    assert_eq!(
      false,
      builder
        .fun_type(vec![builder.unit_type()], builder.string_type())
        .is_the_same_type(&builder.fun_type(vec![builder.unit_type()], builder.int_type()))
    );
    assert_eq!(
      false,
      builder
        .fun_type(vec![builder.unit_type()], builder.string_type())
        .is_the_same_type(&builder.fun_type(vec![builder.int_type()], builder.string_type()))
    );
  }
}
