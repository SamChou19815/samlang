#[cfg(test)]
mod tests {
  use super::super::dead_code_elimination;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::BinaryOperator,
    mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, GenenalLoopVariable,
      INT_32_TYPE, IfElseFinalAssignment, ONE, Statement, SymbolTable, Type, TypeNameId,
      VariableName, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};
  use std::collections::HashSet;

  #[test]
  fn used_test_1() {
    let heap = &mut Heap::new();
    dead_code_elimination::collect_use_from_stmts(
      &[Statement::Not {
        name: heap.alloc_str_for_test("uu"),
        operand: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_32_TYPE),
      }],
      &mut HashSet::new(),
    );
  }

  #[test]
  fn used_test_2() {
    let heap = &mut Heap::new();
    dead_code_elimination::collect_use_from_stmts(
      &[Statement::IsPointer {
        name: heap.alloc_str_for_test("uu"),
        pointer_type: TypeNameId::STR,
        operand: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_32_TYPE),
      }],
      &mut HashSet::new(),
    );
  }

  fn assert_correctly_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    table: &SymbolTable,
    expected: &str,
  ) {
    let mut f = Function {
      name: FunctionName::new_for_test(PStr::LOWER_A),
      parameters: Vec::new(),
      type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
      body: stmts,
      return_value,
    };
    dead_code_elimination::optimize_function(&mut f);
    let actual = format!(
      "{}\nreturn {};",
      f.body.iter().map(|s| s.debug_print(heap, table)).join("\n"),
      f.return_value.debug_print(heap, table)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_test_1() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    let stmts = vec![
      Statement::binary(heap.alloc_str_for_test("u1"), BinaryOperator::DIV, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("u2"), BinaryOperator::MOD, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("u3"), BinaryOperator::PLUS, ZERO, ONE),
      Statement::binary(heap.alloc_str_for_test("p"), BinaryOperator::PLUS, ZERO, ONE),
      Statement::IndexedAccess {
        name: PStr::LOWER_I,
        type_: INT_32_TYPE,
        pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_32_TYPE),
        index: 3,
      },
      Statement::StructInit {
        struct_variable_name: heap.alloc_str_for_test("s"),
        type_name: table.create_type_name_for_test(heap.alloc_str_for_test("S")),
        expression_list: vec![Expression::var_name(heap.alloc_str_for_test("p"), INT_32_TYPE)],
      },
      Statement::Cast {
        name: heap.alloc_str_for_test("i_am_definitely_unused"),
        type_: INT_32_TYPE,
        assigned_expression: Expression::var_name(heap.alloc_str_for_test("s"), INT_32_TYPE),
      },
      Statement::LateInitDeclaration {
        name: heap.alloc_str_for_test("i_am_definitely_unused_2"),
        type_: INT_32_TYPE,
      },
      Statement::LateInitAssignment {
        name: heap.alloc_str_for_test("i_am_definitely_unused_2"),
        assigned_expression: ZERO,
      },
      Statement::Call {
        callee: Callee::FunctionName(FunctionNameExpression {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        }),
        arguments: vec![Expression::var_name(heap.alloc_str_for_test("s"), INT_32_TYPE)],
        return_type: INT_32_TYPE,
        return_collector: None,
      },
    ];

    let mut used_set = HashSet::new();
    used_set.insert(heap.alloc_str_for_test("ii"));
    dead_code_elimination::collect_use_from_stmts(&stmts, &mut used_set);
    assert_eq!(
      vec!["ii", "p", "s",],
      used_set.into_iter().sorted().map(|p| p.as_str(heap).to_string()).collect_vec()
    );

    assert_correctly_optimized(
      stmts,
      Expression::var_name(heap.alloc_str_for_test("ii"), INT_32_TYPE),
      heap,
      table,
      r#"let u1 = 0 / 1;
let u2 = 0 % 1;
let p = 0 + 1;
let s: _S = [(p: int)];
__$ff((s: int));
return (ii: int);"#,
    );
  }

  #[test]
  fn simple_test_2() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::Not { name: heap.alloc_str_for_test("u0_unused"), operand: ONE },
        Statement::IsPointer {
          name: heap.alloc_str_for_test("u0"),
          pointer_type: TypeNameId::STR,
          operand: ONE,
        },
        Statement::binary(
          heap.alloc_str_for_test("u1"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("u0"), INT_32_TYPE),
          ONE,
        ),
        Statement::binary(heap.alloc_str_for_test("u2"), BinaryOperator::MOD, ZERO, ONE),
        Statement::binary(heap.alloc_str_for_test("u3"), BinaryOperator::PLUS, ZERO, ONE),
        Statement::binary(heap.alloc_str_for_test("p"), BinaryOperator::PLUS, ZERO, ONE),
        Statement::IndexedAccess {
          name: PStr::LOWER_I,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_32_TYPE),
          index: 3,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i1"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("p"), INT_32_TYPE),
          index: 3,
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("S")),
          expression_list: vec![Expression::var_name(heap.alloc_str_for_test("p"), INT_32_TYPE)],
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s"),
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("closure")),
            type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          },
          context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("s1"),
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("closure")),
            type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          },
          context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
        },
        Statement::Cast {
          name: heap.alloc_str_for_test("s2"),
          type_: INT_32_TYPE,
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("s1"), INT_32_TYPE),
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("s3"), type_: INT_32_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("s3"),
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("s1"), INT_32_TYPE),
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("s4"), type_: INT_32_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("s4"),
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("s1"), INT_32_TYPE),
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
            type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          }),
          arguments: vec![
            Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("s1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("s2"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("s3"), INT_32_TYPE),
          ],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      r#"let u0 = 1 is _Str;
let u1 = (u0: int) / 1;
let u2 = 0 % 1;
let p = 0 + 1;
let i1: int = (p: int)[3];
let s1: _Id = Closure { fun: (__$closure: () -> int), context: (b2: int) };
let s2 = (s1: int) as int;
let s3: int;
s3 = (s1: int);
__$ff((i1: int), (s1: int), (s2: int), (s3: int));
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_1() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          final_assignments: Vec::new(),
        },
      ],
      ZERO,
      heap,
      table,
      r#"let b = 0 == 1;
