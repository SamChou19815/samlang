use super::{
  dead_code_elimination, loop_algebraic_optimization,
  loop_induction_analysis::{self, OptimizableWhileLoop},
  loop_induction_variable_elimination, loop_invariant_code_motion, loop_strength_reduction,
};
use crate::{
  ast::hir::Operator,
  ast::mir::{Expression, Function, GenenalLoopVariable, Statement, VariableName, INT_TYPE, ZERO},
  common::take_mut,
  Heap,
};
use itertools::Itertools;
use std::collections::HashSet;

fn expand_optimizable_while_loop(
  OptimizableWhileLoop {
    basic_induction_variable_with_loop_guard,
    general_induction_variables,
    loop_variables_that_are_not_basic_induction_variables,
    derived_induction_variables,
    statements,
    break_collector,
  }: OptimizableWhileLoop,
  heap: &mut Heap,
) -> Statement {
  let basic_induction_variable_with_loop_guard_value_collector = heap.alloc_temp_str();
  let break_value = if let Some((_, _, e)) = &break_collector { e } else { &ZERO };
  let mut useful_used_set = HashSet::from([basic_induction_variable_with_loop_guard.name]);
  dead_code_elimination::collect_use_from_expression(break_value, &mut useful_used_set);
  for v in &loop_variables_that_are_not_basic_induction_variables {
    dead_code_elimination::collect_use_from_expression(&v.loop_value, &mut useful_used_set);
  }
  dead_code_elimination::collect_use_from_stmts(&statements, &mut useful_used_set);
  let general_basic_induction_variables_with_loop_value_collectors = general_induction_variables
    .into_iter()
    .filter(|v| useful_used_set.contains(&v.name))
    .map(|v| (v, heap.alloc_temp_str()))
    .collect_vec();
  let loop_condition_variable = heap.alloc_temp_str();
  let loop_variables = loop_variables_that_are_not_basic_induction_variables
    .into_iter()
    .filter(|v| useful_used_set.contains(&v.name))
    .chain(vec![GenenalLoopVariable {
      name: basic_induction_variable_with_loop_guard.name,
      type_: INT_TYPE,
      initial_value: basic_induction_variable_with_loop_guard.initial_value,
      loop_value: Expression::var_name(
        basic_induction_variable_with_loop_guard_value_collector,
        INT_TYPE,
      ),
    }])
    .chain(general_basic_induction_variables_with_loop_value_collectors.iter().map(|(v, n)| {
      GenenalLoopVariable {
        name: v.name,
        type_: INT_TYPE,
        initial_value: v.initial_value,
        loop_value: Expression::var_name(*n, INT_TYPE),
      }
    }))
    .collect_vec();

  Statement::While {
    loop_variables,
    statements: vec![
      Statement::Binary(Statement::binary_unwrapped(
        loop_condition_variable,
        basic_induction_variable_with_loop_guard.guard_operator.invert().to_op(),
        Expression::var_name(basic_induction_variable_with_loop_guard.name, INT_TYPE),
        basic_induction_variable_with_loop_guard.guard_expression.to_expression(),
      )),
      Statement::SingleIf {
        condition: Expression::var_name(loop_condition_variable, INT_TYPE),
        invert_condition: false,
        statements: vec![Statement::Break(*break_value)],
      },
    ]
    .into_iter()
    .chain(statements)
    .chain(vec![Statement::Binary(Statement::binary_unwrapped(
      basic_induction_variable_with_loop_guard_value_collector,
      Operator::PLUS,
      Expression::var_name(basic_induction_variable_with_loop_guard.name, INT_TYPE),
      basic_induction_variable_with_loop_guard.increment_amount.to_expression(),
    ))])
    .chain(general_basic_induction_variables_with_loop_value_collectors.into_iter().map(
      |(v, collector)| {
        Statement::Binary(Statement::binary_unwrapped(
          collector,
          Operator::PLUS,
          Expression::var_name(v.name, INT_TYPE),
          v.increment_amount.to_expression(),
        ))
      },
    ))
    .chain(derived_induction_variables.into_iter().flat_map(|v| {
      let step_1_temp = heap.alloc_temp_str();
      vec![
        Statement::Binary(Statement::binary_flexible_unwrapped(
          step_1_temp,
          Operator::MUL,
          Expression::var_name(v.base_name, INT_TYPE),
          v.multiplier.to_expression(),
        )),
        Statement::Binary(Statement::binary_flexible_unwrapped(
          v.name,
          Operator::PLUS,
          Expression::var_name(step_1_temp, INT_TYPE),
          v.immediate.to_expression(),
        )),
      ]
    }))
    .collect(),
    break_collector: if let Some((name, type_, _)) = break_collector {
      Some(VariableName { name, type_ })
    } else {
      None
    },
  }
}

