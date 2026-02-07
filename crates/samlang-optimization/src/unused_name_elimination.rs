use itertools::Itertools;
use samlang_ast::mir::{
  Binary, Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function, FunctionName,
  GenenalLoopVariable, IfElseFinalAssignment, Sources, Statement, Type, TypeDefinition,
  TypeDefinitionMappings, TypeNameId,
};
use samlang_heap::PStr;
use std::collections::{HashMap, HashSet};

fn collect_for_type_set(type_: &Type, type_set: &mut HashSet<TypeNameId>) {
  if let Type::Id(n) = type_ {
    type_set.insert(*n);
  }
}

fn collect_types_for_type_set(types: &[Type], type_set: &mut HashSet<TypeNameId>) {
  for t in types {
    collect_for_type_set(t, type_set);
  }
}

fn collect_used_names_from_expression(
  str_name_set: &mut HashSet<PStr>,
  type_set: &mut HashSet<TypeNameId>,
  expression: &Expression,
) {
  match expression {
    Expression::Int32Literal(_) | Expression::Int31Literal(_) => {}
    Expression::Variable(v) => {
      collect_for_type_set(&v.type_, type_set);
    }
    Expression::StringName(n) => {
      str_name_set.insert(*n);
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
    Statement::IsPointer { name: _, pointer_type, operand } => {
      type_set.insert(*pointer_type);
      collect_used_names_from_expression(str_name_set, type_set, operand);
    }
    Statement::Not { name: _, operand } => {
      collect_used_names_from_expression(str_name_set, type_set, operand);
    }
    Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
      collect_used_names_from_expression(str_name_set, type_set, e1);
      collect_used_names_from_expression(str_name_set, type_set, e2);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      collect_used_names_from_expression(str_name_set, type_set, pointer_expression);
      collect_for_type_set(type_, type_set);
    }
    Statement::Call { callee, arguments, return_type, return_collector: _ } => {
      match callee {
        Callee::FunctionName(n) => {
          fn_name_set.insert(n.name);
          type_set.insert(n.name.type_name);
        }
        Callee::Variable(v) => collect_for_type_set(&v.type_, type_set),
      }
      for e in arguments {
        collect_used_names_from_expression(str_name_set, type_set, e);
      }
      collect_for_type_set(return_type, type_set);
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      collect_used_names_from_expression(str_name_set, type_set, condition);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, s1);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, s2);
      for IfElseFinalAssignment { name: _, type_, e1, e2 } in final_assignments {
        collect_for_type_set(type_, type_set);
        collect_used_names_from_expression(str_name_set, type_set, e1);
        collect_used_names_from_expression(str_name_set, type_set, e2);
      }
    }
    Statement::SingleIf { condition, invert_condition: _, statements } => {
      collect_used_names_from_expression(str_name_set, type_set, condition);
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, statements);
    }
    Statement::Break(e) => collect_used_names_from_expression(str_name_set, type_set, e),
    Statement::While { loop_variables, statements, break_collector } => {
      for GenenalLoopVariable { name: _, type_, initial_value, loop_value } in loop_variables {
        collect_for_type_set(type_, type_set);
        collect_used_names_from_expression(str_name_set, type_set, initial_value);
        collect_used_names_from_expression(str_name_set, type_set, loop_value);
      }
      collect_used_names_from_statements(str_name_set, fn_name_set, type_set, statements);
      if let Some(v) = break_collector {
        collect_for_type_set(&v.type_, type_set);
      }
    }
    Statement::Cast { name: _, type_, assigned_expression } => {
      collect_for_type_set(type_, type_set);
      collect_used_names_from_expression(str_name_set, type_set, assigned_expression);
    }
    Statement::LateInitDeclaration { name: _, type_: _ } => {}
    Statement::LateInitAssignment { name: _, assigned_expression } => {
      collect_used_names_from_expression(str_name_set, type_set, assigned_expression);
    }
    Statement::StructInit { struct_variable_name: _, type_name, expression_list } => {
      type_set.insert(*type_name);
      for e in expression_list {
        collect_used_names_from_expression(str_name_set, type_set, e);
      }
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name,
      function_name,
      context,
    } => {
      fn_name_set.insert(function_name.name);
      type_set.insert(function_name.name.type_name);
      collect_used_names_from_expression(str_name_set, type_set, context);
      type_set.insert(*closure_type_name);
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
  let mut name_set = HashSet::new();
  let mut fn_name_set = HashSet::new();
  let mut type_set = HashSet::new();
  collect_used_names_from_statements(
    &mut name_set,
    &mut fn_name_set,
    &mut type_set,
    &function.body,
  );
  collect_types_for_type_set(&function.type_.argument_types, &mut type_set);
  collect_for_type_set(&function.type_.return_type, &mut type_set);
  collect_used_names_from_expression(&mut name_set, &mut type_set, &function.return_value);
  fn_name_set.remove(&function.name);
  (name_set, fn_name_set, type_set)
}