if (b: int) {
  __$s1();
} else {
  __$s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_2() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          }],
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("ma"), INT_32_TYPE),
      heap,
      table,
      r#"let b = 0 == 1;
let ma: int;
if (b: int) {
  let a1: int = __$s1();
  ma = (a1: int);
} else {
  let a2: int = __$s1();
  ma = (a2: int);
}
return (ma: int);"#,
    );
  }

  #[test]
  fn if_else_test_3() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("s1"), INT_32_TYPE)),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          }],
        },
      ],
      ZERO,
      heap,
      table,
      r#"let b = 0 == 1;
if (b: int) {
  __$s1();
} else {
  (s1: int)();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_4() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          }],
        },
      ],
      ZERO,
      heap,
      table,
      r#"let b = 0 == 1;
if (b: int) {
  __$s1();
} else {
  __$s1();
}
return 0;"#,
    );
  }

  #[test]
  fn if_else_test_5() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: Vec::new(),
          s2: Vec::new(),
          final_assignments: Vec::new(),
        },
      ],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );
  }

  #[test]
  fn single_if_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(PStr::LOWER_B, BinaryOperator::EQ, ZERO, ONE),
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
          invert_condition: false,
          statements: Vec::new(),
        },
      ],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_test_1() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n"),
            type_: INT_32_TYPE,
            initial_value: Expression::i32(10),
            loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("unused"),
            type_: INT_32_TYPE,
            initial_value: Expression::i32(10),
            loop_value: Expression::i32(20),
          },
        ],
        statements: vec![
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("s1")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![ZERO],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          },
          Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("s1"), INT_32_TYPE)),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          },
          Statement::While {
            loop_variables: Vec::new(),
            statements: Vec::new(),
            break_collector: None,
          },
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            BinaryOperator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::IfElse {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
            s1: vec![
              Statement::IndexedAccess {
                name: heap.alloc_str_for_test("s"),
                type_: INT_32_TYPE,
                pointer_expression: ZERO,
                index: 0,
              },
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("s"),
                type_name: table.create_type_name_for_test(heap.alloc_str_for_test("S")),
                expression_list: vec![Expression::var_name(
                  heap.alloc_str_for_test("p"),
                  INT_32_TYPE,
                )],
              },
              Statement::ClosureInit {
                closure_variable_name: heap.alloc_str_for_test("s"),
                closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
                function_name: FunctionNameExpression {
                  name: FunctionName::new_for_test(heap.alloc_str_for_test("closure")),
                  type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
                },
                context: Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
              },
            ],
            s2: vec![Statement::binary(
              heap.alloc_str_for_test("s2_n"),
              BinaryOperator::MINUS,
              Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
              ONE,
            )],
            final_assignments: vec![IfElseFinalAssignment {
              name: heap.alloc_str_for_test("_tmp_n"),
              type_: INT_32_TYPE,
              e1: Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
              e2: Expression::var_name(heap.alloc_str_for_test("s2_n"), INT_32_TYPE),
            }],
          },
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      r#"let n: int = 10;
while (true) {
  __$s1(0);
  (s1: int)();
  while (true) {
  }
  let is_zero = (n: int) == 0;
  let _tmp_n: int;
  if (is_zero: int) {
    _tmp_n = (n: int);
  } else {
    let s2_n = (n: int) + -1;
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
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n"),
            type_: INT_32_TYPE,
            initial_value: Expression::i32(10),
            loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("n1"),
            type_: INT_32_TYPE,
            initial_value: Expression::i32(10),
            loop_value: Expression::i32(20),
          },
        ],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            BinaryOperator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(ZERO)],
          },
        ],
        break_collector: Some(VariableName {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
        }),
      }],
      ZERO,
      heap,
      table,
      r#"let n: int = 10;
while (true) {
  let is_zero = (n: int) == 0;
  if (is_zero: int) {
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
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("n1"), INT_32_TYPE),
        }],
        statements: vec![Statement::binary(
          heap.alloc_str_for_test("n1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
          ZERO,
        )],
        break_collector: Some(VariableName {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
        }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      r#"let n: int = 10;
let v: int;
while (true) {
  let n1 = (n: int) + 0;
  n = (n1: int);
}
return (v: int);"#,
    );
  }

  #[test]
  fn while_test_4() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::i32(11),
        }],
        statements: vec![Statement::binary(
          heap.alloc_str_for_test("n1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
          ZERO,
        )],
        break_collector: None,
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      r#"while (true) {
}
return (v: int);"#,
    );
  }
}