fn optimize_while_statement_with_all_loop_optimizations(
  while_stmt: (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>),
  heap: &mut Heap,
) -> Vec<Statement> {
  let loop_invariant_code_motion::LoopInvariantCodeMotionOptimizationResult {
    hoisted_statements_before_while: mut final_stmts,
    optimized_while_statement,
    non_loop_invariant_variables,
  } = loop_invariant_code_motion::optimize(while_stmt);
  match loop_induction_analysis::extract_optimizable_while_loop(
    optimized_while_statement,
    &non_loop_invariant_variables,
  ) {
    Ok(optimizable_while_loop) => {
      if let Some(mut stmts) = loop_algebraic_optimization::optimize(&optimizable_while_loop, heap)
      {
        final_stmts.append(&mut stmts);
        return final_stmts;
      }

      let optimizable_while_loop =
        match loop_induction_variable_elimination::optimize(optimizable_while_loop, heap) {
          Ok(loop_induction_variable_elimination::LoopInductionVariableEliminationResult {
            mut prefix_statements,
            optimizable_while_loop: l,
          }) => {
            final_stmts.append(&mut prefix_statements);
            l
          }
          Err(l) => l,
        };

      let loop_strength_reduction::LoopStrengthReductionOptimizationResult {
        mut prefix_statements,
        optimizable_while_loop:
          OptimizableWhileLoop {
            basic_induction_variable_with_loop_guard,
            general_induction_variables,
            loop_variables_that_are_not_basic_induction_variables,
            derived_induction_variables,
            statements,
            break_collector,
          },
      } = loop_strength_reduction::optimize(optimizable_while_loop, heap);
      final_stmts.append(&mut prefix_statements);

      let already_handled_induction_variable_names =
        general_induction_variables.iter().map(|v| v.name).collect::<HashSet<_>>();
      final_stmts.push(expand_optimizable_while_loop(
        OptimizableWhileLoop {
          basic_induction_variable_with_loop_guard,
          general_induction_variables,
          loop_variables_that_are_not_basic_induction_variables,
          derived_induction_variables,
          statements: statements
            .into_iter()
            .filter(|s| {
              !s.as_binary()
                .map(|b| already_handled_induction_variable_names.contains(&b.name))
                .unwrap_or(false)
            })
            .collect(),
          break_collector,
        },
        heap,
      ));

      final_stmts
    }
    Err((loop_variables, statements, break_collector)) => {
      final_stmts.push(Statement::While { loop_variables, statements, break_collector });
      final_stmts
    }
  }
}

fn optimize_stmt(stmt: Statement, heap: &mut Heap) -> Vec<Statement> {
  match stmt {
    Statement::IfElse { condition, s1, s2, final_assignments } => vec![Statement::IfElse {
      condition,
      s1: optimize_stmts(s1, heap),
      s2: optimize_stmts(s2, heap),
      final_assignments,
    }],
    Statement::SingleIf { condition, invert_condition, statements } => vec![Statement::SingleIf {
      condition,
      invert_condition,
      statements: optimize_stmts(statements, heap),
    }],
    Statement::While { loop_variables, statements, break_collector } => {
      optimize_while_statement_with_all_loop_optimizations(
        (loop_variables, statements, break_collector),
        heap,
      )
    }
    _ => vec![stmt],
  }
}

fn optimize_stmts(stmts: Vec<Statement>, heap: &mut Heap) -> Vec<Statement> {
  stmts.into_iter().flat_map(|s| optimize_stmt(s, heap)).collect()
}

