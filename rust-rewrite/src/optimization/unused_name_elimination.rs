use crate::{
  ast::hir::{
    Binary, Callee, Expression, Function, FunctionName, GenenalLoopVariable, Sources, Statement,
    Type,
  },
  common::Str,
};
use itertools::Itertools;
use std::collections::{HashMap, HashSet};

fn collect_for_type_set(type_: &Type, type_set: &mut HashSet<Str>) {
  if let Type::Id(n) = type_ {
    type_set.insert(n.name.clone());
  }
}

fn collect_used_names_from_expression(
  name_set: &mut HashSet<Str>,
  type_set: &mut HashSet<Str>,
  expression: &Expression,
) {
  collect_for_type_set(&expression.type_(), type_set);
  match expression {
    Expression::IntLiteral(_, _) | Expression::Variable(_) => {}
    Expression::StringName(n)
    | Expression::FunctionName(FunctionName { name: n, type_: _, type_arguments: _ }) => {
      name_set.insert(n.clone());
    }
  }
}

fn collect_used_names_from_statement(
  name_set: &mut HashSet<Str>,
  type_set: &mut HashSet<Str>,
  statement: &Statement,
) {
  match statement {
    Statement::Binary(Binary { name: _, type_, operator: _, e1, e2 }) => {
      collect_used_names_from_expression(name_set, type_set, e1);
      collect_used_names_from_expression(name_set, type_set, e2);
      collect_for_type_set(type_, type_set);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      collect_used_names_from_expression(name_set, type_set, pointer_expression);
      collect_for_type_set(type_, type_set);
    }
    Statement::Call { callee, arguments, return_type, return_collector: _ } => {
      if let Callee::FunctionName(n) = callee {
        name_set.insert(n.name.clone());
      }
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
      if let Some(v) = break_collector {
        collect_for_type_set(&v.type_, type_set);
      }
    }
    Statement::StructInit { struct_variable_name: _, type_, expression_list } => {
      type_set.insert(type_.name.clone());
      for e in expression_list {
        collect_used_names_from_expression(name_set, type_set, e);
      }
    }
    Statement::ClosureInit { closure_variable_name: _, closure_type, function_name, context } => {
      name_set.insert(function_name.name.clone());
      collect_used_names_from_expression(name_set, type_set, context);
      type_set.insert(closure_type.name.clone());
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
  entry_points: &Vec<Str>,
) -> (HashSet<Str>, HashSet<Str>) {
  let mut used_functions_map = HashMap::new();
  for f in functions {
    used_functions_map.insert(f.name.clone(), get_other_functions_used_by_given_function(f));
  }

  let mut used_names: HashSet<_> = entry_points.iter().cloned().collect();
  let mut stack = entry_points.clone();
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

pub(super) fn optimize_sources(
  Sources { global_variables,closure_types, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let (used_names, used_types) =
    analyze_used_function_names_and_type_names(&functions, &main_function_names);
  Sources {
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_names.contains(&it.name))
      .collect_vec(),
    closure_types: closure_types
      .into_iter()
      .filter(|it| used_types.contains(&it.identifier))
      .collect_vec(),
    type_definitions: type_definitions
      .into_iter()
      .filter(|it| used_types.contains(&it.identifier))
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().filter(|it| used_names.contains(&it.name)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::{
      Callee, ClosureTypeDefinition, Expression, Function, FunctionName, GenenalLoopVariable,
      GlobalVariable, Sources, Statement, Type, TypeDefinition, VariableName, INT_TYPE, ZERO,
    },
    common::rcs,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let optimized = super::optimize_sources(Sources {
      global_variables: vec![
        GlobalVariable { name: rcs("bar"), content: rcs("fff") },
        GlobalVariable { name: rcs("fsdfsdf"), content: rcs("fff") },
      ],
      closure_types: vec![
        ClosureTypeDefinition {
          identifier: rcs("Foo"),
          type_parameters: vec![],
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
        ClosureTypeDefinition {
          identifier: rcs("Baz"),
          type_parameters: vec![],
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          is_object: true,
          identifier: rcs("Foo"),
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE],
        },
        TypeDefinition {
          is_object: true,
          identifier: rcs("Baz"),
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE],
        },
      ],
      main_function_names: vec![rcs("main")],
      functions: vec![
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              "foo",
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("foo"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: rcs(""),
              type_: Type::new_id_no_targs_unwrapped("Foo"),
              expression_list: vec![Expression::StringName(rcs("bar"))],
            },
            Statement::ClosureInit {
              closure_variable_name: rcs(""),
              closure_type: Type::new_id_no_targs_unwrapped("Foo"),
              function_name: (FunctionName::new("foo", Type::new_fn_unwrapped(vec![], INT_TYPE))),
              context: ZERO,
            },
            Statement::IndexedAccess {
              name: rcs(""),
              type_: INT_TYPE,
              pointer_expression: Expression::StringName(rcs("bar")),
              index: 0,
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                "baz",
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![Expression::StringName(rcs("haha"))],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::binary(
                "",
                crate::ast::hir::Operator::GE,
                Expression::StringName(rcs("foo")),
                Expression::StringName(rcs("bar")),
              )],
              s2: vec![Statement::binary(
                "",
                crate::ast::hir::Operator::GE,
                Expression::StringName(rcs("foo")),
                Expression::StringName(rcs("bar")),
              )],
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
              break_collector: Some(VariableName {
                name: rcs("d"),
                type_: Type::new_id_no_targs("A"),
              }),
            },
            Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          ],
          return_value: Expression::StringName(rcs("bar")),
        },
        Function {
          name: rcs("bar"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new("baz", INT_TYPE)),
            arguments: vec![Expression::fn_name("baz", Type::new_fn_unwrapped(vec![], INT_TYPE))],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: rcs("baz"),
          parameters: vec![],
          type_parameters: vec![],
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
      optimized.type_definitions.iter().map(|it| it.identifier.as_str()).collect_vec()
    );
    assert_eq!(
      vec!["main", "foo", "bar", "baz"],
      optimized.functions.iter().map(|it| it.name.as_str()).collect_vec()
    );
  }
}