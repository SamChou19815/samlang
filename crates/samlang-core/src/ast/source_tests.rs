#[cfg(test)]
mod comments_tests {
  use super::super::source::*;
  use crate::common::PStr;

  #[test]
  fn boilterplate() {
    assert!(!format!(
      "{:?}",
      Comment { kind: CommentKind::BLOCK, text: PStr::permanent("d") }.clone().text
    )
    .is_empty());
  }
}

#[cfg(test)]
mod literal_tests {
  use super::super::source::*;
  use crate::common::{Heap, PStr};

  #[test]
  fn pretty_print_test() {
    let heap = Heap::new();
    assert_eq!("true", Literal::true_literal().pretty_print(&heap));
    assert_eq!("false", Literal::false_literal().pretty_print(&heap));
    assert_eq!("0", Literal::int_literal(0).clone().pretty_print(&heap));
    assert_eq!(
      "\"hi\"",
      Literal::string_literal(PStr::permanent("hi")).clone().pretty_print(&heap)
    );
  }
}

#[cfg(test)]
mod type_tests {
  use super::super::source::*;
  use crate::ast::loc::Location;
  use crate::ast::reason::Reason;
  use crate::common::{Heap, PStr};
  use std::rc::Rc;
  use std::vec;

  #[test]
  fn boilterplate() {
    assert!(PrimitiveTypeKind::Unit == PrimitiveTypeKind::Unit.clone());
    assert!(CommentKind::DOC == CommentKind::DOC.clone());

    let builder = test_builder::create();
    builder.int_type().as_id();
    builder.int_type().as_fn();
    builder.simple_id_type(PStr::permanent("")).as_id();
    builder.fun_type(vec![], builder.int_type()).as_fn();
  }