pub(super) fn optimize_function(function: &mut Function, heap: &mut Heap) {
  take_mut(&mut function.body, |body| optimize_stmts(body, heap));
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::Operator,
    ast::mir::{
      Callee, Expression, Function, FunctionName, FunctionNameExpression, GenenalLoopVariable,
      Statement, SymbolTable, Type, VariableName, INT_TYPE, ONE, ZERO,
    },
    common::{well_known_pstrs, Heap, INVALID_PSTR},
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_loop_optimized(
    stmt: (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>),
    heap: &mut Heap,
    expected: &str,
  ) {
    let actual = super::optimize_while_statement_with_all_loop_optimizations(stmt, heap)
      .iter()
      .map(|s| s.debug_print(heap, &SymbolTable::new()))
      .join("\n");
    assert_eq!(expected, actual);
  }

  fn assert_stmts_optimized(
    stmts: Vec<Statement>,
    return_value: Expression,
    heap: &mut Heap,
    expected: &str,
  ) {
    let mut f = Function {
      name: FunctionName::new_for_test(INVALID_PSTR),
      parameters: vec![],
      type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
      body: stmts,
      return_value,
    };
    super::optimize_function(&mut f, heap);
    super::super::conditional_constant_propagation::optimize_function(&mut f, heap);
    let actual = format!(
      "{}\nreturn {};",
      f.body.iter().map(|s| s.debug_print(heap, &SymbolTable::new())).join("\n"),
      f.return_value.debug_print(heap, &SymbolTable::new())
    );
    assert_eq!(expected, actual);
  }

  fn optimizable_loop_1(
    heap: &mut Heap,
  ) -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          heap.alloc_str_for_test("cc"),
          Operator::GE,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          Expression::int(10),
        ),
        Statement::Cast {
          name: heap.alloc_str_for_test("cast"),
          type_: INT_TYPE,
          assigned_expression: ZERO,
        },
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name(
            well_known_pstrs::LOWER_J,
            INT_TYPE,
          ))],
        },
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          Operator::PLUS,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          Operator::PLUS,
          Expression::var_name(well_known_pstrs::LOWER_J, INT_TYPE),
          Expression::int(10),
        ),
      ],
      Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
    )
  }

  fn optimizable_loop_2(
    heap: &mut Heap,
  ) -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          heap.alloc_str_for_test("cc"),
          Operator::GE,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          Expression::int(10),
        ),
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name(
            well_known_pstrs::LOWER_J,
            INT_TYPE,
          ))],
        },
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          Operator::PLUS,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          Expression::int(10),
        ),
      ],
      Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
    )
  }

  fn optimizable_loop_3(
    heap: &mut Heap,
  ) -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_I,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_J,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
        },
        GenenalLoopVariable {
          name: well_known_pstrs::LOWER_K,
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_k"), INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          heap.alloc_str_for_test("cc"),
          Operator::GE,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          Expression::int(10),
        ),
        Statement::SingleIf {
          condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name(
            well_known_pstrs::LOWER_J,
            INT_TYPE,
          ))],
        },
        Statement::binary(
          heap.alloc_str_for_test("tmp_i"),
          Operator::PLUS,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          ONE,
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          Expression::int(9),
        ),
        Statement::binary(
          heap.alloc_str_for_test("tmp_k"),
          Operator::PLUS,
          Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          Expression::int(9),
        ),
      ],
      Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
    )
  }

  #[test]
  fn loop_optimization_tests() {
    let heap = &mut Heap::new();
    assert_loop_optimized(
      (
        vec![],
        vec![Statement::binary(well_known_pstrs::LOWER_A, Operator::PLUS, ZERO, ZERO)],
        None,
      ),
      heap,
      "let a = 0 + 0;\nwhile (true) {\n}",
    );

    let heap = &mut Heap::new();
    assert_loop_optimized(
      optimizable_loop_1(heap),
      heap,
      "let cast = 0 as int;\nlet _t0 = 10 * 10;\nlet bc = (_t0: int) + 0;",
    );

    let heap = &mut Heap::new();
    assert_loop_optimized(
      optimizable_loop_2(heap),
      heap,
      r#"let _t0 = 1 * 0;
let _t1 = (_t0: int) + 11;
let _t2 = 10 * 1;
let _t3 = (_t2: int) + 11;
let j: int = 0;
let tmp_j: int = (_t1: int);
let bc: int;
while (true) {
  let _t5 = (tmp_j: int) >= (_t3: int);
  if (_t5: int) {
    bc = (j: int);
    break;
  }
  let _t4 = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_t4: int);
}"#,
    );

    let heap = &mut Heap::new();
    assert_loop_optimized(
      optimizable_loop_3(heap),
      heap,
      r#"let _t0 = 1 * 0;
let _t1 = (_t0: int) + 10;
let _t2 = 1 * 0;
let _t3 = (_t2: int) + 10;
let j: int = 0;
let i: int = 0;
let tmp_j: int = (_t1: int);
let tmp_k: int = (_t3: int);
let bc: int;
while (true) {
  let _t7 = (i: int) >= 10;
  if (_t7: int) {
    bc = (j: int);
    break;
  }
  let _t4 = (i: int) + 1;
  let _t5 = (tmp_j: int) + 1;
  let _t6 = (tmp_k: int) + 1;
  j = (tmp_j: int);
  i = (_t4: int);
  tmp_j = (_t5: int);
  tmp_k = (_t6: int);
}"#,
    );

    let heap = &mut Heap::new();
    assert_loop_optimized(
      (
        vec![
          GenenalLoopVariable {
            name: well_known_pstrs::LOWER_I,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: well_known_pstrs::LOWER_J,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
          },
        ],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            Operator::LT,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(10),
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(
              well_known_pstrs::LOWER_J,
              INT_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            Operator::MUL,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(2),
          ),
        ],
        Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
      ),
      heap,
      r#"let j: int = 0;
