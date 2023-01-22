#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, FALSE, INT_TYPE, ONE, TRUE, ZERO,
    },
    common::Heap,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    expected: &str,
  ) {
    let Function { body, return_value, .. } =
      super::super::conditional_constant_propagation::optimize_function(
        Function {
          name: heap.alloc_str(""),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: stmts,
          return_value,
        },
        heap,
      );
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(|it| it.debug_print(heap)).join("\n"),
      return_value.debug_print(heap)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_sequence_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a0"),
          Operator::PLUS,
          Expression::int(3),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
        ),
        Statement::IndexedAccess {
          name: heap.alloc_str("i0"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          index: 2,
        },
        Statement::binary(
          heap.alloc_str("a3"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str("b1"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b2"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b3"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("b2"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b4"),
          Operator::MOD,
          Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b5"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b6"),
          Operator::MOD,
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b7"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("b8"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a4"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a3"), INT_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str("a5"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("a4"), INT_TYPE),
          Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a6"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("i1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a5"), INT_TYPE),
        ),
        Statement::StructInit {
          struct_variable_name: heap.alloc_str("s"),
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str("Id")),
          expression_list: vec![
            Expression::var_name(heap.alloc_str("b2"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a6"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a5"), INT_TYPE),
          ],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str("s"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str("Id")),
          function_name: FunctionName::new(
            heap.alloc_str("closure"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          ),
          context: Expression::var_name(heap.alloc_str("b2"), INT_TYPE),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str("fff"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b2"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b3"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b4"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b5"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b6"), INT_TYPE),
            Expression::var_name(heap.alloc_str("b7"), INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::binary(
          heap.alloc_str("a7"),
          Operator::MOD,
          Expression::var_name(heap.alloc_str("a5"), INT_TYPE),
          Expression::int(12),
        ),
        Statement::binary(
          heap.alloc_str("a8"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a7"), INT_TYPE),
          Expression::int(7),
        ),
        Statement::binary(
          heap.alloc_str("a9"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("a7"), INT_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str("a10"),
          Operator::MOD,
          Expression::var_name(heap.alloc_str("a7"), INT_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str("a11"),
          Operator::DIV,
          Expression::int(-11),
          Expression::int(10),
        ),
        Statement::binary(
          heap.alloc_str("a12"),
          Operator::DIV,
          Expression::int(11),
          Expression::int(10),
        ),
        Statement::binary(
          heap.alloc_str("a13"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a11"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a8"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a14"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a13"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a12"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a15"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          heap.alloc_str("a16"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a15"), INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          heap.alloc_str("a17"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a14"), INT_TYPE),
          Expression::var_name(heap.alloc_str("a16"), INT_TYPE),
        ),
        Statement::binary(
          heap.alloc_str("a18"),
          Operator::DIV,
          Expression::var_name(heap.alloc_str("a15"), INT_TYPE),
          Expression::int(5),
        ),
      ],
      Expression::var_name(heap.alloc_str("a17"), INT_TYPE),
      heap,
      r#"let i0: int = 6[2];
let b8: int = (i0: int) * (i0: int);
let a6: int = (i1: int) / 30;
let s: Id = [0, (a6: int), 30];
let s: Id = Closure { fun: (closure: () -> int), context: 0 };
fff(1, 0, 0, 0, 0, 0, 1);
let a9: int = 6 / 0;
let a10: int = 6 % 0;
let a15: int = (i0: int) * 5;
let a16: int = (a15: int) + 5;
let a17: int = (a15: int) + 47;
let a18: int = (a15: int) / 5;
return (a17: int);"#,
    );
  }

  #[test]
  fn index_sequence_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: heap.alloc_str("a"),
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str("Id")),
          expression_list: vec![ZERO, ONE],
        },
        Statement::IndexedAccess {
          name: heap.alloc_str("v1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str("a"),
            Type::new_id_no_targs(heap.alloc_str("Id")),
          ),
          index: 0,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str("v2"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(
            heap.alloc_str("a"),
            Type::new_id_no_targs(heap.alloc_str("Id")),
          ),
          index: 1,
        },
        Statement::binary(
          heap.alloc_str("result"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("v1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("v2"), INT_TYPE),
        ),
      ],
      Expression::var_name(heap.alloc_str("result"), INT_TYPE),
      heap,
      r#"let a: Id = [0, 1];
return 1;"#,
    );
  }

  #[test]
  fn binary_sequence_tests() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(2),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: int = (a0: int) + 4;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: int = (a0: int) + -1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + -2;
let a2: int = (a0: int) + 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::MINUS,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + -2;
let a2: int = (a0: int) + -5;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str("a3"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a4"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a3"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) * 2;
let a2: int = (a0: int) * 6;
let a3: int = (a0: int) + 2;
let a4: int = (a3: int) * 3;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::LT,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) < 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::LE,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) <= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::GT,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) > 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::GE,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) >= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::EQ,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) == 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::NE,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) + 2;
let a2: bool = (a0: int) != 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MUL,
          Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          Expression::int(2),
        ),
        Statement::binary(
          heap.alloc_str("a2"),
          Operator::EQ,
          Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
          Expression::int(3),
        ),
      ],
      ZERO,
      heap,
      r#"let a1: int = (a0: int) * 2;
