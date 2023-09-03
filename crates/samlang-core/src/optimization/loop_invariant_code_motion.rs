use crate::ast::mir::{Expression, GenenalLoopVariable, Statement, VariableName};
use samlang_heap::PStr;
use std::collections::HashSet;

pub(super) struct LoopInvariantCodeMotionOptimizationResult {
  pub(super) hoisted_statements_before_while: Vec<Statement>,
  pub(super) optimized_while_statement:
    (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>),
  pub(super) non_loop_invariant_variables: HashSet<PStr>,
}

fn expression_is_loop_invariant(
  expr: &Expression,
  non_loop_invariant_variables: &HashSet<PStr>,
) -> bool {
  expr.as_variable().map(|v| !non_loop_invariant_variables.contains(&v.name)).unwrap_or(true)
}

pub(super) fn optimize(
  (loop_variables, stmts, break_collector): (
    Vec<GenenalLoopVariable>,
    Vec<Statement>,
    Option<VariableName>,
  ),
) -> LoopInvariantCodeMotionOptimizationResult {
  let mut non_loop_invariant_variables =
    loop_variables.iter().map(|it| it.name).collect::<HashSet<_>>();

  let mut hoisted_stmts = vec![];
  let mut inner_stmts = vec![];
  for stmt in stmts {
    match stmt {
      Statement::Binary(b) => {
        if expression_is_loop_invariant(&b.e1, &non_loop_invariant_variables)
          && expression_is_loop_invariant(&b.e2, &non_loop_invariant_variables)
        {
          hoisted_stmts.push(Statement::Binary(b));
        } else {
          non_loop_invariant_variables.insert(b.name);
          inner_stmts.push(Statement::Binary(b));
        }
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        if expression_is_loop_invariant(&pointer_expression, &non_loop_invariant_variables) {
          hoisted_stmts.push(Statement::IndexedAccess { name, type_, pointer_expression, index });
        } else {
          non_loop_invariant_variables.insert(name);
          inner_stmts.push(Statement::IndexedAccess { name, type_, pointer_expression, index });
        }
      }
      Statement::Cast { name, type_, assigned_expression } => {
        if expression_is_loop_invariant(&assigned_expression, &non_loop_invariant_variables) {
          hoisted_stmts.push(Statement::Cast { name, type_, assigned_expression });
        } else {
          non_loop_invariant_variables.insert(name);
          inner_stmts.push(Statement::Cast { name, type_, assigned_expression });
        }
      }
      Statement::StructInit { struct_variable_name, type_name, expression_list } => {
        if expression_list
          .iter()
          .all(|e| expression_is_loop_invariant(e, &non_loop_invariant_variables))
        {
          hoisted_stmts.push(Statement::StructInit {
            struct_variable_name,
            type_name,
            expression_list,
          });
        } else {
          non_loop_invariant_variables.insert(struct_variable_name);
          inner_stmts.push(Statement::StructInit {
            struct_variable_name,
            type_name,
            expression_list,
          });
        }
      }
      Statement::ClosureInit {
        closure_variable_name,
        closure_type_name,
        function_name,
        context,
      } => {
        if expression_is_loop_invariant(&context, &non_loop_invariant_variables) {
          hoisted_stmts.push(Statement::ClosureInit {
            closure_variable_name,
            closure_type_name,
            function_name,
            context,
          });
        } else {
          non_loop_invariant_variables.insert(closure_variable_name);
          inner_stmts.push(Statement::ClosureInit {
            closure_variable_name,
            closure_type_name,
            function_name,
            context,
          });
        }
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        if let Some(c) = &return_collector {
          non_loop_invariant_variables.insert(*c);
        }
        inner_stmts.push(Statement::Call { callee, arguments, return_type, return_collector });
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, _, _, _) in &final_assignments {
          non_loop_invariant_variables.insert(*n);
        }
        inner_stmts.push(Statement::IfElse { condition, s1, s2, final_assignments });
      }
      Statement::SingleIf { .. } | Statement::Break(_) => {
        inner_stmts.push(stmt);
      }
      Statement::While { loop_variables, statements, break_collector } => {
        if let Some(v) = &break_collector {
          non_loop_invariant_variables.insert(v.name);
        }
        inner_stmts.push(Statement::While { loop_variables, statements, break_collector });
      }
    }
  }

  LoopInvariantCodeMotionOptimizationResult {
    hoisted_statements_before_while: hoisted_stmts,
    optimized_while_statement: (loop_variables, inner_stmts, break_collector),
    non_loop_invariant_variables,
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, FunctionName, FunctionNameExpression, GenenalLoopVariable, Statement,
      SymbolTable, Type, VariableName, INT_TYPE, ONE, ZERO,
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_heap::{Heap, PStr};

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    let super::LoopInvariantCodeMotionOptimizationResult {
      hoisted_statements_before_while,
      optimized_while_statement: (loop_variables, inner_stmts, break_collector),
      non_loop_invariant_variables,
    } = super::optimize((
      vec![
        GenenalLoopVariable {
          name: PStr::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: PStr::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: heap.alloc_str_for_test("x"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: heap.alloc_str_for_test("y"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_y"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: heap.alloc_str_for_test("z"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_z"), INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          heap.alloc_str_for_test("cc"),
          Operator::LT,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ZERO,
        ),
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(ZERO)],
        },
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          Operator::PLUS,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          Operator::PLUS,
          Expression::var_name(PStr::LOWER_J, INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_x"),
          Operator::MUL,
          Expression::var_name(PStr::LOWER_I, INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_y"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
          Expression::int(6),
        ),
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_F),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          }),
          arguments: vec![Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_F),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          }),
          arguments: vec![Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: Some(heap.alloc_str_for_test("fc")),
        },
        Statement::binary(
          heap.alloc_str_for_test("tmp_z"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("tmp_x"), INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("tmp_y"), INT_TYPE),
        ),
        Statement::binary(
          PStr::LOWER_C,
          Operator::MINUS,
          Expression::var_name(PStr::LOWER_A, INT_TYPE),
          Expression::var_name(PStr::LOWER_B, INT_TYPE),
        ),
        Statement::IndexedAccess {
          name: PStr::LOWER_D,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(PStr::LOWER_C, INT_TYPE),
          index: 0,
        },
        Statement::IndexedAccess {
          name: PStr::LOWER_E,
          type_: INT_TYPE,
          pointer_expression: Expression::var_name(heap.alloc_str_for_test("x"), INT_TYPE),
          index: 0,
        },
        Statement::binary(
          PStr::LOWER_F,
          Operator::PLUS,
          Expression::var_name(PStr::LOWER_B, INT_TYPE),
          Expression::var_name(heap.alloc_str_for_test("x"), INT_TYPE),
        ),
        Statement::ClosureInit {
          closure_variable_name: PStr::LOWER_G,
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_F),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          },
          context: Expression::var_name(heap.alloc_str_for_test("x"), INT_TYPE),
        },
        Statement::ClosureInit {
          closure_variable_name: heap.alloc_str_for_test("h"),
          closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
          function_name: FunctionNameExpression {
            name: FunctionName::new_for_test(PStr::LOWER_F),
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          },
          context: Expression::var_name(PStr::LOWER_D, INT_TYPE),
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("kk"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
          expression_list: vec![ZERO],
        },
        Statement::StructInit {
          struct_variable_name: heap.alloc_str_for_test("kk2"),
          type_name: table.create_type_name_for_test(heap.alloc_str_for_test("I")),
          expression_list: vec![Expression::var_name(PStr::LOWER_G, INT_TYPE)],
        },
        Statement::Cast {
          name: heap.alloc_str_for_test("l1"),
          type_: INT_TYPE,
          assigned_expression: ZERO,
        },
        Statement::Cast {
          name: heap.alloc_str_for_test("l2"),
          type_: INT_TYPE,
          assigned_expression: Expression::var_name(PStr::LOWER_I, INT_TYPE),
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![(heap.alloc_str_for_test("bad"), INT_TYPE, ZERO, ZERO)],
        },
        Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
        Statement::While {
          loop_variables: vec![],
          statements: vec![],
          break_collector: Some(VariableName::new(heap.alloc_str_for_test("zzzz"), INT_TYPE)),
        },
      ],
      Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
    ));

    let optimized_stmts = hoisted_statements_before_while
      .into_iter()
      .chain(vec![Statement::While { loop_variables, statements: inner_stmts, break_collector }])
      .map(|s| s.debug_print(heap, table))
      .join("\n");
    assert_eq!(
      r#"let c = (a: int) - (b: int);
let d: int = (c: int)[0];
let h: _I = Closure { fun: (__$f: () -> int), context: (d: int) };
let kk: _I = [0];
let l1 = 0 as int;
let i: int = 0;
let j: int = 0;
let x: int = 0;
let y: int = 0;
let z: int = 0;
let bc: int;
while (true) {
  let cc = (i: int) < 0;
  if (cc: int) {
    bc = 0;
    break;
  }
  let tmp_i = (i: int) + 1;
  let tmp_j = (j: int) + 3;
  let tmp_x = (i: int) * 5;
  let tmp_y = (tmp_x: int) + 6;
  __$f((tmp_x: int));
  let fc: int = __$f((tmp_x: int));
  let tmp_z = (tmp_x: int) + (tmp_y: int);
  let e: int = (x: int)[0];
  let f = (b: int) + (x: int);
  let g: _I = Closure { fun: (__$f: () -> int), context: (x: int) };
  let kk2: _I = [(g: int)];
  let l2 = (i: int) as int;
  let bad: int;
  if 0 {
    bad = 0;
  } else {
    bad = 0;
  }
  while (true) {
  }
  let zzzz: int;
  while (true) {
  }
  i = (tmp_i: int);
  j = (tmp_j: int);
  x = (tmp_x: int);
  y = (tmp_y: int);
  z = (tmp_z: int);
}"#,
      optimized_stmts
    );
    assert_eq!(
      vec![
        "bad", "cc", "e", "f", "fc", "g", "i", "j", "kk2", "l2", "tmp_i", "tmp_j", "tmp_x",
        "tmp_y", "tmp_z", "x", "y", "z", "zzzz",
      ],
      non_loop_invariant_variables.iter().map(|it| it.as_str(heap)).sorted().collect_vec()
    );
  }
}
