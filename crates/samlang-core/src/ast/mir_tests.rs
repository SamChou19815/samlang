#[cfg(test)]
mod tests {
  use super::super::mir::*;
  use crate::{
    ast::{
      common_names,
      hir::{GlobalVariable, Operator},
    },
    Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert!(PrimitiveType::Int.eq(&PrimitiveType::Int));
    assert!(STRING_TYPE.as_fn().is_none());
    assert!(ZERO.as_name().is_none());

    assert!(!format!(
      "{:?}",
      Expression::Variable(heap.alloc_str_for_test("a"), Type::Id(heap.alloc_str_for_test("A")))
        .clone()
    )
    .is_empty());
    assert!(!format!("{:?}", Expression::Name(heap.alloc_str_for_test("a"), STRING_TYPE).clone())
      .is_empty());
    assert!(!format!("{:?}", Type::new_fn(vec![(INT_TYPE)], INT_TYPE).clone()).is_empty());
  }

  #[test]
  fn type_eq_test() {
    let heap = &mut Heap::new();

    assert!(INT_TYPE
      .is_the_same_type(Expression::Variable(heap.alloc_str_for_test("a"), INT_TYPE).type_()));
    assert!(STRING_TYPE.is_the_same_type(Expression::IntLiteral(1, STRING_TYPE).type_()));
    assert!(!Type::Id(heap.alloc_str_for_test("a"))
      .is_the_same_type(&Type::Id(heap.alloc_str_for_test("b"))));
    assert!(!Type::Id(heap.alloc_str_for_test("a")).is_the_same_type(&INT_TYPE));
    assert!(Type::new_fn(vec![(INT_TYPE)], INT_TYPE)
      .is_the_same_type(&Type::new_fn(vec![(INT_TYPE)], INT_TYPE)));
  }

  #[test]
  fn print_types_and_expressions_tests() {
    let heap = &mut Heap::new();

    assert_eq!("number", INT_TYPE.pretty_print(heap));
    assert_eq!("_Str", STRING_TYPE.pretty_print(heap));
    assert_eq!("any", ANY_TYPE.pretty_print(heap));
    assert_eq!("0", ZERO.clone().pretty_print(heap));
    assert_eq!(
      "a",
      Expression::Variable(heap.alloc_str_for_test("a"), STRING_TYPE).pretty_print(heap)
    );
    assert_eq!("a", Expression::Name(heap.alloc_str_for_test("a"), STRING_TYPE).pretty_print(heap));
    assert_eq!(
      "(t0: number) => number",
      Type::new_fn(vec![(INT_TYPE)], INT_TYPE).pretty_print(heap)
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
          type_: Type::Id(heap.alloc_str_for_test("FooBar")),
          expression_list: vec![Expression::Name(heap.alloc_str_for_test("meggo"), STRING_TYPE)],
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
          break_collector: Some((heap.alloc_str_for_test("_"), INT_TYPE)),
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
          callee: Expression::Name(heap.alloc_str_for_test("h"), Type::new_fn(vec![], INT_TYPE)),
          arguments: vec![Expression::Variable(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          )],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str_for_test("vibez")),
        },
        Statement::Call {
          callee: Expression::Name(
            heap.alloc_str_for_test("stresso"),
            Type::new_fn(vec![], INT_TYPE),
          ),
          arguments: vec![Expression::Variable(heap.alloc_str_for_test("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Expression::Variable(heap.alloc_str_for_test("d"), INT_TYPE),
          arguments: vec![Expression::Variable(heap.alloc_str_for_test("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::Variable(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        },
        Statement::IndexedAssign { assigned_expression: ZERO, pointer_expression: ZERO, index: 0 },
        Statement::Cast {
          name: heap.alloc_str_for_test("c"),
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
    };
    let f = Function {
      name: heap.alloc_str_for_test("f"),
      parameters: vec![heap.alloc_str_for_test("v1")],
      type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      body: vec![stmt],
      return_value: ZERO,
    };
    let expected = r#"function f(v1: number): number {
  let bar: number;
  if (0) {
    let baz: FooBar = [meggo];
    let dd = Number(0 < 0);
    let dd = Number(0 <= 0);
    let dd = Number(0 > 0);
    let dd = Number(0 >= 0);
    let dd = Number(0 == 0);
    let dd = Number(0 != 0);
    let dd = 0 ^ 0;
    while (true) {
      if (0) {
      }
    }
    let _: number = 0;
    let _: number;
    while (true) {
      if (!0) {
        _ = 0;
        break;
      }
      _ = 0;
    }
    bar = b1;
  } else {
    let dd = 0 + 0;
    let dd = 0 + 0;
    let dd = 0 - -2147483648;
    let dd = 0 * 0;
    let dd = Math.floor(0 / 0);
    let dd = 0 % 0;
    let vibez: number = h(big);
    stresso(d);
    d(d);
    let f: number = big[0];
    0[0] = 0;
    let c = 0 as number;
    break;
    bar = b2;
  }
  return 0;
}
"#;
    assert_eq!(expected, f.pretty_print(heap));
  }

  #[test]
  fn print_sources_tests() {
    let heap = &mut Heap::new();

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
      type_definitions: vec![TypeDefinition {
        name: heap.alloc_str_for_test("Foo"),
        mappings: vec![INT_TYPE, INT_TYPE],
      }],
      main_function_names: vec![],
      functions: vec![Function {
        name: heap.alloc_str_for_test("Bar"),
        parameters: vec![heap.alloc_str_for_test("f")],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: heap.alloc_str_for_test("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::Variable(
            heap.alloc_str_for_test("big"),
            Type::Id(heap.alloc_str_for_test("FooBar")),
          ),
          index: 0,
        }],
        return_value: ZERO,
      }],
    };
    let expected = format!(
      r#"const {} = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const {} = (_: number, [, line]: _Str): number => {{ console.log(line); return 0; }};
const {} = (_: number, [, v]: _Str): number => parseInt(v, 10);
const {} = (_: number, v: number): _Str => [1, String(v)];
const {} = (_: number, [, v]: _Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
const dev_meggo: _Str = [0, `vibez`];
const esc: _Str = [0, `f"\"`];
type Foo = [number, number];
function Bar(f: number): number {{
  let f: number = big[0];
  return 0;
}}
"#,
      common_names::encoded_fn_name_string_concat(),
      common_names::encoded_fn_name_println(),
      common_names::encoded_fn_name_string_to_int(),
      common_names::encoded_fn_name_int_to_string(),
      common_names::encoded_fn_name_panic(),
      common_names::ENCODED_FN_NAME_FREE
    );
    assert_eq!(expected, sources.pretty_print(heap));
  }
}
