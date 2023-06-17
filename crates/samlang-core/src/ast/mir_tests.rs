#[cfg(test)]
mod tests {
  use super::super::mir::*;
  use crate::{
    ast::hir::{GlobalVariable, Operator},
    common::well_known_pstrs,
    Heap,
  };
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(INT_TYPE <= INT_TYPE);
    assert!(!format!("{:?}", INT_TYPE.cmp(&INT_TYPE)).is_empty());
    assert!(ZERO.as_int_literal().is_some());
    assert!(!format!(
      "{:?}",
      Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::UPPER_A,))
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::UPPER_A,))
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::StringName(well_known_pstrs::LOWER_A)).is_empty());
    assert!(!format!("{:?}", ZERO.type_()).is_empty());
    assert!(!format!("{:?}", Expression::StringName(well_known_pstrs::LOWER_A).type_().as_id())
      .is_empty());
    assert!(Expression::StringName(well_known_pstrs::LOWER_A).type_().as_id().is_some());
    assert_eq!(
      "(s: int)",
      VariableName::new(heap.alloc_str_for_test("s"), INT_TYPE).debug_print(heap)
    );
    assert!(!GenenalLoopVariable {
      name: well_known_pstrs::LOWER_A,
      type_: INT_TYPE,
      initial_value: ZERO,
      loop_value: ZERO
    }
    .pretty_print(heap)
    .is_empty());
    assert!(!format!("{:?}", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE)).is_empty());
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).type_();
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).convert_to_callee();
    Expression::StringName(well_known_pstrs::LOWER_A).convert_to_callee();
    ZERO.convert_to_callee();
    Statement::Break(ZERO).as_binary();
    assert!(Statement::Break(ZERO).into_break().is_ok());
    Statement::binary(heap.alloc_str_for_test("name"), Operator::DIV, ZERO, ZERO)
      .clone()
      .as_binary();
    let call = Statement::Call {
      callee: Callee::FunctionName(FunctionName {
        name: well_known_pstrs::LOWER_A,
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }),
      arguments: vec![],
      return_type: INT_TYPE,
      return_collector: None,
    };
    assert!(!format!("{:?}", call).is_empty());
    assert!(call.as_call().is_some());
    assert!(call.into_break().is_err());

    assert!(
      Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::UPPER_A,))
        == Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::UPPER_A,))
    );
    assert!(
      FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
        == FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
    );
    let mut hasher = DefaultHasher::new();
    ZERO.hash(&mut hasher);
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).hash(&mut hasher);
    Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::LOWER_A))
      .hash(&mut hasher);
    Statement::binary_flexible_unwrapped(well_known_pstrs::LOWER_A, Operator::DIV, ZERO, ZERO);
    Callee::FunctionName(FunctionName::new(
      heap.alloc_str_for_test("s"),
      FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) },
    ))
    .as_function_name();
    assert!(TypeDefinitionMappings::Struct(vec![]).as_struct().is_some());
  }

  #[test]
  fn print_types_and_expressions_tests() {
    let heap = &mut Heap::new();

    assert_eq!("int", INT_TYPE.pretty_print(heap));
    assert_eq!("_Str", STRING_TYPE.pretty_print(heap));
    assert_eq!("0", ZERO.clone().debug_print(heap));
    ZERO.dump_to_string();
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).dump_to_string();
    Expression::StringName(well_known_pstrs::LOWER_A).dump_to_string();
    assert_eq!(
      "(a: int)",
      Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).debug_print(heap)
    );
    assert_eq!(
      "(a: A)",
      Expression::var_name(well_known_pstrs::LOWER_A, Type::Id(well_known_pstrs::UPPER_A))
        .debug_print(heap)
    );
    assert_eq!("a", Expression::StringName(well_known_pstrs::LOWER_A).clone().debug_print(heap));
  }

  #[test]
  fn print_type_definition_tests() {
    let heap = &mut Heap::new();

    assert_eq!(
      "object type A = [int, int]",
      TypeDefinition {
        identifier: well_known_pstrs::UPPER_A,
        names: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .pretty_print(heap)
    );
    assert_eq!(
      "variant type B",
      TypeDefinition {
        identifier: well_known_pstrs::UPPER_B,
        names: vec![],
        mappings: TypeDefinitionMappings::Enum,
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
          struct_variable_name: heap.alloc_str_for_test("baz"),
          type_name: heap.alloc_str_for_test("FooBar"),
          expression_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("closure"),
          closure_type_name: heap.alloc_str_for_test("CCC"),
          function_name: FunctionName::new(
            heap.alloc_str_for_test("foo"),
            Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          ),
          context: ZERO,
        },
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::LT, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::LE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::GT, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::GE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::EQ, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::NE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::LAND, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::LOR, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::SHL, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::SHR, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::XOR.clone(), ZERO, ZERO),
        Statement::Cast {
          name: heap.alloc_str_for_test("cast"),
          type_: INT_TYPE,
          assigned_expression: ZERO,
        },
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
            name: heap.alloc_str_for_test("_"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: ZERO,
          }],
          statements: vec![Statement::SingleIf {
            condition: ZERO,
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName {
            name: heap.alloc_str_for_test("_"),
            type_: INT_TYPE,
          }),
        },
      ],
      s2: vec![
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::PLUS, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::MINUS, ZERO, ZERO),
        Statement::binary(
          heap.alloc_str_for_test("dd"),
          Operator::MINUS,
          ZERO,
          Expression::int(-2147483648),
        ),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::MUL, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::DIV, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), Operator::MOD, ZERO, ZERO),
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str_for_test("h"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          )],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str_for_test("vibez")),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName {
            name: heap.alloc_str_for_test("stresso"),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          }),
          arguments: vec![Expression::var_name(well_known_pstrs::LOWER_D, INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName {
            name: well_known_pstrs::LOWER_D,
            type_: INT_TYPE,
          }),
          arguments: vec![Expression::var_name(well_known_pstrs::LOWER_D, INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: well_known_pstrs::LOWER_F,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        },
        Statement::Break(ZERO),
      ],
      final_assignments: vec![(
        heap.alloc_str_for_test("bar"),
        INT_TYPE,
        Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
        Expression::var_name(heap.alloc_str_for_test("b2"), INT_TYPE),
      )],
    };
    assert!(!format!("{:?}", stmt.clone()).is_empty());
    let expected = r#"let bar: int;
