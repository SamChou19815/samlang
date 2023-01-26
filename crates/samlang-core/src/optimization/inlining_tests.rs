#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::Heap,
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
      .map(|f| {
        super::super::conditional_constant_propagation::optimize_function(f, heap).debug_print(heap)
      })
      .join("\n");
    assert_eq!(expected, actual);
  }

  fn big_stmts(heap: &mut Heap) -> Vec<Statement> {
    let mut stmts = vec![];
    for _ in 0..100 {
      stmts.push(Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str(""),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        }],
        statements: vec![
          Statement::IndexedAccess {
            name: heap.alloc_str("i0"),
            type_: INT_TYPE,
            pointer_expression: Expression::var_name(heap.alloc_str("a"), INT_TYPE),
            index: 2,
          },
          Statement::binary(
            heap.alloc_str("b0"),
            Operator::PLUS,
            Expression::var_name(heap.alloc_str("i0"), INT_TYPE),
            Expression::int(3),
          ),
          Statement::StructInit {
            struct_variable_name: heap.alloc_str("s"),
            type_: Type::new_id_no_targs_unwrapped(heap.alloc_str("SS")),
            expression_list: vec![
              Expression::var_name(heap.alloc_str("i1"), INT_TYPE),
              Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
              Expression::var_name(heap.alloc_str("b3"), INT_TYPE),
            ],
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fff"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![
              Expression::var_name(heap.alloc_str("i1"), INT_TYPE),
              Expression::var_name(heap.alloc_str("b1"), INT_TYPE),
              Expression::var_name(heap.alloc_str("b3"), INT_TYPE),
            ],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::binary(
              heap.alloc_str(""),
              Operator::PLUS,
              Expression::var_name(heap.alloc_str(""), INT_TYPE),
              Expression::int(3),
            )],
            s2: vec![Statement::binary(
              heap.alloc_str(""),
              Operator::PLUS,
              Expression::var_name(heap.alloc_str(""), INT_TYPE),
              Expression::int(3),
            )],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(heap.alloc_str("a"), INT_TYPE, ZERO, ZERO)],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary(
              heap.alloc_str(""),
              Operator::PLUS,
              Expression::var_name(heap.alloc_str(""), INT_TYPE),
              Expression::int(3),
            )],
          },
          Statement::binary(
            heap.alloc_str(""),
            Operator::PLUS,
            Expression::var_name(heap.alloc_str(""), INT_TYPE),
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
        name: heap.alloc_str(""),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: big_stmts(heap),
        return_value: ZERO,
      }],
      heap,
    );

    super::super::inlining::optimize_functions(
      vec![
        Function {
          name: heap.alloc_str("loop"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("loop"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str(""),
          parameters: vec![],
          type_parameters: vec![],
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
          name: heap.alloc_str("factorial"),
          parameters: vec![heap.alloc_str("n"), heap.alloc_str("acc")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::binary(
              heap.alloc_str("c"),
              Operator::EQ,
              Expression::var_name(heap.alloc_str("n"), INT_TYPE),
              ZERO,
            ),
            Statement::IfElse {
              condition: Expression::var_name(heap.alloc_str("c"), BOOL_TYPE),
              s1: vec![],
              s2: vec![
                Statement::binary(
                  heap.alloc_str("n1"),
                  Operator::MINUS,
                  Expression::var_name(heap.alloc_str("n"), INT_TYPE),
                  ONE,
                ),
                Statement::binary(
                  heap.alloc_str("acc1"),
                  Operator::MUL,
                  Expression::var_name(heap.alloc_str("n"), INT_TYPE),
                  Expression::var_name(heap.alloc_str("acc"), INT_TYPE),
                ),
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str("factorial"),
                    Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
                  )),
                  arguments: vec![
                    Expression::var_name(heap.alloc_str("n1"), INT_TYPE),
                    Expression::var_name(heap.alloc_str("acc1"), INT_TYPE),
                  ],
                  return_type: INT_TYPE,
                  return_collector: Some(heap.alloc_str("v")),
                },
              ],
              final_assignments: vec![(
                heap.alloc_str("fa"),
                INT_TYPE,
                Expression::var_name(heap.alloc_str("acc"), INT_TYPE),
                Expression::var_name(heap.alloc_str("v"), INT_TYPE),
              )],
            },
          ],
          return_value: Expression::var_name(heap.alloc_str("fa"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str("loop"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("loop"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("insanelyBigFunction"),
          parameters: vec![heap.alloc_str("a")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str("bb"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str("cc"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str("moveMove"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new(heap.alloc_str("a"), INT_TYPE)),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ]
          .into_iter()
          .chain((0..10).into_iter().map(|_| Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("non-existing-function"),
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
          name: heap.alloc_str("moveMove"),
          parameters: vec![heap.alloc_str("a")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::IndexedAccess {
            name: heap.alloc_str("c"),
            type_: INT_TYPE,
            pointer_expression: Expression::var_name(heap.alloc_str("a"), INT_TYPE),
            index: 0,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("bb"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::IndexedAccess {
              name: heap.alloc_str("c"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("a"), INT_TYPE),
              index: 0,
            }],
            s2: vec![Statement::IndexedAccess {
              name: heap.alloc_str("c"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("a"), INT_TYPE),
              index: 0,
            }],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("cc"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str("a"), INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
      ],
      heap,
      r#"function factorial(n: int, acc: int): int {
  let c: bool = (n: int) == 0;
  let fa: int;
  if (c: bool) {
    fa = (acc: int);
  } else {
    let n1: int = (n: int) + -1;
    let acc1: int = (acc: int) * (n: int);
    let v: int = factorial((n1: int), (acc1: int));
    fa = (v: int);
  }
  return (fa: int);
}

function loop(): int {
  loop();
  return 0;
}

function insanelyBigFunction(a: int): int {
  let _t18c: int = (a: int)[0];
  (a: int)();
  let _t21c: int = (a: int)[0];
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

function bb(): int {
  let c: int = (a: int)[0];
  return 0;
}

function cc(): int {
  (a: int)();
  return 0;
}

function moveMove(a: int): int {
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str("bar"), INT_TYPE),
            s1: vec![],
            s2: vec![
              Statement::binary(heap.alloc_str("vvv"), Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  heap.alloc_str("fooBar"),
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
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("bar"), INT_TYPE),
            invert_condition: false,
            statements: vec![
              Statement::binary(heap.alloc_str("vvv"), Operator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  heap.alloc_str("fooBar"),
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
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str("bar"), INT_TYPE),
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str("fooBar"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![(
              heap.alloc_str("b"),
              INT_TYPE,
              ZERO,
              Expression::var_name(heap.alloc_str("a"), INT_TYPE),
            )],
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
  let _t9b: int;
  if (bar: int) {
    let _t11b: int;
    if (bar: int) {
      let _t13b: int;
      if (bar: int) {
        let _t15b: int;
        if (bar: int) {
          let _t17b: int;
          if (bar: int) {
            fooBar();
            _t17b = 0;
          } else {
            _t17b = (a: int);
          }
          _t15b = 0;
        } else {
          _t15b = (a: int);
        }
        _t13b = 0;
      } else {
        _t13b = (a: int);
      }
      _t11b = 0;
    } else {
      _t11b = (a: int);
    }
    _t9b = 0;
  } else {
    _t9b = (a: int);
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![heap.alloc_str("bar"), heap.alloc_str("baz")],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: heap.alloc_str("ff"),
              type_: Type::new_id_no_targs_unwrapped(heap.alloc_str("FF")),
              expression_list: vec![
                Expression::var_name(heap.alloc_str("bar"), INT_TYPE),
                Expression::var_name(heap.alloc_str("baz"), INT_TYPE),
              ],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str("s"),
              closure_type: Type::new_id_no_targs_unwrapped(heap.alloc_str("SS")),
              function_name: FunctionName::new(
                heap.alloc_str("aaa"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              ),
              context: ZERO,
            },
            Statement::Break(ZERO),
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![ONE, ZERO],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
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
  let _t13ff: FF = [1, 0];
  let _t13s: SS = Closure { fun: (aaa: () -> int), context: 0 };
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
        name: heap.alloc_str("fooBar"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: vec![Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: heap.alloc_str("n"),
            type_: INT_TYPE,
            initial_value: Expression::int(10),
            loop_value: Expression::var_name(heap.alloc_str("_tmp_n"), INT_TYPE),
          }],
          statements: vec![Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str("n"), BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          }],
          break_collector: Some(VariableName { name: heap.alloc_str("v"), type_: INT_TYPE }),
        }],
        return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: heap.alloc_str("n"),
              type_: INT_TYPE,
              initial_value: Expression::int(10),
              loop_value: Expression::var_name(heap.alloc_str("_tmp_n"), INT_TYPE),
            }],
            statements: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str("fooBar"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str("_tmp_n")),
            }],
            break_collector: None,
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
  let _t8n: int = 10;
  while (true) {
    let _t11n: int = 10;
    while (true) {
      let _t14n: int = 10;
      while (true) {
        let _t17n: int = 10;
        while (true) {
          let _t20n: int = 10;
          while (true) {
            let _t20_tmp_n: int = fooBar();
            _t20n = (_t20_tmp_n: int);
          }
          _t17n = (v: int);
        }
        _t14n = (v: int);
      }
      _t11n = (v: int);
    }
    _t8n = (v: int);
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
          name: heap.alloc_str("fooBar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::While {
            loop_variables: vec![],
            statements: vec![Statement::Break(ZERO)],
            break_collector: Some(VariableName { name: heap.alloc_str("v"), type_: INT_TYPE }),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
        },
        Function {
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str("fooBar"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str("v"), INT_TYPE),
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
