#[cfg(test)]
mod tests {
  use std::collections::HashSet;

  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::Heap,
    optimization::dead_code_elimination,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_correctly_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    expected: &str,
  ) {
    let Function { body, return_value, .. } = dead_code_elimination::optimize_function(Function {
      name: heap.alloc_str_for_test(""),
      parameters: vec![],
      type_parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: stmts,
      return_value,
    });
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(|s| s.debug_print(heap)).join("\n"),
      return_value.debug_print(heap)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_test_1() {
    let heap = &mut Heap::new();

    let stmts = vec![
      Statement::binary(heap.alloc_str_for_test("u1"), Operator::DIV, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("u2"), Operator::MOD, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("u3"), Operator::PLUS, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("p"), Operator::PLUS, ZERO, ONE),
      Statement::IndexedAccess {
        name: heap.alloc_str_for_test("i"),
        type_: INT_TYPE,
        pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE),
        index: 3,
      },
      Statement::StructInit {
        struct_variable_name: heap.alloc_str_for_test("s"),
        type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("S")),
        expression_list: vec![Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE)],
      },
      Statement::Cast {
        name: heap.alloc_str_for_test("i_am_definitely_unused"),
        type_: INT_TYPE,
        assigned_expression: Expression::var_name(heap.alloc_str_for_test("s"), INT_TYPE),
      },
      Statement::Call {
        callee: Callee::FunctionName(FunctionName::new(
          heap.alloc_str_for_test("ff"),
          Type::new_fn_unwrapped(vec![], INT_TYPE),
        )),
        arguments: vec![Expression::var_name(heap.alloc_str_for_test("s"), INT_TYPE)],
        return_type: INT_TYPE,
        return_collector: None,
      },
    ];

    let mut used_set = HashSet::new();
    used_set.insert(heap.alloc_str_for_test("ii"));
    dead_code_elimination::collect_use_from_stmts(&stmts, &mut used_set);
    assert_eq!(
      vec!["p", "s", "ii"],
      used_set.into_iter().sorted().map(|p| p.as_str(heap)).collect_vec()
    );

    assert_correctly_optimized(
      stmts,
      Expression::var_name(heap.alloc_str_for_test("ii"), INT_TYPE),
      heap,
      r#"let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let s: S = [(p: int)];
ff((s: int));
return (ii: int);"#,
    );
  }

  #[test]
  fn simple_test_2() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("u1"), Operator::DIV, ZERO, ONE),
        Statement::binary(heap.alloc_str_for_test("u2"), Operator::MOD, ZERO, ONE),
        Statement::binary(heap.alloc_str_for_test("u3"), Operator::PLUS, ZERO, ONE),
        Statement::binary(heap.alloc_str_for_test("p"), Operator::PLUS, ZERO, ONE),
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE),
          index: 3,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i1"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE),
          index: 3,
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("S")),
          expression_list: vec![Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE)],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Id")),
          function_name: FunctionName::new(
            heap.alloc_str_for_test("closure"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          ),
          context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_TYPE),
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s1"),
          closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Id")),
          function_name: FunctionName::new(
            heap.alloc_str_for_test("closure"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          ),
          context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_TYPE),
        },
        Statement::Cast {
          name: heap.alloc_str_for_test("s2"),
          type_: INT_TYPE,
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("s1"), INT_TYPE),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            heap.alloc_str_for_test("ff"),
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("s1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("s2"), INT_TYPE),
          ],
          return_type: INT_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      r#"let u1: int = 0 / 1;
let u2: int = 0 % 1;
let p: int = 0 + 1;
let i1: int = (p: int)[3];
let s1: Id = Closure { fun: (closure: () -> int), context: (b2: int) };
let s2 = (s1: int) as int;
ff((i1: int), (s1: int), (s2: int));
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_1() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![],
        },
      ],
      ZERO,
      heap,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_2() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![(
            heap.alloc_str_for_test("ma"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str_for_test("a1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a2"), INT_TYPE),
          )],
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("ma"), INT_TYPE),
      heap,
      r#"let b: bool = 0 == 1;
