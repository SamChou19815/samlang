#[cfg(test)]
mod tests {
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
    super::super::conditional_constant_propagation::optimize_function(&mut f, heap);
    let actual = format!(
      "{}\nreturn {};",
      f.body.iter().map(|it| it.debug_print(heap, table)).join("\n"),
      f.return_value.debug_print(heap, table)
    );
    assert_eq!(expected, actual);
  }

  #[test]
  fn simple_sequence_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::Not { name: heap.alloc_str_for_test("c00"), operand: Expression::i32(0) },
        Statement::binary(
          heap.alloc_str_for_test("c0"),
          BinaryOperator::SHL,
          Expression::i32(3),
          Expression::var_name(heap.alloc_str_for_test("c00"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("c1"),
          BinaryOperator::SHR,
          Expression::i32(3),
          Expression::i32(1),
        ),
        Statement::binary(
          heap.alloc_str_for_test("c2"),
          BinaryOperator::SHR,
          Expression::i32(-3),
          Expression::i32(1),
        ),
        Statement::binary(
          heap.alloc_str_for_test("c3"),
          BinaryOperator::LAND,
          Expression::i32(2),
          Expression::i32(1),
        ),
        Statement::binary(
          heap.alloc_str_for_test("c4"),
          BinaryOperator::LOR,
          Expression::i32(2),
          Expression::i32(1),
        ),
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("c_o"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
          expression_list: vec![
            Expression::var_name(heap.alloc_str_for_test("c0"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("c1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("c2"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("c3"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("c4"), INT_32_TYPE),
          ],
        },
        Statement::binary(
          heap.alloc_str_for_test("a0"),
          BinaryOperator::PLUS,
          Expression::i32(3),
          Expression::i32(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
        ),
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("i0"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          index: 2,
        },
        Statement::binary(
          heap.alloc_str_for_test("a3"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("b1"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b2"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b3"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b4"),
          BinaryOperator::MOD,
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b5"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b6"),
          BinaryOperator::MOD,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b7"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("b8"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a4"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a3"), INT_32_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str_for_test("a5"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("a4"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a6"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("i1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a5"), INT_32_TYPE),
        ),
        Statement::Not {
          name: heap.alloc_str_for_test("a7"),
          operand: Expression::var_name(heap.alloc_str_for_test("a6"), INT_32_TYPE),
        },
        Statement::IsPointer {
          name: heap.alloc_str_for_test("a8"),
          pointer_type: TypeNameId::STR,
          operand: Expression::var_name(heap.alloc_str_for_test("a6"), INT_32_TYPE),
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("s"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
          expression_list: vec![
            Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a6"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a5"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a7"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("a8"), INT_32_TYPE),
          ],
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
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("fff")),
            type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          }),
          arguments: vec![
            Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b3"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b4"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b5"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b6"), INT_32_TYPE),
            Expression::var_name(heap.alloc_str_for_test("b7"), INT_32_TYPE),
          ],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
        Statement::binary(
          heap.alloc_str_for_test("a7"),
          BinaryOperator::MOD,
          Expression::var_name(heap.alloc_str_for_test("a5"), INT_32_TYPE),
          Expression::i32(12),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a8"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a7"), INT_32_TYPE),
          Expression::i32(7),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a9"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("a7"), INT_32_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str_for_test("a10"),
          BinaryOperator::MOD,
          Expression::var_name(heap.alloc_str_for_test("a7"), INT_32_TYPE),
          ZERO,
        ),
        Statement::binary(
          heap.alloc_str_for_test("a11"),
          BinaryOperator::DIV,
          Expression::i32(-11),
          Expression::i32(10),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a12"),
          BinaryOperator::DIV,
          Expression::i32(11),
          Expression::i32(10),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a13"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a11"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a8"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a14"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a13"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a12"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a15"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("i0"), INT_32_TYPE),
          Expression::i32(5),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a16"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a15"), INT_32_TYPE),
          Expression::i32(5),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a17"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a14"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("a16"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a18"),
          BinaryOperator::DIV,
          Expression::var_name(heap.alloc_str_for_test("a15"), INT_32_TYPE),
          Expression::i32(5),
        ),
        Statement::Cast {
          name: heap.alloc_str_for_test("a19"),
          type_: INT_32_TYPE,
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("a18"), INT_32_TYPE),
        },
        Statement::LateInitDeclaration { name: heap.alloc_str_for_test("a20"), type_: INT_32_TYPE },
        Statement::LateInitAssignment {
          name: heap.alloc_str_for_test("a20"),
          assigned_expression: Expression::var_name(heap.alloc_str_for_test("a18"), INT_32_TYPE),
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("a17"), INT_32_TYPE),
      heap,
      table,
      r#"let c_o: _Id = [6, 1, 2147483646, 0, 3];
