use crate::{
  ast::hir::{
    Binary, Callee, ClosureTypeDefinition, Expression, Function, FunctionName, FunctionType,
    IdType, Sources, Statement, Type, TypeDefinition, VariableName,
  },
  common::{rc_string, Str},
};
use itertools::Itertools;
use std::collections::{BTreeMap, HashMap};

type State = HashMap<Str, Str>;

fn rewrite_id_type(state: &State, id: IdType) -> IdType {
  assert!(id.type_arguments.is_empty());
  let name = if let Some(n) = state.get(&id.name) { n.clone() } else { id.name };
  IdType { name, type_arguments: vec![] }
}

fn rewrite_type(state: &State, type_: Type) -> Type {
  match type_ {
    Type::Primitive(k) => Type::Primitive(k),
    Type::Id(id) => Type::Id(rewrite_id_type(state, id)),
    Type::Fn(f) => Type::Fn(rewrite_fn_type(state, f)),
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
  FunctionName { name, type_, type_arguments }: FunctionName,
) -> FunctionName {
  FunctionName {
    name,
    type_: rewrite_fn_type(state, type_),
    type_arguments: type_arguments.into_iter().map(|t| rewrite_type(state, t)).collect_vec(),
  }
}

fn rewrite_expr(state: &State, expr: Expression) -> Expression {
  match expr {
    Expression::IntLiteral(_, _) | Expression::StringName(_) => expr,
    Expression::Variable(n) => Expression::Variable(rewrite_var_name(state, n)),
    Expression::FunctionName(f) => Expression::FunctionName(rewrite_fn_name(state, f)),
  }
}

fn rewrite_expressions(state: &State, expressions: Vec<Expression>) -> Vec<Expression> {
  expressions.into_iter().map(|e| rewrite_expr(state, e)).collect_vec()
}

fn rewrite_stmt(state: &State, stmt: Statement) -> Statement {
  match stmt {
    Statement::Binary(Binary { name, type_, operator, e1, e2 }) => Statement::Binary(Binary {
      name,
      type_: rewrite_type(state, type_),
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
    Statement::StructInit { struct_variable_name, type_, expression_list } => {
      Statement::StructInit {
        struct_variable_name,
        type_: rewrite_id_type(state, type_),
        expression_list: rewrite_expressions(state, expression_list),
      }
    }
    Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
      Statement::ClosureInit {
        closure_variable_name,
        closure_type: rewrite_id_type(state, closure_type),
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
  Function { name, parameters, type_parameters, type_, body, return_value }: Function,
) -> Function {
  Function {
    name,
    parameters,
    type_parameters,
    type_: rewrite_fn_type(state, type_),
    body: rewrite_stmts(state, body),
    return_value: rewrite_expr(state, return_value),
  }
}

pub(super) fn deduplicate(
  Sources { global_variables, closure_types, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let mut state = HashMap::new();
  let mut closure_type_def_mapping = BTreeMap::<Str, ClosureTypeDefinition>::new();
  let mut type_def_mapping = BTreeMap::<Str, TypeDefinition>::new();
  for closure_type in closure_types {
    assert!(closure_type.type_parameters.is_empty());
    let key = rc_string(closure_type.function_type.pretty_print());
    let original_name = closure_type.identifier.clone();
    let canonical_name = if let Some(c) = closure_type_def_mapping.get(&key) {
      c.identifier.clone()
    } else {
      closure_type_def_mapping.insert(key, closure_type);
      original_name.clone()
    };
    state.insert(original_name, canonical_name);
  }
  for type_def in type_definitions {
    assert!(type_def.type_parameters.is_empty());
    let key = rc_string(format!(
      "{}_{}",
      type_def.is_object,
      type_def.mappings.iter().map(Type::pretty_print).join("_")
    ));
    let original_name = type_def.identifier.clone();
    let canonical_name = if let Some(c) = type_def_mapping.get(&key) {
      c.identifier.clone()
    } else {
      type_def_mapping.insert(key, type_def);
      original_name.clone()
    };
    state.insert(original_name, canonical_name);
  }

  Sources {
    global_variables,
    closure_types: closure_type_def_mapping
      .into_values()
      .map(|ClosureTypeDefinition { identifier, type_parameters, function_type }| {
        ClosureTypeDefinition {
          identifier,
          type_parameters,
          function_type: rewrite_fn_type(&state, function_type),
        }
      })
      .collect_vec(),
    type_definitions: type_def_mapping
      .into_values()
      .map(|TypeDefinition { identifier, is_object, type_parameters, names, mappings }| {
        TypeDefinition {
          identifier,
          is_object,
          type_parameters,
          names,
          mappings: mappings.into_iter().map(|t| rewrite_type(&state, t)).collect_vec(),
        }
      })
      .collect_vec(),
    main_function_names,
    functions: functions.into_iter().map(|f| rewrite_function(&state, f)).collect_vec(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::hir::{INT_TYPE, STRING_TYPE, TRUE, ZERO},
    common::rcs,
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
    assert_eq!(
      "() -> int",
      rewrite_type(&HashMap::new(), Type::new_fn(vec![], INT_TYPE)).pretty_print()
    );
    assert_eq!(
      "f<int>",
      rewrite_expr(
        &HashMap::new(),
        Expression::FunctionName(FunctionName {
          name: rcs("f"),
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          type_arguments: vec![INT_TYPE]
        })
      )
      .debug_print()
    );
  }

  #[test]
  fn working_test() {
    let actual = deduplicate(Sources {
      global_variables: vec![],
      closure_types: vec![
        ClosureTypeDefinition {
          identifier: rcs("A"),
          type_parameters: vec![],
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
        ClosureTypeDefinition {
          identifier: rcs("B"),
          type_parameters: vec![],
          function_type: Type::new_fn_unwrapped(vec![], INT_TYPE),
        },
      ],
      type_definitions: vec![
        TypeDefinition {
          identifier: rcs("C"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, STRING_TYPE],
        },
        TypeDefinition {
          identifier: rcs("D"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, STRING_TYPE],
        },
      ],
      main_function_names: vec![],
      functions: vec![Function {
        name: rcs("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::IfElse {
          condition: TRUE,
          s1: vec![
            Statement::binary("_", crate::ast::hir::Operator::PLUS, ZERO, ZERO),
            Statement::Call {
              callee: Callee::FunctionName(FunctionName {
                name: rcs("f"),
                type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
                type_arguments: vec![],
              }),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::Call {
              callee: Callee::Variable(VariableName { name: rcs("f"), type_: INT_TYPE }),
              arguments: vec![],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: rcs("_"),
              type_: Type::new_id_no_targs("B"),
              pointer_expression: ZERO,
              index: 0,
            },
          ],
          s2: vec![
            Statement::StructInit {
              struct_variable_name: rcs("_"),
              type_: Type::new_id_no_targs_unwrapped("D"),
              expression_list: vec![ZERO],
            },
            Statement::ClosureInit {
              closure_variable_name: rcs("_"),
              closure_type: Type::new_id_no_targs_unwrapped("C"),
              function_name: FunctionName {
                name: rcs("f"),
                type_: Type::new_fn_unwrapped(vec![Type::new_id_no_targs("E")], INT_TYPE),
                type_arguments: vec![],
              },
              context: Expression::var_name("v", INT_TYPE),
            },
          ],
          final_assignments: vec![(rcs("_"), INT_TYPE, ZERO, ZERO)],
        }],
        return_value: ZERO,
      }],
    })
    .debug_print();
    assert_eq!(
      r#"closure type A = () -> int
object type C = [int, string]
function main(): int {
  let _: int;
  if 1 {
    let _: int = 0 + 0;
    f(0);
    (f: int)();
    let _: A = 0[0];
    _ = 0;
  } else {
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