let i: int = 0;
let bc: int;
while (true) {
  let _t1 = (i: int) < 10;
  if (_t1: int) {
    bc = (j: int);
    break;
  }
  let _t0 = (i: int) + (a: int);
  let _t2 = (i: int) * 2;
  let tmp_j = (_t2: int) + 0;
  j = (tmp_j: int);
  i = (_t0: int);
}"#,
    );

    let heap = &mut Heap::new();
    assert_loop_optimized(
      (
        vec![
          GenenalLoopVariable {
            name: well_known_pstrs::LOWER_I,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: well_known_pstrs::LOWER_J,
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
          },
        ],
        vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            Operator::LT,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(10),
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(
              well_known_pstrs::LOWER_J,
              INT_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            ONE,
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            Operator::PLUS,
            Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
            Expression::int(10),
          ),
        ],
        None,
      ),
      heap,
      r#"let _t0 = 1 * 0;
let _t1 = (_t0: int) + 11;
let _t2 = 10 * 1;
let _t3 = (_t2: int) + 11;
let tmp_j: int = (_t1: int);
while (true) {
  let _t5 = (tmp_j: int) >= (_t3: int);
  if (_t5: int) {
    undefined = 0;
    break;
  }
  let _t4 = (tmp_j: int) + 1;
  tmp_j = (_t4: int);
}"#,
    );
  }

  #[test]
  fn stmts_optimization_tests() {
    let heap = &mut Heap::new();
    assert_stmts_optimized(
      vec![Statement::IfElse {
        condition: ZERO,
        s1: vec![Statement::SingleIf {
          condition: ZERO,
          invert_condition: true,
          statements: vec![Statement::Break(ZERO)],
        }],
        s2: vec![Statement::binary(
          heap.alloc_str_for_test("tmp_j"),
          Operator::MUL,
          Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
          Expression::int(2),
        )],
        final_assignments: vec![],
      }],
      ZERO,
      heap,
      "let tmp_j = (i: int) * 2;\nreturn 0;",
    );

    let heap = &mut Heap::new();
    let (loop_variables, statements, break_collector) = optimizable_loop_1(heap);
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name(heap.alloc_str_for_test("bc"), INT_TYPE),
      heap,
      "let cast = 0 as int;\nreturn 100;",
    );

    let heap = &mut Heap::new();
    let (loop_variables, statements, break_collector) = optimizable_loop_2(heap);
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name(heap.alloc_str_for_test("bc"), INT_TYPE),
      heap,
      r#"let j: int = 16;