let i0: int = 6[2];
let b8 = (i0: int) * (i0: int);
let a6 = (i1: int) / 30;
let a7 = !(a6: int);
let a8 = (a6: int) is _Str;
let s: _Id = [0, (a6: int), 30, (a7: int), (a8: int)];
let s: _Id = Closure { fun: (__$closure: () -> int), context: 0 };
__$fff(1, 0, 0, 0, 0, 0, 1);
let a9 = 6 / 0;
let a10 = 6 % 0;
let a15 = (i0: int) * 5;
let a16 = (a15: int) + 5;
let a17 = (a15: int) + 47;
let a18 = (a15: int) / 5;
let a19 = (a18: int) as int;
let a20: int;
a20 = (a18: int);
return (a17: int);"#,
    );
  }

  #[test]
  fn index_sequence_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: PStr::LOWER_A,
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Id")),
          expression_list: vec![ZERO, ONE],
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("v1"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(
            PStr::LOWER_A,
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Id"))),
          ),
          index: 0,
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("v2"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(
            PStr::LOWER_A,
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Id"))),
          ),
          index: 1,
        },
        Statement::binary(
          heap.alloc_str_for_test("result"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("v1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("v2"), INT_32_TYPE),
        ),
      ],
      Expression::var_name(heap.alloc_str_for_test("result"), INT_32_TYPE),
      heap,
      table,
      r#"let a: _Id = [0, 1];
return 1;"#,
    );
  }

  #[test]
  fn binary_sequence_tests() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(2),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) + 4;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) + -1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + -2;
let a2 = (a0: int) + 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::MINUS,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + -2;
let a2 = (a0: int) + -5;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a3"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a4"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a3"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) * 2;
let a2 = (a0: int) * 6;
let a3 = (a0: int) + 2;
let a4 = (a3: int) * 3;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::LT,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) < 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::LE,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) <= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::GT,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) > 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::GE,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) >= 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::EQ,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) == 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::NE,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) + 2;
let a2 = (a0: int) != 1;
return 0;"#,
    );

    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MUL,
          Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          Expression::i32(2),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a2"),
          BinaryOperator::EQ,
          Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
          Expression::i32(3),
        ),
      ],
      ZERO,
      heap,
      table,
      r#"let a1 = (a0: int) * 2;
