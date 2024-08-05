use itertools::Itertools;
use samlang_ast::mir::{
  Binary, Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function,
  FunctionNameExpression, FunctionType, IfElseFinalAssignment, Sources, Statement, Type,
  TypeDefinition, TypeDefinitionMappings, TypeNameId, VariableName,
};
use std::collections::HashMap;

type State = HashMap<TypeNameId, TypeNameId>;

fn rewrite_id_type_name(state: &State, id: TypeNameId) -> TypeNameId {
  if let Some(n) = state.get(&id) {
    *n
  } else {
    id
  }
}

fn rewrite_type(state: &State, type_: Type) -> Type {
  match type_ {
    Type::Int32 => Type::Int32,
    Type::Int31 => Type::Int31,
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

fn rewrite_fn_name(
  state: &State,
  FunctionNameExpression { name, type_ }: FunctionNameExpression,
) -> FunctionNameExpression {
  FunctionNameExpression { name, type_: rewrite_fn_type(state, type_) }
}

fn rewrite_expr(state: &State, expr: Expression) -> Expression {
  match expr {
    Expression::Int32Literal(_) | Expression::Int31Literal(_) | Expression::StringName(_) => expr,
    Expression::Variable(n) => Expression::Variable(rewrite_var_name(state, n)),
  }
}

fn rewrite_expressions(state: &State, expressions: Vec<Expression>) -> Vec<Expression> {
  expressions.into_iter().map(|e| rewrite_expr(state, e)).collect_vec()
}

fn rewrite_stmt(state: &State, stmt: Statement) -> Statement {
  match stmt {
    Statement::IsPointer { name, pointer_type, operand } => {
      Statement::IsPointer { name, pointer_type, operand: rewrite_expr(state, operand) }
    }
    Statement::Not { name, operand } => {
      Statement::Not { name, operand: rewrite_expr(state, operand) }
    }
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
        .map(|IfElseFinalAssignment { name, type_, e1, e2 }| IfElseFinalAssignment {
          name,
          type_: rewrite_type(state, type_),
          e1: rewrite_expr(state, e1),
          e2: rewrite_expr(state, e2),
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
    Statement::LateInitDeclaration { name, type_ } => {
      Statement::LateInitDeclaration { name, type_: rewrite_type(state, type_) }
    }
    Statement::LateInitAssignment { name, assigned_expression } => Statement::LateInitAssignment {
      name,
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
  Sources {
    symbol_table,
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions,
  }: Sources,
) -> Sources {
  let mut state = HashMap::new();
  let mut closure_type_def_mapping = HashMap::<FunctionType, TypeNameId>::new();
  let mut type_def_mapping = HashMap::<TypeDefinitionMappings, TypeNameId>::new();
  for closure_type in closure_types {
    let original_name = closure_type.name;
    let canonical_name = if let Some(id) = closure_type_def_mapping.get(&closure_type.function_type)
    {
      *id
    } else {
      closure_type_def_mapping.insert(closure_type.function_type, original_name);
      original_name
    };
    state.insert(original_name, canonical_name);
  }
  for type_def in type_definitions {
    let original_name = type_def.name;
    let canonical_name = if let Some(id) = type_def_mapping.get(&type_def.mappings) {
      *id
    } else {
      type_def_mapping.insert(type_def.mappings, original_name);
      original_name
    };
    state.insert(original_name, canonical_name);
  }

  Sources {
    symbol_table,
    global_variables,
    closure_types: closure_type_def_mapping
      .into_iter()
      .map(|(t, name)| ClosureTypeDefinition { name, function_type: rewrite_fn_type(&state, t) })
      .sorted_by_key(|d| d.name)
      .collect_vec(),
    type_definitions: type_def_mapping
      .into_iter()
      .map(|(mappings, name)| TypeDefinition {
        name,
        mappings: match mappings {
          TypeDefinitionMappings::Struct(types) => TypeDefinitionMappings::Struct(
            types.into_iter().map(|t| rewrite_type(&state, t)).collect(),
          ),
          TypeDefinitionMappings::Enum(variants) => TypeDefinitionMappings::Enum(
            variants
              .into_iter()
              .map(|v| match v {
                EnumTypeDefinition::Boxed(types) => EnumTypeDefinition::Boxed(
                  types.into_iter().map(|t| rewrite_type(&state, t)).collect(),
                ),
                EnumTypeDefinition::Unboxed(t) => {
                  EnumTypeDefinition::Unboxed(rewrite_id_type_name(&state, t))
                }
                EnumTypeDefinition::Int31 => EnumTypeDefinition::Int31,
              })
              .collect(),
          ),
        },
      })
      .sorted_by_key(|d| d.name)
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().map(|f| rewrite_function(&state, f)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{FunctionName, SymbolTable, INT_31_TYPE, INT_32_TYPE, ONE, ZERO};
  use samlang_heap::{Heap, ModuleReference, PStr};

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
    let table = &mut SymbolTable::new();

    let mir_type = Type::new_fn_unwrapped(
      vec![
        INT_31_TYPE,
        Type::Id(table.create_type_name_with_suffix(
          ModuleReference::DUMMY,
          PStr::UPPER_A,
          vec![INT_31_TYPE],
        )),
      ],
      INT_32_TYPE,
    );
    assert_eq!("(i31, DUMMY_A__i31) -> int", mir_type.pretty_print(heap, table));

    assert_eq!(
      "(i31, DUMMY_A__i31) -> int",
      rewrite_fn_type(&HashMap::new(), mir_type).pretty_print(heap, table)
    );
  }

  #[test]
  fn working_test() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_A),
          function_type: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_B),
          function_type: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_C),
          function_type: Type::new_fn_unwrapped(
            vec![],
            Type::Id(table.create_type_name_for_test(PStr::UPPER_C)),
          ),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_C),
          mappings: TypeDefinitionMappings::Struct(vec![
            INT_32_TYPE,
            Type::Id(table.create_type_name_for_test(PStr::STR_TYPE)),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_D),
          mappings: TypeDefinitionMappings::Struct(vec![
            INT_32_TYPE,
            Type::Id(table.create_type_name_for_test(PStr::STR_TYPE)),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_E),
          mappings: TypeDefinitionMappings::Enum(vec![
            EnumTypeDefinition::Boxed(vec![INT_32_TYPE]),
            EnumTypeDefinition::Unboxed(TypeNameId::STR),
            EnumTypeDefinition::Int31,
          ]),
        },
      ],
      main_function_names: vec![],
      functions: vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
        body: vec![Statement::IfElse {
          condition: ONE,
          s1: vec![
            Statement::Not { name: PStr::UNDERSCORE, operand: ZERO },
            Statement::binary(PStr::UNDERSCORE, samlang_ast::hir::BinaryOperator::PLUS, ZERO, ZERO),
            Statement::Call {
              callee: Callee::FunctionName(FunctionNameExpression {
                name: FunctionName::new_for_test(PStr::LOWER_F),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              }),
              arguments: vec![ZERO],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName { name: PStr::LOWER_F, type_: INT_32_TYPE }),
              arguments: vec![],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: PStr::UNDERSCORE,
              type_: Type::Id(table.create_type_name_for_test(PStr::UPPER_B)),
              pointer_expression: ZERO,
              index: 0,
            },
          ],
          s2: vec![
            Statement::Cast {
              name: PStr::UNDERSCORE,
              type_: INT_32_TYPE,
              assigned_expression: ZERO,
            },
            Statement::LateInitDeclaration { name: PStr::UNDERSCORE, type_: INT_32_TYPE },
            Statement::LateInitAssignment { name: PStr::UNDERSCORE, assigned_expression: ZERO },
            Statement::StructInit {
              struct_variable_name: PStr::UNDERSCORE,
              type_name: table.create_type_name_for_test(PStr::UPPER_D),
              expression_list: vec![ZERO],
            },
            Statement::ClosureInit {
              closure_variable_name: PStr::UNDERSCORE,
              closure_type_name: table.create_type_name_for_test(PStr::UPPER_C),
              function_name: FunctionNameExpression {
                name: FunctionName::new_for_test(PStr::LOWER_F),
                type_: Type::new_fn_unwrapped(
                  vec![Type::Id(table.create_type_name_for_test(PStr::UPPER_E))],
                  INT_32_TYPE,
                ),
              },
              context: Expression::var_name(heap.alloc_str_for_test("v"), INT_32_TYPE),
            },
          ],
          final_assignments: vec![IfElseFinalAssignment {
            name: PStr::UNDERSCORE,
            type_: INT_32_TYPE,
            e1: ZERO,
            e2: ZERO,
          }],
        }],
        return_value: ZERO,
      }],
      symbol_table: table,
    };
    let actual = deduplicate(sources).debug_print(heap);
    assert_eq!(
      r#"closure type _A = () -> int
closure type _C = () -> _C
object type _C = [int, _Str]
variant type _E = [Boxed(int), Unboxed(_Str), i31]
function __$main(): int {
  let _: int;
  if 1 {
    let _ = !0;
    let _ = 0 + 0;
    __$f(0);
    (f: int)();
    let _: _A = 0[0];
    _ = 0;
  } else {
    let _ = 0 as int;
    let _: int;
    _ = 0;
    let _: _C = [0];
    let _: _C = Closure { fun: (__$f: (_E) -> int), context: (v: int) };
    _ = 0;
  }
  return 0;
}
"#,
      actual
    );
  }
}