fn analyze_all_used_names(
  functions: &Vec<Function>,
  closure_types: &[ClosureTypeDefinition],
  type_definitions: &[TypeDefinition],
  entry_points: &[FunctionName],
) -> (HashSet<PStr>, HashSet<FunctionName>, HashSet<TypeNameId>) {
  let mut used_functions_map = HashMap::new();
  for f in functions {
    used_functions_map.insert(f.name, get_other_functions_used_by_given_function(f));
  }
  let mut type_def_map = HashMap::new();
  for d in closure_types {
    let mut type_set = HashSet::new();
    collect_types_for_type_set(&d.function_type.argument_types, &mut type_set);
    collect_for_type_set(&d.function_type.return_type, &mut type_set);
    type_def_map.insert(d.name, type_set);
  }
  for d in type_definitions {
    let mut type_set = HashSet::new();
    match &d.mappings {
      TypeDefinitionMappings::Struct(ts) => {
        collect_types_for_type_set(ts, &mut type_set);
      }
      TypeDefinitionMappings::Enum(variants) => {
        for variant in variants {
          match variant {
            EnumTypeDefinition::Boxed(ts) => {
              collect_types_for_type_set(ts, &mut type_set);
            }
            EnumTypeDefinition::Unboxed(t) => {
              type_set.insert(*t);
            }
            EnumTypeDefinition::Int31 => {}
          }
        }
      }
    }
    type_def_map.insert(d.name, type_set);
  }

  let mut used_fn_names: HashSet<_> = entry_points.iter().cloned().collect();
  let mut used_str_names: HashSet<PStr> = HashSet::new();
  let mut stack = entry_points.iter().cloned().collect_vec();
  while let Some(fn_name) = stack.pop() {
    if let Some((str_used_by_this_function, fn_used_by_this_function, _)) =
      used_functions_map.get(&fn_name)
    {
      for used_fn in fn_used_by_this_function {
        if used_fn_names.insert(*used_fn) {
          stack.push(*used_fn);
        }
      }
      for used_str in str_used_by_this_function {
        used_str_names.insert(*used_str);
      }
    }
  }

  let mut used_types = HashSet::new();
  let mut used_types_worklist_stack = Vec::new();
  for (_, _, types) in
    used_fn_names.iter().filter_map(|used_fn_name| used_functions_map.get(used_fn_name))
  {
    for t in types {
      used_types_worklist_stack.push(*t);
      if let Some(more_used_types) = type_def_map.get(t) {
        used_types_worklist_stack.append(&mut more_used_types.iter().copied().collect())
      }
    }
  }
  while let Some(additional_used_type) = used_types_worklist_stack.pop() {
    if used_types.insert(additional_used_type) {
      for t in type_def_map.get(&additional_used_type).into_iter().flatten() {
        used_types_worklist_stack.push(*t);
      }
    }
  }

  (used_str_names, used_fn_names, used_types)
}

pub(super) fn optimize_sources(sources: &mut Sources) {
  let (used_str_names, used_fn_names, mut used_types) = analyze_all_used_names(
    &sources.functions,
    &sources.closure_types,
    &sources.type_definitions,
    &sources.main_function_names,
  );
  // When a subtype is used, ensure its parent type is also marked as used.
  // This is necessary because subtypes are created in LIR lowering from parent enum definitions.
  // If the parent is eliminated here, the subtype definition won't be created.
  let mut parent_types_to_add = Vec::new();
  for type_id in &used_types {
    if let Some(parent_id) = sources.symbol_table.get_parent_type_if_subtype(*type_id) {
      parent_types_to_add.push(parent_id);
    }
  }
  for parent_id in parent_types_to_add {
    used_types.insert(parent_id);
  }
  sources.global_variables.retain(|it| used_str_names.contains(&it.0));
  sources.closure_types.retain(|it| used_types.contains(&it.name));
  sources.type_definitions.retain(|it| used_types.contains(&it.name));
  sources.functions.retain(|it| used_fn_names.contains(&it.name));
}

