use itertools::Itertools;
use samlang_ast::{
  lir::{Expression, Function, GenenalLoopVariable, Sources, Statement, Type},
  mir::{FunctionName, TypeNameId},
};
use samlang_heap::PStr;
use std::collections::{HashMap, HashSet};

fn collect_for_type_set(type_: &Type, type_set: &mut HashSet<TypeNameId>) {
  if let Type::Id(n) = type_ {
    type_set.insert(*n);
  }
}

fn collect_used_names_from_expression(
  str_name_set: &mut HashSet<PStr>,
  fn_name_set: &mut HashSet<FunctionName>,
  type_set: &mut HashSet<TypeNameId>,
  expression: &Expression,
) {
  match expression {
    Expression::Int32Literal(_) => {}
    Expression::Variable(_, t) => collect_for_type_set(t, type_set),
    Expression::StringName(n) => {
      str_name_set.insert(*n);
    }
    Expression::FnName(n, t) => {
      fn_name_set.insert(*n);
      type_set.insert(n.type_name);
      collect_for_type_set(t, type_set);
    }
  }
}

fn collect_used_names_from_statement(
  str_name_set: &mut HashSet<PStr>,
  fn_name_set: &mut HashSet<FunctionName>,
  type_set: &mut HashSet<TypeNameId>,
  statement: &Statement,
) {
  match statement {
    Statement::Unary { name: _, operator: _, operand } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, operand);
    }
    Statement::Binary { name: _, operator: _, e1, e2 } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e1);
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e2);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, pointer_expression);
      collect_for_type_set(type_, type_set);
    }
    Statement::IndexedAssign { assigned_expression, pointer_expression, index: _ } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, assigned_expression);
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, pointer_expression);
    }
    Statement::Call { callee, arguments, return_type, return_collector: _ } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, callee);
      for e in arguments {
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e);
      }
      collect_for_type_set(return_type, type_set);
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, condition);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, s1);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, s2);
      for (_, t, e1, e2) in final_assignments {
        collect_for_type_set(t, type_set);
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e1);
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e2);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, condition);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, statements);
    }
    Statement::Break(e) => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e)
    }
    Statement::While { loop_variables, statements, break_collector } => {
      for GenenalLoopVariable { name: _, type_, initial_value, loop_value } in loop_variables {
        collect_for_type_set(type_, type_set);
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, initial_value);
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, loop_value);
      }
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, statements);
      if let Some((_, t)) = break_collector {
        collect_for_type_set(t, type_set);
      }
    }
    Statement::LateInitDeclaration { name: _, type_ } => {
      collect_for_type_set(type_, type_set);
    }
    Statement::LateInitAssignment { name: _, assigned_expression } => {
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, assigned_expression);
    }
    Statement::Cast { name: _, type_, assigned_expression } => {
      collect_for_type_set(type_, type_set);
      collect_used_names_from_expression(str_name_set, fn_name_set, type_set, assigned_expression)
    }
    Statement::StructInit { struct_variable_name: _, type_, expression_list } => {
      collect_for_type_set(type_, type_set);
      for e in expression_list {
        collect_used_names_from_expression(str_name_set, fn_name_set, type_set, e);
      }
    }
  }
}

fn collect_used_names_from_statements(
  str_name_set: &mut HashSet<PStr>,
  fn_name_set: &mut HashSet<FunctionName>,
  type_set: &mut HashSet<TypeNameId>,
  statements: &Vec<Statement>,
) {
  for s in statements {
    collect_used_names_from_statement(str_name_set, fn_name_set, type_set, s);
  }
}

fn get_other_functions_used_by_given_function(
  function: &Function,
) -> (HashSet<PStr>, HashSet<FunctionName>, HashSet<TypeNameId>) {
  let mut str_name_set = HashSet::new();
  let mut fn_name_set = HashSet::new();
  let mut type_set = HashSet::new();
  collect_used_names_from_statements(
    &mut str_name_set,
    &mut fn_name_set,
    &mut type_set,
    &function.body,
  );
  for t in &function.type_.argument_types {
    collect_for_type_set(t, &mut type_set);
  }
  collect_for_type_set(&function.type_.return_type, &mut type_set);
  collect_used_names_from_expression(
    &mut str_name_set,
    &mut fn_name_set,
    &mut type_set,
    &function.return_value,
  );
  fn_name_set.remove(&function.name);
  (str_name_set, fn_name_set, type_set)
}

