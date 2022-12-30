#[cfg(test)]
mod tests {
  use super::super::mir::*;
  use crate::{
    ast::{
      common_names,
      hir::{GlobalVariable, Operator},
    },
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert!(PrimitiveType::Int.eq(&PrimitiveType::Int));
    assert!(STRING_TYPE.as_fn().is_none());

    assert!(!format!("{:?}", Expression::Variable(rcs("a"), Type::Id(rcs("A"))).clone()).is_empty());
    assert!(!format!("{:?}", Expression::Name(rcs("a"), STRING_TYPE).clone()).is_empty());
    assert!(!format!("{:?}", Type::new_fn(vec![(INT_TYPE)], INT_TYPE).clone()).is_empty());
  }

  #[test]
  fn type_eq_test() {
    assert!(INT_TYPE.is_the_same_type(Expression::Variable(rcs("a"), INT_TYPE).type_()));
    assert!(BOOL_TYPE.is_the_same_type(Expression::Name(rcs("a"), BOOL_TYPE).type_()));
    assert!(STRING_TYPE.is_the_same_type(Expression::IntLiteral(1, STRING_TYPE).type_()));
    assert!(STRING_TYPE.is_the_same_type(&ANY_TYPE));
    assert!(!Type::new_id("a").is_the_same_type(&Type::new_id("b")));
    assert!(!Type::new_id("a").is_the_same_type(&INT_TYPE));
    assert!(Type::new_fn(vec![(INT_TYPE)], INT_TYPE)
      .is_the_same_type(&Type::new_fn(vec![(INT_TYPE)], INT_TYPE)));
  }

  #[test]
  fn print_types_and_expressions_tests() {
    assert_eq!("boolean", BOOL_TYPE.clone().pretty_print());
    assert_eq!("number", INT_TYPE.pretty_print());
    assert_eq!("Str", STRING_TYPE.pretty_print());
    assert_eq!("any", ANY_TYPE.pretty_print());
    assert_eq!("0", ZERO.clone().pretty_print());
    assert_eq!("true", TRUE.clone().pretty_print());
    assert_eq!("false", FALSE.clone().pretty_print());
    assert_eq!("a", Expression::Variable(rcs("a"), STRING_TYPE).pretty_print());
    assert_eq!("a", Expression::Name(rcs("a"), STRING_TYPE).pretty_print());
    assert_eq!("(t0: number) => number", Type::new_fn(vec![(INT_TYPE)], INT_TYPE).pretty_print());
  }

  #[test]
  fn print_statement_tests() {
    let stmt = Statement::IfElse {
      condition: ZERO,
      s1: vec![
        Statement::StructInit {
          struct_variable_name: rcs("baz"),
          type_: Type::new_id("FooBar"),
          expression_list: vec![Expression::Name(rcs("meggo"), STRING_TYPE)],
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
          break_collector: Some((rcs("_"), INT_TYPE)),
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
          callee: Expression::Name(rcs("h"), Type::new_fn(vec![], INT_TYPE)),
          arguments: vec![Expression::Variable(rcs("big"), Type::new_id("FooBar"))],
          return_type: INT_TYPE,
          return_collector: Some(rcs("vibez")),
        },
        Statement::Call {
          callee: Expression::Name(rcs("stresso"), Type::new_fn(vec![], INT_TYPE)),
          arguments: vec![Expression::Variable(rcs("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Expression::Variable(rcs("d"), INT_TYPE),
          arguments: vec![Expression::Variable(rcs("d"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::IndexedAccess {
          name: rcs("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::Variable(rcs("big"), Type::new_id("FooBar")),
          index: 0,
        },
        Statement::IndexedAssign { assigned_expression: ZERO, pointer_expression: ZERO, index: 0 },
        Statement::Cast { name: rcs("c"), type_: BOOL_TYPE, assigned_expression: ZERO },
        Statement::Break(ZERO),
      ],
      final_assignments: vec![(
        rcs("bar"),
        INT_TYPE,
        Expression::Variable(rcs("b1"), INT_TYPE),
        Expression::Variable(rcs("b2"), INT_TYPE),
      )],
    };
    let f = Function {
      name: rcs("f"),
      parameters: vec![rcs("v1")],
      type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      body: vec![stmt],
      return_value: ZERO,
    };
    let expected = r#"function f(v1: number): number {
  let bar: number;
  if (0) {
    let baz: FooBar = [meggo];
    let dd: boolean = 0 < 0;
    let dd: boolean = 0 <= 0;
    let dd: boolean = 0 > 0;
    let dd: boolean = 0 >= 0;
    let dd: boolean = 0 == 0;
    let dd: boolean = 0 != 0;
    let dd: boolean = 0 ^ 0;
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
    let dd: number = 0 + 0;
    let dd: number = 0 + 0;
    let dd: number = 0 - -2147483648;
    let dd: number = 0 * 0;
    let dd: number = Math.floor(0 / 0);
    let dd: number = 0 % 0;
    let vibez: number = h(big);
    stresso(d);
    d(d);
    let f: number = big[0];
    0[0] = 0;
    let c = 0 as boolean;
    break;
    bar = b2;
  }
  return 0;
}
"#;
    assert_eq!(expected, f.pretty_print());
  }

  #[test]
  fn print_sources_tests() {
    let sources = Sources {
      global_variables: vec![
        GlobalVariable { name: rcs("dev_meggo"), content: rcs("vibez") },
        GlobalVariable { name: rcs("esc"), content: rcs(r#"f"\""#) },
      ],
      type_definitions: vec![TypeDefinition {
        name: rcs("Foo"),
        mappings: vec![INT_TYPE, BOOL_TYPE],
      }],
      main_function_names: vec![],
      functions: vec![Function {
        name: rcs("Bar"),
        parameters: vec![rcs("f")],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IndexedAccess {
          name: rcs("f"),
          type_: INT_TYPE,
          pointer_expression: Expression::Variable(rcs("big"), Type::new_id("FooBar")),
          index: 0,
        }],
        return_value: ZERO,
      }],
    };
    let expected = format!(
      r#"type Str = [number, string];
const {} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const {} = ([, line]: Str): number => {{ console.log(line); return 0; }};
const {} = ([, v]: Str): number => parseInt(v, 10);
const {} = (v: number): Str => [1, String(v)];
const {} = ([, v]: Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
const dev_meggo: Str = [0, `vibez`];
const esc: Str = [0, `f"\"`];
type Foo = [number, boolean];
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
      common_names::encoded_fn_name_free()
    );
    assert_eq!(expected, sources.pretty_print());
  }
}
