use super::{
  dead_code_elimination, loop_algebraic_optimization,
  loop_induction_analysis::{self, OptimizableWhileLoop},
  loop_induction_variable_elimination, loop_invariant_code_motion, loop_strength_reduction,
  optimization_common::ResourceAllocator,
};
use crate::ast::hir::{
  Expression, Function, GenenalLoopVariable, Operator, Statement, VariableName, BOOL_TYPE,
  INT_TYPE, ZERO,
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
  allocator: &mut ResourceAllocator,
) -> Statement {
  let basic_induction_variable_with_loop_guard_value_collector = allocator.alloc_loop_temp();
  let break_value = if let Some((_, _, e)) = &break_collector { e } else { &ZERO };
  let mut useful_used_set = HashSet::from([basic_induction_variable_with_loop_guard.name.clone()]);
  dead_code_elimination::collect_use_from_expression(break_value, &mut useful_used_set);
  for v in &loop_variables_that_are_not_basic_induction_variables {
    dead_code_elimination::collect_use_from_expression(&v.loop_value, &mut useful_used_set);
  }
  dead_code_elimination::collect_use_from_stmts(&statements, &mut useful_used_set);
  let general_basic_induction_variables_with_loop_value_collectors = general_induction_variables
    .into_iter()
    .filter(|v| useful_used_set.contains(&v.name))
    .map(|v| (v, allocator.alloc_loop_temp()))
    .collect_vec();
  let loop_condition_variable = allocator.alloc_loop_temp();
  let loop_variables = loop_variables_that_are_not_basic_induction_variables
    .into_iter()
    .filter(|v| useful_used_set.contains(&v.name))
    .chain(vec![GenenalLoopVariable {
      name: basic_induction_variable_with_loop_guard.name.clone(),
      type_: INT_TYPE,
      initial_value: basic_induction_variable_with_loop_guard.initial_value.clone(),
      loop_value: Expression::var_name_str(
        basic_induction_variable_with_loop_guard_value_collector.clone(),
        INT_TYPE,
      ),
    }])
    .chain(general_basic_induction_variables_with_loop_value_collectors.iter().map(|(v, n)| {
      GenenalLoopVariable {
        name: v.name.clone(),
        type_: INT_TYPE,
        initial_value: v.initial_value.clone(),
        loop_value: Expression::var_name_str(n.clone(), INT_TYPE),
      }
    }))
    .collect_vec();

  Statement::While {
    loop_variables,
    statements: vec![
      Statement::Binary(Statement::binary_unwrapped(
        loop_condition_variable.clone(),
        basic_induction_variable_with_loop_guard.guard_operator.invert().to_op(),
        Expression::var_name_str(basic_induction_variable_with_loop_guard.name.clone(), INT_TYPE),
        basic_induction_variable_with_loop_guard.guard_expression.to_expression(),
      )),
      Statement::SingleIf {
        condition: Expression::var_name_str(loop_condition_variable, BOOL_TYPE),
        invert_condition: false,
        statements: vec![Statement::Break(break_value.clone())],
      },
    ]
    .into_iter()
    .chain(statements)
    .chain(vec![Statement::Binary(Statement::binary_unwrapped(
      basic_induction_variable_with_loop_guard_value_collector,
      Operator::PLUS,
      Expression::var_name_str(basic_induction_variable_with_loop_guard.name.clone(), INT_TYPE),
      basic_induction_variable_with_loop_guard.increment_amount.to_expression(),
    ))])
    .chain(general_basic_induction_variables_with_loop_value_collectors.into_iter().map(
      |(v, collector)| {
        Statement::Binary(Statement::binary_unwrapped(
          collector,
          Operator::PLUS,
          Expression::var_name_str(v.name, INT_TYPE),
          v.increment_amount.to_expression(),
        ))
      },
    ))
    .chain(derived_induction_variables.into_iter().flat_map(|v| {
      let step_1_temp = allocator.alloc_loop_temp();
      vec![
        Statement::Binary(Statement::binary_flexible_unwrapped(
          step_1_temp.clone(),
          Operator::MUL,
          Expression::var_name_str(v.base_name, INT_TYPE),
          v.multiplier.to_expression(),
        )),
        Statement::Binary(Statement::binary_flexible_unwrapped(
          v.name,
          Operator::PLUS,
          Expression::var_name_str(step_1_temp, INT_TYPE),
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
  allocator: &mut ResourceAllocator,
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
      if let Some(mut stmts) =
        loop_algebraic_optimization::optimize(&optimizable_while_loop, allocator)
      {
        final_stmts.append(&mut stmts);
        return final_stmts;
      }

      let optimizable_while_loop =
        match loop_induction_variable_elimination::optimize(optimizable_while_loop, allocator) {
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
      } = loop_strength_reduction::optimize(optimizable_while_loop, allocator);
      final_stmts.append(&mut prefix_statements);

      let already_handled_induction_variable_names =
        general_induction_variables.iter().map(|v| v.name.clone()).collect::<HashSet<_>>();
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
        allocator,
      ));

      final_stmts
    }
    Err((loop_variables, statements, break_collector)) => {
      final_stmts.push(Statement::While { loop_variables, statements, break_collector });
      final_stmts
    }
  }
}

fn optimize_stmt(stmt: Statement, allocator: &mut ResourceAllocator) -> Vec<Statement> {
  match stmt {
    Statement::IfElse { condition, s1, s2, final_assignments } => vec![Statement::IfElse {
      condition,
      s1: optimize_stmts(s1, allocator),
      s2: optimize_stmts(s2, allocator),
      final_assignments,
    }],
    Statement::SingleIf { condition, invert_condition, statements } => vec![Statement::SingleIf {
      condition,
      invert_condition,
      statements: optimize_stmts(statements, allocator),
    }],
    Statement::While { loop_variables, statements, break_collector } => {
      optimize_while_statement_with_all_loop_optimizations(
        (loop_variables, statements, break_collector),
        allocator,
      )
    }
    _ => vec![stmt],
  }
}

fn optimize_stmts(stmts: Vec<Statement>, allocator: &mut ResourceAllocator) -> Vec<Statement> {
  stmts.into_iter().flat_map(|s| optimize_stmt(s, allocator)).collect()
}

pub(super) fn optimize_function(function: Function, allocator: &mut ResourceAllocator) -> Function {
  let Function { name, parameters, type_parameters, type_, body, return_value } = function;
  Function {
    name,
    parameters,
    type_parameters,
    type_,
    body: optimize_stmts(body, allocator),
    return_value,
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, Expression, Function, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
    optimization::optimization_common::ResourceAllocator,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  fn assert_loop_optimized(
    stmt: (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>),
    expected: &str,
  ) {
    let actual = super::optimize_while_statement_with_all_loop_optimizations(
      stmt,
      &mut ResourceAllocator::new(),
    )
    .iter()
    .map(Statement::debug_print)
    .join("\n");
    assert_eq!(expected, actual);
  }

  fn assert_stmts_optimized(stmts: Vec<Statement>, return_value: Expression, expected: &str) {
    let Function { body, return_value, .. } =
      super::super::conditional_constant_propagation::optimize_function(super::optimize_function(
        Function {
          name: rcs(""),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: stmts,
          return_value,
        },
        &mut ResourceAllocator::new(),
      ));
    let actual = format!(
      "{}\nreturn {};",
      body.iter().map(Statement::debug_print).join("\n"),
      return_value.debug_print()
    );
    assert_eq!(expected, actual);
  }

  fn optimizable_loop_1() -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          "cc",
          Operator::GE,
          Expression::var_name("i", INT_TYPE),
          Expression::int(10),
        ),
        Statement::SingleIf {
          condition: Expression::var_name("cc", BOOL_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name("j", INT_TYPE))],
        },
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::int(10),
        ),
      ],
      Some(VariableName::new("bc", INT_TYPE)),
    )
  }

  fn optimizable_loop_2() -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          "cc",
          Operator::GE,
          Expression::var_name("i", INT_TYPE),
          Expression::int(10),
        ),
        Statement::SingleIf {
          condition: Expression::var_name("cc", BOOL_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name("j", INT_TYPE))],
        },
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("tmp_i", INT_TYPE),
          Expression::int(10),
        ),
      ],
      Some(VariableName::new("bc", INT_TYPE)),
    )
  }

  fn optimizable_loop_3() -> (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>) {
    (
      vec![
        GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("j"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_j", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("k"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_k", INT_TYPE),
        },
      ],
      vec![
        Statement::binary(
          "cc",
          Operator::GE,
          Expression::var_name("i", INT_TYPE),
          Expression::int(10),
        ),
        Statement::SingleIf {
          condition: Expression::var_name("cc", BOOL_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(Expression::var_name("j", INT_TYPE))],
        },
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("tmp_i", INT_TYPE),
          Expression::int(9),
        ),
        Statement::binary(
          "tmp_k",
          Operator::PLUS,
          Expression::var_name("tmp_i", INT_TYPE),
          Expression::int(9),
        ),
      ],
      Some(VariableName::new("bc", INT_TYPE)),
    )
  }

  #[test]
  fn loop_optimization_tests() {
    assert_loop_optimized(
      (vec![], vec![Statement::binary("a", Operator::PLUS, ZERO, ZERO)], None),
      "let a: int = 0 + 0;\nwhile (true) {\n}",
    );

    assert_loop_optimized(
      optimizable_loop_1(),
      "let _loop_0: int = 10 * 10;\nlet bc: int = (_loop_0: int) + 0;",
    );

    assert_loop_optimized(
      optimizable_loop_2(),
      r#"let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 11;
let _loop_2: int = 10 * 1;
let _loop_3: int = (_loop_2: int) + 11;
let j: int = 0;
let tmp_j: int = (_loop_1: int);
let bc: int;
while (true) {
  let _loop_5: bool = (tmp_j: int) >= (_loop_3: int);
  if (_loop_5: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_loop_4: int);
}"#,
    );

    assert_loop_optimized(
      optimizable_loop_3(),
      r#"let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 10;
let _loop_2: int = 1 * 0;
let _loop_3: int = (_loop_2: int) + 10;
let j: int = 0;
let i: int = 0;
let tmp_j: int = (_loop_1: int);
let tmp_k: int = (_loop_3: int);
let bc: int;
while (true) {
  let _loop_7: bool = (i: int) >= 10;
  if (_loop_7: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (i: int) + 1;
  let _loop_5: int = (tmp_j: int) + 1;
  let _loop_6: int = (tmp_k: int) + 1;
  j = (tmp_j: int);
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}"#,
    );

    assert_loop_optimized(
      (
        vec![
          GenenalLoopVariable {
            name: rcs("i"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_i", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("j"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_j", INT_TYPE),
          },
        ],
        vec![
          Statement::binary(
            "cc",
            Operator::LT,
            Expression::var_name("i", INT_TYPE),
            Expression::int(10),
          ),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("j", INT_TYPE))],
          },
          Statement::binary(
            "tmp_i",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("a", INT_TYPE),
          ),
          Statement::binary(
            "tmp_j",
            Operator::MUL,
            Expression::var_name("i", INT_TYPE),
            Expression::int(2),
          ),
        ],
        Some(VariableName::new("bc", INT_TYPE)),
      ),
      r#"let j: int = 0;
