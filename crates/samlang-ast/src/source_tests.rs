#[cfg(test)]
mod tests {
  use super::super::loc::Location;
  use super::super::source::expr::*;
  use super::super::source::*;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::collections::HashMap;
  use std::rc::Rc;

  #[test]
  fn boilterplate() {
    let comment = Comment {
      location: Location::dummy(),
      kind: CommentKind::BLOCK,
      text: Heap::new().alloc_str_for_test("d"),
    };

    assert!(CommentKind::DOC == CommentKind::DOC.clone());
    format!("{:?}", comment.clone().text);
    format!("{:?}", CommentStore::new().clone().create_comment_reference(vec![]).clone());
    format!("{:?}", CommentStore::new().clone().create_comment_reference(vec![comment]).clone());
    CommentStore::new().all_comments();
    assert!(CommentStore::new().clone().get(NO_COMMENT_REFERENCE).iter().collect_vec().is_empty());
    assert!(CommentStore::new()
      .clone()
      .get_mut(NO_COMMENT_REFERENCE)
      .iter()
      .collect_vec()
      .is_empty());
    assert!(CommentsNode::Comments(Location::dummy(), vec![comment])
      .eq(&CommentsNode::Comments(Location::dummy(), vec![comment])));
    assert!(CommentStore::new().eq(&CommentStore::new()));

    assert_eq!("!", expr::UnaryOperator::NOT.clone().to_string());
    assert_eq!("-", expr::UnaryOperator::NEG.clone().to_string());

    let list = [
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
      assert_ne!(0, op.clone().to_string().len());
      // Assert that the list above has precedence ordered.
      let new_p = op.precedence();
      assert!(p <= new_p);
      p = new_p;
    }
  }

