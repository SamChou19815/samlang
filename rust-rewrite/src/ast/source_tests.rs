#[cfg(test)]
mod comments_tests {
  use super::super::source::*;
  use crate::common::rcs;

  #[test]
  fn boilterplate() {
    assert_eq!("d", Comment { kind: CommentKind::BLOCK, text: rcs("d") }.clone().text.as_str())
  }
}

#[cfg(test)]
mod literal_tests {
  use super::super::source::*;
  use crate::common::rcs;

  #[test]
  fn pretty_print_test() {
    assert_eq!("true", Literal::true_literal().pretty_print());
    assert_eq!("false", Literal::false_literal().pretty_print());
    assert_eq!("0", Literal::int_literal(0).clone().pretty_print());
    assert_eq!("\"hi\"", Literal::string_literal(rcs("hi")).clone().pretty_print());
  }
}

#[cfg(test)]
mod type_tests {
  use super::super::source::*;
  use crate::ast::loc::Location;
  use crate::ast::reason::Reason;
  use crate::common::{rc, rcs};
  use std::vec;

  #[test]
  fn boilterplate() {
    assert!(PrimitiveTypeKind::Unit == PrimitiveTypeKind::Unit.clone());

    let builder = test_builder::create();
    builder.int_type().as_id();
    builder.int_type().as_fn();
    builder.simple_id_type("").as_id();
    builder.fun_type(vec![], builder.int_type()).as_fn();
  }