let i: int = 0;
let bc: int;
while (true) {
  let _loop_1: bool = (i: int) < 10;
  if (_loop_1: bool) {
    bc = (j: int);
    break;
  }
  let _loop_0: int = (i: int) + (a: int);
  let _loop_2: int = (i: int) * 2;
  let tmp_j: int = (_loop_2: int) + 0;
  j = (tmp_j: int);
  i = (_loop_0: int);
}"#,
    );

    assert_loop_optimized(
      (
        vec![
          GenenalLoopVariable {
            name: rcs("i"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_i", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("j"),
            type_: INT_TYPE,
            initial_value: ZERO,
            loop_value: Expression::var_name("tmp_j", INT_TYPE),
          },
        ],
        vec![
          Statement::binary(
            "cc",
            Operator::LT,
            Expression::var_name("i", INT_TYPE),
            Expression::int(10),
          ),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("j", INT_TYPE))],
          },
          Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
          Statement::binary(
            "tmp_j",
            Operator::PLUS,
            Expression::var_name("tmp_i", INT_TYPE),
            Expression::int(10),
          ),
        ],
        None,
      ),
      r#"let _loop_0: int = 1 * 0;
let _loop_1: int = (_loop_0: int) + 11;
let _loop_2: int = 10 * 1;
let _loop_3: int = (_loop_2: int) + 11;
let tmp_j: int = (_loop_1: int);
while (true) {
  let _loop_5: bool = (tmp_j: int) >= (_loop_3: int);
  if (_loop_5: bool) {
    undefined = 0;
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  tmp_j = (_loop_4: int);
}"#,
    );
  }

  #[test]
  fn stmts_optimization_tests() {
    assert_stmts_optimized(
      vec![Statement::IfElse {
        condition: ZERO,
        s1: vec![Statement::SingleIf {
          condition: ZERO,
          invert_condition: true,
          statements: vec![Statement::Break(ZERO)],
        }],
        s2: vec![Statement::binary(
          "tmp_j",
          Operator::MUL,
          Expression::var_name("i", INT_TYPE),
          Expression::int(2),
        )],
        final_assignments: vec![],
      }],
      ZERO,
      "let tmp_j: int = (i: int) * 2;\nreturn 0;",
    );

    let (loop_variables, statements, break_collector) = optimizable_loop_1();
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name("bc", INT_TYPE),
      "\nreturn 100;",
    );

    let (loop_variables, statements, break_collector) = optimizable_loop_2();
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name("bc", INT_TYPE),
      r#"let j: int = 16;
