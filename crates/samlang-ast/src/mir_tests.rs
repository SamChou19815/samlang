#[cfg(test)]
mod tests {
  use super::super::hir::{BinaryOperator, GlobalVariable};
  use super::super::mir::*;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert!(INT_TYPE <= INT_TYPE);
    format!("{:?}", INT_TYPE.cmp(&INT_TYPE));
    assert!(ZERO.as_int_literal().is_some());
    format!(
      "{:?}",
      Expression::var_name(PStr::LOWER_A, Type::Id(table.create_type_name_for_test(PStr::UPPER_A)))
    );
    format!(
      "{:?}",
      Expression::var_name(PStr::LOWER_A, Type::Id(table.create_type_name_for_test(PStr::UPPER_A)))
    );
    format!("{:?}", Expression::StringName(PStr::LOWER_A));
    format!("{:?}", INT_TYPE);
    assert_eq!(
      "(s: int)",
      VariableName::new(heap.alloc_str_for_test("s"), INT_TYPE).debug_print(heap, table)
    );
    GenenalLoopVariable {
      name: PStr::LOWER_A,
      type_: INT_TYPE,
      initial_value: ZERO,
      loop_value: ZERO,
    }
    .pretty_print(heap, table);
    format!("{:?}", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE));
    Expression::var_name(PStr::LOWER_A, INT_TYPE).convert_to_callee();
    Expression::StringName(PStr::LOWER_A).convert_to_callee();
    ZERO.convert_to_callee();
    Statement::Break(ZERO).as_binary();
    assert!(Statement::Break(ZERO).into_break().is_ok());
    Statement::binary(heap.alloc_str_for_test("name"), BinaryOperator::DIV, ZERO, ZERO)
      .clone()
      .as_binary();
    let call = Statement::Call {
      callee: Callee::FunctionName(FunctionNameExpression {
        name: FunctionName::new_for_test(PStr::LOWER_A),
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }),
      arguments: vec![],
      return_type: INT_TYPE,
      return_collector: None,
    };
    format!("{:?}", call);
    assert!(call.as_call().is_some());
    assert!(call.into_break().is_err());

    assert!(
      Expression::var_name(PStr::LOWER_A, Type::Id(table.create_type_name_for_test(PStr::UPPER_A)))
        == Expression::var_name(
          PStr::LOWER_A,
          Type::Id(table.create_type_name_for_test(PStr::UPPER_A))
        )
    );
    assert!(
      FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
        == FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
    );
    let mut hasher = DefaultHasher::new();
    ZERO.hash(&mut hasher);
    Expression::StringName(PStr::LOWER_A).hash(&mut hasher);
    Expression::var_name(PStr::LOWER_A, INT_TYPE).hash(&mut hasher);
    Expression::var_name(PStr::LOWER_A, Type::Id(table.create_type_name_for_test(PStr::UPPER_A)))
      .hash(&mut hasher);
    Statement::binary_flexible_unwrapped(PStr::LOWER_A, BinaryOperator::DIV, ZERO, ZERO);
    Callee::FunctionName(FunctionNameExpression {
      name: FunctionName::new_for_test(heap.alloc_str_for_test("s")),
      type_: FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) },
    })
    .as_function_name();
    assert!(TypeDefinitionMappings::Struct(vec![]).as_struct().is_some());

    let mut table = SymbolTable::new();
    let mut type_name_id = table.create_type_name_for_test(PStr::UPPER_A);
    format!("{:?}", type_name_id);
    assert_eq!(false, type_name_id.encoded_for_test(heap, &table).is_empty());
    type_name_id = table.create_simple_type_name(ModuleReference::ROOT, PStr::UPPER_A);
    type_name_id = table.derived_type_name_with_subtype_tag(type_name_id, 1);
    assert_eq!(true, type_name_id <= type_name_id);
    assert_eq!(type_name_id.cmp(&type_name_id), std::cmp::Ordering::Equal);
  }

  #[test]
  fn print_types_and_expressions_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_eq!("int", INT_TYPE.pretty_print(heap, table));
    assert_eq!("0", ZERO.clone().debug_print(heap, table));
    assert_eq!("(a: int)", Expression::var_name(PStr::LOWER_A, INT_TYPE).debug_print(heap, table));
    assert_eq!(
      "(a: _A)",
      Expression::var_name(PStr::LOWER_A, Type::Id(table.create_type_name_for_test(PStr::UPPER_A)))
        .debug_print(heap, table)
    );
    assert_eq!("a", Expression::StringName(PStr::LOWER_A).clone().debug_print(heap, table));
  }

  #[test]
  fn print_type_definition_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    let d1 = TypeDefinition {
      name: table.create_type_name_for_test(PStr::UPPER_A),
      mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
    };
    let ed1 = EnumTypeDefinition::Unboxed(Type::Id(table.create_type_name_for_test(PStr::UPPER_D)));
    let ed2 = EnumTypeDefinition::Boxed(vec![INT_TYPE, INT_TYPE]);
    let ed3 = EnumTypeDefinition::Int;
    assert!(ed1.eq(&ed1));
    assert!(ed2.eq(&ed2));
    assert!(ed3.eq(&ed3));
    let d2 = TypeDefinition {
      name: table.create_type_name_for_test(PStr::UPPER_B),
      mappings: TypeDefinitionMappings::Enum(vec![ed1, ed2, ed3.clone()]),
    };
    assert_eq!("object type _A = [int, int]", d1.pretty_print(heap, table));
    assert_eq!(
      "variant type _B = [Unboxed(_D), Boxed(int, int), int]",
      d2.pretty_print(heap, table)
    );
    format!("{d1:?} {d2:?}");
  }

  #[test]
  fn print_statement_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    let stmt = Statement::IfElse {
      condition: ZERO,
      s1: vec![
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("baz"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("FooBar")),
          expression_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("closure"),
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("CCC")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
            type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          },
          context: ZERO,
        },
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LT, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::GT, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::GE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::EQ, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::NE, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LAND, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LOR, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::SHL, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::SHR, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::XOR.clone(), ZERO, ZERO),
        Statement::Cast {
          name: heap.alloc_str_for_test("cast"),
          type_: INT_TYPE,
          assigned_expression: ZERO,
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("cast"), type_: INT_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("cast"),
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
            name: PStr::UNDERSCORE,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: ZERO,
          }],
          statements: vec![Statement::SingleIf {
            condition: ZERO,
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName { name: PStr::UNDERSCORE, type_: INT_TYPE }),
        },
      ],
      s2: vec![
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::PLUS, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MINUS, ZERO, ZERO),
        Statement::binary(
          heap.alloc_str_for_test("dd"),
          BinaryOperator::MINUS,
          ZERO,
          Expression::int(-2147483648),
        ),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MUL, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::DIV, ZERO, ZERO),
        Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MOD, ZERO, ZERO),
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("h")),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          }),
          arguments: vec![Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
          )],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str_for_test("vibez")),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("stresso")),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          }),
          arguments: vec![Expression::var_name(PStr::LOWER_D, INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: PStr::LOWER_D, type_: INT_TYPE }),
          arguments: vec![Expression::var_name(PStr::LOWER_D, INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: PStr::LOWER_F,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
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
    format!("{:?}", stmt.clone());
    let expected = r#"let bar: int;
if 0 {
  let baz: _FooBar = [meggo];
  let closure: _CCC = Closure { fun: (__$foo: (int) -> int), context: 0 };
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
  let cast: int;
  cast = 0;
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
  let vibez: int = __$h((big: _FooBar));
  __$stresso((d: int));
  (d: int)((d: int));
  let f: int = (big: _FooBar)[0];
  undefined = 0;
  break;
  bar = (b2: int);
}"#;
    assert_eq!(expected, stmt.debug_print(heap, table));
  }

  #[test]
  fn print_sources_tests() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let sources1 = Sources {
      global_variables: vec![GlobalVariable {
        name: heap.alloc_str_for_test("dev_meggo"),
        content: heap.alloc_str_for_test("vibez"),
      }
      .clone()],
      closure_types: vec![ClosureTypeDefinition {
        name: table.create_type_name_for_test(PStr::UPPER_A),
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .clone()],
      main_function_names: vec![FunctionName::new_for_test(heap.alloc_str_for_test("ddd"))],
      functions: vec![Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("Bar")),
        parameters: vec![PStr::LOWER_F],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: PStr::LOWER_F,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
          ),
          index: 0,
        }],
        return_value: ZERO,
      }
      .clone()],
      symbol_table: table,
    };
    format!("{sources1:?}");
    let expected1 = r#"const dev_meggo = 'vibez';