let a2 = (a1: int) == 3;
return 0;"#,
    );
  }

  #[test]
  fn if_else_tests() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    assert_correctly_optimized(
      vec![
        Statement::binary(heap.alloc_str_for_test("b1"), BinaryOperator::LT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b1"), INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          final_assignments: Vec::new(),
        },
        Statement::binary(heap.alloc_str_for_test("b2"), BinaryOperator::GT, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b2"), INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          final_assignments: Vec::new(),
        },
        Statement::binary(heap.alloc_str_for_test("b3"), BinaryOperator::LE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b3"), INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma1"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          }],
        },
        Statement::binary(heap.alloc_str_for_test("b4"), BinaryOperator::GE, ZERO, ONE),
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("b4"), INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a11")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a22")),
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma2"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a11"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a22"), INT_32_TYPE),
          }],
        },
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("ma2"), INT_32_TYPE),
          s1: Vec::new(),
          s2: Vec::new(),
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma3"),
            type_: INT_32_TYPE,
            e1: ONE,
            e2: ZERO,
          }],
        },
        Statement::IfElse {
          condition: Expression::var_name(heap.alloc_str_for_test("ma2"), INT_32_TYPE),
          s1: Vec::new(),
          s2: Vec::new(),
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma4"),
            type_: INT_32_TYPE,
            e1: ZERO,
            e2: ONE,
          }],
        },
        Statement::binary(
          heap.alloc_str_for_test("r1"),
          BinaryOperator::EQ,
          Expression::var_name(heap.alloc_str_for_test("ma1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("ma2"), INT_32_TYPE),
        ),
        Statement::binary(
          heap.alloc_str_for_test("r2"),
          BinaryOperator::EQ,
          Expression::var_name(heap.alloc_str_for_test("ma3"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("ma4"), INT_32_TYPE),
        ),
        Statement::binary(heap.alloc_str_for_test("r3"), BinaryOperator::NE, ONE, ZERO),
        Statement::binary(heap.alloc_str_for_test("r4"), BinaryOperator::XOR, ONE, ZERO),
        Statement::binary(heap.alloc_str_for_test("r5"), BinaryOperator::NE, ONE, ZERO),
        Statement::binary(
          heap.alloc_str_for_test("r6"),
          BinaryOperator::EQ,
          Expression::var_name(heap.alloc_str_for_test("r5"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("r3"), INT_32_TYPE),
        ),
      ],
      Expression::var_name(heap.alloc_str_for_test("r6"), INT_32_TYPE),
      heap,
      table,
      r#"__$foo();
__$bar();
let a1: int = __$foo();
let a22: int = __$bar();
let ma4 = (a22: int) ^ 1;
let r1 = (a22: int) == (a1: int);
let r2 = (ma4: int) == (a22: int);
return 1;"#,
    );

    let heap = &mut Heap::new();
    assert_correctly_optimized(
      vec![
        Statement::binary(
          heap.alloc_str_for_test("a0"),
          BinaryOperator::PLUS,
          Expression::i32(3),
          Expression::i32(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("a1"),
          BinaryOperator::MUL,
          Expression::i32(3),
          Expression::i32(3),
        ),
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          final_assignments: Vec::new(),
        },
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a1")),
          }],
          s2: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: Some(heap.alloc_str_for_test("a2")),
          }],
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma1"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a1"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a2"), INT_32_TYPE),
          }],
        },
        Statement::IfElse {
          condition: Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
          s1: Vec::new(),
          s2: Vec::new(),
          final_assignments: vec![IfElseFinalAssignment {
            name: heap.alloc_str_for_test("ma2"),
            type_: INT_32_TYPE,
            e1: Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
            e2: Expression::var_name(heap.alloc_str_for_test("a0"), INT_32_TYPE),
          }],
        },
      ],
      Expression::var_name(heap.alloc_str_for_test("ma2"), INT_32_TYPE),
      heap,
      table,
      r#"if (b: int) {
  __$foo(6);
} else {
  __$bar(9);
}
let ma1: int;
if (b: int) {
  let a1: int = __$foo(6);
  ma1 = 9;
} else {
  let a2: int = __$bar(9);
  ma1 = (a2: int);
}
return 6;"#,
    );

    let heap = &mut Heap::new();
    assert_correctly_optimized(
      vec![Statement::IfElse {
        condition: ZERO,
        s1: Vec::new(),
        s2: vec![Statement::Break(ZERO)],
        final_assignments: Vec::new(),
      }],
      ZERO,
      heap,
      table,
      "undefined = 0;\nbreak;\nreturn 0;",
    );

    let heap = &mut Heap::new();
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: false,
        statements: vec![Statement::Break(Expression::var_name(
          heap.alloc_str_for_test("n"),
          INT_32_TYPE,
        ))],
      }],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );
    let heap = &mut Heap::new();
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: ZERO,
        invert_condition: true,
        statements: vec![Statement::Break(Expression::var_name(
          heap.alloc_str_for_test("n"),
          INT_32_TYPE,
        ))],
      }],
      ZERO,
      heap,
      table,
      "undefined = (n: int);\nbreak;\nreturn 0;",
    );
    let heap = &mut Heap::new();
    assert_correctly_optimized(
      vec![Statement::SingleIf {
        condition: Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
        invert_condition: false,
        statements: Vec::new(),
      }],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );
  }

  #[test]
  fn while_tests() {
    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(4),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
        }],
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
            statements: vec![Statement::Break(Expression::var_name(
              heap.alloc_str_for_test("n"),
              INT_32_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("_tmp_n"),
            BinaryOperator::MINUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(4),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
        }],
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
            statements: vec![Statement::Break(Expression::var_name(
              heap.alloc_str_for_test("n"),
              INT_32_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("_tmp_n"),
            BinaryOperator::MINUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ONE,
          ),
        ],
        break_collector: Some(VariableName { name: PStr::LOWER_B, type_: INT_32_TYPE }),
      }],
      Expression::var_name(PStr::LOWER_B, INT_32_TYPE),
      heap,
      table,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("_tmp_n"), INT_32_TYPE),
        }],
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
            statements: vec![Statement::Break(Expression::var_name(
              heap.alloc_str_for_test("n"),
              INT_32_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("_tmp_n"),
            BinaryOperator::MINUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      r#"let n: int = 4;
while (true) {
  let is_zero = (n: int) == 0;
  if (is_zero: int) {
    undefined = (n: int);
    break;
  }
  let _tmp_n = (n: int) + -1;
  n = (_tmp_n: int);
}
return 0;"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::i32(10),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("is_zero"),
            BinaryOperator::EQ,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ZERO,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("is_zero"), INT_32_TYPE),
            invert_condition: true,
            statements: vec![Statement::Break(Expression::var_name(
              heap.alloc_str_for_test("n"),
              INT_32_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("_tmp_n"),
            BinaryOperator::MINUS,
            Expression::var_name(heap.alloc_str_for_test("n"), INT_32_TYPE),
            ONE,
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("t"), INT_32_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name(
          heap.alloc_str_for_test("n"),
          INT_32_TYPE,
        ))],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      "\nreturn 0;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::var_name(heap.alloc_str_for_test("t"), INT_32_TYPE),
        }],
        statements: vec![Statement::Break(Expression::var_name(
          heap.alloc_str_for_test("n"),
          INT_32_TYPE,
        ))],
        break_collector: Some(VariableName {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
        }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      "\nreturn 10;",
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: heap.alloc_str_for_test("n"),
          type_: INT_32_TYPE,
          initial_value: Expression::i32(10),
          loop_value: Expression::i32(11),
        }],
        statements: Vec::new(),
        break_collector: Some(VariableName {
          name: heap.alloc_str_for_test("v"),
          type_: INT_32_TYPE,
        }),
      }],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      r#"let n: int = 11;
let v: int;
while (true) {
  n = 11;
}
return (v: int);"#,
    );

    assert_correctly_optimized(
      vec![Statement::While {
        loop_variables: Vec::new(),
        statements: vec![Statement::binary(
          PStr::LOWER_A,
          BinaryOperator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("v1"), INT_32_TYPE),
          Expression::var_name(heap.alloc_str_for_test("v2"), INT_32_TYPE),
        )],
        break_collector: None,
      }],
      ZERO,
      heap,
      table,
      r#"while (true) {
  let a = (v2: int) + (v1: int);
}
return 0;"#,
    );
  }
}
