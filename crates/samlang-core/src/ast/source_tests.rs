#[cfg(test)]
mod tests {
  use super::super::source::expr::*;
  use super::super::source::*;
  use crate::{ast::loc::Location, common::Heap, common::ModuleReference};
  use std::collections::HashMap;
  use std::rc::Rc;

  #[test]
  fn boilterplate() {
    assert!(CommentKind::DOC == CommentKind::DOC.clone());
    assert!(!format!(
      "{:?}",
      Comment { kind: CommentKind::BLOCK, text: Heap::new().alloc_str("d") }.clone().text
    )
    .is_empty());
    assert!(!format!("{:?}", CommentStore::new().clone().create_comment_reference(vec![]).clone())
      .is_empty());
    assert!(!CommentStore::new().all_comments().is_empty());
    assert!(CommentStore::new().clone().get(NO_COMMENT_REFERENCE).is_empty());
    assert!(CommentStore::new().clone().get_mut(NO_COMMENT_REFERENCE).is_empty());

    assert_eq!("!", expr::UnaryOperator::NOT.clone().to_string());
    assert_eq!("-", expr::UnaryOperator::NEG.clone().to_string());

    let list = vec![
      expr::BinaryOperator::MUL,
      expr::BinaryOperator::DIV,
      expr::BinaryOperator::MOD,
      expr::BinaryOperator::PLUS,
      expr::BinaryOperator::MINUS,
      expr::BinaryOperator::CONCAT,
      expr::BinaryOperator::LT,
      expr::BinaryOperator::LE,
      expr::BinaryOperator::GT,
      expr::BinaryOperator::GE,
      expr::BinaryOperator::EQ,
      expr::BinaryOperator::NE,
      expr::BinaryOperator::AND,
      expr::BinaryOperator::OR,
    ];
    let mut p = -1;
    for op in list.iter() {
      assert!(!op.clone().to_string().is_empty());
      // Assert that the list above has precedence ordered.
      let new_p = op.precedence();
      assert!(p <= new_p);
      p = new_p;
    }
  }

  #[test]
  fn annot_pretty_print_test() {
    let mut heap = Heap::new();
    assert_eq!("true", Literal::true_literal().pretty_print(&heap));
    assert_eq!("false", Literal::false_literal().pretty_print(&heap));
    assert_eq!("0", Literal::int_literal(0).clone().pretty_print(&heap));
    assert_eq!("\"hi\"", Literal::string_literal(heap.alloc_str("hi")).clone().pretty_print(&heap));
  }

  #[test]
  fn primitive_type_kind_to_string_tests() {
    assert_eq!("any", annotation::PrimitiveTypeKind::Any.to_string());
    assert_eq!("unit", annotation::PrimitiveTypeKind::Unit.to_string());
    assert_eq!("bool", annotation::PrimitiveTypeKind::Bool.to_string());
    assert_eq!("int", annotation::PrimitiveTypeKind::Int.to_string());
    assert_eq!("string", annotation::PrimitiveTypeKind::String.to_string());
  }

  #[test]
  fn annot_build_and_clone_tests() {
    let builder = test_builder::create();
    let heap = &mut Heap::new();
    let _ = builder
      .fn_annot(
        vec![
          builder.unit_annot(),
          builder.bool_annot(),
          builder.int_annot(),
          builder.string_annot(),
        ],
        builder.simple_id_annot(heap.alloc_str("str")),
      )
      .clone();
  }

  #[test]
  fn precedence_boilerplate_tests() {
    let mut heap = Heap::new();
    let common = ExpressionCommon::dummy(());
    let zero_expr = E::Literal(ExpressionCommon::dummy(()), Literal::Int(0));

    zero_expr.precedence();
    E::ClassFn(ClassFunction {
      common: common.clone(),
      explicit_type_arguments: vec![],
      inferred_type_arguments: vec![],
      module_reference: ModuleReference::dummy(),
      class_name: Id::from(heap.alloc_str("name")),
      fn_name: Id::from(heap.alloc_str("name")),
    })
    .precedence();
    E::Block(Block { common: common.clone(), statements: vec![], expression: None }).precedence();
    E::Call(Call {
      common: common.clone(),
      callee: Box::new(zero_expr.clone()),
      arguments: vec![],
    })
    .precedence();
    E::Unary(Unary {
      common: common.clone(),
      operator: UnaryOperator::NEG,
      argument: Box::new(zero_expr.clone()),
    })
    .precedence();
    E::Binary(Binary {
      common: common.clone(),
      operator_preceding_comments: NO_COMMENT_REFERENCE,
      operator: BinaryOperator::AND,
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    })
    .precedence();
    E::IfElse(IfElse {
      common: common.clone(),
      condition: Box::new(zero_expr.clone()),
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    })
    .precedence();
    E::Match(Match { common: common.clone(), matched: Box::new(zero_expr.clone()), cases: vec![] })
      .precedence();
    E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId {
        name: Id::from(heap.alloc_str("name")),
        annotation: None,
      }],
      captured: HashMap::new(),
      body: Box::new(zero_expr.clone()),
    })
    .precedence();
  }

  #[test]
  fn toplevel_boilterplate() {
    let mut heap = Heap::new();
    assert_eq!(
      "name",
      TypeParameter { loc: Location::dummy(), name: Id::from(heap.alloc_str("name")), bound: None }
        .clone()
        .name
        .name
        .as_str(&heap)
    );

    assert_eq!(
      "s",
      AnnotatedId {
        name: Id::from(heap.alloc_str("s")),
        annotation: annotation::T::Primitive(
          Location::dummy(),
          NO_COMMENT_REFERENCE,
          annotation::PrimitiveTypeKind::Bool
        )
      }
      .name
      .name
      .as_str(&heap)
    );

    let builder = test_builder::create();

    assert!(InterfaceDeclaration {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(heap.alloc_str("")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(heap.alloc_str("")),
        type_parameters: Rc::new(vec![]),
        type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
        parameters: Rc::new(vec![])
      }]
    }
    .clone()
    .type_parameters
    .is_empty());
    assert!(ModuleMembersImport {
      loc: Location::dummy(),
      imported_members: vec![],
      imported_module: ModuleReference::dummy(),
      imported_module_loc: Location::dummy(),
    }
    .clone()
    .imported_members
    .is_empty());
    assert!(TypeDefinition {
      loc: Location::dummy(),
      is_object: true,
      names: vec![],
      mappings: HashMap::new()
    }
    .clone()
    .mappings
    .is_empty());

    let class = Toplevel::Class(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(heap.alloc_str("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: TypeDefinition {
        loc: Location::dummy(),
        is_object: true,
        names: vec![],
        mappings: HashMap::new(),
      },
      members: vec![ClassMemberDefinition {
        decl: ClassMemberDeclaration {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          is_public: true,
          is_method: true,
          name: Id::from(heap.alloc_str("")),
          type_parameters: Rc::new(vec![]),
          type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
          parameters: Rc::new(vec![]),
        },
        body: expr::E::Literal(expr::ExpressionCommon::dummy(()), Literal::Int(0)),
      }],
    });
    class.members_iter().next();
    class.loc();
    class.associated_comments();
    assert!(class.is_class());
    let interface: Toplevel<()> = Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(heap.alloc_str("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(heap.alloc_str("")),
        type_parameters: Rc::new(vec![]),
        type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
        parameters: Rc::new(vec![]),
      }],
    });
    interface.members_iter().next();
    interface.loc();
    interface.associated_comments();
    assert!(!interface.is_class());
  }
}
