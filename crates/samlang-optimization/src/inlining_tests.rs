#[cfg(test)]
mod tests {
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::{BinaryOperator, UnaryOperator},
    mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, GenenalLoopVariable,
      Statement, SymbolTable, Type, VariableName, INT_TYPE, ONE, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn empty_test() {
    assert!(super::super::inlining::optimize_functions(vec![], &mut Heap::new()).is_empty());
  }

  fn assert_correctly_inlined(
    functions: Vec<Function>,
    heap: &mut Heap,
    table: &SymbolTable,
    expected: &str,
  ) {
    let actual = super::super::inlining::optimize_functions(functions, heap)
      .into_iter()
      .map(|mut f| {
        super::super::conditional_constant_propagation::optimize_function(&mut f, heap);
        f.debug_print(heap, table)
      })
      .join("\n");
    assert_eq!(expected, actual);
  }

  fn big_stmts(heap: &mut Heap, table: &mut SymbolTable) -> Vec<Statement> {
    let mut stmts = vec![];
    for _ in 0..100 {
      stmts.push(Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: PStr::LOWER_A,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: ZERO,
        }],
        statements: vec![
          Statement::IndexedAccess {
            name: heap.alloc_str_for_test("i0"),
            type_: INT_TYPE,
            pointer_expression: Expression::var_name(PStr::LOWER_A, INT_TYPE),
            index: 2,
          },
          Statement::binary(
            heap.alloc_str_for_test("b0"),
            BinaryOperator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("i0"), INT_TYPE),
            Expression::int(3),
          ),
          Statement::StructInit {
            struct_variable_name: heap.alloc_str_for_test("s"),
            type_name: table.create_type_name_for_test(heap.alloc_str_for_test("SS")),
            expression_list: vec![
              Expression::var_name(heap.alloc_str_for_test("i1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b1"), INT_TYPE),
              Expression::var_name(heap.alloc_str_for_test("b3"), INT_TYPE),
            ],
          },
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fff")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
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
              PStr::LOWER_A,
              BinaryOperator::PLUS,
              Expression::var_name(PStr::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
            s2: vec![Statement::binary(
              PStr::LOWER_A,
              BinaryOperator::PLUS,
              Expression::var_name(PStr::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
            final_assignments: vec![],
          },
          Statement::IfElse {
            condition: ZERO,
            s1: vec![],
            s2: vec![],
            final_assignments: vec![(PStr::LOWER_A, INT_TYPE, ZERO, ZERO)],
          },
          Statement::SingleIf {
            condition: ZERO,
            invert_condition: false,
            statements: vec![Statement::binary(
              PStr::LOWER_A,
              BinaryOperator::PLUS,
              Expression::var_name(PStr::LOWER_A, INT_TYPE),
              Expression::int(3),
            )],
          },
          Statement::binary(
            PStr::LOWER_A,
            BinaryOperator::PLUS,
            Expression::var_name(PStr::LOWER_A, INT_TYPE),
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
    let table = &mut SymbolTable::new();

    super::super::inlining::optimize_functions(
      vec![Function {
        name: FunctionName::new_for_test(PStr::LOWER_A),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
        body: big_stmts(heap, table),
        return_value: ZERO,
      }],
      heap,
    );

    super::super::inlining::optimize_functions(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("loop")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("loop")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::LOWER_A),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: big_stmts(heap, table),
          return_value: ZERO,
        },
      ],
      heap,
    );
  }

  #[test]
  fn test1() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("factorial")),
          parameters: vec![heap.alloc_str_for_test("n"), heap.alloc_str_for_test("acc")],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::binary(
              PStr::LOWER_C,
              BinaryOperator::EQ,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
              ZERO,
            ),
            Statement::IfElse {
              condition: Expression::var_name(PStr::LOWER_C, INT_TYPE),
              s1: vec![],
              s2: vec![
                Statement::binary(
                  heap.alloc_str_for_test("n1"),
                  BinaryOperator::MINUS,
                  Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                  ONE,
                ),
                Statement::binary(
                  heap.alloc_str_for_test("acc1"),
                  BinaryOperator::MUL,
                  Expression::var_name(heap.alloc_str_for_test("n"), INT_TYPE),
                  Expression::var_name(heap.alloc_str_for_test("acc"), INT_TYPE),
                ),
                Statement::Call {
                  callee: Callee::FunctionName(FunctionNameExpression {
                    name: FunctionName::new_for_test(heap.alloc_str_for_test("factorial")),
                    type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
                  }),
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
          name: FunctionName::new_for_test(heap.alloc_str_for_test("loop")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("loop")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("insanelyBigFunction")),
          parameters: vec![PStr::LOWER_A],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("bb")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("moveMove")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new(PStr::LOWER_A, INT_TYPE)),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
          ]
          .into_iter()
          .chain((0..10).map(|_| Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("non-existing-function")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }))
          .collect(),
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("moveMove")),
          parameters: vec![PStr::LOWER_A],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Unary {
              name: heap.alloc_str_for_test("u0"),
              operator: UnaryOperator::Not,
              operand: Expression::var_name(PStr::LOWER_A, INT_TYPE),
            },
            Statement::Cast { name: PStr::UNDERSCORE, type_: INT_TYPE, assigned_expression: ZERO },
            Statement::LateInitDeclaration { name: PStr::LOWER_B, type_: INT_TYPE },
            Statement::LateInitAssignment { name: PStr::LOWER_B, assigned_expression: ZERO },
            Statement::IndexedAccess {
              name: PStr::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_TYPE),
              index: 0,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("bb")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: ZERO,
            s1: vec![Statement::IndexedAccess {
              name: PStr::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_TYPE),
              index: 0,
            }],
            s2: vec![Statement::IndexedAccess {
              name: PStr::LOWER_C,
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, INT_TYPE),
              index: 0,
            }],
            final_assignments: vec![],
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(PStr::LOWER_A, INT_TYPE)),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
      ],
      heap,
      table,
      r#"function __$bb(): int {
  let c: int = (a: int)[0];
  return 0;
}

