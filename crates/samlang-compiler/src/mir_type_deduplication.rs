use itertools::Itertools;
use samlang_ast::mir::{
  Binary, Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function,
  FunctionNameExpression, FunctionType, IfElseFinalAssignment, Sources, Statement, Type,
  TypeDefinition, TypeDefinitionMappings, TypeNameId, VariableName,
};
use std::collections::HashMap;

type State = HashMap<TypeNameId, TypeNameId>;

fn rewrite_id_type_name(state: &State, id: TypeNameId) -> TypeNameId {
  if let Some(n) = state.get(&id) { *n } else { id }
}

fn rewrite_type(state: &State, type_: &mut Type) {
  match type_ {
    Type::Int32 | Type::Int31 => {}
    Type::Id(id) => {
      *id = rewrite_id_type_name(state, *id);
    }
  }
}

fn rewritten_type(state: &State, mut type_: Type) -> Type {
  rewrite_type(state, &mut type_);
  type_
}

fn rewrite_fn_type(state: &State, FunctionType { argument_types, return_type }: &mut FunctionType) {
  for t in argument_types {
    rewrite_type(state, t);
  }
  rewrite_type(state, return_type.as_mut());
}

fn rewrite_var_name(state: &State, VariableName { name: _, type_ }: &mut VariableName) {
  rewrite_type(state, type_);
}

fn rewrite_fn_name(
  state: &State,
  FunctionNameExpression { name: _, type_ }: &mut FunctionNameExpression,
) {
  rewrite_fn_type(state, type_);
}

fn rewrite_expr(state: &State, expr: &mut Expression) {
  match expr {
    Expression::Int32Literal(_) | Expression::Int31Literal(_) | Expression::StringName(_) => {}
    Expression::Variable(n) => rewrite_var_name(state, n),
  }
}

fn rewrite_expressions(state: &State, expressions: &mut [Expression]) {
  for e in expressions {
    rewrite_expr(state, e);
  }
}

fn rewrite_stmt(state: &State, stmt: &mut Statement) {
  match stmt {
    Statement::IsPointer { name: _, pointer_type, operand } => {
      *pointer_type = rewrite_id_type_name(state, *pointer_type);
      rewrite_expr(state, operand);
    }
    Statement::Not { name: _, operand } => {
      rewrite_expr(state, operand);
    }
    Statement::Binary(Binary { name: _, operator: _, e1, e2 }) => {
      rewrite_expr(state, e1);
      rewrite_expr(state, e2);
    }
    Statement::IndexedAccess { name: _, type_, pointer_expression, index: _ } => {
      rewrite_type(state, type_);
      rewrite_expr(state, pointer_expression);
    }
    Statement::Call {
      callee: Callee::FunctionName(fn_name),
      arguments,
      return_type,
      return_collector: _,
    } => {
      rewrite_fn_name(state, fn_name);
      rewrite_expressions(state, arguments);
      rewrite_type(state, return_type);
    }
    Statement::Call {
      callee: Callee::Variable(var_name),
      arguments,
      return_type,
      return_collector: _,
    } => {
      rewrite_var_name(state, var_name);
      rewrite_expressions(state, arguments);
      rewrite_type(state, return_type);
    }
    Statement::IfElse { condition, s1, s2, final_assignments } => {
      rewrite_expr(state, condition);
      rewrite_stmts(state, s1);
      rewrite_stmts(state, s2);
      for IfElseFinalAssignment { name: _, type_, e1, e2 } in final_assignments {
        rewrite_type(state, type_);
        rewrite_expr(state, e1);
        rewrite_expr(state, e2);
      }
    }
    Statement::SingleIf { .. } => {
      panic!("SingleIf should not appear before tailrec optimization.")
    }
    Statement::Break(_) => {
      panic!("Break should not appear before tailrec optimization.")
    }
    Statement::While { .. } => {
      panic!("While should not appear before tailrec optimization.")
    }
    Statement::Cast { name: _, type_, assigned_expression } => {
      rewrite_type(state, type_);
      rewrite_expr(state, assigned_expression);
    }
    Statement::LateInitDeclaration { name: _, type_ } => {
      rewrite_type(state, type_);
    }
    Statement::LateInitAssignment { name: _, assigned_expression } => {
      rewrite_expr(state, assigned_expression);
    }
    Statement::StructInit { struct_variable_name: _, type_name, expression_list } => {
      *type_name = rewrite_id_type_name(state, *type_name);
      rewrite_expressions(state, expression_list);
    }
    Statement::ClosureInit {
      closure_variable_name: _,
      closure_type_name,
      function_name,
      context,
    } => {
      *closure_type_name = rewrite_id_type_name(state, *closure_type_name);
      rewrite_fn_name(state, function_name);
      rewrite_expr(state, context);
    }
  }
}

