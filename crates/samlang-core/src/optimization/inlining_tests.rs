#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Statement, Type,
      VariableName, INT_TYPE, ONE, ZERO,
    },
    common::{well_known_pstrs, Heap},
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn empty_test() {
    assert!(super::super::inlining::optimize_functions(vec![], &mut Heap::new()).is_empty());
  }

  fn assert_correctly_inlined(functions: Vec<Function>, heap: &mut Heap, expected: &str) {
    let actual = super::super::inlining::optimize_functions(functions, heap)
      .into_iter()
      .map(|mut f| {
        super::super::conditional_constant_propagation::optimize_function(&mut f, heap);
        f.debug_print(heap)
      })
      .join("\n");
    assert_eq!(expected, actual);
  }

  fn big_stmts(heap: &mut Heap) -> Vec<Statement> {
    let mut stmts = vec![];
    for _ in 0..100 {
      stmts.push(Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_A,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        }],
        statements: vec![
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("i0"),
            type_: INT_TYPE,
            pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
            index: 2,
          },
          Statement::binary(
            heap.alloc_str_for_test("b0"),
            Operator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("i0"), INT_TYPE),
            Expression::int(3),
          ),
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("s"),
            type_name: heap.alloc_str_for_test("SS"),
            expression_list: vec![
              Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b3"), INT_TYPE),
            ],
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fff"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![
              Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b3"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::binary(
              well_known_pstrs::LOWER_A,
              Operator::PLUS,
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
            s2: vec![Statement::binary(
              well_known_pstrs::LOWER_A,
              Operator::PLUS,
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(well_known_pstrs::LOWER_A, INT_TYPE, ZERO, ZERO)],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary(
              well_known_pstrs::LOWER_A,
              Operator::PLUS,
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
          },
          Statement::binary(
            well_known_pstrs::LOWER_A,
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
            Expression::int(3),
          ),
        ],
        break_collector: None,
      });
    }
    stmts
  }

  #[test]
  fn abort_tests() {
    let heap = &mut Heap::new();

    super::super::inlining::optimize_functions(
      vec![Function {
        name: well_known_pstrs::LOWER_A,
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: big_stmts(heap),
        return_value: ZERO,
      }],
      heap,
    );

    super::super::inlining::optimize_functions(
      vec![
        Function {
          name: heap.alloc_str_for_test("loop"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("loop"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: well_known_pstrs::LOWER_A,
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: big_stmts(heap),
          return_value: ZERO,
        },
      ],
      heap,
    );
  }

  #[test]
  fn test1() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("factorial"),
          parameters: vec![heap.alloc_str_for_test("n"), heap.alloc_str_for_test("acc")],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::binary(
              well_known_pstrs::LOWER_C,
              Operator::EQ,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              ZERO,
            ),
            Statement::IfElse {
              condition: Expression::var_name(well_known_pstrs::LOWER_C, INT_TYPE),
              s1: vec![],
              s2: vec![
                Statement::binary(
                  heap.alloc_str_for_test("n1"),
                  Operator::MINUS,
                  Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                  ONE,
                ),
                Statement::binary(
                  heap.alloc_str_for_test("acc1"),
                  Operator::MUL,
                  Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                  Expression::var_name(heap.alloc_str_for_test("acc"), INT_TYPE),
                ),
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str_for_test("factorial"),
                    Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
                  )),
                  arguments: vec![
                    Expression::var_name(heap.alloc_str_for_test("n1"), INT_TYPE),
                    Expression::var_name(heap.alloc_str_for_test("acc1"), INT_TYPE),
                  ],
                  return_type: INT_TYPE,
                  return_collector: Some(heap.alloc_str_for_test("v")),
                },
              ],
              final_assignments: vec![(
                heap.alloc_str_for_test("fa"),
                INT_TYPE,
                Expression::var_name(heap.alloc_str_for_test("acc"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
              )],
            },
          ],
          return_value: Expression::var_name(heap.alloc_str_for_test("fa"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str_for_test("loop"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("loop"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("insanelyBigFunction"),
          parameters: vec![well_known_pstrs::LOWER_A],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("bb"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("cc"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("moveMove"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new(well_known_pstrs::LOWER_A, INT_TYPE)),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ]
          .into_iter()
          .chain((0..10).map(|_| Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("non-existing-function"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }))
          .collect(),
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("moveMove"),
          parameters: vec![well_known_pstrs::LOWER_A],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Cast {
              name: heap.alloc_str_for_test("_"),
              type_: INT_TYPE,
              assigned_expression: ZERO,
            },
            Statement::IndexedAccess {
              name: well_known_pstrs::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              index: 0,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("bb"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::IndexedAccess {
              name: well_known_pstrs::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              index: 0,
            }],
            s2: vec![Statement::IndexedAccess {
              name: well_known_pstrs::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
              index: 0,
            }],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("cc"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(well_known_pstrs::LOWER_A, INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
      ],
      heap,
      r#"function bb(): int {
  let c: int = (a: int)[0];
  return 0;
}

function cc(): int {
  (a: int)();
  return 0;
}

function loop(): int {
  loop();
  return 0;
}

function factorial(n: int, acc: int): int {
  let c = (n: int) == 0;
  let fa: int;
  if (c: int) {
    fa = (acc: int);
  } else {
    let n1 = (n: int) + -1;
    let acc1 = (n: int) * (acc: int);
    let v: int = factorial((n1: int), (acc1: int));
    fa = (v: int);
  }
  return (fa: int);
}

function insanelyBigFunction(a: int): int {
  let _t4c: int = (a: int)[0];
  (a: int)();
  let _t6_ = 0 as int;
  let _t6c: int = (a: int)[0];
  (a: int)();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  non-existing-function();
  return 0;
}

function moveMove(a: int): int {
  let _ = 0 as int;
  let c: int = (a: int)[0];
  return 0;
}
"#,
    );
  }

  #[test]
  fn test2() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            s1: vec![],
            s2: vec![
              Statement::binary(heap.alloc_str_for_test("vvv"), Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  heap.alloc_str_for_test("fooBar"),
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                )),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
            ],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      r#"function fooBar(): int {
  if (bar: int) {
  } else {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
  } else {
    if (bar: int) {
    } else {
      if (bar: int) {
      } else {
        if (bar: int) {
        } else {
          if (bar: int) {
          } else {
            fooBar();
          }
        }
      }
    }
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test3() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            invert_condition: false,
            statements: vec![
              Statement::binary(heap.alloc_str_for_test("vvv"), Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  heap.alloc_str_for_test("fooBar"),
                  Type::new_fn_unwrapped(vec![], INT_TYPE),
                )),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
            ],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      r#"function fooBar(): int {
  if (bar: int) {
    fooBar();
  }
  return 0;
}

function main(): int {
  if (bar: int) {
    if (bar: int) {
      if (bar: int) {
        if (bar: int) {
          if (bar: int) {
            fooBar();
          }
        }
      }
    }
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test4() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("fooBar"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![(
              well_known_pstrs::LOWER_B,
              INT_TYPE,
              ZERO,
              Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
            )],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      r#"function fooBar(): int {
  let b: int;
  if (bar: int) {
    fooBar();
    b = 0;
  } else {
    b = (a: int);
  }
  return 0;
}

function main(): int {
  let _t0b: int;
  if (bar: int) {
    let _t1b: int;
    if (bar: int) {
      let _t2b: int;
      if (bar: int) {
        let _t3b: int;
        if (bar: int) {
          let _t4b: int;
          if (bar: int) {
            fooBar();
            _t4b = 0;
          } else {
            _t4b = (a: int);
          }
          _t3b = 0;
        } else {
          _t3b = (a: int);
        }
        _t2b = 0;
      } else {
        _t2b = (a: int);
      }
      _t1b = 0;
    } else {
      _t1b = (a: int);
    }
    _t0b = 0;
  } else {
    _t0b = (a: int);
  }
  return 0;
}
"#,
    );
  }

  #[test]
  fn test5() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![heap.alloc_str_for_test("bar"), heap.alloc_str_for_test("baz")],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("ff"),
              type_name: heap.alloc_str_for_test("FF"),
              expression_list: vec![
                Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("baz"), INT_TYPE),
              ],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("s"),
              closure_type_name: heap.alloc_str_for_test("SS"),
              function_name: FunctionName::new(
                heap.alloc_str_for_test("aaa"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              ),
              context: ZERO,
            },
            Statement::Break(ZERO),
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ONE, ZERO],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: ZERO,
        },
      ],
      heap,
      r#"function fooBar(bar: int, baz: int): int {
  let ff: FF = [(bar: int), (baz: int)];
  let s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}