#[cfg(test)]
mod tests {
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir::GlobalString,
    mir::{
      Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function, FunctionName,
      FunctionNameExpression, GenenalLoopVariable, INT_32_TYPE, IfElseFinalAssignment, Sources,
      Statement, SymbolTable, Type, TypeDefinition, TypeDefinitionMappings, TypeNameId,
      VariableName, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn integration_test() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let mut sources = Sources {
      global_variables: vec![
        GlobalString(heap.alloc_str_for_test("bar")),
        GlobalString(heap.alloc_str_for_test("fsdfsdf")),
      ],
      closure_types: vec![
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          function_type: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Baz")),
          function_type: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("RefByType")),
          function_type: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
          mappings: TypeDefinitionMappings::Struct(vec![
            INT_32_TYPE,
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Foo"))),
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Bar"))),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Bar")),
          mappings: TypeDefinitionMappings::Struct(vec![Type::Id(
            table.create_type_name_for_test(heap.alloc_str_for_test("RefByType")),
          )]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Baz")),
          mappings: TypeDefinitionMappings::Struct(vec![INT_32_TYPE]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Baz")),
          mappings: TypeDefinitionMappings::Enum(vec![
            EnumTypeDefinition::Int31,
            EnumTypeDefinition::Unboxed(TypeNameId::STR),
            EnumTypeDefinition::Boxed(vec![INT_32_TYPE]),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("RefByType")),
          mappings: TypeDefinitionMappings::Struct(vec![Type::Id(
            table.create_type_name_for_test(heap.alloc_str_for_test("RefByType2")),
          )]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("RefByType2")),
          mappings: TypeDefinitionMappings::Struct(vec![Type::Id(
            table.create_type_name_for_test(heap.alloc_str_for_test("RefByType3")),
          )]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("RefByType3")),
          mappings: TypeDefinitionMappings::Struct(Vec::new()),
        },
      ],
      main_function_names: vec![
        FunctionName::new_for_test(PStr::MAIN_FN),
        FunctionName::new_for_test(heap.alloc_str_for_test("dddddd")),
      ],
      functions: vec![
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionNameExpression {
              name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
              type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
            }),
            arguments: Vec::new(),
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
          body: vec![
            Statement::StructInit {
              struct_variable_name: PStr::LOWER_A,
              type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
              expression_list: vec![Expression::StringName(heap.alloc_str_for_test("bar"))],
            },
            Statement::ClosureInit {
              closure_variable_name: PStr::LOWER_A,
              closure_type_name: table.create_type_name_for_test(heap.alloc_str_for_test("Foo")),
              function_name: (FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("foo")),
                type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
              }),
              context: ZERO,
            },
            Statement::IndexedAccess {
              name: PStr::LOWER_A,
              type_: INT_32_TYPE,
              pointer_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
              index: 0,
            },
            Statement::Cast {
              name: PStr::LOWER_A,
              type_: INT_32_TYPE,
              assigned_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
            },
            Statement::LateInitDeclaration { name: PStr::LOWER_A, type_: INT_32_TYPE },
            Statement::LateInitAssignment {
              name: PStr::LOWER_A,
              assigned_expression: Expression::StringName(heap.alloc_str_for_test("bar")),
            },
            Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("baz")),
                type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
              }),
              arguments: vec![Expression::StringName(heap.alloc_str_for_test("haha"))],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName::new(
                heap.alloc_str_for_test("baz"),
                INT_32_TYPE,
              )),
              arguments: vec![Expression::StringName(heap.alloc_str_for_test("haha"))],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::Not { name: PStr::LOWER_A, operand: ZERO },
            Statement::IsPointer {
              name: PStr::LOWER_A,
              pointer_type: TypeNameId::STR,
              operand: ZERO,
            },
            Statement::IfElse {
              condition: ZERO,
              s1: vec![Statement::binary(
                PStr::LOWER_A,
                samlang_ast::hir::BinaryOperator::GE,
                Expression::StringName(heap.alloc_str_for_test("foo")),
                Expression::StringName(heap.alloc_str_for_test("bar")),
              )],
              s2: vec![Statement::binary(
                PStr::LOWER_A,
                samlang_ast::hir::BinaryOperator::GE,
                Expression::StringName(heap.alloc_str_for_test("foo")),
                Expression::StringName(heap.alloc_str_for_test("bar")),
              )],
              final_assignments: vec![IfElseFinalAssignment {
                name: heap.alloc_str_for_test("fff"),
                type_: INT_32_TYPE,
                e1: ZERO,
                e2: ZERO,
              }],
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
              statements: Vec::new(),
              break_collector: Some(VariableName {
                name: PStr::LOWER_D,
                type_: Type::Id(table.create_type_name_for_test(PStr::UPPER_A)),
              }),
            },
            Statement::While {
              loop_variables: Vec::new(),
              statements: Vec::new(),
              break_collector: None,
            },
          ],
          return_value: Expression::StringName(heap.alloc_str_for_test("bar")),
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("bar")),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: vec![Statement::Call {
            callee: Callee::Variable(VariableName::new(
              heap.alloc_str_for_test("baz"),
              INT_32_TYPE,
            )),
            arguments: vec![Expression::var_name(heap.alloc_str_for_test("baz"), INT_32_TYPE)],
            return_type: INT_32_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("baz")),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: Vec::new(),
          return_value: ZERO,
        },
      ],
      symbol_table: table,
    };
    super::optimize_sources(&mut sources);

    assert_eq!(
      vec!["bar"],
      sources.global_variables.iter().map(|it| it.0.as_str(heap)).collect_vec()
    );
    assert_eq!(
      vec!["_Foo", "_Bar", "_RefByType", "_RefByType2", "_RefByType3"],
      sources
        .type_definitions
        .iter()
        .map(|it| it.name.encoded_for_test(heap, &sources.symbol_table))
        .collect_vec()
    );
    assert_eq!(
      vec!["_Foo", "_RefByType"],
      sources
        .closure_types
        .iter()
        .map(|it| it.name.encoded_for_test(heap, &sources.symbol_table))
        .collect_vec()
    );
    assert_eq!(
      vec!["__$main", "__$foo", "__$baz"],
      sources
        .functions
        .iter()
        .map(|it| it.name.encoded_for_test(heap, &sources.symbol_table))
        .collect_vec()
    );
  }
}
