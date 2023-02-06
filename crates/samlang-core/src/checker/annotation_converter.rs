// This module should eventually be moved into type_.rs once the annot migration is complete.

use std::rc::Rc;

use super::type_::{FunctionType, IdType, PrimitiveTypeKind, Type};
use crate::ast::{source::annotation, Reason};

pub(crate) fn id_annotation_to_type(annotation: &annotation::Id) -> IdType {
  IdType {
    reason: Reason::new(annotation.location, Some(annotation.location)),
    module_reference: annotation.module_reference,
    id: annotation.id.name,
    type_arguments: annotation
      .type_arguments
      .iter()
      .map(|annot| Rc::new(annotation_to_type(annot)))
      .collect(),
  }
}

pub(crate) fn fn_annotation_to_type(annotation: &annotation::Function) -> FunctionType {
  FunctionType {
    reason: Reason::new(annotation.location, Some(annotation.location)),
    argument_types: annotation
      .argument_types
      .iter()
      .map(|annot| Rc::new(annotation_to_type(annot)))
      .collect(),
    return_type: Rc::new(annotation_to_type(&annotation.return_type)),
  }
}

pub(crate) fn annotation_to_type(annotation: &annotation::T) -> Type {
  match annotation {
    annotation::T::Primitive(loc, _, kind) => Type::Primitive(
      Reason::new(*loc, Some(*loc)),
      match kind {
        annotation::PrimitiveTypeKind::Unit => PrimitiveTypeKind::Unit,
        annotation::PrimitiveTypeKind::Bool => PrimitiveTypeKind::Bool,
        annotation::PrimitiveTypeKind::Int => PrimitiveTypeKind::Int,
        annotation::PrimitiveTypeKind::String => PrimitiveTypeKind::String,
      },
    ),
    annotation::T::Id(annot) => Type::Id(id_annotation_to_type(annot)),
    annotation::T::Fn(annot) => Type::Fn(fn_annotation_to_type(annot)),
  }
}

#[cfg(test)]
mod tests {
  use crate::{ast::source::test_builder, checker::type_::ISourceType, common::Heap};
  use pretty_assertions::assert_eq;

  #[test]
  fn conversion_test() {
    let heap = &mut Heap::new();
    let builder = test_builder::create();

    assert_eq!("unit", super::annotation_to_type(&builder.unit_annot()).pretty_print(heap));
    assert_eq!("bool", super::annotation_to_type(&builder.bool_annot()).pretty_print(heap));
    assert_eq!("int", super::annotation_to_type(&builder.int_annot()).pretty_print(heap));
    assert_eq!("string", super::annotation_to_type(&builder.string_annot()).pretty_print(heap));
    assert_eq!(
      "(bool) -> I<int>",
      super::annotation_to_type(&builder.fn_annot(
        vec![builder.bool_annot()],
        builder.general_id_annot(heap.alloc_str("I"), vec![builder.int_annot()])
      ))
      .pretty_print(heap)
    )
  }
}