let a2: bool = (a1: int) == 3;
return 0;"#,
    );
  }

  #[test]
  fn if_else_tests() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str("b1"), Operator::LT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b1"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::binary(heap.alloc_str("b2"), Operator::GT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b2"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::binary(heap.alloc_str("b3"), Operator::LE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b3"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a2")),
          }],
          final_assignments: vec![(
            heap.alloc_str("ma1"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
          )],
        },
        Statement::binary(heap.alloc_str("b4"), Operator::GE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b4"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a11")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a22")),
          }],
          final_assignments: vec![(
            heap.alloc_str("ma2"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str("a11"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a22"), INT_TYPE),
          )],
        },
        Statement::binary(
          heap.alloc_str("r1"),
          Operator::EQ,
          Expression::var_name(heap.alloc_str("ma1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("ma2"), INT_TYPE),
        ),
        Statement::binary(heap.alloc_str("r2"), Operator::NE, ONE, ZERO),
        Statement::binary(heap.alloc_str("r3"), Operator::XOR, TRUE, FALSE),
        Statement::binary(heap.alloc_str("r4"), Operator::NE, ONE, ZERO),
        Statement::binary(
          heap.alloc_str("r5"),
          Operator::EQ,
          Expression::var_name(heap.alloc_str("r4"), BOOL_TYPE),
          Expression::var_name(heap.alloc_str("r2"), BOOL_TYPE),
        ),
      ],
      Expression::var_name(heap.alloc_str("r5"), BOOL_TYPE),
      heap,
      r#"foo();
bar();
let a1: int = foo();
let a22: int = bar();
let r1: bool = (a22: int) == (a1: int);
return 1;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str("a0"),
          Operator::PLUS,
          Expression::int(3),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str("a1"),
          Operator::MUL,
          Expression::int(3),
          Expression::int(3),
        ),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name(heap.alloc_str("a0"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name(heap.alloc_str("a1"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name(heap.alloc_str("a0"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("bar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name(heap.alloc_str("a1"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("a2")),
          }],
          final_assignments: vec![(
            heap.alloc_str("ma1"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str("a1"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a2"), INT_TYPE),
          )],
        },
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str("b"), BOOL_TYPE),
          s1: vec![],
          s2: vec![],
          final_assignments: vec![(
            heap.alloc_str("ma2"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
            Expression::var_name(heap.alloc_str("a0"), INT_TYPE),
          )],
        },
      ],
      Expression::var_name(heap.alloc_str("ma2"), INT_TYPE),
      heap,
      r#"if (b: bool) {
  foo(6);
} else {
  bar(9);
}
let ma1: int;
if (b: bool) {
  let a1: int = foo(6);
  ma1 = 9;
} else {
  let a2: int = bar(9);
  ma1 = (a2: int);
}
return 6;"#,
    );

    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: false,
        statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
      }],
      ZERO,
      heap,
      "\nreturn 0;",
    );
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: true,
        statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
      }],
      ZERO,
      heap,
      "undefined = (n: int);\nbreak;\nreturn 0;",
    );
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: Expression::var_name(heap.alloc_str("n"), INT_TYPE),
        invert_condition: false,
        statements: vec![],
      }],
      ZERO,
      heap,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_tests() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(4),
          loop_value: Expression::var_name(heap.alloc_str("_tmp_n"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("is_zero"), BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
          },
          Statement::binary(
            heap.alloc_str("_tmp_n"),
            Operator::MINUS,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(4),
          loop_value: Expression::var_name(heap.alloc_str("_tmp_n"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("is_zero"), BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
          },
          Statement::binary(
            heap.alloc_str("_tmp_n"),
            Operator::MINUS,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ONE,
          ),
        ],
        break_collector: Some(VariableName { name: heap.alloc_str("b"), type_: INT_TYPE }),
      }],
      Expression::var_name(heap.alloc_str("b"), INT_TYPE),
      heap,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str("_tmp_n"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("is_zero"), BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
          },
          Statement::binary(
            heap.alloc_str("_tmp_n"),
            Operator::MINUS,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      r#"let n: int = 4;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = (n: int);
    break;
  }
  let _tmp_n: int = (n: int) + -1;
  n = (_tmp_n: int);
}
return 0;"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(10),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("is_zero"), BOOL_TYPE),
            invert_condition: true,
            statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
          },
          Statement::binary(
            heap.alloc_str("_tmp_n"),
            Operator::MINUS,
            Expression::var_name(heap.alloc_str("n"), INT_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str("t"), INT_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
        break_collector: None,
      }],
      ZERO,
      heap,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str("t"), INT_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name(heap.alloc_str("n"), INT_TYPE))],
        break_collector: Some(VariableName { name: heap.alloc_str("v"), type_: INT_TYPE }),
      }],
      Expression::var_name(heap.alloc_str("v"), INT_TYPE),
      heap,
      "\nreturn 10;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(11),
        }],
        statements: vec![],
        break_collector: Some(VariableName { name: heap.alloc_str("v"), type_: INT_TYPE }),
      }],
      Expression::var_name(heap.alloc_str("v"), INT_TYPE),
      heap,
      r#"let n: int = 11;
let v: int;
while (true) {
  n = 11;
}
return (v: int);"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![],
        statements: vec![Statement::binary(
          heap.alloc_str("a"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str("v1"), INT_TYPE),
          Expression::var_name(heap.alloc_str("v2"), INT_TYPE),
        )],
        break_collector: None,
      }],
      ZERO,
      heap,
      r#"while (true) {
  let a: int = (v2: int) + (v1: int);
}
return 0;"#,
    );
  }
}