if 0 {
  let baz: FooBar = [meggo];
  let closure: CCC = Closure { fun: (foo: (int) -> int), context: 0 };
  let dd = 0 < 0;
  let dd = 0 <= 0;
  let dd = 0 > 0;
  let dd = 0 >= 0;
  let dd = 0 == 0;
  let dd = 0 != 0;
  let dd = 0 & 0;
  let dd = 0 | 0;
  let dd = 0 << 0;
  let dd = 0 >>> 0;
  let dd = 0 ^ 0;
  let cast = 0 as int;
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
  let dd = 0 + 0;
  let dd = 0 + 0;
  let dd = 0 - -2147483648;
  let dd = 0 * 0;
  let dd = 0 / 0;
  let dd = 0 % 0;
  let vibez: int = h((big: FooBar));
  stresso((d: int));
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
        name: heap.alloc_str_for_test("dev_meggo"),
        content: heap.alloc_str_for_test("vibez"),
      }
      .clone()],
      closure_types: vec![ClosureTypeDefinition {
        identifier: well_known_pstrs::LOWER_C,
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        identifier: heap.alloc_str_for_test("Foo"),
        names: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .clone()],
      main_function_names: vec![heap.alloc_str_for_test("ddd")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("Bar"),
        parameters: vec![well_known_pstrs::LOWER_F],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: well_known_pstrs::LOWER_F,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        }],
        return_value: ZERO,
      }
      .clone()],
    };
    assert!(!format!("{sources1:?}").is_empty());
    let expected1 = r#"const dev_meggo = 'vibez';

closure type c = () -> int
object type Foo = [int, int]
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
        name: heap.alloc_str_for_test("Bar"),
        parameters: vec![well_known_pstrs::LOWER_F],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    };
    let expected2 = r#"function Bar(f: int): int {
  return 0;
}
"#;
    assert_eq!(expected2, sources2.debug_print(heap));
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
      (Operator::PLUS, Expression::StringName(well_known_pstrs::LOWER_A), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        ZERO,
        Expression::StringName(well_known_pstrs::LOWER_A)
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        ZERO,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE)
      ),
    );

    let a = well_known_pstrs::LOWER_A;
    let b = well_known_pstrs::LOWER_B;
    assert_eq!(
      (Operator::PLUS, Expression::StringName(b), Expression::StringName(a),),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(a),
        Expression::StringName(b),
      ),
    );
    assert_eq!(
      (Operator::PLUS, Expression::StringName(well_known_pstrs::LOWER_B), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(well_known_pstrs::LOWER_B),
        ZERO
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
        Expression::StringName(well_known_pstrs::LOWER_A),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::StringName(well_known_pstrs::LOWER_A),
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
      ),
    );

    assert_eq!(
      (Operator::PLUS, Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
        ZERO
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
        Expression::StringName(well_known_pstrs::LOWER_B),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
        Expression::StringName(well_known_pstrs::LOWER_B),
      ),
    );
    assert_eq!(
      (
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_B, INT_TYPE),
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
      ),
      Statement::flexible_order_binary(
        Operator::PLUS,
        Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
        Expression::var_name(well_known_pstrs::LOWER_B, INT_TYPE),
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