  #[test]
  fn pattern_matching_and_bindings_tests() {
    let mut matching_pattern: pattern::MatchingPattern<()> = pattern::MatchingPattern::Object(
      Location::dummy(),
      vec![pattern::ObjectPatternElement {
        loc: Location::dummy(),
        field_order: 0,
        field_name: Id::from(PStr::UPPER_A),
        pattern: Box::new(pattern::MatchingPattern::Wildcard(Location::dummy())),
        shorthand: false,
        type_: (),
      }],
    );
    matching_pattern.bindings();
    assert!(matching_pattern.always_matching());
    matching_pattern = pattern::MatchingPattern::Object(
      Location::dummy(),
      vec![
        pattern::ObjectPatternElement {
          loc: Location::dummy(),
          field_order: 0,
          field_name: Id::from(PStr::UPPER_A),
          pattern: Box::new(pattern::MatchingPattern::Wildcard(Location::dummy())),
          shorthand: false,
          type_: (),
        },
        pattern::ObjectPatternElement {
          loc: Location::dummy(),
          field_order: 0,
          field_name: Id::from(PStr::UPPER_A),
          pattern: Box::new(pattern::MatchingPattern::Variant(pattern::VariantPattern {
            loc: Location::dummy(),
            tag_order: 0,
            tag: Id::from(PStr::UPPER_A),
            data_variables: vec![(pattern::MatchingPattern::Wildcard(Location::dummy()), ())],
            type_: (),
          })),
          shorthand: false,
          type_: (),
        },
      ],
    );
    matching_pattern.bindings();
    assert_eq!(false, matching_pattern.always_matching());
    matching_pattern = pattern::MatchingPattern::Object(
      Location::dummy(),
      vec![
        pattern::ObjectPatternElement {
          loc: Location::dummy(),
          field_order: 0,
          field_name: Id::from(PStr::UPPER_A),
          pattern: Box::new(pattern::MatchingPattern::Variant(pattern::VariantPattern {
            loc: Location::dummy(),
            tag_order: 0,
            tag: Id::from(PStr::UPPER_A),
            data_variables: vec![(pattern::MatchingPattern::Wildcard(Location::dummy()), ())],
            type_: (),
          })),
          shorthand: false,
          type_: (),
        },
        pattern::ObjectPatternElement {
          loc: Location::dummy(),
          field_order: 0,
          field_name: Id::from(PStr::UPPER_A),
          pattern: Box::new(pattern::MatchingPattern::Wildcard(Location::dummy())),
          shorthand: false,
          type_: (),
        },
      ],
    );
    matching_pattern.bindings();
    assert_eq!(false, matching_pattern.always_matching());
    assert_eq!(*matching_pattern.loc(), Location::dummy());
    matching_pattern = pattern::MatchingPattern::Tuple(
      Location::dummy(),
      vec![pattern::TuplePatternElement {
        pattern: Box::new(pattern::MatchingPattern::Wildcard(Location::dummy())),
        type_: (),
      }],
    );
    matching_pattern.bindings();
    assert!(matching_pattern.always_matching());
    matching_pattern = pattern::MatchingPattern::Tuple(
      Location::dummy(),
      vec![pattern::TuplePatternElement {
        pattern: Box::new(pattern::MatchingPattern::Variant(pattern::VariantPattern {
          loc: Location::dummy(),
          tag_order: 0,
          tag: Id::from(PStr::UPPER_A),
          data_variables: vec![(pattern::MatchingPattern::Wildcard(Location::dummy()), ())],
          type_: (),
        })),
        type_: (),
      }],
    );
    matching_pattern.bindings();
    assert_eq!(false, matching_pattern.always_matching());
    assert_eq!(*matching_pattern.loc(), Location::dummy());
    matching_pattern = pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc: Location::dummy(),
      tag_order: 0,
      tag: Id::from(PStr::UPPER_A),
      data_variables: vec![(pattern::MatchingPattern::Wildcard(Location::dummy()), ())],
      type_: (),
    });
    matching_pattern.bindings();
    assert_eq!(false, matching_pattern.always_matching());
    assert_eq!(*matching_pattern.clone().loc(), Location::dummy());
    matching_pattern = pattern::MatchingPattern::Id(Id::from(PStr::LOWER_A), ());
    matching_pattern.bindings();
    assert!(matching_pattern.always_matching());
    assert_eq!(*matching_pattern.loc(), Location::dummy());
    matching_pattern = pattern::MatchingPattern::Wildcard(Location::dummy());
    matching_pattern.bindings();
    assert!(matching_pattern.always_matching());
    assert_eq!(*matching_pattern.loc(), Location::dummy());
    assert!(
      pattern::MatchingPattern::Variant(pattern::VariantPattern {
        loc: Location::dummy(),
        tag_order: 0,
        tag: Id::from(PStr::UPPER_A),
        data_variables: vec![],
        type_: (),
      }) == pattern::MatchingPattern::Variant(pattern::VariantPattern {
        loc: Location::dummy(),
        tag_order: 0,
        tag: Id::from(PStr::UPPER_A),
        data_variables: vec![],
        type_: (),
      })
    );
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
    builder.generic_annot(heap.alloc_str_for_test("str")).associated_comments();
    builder.simple_id_annot(heap.alloc_str_for_test("str")).associated_comments();
  }

  fn coverage_hack_for_expr(expr: expr::E<()>) {
    expr.precedence();
    expr.clone().common_mut();
    assert_eq!(expr.common().loc, expr.common().loc);
    assert!(expr.eq(&expr));
  }

  #[test]
  fn precedence_boilerplate_tests() {
    let mut heap = Heap::new();
    let common = ExpressionCommon::dummy(());
    let zero_expr = E::Literal(ExpressionCommon::dummy(()), Literal::Int(0));

    coverage_hack_for_expr(zero_expr.clone());
    coverage_hack_for_expr(E::LocalId(common.clone(), Id::from(heap.alloc_str_for_test("s"))));
    coverage_hack_for_expr(E::ClassId(
      common.clone(),
      ModuleReference::DUMMY,
      Id::from(heap.alloc_str_for_test("s")),
    ));
    coverage_hack_for_expr(E::Tuple(common.clone(), vec![zero_expr.clone(), zero_expr.clone()]));
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
      condition: Box::new(IfElseCondition::Expression(zero_expr.clone())),
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::IfElse(IfElse {
      common: common.clone(),
      condition: Box::new(IfElseCondition::Guard(
        pattern::MatchingPattern::Wildcard(Location::dummy()),
        zero_expr.clone(),
      )),
      e1: Box::new(zero_expr.clone()),
      e2: Box::new(zero_expr.clone()),
    }));
    coverage_hack_for_expr(E::Match(Match {
      common: common.clone(),
      matched: Box::new(zero_expr.clone()),
      cases: vec![expr::VariantPatternToExpression {
        loc: Location::dummy(),
        pattern: pattern::MatchingPattern::Wildcard(Location::dummy()),
        body: Box::new(zero_expr.clone()),
      }],
    }));
    coverage_hack_for_expr(E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId {
        name: Id::from(heap.alloc_str_for_test("name")),
        type_: (),
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
          pattern: pattern::MatchingPattern::Object(
            Location::dummy(),
            vec![pattern::ObjectPatternElement {
              loc: Location::dummy(),
              field_order: 0,
              field_name: Id::from(heap.alloc_str_for_test("name")),
              pattern: Box::new(pattern::MatchingPattern::Id(
                Id::from(heap.alloc_str_for_test("name")),
                (),
              )),
              shorthand: true,
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
          pattern: pattern::MatchingPattern::Tuple(
            Location::dummy(),
            vec![pattern::TuplePatternElement {
              pattern: Box::new(pattern::MatchingPattern::Id(
                Id::from(heap.alloc_str_for_test("name")),
                (),
              )),
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
          pattern: pattern::MatchingPattern::Wildcard(Location::dummy()),
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
          pattern: pattern::MatchingPattern::Id(Id::from(heap.alloc_str_for_test("s")), ()),
          annotation: Some(annotation::T::Fn(annotation::Function {
            location: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            argument_types: vec![annotation::T::Id(annotation::Id {
              location: Location::dummy(),
              module_reference: ModuleReference::DUMMY,
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
        type_: (),
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
      private: false,
      name: Id::from(PStr::LOWER_A),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(PStr::LOWER_A),
        type_parameters: Rc::new(vec![]),
        type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
        parameters: Rc::new(vec![AnnotatedId {
          name: Id::from(PStr::LOWER_A),
          type_: (),
          annotation: builder.int_annot()
        }])
      }]
    }
    .clone()
    .type_parameters
    .is_empty());
    assert!(ModuleMembersImport {
      loc: Location::dummy(),
      imported_members: vec![],
      imported_module: ModuleReference::DUMMY,
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
        associated_data_types: vec![builder.bool_annot()],
      }],
    };
    assert!(enum_type_def.clone().eq(&enum_type_def));

    assert!(AnnotatedId {
      name: Id::from(PStr::LOWER_A),
      type_: (),
      annotation: builder.int_annot(),
    }
    .eq(&AnnotatedId {
      name: Id::from(PStr::LOWER_A),
      type_: (),
      annotation: builder.int_annot(),
    }));
    assert!(TypeParameter { loc: Location::dummy(), name: Id::from(PStr::LOWER_A), bound: None }
      .eq(&TypeParameter { loc: Location::dummy(), name: Id::from(PStr::LOWER_A), bound: None }));

    let class = Toplevel::Class(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: NO_COMMENT_REFERENCE,
      private: false,
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
          name: Id::from(PStr::LOWER_A),
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
      private: false,
      name: Id::from(heap.alloc_str_for_test("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        is_public: true,
        is_method: true,
        name: Id::from(PStr::LOWER_A),
        type_parameters: Rc::new(vec![]),
        type_: builder.fn_annot_unwrapped(vec![], builder.int_annot()),
        parameters: Rc::new(vec![]),
      }],
    });
    assert!(interface.clone().eq(&interface));
    interface.members_iter().next();
    interface.loc();
    interface.associated_comments();
    assert_eq!(false, interface.is_class());

    let one_import = ModuleMembersImport {
      loc: Location::dummy(),
      imported_members: vec![],
      imported_module: ModuleReference::DUMMY,
      imported_module_loc: Location::dummy(),
    };
    assert!(one_import.clone().eq(&one_import));

    Module {
      comment_store: CommentStore::new(),
      imports: vec![one_import],
      toplevels: vec![class, interface],
      trailing_comments: NO_COMMENT_REFERENCE,
    }
    .clone()
    .comment_store
    .all_comments();
  }
}