let tmp_j: int = 17;
let bc: int;
while (true) {
  let _t5 = (tmp_j: int) >= 21;
  if (_t5: int) {
    bc = (j: int);
    break;
  }
  let _t4 = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_t4: int);
}
return (bc: int);"#,
    );

    let heap = &mut Heap::new();
    let (loop_variables, statements, break_collector) = optimizable_loop_3(heap);
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name(heap.alloc_str_for_test("bc"), INT_TYPE),
      heap,
      r#"let j: int = 15;
let i: int = 6;
let tmp_j: int = 16;
let tmp_k: int = 16;
let bc: int;
while (true) {
  let _t7 = (i: int) >= 10;
  if (_t7: int) {
    bc = (j: int);
    break;
  }
  let _t4 = (i: int) + 1;
  let _t5 = (tmp_j: int) + 1;
  let _t6 = (tmp_k: int) + 1;
  j = (tmp_j: int);
  i = (_t4: int);
  tmp_j = (_t5: int);
  tmp_k = (_t6: int);
}
return (bc: int);"#,
    );

    let heap = &mut Heap::new();
    assert_stmts_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: well_known_pstrs::LOWER_I,
            type_: INT_TYPE,
            initial_value: Expression::int(4),
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
          },
          GenenalLoopVariable {
            name: heap.alloc_str_for_test("acc"),
            type_: INT_TYPE,
            initial_value: ONE,
            loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_j"), INT_TYPE),
          },
        ],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            Operator::LT,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            ONE,
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name(
              heap.alloc_str_for_test("acc"),
              INT_TYPE,
            ))],
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(-1),
          ),
          Statement::binary(
            heap.alloc_str_for_test("tmp_j"),
            Operator::MUL,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("acc"), INT_TYPE),
          ),
        ],
        break_collector: Some(VariableName::new(heap.alloc_str_for_test("bc"), INT_TYPE)),
      }],
      Expression::var_name(heap.alloc_str_for_test("bc"), INT_TYPE),
      heap,
      "\nreturn 24;",
    );
  }

  #[test]
  fn stmts_optimization_tricky_test() {
    // This test used to uncover a over-optimization bug in conditional constant propagation.
    let heap = &mut Heap::new();
    assert_stmts_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: well_known_pstrs::LOWER_I,
          type_: INT_TYPE,
          initial_value: Expression::var_name(heap.alloc_str_for_test("init_i"), INT_TYPE),
          loop_value: Expression::var_name(heap.alloc_str_for_test("tmp_i"), INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            heap.alloc_str_for_test("cc"),
            Operator::LT,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("L"), INT_TYPE),
          ),
          Statement::SingleIf {
            condition: Expression::var_name(heap.alloc_str_for_test("cc"), INT_TYPE),
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary(
            heap.alloc_str_for_test("t"),
            Operator::MUL,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            well_known_pstrs::LOWER_J,
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_A, INT_TYPE),
            Expression::var_name(heap.alloc_str_for_test("t"), INT_TYPE),
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(well_known_pstrs::LOWER_F),
              type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            }),
            arguments: vec![Expression::var_name(well_known_pstrs::LOWER_J, INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::binary(
            heap.alloc_str_for_test("tmp_i"),
            Operator::PLUS,
            Expression::var_name(well_known_pstrs::LOWER_I, INT_TYPE),
            Expression::int(2),
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      heap,
      r#"let _t0 = (init_i: int) * 3;
let _t2 = (init_i: int) * 3;
let _t3 = (a: int) + (_t2: int);
let i: int = (init_i: int);
let j: int = (_t3: int);
while (true) {
  let _t6 = (i: int) >= (L: int);
  if (_t6: int) {
    undefined = 0;
    break;
  }
  __$f((j: int));
  let _t4 = (i: int) + 2;
  let _t5 = (j: int) + 6;
  i = (_t4: int);
  j = (_t5: int);
}
return 0;"#,
    );
  }
}
