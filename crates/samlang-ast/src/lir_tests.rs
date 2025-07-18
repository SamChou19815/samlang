#[cfg(test)]
mod tests {
  use super::super::lir::*;
  use crate::{
    hir::{BinaryOperator, GlobalString},
    mir::{FunctionName, SymbolTable, TypeNameId},
  };
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    assert!(INT_32_TYPE.as_fn().is_none());
    assert!(ZERO.as_fn_name().is_none());

    let table = &mut SymbolTable::new();
    assert!(
      !format!(
        "{:?}{:?}{:?}",
        Expression::Variable(
          PStr::LOWER_A,
          Type::Id(table.create_type_name_for_test(PStr::UPPER_A))
        )
        .clone(),
        Expression::StringName(PStr::LOWER_A).clone(),
        Type::new_fn(vec![INT_32_TYPE, INT_31_TYPE], INT_32_TYPE).clone()
      )
      .is_empty()
    );
  }

  #[test]
  fn type_eq_test() {
    let table = &mut SymbolTable::new();

    assert_eq!(
      false,
      Type::Id(table.create_type_name_for_test(PStr::LOWER_A))
        .is_the_same_type(&Type::Id(table.create_type_name_for_test(PStr::LOWER_B)))
    );
    assert_eq!(
      false,
      Type::Id(table.create_type_name_for_test(PStr::LOWER_A)).is_the_same_type(&INT_32_TYPE)
    );
    assert_eq!(
      true,
      Type::new_fn(vec![(INT_32_TYPE)], INT_32_TYPE)
        .is_the_same_type(&Type::new_fn(vec![(INT_32_TYPE)], INT_32_TYPE))
    );
  }

  #[test]
  fn print_sources_tests() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let sources = Sources {
      global_variables: vec![
        GlobalString(heap.alloc_str_for_test("dev_meggo_vibez")),
        GlobalString(heap.alloc_str_for_test(r#"f"\""#)),
      ],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: vec![INT_32_TYPE, INT_31_TYPE],
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: Vec::new(),
        },
      ],
      main_function_names: Vec::new(),
      functions: vec![
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: Vec::new(),
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("Bar")),
          parameters: vec![PStr::LOWER_F, PStr::LOWER_G],
          type_: Type::new_fn_unwrapped(vec![INT_32_TYPE, INT_32_TYPE], INT_32_TYPE),
          body: vec![
            Statement::UntypedIndexedAccess {
              name: PStr::LOWER_F,
              type_: INT_32_TYPE,
              pointer_expression: Expression::Variable(
                heap.alloc_str_for_test("big"),
                Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
              ),
              index: 0,
            },
            Statement::IndexedAccess {
              name: PStr::LOWER_F,
              type_: INT_32_TYPE,
              pointer_expression: Expression::Variable(
                heap.alloc_str_for_test("big"),
                Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
              ),
              index: 0,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("Bar2")),
          parameters: vec![PStr::LOWER_F, PStr::LOWER_G],
          type_: Type::new_fn_unwrapped(
            vec![
              Type::Fn(Type::new_fn_unwrapped(vec![INT_32_TYPE, INT_32_TYPE], INT_32_TYPE)),
              Type::Fn(Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE)),
            ],
            INT_32_TYPE,
          ),
          body: Vec::new(),
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::LOWER_F),
          parameters: vec![heap.alloc_str_for_test("v1")],
          type_: Type::new_fn_unwrapped(
            vec![Type::Fn(Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE))],
            INT_32_TYPE,
          ),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("baz"),
                type_: Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                expression_list: vec![Expression::StringName(
                  heap.alloc_str_for_test("dev_meggo_vibez"),
                )],
              },
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LT, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::LE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::GT, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::GE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::EQ, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::NE, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::XOR, ZERO, ZERO),
              Statement::While {
                loop_variables: Vec::new(),
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: false,
                  statements: Vec::new(),
                }],
                break_collector: None,
              },
              Statement::While {
                loop_variables: vec![GenenalLoopVariable {
                  name: PStr::UNDERSCORE,
                  type_: INT_32_TYPE,
                  initial_value: ZERO,
                  loop_value: ZERO,
                }],
                statements: vec![Statement::SingleIf {
                  condition: ZERO,
                  invert_condition: true,
                  statements: vec![Statement::Break(ZERO)],
                }],
                break_collector: Some((PStr::UNDERSCORE, INT_32_TYPE)),
              },
            ],
            s2: vec![
              Statement::Not { name: heap.alloc_str_for_test("dd"), operand: ZERO },
              Statement::IsPointer {
                name: heap.alloc_str_for_test("dd"),
                pointer_type: TypeNameId::STR,
                operand: ZERO,
              },
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::PLUS, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MINUS, ZERO, ZERO),
              Statement::binary(
                heap.alloc_str_for_test("dd"),
                BinaryOperator::MINUS,
                ZERO,
                Expression::Int31Literal(-21478),
              ),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MUL, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::DIV, ZERO, ZERO),
              Statement::binary(heap.alloc_str_for_test("dd"), BinaryOperator::MOD, ZERO, ZERO),
              Statement::Call {
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("h")),
                  Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
                ),
                arguments: vec![Expression::Variable(
                  heap.alloc_str_for_test("big"),
                  Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                )],
                return_type: INT_32_TYPE,
                return_collector: Some(heap.alloc_str_for_test("vibez")),
              },
              Statement::Call {
                callee: Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("stresso")),
                  Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
                ),
                arguments: vec![Expression::Variable(PStr::LOWER_D, INT_32_TYPE)],
                return_type: INT_32_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(PStr::LOWER_D, INT_32_TYPE),
                arguments: vec![Expression::Variable(PStr::LOWER_D, INT_32_TYPE)],
                return_type: INT_32_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(PStr::LOWER_D, INT_32_TYPE),
                arguments: vec![Expression::Variable(PStr::LOWER_D, INT_32_TYPE), ZERO],
                return_type: INT_32_TYPE,
                return_collector: None,
              },
              Statement::Call {
                callee: Expression::Variable(PStr::LOWER_D, INT_32_TYPE),
                arguments: Vec::new(),
                return_type: INT_32_TYPE,
                return_collector: None,
              },
              Statement::IndexedAccess {
                name: PStr::LOWER_F,
                type_: INT_32_TYPE,
                pointer_expression: Expression::Variable(
                  heap.alloc_str_for_test("big"),
                  Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("FooBar"))),
                ),
                index: 0,
              },
              Statement::UntypedIndexedAssign {
                assigned_expression: ZERO,
                pointer_expression: ZERO,
                index: 0,
              },
              Statement::Cast {
                name: PStr::LOWER_C,
                type_: INT_32_TYPE,
                assigned_expression: ZERO,
              },
              Statement::LateInitDeclaration {
                name: heap.alloc_str_for_test("c"),
                type_: INT_32_TYPE,
              },
              Statement::LateInitAssignment {
                name: heap.alloc_str_for_test("c"),
                assigned_expression: ZERO,
              },
              Statement::Break(ZERO),
            ],
            final_assignments: vec![(
              heap.alloc_str_for_test("bar"),
              INT_32_TYPE,
              Expression::Variable(heap.alloc_str_for_test("b1"), INT_32_TYPE),
              Expression::Variable(heap.alloc_str_for_test("b2"), INT_32_TYPE),
            )],
          }],
          return_value: ZERO,
        },
      ],
      symbol_table: table,
    };
    let expected = format!(
      r#"{}const GLOBAL_STRING_0: _Str = [0, `dev_meggo_vibez` as unknown as number];
const GLOBAL_STRING_1: _Str = [0, `f"\"` as unknown as number];
type _Foo = [number, i31];
type _Foo = [];
function __$main(): number {{
  return 0;
}}
function __$Bar(f: number, g: number): number {{
  let f: number = big[0];
  let f: number = big[0];
  return 0;
}}
function __$Bar2(f: (t0: number, t1: number) => number, g: () => number): number {{
  return 0;
}}
function __$f(v1: (t0: number) => number): number {{
  let bar: number;
  if (0) {{
    let baz: _FooBar = [GLOBAL_STRING_0];
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
    let dd = !0;
    let dd = typeof 0 === 'object';
    let dd = 0 + 0;
    let dd = 0 + 0;
    let dd = 0 - -42955;
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
    let c = 0 as unknown as number;
    let c: number = undefined as any;
    c = 0;
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