function main(): int {
  let _t0ff: FF = [1, 0];
  let _t0s: SS = Closure { fun: (aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}
"#,
    );
  }

  #[test]
  fn test6() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![Function {
        name: heap.alloc_str_for_test("fooBar"),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: heap.alloc_str_for_test("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
          }],
          statements: vec![Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName {
            name: heap.alloc_str_for_test("v"),
            type_: INT_TYPE,
          }),
        }],
        return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
      }],
      heap,
      r#"function fooBar(): int {
  return 0;
}
"#,
    );
  }

  #[test]
  fn test7() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: heap.alloc_str_for_test("n"),
              type_: INT_TYPE,
              initial_value: Expression::int(10),
              loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_TYPE),
            }],
            statements: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("fooBar"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("_tmp_n")),
            }],
            break_collector: None,
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      r#"function fooBar(): int {
  let n: int = 10;
  while (true) {
    let _tmp_n: int = fooBar();
    n = (_tmp_n: int);
  }
  return (v: int);
}

function main(): int {
  let _t0n: int = 10;
  while (true) {
    let _t2n: int = 10;
    while (true) {
      let _t4n: int = 10;
      while (true) {
        let _t6n: int = 10;
        while (true) {
          let _t8n: int = 10;
          while (true) {
            let _t8_tmp_n: int = fooBar();
            _t8n = (_t8_tmp_n: int);
          }
          _t6n = (v: int);
        }
        _t4n = (v: int);
      }
      _t2n = (v: int);
    }
    _t0n = (v: int);
  }
  return (v: int);
}
"#,
    );
  }

  #[test]
  fn test8() {
    let heap = &mut Heap::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: heap.alloc_str_for_test("fooBar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![],
            statements: vec![Statement::Break(ZERO)],
            break_collector: Some(VariableName {
              name: heap.alloc_str_for_test("v"),
              type_: INT_TYPE,
            }),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      r#"function fooBar(): int {
  return 0;
}

function main(): int {
  return 0;
}
"#,
    );
  }
}
