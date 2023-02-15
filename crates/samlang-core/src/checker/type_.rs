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
use std::rc::Rc;

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
pub(crate) struct IdType {
  pub(crate) reason: Reason,
  pub(crate) module_reference: ModuleReference,
  pub(crate) id: PStr,
  pub(crate) type_arguments: Vec<Rc<Type>>,
}

impl ISourceType for IdType {
  fn pretty_print(&self, heap: &Heap) -> String {
    let IdType { reason: _, module_reference: _, id, type_arguments } = self;
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
    let IdType { module_reference: mod_ref1, id: id1, type_arguments: targs1, .. } = self;
    let IdType { module_reference: mod_ref2, id: id2, type_arguments: targs2, .. } = other;
    mod_ref1 == mod_ref2
      && id1 == id2
      && targs1.len() == targs2.len()
      && targs1.iter().zip(targs2.iter()).all(|(a, b)| a.is_the_same_type(b))
  }
}

impl IdType {
  pub(crate) fn reposition(self, use_loc: Location) -> IdType {
    IdType {
      reason: self.reason.to_use_reason(use_loc),
      module_reference: self.module_reference,
      id: self.id,
      type_arguments: self.type_arguments,
    }
  }

  pub(crate) fn from_annotation(annotation: &annotation::Id) -> IdType {
    IdType {
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
  Unknown(Reason),
  Primitive(Reason, PrimitiveTypeKind),
  Id(IdType),
  Fn(FunctionType),
}

impl ISourceType for Type {
  fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Self::Unknown(_) => String::from("unknown"),
      Self::Primitive(_, p) => p.to_string(),
      Self::Id(id_type) => id_type.pretty_print(heap),
      Self::Fn(fn_type) => fn_type.pretty_print(heap),
    }
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::Unknown(_), Self::Unknown(_)) => true,
      (Self::Primitive(_, p1), Self::Primitive(_, p2)) => *p1 == *p2,
      (Self::Id(id1), Self::Id(id2)) => id1.is_the_same_type(id2),
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
      Self::Unknown(reason) => reason,
      Self::Primitive(reason, _) => reason,
      Self::Id(IdType { reason, .. }) => reason,
      Self::Fn(FunctionType { reason, .. }) => reason,
    }
  }

  pub(crate) fn reposition(&self, use_loc: Location) -> Type {
    match self {
      Self::Unknown(reason) => Type::Unknown(reason.to_use_reason(use_loc)),
      Self::Primitive(reason, p) => Type::Primitive(reason.to_use_reason(use_loc), *p),
      Self::Id(IdType { reason, module_reference, id, type_arguments }) => Type::Id(IdType {
        reason: reason.to_use_reason(use_loc),
        module_reference: *module_reference,
        id: *id,
        type_arguments: type_arguments.clone(),
      }),
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
        Type::Unknown(Reason::new(*loc, Some(*loc)))
      }
      annotation::T::Id(annot) => Type::Id(IdType::from_annotation(annot)),
      annotation::T::Fn(annot) => Type::Fn(FunctionType::from_annotation(annot)),
    }
  }
}

#[derive(Clone)]
pub(crate) struct TypeParameterSignature {
  pub(crate) name: PStr,
  pub(crate) bound: Option<Rc<IdType>>,
}