function __$cc(): int {
  (a: int)();
  return 0;
}

function __$factorial(n: int, acc: int): int {
  let c = (n: int) == 0;
  let fa: int;
  if (c: int) {
    fa = (acc: int);
  } else {
    let n1 = (n: int) + -1;
    let acc1 = (n: int) * (acc: int);
    let v: int = __$factorial((n1: int), (acc1: int));
    fa = (v: int);
  }
  return (fa: int);
}

function __$loop(): int {
  __$loop();
  return 0;
}

function __$moveMove(a: int): int {
  let u0 = !(a: int);
  let _ = 0 as int;
  let b: int;
  b = 0;
  let c: int = (a: int)[0];
  return 0;
}

function __$insanelyBigFunction(a: int): int {
  let _t2c: int = (a: int)[0];
  (a: int)();
  let _t4u0 = !(a: int);
  let _t4_ = 0 as int;
  let _t4b: int;
  _t4b = 0;
  let _t4c: int = (a: int)[0];
  (a: int)();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  __$non-existing-function();
  return 0;
}
"#,
    );
  }

  #[test]
  fn test2() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            s1: vec![],
            s2: vec![
              Statement::binary(heap.alloc_str_for_test("vvv"), BinaryOperator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionNameExpression {
                  name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
                  type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
                }),
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
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      table,
      r#"function __$fooBar(): int {
  if (bar: int) {
  } else {
    __$fooBar();
  }
  return 0;
}

function __$main(): int {
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
            __$fooBar();
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
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            invert_condition: false,
            statements: vec![
              Statement::binary(heap.alloc_str_for_test("vvv"), BinaryOperator::PLUS, ZERO, ZERO),
              Statement::Call {
                callee: Callee::FunctionName(FunctionNameExpression {
                  name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
                  type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
                }),
                arguments: vec![],
                return_type: INT_TYPE,
                return_collector: None,
              },
            ],
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      table,
      r#"function __$fooBar(): int {
  if (bar: int) {
    __$fooBar();
  }
  return 0;
}

function __$main(): int {
  if (bar: int) {
    if (bar: int) {
      if (bar: int) {
        if (bar: int) {
          if (bar: int) {
            __$fooBar();
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
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
            s1: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            s2: vec![],
            final_assignments: vec![(
              PStr::LOWER_B,
              INT_TYPE,
              ZERO,
              Expression::var_name(PStr::LOWER_A, INT_TYPE),
            )],
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      table,
      r#"function __$fooBar(): int {
  let b: int;
  if (bar: int) {
    __$fooBar();
    b = 0;
  } else {
    b = (a: int);
  }
  return 0;
}

function __$main(): int {
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
            __$fooBar();
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
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
          parameters: vec![heap.alloc_str_for_test("bar"), heap.alloc_str_for_test("baz")],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE, INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("ff"),
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("FF")),
              expression_list: vec![
                Expression::var_name(heap.alloc_str_for_test("bar"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("baz"), INT_TYPE),
              ],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("s"),
              closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("SS")),
              function_name: FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("aaa")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              },
              context: ZERO,
            },
            Statement::Break(ZERO),
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![ONE, ZERO],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: ZERO,
        },
      ],
      heap,
      table,
      r#"function __$fooBar(bar: int, baz: int): int {
  let ff: _FF = [(bar: int), (baz: int)];
  let s: _SS = Closure { fun: (__$aaa: () -> int), context: 0 };
  undefined = 0;
  break;
  return 0;
}

function __$main(): int {
  let _t0ff: _FF = [1, 0];
  let _t0s: _SS = Closure { fun: (__$aaa: () -> int), context: 0 };
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
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![Function {
        name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
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
      table,
      r#"function __$fooBar(): int {
  return 0;
}
"#,
    );
  }

  #[test]
  fn test7() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
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
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
                type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: Some(heap.alloc_str_for_test("_tmp_n")),
            }],
            break_collector: None,
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      table,
      r#"function __$fooBar(): int {
  let n: int = 10;
  while (true) {
    let _tmp_n: int = __$fooBar();
    n = (_tmp_n: int);
  }
  return (v: int);
}

function __$main(): int {
  let _t0n: int = 10;
  while (true) {
    let _t1n: int = 10;
    while (true) {
      let _t2n: int = 10;
      while (true) {
        let _t3n: int = 10;
        while (true) {
          let _t4n: int = 10;
          while (true) {
            let _t4_tmp_n: int = __$fooBar();
            _t4n = (_t4_tmp_n: int);
          }
          _t3n = (v: int);
        }
        _t2n = (v: int);
      }
      _t1n = (v: int);
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
    let table = &mut SymbolTable::new();

    assert_correctly_inlined(
      vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
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
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("fooBar")),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: Some(heap.alloc_str_for_test("v")),
          }],
          return_value: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
        },
      ],
      heap,
      table,
      r#"function __$fooBar(): int {
  return 0;
}

function __$main(): int {
  return 0;
}
"#,
    );
  }
}
