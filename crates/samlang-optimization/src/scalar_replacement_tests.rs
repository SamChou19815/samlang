#[cfg(test)]
mod tests {
  use super::super::scalar_replacement;
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::BinaryOperator,
    mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, FunctionType,
      GenenalLoopVariable, INT_32_TYPE, IfElseFinalAssignment, ONE, Statement, SymbolTable, Type,
      TypeNameId, VariableName, ZERO,
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
    scalar_replacement::optimize_function(&mut f);
    let actual = format!(
      "{}\nreturn {};",
      f.body.iter().map(|s| s.debug_print(heap, table)).join("\n"),
      f.return_value.debug_print(heap, table)
    );
    assert_eq!(expected, actual);
  }

  fn id_type(heap: &mut Heap, table: &mut SymbolTable, name: &'static str) -> TypeNameId {
    table.create_type_name_for_test(heap.alloc_str_for_test(name))
  }

  #[test]
  fn empty_body_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    assert_correctly_optimized(vec![], ZERO, heap, table, "\nreturn 0;");
  }

  #[test]
  fn no_op_when_no_allocations_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    assert_correctly_optimized(
      vec![Statement::binary(heap.alloc_str_for_test("v"), BinaryOperator::PLUS, ZERO, ONE)],
      Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
      heap,
      table,
      "let v = 0 + 1;\nreturn (v: int);",
    );
  }

  #[test]
  fn plain_struct_replaced_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v0 = heap.alloc_str_for_test("v0");
    let v1 = heap.alloc_str_for_test("v1");
    let r = heap.alloc_str_for_test("r");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO, ONE],
        },
        Statement::IndexedAccess {
          name: v0,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s, Type::Id(pair)),
          index: 0,
        },
        Statement::IndexedAccess {
          name: v1,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s, Type::Id(pair)),
          index: 1,
        },
        Statement::binary(
          r,
          BinaryOperator::PLUS,
          Expression::var_name(v0, INT_32_TYPE),
          Expression::var_name(v1, INT_32_TYPE),
        ),
      ],
      Expression::var_name(r, INT_32_TYPE),
      heap,
      table,
      "let r = 0 + 1;\nreturn (r: int);",
    );
  }

  #[test]
  fn struct_escapes_via_return_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![Statement::StructInit {
        struct_variable_name: s,
        type_name: pair,
        expression_list: vec![ZERO, ONE],
      }],
      Expression::var_name(s, Type::Id(pair)),
      heap,
      table,
      "let s: _Pair = [0, 1];\nreturn (s: _Pair);",
    );
  }

  #[test]
  fn struct_escapes_via_call_arg_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO, ONE],
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("ff")),
            type_: Type::new_fn_unwrapped(vec![Type::Id(pair)], INT_32_TYPE),
          }),
          arguments: vec![Expression::var_name(s, Type::Id(pair))],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      "let s: _Pair = [0, 1];\n__$ff((s: _Pair));\nreturn 0;",
    );
  }

  #[test]
  fn struct_escapes_via_nested_struct_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s1 = heap.alloc_str_for_test("s1");
    let s2 = heap.alloc_str_for_test("s2");
    let inner = id_type(heap, table, "Inner");
    let outer = id_type(heap, table, "Outer");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s1,
          type_name: inner,
          expression_list: vec![ZERO],
        },
        Statement::StructInit {
          struct_variable_name: s2,
          type_name: outer,
          expression_list: vec![Expression::var_name(s1, Type::Id(inner))],
        },
      ],
      Expression::var_name(s2, Type::Id(outer)),
      heap,
      table,
      "let s1: _Inner = [0];\nlet s2: _Outer = [(s1: _Inner)];\nreturn (s2: _Outer);",
    );
  }

  #[test]
  fn struct_escapes_via_cast_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let cast_v = heap.alloc_str_for_test("cv");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::Cast {
          name: cast_v,
          type_: INT_32_TYPE,
          assigned_expression: Expression::var_name(s, Type::Id(pair)),
        },
      ],
      Expression::var_name(cast_v, INT_32_TYPE),
      heap,
      table,
      "let s: _Pair = [0];\nlet cv = (s: _Pair) as int;\nreturn (cv: int);",
    );
  }

  #[test]
  fn struct_escapes_via_late_init_assignment_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let li = heap.alloc_str_for_test("li");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::LateInitDeclaration { name: li, type_: Type::Id(pair) },
        Statement::LateInitAssignment {
          name: li,
          assigned_expression: Expression::var_name(s, Type::Id(pair)),
        },
      ],
      Expression::var_name(li, Type::Id(pair)),
      heap,
      table,
      "let s: _Pair = [0];\nlet li: _Pair;\nli = (s: _Pair);\nreturn (li: _Pair);",
    );
  }

  #[test]
  fn struct_escapes_via_if_final_assignment_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let r = heap.alloc_str_for_test("r");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::IfElse {
          condition: ONE,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![IfElseFinalAssignment {
            name: r,
            type_: Type::Id(pair),
            e1: Expression::var_name(s, Type::Id(pair)),
            e2: Expression::var_name(s, Type::Id(pair)),
          }],
        },
      ],
      Expression::var_name(r, Type::Id(pair)),
      heap,
      table,
      "let s: _Pair = [0];\nlet r: _Pair;\nif 1 {\n  r = (s: _Pair);\n} else {\n  r = (s: _Pair);\n}\nreturn (r: _Pair);",
    );
  }

  #[test]
  fn struct_escapes_via_loop_initial_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let lv = heap.alloc_str_for_test("lv");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: lv,
            type_: Type::Id(pair),
            initial_value: Expression::var_name(s, Type::Id(pair)),
            loop_value: Expression::var_name(lv, Type::Id(pair)),
          }],
          statements: vec![Statement::Break(ZERO)],
          break_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      "let s: _Pair = [0];\nlet lv: _Pair = (s: _Pair);\nwhile (true) {\n  undefined = 0;\n  break;\n  lv = (lv: _Pair);\n}\nreturn 0;",
    );
  }

  #[test]
  fn struct_escapes_via_binary_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let r = heap.alloc_str_for_test("r");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::binary(r, BinaryOperator::PLUS, Expression::var_name(s, Type::Id(pair)), ZERO),
      ],
      Expression::var_name(r, INT_32_TYPE),
      heap,
      table,
      "let s: _Pair = [0];\nlet r = (s: _Pair) + 0;\nreturn (r: int);",
    );
  }

  #[test]
  fn struct_escapes_via_not_and_is_pointer_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let n = heap.alloc_str_for_test("n");
    let p = heap.alloc_str_for_test("p");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::Not { name: n, operand: Expression::var_name(s, Type::Id(pair)) },
        Statement::IsPointer {
          name: p,
          pointer_type: pair,
          operand: Expression::var_name(s, Type::Id(pair)),
        },
      ],
      Expression::var_name(p, INT_32_TYPE),
      heap,
      table,
      "let s: _Pair = [0];\nlet n = !(s: _Pair);\nlet p = (s: _Pair) is _Pair;\nreturn (p: int);",
    );
  }

  #[test]
  fn struct_escapes_via_break_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let lv = heap.alloc_str_for_test("lv");
    let bc = heap.alloc_str_for_test("bc");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: lv,
            type_: INT_32_TYPE,
            initial_value: ZERO,
            loop_value: ZERO,
          }],
          statements: vec![Statement::Break(Expression::var_name(s, Type::Id(pair)))],
          break_collector: Some(VariableName { name: bc, type_: Type::Id(pair) }),
        },
      ],
      Expression::var_name(bc, Type::Id(pair)),
      heap,
      table,
      "let s: _Pair = [0];\nlet lv: int = 0;\nlet bc: _Pair;\nwhile (true) {\n  bc = (s: _Pair);\n  break;\n  lv = 0;\n}\nreturn (bc: _Pair);",
    );
  }

  #[test]
  fn devirtualizable_closure_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let cx = heap.alloc_str_for_test("cx");
    let c = heap.alloc_str_for_test("c");
    let r = heap.alloc_str_for_test("r");
    let cx_t = id_type(heap, table, "Cx");
    let cl_t = id_type(heap, table, "Cl");
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: cx,
          type_name: cx_t,
          expression_list: vec![ZERO],
        },
        Statement::ClosureInit {
          closure_variable_name: c,
          closure_type_name: cl_t,
          function_name: FunctionNameExpression {
            name: f,
            type_: FunctionType {
              argument_types: vec![Type::Id(cx_t)],
              return_type: Box::new(INT_32_TYPE),
            },
          },
          context: Expression::var_name(cx, Type::Id(cx_t)),
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: c, type_: Type::Id(cl_t) }),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: Some(r),
        },
      ],
      Expression::var_name(r, INT_32_TYPE),
      heap,
      table,
      "let cx: _Cx = [0];\nlet r: int = __$f((cx: _Cx));\nreturn (r: int);",
    );
  }

  #[test]
  fn closure_escapes_via_call_arg_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let c = heap.alloc_str_for_test("c");
    let cl_t = id_type(heap, table, "Cl");
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    assert_correctly_optimized(
      vec![
        Statement::ClosureInit {
          closure_variable_name: c,
          closure_type_name: cl_t,
          function_name: FunctionNameExpression {
            name: f,
            type_: FunctionType {
              argument_types: vec![INT_32_TYPE],
              return_type: Box::new(INT_32_TYPE),
            },
          },
          context: ZERO,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("g")),
            type_: Type::new_fn_unwrapped(vec![Type::Id(cl_t)], INT_32_TYPE),
          }),
          arguments: vec![Expression::var_name(c, Type::Id(cl_t))],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      "let c: _Cl = Closure { fun: (__$f: (int) -> int), context: 0 };\n__$g((c: _Cl));\nreturn 0;",
    );
  }

  #[test]
  fn closure_escapes_via_return_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let c = heap.alloc_str_for_test("c");
    let cl_t = id_type(heap, table, "Cl");
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    assert_correctly_optimized(
      vec![Statement::ClosureInit {
        closure_variable_name: c,
        closure_type_name: cl_t,
        function_name: FunctionNameExpression {
          name: f,
          type_: FunctionType {
            argument_types: vec![INT_32_TYPE],
            return_type: Box::new(INT_32_TYPE),
          },
        },
        context: ZERO,
      }],
      Expression::var_name(c, Type::Id(cl_t)),
      heap,
      table,
      "let c: _Cl = Closure { fun: (__$f: (int) -> int), context: 0 };\nreturn (c: _Cl);",
    );
  }

  #[test]
  fn devirt_with_non_escaping_struct_context_kept_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let cx = heap.alloc_str_for_test("cx");
    let c = heap.alloc_str_for_test("c");
    let cx_t = id_type(heap, table, "Cx");
    let cl_t = id_type(heap, table, "Cl");
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    // cx flows into ClosureInit.context (escape), so cx stays alive even though c is devirt'd.
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: cx,
          type_name: cx_t,
          expression_list: vec![ZERO, ONE],
        },
        Statement::ClosureInit {
          closure_variable_name: c,
          closure_type_name: cl_t,
          function_name: FunctionNameExpression {
            name: f,
            type_: FunctionType {
              argument_types: vec![Type::Id(cx_t)],
              return_type: Box::new(INT_32_TYPE),
            },
          },
          context: Expression::var_name(cx, Type::Id(cx_t)),
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: c, type_: Type::Id(cl_t) }),
          arguments: vec![],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      "let cx: _Cx = [0, 1];\n__$f((cx: _Cx));\nreturn 0;",
    );
  }

  #[test]
  fn substitution_chain_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s1 = heap.alloc_str_for_test("s1");
    let s2 = heap.alloc_str_for_test("s2");
    let v = heap.alloc_str_for_test("v");
    let w = heap.alloc_str_for_test("w");
    let x = heap.alloc_str_for_test("x");
    let z = heap.alloc_str_for_test("z");
    let a = id_type(heap, table, "A");
    let b = id_type(heap, table, "B");
    // s1 = [x, ?]; v = s1[0]; s2 = [v, z]; w = s2[1] => return z
    assert_correctly_optimized(
      vec![
        Statement::binary(x, BinaryOperator::PLUS, ZERO, ONE),
        Statement::binary(z, BinaryOperator::PLUS, ONE, ONE),
        Statement::StructInit {
          struct_variable_name: s1,
          type_name: a,
          expression_list: vec![Expression::var_name(x, INT_32_TYPE), ZERO],
        },
        Statement::IndexedAccess {
          name: v,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s1, Type::Id(a)),
          index: 0,
        },
        Statement::StructInit {
          struct_variable_name: s2,
          type_name: b,
          expression_list: vec![
            Expression::var_name(v, INT_32_TYPE),
            Expression::var_name(z, INT_32_TYPE),
          ],
        },
        Statement::IndexedAccess {
          name: w,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s2, Type::Id(b)),
          index: 1,
        },
      ],
      Expression::var_name(w, INT_32_TYPE),
      heap,
      table,
      "let x = 0 + 1;\nlet z = 1 + 1;\nreturn (z: int);",
    );
  }

  #[test]
  fn cross_block_substitution_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let r = heap.alloc_str_for_test("r");
    let pair = id_type(heap, table, "Pair");
    // StructInit defined outside; IndexedAccess inside an if-arm uses it; the loaded value
    // appears in the final assignment. Verifies cross-block subst.
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO, ONE],
        },
        Statement::IfElse {
          condition: ONE,
          s1: vec![Statement::IndexedAccess {
            name: v,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s, Type::Id(pair)),
            index: 0,
          }],
          s2: vec![],
          final_assignments: vec![IfElseFinalAssignment {
            name: r,
            type_: INT_32_TYPE,
            e1: Expression::var_name(v, INT_32_TYPE),
            e2: ONE,
          }],
        },
      ],
      Expression::var_name(r, INT_32_TYPE),
      heap,
      table,
      "let r: int;\nif 1 {\n  r = 0;\n} else {\n  r = 1;\n}\nreturn (r: int);",
    );
  }

  #[test]
  fn single_if_walks_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let pair = id_type(heap, table, "Pair");
    // SingleIf with internal IndexedAccess that doesn't drive any output — exercises SingleIf walk.
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::SingleIf {
          condition: ONE,
          invert_condition: false,
          statements: vec![Statement::IndexedAccess {
            name: v,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s, Type::Id(pair)),
            index: 0,
          }],
        },
      ],
      ZERO,
      heap,
      table,
      "if 1 {\n}\nreturn 0;",
    );
  }

  #[test]
  fn loop_with_while_internal_indexed_access_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let lv = heap.alloc_str_for_test("lv");
    let pair = id_type(heap, table, "Pair");
    // While body has IndexedAccess on a non-escaping struct defined outside; subst applies.
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: lv,
            type_: INT_32_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(lv, INT_32_TYPE),
          }],
          statements: vec![
            Statement::IndexedAccess {
              name: v,
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(s, Type::Id(pair)),
              index: 0,
            },
            Statement::Break(Expression::var_name(v, INT_32_TYPE)),
          ],
          break_collector: Some(VariableName {
            name: heap.alloc_str_for_test("bc"),
            type_: INT_32_TYPE,
          }),
        },
      ],
      ZERO,
      heap,
      table,
      "let lv: int = 0;\nlet bc: int;\nwhile (true) {\n  bc = 0;\n  break;\n  lv = (lv: int);\n}\nreturn 0;",
    );
  }

  #[test]
  fn all_statement_kinds_walked_when_alloc_tracked_test() {
    // Exercises every rewriter arm by combining one non-escaping struct (so SROA's rewrite
    // pass actually runs) with statements covering each Statement variant the walker handles.
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s_dropped = heap.alloc_str_for_test("s_dropped");
    let v_loaded = heap.alloc_str_for_test("v_loaded");
    let pair = id_type(heap, table, "Pair");
    let other_t = id_type(heap, table, "Other");
    let cl_keep = heap.alloc_str_for_test("cl_keep");
    let cl_t = id_type(heap, table, "Cl");
    let f_name = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    let bin_name = heap.alloc_str_for_test("bin_v");
    let not_name = heap.alloc_str_for_test("not_v");
    let isp_name = heap.alloc_str_for_test("isp_v");
    let cast_name = heap.alloc_str_for_test("cast_v");
    let li_name = heap.alloc_str_for_test("li_v");
    let escaping_struct = heap.alloc_str_for_test("escaping_struct");
    let unrelated_idx_name = heap.alloc_str_for_test("uia");
    let if_r = heap.alloc_str_for_test("if_r");
    let lv = heap.alloc_str_for_test("lv");
    let bc = heap.alloc_str_for_test("bc");
    assert_correctly_optimized(
      vec![
        // Tracked struct that gets dropped.
        Statement::StructInit {
          struct_variable_name: s_dropped,
          type_name: pair,
          expression_list: vec![ZERO, ONE],
        },
        Statement::IndexedAccess {
          name: v_loaded,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s_dropped, Type::Id(pair)),
          index: 0,
        },
        // Escaping struct so its StructInit goes through the "else" branch of rewriter.
        Statement::StructInit {
          struct_variable_name: escaping_struct,
          type_name: other_t,
          expression_list: vec![Expression::var_name(v_loaded, INT_32_TYPE)],
        },
        // Cast forces escaping_struct to escape, so its StructInit isn't dropped.
        Statement::Cast {
          name: heap.alloc_str_for_test("forced_escape"),
          type_: INT_32_TYPE,
          assigned_expression: Expression::var_name(escaping_struct, Type::Id(other_t)),
        },
        // IndexedAccess on a non-tracked pointer — exercises the "else" branch.
        Statement::IndexedAccess {
          name: unrelated_idx_name,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(escaping_struct, Type::Id(other_t)),
          index: 0,
        },
        // ClosureInit kept (escapes via return).
        Statement::ClosureInit {
          closure_variable_name: cl_keep,
          closure_type_name: cl_t,
          function_name: FunctionNameExpression {
            name: f_name,
            type_: FunctionType {
              argument_types: vec![INT_32_TYPE],
              return_type: Box::new(INT_32_TYPE),
            },
          },
          context: Expression::var_name(v_loaded, INT_32_TYPE),
        },
        // Other statement kinds with operands referencing v_loaded (which gets substituted to 0).
        Statement::Binary(samlang_ast::mir::Binary {
          name: bin_name,
          operator: BinaryOperator::PLUS,
          e1: Expression::var_name(v_loaded, INT_32_TYPE),
          e2: ONE,
        }),
        Statement::Not { name: not_name, operand: Expression::var_name(v_loaded, INT_32_TYPE) },
        Statement::IsPointer {
          name: isp_name,
          pointer_type: pair,
          operand: Expression::var_name(v_loaded, INT_32_TYPE),
        },
        Statement::Cast {
          name: cast_name,
          type_: INT_32_TYPE,
          assigned_expression: Expression::var_name(v_loaded, INT_32_TYPE),
        },
        Statement::LateInitDeclaration { name: li_name, type_: INT_32_TYPE },
        Statement::LateInitAssignment {
          name: li_name,
          assigned_expression: Expression::var_name(v_loaded, INT_32_TYPE),
        },
        // SingleIf with a body that references v_loaded.
        Statement::SingleIf {
          condition: Expression::var_name(not_name, INT_32_TYPE),
          invert_condition: false,
          statements: vec![Statement::Cast {
            name: heap.alloc_str_for_test("inner_cast"),
            type_: INT_32_TYPE,
            assigned_expression: Expression::var_name(v_loaded, INT_32_TYPE),
          }],
        },
        // IfElse with final assignments referencing v_loaded.
        Statement::IfElse {
          condition: ONE,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![IfElseFinalAssignment {
            name: if_r,
            type_: INT_32_TYPE,
            e1: Expression::var_name(v_loaded, INT_32_TYPE),
            e2: ONE,
          }],
        },
        // While with loop variable referencing v_loaded and a Break with v_loaded.
        Statement::While {
          loop_variables: vec![GenenalLoopVariable {
            name: lv,
            type_: INT_32_TYPE,
            initial_value: Expression::var_name(v_loaded, INT_32_TYPE),
            loop_value: Expression::var_name(v_loaded, INT_32_TYPE),
          }],
          statements: vec![Statement::Break(Expression::var_name(v_loaded, INT_32_TYPE))],
          break_collector: Some(VariableName { name: bc, type_: INT_32_TYPE }),
        },
        // Call with arguments referencing v_loaded.
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(heap.alloc_str_for_test("g")),
            type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
          }),
          arguments: vec![Expression::var_name(v_loaded, INT_32_TYPE)],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      Expression::var_name(cl_keep, Type::Id(cl_t)),
      heap,
      table,
      "let escaping_struct: _Other = [0];\n\
       let forced_escape = (escaping_struct: _Other) as int;\n\
       let uia: int = (escaping_struct: _Other)[0];\n\
       let cl_keep: _Cl = Closure { fun: (__$f: (int) -> int), context: 0 };\n\
       let bin_v = 0 + 1;\n\
       let not_v = !0;\n\
       let isp_v = 0 is _Pair;\n\
       let cast_v = 0 as int;\n\
       let li_v: int;\n\
       li_v = 0;\n\
       if (not_v: int) {\n  let inner_cast = 0 as int;\n}\n\
       let if_r: int;\n\
       if 1 {\n  if_r = 0;\n} else {\n  if_r = 1;\n}\n\
       let lv: int = 0;\n\
       let bc: int;\n\
       while (true) {\n  bc = 0;\n  break;\n  lv = 0;\n}\n\
       __$g(0);\n\
       return (cl_keep: _Cl);",
    );
  }

  #[test]
  fn callee_variable_passthrough_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let unknown_callee = heap.alloc_str_for_test("uc");
    let cl_t = id_type(heap, table, "Cl");
    // A Callee::Variable that doesn't correspond to a tracked closure passes through.
    // Trigger the rewriter by also having a non-escaping struct so SROA actually runs.
    let s = heap.alloc_str_for_test("s");
    let pair = id_type(heap, table, "Pair");
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::IndexedAccess {
          name: heap.alloc_str_for_test("vv"),
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s, Type::Id(pair)),
          index: 0,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: unknown_callee, type_: Type::Id(cl_t) }),
          arguments: vec![Expression::var_name(heap.alloc_str_for_test("arg1"), INT_32_TYPE)],
          return_type: INT_32_TYPE,
          return_collector: None,
        },
      ],
      ZERO,
      heap,
      table,
      "(uc: _Cl)((arg1: int));\nreturn 0;",
    );
  }

  #[test]
  fn devirt_with_arguments_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let c = heap.alloc_str_for_test("c");
    let cl_t = id_type(heap, table, "Cl");
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("f"));
    let r = heap.alloc_str_for_test("r");
    assert_correctly_optimized(
      vec![
        Statement::ClosureInit {
          closure_variable_name: c,
          closure_type_name: cl_t,
          function_name: FunctionNameExpression {
            name: f,
            type_: FunctionType {
              argument_types: vec![INT_32_TYPE, INT_32_TYPE],
              return_type: Box::new(INT_32_TYPE),
            },
          },
          context: ZERO,
        },
        Statement::Call {
          callee: Callee::Variable(VariableName { name: c, type_: Type::Id(cl_t) }),
          arguments: vec![ONE, Expression::i32(42)],
          return_type: INT_32_TYPE,
          return_collector: Some(r),
        },
      ],
      Expression::var_name(r, INT_32_TYPE),
      heap,
      table,
      "let r: int = __$f(0, 1, 42);\nreturn (r: int);",
    );
  }

  // --- Integration Tests (full optimize_sources pipeline) ---

  fn make_sources(functions: Vec<Function>) -> samlang_ast::mir::Sources {
    samlang_ast::mir::Sources {
      symbol_table: SymbolTable::new(),
      global_variables: Vec::new(),
      closure_types: Vec::new(),
      type_definitions: Vec::new(),
      main_function_names: vec![FunctionName::new_for_test(PStr::MAIN_FN)],
      functions,
    }
  }

  fn assert_pipeline(
    functions: Vec<Function>,
    heap: &mut Heap,
    config: &super::super::OptimizationConfiguration,
    expected: &str,
  ) {
    let sources = make_sources(functions);
    let optimized = super::super::optimize_sources(heap, sources, config);
    let actual = optimized.debug_print(heap);
    assert_eq!(expected, actual);
  }

  #[test]
  fn integration_struct_sroa_with_constant_folding_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v0 = heap.alloc_str_for_test("v0");
    let v1 = heap.alloc_str_for_test("v1");
    let r = heap.alloc_str_for_test("r");
    let pair = table.create_type_name_for_test(heap.alloc_str_for_test("Pair"));
    // Struct [3, 5] → field access → add → return.
    // SROA eliminates struct, CCP folds 3+5=8, DCE cleans up.
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::StructInit {
            struct_variable_name: s,
            type_name: pair,
            expression_list: vec![Expression::i32(3), Expression::i32(5)],
          },
          Statement::IndexedAccess {
            name: v0,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s, Type::Id(pair)),
            index: 0,
          },
          Statement::IndexedAccess {
            name: v1,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s, Type::Id(pair)),
            index: 1,
          },
          Statement::binary(
            r,
            BinaryOperator::PLUS,
            Expression::var_name(v0, INT_32_TYPE),
            Expression::var_name(v1, INT_32_TYPE),
          ),
        ],
        return_value: Expression::var_name(r, INT_32_TYPE),
      }],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      // SROA replaces struct fields with constants; CCP folds 3+5=8.
      "function __$main(): int {\n  return 8;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_struct_sroa_disabled_preserves_alloc_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v0 = heap.alloc_str_for_test("v0");
    let r = heap.alloc_str_for_test("r");
    let pair = table.create_type_name_for_test(heap.alloc_str_for_test("Pair"));
    let config = super::super::OptimizationConfiguration {
      does_perform_local_value_numbering: true,
      does_perform_common_sub_expression_elimination: true,
      does_perform_loop_optimization: true,
      does_perform_inlining: true,
      does_perform_scalar_replacement: false,
    };
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::StructInit {
            struct_variable_name: s,
            type_name: pair,
            expression_list: vec![Expression::i32(3), Expression::i32(5)],
          },
          Statement::IndexedAccess {
            name: v0,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s, Type::Id(pair)),
            index: 0,
          },
          Statement::binary(
            r,
            BinaryOperator::PLUS,
            Expression::var_name(v0, INT_32_TYPE),
            Expression::i32(5),
          ),
        ],
        return_value: Expression::var_name(r, INT_32_TYPE),
      }],
      heap,
      &config,
      // With SROA disabled, the struct allocation stays; CCP can still fold 3+5.
      "function __$main(): int {\n  return 8;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_closure_devirt_in_pipeline_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let c = heap.alloc_str_for_test("c");
    let r = heap.alloc_str_for_test("r");
    let cl_t = table.create_type_name_for_test(heap.alloc_str_for_test("Cl"));
    let f = FunctionName::new_for_test(heap.alloc_str_for_test("myFun"));
    // Closure created, immediately called → devirtualized to direct call
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::ClosureInit {
            closure_variable_name: c,
            closure_type_name: cl_t,
            function_name: FunctionNameExpression {
              name: f,
              type_: FunctionType {
                argument_types: vec![INT_32_TYPE],
                return_type: Box::new(INT_32_TYPE),
              },
            },
            context: Expression::i32(99),
          },
          Statement::Call {
            callee: Callee::Variable(VariableName { name: c, type_: Type::Id(cl_t) }),
            arguments: vec![Expression::i32(7)],
            return_type: INT_32_TYPE,
            return_collector: Some(r),
          },
        ],
        return_value: Expression::var_name(r, INT_32_TYPE),
      }],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      // SROA devirtualizes: ClosureInit dropped, Call becomes direct __$myFun(99, 7).
      "function __$main(): int {\n  let r: int = __$myFun(99, 7);\n  return (r: int);\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_struct_in_if_else_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let r = heap.alloc_str_for_test("r");
    let pair = table.create_type_name_for_test(heap.alloc_str_for_test("Pair"));
    // Struct defined before if/else, field accessed inside then-branch.
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::StructInit {
            struct_variable_name: s,
            type_name: pair,
            expression_list: vec![Expression::i32(42), ZERO],
          },
          Statement::IfElse {
            condition: ONE,
            s1: vec![Statement::IndexedAccess {
              name: v,
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(s, Type::Id(pair)),
              index: 0,
            }],
            s2: vec![],
            final_assignments: vec![IfElseFinalAssignment {
              name: r,
              type_: INT_32_TYPE,
              e1: Expression::var_name(v, INT_32_TYPE),
              e2: Expression::i32(0),
            }],
          },
        ],
        return_value: Expression::var_name(r, INT_32_TYPE),
      }],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      // SROA eliminates struct, CCP folds constants, DCE removes dead if-else.
      "function __$main(): int {\n  return 42;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_multi_function_mixed_sroa_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let pair = table.create_type_name_for_test(heap.alloc_str_for_test("Pair"));
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let s2 = heap.alloc_str_for_test("s2");

    // Function with escaping struct (returned)
    let escaping_fn = Function {
      name: FunctionName::new_for_test(heap.alloc_str_for_test("makePair")),
      parameters: Vec::new(),
      type_: Type::new_fn_unwrapped(Vec::new(), Type::Id(pair)),
      body: vec![Statement::StructInit {
        struct_variable_name: s,
        type_name: pair,
        expression_list: vec![Expression::i32(10), Expression::i32(20)],
      }],
      return_value: Expression::var_name(s, Type::Id(pair)),
    };

    // Function with non-escaping struct (field accessed, scalar returned)
    let non_escaping_fn = Function {
      name: FunctionName::new_for_test(PStr::MAIN_FN),
      parameters: Vec::new(),
      type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
      body: vec![
        Statement::StructInit {
          struct_variable_name: s2,
          type_name: pair,
          expression_list: vec![Expression::i32(10), Expression::i32(20)],
        },
        Statement::IndexedAccess {
          name: v,
          type_: INT_32_TYPE,
          pointer_expression: Expression::var_name(s2, Type::Id(pair)),
          index: 1,
        },
      ],
      return_value: Expression::var_name(v, INT_32_TYPE),
    };

    assert_pipeline(
      vec![escaping_fn, non_escaping_fn],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      // makePair is unused → eliminated by unused_name_elimination. main's struct is eliminated and constant folded.
      "function __$main(): int {\n  return 20;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_struct_sroa_with_substitution_chain_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let a = id_type(heap, table, "A");
    let b = id_type(heap, table, "B");
    let s1 = heap.alloc_str_for_test("s1");
    let s2 = heap.alloc_str_for_test("s2");
    let v = heap.alloc_str_for_test("v");
    let w = heap.alloc_str_for_test("w");
    let x = heap.alloc_str_for_test("x");
    let z = heap.alloc_str_for_test("z");
    // s1 = [x, 0]; v = s1[0]; s2 = [v, z]; w = s2[1]; return w
    // Through SROA: v→x, w→z. Through CCP: x→constant. Final: return constant.
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::binary(x, BinaryOperator::PLUS, Expression::i32(3), Expression::i32(4)),
          Statement::binary(z, BinaryOperator::PLUS, Expression::i32(1), Expression::i32(2)),
          Statement::StructInit {
            struct_variable_name: s1,
            type_name: a,
            expression_list: vec![Expression::var_name(x, INT_32_TYPE), ZERO],
          },
          Statement::IndexedAccess {
            name: v,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s1, Type::Id(a)),
            index: 0,
          },
          Statement::StructInit {
            struct_variable_name: s2,
            type_name: b,
            expression_list: vec![
              Expression::var_name(v, INT_32_TYPE),
              Expression::var_name(z, INT_32_TYPE),
            ],
          },
          Statement::IndexedAccess {
            name: w,
            type_: INT_32_TYPE,
            pointer_expression: Expression::var_name(s2, Type::Id(b)),
            index: 1,
          },
        ],
        return_value: Expression::var_name(w, INT_32_TYPE),
      }],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      // SROA chains: v→x→3+4, w→z→1+2. CCP folds all. DCE removes dead code.
      "function __$main(): int {\n  return 3;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn integration_struct_used_in_loop_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let lv = heap.alloc_str_for_test("lv");
    let pair = table.create_type_name_for_test(heap.alloc_str_for_test("Pair"));
    // Non-escaping struct used inside while loop.
    assert_pipeline(
      vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
        type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        body: vec![
          Statement::StructInit {
            struct_variable_name: s,
            type_name: pair,
            expression_list: vec![Expression::i32(0), ZERO],
          },
          Statement::While {
            loop_variables: vec![GenenalLoopVariable {
              name: lv,
              type_: INT_32_TYPE,
              initial_value: ZERO,
              loop_value: Expression::var_name(lv, INT_32_TYPE),
            }],
            statements: vec![
              Statement::IndexedAccess {
                name: v,
                type_: INT_32_TYPE,
                pointer_expression: Expression::var_name(s, Type::Id(pair)),
                index: 0,
              },
              Statement::Break(Expression::var_name(v, INT_32_TYPE)),
            ],
            break_collector: Some(VariableName {
              name: heap.alloc_str_for_test("bc"),
              type_: INT_32_TYPE,
            }),
          },
        ],
        return_value: ZERO,
      }],
      heap,
      &super::super::ALL_ENABLED_CONFIGURATION,
      "function __$main(): int {\n  return 0;\n}\n\nsources.mains = [__$main]",
    );
  }

  #[test]
  fn indexed_access_non_variable_pointer_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();
    let s = heap.alloc_str_for_test("s");
    let v = heap.alloc_str_for_test("v");
    let pair = id_type(heap, table, "Pair");
    // SROA is active (s is non-escaping), but the IndexedAccess uses a non-Variable pointer.
    assert_correctly_optimized(
      vec![
        Statement::StructInit {
          struct_variable_name: s,
          type_name: pair,
          expression_list: vec![ZERO],
        },
        Statement::IndexedAccess {
          name: v,
          type_: INT_32_TYPE,
          pointer_expression: Expression::i32(0),
          index: 0,
        },
      ],
      Expression::var_name(v, INT_32_TYPE),
      heap,
      table,
      "let v: int = 0[0];\nreturn (v: int);",
    );
  }
}
