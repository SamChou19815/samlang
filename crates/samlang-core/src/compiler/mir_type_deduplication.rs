use crate::{
  ast::mir::{
    Binary, Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function, FunctionName,
    FunctionType, Sources, Statement, Type, TypeDefinition, TypeDefinitionMappings, VariableName,
  },
  common::PStr,
};
use itertools::Itertools;
use std::collections::HashMap;

type State = HashMap<PStr, PStr>;

fn rewrite_id_type_name(state: &State, id: PStr) -> PStr {
  if let Some(n) = state.get(&id) {
    *n
  } else {
    id
  }
}

fn rewrite_type(state: &State, type_: Type) -> Type {
  match type_ {
    Type::Int => Type::Int,
    Type::Id(id) => Type::Id(rewrite_id_type_name(state, id)),
  }
}

fn rewrite_fn_type(
  state: &State,
  FunctionType { argument_types, return_type }: FunctionType,
) -> FunctionType {
  FunctionType {
    argument_types: argument_types.into_iter().map(|t| rewrite_type(state, t)).collect_vec(),
    return_type: Box::new(rewrite_type(state, *return_type)),
  }
}

fn rewrite_var_name(state: &State, VariableName { name, type_ }: VariableName) -> VariableName {
  VariableName { name, type_: rewrite_type(state, type_) }
}

fn rewrite_fn_name(state: &State, FunctionName { name, type_ }: FunctionName) -> FunctionName {
  FunctionName { name, type_: rewrite_fn_type(state, type_) }
}

fn rewrite_expr(state: &State, expr: Expression) -> Expression {
  match expr {
    Expression::IntLiteral(_) | Expression::StringName(_) => expr,
    Expression::Variable(n) => Expression::Variable(rewrite_var_name(state, n)),
  }
}

fn rewrite_expressions(state: &State, expressions: Vec<Expression>) -> Vec<Expression> {
  expressions.into_iter().map(|e| rewrite_expr(state, e)).collect_vec()
}

