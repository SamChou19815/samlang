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
      Comment { kind: CommentKind::BLOCK, text: Heap::new().alloc_str_for_test("d") }.clone().text
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
    assert_eq!(
      "\"hi\"",
      Literal::string_literal(heap.alloc_str_for_test("hi")).clone().pretty_print(&heap)
    );
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
        builder.simple_id_annot(heap.alloc_str_for_test("str")),
      )
      .clone()
      .associated_comments();
    builder.unit_annot().associated_comments();
    builder.simple_id_annot(heap.alloc_str_for_test("str")).associated_comments();
  }

  fn coverage_hack_for_expr(expr: expr::E<()>) {
    expr.precedence();
    assert!(expr.eq(&expr.clone()));
  }

  #[test]
  fn precedence_boilerplate_tests() {
    let mut heap = Heap::new();
    let common = ExpressionCommon::dummy(());
    let zero_expr = E::Literal(ExpressionCommon::dummy(()), Literal::Int(0));

    coverage_hack_for_expr(zero_expr.clone());
    coverage_hack_for_expr(E::ClassFn(ClassFunction {
      common: common.clone(),
      explicit_type_arguments: vec![],
      inferred_type_arguments: vec![],
      module_reference: ModuleReference::dummy(),
      class_name: Id::from(heap.alloc_str_for_test("name")),
      fn_name: Id::from(heap.alloc_str_for_test("name")),
    }));
    coverage_hack_for_expr(E::FieldAccess(FieldAccess {
      common: common.clone(),
      explicit_type_arguments: vec![],
      inferred_type_arguments: vec![],
      object: Box::new(zero_expr.clone()),
      field_name: Id::from(heap.alloc_str_for_test("name")),
      field_order: 1,
    }));
    coverage_hack_for_expr(E::MethodAccess(MethodAccess {
      common: common.clone(),
      explicit_type_arguments: vec![],
      inferred_type_arguments: vec![],
      object: Box::new(zero_expr.clone()),
      method_name: Id::from(heap.alloc_str_for_test("name")),
    }));
    coverage_hack_for_expr(E::Call(Call {
      common: common.clone(),
      callee: Box::new(zero_expr.clone()),
      arguments: vec![],
    }));
    coverage_hack_for_expr(E::Unary(Unary {
      common: common.clone(),
      operator: UnaryOperator::NEG,
      argument: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::Binary(Binary {
      common: common.clone(),
      operator_preceding_comments: NO_COMMENT_REFERENCE,
      operator: BinaryOperator::AND,
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::IfElse(IfElse {
      common: common.clone(),
      condition: Box::new(zero_expr.clone()),
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::Match(Match {
      common: common.clone(),
      matched: Box::new(zero_expr.clone()),
      cases: vec![expr::VariantPatternToExpression {
        loc: Location::dummy(),
        tag: Id::from(heap.alloc_str_for_test("name")),
        tag_order: 1,
        data_variable: None,
        body: Box::new(zero_expr.clone()),
      }],
    }));
    coverage_hack_for_expr(E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId {
        name: Id::from(heap.alloc_str_for_test("name")),
        annotation: None,
      }],
      captured: HashMap::new(),
      body: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::Block(Block {
      common: common.clone(),
      statements: vec![
        expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: expr::Pattern::Object(
            Location::dummy(),
            vec![expr::ObjectPatternDestucturedName {
              loc: Location::dummy(),
              field_order: 1,
              field_name: Id::from(heap.alloc_str_for_test("name")),
              alias: None,
              type_: (),
            }],
          ),
          annotation: Some(annotation::T::Primitive(
            Location::dummy(),
            NO_COMMENT_REFERENCE,
            annotation::PrimitiveTypeKind::Int,
          )),
          assigned_expression: Box::new(zero_expr.clone()),
        },
        expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: expr::Pattern::Wildcard(Location::dummy()),
          annotation: Some(annotation::T::Primitive(
            Location::dummy(),
            NO_COMMENT_REFERENCE,
            annotation::PrimitiveTypeKind::Int,
          )),
          assigned_expression: Box::new(zero_expr.clone()),
        },
        expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("s")),
          annotation: Some(annotation::T::Fn(annotation::Function {
            location: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            argument_types: vec![annotation::T::Id(annotation::Id {
              location: Location::dummy(),
              module_reference: ModuleReference::dummy(),
              id: Id::from(heap.alloc_str_for_test("name")),
              type_arguments: vec![],
            })],
            return_type: Box::new(annotation::T::Primitive(
              Location::dummy(),
              NO_COMMENT_REFERENCE,
              annotation::PrimitiveTypeKind::Int,
            )),
          })),
          assigned_expression: Box::new(zero_expr.clone()),
        },
      ],
      expression: Some(Box::new(zero_expr.clone())),
    }));
  }

  #[test]
  fn toplevel_boilterplate() {
    let mut heap = Heap::new();
    assert_eq!(
      "name",
      TypeParameter {
        loc: Location::dummy(),
        name: Id::from(heap.alloc_str_for_test("name")),
        bound: None
      }
      .clone()
      .name
      .name
      .as_str(&heap)
    );

    assert_eq!(
      "s",
      AnnotatedId {
        name: Id::from(heap.alloc_str_for_test("s")),
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
      name: Id::from(heap.alloc_str_for_test("")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(heap.alloc_str_for_test("")),
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
    let _ = TypeDefinition::Struct {
      loc: Location::dummy(),
      fields: vec![FieldDefinition {
        name: Id::from(heap.alloc_str_for_test("str")),
        annotation: builder.bool_annot(),
        is_public: true,
      }],
    }
    .clone();
    let enum_type_def = TypeDefinition::Enum {
      loc: Location::dummy(),
      variants: vec![VariantDefinition {
        name: Id::from(heap.alloc_str_for_test("str")),
        associated_data_type: builder.bool_annot(),
      }],
    };
    assert!(enum_type_def.clone().eq(&enum_type_def));

    assert!(AnnotatedId {
      name: Id::from(heap.alloc_str_for_test("")),
      annotation: builder.int_annot(),
    }
    .eq(&AnnotatedId {
      name: Id::from(heap.alloc_str_for_test("")),
      annotation: builder.int_annot(),
    }));
    assert!(TypeParameter {
      loc: Location::dummy(),
      name: Id::from(heap.alloc_str_for_test("")),
      bound: None,
    }
    .eq(&TypeParameter {
      loc: Location::dummy(),
      name: Id::from(heap.alloc_str_for_test("")),
      bound: None,
    }));

    let class = Toplevel::Class(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(heap.alloc_str_for_test("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: TypeDefinition::Struct {
        loc: Location::dummy(),
        fields: vec![FieldDefinition {
          name: Id::from(heap.alloc_str_for_test("str")),
          annotation: builder.bool_annot(),
          is_public: true,
        }],
      },
      members: vec![ClassMemberDefinition {
        decl: ClassMemberDeclaration {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          is_public: true,
          is_method: true,
          name: Id::from(heap.alloc_str_for_test("")),
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
    assert!(class.clone().eq(&class));
    let interface: Toplevel<()> = Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      name: Id::from(heap.alloc_str_for_test("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(heap.alloc_str_for_test("")),
        type_parameters: Rc::new(vec![]),
        type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
        parameters: Rc::new(vec![]),
      }],
    });
    assert!(interface.clone().eq(&interface));
    interface.members_iter().next();
    interface.loc();
    interface.associated_comments();
    assert!(!interface.is_class());

    let one_import = ModuleMembersImport {
      loc: Location::dummy(),
      imported_members: vec![],
      imported_module: ModuleReference::dummy(),
      imported_module_loc: Location::dummy(),
    };
    assert!(one_import.clone().eq(&one_import));

    Module {
      comment_store: CommentStore::new(),
      imports: vec![one_import],
      toplevels: vec![class, interface],
    }
    .clone()
    .comment_store
    .all_comments();
  }
}