  #[test]
  fn pretty_print_tests() {
    let builder = test_builder::create();

    assert_eq!("unknown", Type::Unknown(Reason::dummy()).clone().pretty_print());
    assert_eq!("unit", builder.unit_type().clone().pretty_print());
    assert_eq!("int", builder.int_type().pretty_print());
    assert_eq!("bool", builder.bool_type().pretty_print());
    assert_eq!("string", builder.string_type().pretty_print());
    assert_eq!("I", builder.simple_id_type("I").clone().pretty_print());
    assert_eq!(
      "I",
      builder.simple_id_type_unwrapped("I").reposition(Location::dummy()).clone().pretty_print()
    );
    assert_eq!(
      "Foo<unit, Bar>",
      builder
        .general_id_type("Foo", vec![builder.unit_type(), builder.simple_id_type("Bar")])
        .clone()
        .pretty_print()
    );
    assert_eq!("() -> unit", builder.fun_type(vec![], builder.unit_type()).pretty_print());
    assert_eq!(
      "() -> unit",
      FunctionType {
        reason: Reason::dummy(),
        argument_types: vec![],
        return_type: builder.unit_type()
      }
      .clone()
      .reposition(Location::dummy())
      .pretty_print()
    );
    assert_eq!(
      "(unit) -> unit",
      builder.fun_type(vec![builder.unit_type()], builder.unit_type()).pretty_print()
    );
    assert_eq!(
      "(int, bool) -> unit",
      builder
        .fun_type(vec![builder.int_type(), builder.bool_type()], builder.unit_type())
        .clone()
        .pretty_print()
    );

    assert_eq!("A", TypeParameterSignature { name: rcs("A"), bound: Option::None }.pretty_print());
    assert_eq!(
      "A : B",
      TypeParameterSignature {
        name: rcs("A"),
        bound: Option::Some(rc(builder.simple_id_type_unwrapped("B")))
      }
      .clone()
      .pretty_print()
    );

    assert_eq!("", TypeParameterSignature::pretty_print_list(&vec![]));
    assert_eq!(
      "<A : B, C>",
      TypeParameterSignature::pretty_print_list(&vec![
        TypeParameterSignature {
          name: rcs("A"),
          bound: Option::Some(rc(builder.simple_id_type_unwrapped("B")))
        },
        TypeParameterSignature { name: rcs("C"), bound: Option::None }
      ])
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
      builder.simple_id_type("I").mod_reason(new_reason_f).get_reason().use_loc.to_string()
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

    assert!(!builder.unit_type().is_the_same_type(&builder.simple_id_type("A")));

    assert!(Type::Unknown(Reason::dummy()).is_the_same_type(&Type::Unknown(Reason::dummy())));
    assert!(builder.unit_type().is_the_same_type(&builder.unit_type()));
    assert!(!builder.unit_type().is_the_same_type(&builder.int_type()));

    assert!(builder.simple_id_type("A").is_the_same_type(&builder.simple_id_type("A")));
    assert!(!builder.simple_id_type("A").is_the_same_type(&builder.simple_id_type("B")));
    assert!(builder
      .general_id_type("A", vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type("A", vec![builder.bool_type()])));
    assert!(!builder
      .general_id_type("A", vec![builder.bool_type()])
      .is_the_same_type(&builder.general_id_type("A", vec![builder.int_type()])));
    assert!(!builder
      .simple_id_type("A")
      .is_the_same_type(&builder.general_id_type("A", vec![builder.bool_type()])));

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
    common::boxed,
  };
  use std::collections::HashMap;

  #[test]
  fn common_test() {
    let builder = test_builder::create();
    let common = builder.expr_common(builder.bool_type());
    let mod_common = |c: ExpressionCommon| c.clone();

    builder.zero_expr().clone().mod_common(mod_common).common();
    E::Id(common.clone(), Id::from("d")).clone().mod_common(mod_common).common();
    E::This(common.clone()).clone().mod_common(mod_common).common();
    E::ClassFn(ClassFunction {
      common: common.clone(),
      type_arguments: vec![],
      module_reference: ModuleReference::dummy(),
      class_name: Id::from("name"),
      fn_name: Id::from("name"),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::FieldAccess(FieldAccess {
      common: common.clone(),
      type_arguments: vec![],
      object: boxed(builder.true_expr()),
      field_name: Id::from("name"),
      field_order: -1,
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::MethodAccess(MethodAccess {
      common: common.clone(),
      type_arguments: vec![],
      object: boxed(builder.true_expr()),
      method_name: Id::from("name"),
    })
    .clone()
    .mod_common(mod_common)
    .common()
    .clone()
    .with_new_type(builder.int_type());
    E::Unary(Unary {
      common: common.clone(),
      operator: UnaryOperator::NEG,
      argument: boxed(builder.true_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Call(Call { common: common.clone(), callee: boxed(builder.zero_expr()), arguments: vec![] })
      .clone()
      .mod_common(mod_common)
      .common();
    E::Binary(Binary {
      common: common.clone(),
      operator_preceding_comments: vec![],
      operator: BinaryOperator::AND,
      e1: boxed(builder.zero_expr()),
      e2: boxed(builder.zero_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::IfElse(IfElse {
      common: common.clone(),
      condition: boxed(builder.zero_expr()),
      e1: boxed(builder.zero_expr()),
      e2: boxed(builder.zero_expr()),
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Match(Match {
      common: common.clone(),
      matched: boxed(builder.zero_expr()),
      cases: vec![VariantPatternToExpression {
        loc: Location::dummy(),
        tag: Id::from("name"),
        tag_order: 1,
        data_variable: None,
        body: boxed(builder.true_expr()),
      }],
    })
    .clone()
    .mod_common(mod_common)
    .common();
    E::Lambda(Lambda {
      common: common.clone(),
      parameters: vec![OptionallyAnnotatedId { name: Id::from("name"), annotation: None }],
      captured: HashMap::new(),
      body: boxed(builder.zero_expr()),
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
            field_name: Id::from("name"),
            alias: None,
            type_: builder.bool_type(),
          }],
        ),
        annotation: None,
        assigned_expression: boxed(builder.true_expr()),
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
    ast::{source::*, Location, Reason},
    common::rc,
  };
  use pretty_assertions::assert_eq;
  use std::collections::HashMap;

  #[test]
  fn boilterplate() {
    assert_eq!(
      "name",
      TypeParameter {
        loc: Location::dummy(),
        associated_comments: rc(vec![]),
        name: Id::from("name"),
        bound: None
      }
      .clone()
      .name
      .name
      .as_str()
    );

    assert_eq!(
      "s",
      AnnotatedId { name: Id::from("s"), annotation: rc(Type::int_type(Reason::dummy())) }
        .name
        .name
        .as_str()
    );

    assert_eq!(
      "int",
      FieldType { is_public: true, type_: rc(Type::int_type(Reason::dummy())) }.to_string()
    );
    assert_eq!(
      "(private) int",
      FieldType { is_public: false, type_: rc(Type::int_type(Reason::dummy())) }
        .clone()
        .to_string()
    );

    let builder = test_builder::create();
    let class = Toplevel::Class(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: rc(vec![]),
      name: Id::from("name"),
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
          associated_comments: rc(vec![]),
          is_public: true,
          is_method: true,
          name: Id::from(""),
          type_parameters: rc(vec![]),
          type_: FunctionType {
            reason: Reason::dummy(),
            argument_types: vec![],
            return_type: builder.int_type(),
          },
          parameters: rc(vec![]),
        },
        body: builder.true_expr(),
      }],
    });
    class.members_iter().next();
    class.loc();
    assert!(class.is_class());
    let interface = Toplevel::Interface(InterfaceDeclarationCommon {
      loc: Location::dummy(),
      associated_comments: rc(vec![]),
      name: Id::from("name"),
      type_parameters: vec![],
      extends_or_implements_nodes: vec![],
      type_definition: (),
      members: vec![ClassMemberDeclaration {
        loc: Location::dummy(),
        associated_comments: rc(vec![]),
        is_public: true,
        is_method: true,
        name: Id::from(""),
        type_parameters: rc(vec![]),
        type_: FunctionType {
          reason: Reason::dummy(),
          argument_types: vec![],
          return_type: builder.int_type(),
        },
        parameters: rc(vec![]),
      }],
    });
    interface.members_iter().next();
    interface.loc();
    assert!(!interface.is_class());
  }
}

#[cfg(test)]
mod builder_tests {
  use super::super::source::test_builder;

  #[test]
  fn boilterplate() {
    let builder = test_builder::create();

    builder.true_expr().common();
    builder.false_expr().type_();
    builder.zero_expr().loc();
    builder.string_expr("ouch");
    builder.id_expr("id", builder.simple_id_type("Id")).common();
  }
}