fn rewrite_stmts(state: &State, stmts: &mut [Statement]) {
  for s in stmts {
    rewrite_stmt(state, s);
  }
}

fn rewrite_function(
  state: &State,
  Function { name: _, parameters: _, type_, body, return_value }: &mut Function,
) {
  rewrite_fn_type(state, type_);
  rewrite_stmts(state, body);
  rewrite_expr(state, return_value);
}

pub(super) fn deduplicate(
  Sources {
    mut symbol_table,
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    mut functions,
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

  let closure_types = closure_type_def_mapping
    .into_iter()
    .map(|(mut t, name)| {
      rewrite_fn_type(&state, &mut t);
      ClosureTypeDefinition { name, function_type: t }
    })
    .sorted_by_key(|d| d.name)
    .collect_vec();
  let type_definitions = type_def_mapping
    .into_iter()
    .map(|(mappings, name)| TypeDefinition {
      name,
      mappings: match mappings {
        TypeDefinitionMappings::Struct(types) => TypeDefinitionMappings::Struct(
          types.into_iter().map(|t| rewritten_type(&state, t)).collect(),
        ),
        TypeDefinitionMappings::Enum(variants) => TypeDefinitionMappings::Enum(
          variants
            .into_iter()
            .map(|v| match v {
              EnumTypeDefinition::Boxed(types) => EnumTypeDefinition::Boxed(
                types.into_iter().map(|t| rewritten_type(&state, t)).collect(),
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
    .collect_vec();
  let subtype_remap = symbol_table.remap_subtypes_for_deduplication(&state);
  for (old_id, new_id) in subtype_remap {
    state.insert(old_id, new_id);
  }
  for f in &mut functions {
    rewrite_function(&state, f);
  }
  Sources {
    symbol_table,
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::mir::{FunctionName, INT_31_TYPE, INT_32_TYPE, ONE, SymbolTable, ZERO};
  use samlang_heap::{Heap, ModuleReference, PStr};

  #[should_panic]
  #[test]
  fn panic_test_1() {
    rewrite_stmt(&HashMap::new(), &mut Statement::Break(ZERO));
  }

  #[should_panic]
  #[test]
  fn panic_test_2() {
    rewrite_stmt(
      &HashMap::new(),
      &mut Statement::SingleIf { condition: ZERO, invert_condition: false, statements: Vec::new() },
    );
  }

  #[should_panic]
  #[test]
  fn panic_test_3() {
    rewrite_stmt(
      &HashMap::new(),
      &mut Statement::While {
        loop_variables: Vec::new(),
        statements: Vec::new(),
        break_collector: None,
      },
    );
  }

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();
    let table = &mut SymbolTable::new();

    let mut mir_type = Type::new_fn_unwrapped(
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

    rewrite_fn_type(&HashMap::new(), &mut mir_type);
    assert_eq!("(i31, DUMMY_A__i31) -> int", mir_type.pretty_print(heap, table));
  }

  #[test]
  fn working_test() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let sources = Sources {
      global_variables: Vec::new(),
      closure_types: vec![
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_A),
          function_type: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_B),
          function_type: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
        },
        ClosureTypeDefinition {
          name: table.create_type_name_for_test(PStr::UPPER_C),
          function_type: Type::new_fn_unwrapped(
            Vec::new(),
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
        {
          let d_type = table.create_type_name_for_test(PStr::UPPER_D);
          let d_subtype = table.derived_type_name_with_subtype_tag(d_type, 1);
          TypeDefinition {
            name: d_subtype,
            mappings: TypeDefinitionMappings::Struct(vec![INT_32_TYPE]),
          }
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
      main_function_names: Vec::new(),
      functions: vec![Function {
        name: FunctionName::new_for_test(PStr::MAIN_FN),
        parameters: Vec::new(),
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
              arguments: Vec::new(),
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
          s2: {
            let d_type = table.create_type_name_for_test(PStr::UPPER_D);
            let d_subtype = table.derived_type_name_with_subtype_tag(d_type, 1);
            vec![
              Statement::IndexedAccess {
                name: PStr::UNDERSCORE,
                type_: Type::Id(d_subtype),
                pointer_expression: ZERO,
                index: 0,
              },
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
            ]
          },
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
object type _D$_Sub1 = [int]
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
    let _: _C$_Sub1 = 0[0];
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
