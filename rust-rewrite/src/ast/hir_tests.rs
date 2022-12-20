#[cfg(test)]
mod tests {
  use super::super::hir::*;
  use crate::common::rcs;
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    assert!(!format!(
      "{:?}",
      Expression::var_name("a", Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")]))
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::var_name_str(
        rcs("a"),
        Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")])
      )
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::fn_name("a", Type::new_fn(vec![INT_TYPE], INT_TYPE).as_fn().unwrap().clone())
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::StringName(rcs("a"))).is_empty());
    assert!(!format!("{:?}", Operator::GE).is_empty());
    assert!(!format!("{:?}", ZERO.type_()).is_empty());
    assert!(!format!("{:?}", FALSE.type_()).is_empty());
    assert!(!format!("{:?}", Expression::var_name("a", INT_TYPE).type_().as_fn()).is_empty());
    assert!(!format!("{:?}", Expression::StringName(rcs("a")).type_().as_id()).is_empty());
    assert!(!GenenalLoopVariable {
      name: rcs(""),
      type_: INT_TYPE,
      initial_value: ZERO,
      loop_value: ZERO
    }
    .to_string()
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::fn_name("a", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE)).type_()
    )
    .is_empty());
    assert!(PrimitiveType::Int.eq(&PrimitiveType::Int));
    assert_eq!(PrimitiveType::Int, PrimitiveType::Int);
    Expression::FunctionName(FunctionName {
      name: rcs(""),
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      type_arguments: vec![INT_TYPE],
    })
    .as_callee();
    Expression::var_name("", INT_TYPE).as_callee();
    Expression::StringName(rcs("")).as_callee();
    ZERO.as_callee();
    Expression::var_name("a", INT_TYPE).as_function_name();
    Statement::Break(ZERO).as_binary();
    Statement::binary("name", Operator::DIV, ZERO, ZERO).clone().as_binary();
    Statement::Call {
      callee: Callee::FunctionName(FunctionName {
        name: rcs(""),
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        type_arguments: vec![INT_TYPE],
      }),
      arguments: vec![],
      return_type: INT_TYPE,
      return_collector: None,
    }
    .clone()
    .as_binary();

    assert!(
      Expression::var_name(
        "a",
        Type::new_fn(vec![INT_TYPE], Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")]))
      ) == Expression::var_name(
        "a",
        Type::new_fn(vec![INT_TYPE], Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")]))
      )
    );
    assert!(Expression::var_name(
      "a",
      Type::new_fn(vec![INT_TYPE], Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")]))
    )
    .eq(&Expression::var_name(
      "a",
      Type::new_fn(vec![INT_TYPE], Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")]))
    )));
    assert!(Type::new_fn(
      vec![INT_TYPE],
      Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")])
    )
    .eq(
      &(Type::new_fn(
        vec![INT_TYPE],
        Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")])
      ))
    ));
    let mut hasher = DefaultHasher::new();
    Expression::var_name(
      "a",
      Type::new_fn(vec![INT_TYPE], Type::new_id("A", vec![INT_TYPE, Type::new_id_no_targs("B")])),
    )
    .hash(&mut hasher);
    Operator::DIV.hash(&mut hasher);
    Statement::binary_flexible_unwrapped(rcs(""), Operator::DIV, ZERO, ZERO);
    FunctionName::new("", Type::new_fn_unwrapped(vec![], INT_TYPE)).hash(&mut hasher);
  }

  #[test]
  fn print_types_and_expressions_tests() {
    assert_eq!("bool", BOOL_TYPE.clone().pretty_print());
    assert_eq!("int", INT_TYPE.pretty_print());
    assert_eq!("string", STRING_TYPE.pretty_print());
    assert_eq!("0", ZERO.clone().debug_print());
    assert_eq!("(a: int)", Expression::var_name("a", INT_TYPE).debug_print());
    assert_eq!(
      "(a: A<int, B>)",
      Expression::var_name("a", Type::new_id("A", vec![INT_TYPE, (Type::new_id_no_targs("B"))]))
        .clone()
        .debug_print()
    );
    assert_eq!(
      "(a: (int) -> int)",
      Expression::var_name("a", Type::new_fn(vec![(INT_TYPE)], INT_TYPE)).debug_print()
    );
    assert_eq!(
      "a",
      Expression::fn_name("a", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE))
        .clone()
        .debug_print()
    );
    assert_eq!("a", Expression::StringName(rcs("a")).clone().debug_print());
  }

  #[test]
  fn print_type_definition_tests() {
    assert_eq!(
      "object type A = [int, bool]",
      TypeDefinition {
        identifier: rcs("A"),
        is_object: true,
        type_parameters: vec![],
        names: vec![],
        mappings: vec![INT_TYPE, BOOL_TYPE],
      }
      .pretty_print()
    );
    assert_eq!(
      "variant type B<C> = [int, C]",
      TypeDefinition {
        identifier: rcs("B"),
        is_object: false,
        type_parameters: vec![rcs("C")],
        names: vec![],
        mappings: vec![INT_TYPE, Type::new_id_no_targs("C")],
      }
      .pretty_print()
    );
  }

  #[test]
  fn print_statement_tests() {
    let stmt = Statement::IfElse {
      condition: ZERO,
      s1: vec![
        Statement::StructInit {
          struct_variable_name: rcs("baz"),
          type_: Type::new_id_no_targs_unwrapped("FooBar"),
          expression_list: vec![Expression::StringName(rcs("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("closure"),
          closure_type: Type::new_id_no_targs_unwrapped("CCC"),
          function_name: FunctionName::new("foo", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE)),
          context: ZERO,
        },
        Statement::binary("dd", Operator::LT, ZERO, ZERO),
        Statement::binary("dd", Operator::LE, ZERO, ZERO),
        Statement::binary("dd", Operator::GT, ZERO, ZERO),
        Statement::binary("dd", Operator::GE, ZERO, ZERO),
        Statement::binary("dd", Operator::EQ, ZERO, ZERO),
        Statement::binary("dd", Operator::NE, ZERO, ZERO),
        Statement::binary("dd", Operator::XOR.clone(), ZERO, ZERO),
        Statement::While {
          loop_variables: vec![],
          statements: vec![Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![],
          }],
          break_collector: None,
        },
        Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: rcs("_"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: ZERO,
          }],
          statements: vec![Statement::SingleIf {
            condition: ZERO,
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName { name: rcs("_"), type_: INT_TYPE }),
        },
      ],
      s2: vec![
        Statement::binary("dd", Operator::PLUS, ZERO, ZERO),
        Statement::binary("dd", Operator::MINUS, ZERO, ZERO),
        Statement::binary("dd", Operator::MINUS, ZERO, Expression::int(-2147483648)),
        Statement::binary("dd", Operator::MUL, ZERO, ZERO),
        Statement::binary("dd", Operator::DIV, ZERO, ZERO),
        Statement::binary("dd", Operator::MOD, ZERO, ZERO),
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "h",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name("big", Type::new_id_no_targs("FooBar"))],
          return_type: INT_TYPE,
          return_collector: Some(rcs("vibez")),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName {
            name: rcs("stresso"),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            type_arguments: vec![INT_TYPE],
          }),
          arguments: vec![Expression::var_name("d", INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: rcs("d"), type_: INT_TYPE }),
          arguments: vec![Expression::var_name("d", INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: rcs("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("big", Type::new_id_no_targs("FooBar")),
          index: 0,
        },
        Statement::Break(ZERO),
      ],
      final_assignments: vec![(
        rcs("bar"),
        INT_TYPE,
        Expression::var_name("b1", INT_TYPE),
        Expression::var_name("b2", INT_TYPE),
      )],
    };
    assert!(!format!("{:?}", stmt.clone()).is_empty());
    let expected = r#"let bar: int;
if 0 {
  let baz: FooBar = [meggo];
  let closure: CCC = Closure { fun: (foo: (int) -> int), context: 0 };
  let dd: bool = 0 < 0;
  let dd: bool = 0 <= 0;
  let dd: bool = 0 > 0;
  let dd: bool = 0 >= 0;
  let dd: bool = 0 == 0;
  let dd: bool = 0 != 0;
  let dd: bool = 0 ^ 0;
  while (true) {
    if 0 {
    }
  }
  let _: int = 0;
  let _: int;
  while (true) {
    if !0 {
      _ = 0;
      break;
    }
    _ = 0;
  }
  bar = (b1: int);
} else {
  let dd: int = 0 + 0;
  let dd: int = 0 + 0;
  let dd: int = 0 - -2147483648;
  let dd: int = 0 * 0;
  let dd: int = 0 / 0;
  let dd: int = 0 % 0;
  let vibez: int = h((big: FooBar));
  stresso<int>((d: int));
  (d: int)((d: int));
  let f: int = (big: FooBar)[0];
  undefined = 0;
  break;
  bar = (b2: int);
}"#;
    assert_eq!(expected, stmt.debug_print());
  }

  #[test]
  fn print_sources_tests() {
    let sources1 = Sources {
      global_variables: vec![
        GlobalVariable { name: rcs("dev_meggo"), content: rcs("vibez") }.clone()
      ],
      closure_types: vec![ClosureTypeDefinition {
        identifier: rcs("c"),
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        identifier: rcs("Foo"),
        is_object: true,
        type_parameters: vec![],
        names: vec![],
        mappings: vec![INT_TYPE, BOOL_TYPE],
      }
      .clone()],
      main_function_names: vec![rcs("ddd")],
      functions: vec![Function {
        name: rcs("Bar"),
        parameters: vec![rcs("f")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: rcs("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("big", Type::new_id_no_targs("FooBar")),
          index: 0,
        }],
        return_value: ZERO,
      }],
    };
    assert!(!format!("{:?}", sources1).is_empty());
    let expected1 = r#"const dev_meggo = 'vibez';

closure type c = () -> int
object type Foo = [int, bool]
function Bar(f: int): int {
  let f: int = (big: FooBar)[0];
  return 0;
}

sources.mains = [ddd]"#;
    assert_eq!(expected1, sources1.debug_print());

    let sources2 = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![Function {
        name: rcs("Bar"),
        parameters: vec![rcs("f")],
        type_parameters: vec![rcs("A")],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    };
    let expected2 = r#"function Bar<A>(f: int): int {
  return 0;
}
"#;
    assert_eq!(expected2, sources2.debug_print());
  }

  #[test]
  fn flexible_order_binary_tests() {
    assert_eq!(
      (Operator::PLUS, ONE, ZERO),
      Statement::flexible_order_binary(Operator::PLUS, ZERO, ONE)
    );
    assert_eq!(
      (Operator::PLUS, ZERO, ZERO),
      Statement::flexible_order_binary(Operator::PLUS, ZERO, ZERO)
    );
    assert_eq!(
      (Operator::PLUS, ONE, ZERO),
      Statement::flexible_order_binary(Operator::PLUS, ONE, ZERO)
    );
    assert_eq!(
      (Operator::PLUS, Expression::StringName(rcs("")), ZERO),
      Statement::flexible_order_binary(Operator::PLUS, ZERO, Expression::StringName(rcs(""))),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name("", INT_TYPE), ZERO),
      Statement::flexible_order_binary(Operator::PLUS, ZERO, Expression::var_name("", INT_TYPE)),
    );

    assert_eq!(
      (Operator::PLUS, Expression::StringName(rcs("b")), Expression::StringName(rcs("a"))),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(rcs("a")),
        Expression::StringName(rcs("b"))
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::StringName(rcs("b")), ZERO),
      Statement::flexible_order_binary(Operator::PLUS, Expression::StringName(rcs("b")), ZERO),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::fn_name("b", Type::new_fn_unwrapped(vec![], INT_TYPE)),
        Expression::fn_name("a", Type::new_fn_unwrapped(vec![], INT_TYPE))
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::fn_name("b", Type::new_fn_unwrapped(vec![], INT_TYPE)),
        Expression::fn_name("a", Type::new_fn_unwrapped(vec![], INT_TYPE))
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name("", INT_TYPE), Expression::StringName(rcs("")),),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(rcs("")),
        Expression::var_name("", INT_TYPE),
      ),
    );

    assert_eq!(
      (Operator::PLUS, Expression::var_name("", INT_TYPE), ZERO),
      Statement::flexible_order_binary(Operator::PLUS, Expression::var_name("", INT_TYPE), ZERO),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name("a", INT_TYPE), Expression::StringName(rcs("b")),),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name("a", INT_TYPE),
        Expression::StringName(rcs("b")),
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name("b", INT_TYPE), Expression::var_name("a", INT_TYPE),),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name("a", INT_TYPE),
        Expression::var_name("b", INT_TYPE),
      ),
    );

    assert_eq!(
      (Operator::GT, ONE, ZERO),
      Statement::flexible_order_binary(Operator::LT, ZERO, ONE)
    );
    assert_eq!(
      (Operator::LT, ONE, ZERO),
      Statement::flexible_order_binary(Operator::LT, ONE, ZERO)
    );
    assert_eq!(
      (Operator::LE, ONE, ZERO),
      Statement::flexible_order_binary(Operator::LE, ONE, ZERO)
    );
    assert_eq!(
      (Operator::GE, ONE, ZERO),
      Statement::flexible_order_binary(Operator::LE, ZERO, ONE)
    );
    assert_eq!(
      (Operator::LT, ONE, ZERO),
      Statement::flexible_order_binary(Operator::GT, ZERO, ONE)
    );
    assert_eq!(
      (Operator::GT, ONE, ZERO),
      Statement::flexible_order_binary(Operator::GT, ONE, ZERO)
    );
    assert_eq!(
      (Operator::LE, ONE, ZERO),
      Statement::flexible_order_binary(Operator::GE, ZERO, ONE)
    );
    assert_eq!(
      (Operator::GE, ONE, ZERO),
      Statement::flexible_order_binary(Operator::GE, ONE, ZERO)
    );
    assert_eq!(
      (Operator::DIV, ZERO, ONE),
      Statement::flexible_order_binary(Operator::DIV, ZERO, ONE)
    );
  }
}
