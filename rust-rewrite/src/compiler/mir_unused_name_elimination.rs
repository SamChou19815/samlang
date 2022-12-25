use crate::{
  ast::mir::{Expression, Function, GenenalLoopVariable, Sources, Statement, Type},
  common::Str,
};
use itertools::Itertools;
use std::collections::{HashMap, HashSet};

fn collect_for_type_set(type_: &Type, type_set: &mut HashSet<Str>) {
  if let Type::Id(n) = type_ {
    type_set.insert(n.clone());
  }
}

fn collect_used_names_from_expression(
  name_set: &mut HashSet<Str>,
  type_set: &mut HashSet<Str>,
  expression: &Expression,
) {
  if let Expression::Name(n, _) = expression {
    name_set.insert(n.clone());
  }
  collect_for_type_set(expression.type_(), type_set);
}

fn collect_used_names_from_statement(
  name_set: &mut HashSet<Str>,
  type_set: &mut HashSet<Str>,
  statement: &Statement,
) {
  match statement {
    Statement::Binary { name: _, type_, operator: _, e1, e2 } => {
      collect_used_names_from_expression(name_set, type_set, e1);
      collect_used_names_from_expression(name_set, type_set, e2);
      collect_for_type_set(type_, type_set);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      collect_used_names_from_expression(name_set, type_set, pointer_expression);
      collect_for_type_set(type_, type_set);
    }
    Statement::IndexedAssign { assigned_expression, pointer_expression, index: _ } => {
      collect_used_names_from_expression(name_set, type_set, assigned_expression);
      collect_used_names_from_expression(name_set, type_set, pointer_expression);
    }
    Statement::Call { callee, arguments, return_type, return_collector: _ } => {
      collect_used_names_from_expression(name_set, type_set, callee);
      for e in arguments {
        collect_used_names_from_expression(name_set, type_set, e);
      }
      collect_for_type_set(return_type, type_set);
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      collect_used_names_from_expression(name_set, type_set, condition);
      collect_used_names_from_statements(name_set, type_set, s1);
      collect_used_names_from_statements(name_set, type_set, s2);
      for (_, t, e1, e2) in final_assignments {
        collect_for_type_set(t, type_set);
        collect_used_names_from_expression(name_set, type_set, e1);
        collect_used_names_from_expression(name_set, type_set, e2);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      collect_used_names_from_expression(name_set, type_set, condition);
      collect_used_names_from_statements(name_set, type_set, statements);
    }
    Statement::Break(e) => collect_used_names_from_expression(name_set, type_set, e),
    Statement::While { loop_variables, statements, break_collector } => {
      for GenenalLoopVariable { name: _, type_, initial_value, loop_value } in loop_variables {
        collect_for_type_set(type_, type_set);
        collect_used_names_from_expression(name_set, type_set, initial_value);
        collect_used_names_from_expression(name_set, type_set, loop_value);
      }
      collect_used_names_from_statements(name_set, type_set, statements);
      if let Some((_, t)) = break_collector {
        collect_for_type_set(t, type_set);
      }
    }
    Statement::Cast { name: _, type_, assigned_expression } => {
      collect_for_type_set(type_, type_set);
      collect_used_names_from_expression(name_set, type_set, assigned_expression)
    }
    Statement::StructInit { struct_variable_name: _, type_, expression_list } => {
      collect_for_type_set(type_, type_set);
      for e in expression_list {
        collect_used_names_from_expression(name_set, type_set, e);
      }
    }
  }
}

fn collect_used_names_from_statements(
  name_set: &mut HashSet<Str>,
  type_set: &mut HashSet<Str>,
  statements: &Vec<Statement>,
) {
  for s in statements {
    collect_used_names_from_statement(name_set, type_set, s);
  }
}

fn get_other_functions_used_by_given_function(function: &Function) -> (HashSet<Str>, HashSet<Str>) {
  let mut name_set = HashSet::new();
  let mut type_set = HashSet::new();
  collect_used_names_from_statements(&mut name_set, &mut type_set, &function.body);
  for t in &function.type_.argument_types {
    collect_for_type_set(t, &mut type_set);
  }
  collect_for_type_set(&function.type_.return_type, &mut type_set);
  collect_used_names_from_expression(&mut name_set, &mut type_set, &function.return_value);
  name_set.remove(&function.name);
  (name_set, type_set)
}

fn analyze_used_function_names_and_type_names(
  functions: &Vec<Function>,
  entry_points: &[Str],
) -> (HashSet<Str>, HashSet<Str>) {
  let mut used_functions_map = HashMap::new();
  for f in functions {
    used_functions_map.insert(f.name.clone(), get_other_functions_used_by_given_function(f));
  }

  let mut used_names: HashSet<_> = entry_points.iter().cloned().collect();
  let mut stack = entry_points.iter().cloned().collect_vec();
  while !stack.is_empty() {
    let fn_name = stack.pop().unwrap();
    if let Some((used_by_this_function, _)) = used_functions_map.get(&fn_name) {
      for used_fn in used_by_this_function {
        if !used_names.contains(used_fn) {
          used_names.insert(used_fn.clone());
          stack.push(used_fn.clone());
        }
      }
    }
  }

  let mut used_types = HashSet::new();
  for used_name in &used_names {
    if let Some((_, types)) = used_functions_map.get(used_name) {
      for t in types {
        used_types.insert(t.clone());
      }
    }
  }

  (used_names, used_types)
}

pub(super) fn optimize_mir_sources_by_eliminating_unused_ones(
  Sources { global_variables, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let (used_names, used_types) =
    analyze_used_function_names_and_type_names(&functions, &main_function_names);
  Sources {
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_names.contains(&it.name))
      .collect_vec(),
    type_definitions: type_definitions
      .into_iter()
      .filter(|it| used_types.contains(&it.name))
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().filter(|it| used_names.contains(&it.name)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      hir::GlobalVariable,
      mir::{
        Expression, Function, GenenalLoopVariable, Sources, Statement, Type, TypeDefinition,
        INT_TYPE, ZERO,
      },
    },
    common::rcs,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let optimized = super::optimize_mir_sources_by_eliminating_unused_ones(Sources {
      global_variables: vec![
        GlobalVariable { name: rcs("bar"), content: rcs("fff") },
        GlobalVariable { name: rcs("fsdfsdf"), content: rcs("fff") },
      ],
      type_definitions: vec![
        TypeDefinition { name: rcs("Foo"), mappings: vec![INT_TYPE] },
        TypeDefinition { name: rcs("Baz"), mappings: vec![INT_TYPE] },
      ],
      main_function_names: vec![rcs("main")],
      functions: vec![
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Expression::Name(rcs("foo"), Type::Id(rcs("Foo"))),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("foo"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::Cast {
              name: rcs(""),
              type_: INT_TYPE,
              assigned_expression: Expression::Name(rcs("bar"), INT_TYPE),
            },
            Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: INT_TYPE,
              expression_list: vec![Expression::Name(rcs("bar"), INT_TYPE)],
            },
            Statement::IndexedAccess {
              name: rcs(""),
              type_: INT_TYPE,
              pointer_expression: Expression::Name(rcs("bar"), INT_TYPE),
              index: 0,
            },
            Statement::IndexedAssign {
              assigned_expression: ZERO,
              pointer_expression: Expression::Name(rcs("bar"), INT_TYPE),
              index: 0,
            },
            Statement::Call {
              callee: Expression::Name(rcs("baz"), INT_TYPE),
              arguments: vec![Expression::Name(rcs("haha"), INT_TYPE)],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::binary(
                "",
                crate::ast::hir::Operator::GE,
                Expression::Name(rcs("foo"), INT_TYPE),
                Expression::Name(rcs("bar"), INT_TYPE),
              )],
              s2: vec![Statement::Cast {
                name: rcs(""),
                type_: INT_TYPE,
                assigned_expression: ZERO,
              }],
              final_assignments: vec![(rcs("fff"), INT_TYPE, ZERO, ZERO)],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)],
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: rcs("f"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![],
              break_collector: Some((rcs("d"), INT_TYPE)),
            },
          ],
          return_value: Expression::Name(rcs("bar"), INT_TYPE),
        },
        Function {
          name: rcs("bar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Expression::Name(rcs("foo"), INT_TYPE),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("baz"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![],
          return_value: ZERO,
        },
      ],
    });

    assert_eq!(
      vec!["bar"],
      optimized.global_variables.iter().map(|it| it.name.as_str()).collect_vec()
    );
    assert_eq!(
      vec!["Foo"],
      optimized.type_definitions.iter().map(|it| it.name.as_str()).collect_vec()
    );
    assert_eq!(
      vec!["main", "foo", "bar", "baz"],
      optimized.functions.iter().map(|it| it.name.as_str()).collect_vec()
    );
  }
}