let ma: int;
if (b: bool) {
  let a1: int = s1();
  ma = (a1: int);
} else {
  let a2: int = s1();
  ma = (a2: int);
}
return (ma: int);"#,
    );
  }

  #[test]
  fn if_else_test_3() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("s1"), INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![(
            heap.alloc_str_for_test("ma"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str_for_test("a1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a2"), INT_TYPE),
          )],
        },
      ],
      ZERO,
      heap,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  (s1: int)();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_4() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b"), BOOL_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![(
            heap.alloc_str_for_test("ma"),
            INT_TYPE,
            Expression::var_name(heap.alloc_str_for_test("a1"), INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a2"), INT_TYPE),
          )],
        },
      ],
      ZERO,
      heap,
      r#"let b: bool = 0 == 1;
if (b: bool) {
  s1();
} else {
  s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_5() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b"), BOOL_TYPE),
          s1: vec![],
          s2: vec![],
          final_assignments: vec![],
        },
      ],
      ZERO,
      heap,
      "\nreturn 0;",
    );
  }

  #[test]
  fn single_if_test() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b"), Operator::EQ, ZERO, ONE),
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), BOOL_TYPE),
          invert_condition: false,
          statements: vec![],
        },
      ],
      ZERO,
      heap,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_test_1() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("unused"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::int(20),
          },
        ],
        statements: vec![
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("s1"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ZERO],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("s1"), INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), BOOL_TYPE),
            s1: vec![
              Statement::IndexedAccess {
                name: heap.alloc_str_for_test("s"),
                type_: INT_TYPE,
                pointer_expression: ZERO,
                index: 0,
              },
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("s"),
                type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("S")),
                expression_list: vec![Expression::var_name(heap.alloc_str_for_test("p"), INT_TYPE)],
              },
              Statement::ClosureInit {
                closure_variable_name: heap.alloc_str_for_test("s"),
                closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Id")),
                function_name: FunctionName::new(
                  heap.alloc_str_for_test("closure"),
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                ),
                context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_TYPE),
              },
            ],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              Operator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              ONE,
            )],
            final_assignments: vec![(
              heap.alloc_str_for_test("_tmp_n"),
              INT_TYPE,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_TYPE),
            )],
          },
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      r#"let n: int = 10;
while (true) {
  s1(0);
  (s1: int)();
  while (true) {
  }
  let is_zero: bool = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: bool) {
    _tmp_n = (n: int);
  } else {
    let s2_n: int = (n: int) + -1;
    _tmp_n = (s2_n: int);
  }
  n = (_tmp_n: int);
}
return 0;"#,
    );
  }

  #[test]
  fn while_test_2() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n1"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::int(20),
          },
        ],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            Operator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
        ],
        break_collector: Some(VariableName { name: heap.alloc_str_for_test("v"), type_: INT_TYPE }),
      }],
      ZERO,
      heap,
      r#"let n: int = 10;
while (true) {
  let is_zero: bool = (n: int) == 0;
  if (is_zero: bool) {
    undefined = 0;
    break;
  }
  n = (_tmp_n: int);
}
return 0;"#,
    );
  }

  #[test]
  fn while_test_3() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("n1"), INT_TYPE),
        }],
        statements: vec![Statement::binary(
          heap.alloc_str_for_test("n1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
          ZERO,
        )],
        break_collector: Some(VariableName { name: heap.alloc_str_for_test("v"), type_: INT_TYPE }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
      heap,
      r#"let n: int = 10;
let v: int;
while (true) {
  let n1: int = (n: int) + 0;
  n = (n1: int);
}
return (v: int);"#,
    );
  }

  #[test]
  fn while_test_4() {
    let heap = &mut Heap::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_TYPE,
          initial_value: Expression::int(10),
          loop_value: Expression::int(11),
        }],
        statements: vec![Statement::binary(
          heap.alloc_str_for_test("n1"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
          ZERO,
        )],
        break_collector: None,
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
      heap,
      r#"while (true) {
}
return (v: int);"#,
    );
  }
}
