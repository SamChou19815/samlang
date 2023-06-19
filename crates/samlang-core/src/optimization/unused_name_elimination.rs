use crate::{
  ast::mir::{
    Binary, Callee, ClosureTypeDefinition, Expression, Function, GenenalLoopVariable, Sources,
    Statement, Type, TypeDefinition, TypeDefinitionMappings,
  },
  common::PStr,
};
use itertools::Itertools;
use std::collections::{HashMap, HashSet};

fn collect_for_type_set(type_: &Type, type_set: &mut HashSet<PStr>) {
  if let Type::Id(n) = type_ {
    type_set.insert(*n);
  }
}

fn collect_used_names_from_expression(
  name_set: &mut HashSet<PStr>,
  type_set: &mut HashSet<PStr>,
  expression: &Expression,
) {
  match expression {
    Expression::IntLiteral(_) => {}
    Expression::Variable(v) => {
      collect_for_type_set(&v.type_, type_set);
    }
    Expression::StringName(n) => {
      name_set.insert(*n);
    }
  }
}

fn collect_used_names_from_statement(
  name_set: &mut HashSet<PStr>,
  type_set: &mut HashSet<PStr>,
  statement: &Statement,
) {
  match statement {
    Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
      collect_used_names_from_expression(name_set, type_set, e1);
      collect_used_names_from_expression(name_set, type_set, e2);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      collect_used_names_from_expression(name_set, type_set, pointer_expression);
      collect_for_type_set(type_, type_set);
    }
    Statement::Call { callee, arguments, return_type, return_collector: _ } => {
      match callee {
        Callee::FunctionName(n) => {
          name_set.insert(n.name);
        }
        Callee::Variable(v) => collect_for_type_set(&v.type_, type_set),
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
    Statement::Cast { name: _, type_, assigned_expression } => {
      collect_for_type_set(type_, type_set);
      collect_used_names_from_expression(name_set, type_set, assigned_expression);
    }
    Statement::StructInit { struct_variable_name: _, type_name, expression_list } => {
      type_set.insert(*type_name);
      for e in expression_list {
        collect_used_names_from_expression(name_set, type_set, e);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name,
      function_name,
      context,
    } => {
      name_set.insert(function_name.name);
      collect_used_names_from_expression(name_set, type_set, context);
      type_set.insert(*closure_type_name);
    }
  }
}

fn collect_used_names_from_statements(
  name_set: &mut HashSet<PStr>,
  type_set: &mut HashSet<PStr>,
  statements: &Vec<Statement>,
) {
  for s in statements {
    collect_used_names_from_statement(name_set, type_set, s);
  }
}

fn get_other_functions_used_by_given_function(
  function: &Function,
) -> (HashSet<PStr>, HashSet<PStr>) {
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
  closure_types: &[ClosureTypeDefinition],
  type_definitions: &[TypeDefinition],
  entry_points: &[PStr],
) -> (HashSet<PStr>, HashSet<PStr>) {
  let mut used_functions_map = HashMap::new();
  for f in functions {
    used_functions_map.insert(f.name, get_other_functions_used_by_given_function(f));
  }
  let mut type_def_map = HashMap::new();
  for d in closure_types {
    let mut type_set = HashSet::new();
    for t in &d.function_type.argument_types {
      collect_for_type_set(t, &mut type_set);
    }
    collect_for_type_set(&d.function_type.return_type, &mut type_set);
    type_def_map.insert(d.identifier, type_set);
  }
  for d in type_definitions {
    let mut type_set = HashSet::new();
    match &d.mappings {
      TypeDefinitionMappings::Struct(ts) => {
        for t in ts {
          collect_for_type_set(t, &mut type_set);
        }
      }
      TypeDefinitionMappings::Enum => {}
    }
    type_def_map.insert(d.identifier, type_set);
  }

  let mut used_names: HashSet<_> = entry_points.iter().cloned().collect();
  let mut stack = entry_points.iter().cloned().collect_vec();
  while !stack.is_empty() {
    let fn_name = stack.pop().unwrap();
    if let Some((used_by_this_function, _)) = used_functions_map.get(&fn_name) {
      for used_fn in used_by_this_function {
        if !used_names.contains(used_fn) {
          used_names.insert(*used_fn);
          stack.push(*used_fn);
        }
      }
    }
  }

  let mut used_types = HashSet::new();
  let mut used_types_worklist_stack = vec![];
  for used_name in &used_names {
    if let Some((_, types)) = used_functions_map.get(used_name) {
      for t in types {
        if let Some(more_used_types) = type_def_map.get(t) {
          used_types_worklist_stack.append(&mut more_used_types.iter().cloned().collect())
        }
        used_types.insert(*t);
      }
    }
  }
  while let Some(additional_used_type) = used_types_worklist_stack.pop() {
    if !used_types.contains(&additional_used_type) {
      used_types.insert(additional_used_type);
      for t in type_def_map.get(&additional_used_type).into_iter().flatten() {
        used_types_worklist_stack.push(*t);
      }
    }
  }

  (used_names, used_types)
}

pub(super) fn optimize_sources(sources: &mut Sources) {
  let (used_names, used_types) = analyze_used_function_names_and_type_names(
    &sources.functions,
    &sources.closure_types,
    &sources.type_definitions,
    &sources.main_function_names,
  );
  sources.global_variables.retain(|it| used_names.contains(&it.name));
  sources.closure_types.retain(|it| used_types.contains(&it.identifier));
  sources.type_definitions.retain(|it| used_types.contains(&it.identifier));
  sources.functions.retain(|it| used_names.contains(&it.name));
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::hir::GlobalVariable,
    ast::mir::{
      Callee, ClosureTypeDefinition, Expression, Function, FunctionName, GenenalLoopVariable,
      Sources, Statement, Type, TypeDefinition, TypeDefinitionMappings, VariableName, INT_TYPE,
      ZERO,
    },
    common::well_known_pstrs,
    Heap,
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let mut sources = Sources {
      global_variables: vec![
        GlobalVariable {
          name: heap.alloc_str_for_test("bar"),
          content: heap.alloc_str_for_test("fff"),
        },
        GlobalVariable {
          name: heap.alloc_str_for_test("fsdfsdf"),
          content: heap.alloc_str_for_test("fff"),
        },
      ],
      closure_types: vec![
        ClosureTypeDefinition {
          identifier: heap.alloc_str_for_test("Foo"),
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
        ClosureTypeDefinition {
          identifier: heap.alloc_str_for_test("Baz"),
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Foo"),
          mappings: TypeDefinitionMappings::Struct(vec![
            INT_TYPE,
            Type::Id(heap.alloc_str_for_test("Foo")),
            Type::Id(heap.alloc_str_for_test("Bar")),
          ]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Bar"),
          mappings: TypeDefinitionMappings::Struct(vec![Type::Id(heap.alloc_str_for_test("Bar"))]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Baz"),
          mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Baz"),
          mappings: TypeDefinitionMappings::Enum,
        },
      ],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("foo"),
              Type::new_fn_unwrapped(vec![], INT_TYPE),
            )),
            arguments: vec![],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("foo"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: well_known_pstrs::LOWER_A,
              type_name: heap.alloc_str_for_test("Foo"),
              expression_list: vec![Expression::StringName(heap.alloc_str_for_test("bar"))],
            },
            Statement::ClosureInit {
              closure_variable_name: well_known_pstrs::LOWER_A,
              closure_type_name: heap.alloc_str_for_test("Foo"),
              function_name: (FunctionName::new(
                heap.alloc_str_for_test("foo"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              context: ZERO,
            },
            Statement::IndexedAccess {
              name: well_known_pstrs::LOWER_A,
              type_: INT_TYPE,
              pointer_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
              index: 0,
            },
            Statement::Cast {
              name: well_known_pstrs::LOWER_A,
              type_: INT_TYPE,
              assigned_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("baz"),
                Type::new_fn_unwrapped(vec![], INT_TYPE),
              )),
              arguments: vec![Expression::StringName(heap.alloc_str_for_test("haha"))],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("baz"), INT_TYPE)),
              arguments: vec![Expression::StringName(heap.alloc_str_for_test("haha"))],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::binary(
                well_known_pstrs::LOWER_A,
                crate::ast::hir::Operator::GE,
                Expression::StringName(heap.alloc_str_for_test("foo")),
                Expression::StringName(heap.alloc_str_for_test("bar")),
              )],
              s2: vec![Statement::binary(
                well_known_pstrs::LOWER_A,
                crate::ast::hir::Operator::GE,
                Expression::StringName(heap.alloc_str_for_test("foo")),
                Expression::StringName(heap.alloc_str_for_test("bar")),
              )],
              final_assignments: vec![(heap.alloc_str_for_test("fff"), INT_TYPE, ZERO, ZERO)],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)],
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: well_known_pstrs::LOWER_F,
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![],
              break_collector: Some(VariableName {
                name: well_known_pstrs::LOWER_D,
                type_: Type::Id(well_known_pstrs::UPPER_A),
              }),
            },
            Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
          ],
          return_value: Expression::StringName(heap.alloc_str_for_test("bar")),
        },
        Function {
          name: heap.alloc_str_for_test("bar"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(heap.alloc_str_for_test("baz"), INT_TYPE)),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("baz"), INT_TYPE)],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("baz"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![],
          return_value: ZERO,
        },
      ],
    };
    super::optimize_sources(&mut sources);

    assert_eq!(
      vec!["bar"],
      sources.global_variables.iter().map(|it| it.name.as_str(heap)).collect_vec()
    );
    assert_eq!(
      vec!["Foo", "Bar"],
      sources.type_definitions.iter().map(|it| it.identifier.as_str(heap)).collect_vec()
    );
    assert_eq!(
      vec!["main", "foo", "bar", "baz"],
      sources.functions.iter().map(|it| it.name.as_str(heap)).collect_vec()
    );
  }
}