fn rewrite_stmt(state: &State, stmt: Statement) -> Statement {
  match stmt {
    Statement::Binary(Binary { name, operator, e1, e2 }) => Statement::Binary(Binary {
      name,
      operator,
      e1: rewrite_expr(state, e1),
      e2: rewrite_expr(state, e2),
    }),
    Statement::IndexedAccess { name, type_, pointer_expression, index } => {
      Statement::IndexedAccess {
        name,
        type_: rewrite_type(state, type_),
        pointer_expression: rewrite_expr(state, pointer_expression),
        index,
      }
    }
    Statement::Call {
      callee: Callee::FunctionName(fn_name),
      arguments,
      return_type,
      return_collector,
    } => Statement::Call {
      callee: Callee::FunctionName(rewrite_fn_name(state, fn_name)),
      arguments: rewrite_expressions(state, arguments),
      return_type: rewrite_type(state, return_type),
      return_collector,
    },
    Statement::Call {
      callee: Callee::Variable(var_name),
      arguments,
      return_type,
      return_collector,
    } => Statement::Call {
      callee: Callee::Variable(rewrite_var_name(state, var_name)),
      arguments: rewrite_expressions(state, arguments),
      return_type: rewrite_type(state, return_type),
      return_collector,
    },
    Statement::IfElse { condition, s1, s2, final_assignments } => Statement::IfElse {
      condition: rewrite_expr(state, condition),
      s1: rewrite_stmts(state, s1),
      s2: rewrite_stmts(state, s2),
      final_assignments: final_assignments
        .into_iter()
        .map(|(n, t, e1, e2)| {
          (n, rewrite_type(state, t), rewrite_expr(state, e1), rewrite_expr(state, e2))
        })
        .collect_vec(),
    },
    Statement::SingleIf { .. } => {
      panic!("SingleIf should not appear before tailrec optimization.")
    }
    Statement::Break(_) => {
      panic!("Break should not appear before tailrec optimization.")
    }
    Statement::While { .. } => {
      panic!("While should not appear before tailrec optimization.")
    }
    Statement::Cast { name, type_, assigned_expression } => Statement::Cast {
      name,
      type_: rewrite_type(state, type_),
      assigned_expression: rewrite_expr(state, assigned_expression),
    },
    Statement::StructInit { struct_variable_name, type_name, expression_list } => {
      Statement::StructInit {
        struct_variable_name,
        type_name: rewrite_id_type_name(state, type_name),
        expression_list: rewrite_expressions(state, expression_list),
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type_name, function_name, context } => {
      Statement::ClosureInit {
        closure_variable_name,
        closure_type_name: rewrite_id_type_name(state, closure_type_name),
        function_name: rewrite_fn_name(state, function_name),
        context: rewrite_expr(state, context),
      }
    }
  }
}

fn rewrite_stmts(state: &State, stmts: Vec<Statement>) -> Vec<Statement> {
  stmts.into_iter().map(|s| rewrite_stmt(state, s)).collect_vec()
}

fn rewrite_function(
  state: &State,
  Function { name, parameters, type_, body, return_value }: Function,
) -> Function {
  Function {
    name,
    parameters,
    type_: rewrite_fn_type(state, type_),
    body: rewrite_stmts(state, body),
    return_value: rewrite_expr(state, return_value),
  }
}

pub(super) fn deduplicate(
  Sources { global_variables, closure_types, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let mut state = HashMap::new();
  let mut closure_type_def_mapping = HashMap::<FunctionType, PStr>::new();
  let mut type_def_mapping = HashMap::<TypeDefinitionMappings, PStr>::new();
  for closure_type in closure_types {
    let original_name = closure_type.identifier;
    let canonical_name = if let Some(id) = closure_type_def_mapping.get(&closure_type.function_type)
    {
      *id
    } else {
      let id = closure_type.identifier;
      closure_type_def_mapping.insert(closure_type.function_type, id);
      original_name
    };
    state.insert(original_name, canonical_name);
  }
  for type_def in type_definitions {
    let original_name = type_def.identifier;
    let canonical_name = if let Some(id) = type_def_mapping.get(&type_def.mappings) {
      *id
    } else {
      let id = type_def.identifier;
      type_def_mapping.insert(type_def.mappings, id);
      original_name
    };
    state.insert(original_name, canonical_name);
  }

  Sources {
    global_variables,
    closure_types: closure_type_def_mapping
      .into_iter()
      .map(|(t, identifier)| ClosureTypeDefinition {
        identifier,
        function_type: rewrite_fn_type(&state, t),
      })
      .sorted_by_key(|d| d.identifier)
      .collect_vec(),
    type_definitions: type_def_mapping
      .into_iter()
      .map(|(mappings, identifier)| TypeDefinition {
        identifier,
        mappings: match mappings {
          TypeDefinitionMappings::Struct(types) => TypeDefinitionMappings::Struct(
            types.into_iter().map(|t| rewrite_type(&state, t)).collect(),
          ),
          TypeDefinitionMappings::Enum(variants) => TypeDefinitionMappings::Enum(
            variants
              .into_iter()
              .map(|v| match v {
                EnumTypeDefinition::Boxed(n, types) => EnumTypeDefinition::Boxed(
                  n,
                  types.into_iter().map(|t| rewrite_type(&state, t)).collect(),
                ),
                EnumTypeDefinition::Unboxed(t) => {
                  EnumTypeDefinition::Unboxed(rewrite_type(&state, t))
                }
                EnumTypeDefinition::Int => EnumTypeDefinition::Int,
              })
              .collect(),
          ),
        },
      })
      .sorted_by_key(|d| d.identifier)
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().map(|f| rewrite_function(&state, f)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::mir::{INT_TYPE, ONE, STRING_TYPE, ZERO},
    common::well_known_pstrs,
    Heap,
  };
  use pretty_assertions::assert_eq;

  #[should_panic]
  #[test]
  fn panic_test_1() {
    rewrite_stmt(&HashMap::new(), Statement::Break(ZERO));
  }

  #[should_panic]
  #[test]
  fn panic_test_2() {
    rewrite_stmt(
      &HashMap::new(),
      Statement::SingleIf { condition: ZERO, invert_condition: false, statements: vec![] },
    );
  }

  #[should_panic]
  #[test]
  fn panic_test_3() {
    rewrite_stmt(
      &HashMap::new(),
      Statement::While { loop_variables: vec![], statements: vec![], break_collector: None },
    );
  }

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();

    assert_eq!(
      "() -> int",
      rewrite_fn_type(&HashMap::new(), Type::new_fn_unwrapped(vec![], INT_TYPE)).pretty_print(heap)
    );
  }

  #[test]
  fn working_test() {
    let heap = &mut Heap::new();

    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![
        ClosureTypeDefinition {
          identifier: well_known_pstrs::UPPER_A,
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
        ClosureTypeDefinition {
          identifier: well_known_pstrs::UPPER_B,
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          identifier: well_known_pstrs::UPPER_C,
          mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, STRING_TYPE]),
        },
        TypeDefinition {
          identifier: well_known_pstrs::UPPER_D,
          mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, STRING_TYPE]),
        },
        TypeDefinition {
          identifier: well_known_pstrs::UPPER_E,
          mappings: TypeDefinitionMappings::Enum(vec![
            EnumTypeDefinition::Boxed(well_known_pstrs::UPPER_F, vec![INT_TYPE]),
            EnumTypeDefinition::Unboxed(INT_TYPE),
            EnumTypeDefinition::Int,
          ]),
        },
      ],
      main_function_names: vec![],
      functions: vec![Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IfElse {
          condition: ONE,
          s1: vec![
            Statement::binary(
              heap.alloc_str_for_test("_"),
              crate::ast::hir::Operator::PLUS,
              ZERO,
              ZERO,
            ),
            Statement::Call {
              callee: Callee::FunctionName(FunctionName {
                name: well_known_pstrs::LOWER_F,
                type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              }),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName {
                name: well_known_pstrs::LOWER_F,
                type_: INT_TYPE,
              }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("_"),
              type_: Type::Id(well_known_pstrs::UPPER_B),
              pointer_expression: ZERO,
              index: 0,
            },
          ],
          s2: vec![
            Statement::Cast {
              name: heap.alloc_str_for_test("_"),
              type_: INT_TYPE,
              assigned_expression: ZERO,
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("_"),
              type_name: well_known_pstrs::UPPER_D,
              expression_list: vec![ZERO],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("_"),
              closure_type_name: well_known_pstrs::UPPER_C,
              function_name: FunctionName {
                name: well_known_pstrs::LOWER_F,
                type_: Type::new_fn_unwrapped(vec![Type::Id(well_known_pstrs::UPPER_E)], INT_TYPE),
              },
              context: Expression::var_name(heap.alloc_str_for_test("v"), INT_TYPE),
            },
          ],
          final_assignments: vec![(heap.alloc_str_for_test("_"), INT_TYPE, ZERO, ZERO)],
        }],
        return_value: ZERO,
      }],
    };
    let actual = deduplicate(sources).debug_print(heap);
    assert_eq!(
      r#"closure type A = () -> int
object type C = [int, _Str]
variant type E = [F(int), Unboxed(int), int]
function main(): int {
  let _: int;
  if 1 {
    let _ = 0 + 0;
    f(0);
    (f: int)();
    let _: A = 0[0];
    _ = 0;
  } else {
    let _ = 0 as int;
    let _: C = [0];
    let _: C = Closure { fun: (f: (E) -> int), context: (v: int) };
    _ = 0;
  }
  return 0;
}
"#,
      actual
    );
  }
}
