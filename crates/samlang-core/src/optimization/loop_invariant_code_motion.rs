use crate::{
  ast::hir::{Expression, GenenalLoopVariable, Statement, VariableName},
  common::Str,
};
use std::collections::HashSet;

pub(super) struct LoopInvariantCodeMotionOptimizationResult {
  pub(super) hoisted_statements_before_while: Vec<Statement>,
  pub(super) optimized_while_statement:
    (Vec<GenenalLoopVariable>, Vec<Statement>, Option<VariableName>),
  pub(super) non_loop_invariant_variables: HashSet<Str>,
}

fn expression_is_loop_invariant(
  expr: &Expression,
  non_loop_invariant_variables: &HashSet<Str>,
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
    loop_variables.iter().map(|it| it.name.clone()).collect::<HashSet<_>>();

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
          non_loop_invariant_variables.insert(b.name.clone());
          inner_stmts.push(Statement::Binary(b));
        }
      }
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        if expression_is_loop_invariant(&pointer_expression, &non_loop_invariant_variables) {
          hoisted_stmts.push(Statement::IndexedAccess { name, type_, pointer_expression, index });
        } else {
          non_loop_invariant_variables.insert(name.clone());
          inner_stmts.push(Statement::IndexedAccess { name, type_, pointer_expression, index });
        }
      }
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        if expression_list
          .iter()
          .all(|e| expression_is_loop_invariant(e, &non_loop_invariant_variables))
        {
          hoisted_stmts.push(Statement::StructInit {
            struct_variable_name,
            type_,
            expression_list,
          });
        } else {
          non_loop_invariant_variables.insert(struct_variable_name.clone());
          inner_stmts.push(Statement::StructInit { struct_variable_name, type_, expression_list });
        }
      }
      Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
        if expression_is_loop_invariant(&context, &non_loop_invariant_variables) {
          hoisted_stmts.push(Statement::ClosureInit {
            closure_variable_name,
            closure_type,
            function_name,
            context,
          });
        } else {
          non_loop_invariant_variables.insert(closure_variable_name.clone());
          inner_stmts.push(Statement::ClosureInit {
            closure_variable_name,
            closure_type,
            function_name,
            context,
          });
        }
      }
      Statement::Call { callee, arguments, return_type, return_collector } => {
        if let Some(c) = &return_collector {
          non_loop_invariant_variables.insert(c.clone());
        }
        inner_stmts.push(Statement::Call { callee, arguments, return_type, return_collector });
      }
      Statement::IfElse { condition, s1, s2, final_assignments } => {
        for (n, _, _, _) in &final_assignments {
          non_loop_invariant_variables.insert(n.clone());
        }
        inner_stmts.push(Statement::IfElse { condition, s1, s2, final_assignments });
      }
      Statement::SingleIf { .. } | Statement::Break(_) => {
        inner_stmts.push(stmt);
      }
      Statement::While { loop_variables, statements, break_collector } => {
        if let Some(v) = &break_collector {
          non_loop_invariant_variables.insert(v.name.clone());
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
    ast::hir::{
      Callee, Expression, FunctionName, GenenalLoopVariable, Operator, Statement, Type,
      VariableName, BOOL_TYPE, INT_TYPE, ONE, ZERO,
    },
    common::rcs,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let super::LoopInvariantCodeMotionOptimizationResult {
      hoisted_statements_before_while,
      optimized_while_statement: (loop_variables, inner_stmts, break_collector),
      non_loop_invariant_variables,
    } = super::optimize((
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
          name: rcs("x"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_x", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("y"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_y", INT_TYPE),
        },
        GenenalLoopVariable {
          name: rcs("z"),
          type_: INT_TYPE,
          initial_value: ZERO,
          loop_value: Expression::var_name("tmp_z", INT_TYPE),
        },
      ],
      vec![
        Statement::binary("cc", Operator::LT, Expression::var_name("i", INT_TYPE), ZERO),
        Statement::SingleIf {
          condition: Expression::var_name("cc", BOOL_TYPE),
          invert_condition: false,
          statements: vec![Statement::Break(ZERO)],
        },
        Statement::binary("tmp_i", Operator::PLUS, Expression::var_name("i", INT_TYPE), ONE),
        Statement::binary(
          "tmp_j",
          Operator::PLUS,
          Expression::var_name("j", INT_TYPE),
          Expression::int(3),
        ),
        Statement::binary(
          "tmp_x",
          Operator::MUL,
          Expression::var_name("i", INT_TYPE),
          Expression::int(5),
        ),
        Statement::binary(
          "tmp_y",
          Operator::PLUS,
          Expression::var_name("tmp_x", INT_TYPE),
          Expression::int(6),
        ),
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "f",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name("tmp_x", INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: None,
        },
        Statement::Call {
          callee: Callee::FunctionName(FunctionName::new(
            "f",
            Type::new_fn_unwrapped(vec![], INT_TYPE),
          )),
          arguments: vec![Expression::var_name("tmp_x", INT_TYPE)],
          return_type: INT_TYPE,
          return_collector: Some(rcs("fc")),
        },
        Statement::binary(
          "tmp_z",
          Operator::PLUS,
          Expression::var_name("tmp_x", INT_TYPE),
          Expression::var_name("tmp_y", INT_TYPE),
        ),
        Statement::binary(
          "c",
          Operator::MINUS,
          Expression::var_name("a", INT_TYPE),
          Expression::var_name("b", INT_TYPE),
        ),
        Statement::IndexedAccess {
          name: rcs("d"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("c", INT_TYPE),
          index: 0,
        },
        Statement::IndexedAccess {
          name: rcs("e"),
          type_: INT_TYPE,
          pointer_expression: Expression::var_name("x", INT_TYPE),
          index: 0,
        },
        Statement::binary(
          "f",
          Operator::PLUS,
          Expression::var_name("b", INT_TYPE),
          Expression::var_name("x", INT_TYPE),
        ),
        Statement::ClosureInit {
          closure_variable_name: rcs("g"),
          closure_type: Type::new_id_no_targs_unwrapped("I"),
          function_name: FunctionName::new("f", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: Expression::var_name("x", INT_TYPE),
        },
        Statement::ClosureInit {
          closure_variable_name: rcs("h"),
          closure_type: Type::new_id_no_targs_unwrapped("I"),
          function_name: FunctionName::new("f", Type::new_fn_unwrapped(vec![], INT_TYPE)),
          context: Expression::var_name("d", INT_TYPE),
        },
        Statement::StructInit {
          struct_variable_name: rcs("kk"),
          type_: Type::new_id_no_targs_unwrapped("I"),
          expression_list: vec![ZERO],
        },
        Statement::StructInit {
          struct_variable_name: rcs("kk2"),
          type_: Type::new_id_no_targs_unwrapped("I"),
          expression_list: vec![Expression::var_name("g", INT_TYPE)],
        },
        Statement::IfElse {
          condition: ZERO,
          s1: vec![],
          s2: vec![],
          final_assignments: vec![(rcs("bad"), INT_TYPE, ZERO, ZERO)],
        },
        Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
        Statement::While {
          loop_variables: vec![],
          statements: vec![],
          break_collector: Some(VariableName::new("zzzz", INT_TYPE)),
        },
      ],
      Some(VariableName::new("bc", INT_TYPE)),
    ));

    let optimized_stmts = hoisted_statements_before_while
      .into_iter()
      .chain(vec![Statement::While { loop_variables, statements: inner_stmts, break_collector }])
      .map(|s| s.debug_print())
      .join("\n");
    assert_eq!(
      r#"let c: int = (a: int) - (b: int);
let d: int = (c: int)[0];
let h: I = Closure { fun: (f: () -> int), context: (d: int) };
let kk: I = [0];
let i: int = 0;
let j: int = 0;
let x: int = 0;
let y: int = 0;
let z: int = 0;
let bc: int;
while (true) {
  let cc: bool = (i: int) < 0;
  if (cc: bool) {
    bc = 0;
    break;
  }
  let tmp_i: int = (i: int) + 1;
  let tmp_j: int = (j: int) + 3;
  let tmp_x: int = (i: int) * 5;
  let tmp_y: int = (tmp_x: int) + 6;
  f((tmp_x: int));
  let fc: int = f((tmp_x: int));
  let tmp_z: int = (tmp_x: int) + (tmp_y: int);
  let e: int = (x: int)[0];
  let f: int = (b: int) + (x: int);
  let g: I = Closure { fun: (f: () -> int), context: (x: int) };
  let kk2: I = [(g: int)];
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
        "bad", "cc", "e", "f", "fc", "g", "i", "j", "kk2", "tmp_i", "tmp_j", "tmp_x", "tmp_y",
        "tmp_z", "x", "y", "z", "zzzz",
      ],
      non_loop_invariant_variables.iter().map(|it| it.to_string()).sorted().collect_vec()
    );
  }
}