  #[test]
  fn pretty_print_tests() {
    let builder = test_builder::create();
    let heap = Heap::new();

    assert_eq!("unknown", Type::Unknown(Reason::dummy()).clone().pretty_print(&heap));
    assert_eq!("unit", builder.unit_type().clone().pretty_print(&heap));
    assert_eq!("int", builder.int_type().pretty_print(&heap));
    assert_eq!("bool", builder.bool_type().pretty_print(&heap));
    assert_eq!("string", builder.string_type().pretty_print(&heap));
    assert_eq!("I", builder.simple_id_type(PStr::permanent("I")).clone().pretty_print(&heap));
    assert_eq!(
      "I",
      builder
        .simple_id_type_unwrapped(PStr::permanent("I"))
        .reposition(Location::dummy())
        .clone()
        .pretty_print(&heap)
    );
    assert_eq!(
      "Foo<unit, Bar>",
      builder
        .general_id_type(
          PStr::permanent("Foo"),
          vec![builder.unit_type(), builder.simple_id_type(PStr::permanent("Bar"))]
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
      TypeParameter {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        name: Id::from(PStr::permanent("A")),
        bound: Option::None
      }
      .pretty_print(&heap)
    );
    assert_eq!(
      "A: B",
      TypeParameter {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        name: Id::from(PStr::permanent("A")),
        bound: Option::Some(Rc::new(builder.simple_id_type_unwrapped(PStr::permanent("B"))))
      }
      .pretty_print(&heap)
    );

    assert_eq!(
      "A",
      TypeParameterSignature { name: PStr::permanent("A"), bound: Option::None }
        .pretty_print(&heap)
    );
    assert_eq!(
      "A : B",
      TypeParameterSignature {
        name: PStr::permanent("A"),
        bound: Option::Some(Rc::new(builder.simple_id_type_unwrapped(PStr::permanent("B"))))
      }
      .clone()
      .pretty_print(&heap)
    );

    assert_eq!("", TypeParameterSignature::pretty_print_list(&vec![], &heap));
    assert_eq!(
      "<A : B, C>",
      TypeParameterSignature::pretty_print_list(
        &vec![
          TypeParameterSignature {
            name: PStr::permanent("A"),
            bound: Option::Some(Rc::new(builder.simple_id_type_unwrapped(PStr::permanent("B"))))
          },
          TypeParameterSignature { name: PStr::permanent("C"), bound: Option::None }
        ],
        &heap
      )
    );
  }

  fn new_reason_f(_: &Reason) -> Reason {
    Reason::new(Location::from_pos(1, 2, 3, 4), Option::None)
  }

  #[test]
  fn mod_reason_tests() {
    let builder = test_builder::create();

    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      Type::Unknown(Reason::dummy()).mod_reason(new_reason_f).get_reason().use_loc.to_string()
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder.int_type().mod_reason(new_reason_f).get_reason().use_loc.to_string()
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder.int_type().mod_reason(new_reason_f).get_reason().use_loc.to_string()
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .simple_id_type(PStr::permanent("I"))
        .mod_reason(new_reason_f)
        .get_reason()
        .use_loc
        .to_string()
    );
    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .fun_type(vec![], builder.unit_type())
        .mod_reason(new_reason_f)
        .get_reason()
        .use_loc
        .to_string()
    );
  }

  #[test]
  fn reposition_tests() {
    let builder = test_builder::create();

    assert_eq!(
      "__DUMMY__.sam:2:3-4:5",
      builder
        .int_type()
        .reposition(Location::from_pos(1, 2, 3, 4))
        .get_reason()
        .use_loc
        .to_string()
    );
  }

  #[test]
  fn test_equality_test() {
    let builder = test_builder::create();

    assert!(!builder.unit_type().is_the_same_type(&builder.simple_id_type(PStr::permanent("A"))));

    assert!(Type::Unknown(Reason::dummy()).is_the_same_type(&Type::Unknown(Reason::dummy())));
    assert!(builder.unit_type().is_the_same_type(&builder.unit_type()));
    assert!(!builder.unit_type().is_the_same_type(&builder.int_type()));

    assert!(builder
      .simple_id_type(PStr::permanent("A"))
      .is_the_same_type(&builder.simple_id_type(PStr::permanent("A"))));
    assert!(!builder
      .simple_id_type(PStr::permanent("A"))
      .is_the_same_type(&builder.simple_id_type(PStr::permanent("B"))));
    assert!(builder
      .general_id_type(PStr::permanent("A"), vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type(PStr::permanent("A"), vec![builder.bool_type()])));
    assert!(!builder
      .general_id_type(PStr::permanent("A"), vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type(PStr::permanent("A"), vec![builder.int_type()])));
    assert!(!builder
      .simple_id_type(PStr::permanent("A"))
      .is_the_same_type(&builder.general_id_type(PStr::permanent("A"), vec![builder.bool_type()])));

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

#[cfg(test)]
mod operators_tests {
  use super::super::source::expr::*;

  #[test]
  fn boilterplate() {
    assert_eq!("!", UnaryOperator::NOT.clone().to_string());
    assert_eq!("-", UnaryOperator::NEG.clone().to_string());

    let list = vec![
      BinaryOperator::MUL,
      BinaryOperator::DIV,
      BinaryOperator::MOD,
      BinaryOperator::PLUS,
      BinaryOperator::MINUS,
      BinaryOperator::CONCAT,
      BinaryOperator::LT,
      BinaryOperator::LE,
      BinaryOperator::GT,
      BinaryOperator::GE,
      BinaryOperator::EQ,
      BinaryOperator::NE,
      BinaryOperator::AND,
      BinaryOperator::OR,
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
}

#[cfg(test)]
mod expressions_tests {
  use super::super::source::expr::*;
  use super::super::source::*;
  use crate::{
    ast::loc::{Location, ModuleReference},
    common::PStr,
  };
  use std::collections::HashMap;

  #[test]
  fn precedence_boilerplate_tests() {
    let builder = test_builder::create();
    let common = builder.expr_common(builder.bool_type());

    builder.zero_expr().precedence();
    E::ClassFn(ClassFunction {
      common: common.clone(),
      type_arguments: vec![],
      module_reference: ModuleReference::dummy(),
      class_name: Id::from(PStr::permanent("name")),
      fn_name: Id::from(PStr::permanent("name")),
    })
    .precedence();
    E::Block(Block { common: common.clone(), statements: vec![], expression: None }).precedence();
    E::Call(Call {
      common: common.clone(),
      callee: Box::new(builder.zero_expr()),
      arguments: vec![],
    })
    .precedence();
    E::Unary(Unary {
      common: common.clone(),
      operator: UnaryOperator::NEG,
      argument: Box::new(builder.true_expr()),
    })
    .precedence();
    E::Binary(Binary {
      common: common.clone(),
      operator_preceding_comments: vec![],
      operator: BinaryOperator::AND,
      e1: Box::new(builder.zero_expr()),
      e2: Box::new(builder.zero_expr()),
    })
    .precedence();
    E::IfElse(IfElse {
      common: common.clone(),
      condition: Box::new(builder.zero_expr()),
      e1: Box::new(builder.zero_expr()),
      e2: Box::new(builder.zero_expr()),
    })
    .precedence();
    E::Match(Match {
      common: common.clone(),
      matched: Box::new(builder.zero_expr()),
      cases: vec![],
    })
    .precedence();
    E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId {
        name: Id::from(PStr::permanent("name")),
        annotation: None,
      }],
      captured: HashMap::new(),
      body: Box::new(builder.zero_expr()),
    })
    .precedence();
  }

  #[test]
  fn common_test() {
    let builder = test_builder::create();
    let common = builder.expr_common(builder.bool_type());
    let mod_common = |c: ExpressionCommon| c.clone();

    builder.zero_expr().clone().mod_common(mod_common).common();
    E::Id(common.clone(), Id::from(PStr::permanent("d"))).clone().mod_common(mod_common).common();
    E::This(common.clone()).clone().mod_common(mod_common).common();
    E::ClassFn(ClassFunction {
      common: common.clone(),
      type_arguments: vec![],
      module_reference: ModuleReference::dummy(),
      class_name: Id::from(PStr::permanent("name")),
      fn_name: Id::from(PStr::permanent("name")),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::FieldAccess(FieldAccess {
      common: common.clone(),
      type_arguments: vec![],
      object: Box::new(builder.true_expr()),
      field_name: Id::from(PStr::permanent("name")),
      field_order: -1,
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::MethodAccess(MethodAccess {
      common: common.clone(),
      type_arguments: vec![],
      object: Box::new(builder.true_expr()),
      method_name: Id::from(PStr::permanent("name")),
    })
    .clone()
    .mod_common(mod_common)
    .common()
    .clone()
    .with_new_type(builder.int_type());
    E::Unary(Unary {
      common: common.clone(),
      operator: UnaryOperator::NEG,
      argument: Box::new(builder.true_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Call(Call {
      common: common.clone(),
      callee: Box::new(builder.zero_expr()),
      arguments: vec![],
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Binary(Binary {
      common: common.clone(),
      operator_preceding_comments: vec![],
      operator: BinaryOperator::AND,
      e1: Box::new(builder.zero_expr()),
      e2: Box::new(builder.zero_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::IfElse(IfElse {
      common: common.clone(),
      condition: Box::new(builder.zero_expr()),
      e1: Box::new(builder.zero_expr()),
      e2: Box::new(builder.zero_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Match(Match {
      common: common.clone(),
      matched: Box::new(builder.zero_expr()),
      cases: vec![VariantPatternToExpression {
        loc: Location::dummy(),
        tag: Id::from(PStr::permanent("name")),
        tag_order: 1,
        data_variable: None,
        body: Box::new(builder.true_expr()),
      }],
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId {
        name: Id::from(PStr::permanent("name")),
        annotation: None,
      }],
      captured: HashMap::new(),
      body: Box::new(builder.zero_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Block(Block {
      common: common.clone(),
      statements: vec![DeclarationStatement {
        loc: Location::dummy(),
        associated_comments: vec![],
        pattern: Pattern::Object(
          Location::dummy(),
          vec![ObjectPatternDestucturedName {
            loc: Location::dummy(),
            field_order: 0,
            field_name: Id::from(PStr::permanent("name")),
            alias: None,
            type_: builder.bool_type(),
          }],
        ),
        annotation: None,
        assigned_expression: Box::new(builder.true_expr()),
      }],
      expression: None,
    })
    .clone()
    .mod_common(mod_common)
    .common();
  }
}

#[cfg(test)]
mod toplevel_tests {
  use crate::{
    ast::{source::*, Location, ModuleReference, Reason},
    common::{Heap, PStr},
  };
  use pretty_assertions::assert_eq;
  use std::{collections::HashMap, rc::Rc};

  #[test]
  fn boilterplate() {
    let heap = Heap::new();
    assert_eq!(
      "name",
      TypeParameter {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        name: Id::from(PStr::permanent("name")),
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
        name: Id::from(PStr::permanent("s")),
        annotation: Rc::new(Type::int_type(Reason::dummy()))
      }
      .name
      .name
      .as_str(&heap)
    );

    assert_eq!(
      "int",
      FieldType { is_public: true, type_: Rc::new(Type::int_type(Reason::dummy())) }
        .to_string(&heap)
    );
    assert_eq!(
      "(private) int",
      FieldType { is_public: false, type_: Rc::new(Type::int_type(Reason::dummy())) }
        .clone()
        .to_string(&heap)
    );

    let builder = test_builder::create();

    assert!(InterfaceDeclaration {
      loc: Location::dummy(),
      associated_comments: Rc::new(vec![]),
      name: Id::from(PStr::permanent("")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: true,
        is_method: true,
        name: Id::from(PStr::permanent("")),
        type_parameters: Rc::new(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type()
        },
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
      associated_comments: Rc::new(vec![]),
      name: Id::from(PStr::permanent("name")),
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
          associated_comments: Rc::new(vec![]),
          is_public: true,
          is_method: true,
          name: Id::from(PStr::permanent("")),
          type_parameters: Rc::new(vec![]),
          type_: FunctionType {
            reason: Reason::dummy(),
            argument_types: vec![],
            return_type: builder.int_type(),
          },
          parameters: Rc::new(vec![]),
        },
        body: builder.true_expr(),
      }],
    });
    class.members_iter().next();
    class.loc();
    class.associated_comments();
    assert!(class.is_class());
    let interface = Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: Rc::new(vec![]),
      name: Id::from(PStr::permanent("name")),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: Rc::new(vec![]),
        is_public: true,
        is_method: true,
        name: Id::from(PStr::permanent("")),
        type_parameters: Rc::new(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
        parameters: Rc::new(vec![]),
      }],
    });
    interface.members_iter().next();
    interface.loc();
    interface.associated_comments();
    assert!(!interface.is_class());
  }
}

#[cfg(test)]
mod builder_tests {
  use super::super::source::test_builder;
  use crate::common::PStr;

  #[test]
  fn boilterplate() {
    let builder = test_builder::create();

    builder.true_expr().common();
    builder.false_expr().type_();
    builder.zero_expr().loc();
    builder.string_expr(PStr::permanent("ouch"));
    builder.id_expr(PStr::permanent("id"), builder.simple_id_type(PStr::permanent("Id"))).common();
  }
}
