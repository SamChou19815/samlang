#[cfg(test)]
mod tests {
  use super::super::hir::*;
  use crate::Heap;
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(!format!(
      "{:?}",
      Expression::var_name(
        heap.alloc_str("a"),
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
        )
      )
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::var_name(
        heap.alloc_str("a"),
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
        )
      )
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::fn_name(
        heap.alloc_str("a"),
        Type::new_fn(vec![INT_TYPE], INT_TYPE).as_fn().unwrap().clone()
      )
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::StringName(heap.alloc_str("a"))).is_empty());
    assert!(!format!("{:?}", Operator::GE).is_empty());
    assert!(!format!("{:?}", ZERO.type_()).is_empty());
    assert!(!format!("{:?}", FALSE.type_()).is_empty());
    assert!(!format!("{:?}", Expression::var_name(heap.alloc_str("a"), INT_TYPE).type_().as_fn())
      .is_empty());
    assert!(
      !format!("{:?}", Expression::StringName(heap.alloc_str("a")).type_().as_id()).is_empty()
    );
    assert!(!GenenalLoopVariable {
      name: heap.alloc_str(""),
      type_: INT_TYPE,
      initial_value: ZERO,
      loop_value: ZERO
    }
    .pretty_print(heap)
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::fn_name(heap.alloc_str("a"), Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE))
        .type_()
    )
    .is_empty());
    assert!(PrimitiveType::Int.eq(&PrimitiveType::Int));
    assert_eq!(PrimitiveType::Int, PrimitiveType::Int);
    Expression::FunctionName(FunctionName {
      name: heap.alloc_str(""),
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      type_arguments: vec![INT_TYPE],
    })
    .convert_to_callee();
    Expression::var_name(heap.alloc_str(""), INT_TYPE).convert_to_callee();
    Expression::StringName(heap.alloc_str("")).convert_to_callee();
    ZERO.convert_to_callee();
    Expression::var_name(heap.alloc_str("a"), INT_TYPE).as_function_name();
    Statement::Break(ZERO).as_binary();
    Statement::binary(heap.alloc_str("name"), Operator::DIV, ZERO, ZERO).clone().as_binary();
    Statement::Call {
      callee: Callee::FunctionName(FunctionName {
        name: heap.alloc_str(""),
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
        heap.alloc_str("a"),
        Type::new_fn(
          vec![INT_TYPE],
          Type::new_id(
            heap.alloc_str("A"),
            vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
          )
        )
      ) == Expression::var_name(
        heap.alloc_str("a"),
        Type::new_fn(
          vec![INT_TYPE],
          Type::new_id(
            heap.alloc_str("A"),
            vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
          )
        )
      )
    );
    assert!(Expression::var_name(
      heap.alloc_str("a"),
      Type::new_fn(
        vec![INT_TYPE],
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
        )
      )
    )
    .eq(&Expression::var_name(
      heap.alloc_str("a"),
      Type::new_fn(
        vec![INT_TYPE],
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
        )
      )
    )));
    assert!(Type::new_fn(
      vec![INT_TYPE],
      Type::new_id(heap.alloc_str("A"), vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))])
    )
    .eq(
      &(Type::new_fn(
        vec![INT_TYPE],
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("B"))]
        )
      ))
    ));
    let mut hasher = DefaultHasher::new();
    Operator::DIV.hash(&mut hasher);
    Statement::binary_flexible_unwrapped(heap.alloc_str(""), Operator::DIV, ZERO, ZERO);
  }

  #[test]
  fn print_types_and_expressions_tests() {
    let heap = &mut Heap::new();

    assert_eq!("bool", BOOL_TYPE.clone().pretty_print(heap));
    assert_eq!("int", INT_TYPE.pretty_print(heap));
    assert_eq!("string", STRING_TYPE.pretty_print(heap));
    assert_eq!("0", ZERO.clone().debug_print(heap));
    ZERO.dump_to_string();
    Expression::var_name(heap.alloc_str("a"), INT_TYPE).dump_to_string();
    Expression::StringName(heap.alloc_str("a")).dump_to_string();
    Expression::fn_name(heap.alloc_str("a"), Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE))
      .dump_to_string();
    assert_eq!("(a: int)", Expression::var_name(heap.alloc_str("a"), INT_TYPE).debug_print(heap));
    assert_eq!(
      "(a: A<int, B>)",
      Expression::var_name(
        heap.alloc_str("a"),
        Type::new_id(
          heap.alloc_str("A"),
          vec![INT_TYPE, (Type::new_id_no_targs(heap.alloc_str("B")))]
        )
      )
      .clone()
      .debug_print(heap)
    );
    assert_eq!(
      "(a: (int) -> int)",
      Expression::var_name(heap.alloc_str("a"), Type::new_fn(vec![(INT_TYPE)], INT_TYPE))
        .debug_print(heap)
    );
    assert_eq!(
      "a",
      Expression::fn_name(heap.alloc_str("a"), Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE))
        .clone()
        .debug_print(heap)
    );
    assert_eq!("a", Expression::StringName(heap.alloc_str("a")).clone().debug_print(heap));
  }

  #[test]
  fn print_type_definition_tests() {
    let heap = &mut Heap::new();

    assert_eq!(
      "object type A = [int, bool]",
      TypeDefinition {
        identifier: heap.alloc_str("A"),
        is_object: true,
        type_parameters: vec![],
        names: vec![],
        mappings: vec![INT_TYPE, BOOL_TYPE],
      }
      .pretty_print(heap)
    );
    assert_eq!(
      "variant type B<C> = [int, C]",
      TypeDefinition {
        identifier: heap.alloc_str("B"),
        is_object: false,
        type_parameters: vec![heap.alloc_str("C")],
        names: vec![],
        mappings: vec![INT_TYPE, Type::new_id_no_targs(heap.alloc_str("C"))],
      }
      .pretty_print(heap)
    );
  }

  #[test]
  fn print_statement_tests() {
    let heap = &mut Heap::new();

    let stmt = Statement::IfElse {
      condition: ZERO,
      s1: vec![
        Statement::StructInit {
          struct_variable_name: heap.alloc_str("baz"),
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str("FooBar")),
          expression_list: vec![Expression::StringName(heap.alloc_str("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str("closure"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str("CCC")),
          function_name: FunctionName::new(
            heap.alloc_str("foo"),
            Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          ),
          context: ZERO,
        },
        Statement::binary(heap.alloc_str("dd"), Operator::LT, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::LE, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::GT, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::GE, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::EQ, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::NE, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::XOR.clone(), ZERO, ZERO),
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
            name: heap.alloc_str("_"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: ZERO,
          }],
          statements: vec![Statement::SingleIf {
            condition: ZERO,
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName { name: heap.alloc_str("_"), type_: INT_TYPE }),
        },
      ],
      s2: vec![
        Statement::binary(heap.alloc_str("dd"), Operator::PLUS, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::MINUS, ZERO, ZERO),
        Statement::binary(
          heap.alloc_str("dd"),
          Operator::MINUS,
          ZERO,
          Expression::int(-2147483648),
        ),
        Statement::binary(heap.alloc_str("dd"), Operator::MUL, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::DIV, ZERO, ZERO),
        Statement::binary(heap.alloc_str("dd"), Operator::MOD, ZERO, ZERO),
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str("h"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name(
            heap.alloc_str("big"),
            Type::new_id_no_targs(heap.alloc_str("FooBar")),
          )],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str("vibez")),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName {
            name: heap.alloc_str("stresso"),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            type_arguments: vec![INT_TYPE],
          }),
          arguments: vec![Expression::var_name(heap.alloc_str("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: heap.alloc_str("d"), type_: INT_TYPE }),
          arguments: vec![Expression::var_name(heap.alloc_str("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str("big"),
            Type::new_id_no_targs(heap.alloc_str("FooBar")),
          ),
          index: 0,
        },
        Statement::Break(ZERO),
      ],
      final_assignments: vec![(
        heap.alloc_str("bar"),
        INT_TYPE,
        Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
        Expression::var_name(heap.alloc_str("b2"), INT_TYPE),
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
    assert_eq!(expected, stmt.debug_print(heap));
  }

  #[test]
  fn print_sources_tests() {
    let heap = &mut Heap::new();

    let sources1 = Sources {
      global_variables: vec![GlobalVariable {
        name: heap.alloc_str("dev_meggo"),
        content: heap.alloc_str("vibez"),
      }
      .clone()],
      closure_types: vec![ClosureTypeDefinition {
        identifier: heap.alloc_str("c"),
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        identifier: heap.alloc_str("Foo"),
        is_object: true,
        type_parameters: vec![],
        names: vec![],
        mappings: vec![INT_TYPE, BOOL_TYPE],
      }
      .clone()],
      main_function_names: vec![heap.alloc_str("ddd")],
      functions: vec![Function {
        name: heap.alloc_str("Bar"),
        parameters: vec![heap.alloc_str("f")],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: heap.alloc_str("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str("big"),
            Type::new_id_no_targs(heap.alloc_str("FooBar")),
          ),
          index: 0,
        }],
        return_value: ZERO,
      }
      .clone()],
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
    assert_eq!(expected1, sources1.debug_print(heap));

    let sources2 = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![Function {
        name: heap.alloc_str("Bar"),
        parameters: vec![heap.alloc_str("f")],
        type_parameters: vec![heap.alloc_str("A")],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    };
    let expected2 = r#"function Bar<A>(f: int): int {
  return 0;
}
"#;
    assert_eq!(expected2, sources2.debug_print(heap));
  }

  #[test]
  fn flexible_order_binary_tests() {
    let heap = &mut Heap::new();

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
      (Operator::PLUS, Expression::StringName(heap.alloc_str("")), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        ZERO,
        Expression::StringName(heap.alloc_str(""))
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name(heap.alloc_str(""), INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        ZERO,
        Expression::var_name(heap.alloc_str(""), INT_TYPE)
      ),
    );

    let a = heap.alloc_str("a");
    let b = heap.alloc_str("b");
    assert_eq!(
      (Operator::PLUS, Expression::StringName(b), Expression::StringName(a),),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(a),
        Expression::StringName(b),
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::StringName(heap.alloc_str("b")), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(heap.alloc_str("b")),
        ZERO
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::fn_name(heap.alloc_str("b"), Type::new_fn_unwrapped(vec![], INT_TYPE)),
        Expression::fn_name(heap.alloc_str("a"), Type::new_fn_unwrapped(vec![], INT_TYPE))
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::fn_name(heap.alloc_str("b"), Type::new_fn_unwrapped(vec![], INT_TYPE)),
        Expression::fn_name(heap.alloc_str("a"), Type::new_fn_unwrapped(vec![], INT_TYPE))
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(heap.alloc_str(""), INT_TYPE),
        Expression::StringName(heap.alloc_str("")),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(heap.alloc_str("")),
        Expression::var_name(heap.alloc_str(""), INT_TYPE),
      ),
    );

    assert_eq!(
      (Operator::PLUS, Expression::var_name(heap.alloc_str(""), INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(heap.alloc_str(""), INT_TYPE),
        ZERO
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(heap.alloc_str("a"), INT_TYPE),
        Expression::StringName(heap.alloc_str("b")),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(heap.alloc_str("a"), INT_TYPE),
        Expression::StringName(heap.alloc_str("b")),
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(heap.alloc_str("b"), INT_TYPE),
        Expression::var_name(heap.alloc_str("a"), INT_TYPE),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(heap.alloc_str("a"), INT_TYPE),
        Expression::var_name(heap.alloc_str("b"), INT_TYPE),
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
