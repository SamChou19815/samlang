#[cfg(test)]
mod tests {
  use super::super::hir::*;
  use crate::{common::well_known_pstrs, Heap};
  use pretty_assertions::assert_eq;
  use std::{collections::hash_map::DefaultHasher, hash::Hash};

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(ZERO.as_int_literal().is_some());
    assert!(!format!(
      "{:?}",
      Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(
          well_known_pstrs::UPPER_A,
          vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
        )
      )
    )
    .is_empty());
    assert!(!format!(
      "{:?}",
      Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(
          well_known_pstrs::UPPER_A,
          vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
        )
      )
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::StringName(well_known_pstrs::LOWER_A)).is_empty());
    assert!(!format!("{:?}", Operator::GE).is_empty());
    assert!(Operator::MINUS <= Operator::GE);
    assert!(!format!("{:?}", Operator::MINUS.partial_cmp(&Operator::GE)).is_empty());
    assert!(!format!("{:?}", Operator::MINUS.cmp(&Operator::GE)).is_empty());
    assert!(!format!("{:?}", ZERO.type_()).is_empty());
    assert!(!format!("{:?}", Expression::StringName(well_known_pstrs::LOWER_A).type_().as_id())
      .is_empty());
    assert!(Expression::StringName(well_known_pstrs::LOWER_A).type_().as_id().is_some());
    assert_eq!(
      "(s: int)",
      VariableName::new(heap.alloc_str_for_test("s"), INT_TYPE).debug_print(heap)
    );
    assert!(!format!("{:?}", Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE)).is_empty());
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).type_();
    Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).convert_to_callee();
    Expression::StringName(well_known_pstrs::LOWER_A).convert_to_callee();
    ZERO.convert_to_callee();
    let call = Statement::Call {
      callee: Callee::FunctionName(FunctionName {
        name: well_known_pstrs::LOWER_A,
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        type_arguments: vec![INT_TYPE],
      }),
      arguments: vec![],
      return_type: INT_TYPE,
      return_collector: None,
    };
    assert!(!format!("{:?}", call).is_empty());

    assert!(
      Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(
          well_known_pstrs::UPPER_A,
          vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
        )
      ) == Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(
          well_known_pstrs::UPPER_A,
          vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
        )
      )
    );
    assert!(Type::new_id_no_targs_unwrapped(well_known_pstrs::UPPER_B)
      .cmp(&Type::new_id_no_targs_unwrapped(well_known_pstrs::UPPER_B))
      .is_eq());
    assert!(
      Type::new_id_no_targs_unwrapped(well_known_pstrs::UPPER_B)
        <= Type::new_id_no_targs_unwrapped(well_known_pstrs::UPPER_B)
    );
    assert!(Type::new_id_no_targs(well_known_pstrs::UPPER_B)
      .cmp(&Type::new_id_no_targs(well_known_pstrs::UPPER_B))
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
      well_known_pstrs::LOWER_A,
      Type::new_id(
        well_known_pstrs::UPPER_A,
        vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
      )
    )
    .eq(&Expression::var_name(
      well_known_pstrs::LOWER_A,
      Type::new_id(
        well_known_pstrs::UPPER_A,
        vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
      )
    )));
    assert!(Type::new_id(
      well_known_pstrs::UPPER_A,
      vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
    )
    .eq(
      &(Type::new_id(
        well_known_pstrs::UPPER_A,
        vec![INT_TYPE, Type::new_id_no_targs(well_known_pstrs::UPPER_B)]
      ))
    ));
    let mut hasher = DefaultHasher::new();
    Operator::DIV.hash(&mut hasher);
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
    assert_eq!(
      "(a: int)",
      Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE).debug_print(heap)
    );
    assert_eq!(
      "(a: A<int, B>)",
      Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(
          well_known_pstrs::UPPER_A,
          vec![INT_TYPE, (Type::new_id_no_targs(well_known_pstrs::UPPER_B))]
        )
      )
      .clone()
      .debug_print(heap)
    );
    assert_eq!(
      "(a: A<int>)",
      Expression::var_name(
        well_known_pstrs::LOWER_A,
        Type::new_id(well_known_pstrs::UPPER_A, vec![(INT_TYPE)])
      )
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
        type_parameters: vec![],
        names: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .pretty_print(heap)
    );
    assert_eq!(
      "variant type B<C>",
      TypeDefinition {
        identifier: well_known_pstrs::UPPER_B,
        type_parameters: vec![well_known_pstrs::UPPER_C],
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
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("FooBar")),
          expression_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("closure"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("CCC")),
          function_name: FunctionName::new(
            heap.alloc_str_for_test("foo"),
            Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          ),
          context: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::LT,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::LE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::GT,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::GE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::EQ,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::NE,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::LAND,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::LOR,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::SHL,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::SHR,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::XOR.clone(),
          e1: ZERO,
          e2: ZERO,
        },
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
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::PLUS,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::MINUS,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::MINUS,
          e1: ZERO,
          e2: Expression::int(-2147483648),
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::MUL,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::DIV,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Binary {
          name: heap.alloc_str_for_test("dd"),
          operator: Operator::MOD,
          e1: ZERO,
          e2: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str_for_test("h"),
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
          callee: Callee::FunctionName(FunctionName {
            name: heap.alloc_str_for_test("stresso"),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            type_arguments: vec![INT_TYPE],
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
            Type::new_id_no_targs(heap.alloc_str_for_test("FooBar")),
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
  let dd = 0 - 0;
  let dd = 0 - -2147483648;
  let dd = 0 * 0;
  let dd = 0 / 0;
  let dd = 0 % 0;
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
        name: heap.alloc_str_for_test("dev_meggo"),
        content: heap.alloc_str_for_test("vibez"),
      }
      .clone()],
      closure_types: vec![ClosureTypeDefinition {
        identifier: well_known_pstrs::LOWER_C,
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
      }
      .clone()],
      type_definitions: vec![TypeDefinition {
        identifier: heap.alloc_str_for_test("Foo"),
        type_parameters: vec![],
        names: vec![],
        mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
      }
      .clone()],
      main_function_names: vec![heap.alloc_str_for_test("ddd")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("Bar"),
        parameters: vec![well_known_pstrs::LOWER_F],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: well_known_pstrs::LOWER_F,
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
        type_parameters: vec![well_known_pstrs::UPPER_A],
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
}