impl TypeParameterSignature {
  pub(crate) fn from(type_parameter: &TypeParameter) -> TypeParameterSignature {
    TypeParameterSignature {
      name: type_parameter.name.name,
      bound: type_parameter.bound.as_ref().map(|b| Rc::new(IdType::from_annotation(b))),
    }
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match &self.bound {
      Option::None => self.name.as_str(heap).to_string(),
      Option::Some(id_type) => {
        format!("{} : {}", self.name.as_str(heap), id_type.pretty_print(heap))
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

    pub(crate) fn simple_id_type_unwrapped(&self, id: PStr) -> IdType {
      IdType {
        reason: self.reason,
        module_reference: self.module_reference,
        id,
        type_arguments: vec![],
      }
    }

    pub(crate) fn general_id_type_unwrapped(
      &self,
      id: PStr,
      type_arguments: Vec<Rc<Type>>,
    ) -> IdType {
      IdType { reason: self.reason, module_reference: self.module_reference, id, type_arguments }
    }

    pub(crate) fn simple_id_type(&self, id: PStr) -> Rc<Type> {
      Rc::new(Type::Id(self.simple_id_type_unwrapped(id)))
    }

    pub(crate) fn general_id_type(&self, id: PStr, type_arguments: Vec<Rc<Type>>) -> Rc<Type> {
      Rc::new(Type::Id(self.general_id_type_unwrapped(id, type_arguments)))
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

#[cfg(test)]
mod type_tests {
  use super::*;
  use crate::ast::source::{test_builder, Id};

  #[test]
  fn boilterplate() {
    assert!(PrimitiveTypeKind::Unit == PrimitiveTypeKind::Unit);

    let builder = test_type_builder::create();
    builder.int_type().as_id();
    builder.int_type().as_fn();
    builder.simple_id_type(Heap::new().alloc_str("")).as_id();
    builder.fun_type(vec![], builder.int_type()).as_fn();
  }

  #[test]
  fn pretty_print_tests() {
    let builder = test_type_builder::create();
    let mut heap = Heap::new();

    assert_eq!("unknown", Type::Unknown(Reason::dummy()).clone().pretty_print(&heap));
    assert_eq!("unit", builder.unit_type().clone().pretty_print(&heap));
    assert_eq!("int", builder.int_type().pretty_print(&heap));
    assert_eq!("bool", builder.bool_type().pretty_print(&heap));
    assert_eq!("string", builder.string_type().pretty_print(&heap));
    assert_eq!("I", builder.simple_id_type(heap.alloc_str("I")).clone().pretty_print(&heap));
    assert_eq!(
      "I",
      builder
        .simple_id_type_unwrapped(heap.alloc_str("I"))
        .reposition(Location::dummy())
        .clone()
        .pretty_print(&heap)
    );
    assert_eq!(
      "Foo<unit, Bar>",
      builder
        .general_id_type(
          heap.alloc_str("Foo"),
          vec![builder.unit_type(), builder.simple_id_type(heap.alloc_str("Bar"))]
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
      TypeParameterSignature::from(&TypeParameter {
        loc: Location::dummy(),
        name: Id::from(heap.alloc_str("A")),
        bound: None
      })
      .pretty_print(&heap)
    );
    assert_eq!(
      "A : B",
      TypeParameterSignature::from(&TypeParameter {
        loc: Location::dummy(),
        name: Id::from(heap.alloc_str("A")),
        bound: Some(annotation::Id {
          location: Location::dummy(),
          module_reference: ModuleReference::dummy(),
          id: Id::from(heap.alloc_str("B")),
          type_arguments: vec![]
        })
      })
      .pretty_print(&heap)
    );

    assert_eq!("", TypeParameterSignature::pretty_print_list(&vec![], &heap));
    assert_eq!(
      "<A : B, C>",
      TypeParameterSignature::pretty_print_list(
        &vec![
          TypeParameterSignature {
            name: heap.alloc_str("A"),
            bound: Option::Some(Rc::new(builder.simple_id_type_unwrapped(heap.alloc_str("B"))))
          },
          TypeParameterSignature { name: heap.alloc_str("C"), bound: Option::None }
        ],
        &heap
      )
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
        .simple_id_type(heap.alloc_str("I"))
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .pretty_print(&Heap::new())
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .general_id_type(heap.alloc_str("I"), vec![builder.unit_type()])
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

    assert_eq!("unknown", Type::from_annotation(&builder.any_annot()).pretty_print(heap));
    assert_eq!("unit", Type::from_annotation(&builder.unit_annot()).pretty_print(heap));
    assert_eq!("bool", Type::from_annotation(&builder.bool_annot()).pretty_print(heap));
    assert_eq!("int", Type::from_annotation(&builder.int_annot()).pretty_print(heap));
    assert_eq!("string", Type::from_annotation(&builder.string_annot()).pretty_print(heap));
    assert_eq!(
      "(bool) -> I<int>",
      Type::from_annotation(&builder.fn_annot(
        vec![builder.bool_annot()],
        builder.general_id_annot(heap.alloc_str("I"), vec![builder.int_annot()])
      ))
      .pretty_print(heap)
    )
  }

  #[test]
  fn test_equality_test() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    assert!(!builder.unit_type().is_the_same_type(&builder.simple_id_type(heap.alloc_str("A"))));

    assert!(Type::Unknown(Reason::dummy()).is_the_same_type(&Type::Unknown(Reason::dummy())));
    assert!(builder.unit_type().is_the_same_type(&builder.unit_type()));
    assert!(!builder.unit_type().is_the_same_type(&builder.int_type()));

    assert!(builder
      .simple_id_type(heap.alloc_str("A"))
      .is_the_same_type(&builder.simple_id_type(heap.alloc_str("A"))));
    assert!(!builder
      .simple_id_type(heap.alloc_str("A"))
      .is_the_same_type(&builder.simple_id_type(heap.alloc_str("B"))));
    assert!(builder
      .general_id_type(heap.alloc_str("A"), vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type(heap.alloc_str("A"), vec![builder.bool_type()])));
    assert!(!builder
      .general_id_type(heap.alloc_str("A"), vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type(heap.alloc_str("A"), vec![builder.int_type()])));
    assert!(!builder
      .simple_id_type(heap.alloc_str("A"))
      .is_the_same_type(&builder.general_id_type(heap.alloc_str("A"), vec![builder.bool_type()])));

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