fn analyze_used_function_names_and_type_names(
  functions: &Vec<Function>,
  entry_points: &[FunctionName],
) -> (HashSet<PStr>, HashSet<FunctionName>, HashSet<TypeNameId>) {
  let mut used_functions_map = HashMap::new();
  for f in functions {
    used_functions_map.insert(f.name, get_other_functions_used_by_given_function(f));
  }

  let mut used_fn_names: HashSet<_> = entry_points.iter().cloned().collect();
  let mut used_str_names: HashSet<PStr> = HashSet::new();
  let mut stack = entry_points.iter().cloned().collect_vec();
  while let Some(fn_name) = stack.pop() {
    if let Some((str_used_by_this_function, fn_used_by_this_function, _)) =
      used_functions_map.get(&fn_name)
    {
      for used_fn in fn_used_by_this_function {
        if !used_fn_names.contains(used_fn) {
          used_fn_names.insert(*used_fn);
          stack.push(*used_fn);
        }
      }
      for used_str in str_used_by_this_function {
        if !used_str_names.contains(used_str) {
          used_str_names.insert(*used_str);
        }
      }
    }
  }

  let mut used_types = HashSet::new();
  for used_fn_name in &used_fn_names {
    if let Some((_, _, types)) = used_functions_map.get(used_fn_name) {
      for t in types {
        used_types.insert(*t);
      }
    }
  }

  (used_str_names, used_fn_names, used_types)
}

pub(super) fn optimize_lir_sources_by_eliminating_unused_ones(
  Sources { symbol_table,global_variables, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let (used_str_names, used_fn_names, used_types) =
    analyze_used_function_names_and_type_names(&functions, &main_function_names);
  Sources {
    symbol_table,
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_str_names.contains(&it.0))
      .collect_vec(),
    type_definitions: type_definitions
      .into_iter()
      .filter(|it| used_types.contains(&it.name))
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().filter(|it| used_fn_names.contains(&it.name)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir,
    lir::{
      Expression, Function, GenenalLoopVariable, Sources, Statement, Type, TypeDefinition,
      INT_32_TYPE, ZERO,
    },
    mir::{FunctionName, SymbolTable},
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let optimized = super::optimize_lir_sources_by_eliminating_unused_ones(Sources {
      global_variables: vec![
        hir::GlobalString(heap.alloc_str_for_test("bar")),
        hir::GlobalString(heap.alloc_str_for_test("fsdfsdf")),
      ],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: vec![INT_32_TYPE],
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Baz")),
          mappings: vec![INT_32_TYPE],
        },
      ],
      main_function_names: vec![FunctionName::new_for_test(PStr::MAIN_FN)],
      functions: vec![
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          body: vec![Statement::Call {
            callee: Expression::FnName(
              FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Foo"))),
            ),
            arguments: vec![],
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
          body: vec![
            Statement::Cast {
              name: PStr::LOWER_A,
              type_: INT_32_TYPE,
              assigned_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
            },
            Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_: INT_32_TYPE,
              expression_list: vec![Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
                INT_32_TYPE,
              )],
            },
            Statement::IndexedAccess {
              name: PStr::LOWER_A,
              type_: INT_32_TYPE,
              pointer_expression: Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
                INT_32_TYPE,
              ),
              index: 0,
            },
            Statement::IndexedAssign {
              assigned_expression: ZERO,
              pointer_expression: Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
                INT_32_TYPE,
              ),
              index: 0,
            },
            Statement::Call {
              callee: Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("baz")),
                INT_32_TYPE,
              ),
              arguments: vec![Expression::FnName(
                FunctionName::new_for_test(heap.alloc_str_for_test("haha")),
                INT_32_TYPE,
              )],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::Unary {
              name: PStr::LOWER_A,
              operator: hir::UnaryOperator::Not,
              operand: ZERO,
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::binary(
                PStr::LOWER_A,
                hir::BinaryOperator::GE,
                Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
                  INT_32_TYPE,
                ),
                Expression::FnName(
                  FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
                  INT_32_TYPE,
                ),
              )],
              s2: vec![Statement::Cast {
                name: PStr::LOWER_A,
                type_: INT_32_TYPE,
                assigned_expression: ZERO,
              }],
              final_assignments: vec![(heap.alloc_str_for_test("fff"), INT_32_TYPE, ZERO, ZERO)],
            },
            Statement::SingleIf {
              condition: ZERO,
              invert_condition: false,
              statements: vec![Statement::Break(ZERO)],
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: PStr::LOWER_F,
                type_: INT_32_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![],
              break_collector: Some((PStr::LOWER_D, INT_32_TYPE)),
            },
          ],
          return_value: Expression::FnName(
            FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
            INT_32_TYPE,
          ),
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          body: vec![Statement::Call {
            callee: Expression::StringName(heap.alloc_str_for_test("foo")),
            arguments: vec![],
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("baz")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          body: vec![],
          return_value: ZERO,
        },
      ],
      symbol_table: table,
    });

    assert_eq!(
      vec!["bar"],
      optimized.global_variables.iter().map(|it| it.0.as_str(heap)).collect_vec()
    );
    assert_eq!(
      vec!["_Foo"],
      optimized
        .type_definitions
        .iter()
        .map(|it| it.name.encoded_for_test(heap, &optimized.symbol_table))
        .collect_vec()
    );
    assert_eq!(
      vec!["__$main", "__$foo", "__$bar", "__$baz"],
      optimized
        .functions
        .iter()
        .map(|it| it.name.encoded_for_test(heap, &optimized.symbol_table))
        .collect_vec()
    );
  }
}