let tmp_j: int = 17;
let bc: int;
while (true) {
  let _loop_5: bool = (tmp_j: int) >= 21;
  if (_loop_5: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (tmp_j: int) + 1;
  j = (tmp_j: int);
  tmp_j = (_loop_4: int);
}
return (bc: int);"#,
    );

    let (loop_variables, statements, break_collector) = optimizable_loop_3();
    assert_stmts_optimized(
      vec![Statement::While { loop_variables, statements, break_collector }],
      Expression::var_name("bc", INT_TYPE),
      r#"let j: int = 15;
let i: int = 6;
let tmp_j: int = 16;
let tmp_k: int = 16;
let bc: int;
while (true) {
  let _loop_7: bool = (i: int) >= 10;
  if (_loop_7: bool) {
    bc = (j: int);
    break;
  }
  let _loop_4: int = (i: int) + 1;
  let _loop_5: int = (tmp_j: int) + 1;
  let _loop_6: int = (tmp_k: int) + 1;
  j = (tmp_j: int);
  i = (_loop_4: int);
  tmp_j = (_loop_5: int);
  tmp_k = (_loop_6: int);
}
return (bc: int);"#,
    );

    assert_stmts_optimized(
      vec![Statement::While {
        loop_variables: vec![
          GenenalLoopVariable {
            name: rcs("i"),
            type_: INT_TYPE,
            initial_value: Expression::int(4),
            loop_value: Expression::var_name("tmp_i", INT_TYPE),
          },
          GenenalLoopVariable {
            name: rcs("acc"),
            type_: INT_TYPE,
            initial_value: ONE,
            loop_value: Expression::var_name("tmp_j", INT_TYPE),
          },
        ],
        statements: vec![
          Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ONE),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: false,
            statements: vec![Statement::Break(Expression::var_name("acc", INT_TYPE))],
          },
          Statement::binary(
            "tmp_i",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::int(-1),
          ),
          Statement::binary(
            "tmp_j",
            Operator::MUL,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("acc", INT_TYPE),
          ),
        ],
        break_collector: Some(VariableName::new("bc", INT_TYPE)),
      }],
      Expression::var_name("bc", INT_TYPE),
      "\nreturn 24;",
    );
  }

  #[test]
  fn stmts_optimization_tricky_test() {
    // This test used to uncover a over-optimization bug in conditional constant propagation.
    assert_stmts_optimized(
      vec![Statement::While {
        loop_variables: vec![GenenalLoopVariable {
          name: rcs("i"),
          type_: INT_TYPE,
          initial_value: Expression::var_name("init_i", INT_TYPE),
          loop_value: Expression::var_name("tmp_i", INT_TYPE),
        }],
        statements: vec![
          Statement::binary(
            "cc",
            Operator::LT,
            Expression::var_name("i", INT_TYPE),
            Expression::var_name("L", INT_TYPE),
          ),
          Statement::SingleIf {
            condition: Expression::var_name("cc", BOOL_TYPE),
            invert_condition: true,
            statements: vec![Statement::Break(ZERO)],
          },
          Statement::binary(
            "t",
            Operator::MUL,
            Expression::var_name("i", INT_TYPE),
            Expression::int(3),
          ),
          Statement::binary(
            "j",
            Operator::PLUS,
            Expression::var_name("a", INT_TYPE),
            Expression::var_name("t", INT_TYPE),
          ),
          Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "f",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![Expression::var_name("j", INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          },
          Statement::binary(
            "tmp_i",
            Operator::PLUS,
            Expression::var_name("i", INT_TYPE),
            Expression::int(2),
          ),
        ],
        break_collector: None,
      }],
      ZERO,
      r#"let _loop_0: int = (init_i: int) * 3;
let _loop_2: int = (init_i: int) * 3;
let _loop_3: int = (a: int) + (_loop_2: int);
let i: int = (init_i: int);
let j: int = (_loop_3: int);
while (true) {
  let _loop_6: bool = (i: int) >= (L: int);
  if (_loop_6: bool) {
    undefined = 0;
    break;
  }
  f((j: int));
  let _loop_4: int = (i: int) + 2;
  let _loop_5: int = (j: int) + 6;
  i = (_loop_4: int);
  j = (_loop_5: int);
}
return 0;"#,
    );
  }
}