closure type _A = () -> int
object type _Foo = [int, int]
function __$Bar(f: int): int {
  let f: int = (big: _FooBar)[0];
  return 0;
}

sources.mains = [__$ddd]"#;
    assert_eq!(expected1, sources1.debug_print(heap,));

    let table = SymbolTable::new();
    let sources2 = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("Bar")),
        parameters: vec![PStr::LOWER_F],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
      symbol_table: table,
    };
    let expected2 = r#"function __$Bar(f: int): int {
  return 0;
}
"#;
    assert_eq!(expected2, sources2.debug_print(heap));
  }

  #[test]
  fn flexible_order_binary_tests() {
    assert_eq!(
      (BinaryOperator::PLUS, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::PLUS, ZERO, ONE)
    );
    assert_eq!(
      (BinaryOperator::PLUS, ZERO, ZERO),
      Statement::flexible_order_binary(BinaryOperator::PLUS, ZERO, ZERO)
    );
    assert_eq!(
      (BinaryOperator::PLUS, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::PLUS, ONE, ZERO)
    );
    assert_eq!(
      (BinaryOperator::PLUS, Expression::StringName(PStr::LOWER_A), ZERO),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        ZERO,
        Expression::StringName(PStr::LOWER_A)
      ),
    );
    assert_eq!(
      (BinaryOperator::PLUS, Expression::var_name(PStr::LOWER_A, INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        ZERO,
        Expression::var_name(PStr::LOWER_A, INT_TYPE)
      ),
    );

    let a = PStr::LOWER_A;
    let b = PStr::LOWER_B;
    assert_eq!(
      (BinaryOperator::PLUS, Expression::StringName(b), Expression::StringName(a),),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::StringName(a),
        Expression::StringName(b),
      ),
    );
    assert_eq!(
      (BinaryOperator::PLUS, Expression::StringName(PStr::LOWER_B), ZERO),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::StringName(PStr::LOWER_B),
        ZERO
      ),
    );
    assert_eq!(
      (
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
        Expression::StringName(PStr::LOWER_A),
      ),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::StringName(PStr::LOWER_A),
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
      ),
    );

    assert_eq!(
      (BinaryOperator::PLUS, Expression::var_name(PStr::LOWER_A, INT_TYPE), ZERO),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
        ZERO
      ),
    );
    assert_eq!(
      (
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
        Expression::StringName(PStr::LOWER_B),
      ),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
        Expression::StringName(PStr::LOWER_B),
      ),
    );
    assert_eq!(
      (
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_B, INT_TYPE),
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
      ),
      Statement::flexible_order_binary(
        BinaryOperator::PLUS,
        Expression::var_name(PStr::LOWER_A, INT_TYPE),
        Expression::var_name(PStr::LOWER_B, INT_TYPE),
      ),
    );

    assert_eq!(
      (BinaryOperator::GT, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::LT, ZERO, ONE)
    );
    assert_eq!(
      (BinaryOperator::LT, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::LT, ONE, ZERO)
    );
    assert_eq!(
      (BinaryOperator::LE, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::LE, ONE, ZERO)
    );
    assert_eq!(
      (BinaryOperator::GE, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::LE, ZERO, ONE)
    );
    assert_eq!(
      (BinaryOperator::LT, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::GT, ZERO, ONE)
    );
    assert_eq!(
      (BinaryOperator::GT, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::GT, ONE, ZERO)
    );
    assert_eq!(
      (BinaryOperator::LE, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::GE, ZERO, ONE)
    );
    assert_eq!(
      (BinaryOperator::GE, ONE, ZERO),
      Statement::flexible_order_binary(BinaryOperator::GE, ONE, ZERO)
    );
    assert_eq!(
      (BinaryOperator::DIV, ZERO, ONE),
      Statement::flexible_order_binary(BinaryOperator::DIV, ZERO, ONE)
    );
  }
}
