#[cfg(test)]
mod tests {
  use super::super::lir::*;
  use crate::{
    ast::{
      hir::{GlobalVariable, Operator},
      mir::{FunctionName, SymbolTable},
    },
    common::{well_known_pstrs, Heap},
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(PrimitiveType::Int.eq(&PrimitiveType::Int));
    assert!(INT_TYPE.as_fn().is_none());
    assert!(ZERO.as_fn_name().is_none());

    let table = &mut SymbolTable::new();
    assert!(!format!(
      "{:?}",
      Expression::Variable(
        well_known_pstrs::LOWER_A,
        Type::Id(table.create_type_name_for_test(well_known_pstrs::UPPER_A))
      )
      .clone()
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::StringName(well_known_pstrs::LOWER_A).clone()).is_empty());
    assert!(!format!("{:?}", Type::new_fn(vec![(INT_TYPE)], INT_TYPE).clone()).is_empty());
  }

  #[test]
  fn type_eq_test() {
    let table = &mut SymbolTable::new();

    assert!(!Type::Id(table.create_type_name_for_test(well_known_pstrs::LOWER_A))
      .is_the_same_type(&Type::Id(table.create_type_name_for_test(well_known_pstrs::LOWER_B))));
    assert!(!Type::Id(table.create_type_name_for_test(well_known_pstrs::LOWER_A))
      .is_the_same_type(&INT_TYPE));
    assert!(Type::new_fn(vec![(INT_TYPE)], INT_TYPE)
      .is_the_same_type(&Type::new_fn(vec![(INT_TYPE)], INT_TYPE)));
  }

  #[test]
  fn print_sources_tests() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let sources = Sources {
      global_variables: vec![
        GlobalVariable {
          name: heap.alloc_str_for_test("dev_meggo"),
          content: heap.alloc_str_for_test("vibez"),
        },
        GlobalVariable {
          name: heap.alloc_str_for_test("esc"),
          content: heap.alloc_str_for_test(r#"f"\""#),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: vec![INT_TYPE, INT_TYPE],
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: vec![],
        },
      ],
      main_function_names: vec![],
      functions: vec![
        Function {
          name: FunctionName::new_for_test(well_known_pstrs::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("Bar")),
          parameters: vec![well_known_pstrs::LOWER_F, well_known_pstrs::LOWER_G],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![Statement::IndexedAccess {
            name: well_known_pstrs::LOWER_F,
            type_: INT_TYPE,
            pointer_expression: Expression::Variable(
              heap.alloc_str_for_test("big"),
              Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
            ),
            index: 0,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(well_known_pstrs::LOWER_F),
          parameters: vec![heap.alloc_str_for_test("v1")],
          type_: Type::new_fn_unwrapped(
            vec![Type::Fn(Type::new_fn_unwrapped(vec![], INT_TYPE))],
            INT_TYPE,
          ),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("baz"),
                type_: Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                expression_list: vec![Expression::StringName(heap.alloc_str_for_test("meggo"))],
              },
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::LT, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::LE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::GT, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::GE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::EQ, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::NE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), Operator::XOR.clone(), ZERO, ZERO),
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
                  name: well_known_pstrs::UNDERSCORE,
                  type_: INT_TYPE,
                  initial_value: ZERO,
                  loop_value: ZERO,
                }],
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: true,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: Some((well_known_pstrs::UNDERSCORE, INT_TYPE)),
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
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("h")),
                  Type::new_fn(vec![], INT_TYPE),
                ),
                arguments: vec![Expression::Variable(
                  heap.alloc_str_for_test("big"),
                  Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                )],
                return_type: INT_TYPE,
                return_collector: Some(heap.alloc_str_for_test("vibez")),
              },
              Statement::Call {
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("stresso")),
                  Type::new_fn(vec![], INT_TYPE),
                ),
                arguments: vec![Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE),
                arguments: vec![Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE)],
                return_type: INT_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE),
                arguments: vec![Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE), ZERO],
                return_type: INT_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(well_known_pstrs::LOWER_D, INT_TYPE),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
              Statement::IndexedAccess {
                name: well_known_pstrs::LOWER_F,
                type_: INT_TYPE,
                pointer_expression: Expression::Variable(
                  heap.alloc_str_for_test("big"),
                  Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                ),
                index: 0,
              },
              Statement::IndexedAssign {
                assigned_expression: ZERO,
                pointer_expression: ZERO,
                index: 0,
              },
              Statement::Cast {
                name: well_known_pstrs::LOWER_C,
                type_: INT_TYPE,
                assigned_expression: ZERO,
              },
              Statement::Break(ZERO),
            ],
            final_assignments: vec![(
              heap.alloc_str_for_test("bar"),
              INT_TYPE,
              Expression::Variable(heap.alloc_str_for_test("b1"), INT_TYPE),
              Expression::Variable(heap.alloc_str_for_test("b2"), INT_TYPE),
            )],
          }],
          return_value: ZERO,
        },
      ],
      symbol_table: table,
    };
    let expected = format!(
      r#"{}const dev_meggo: _Str = [0, `vibez`];
const esc: _Str = [0, `f"\"`];
type _Foo = [number, number];
type _Foo = [];
function __$main(): number {{
  return 0;
}}
function __$Bar(f: number, g: number): number {{
  let f: number = big[0];
  return 0;
}}
function __$f(v1: () => number): number {{
  let bar: number;
  if (0) {{
    let baz: _FooBar = [meggo];
    let dd = Number(0 < 0);
    let dd = Number(0 <= 0);
    let dd = Number(0 > 0);
    let dd = Number(0 >= 0);
    let dd = Number(0 == 0);
    let dd = Number(0 != 0);
    let dd = 0 ^ 0;
    while (true) {{
      if (0) {{
      }}
    }}
    let _: number = 0;
    let _: number;
    while (true) {{
      if (!0) {{
        _ = 0;
        break;
      }}
      _ = 0;
    }}
    bar = b1;
  }} else {{
    let dd = 0 + 0;
    let dd = 0 + 0;
    let dd = 0 - -2147483648;
    let dd = 0 * 0;
    let dd = Math.floor(0 / 0);
    let dd = 0 % 0;
    let vibez: number = __$h(big);
    __$stresso(d);
    d(d);
    d(d, 0);
    d();
    let f: number = big[0];
    0[0] = 0;
    let c = 0 as number;
    break;
    bar = b2;
  }}
  return 0;
}}
"#,
      ts_prolog(),
    );
    assert_eq!(expected, sources.pretty_print(heap));
  }
}
