#[cfg(test)]
mod tests {
  use super::super::hir::*;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(ZERO.as_int_literal().is_some());
    Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)]).as_id();
    Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)]).is_int();
    assert!(INT_TYPE.is_int());
    assert!(INT_TYPE.as_id().is_none());
    format!(
      "{:?}",
      Expression::var_name(
        PStr::LOWER_A,
        Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
      )
    );
    format!(
      "{:?}",
      Expression::var_name(
        PStr::LOWER_A,
        Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
      )
    );
    format!("{:?}", TypeName::new_for_test(PStr::UPPER_A));
    assert!(TypeName::new_for_test(PStr::UPPER_A) <= TypeName::new_for_test(PStr::UPPER_A));
    assert_eq!(
      TypeName::new_for_test(PStr::UPPER_A).cmp(&TypeName::new_for_test(PStr::UPPER_A)),
      std::cmp::Ordering::Equal
    );
    assert_eq!(
      TypeName::new_for_test(PStr::UPPER_A).clone(),
      TypeName::new_for_test(PStr::UPPER_A)
    );
    assert!(
      FunctionName { type_name: TypeName::new_for_test(PStr::UPPER_A), fn_name: PStr::LOWER_A }
        <= FunctionName {
          type_name: TypeName::new_for_test(PStr::UPPER_A),
          fn_name: PStr::LOWER_A
        }
    );
    assert_eq!(
      FunctionName { type_name: TypeName::new_for_test(PStr::UPPER_A), fn_name: PStr::LOWER_A },
      FunctionName { type_name: TypeName::new_for_test(PStr::UPPER_A), fn_name: PStr::LOWER_A }
    );
    assert_eq!(
      FunctionName { type_name: TypeName::new_for_test(PStr::UPPER_A), fn_name: PStr::LOWER_A }
        .cmp(&FunctionName {
          type_name: TypeName::new_for_test(PStr::UPPER_A),
          fn_name: PStr::LOWER_A
        }),
      std::cmp::Ordering::Equal
    );
    format!("{:?}", Expression::StringName(PStr::LOWER_A));
    format!("{:?}", BinaryOperator::GE);
    assert!(BinaryOperator::MINUS <= BinaryOperator::GE);
    format!("{:?}", BinaryOperator::MINUS.partial_cmp(&BinaryOperator::GE));
    format!("{:?}", BinaryOperator::MINUS.cmp(&BinaryOperator::GE));
    format!("{:?}", ZERO.type_());
    format!("{:?}", Expression::StringName(PStr::LOWER_A).type_().as_id());
    assert!(Expression::StringName(PStr::LOWER_A).type_().as_id().is_some());
    assert_eq!(
      "(s: int)",
      VariableName::new(heap.alloc_str_for_test("s"), INT_TYPE).debug_print(heap)
    );
    format!("{:?}", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE));
    Expression::var_name(PStr::LOWER_A, INT_TYPE).type_();
    Expression::var_name(PStr::LOWER_A, INT_TYPE).convert_to_callee();
    Expression::StringName(PStr::LOWER_A).convert_to_callee();
    ZERO.convert_to_callee();
    let call = Statement::Call {
      callee: Callee::FunctionName(FunctionNameExpression {
        name: FunctionName {
          type_name: TypeName::new_for_test(PStr::UPPER_A),
          fn_name: PStr::LOWER_A,
        },
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        type_arguments: vec![INT_TYPE],
      }),
      arguments: vec![],
      return_type: INT_TYPE,
      return_collector: None,
    };
    format!("{:?}", call);

    assert!(
      Expression::var_name(
        PStr::LOWER_A,
        Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
      ) == Expression::var_name(
        PStr::LOWER_A,
        Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
      )
    );
    assert!(Type::new_id_no_targs_unwrapped(PStr::UPPER_B)
      .cmp(&Type::new_id_no_targs_unwrapped(PStr::UPPER_B))
      .is_eq());
    assert!(
      Type::new_id_no_targs_unwrapped(PStr::UPPER_B)
        <= Type::new_id_no_targs_unwrapped(PStr::UPPER_B)
    );
    assert!(Type::new_id_no_targs(PStr::UPPER_B)
      .cmp(&Type::new_id_no_targs(PStr::UPPER_B))
      .is_eq());
    assert!(
      FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
        == FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
    );
    assert!(
      FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
        <= FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
    );
    assert!(FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) }
      .cmp(&FunctionType { argument_types: vec![], return_type: Box::new(INT_TYPE) })
      .is_eq());
    assert!(INT_TYPE <= INT_TYPE);
    assert!(INT_TYPE.cmp(&INT_TYPE).eq(&std::cmp::Ordering::Equal));
    assert!(Expression::var_name(
      PStr::LOWER_A,
      Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
    )
    .eq(&Expression::var_name(
      PStr::LOWER_A,
      Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
    )));
    assert!(Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)])
      .eq(&(Type::new_id(PStr::UPPER_A, vec![INT_TYPE, Type::new_id_no_targs(PStr::UPPER_B)]))));
    let mut hasher = DefaultHasher::new();
    BinaryOperator::DIV.hash(&mut hasher);
    Callee::FunctionName(FunctionNameExpression::new(
      FunctionName { type_name: TypeName::new_for_test(PStr::UPPER_A), fn_name: PStr::LOWER_A },
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
    assert_eq!("(a: int)", Expression::var_name(PStr::LOWER_A, INT_TYPE).debug_print(heap));
    assert_eq!(
      "(a: DUMMY_A<int, DUMMY_B>)",
      Expression::var_name(
        PStr::LOWER_A,
        Type::new_id(PStr::UPPER_A, vec![INT_TYPE, (Type::new_id_no_targs(PStr::UPPER_B))])
      )
      .clone()
      .debug_print(heap)
    );
    assert_eq!(
      "(a: DUMMY_A<int>)",
      Expression::var_name(PStr::LOWER_A, Type::new_id(PStr::UPPER_A, vec![(INT_TYPE)]))
        .debug_print(heap)
    );
    assert_eq!("a", Expression::StringName(PStr::LOWER_A).clone().debug_print(heap));
  }

  #[test]
  fn print_type_definition_tests() {
    let heap = &mut Heap::new();

    assert_eq!(
      "object type A = [int, int]",
      TypeDefinition {
        name: TypeName { module_reference: None, type_name: PStr::UPPER_A },
        type_parameters: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .pretty_print(heap)
    );
    assert_eq!(
      "variant type B<C> = [(D: [int]), (E: [int])]",
      TypeDefinition {
        name: TypeName { module_reference: None, type_name: PStr::UPPER_B },
        type_parameters: vec![PStr::UPPER_C],
        mappings: TypeDefinitionMappings::Enum(vec![
          (PStr::UPPER_D, vec![INT_TYPE]),
          (PStr::UPPER_E, vec![INT_TYPE])
        ]),
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
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("FooBar")),
          expression_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
        },
        Statement::EnumInit {
          enum_variable_name: heap.alloc_str_for_test("baz"),
          enum_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Enum")),
          tag: 0,
          associated_data_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("closure"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("CCC")),
          function_name: FunctionNameExpression::new(
            FunctionName {
              type_name: TypeName { module_reference: None, type_name: PStr::UPPER_A },
              fn_name: heap.alloc_str_for_test("foo"),
            },
            Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          ),
          context: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::LT,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::LE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::GT,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::GE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::EQ,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::NE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::LAND,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::LOR,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::SHL,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::SHR,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::XOR.clone(),
          e1: ZERO,
          e2: ZERO,
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("cast"), type_: INT_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("cast"),
          assigned_expression: ZERO,
        },
        Statement::ConditionalDestructure {
          test_expr: ZERO,
          tag: 0,
          bindings: vec![None, Some((PStr::UNDERSCORE, INT_TYPE))],
          s1: vec![Statement::Binary {
            name: heap.alloc_str_for_test("dd"),
            operator: BinaryOperator::XOR.clone(),
            e1: ZERO,
            e2: ZERO,
          }],
          s2: vec![Statement::Binary {
            name: heap.alloc_str_for_test("dd"),
            operator: BinaryOperator::XOR.clone(),
            e1: ZERO,
            e2: ZERO,
          }],
          final_assignments: vec![(PStr::LOWER_A, INT_TYPE, ZERO, ZERO)],
        },
      ],
      s2: vec![
        Statement::Unary {
          name: heap.alloc_str_for_test("dd"),
          operator: UnaryOperator::Not,
          operand: ZERO,
        },
        Statement::Unary {
          name: heap.alloc_str_for_test("dd"),
          operator: UnaryOperator::IsPointer,
          operand: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::PLUS,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::MINUS,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::MINUS,
          e1: ZERO,
          e2: Expression::int(-2147483648),
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::MUL,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::DIV,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: BinaryOperator::MOD,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression::new(
            FunctionName {
              type_name: TypeName { module_reference: None, type_name: PStr::UPPER_A },
              fn_name: PStr::LOWER_H,
            },
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::new_id_no_targs(heap.alloc_str_for_test("FooBar")),
          )],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str_for_test("vibez")),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName {
              type_name: TypeName { module_reference: None, type_name: PStr::EMPTY },
              fn_name: heap.alloc_str_for_test("stresso"),
            },
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            type_arguments: vec![INT_TYPE],
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
            Type::new_id_no_targs(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        },
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
  let baz: DUMMY_FooBar = [meggo];
  let baz: DUMMY_Enum = [0, meggo];
  let closure: DUMMY_CCC = Closure { fun: (A$foo: (int) -> int), context: 0 };
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
  let cast: int;
  cast = 0;
  let [_, _: int] if tagof(0)==0 {
    let dd = 0 ^ 0;
    a = 0;
  } else {
    let dd = 0 ^ 0;
    a = 0;
  }
  bar = (b1: int);
} else {
  let dd = !0;
  let dd = is_pointer(0);
  let dd = 0 + 0;
  let dd = 0 - 0;
  let dd = 0 - -2147483648;
  let dd = 0 * 0;
  let dd = 0 / 0;
  let dd = 0 % 0;
  let vibez: int = A$h((big: DUMMY_FooBar));
  $stresso<int>((d: int));
  (d: int)((d: int));
  let f: int = (big: DUMMY_FooBar)[0];
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
        name: TypeName { module_reference: None, type_name: PStr::UPPER_C },
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        name: TypeName { module_reference: None, type_name: heap.alloc_str_for_test("Foo") },
        type_parameters: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .clone()],
      main_function_names: vec![FunctionName {
        type_name: TypeName { module_reference: None, type_name: heap.alloc_str_for_test("Foo") },
        fn_name: heap.alloc_str_for_test("ddd"),
      }],
      functions: vec![Function {
        name: FunctionName {
          type_name: TypeName { module_reference: None, type_name: heap.alloc_str_for_test("Foo") },
          fn_name: heap.alloc_str_for_test("Bar"),
        },
        parameters: vec![PStr::LOWER_F],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: PStr::LOWER_F,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str_for_test("big"),
            Type::new_id_no_targs(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        }],
        return_value: ZERO,
      }
      .clone()],
    };
    format!("{sources1:?}");
    let expected1 = r#"const dev_meggo = 'vibez';

closure type C = () -> int
object type Foo = [int, int]
function Foo$Bar(f: int): int {
  let f: int = (big: DUMMY_FooBar)[0];
  return 0;
}

sources.mains = [Foo$ddd]"#;
    assert_eq!(expected1, sources1.debug_print(heap));

    let sources2 = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![],
      functions: vec![Function {
        name: FunctionName {
          type_name: TypeName { module_reference: None, type_name: heap.alloc_str_for_test("Foo") },
          fn_name: heap.alloc_str_for_test("Bar"),
        },
        parameters: vec![PStr::LOWER_F],
        type_parameters: vec![PStr::UPPER_A],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![],
        return_value: ZERO,
      }],
    };
    let expected2 = r#"function Foo$Bar<A>(f: int): int {
  return 0;
}
"#;
    assert_eq!(expected2, sources2.debug_print(heap));
  }
}
