use super::hir_type_conversion::{
  encode_name_after_generics_specialization, fn_type_application, solve_type_arguments,
  type_application,
};
use crate::{
  ast::hir::{
    Binary, Callee, ClosureTypeDefinition, Expression, Function, FunctionName, FunctionType,
    IdType, Sources, Statement, Type, TypeDefinition, TypeDefinitionMappings, VariableName,
  },
  common::{Heap, PStr},
};
use itertools::Itertools;
use std::{
  collections::{BTreeMap, HashMap, HashSet},
  fmt::Debug,
  rc::Rc,
};

struct Rewriter {
  original_closure_defs: HashMap<PStr, Rc<ClosureTypeDefinition>>,
  original_type_defs: HashMap<PStr, Rc<TypeDefinition>>,
  original_functions: HashMap<PStr, Rc<Function>>,
  used_string_names: HashSet<PStr>,
  specialized_id_type_mappings: HashMap<PStr, PStr>,
  specialized_closure_definitions: BTreeMap<PStr, Rc<ClosureTypeDefinition>>,
  specialized_type_definitions: BTreeMap<PStr, Rc<TypeDefinition>>,
  specialized_functions: BTreeMap<PStr, Rc<Function>>,
}

impl Rewriter {
  fn rewrite_function(
    &mut self,
    heap: &mut Heap,
    Function { name: _, parameters, type_parameters: _, type_: _, body, return_value }: &Function,
    new_name: PStr,
    new_type: FunctionType,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Function {
    Function {
      name: new_name,
      parameters: parameters.clone(),
      type_parameters: vec![],
      type_: new_type,
      body: self.rewrite_stmts(heap, body, generics_replacement_map),
      return_value: self.rewrite_expr(heap, return_value, generics_replacement_map),
    }
  }

  fn rewrite_stmts(
    &mut self,
    heap: &mut Heap,
    stmts: &[Statement],
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Vec<Statement> {
    stmts.iter().map(|stmt| self.rewrite_stmt(heap, stmt, generics_replacement_map)).collect_vec()
  }

  fn rewrite_stmt(
    &mut self,
    heap: &mut Heap,
    stmt: &Statement,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Statement {
    match stmt {
      Statement::Binary(Binary { name, type_, operator, e1, e2 }) => Statement::Binary(Binary {
        name: *name,
        type_: self.rewrite_type(heap, type_, generics_replacement_map),
        operator: *operator,
        e1: self.rewrite_expr(heap, e1, generics_replacement_map),
        e2: self.rewrite_expr(heap, e2, generics_replacement_map),
      }),
      Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        Statement::IndexedAccess {
          name: *name,
          type_: self.rewrite_type(heap, type_, generics_replacement_map),
          pointer_expression: self.rewrite_expr(heap, pointer_expression, generics_replacement_map),
          index: *index,
        }
      }
      Statement::Call { callee, arguments, return_type, return_collector } => Statement::Call {
        callee: match callee {
          Callee::FunctionName(fn_name) => {
            Callee::FunctionName(self.rewrite_fn_name_expr(heap, fn_name, generics_replacement_map))
          }
          Callee::Variable(VariableName { name, type_ }) => Callee::Variable(VariableName {
            name: *name,
            type_: self.rewrite_type(heap, type_, generics_replacement_map),
          }),
        },
        arguments: self.rewrite_expressions(heap, arguments, generics_replacement_map),
        return_type: self.rewrite_type(heap, return_type, generics_replacement_map),
        return_collector: *return_collector,
      },
      Statement::IfElse { condition, s1, s2, final_assignments } => Statement::IfElse {
        condition: self.rewrite_expr(heap, condition, generics_replacement_map),
        s1: self.rewrite_stmts(heap, s1, generics_replacement_map),
        s2: self.rewrite_stmts(heap, s2, generics_replacement_map),
        final_assignments: final_assignments
          .iter()
          .map(|(n, t, e1, e2)| {
            (
              *n,
              self.rewrite_type(heap, t, generics_replacement_map),
              self.rewrite_expr(heap, e1, generics_replacement_map),
              self.rewrite_expr(heap, e2, generics_replacement_map),
            )
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
        name: *name,
        type_: self.rewrite_type(heap, type_, generics_replacement_map),
        assigned_expression: self.rewrite_expr(heap, assigned_expression, generics_replacement_map),
      },
      Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_ = self.rewrite_id_type(heap, type_, generics_replacement_map).into_id().unwrap();
        Statement::StructInit {
          struct_variable_name: *struct_variable_name,
          type_,
          expression_list: self.rewrite_expressions(
            heap,
            expression_list,
            generics_replacement_map,
          ),
        }
      }
      Statement::ClosureInit { closure_variable_name, closure_type, function_name, context } => {
        let closure_type =
          self.rewrite_id_type(heap, closure_type, generics_replacement_map).into_id().unwrap();
        Statement::ClosureInit {
          closure_variable_name: *closure_variable_name,
          closure_type,
          function_name: self.rewrite_fn_name_expr(heap, function_name, generics_replacement_map),
          context: self.rewrite_expr(heap, context, generics_replacement_map),
        }
      }
    }
  }

  fn rewrite_expressions(
    &mut self,
    heap: &mut Heap,
    expressions: &[Expression],
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Vec<Expression> {
    expressions.iter().map(|e| self.rewrite_expr(heap, e, generics_replacement_map)).collect_vec()
  }

  fn rewrite_expr(
    &mut self,
    heap: &mut Heap,
    expression: &Expression,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Expression {
    match expression {
      Expression::IntLiteral(i, b) => Expression::IntLiteral(*i, *b),
      Expression::StringName(s) => {
        self.used_string_names.insert(*s);
        Expression::StringName(*s)
      }
      Expression::Variable(VariableName { name, type_ }) => Expression::Variable(VariableName {
        name: *name,
        type_: self.rewrite_type(heap, type_, generics_replacement_map),
      }),
    }
  }

  fn rewrite_fn_name_expr(
    &mut self,
    heap: &mut Heap,
    FunctionName { name, type_, type_arguments }: &FunctionName,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> FunctionName {
    let fn_type = self.rewrite_fn_type(heap, type_, generics_replacement_map);
    let rewritten_targs = self.rewrite_types(heap, type_arguments, generics_replacement_map);
    let rewritten_name =
      self.rewrite_fn_name(heap, *name, fn_type.clone(), rewritten_targs, generics_replacement_map);
    FunctionName { name: rewritten_name, type_: fn_type, type_arguments: vec![] }
  }

  fn rewrite_fn_name(
    &mut self,
    heap: &mut Heap,
    original_name: PStr,
    function_type: FunctionType,
    function_type_arguments: Vec<Type>,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> PStr {
    if original_name.as_str(heap).starts_with("$GENERICS$_") {
      let to_be_splitted =
        original_name.as_str(heap).chars().skip("$GENERICS$_".len()).collect::<String>();
      let mut splitted = to_be_splitted.split('$');
      let generic_class_name = heap.alloc_string(splitted.next().unwrap().to_string());
      let fn_name = splitted.next().unwrap().to_string();
      let replacement_class =
        generics_replacement_map.get(&generic_class_name).unwrap().as_id().unwrap();
      let replacement_class_type =
        self.specialized_id_type_mappings.get(&replacement_class.name).unwrap();
      let rewritten_fn_name =
        heap.alloc_string(format!("_{}${}", replacement_class_type.as_str(heap), fn_name));
      return self.rewrite_fn_name(
        heap,
        rewritten_fn_name,
        function_type,
        function_type_arguments,
        generics_replacement_map,
      );
    }
    if let Some(existing_fn) = self.original_functions.get(&original_name).cloned() {
      let encoded_specialized_fn_name = heap.alloc_string(
        encode_name_after_generics_specialization(heap, original_name, &function_type_arguments),
      );
      if !self.specialized_functions.contains_key(&encoded_specialized_fn_name) {
        self.specialized_functions.insert(encoded_specialized_fn_name, existing_fn.clone());
        let rewritten_fn = self.rewrite_function(
          heap,
          &existing_fn,
          encoded_specialized_fn_name,
          function_type,
          &existing_fn.type_parameters.iter().cloned().zip(function_type_arguments).collect(),
        );
        self.specialized_functions.insert(encoded_specialized_fn_name, Rc::new(rewritten_fn));
      }
      encoded_specialized_fn_name
    } else {
      original_name
    }
  }

  fn rewrite_types(
    &mut self,
    heap: &mut Heap,
    types: &[Type],
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Vec<Type> {
    types.iter().map(|t| self.rewrite_type(heap, t, generics_replacement_map)).collect_vec()
  }

  fn rewrite_type(
    &mut self,
    heap: &mut Heap,
    type_: &Type,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Type {
    match type_ {
      Type::Primitive(kind) => Type::Primitive(*kind),
      Type::Id(id) => self.rewrite_id_type(heap, id, generics_replacement_map),
    }
  }

  fn rewrite_id_type(
    &mut self,
    heap: &mut Heap,
    id_type: &IdType,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> Type {
    if id_type.type_arguments.is_empty() {
      if let Some(replacement) = generics_replacement_map.get(&id_type.name) {
        return replacement.clone();
      }
    }
    let concrete_type = IdType {
      name: id_type.name,
      type_arguments: self.rewrite_types(heap, &id_type.type_arguments, generics_replacement_map),
    };
    let encoded_name = heap.alloc_string(encode_name_after_generics_specialization(
      heap,
      concrete_type.name,
      &concrete_type.type_arguments,
    ));
    if self.specialized_type_definitions.get(&encoded_name).is_none() {
      if let Some(type_def) = self.original_type_defs.get(&concrete_type.name).cloned() {
        let solved_targs_replacement_map: HashMap<PStr, Type> = type_def
          .type_parameters
          .iter()
          .cloned()
          .zip(solve_type_arguments(
            &type_def.type_parameters,
            &concrete_type,
            &IdType {
              name: concrete_type.name,
              type_arguments: type_def
                .type_parameters
                .iter()
                .cloned()
                .map(Type::new_id_no_targs)
                .collect_vec(),
            },
          ))
          .collect();
        self.specialized_type_definitions.insert(encoded_name, type_def.clone());
        let rewritten_mappings = match &type_def.mappings {
          TypeDefinitionMappings::Struct(types) => TypeDefinitionMappings::Struct(
            types
              .iter()
              .map(|it| {
                self.rewrite_type(
                  heap,
                  &type_application(it, &solved_targs_replacement_map),
                  &HashMap::new(),
                )
              })
              .collect_vec(),
          ),
          TypeDefinitionMappings::Enum => TypeDefinitionMappings::Enum,
        };
        self.specialized_type_definitions.insert(
          encoded_name,
          Rc::new(TypeDefinition {
            identifier: encoded_name,
            type_parameters: vec![],
            names: type_def.names.clone(),
            mappings: rewritten_mappings,
          }),
        );
      } else if self.specialized_closure_definitions.get(&encoded_name).is_none() {
        let closure_def = self
          .original_closure_defs
          .get(&concrete_type.name)
          .cloned()
          .expect(&format!("Missing {}", concrete_type.name.as_str(heap)));
        let solved_targs_replacement_map: HashMap<PStr, Type> = closure_def
          .type_parameters
          .iter()
          .cloned()
          .zip(solve_type_arguments(
            &closure_def.type_parameters,
            &concrete_type,
            &IdType {
              name: concrete_type.name,
              type_arguments: closure_def
                .type_parameters
                .iter()
                .cloned()
                .map(Type::new_id_no_targs)
                .collect_vec(),
            },
          ))
          .collect();
        self.specialized_closure_definitions.insert(encoded_name, closure_def.clone());
        let rewritten_fn_type = self.rewrite_fn_type(
          heap,
          &fn_type_application(&closure_def.function_type, &solved_targs_replacement_map),
          &HashMap::new(),
        );
        self.specialized_closure_definitions.insert(
          encoded_name,
          Rc::new(ClosureTypeDefinition {
            identifier: encoded_name,
            type_parameters: vec![],
            function_type: rewritten_fn_type,
          }),
        );
      }
    }
    self.specialized_id_type_mappings.insert(encoded_name, concrete_type.name);
    Type::new_id_no_targs(encoded_name)
  }

  fn rewrite_fn_type(
    &mut self,
    heap: &mut Heap,
    FunctionType { argument_types, return_type }: &FunctionType,
    generics_replacement_map: &HashMap<PStr, Type>,
  ) -> FunctionType {
    FunctionType {
      argument_types: self.rewrite_types(heap, argument_types, generics_replacement_map),
      return_type: Box::new(self.rewrite_type(heap, return_type, generics_replacement_map)),
    }
  }
}

fn rc_valued_bmap_into_vec<K, T: Debug>(map: BTreeMap<K, Rc<T>>) -> Vec<T> {
  map.into_values().map(|v| Rc::try_unwrap(v).unwrap()).collect_vec()
}

pub(super) fn perform_generics_specialization(
  heap: &mut Heap,
  Sources { global_variables, closure_types, type_definitions, main_function_names, functions }: Sources,
) -> Sources {
  let mut rewriter = Rewriter {
    original_closure_defs: closure_types
      .into_iter()
      .map(|it| (it.identifier, Rc::new(it)))
      .collect(),
    original_type_defs: type_definitions
      .into_iter()
      .map(|it| (it.identifier, Rc::new(it)))
      .collect(),
    original_functions: functions.into_iter().map(|it| (it.name, Rc::new(it))).collect(),
    used_string_names: HashSet::new(),
    specialized_id_type_mappings: HashMap::new(),
    specialized_closure_definitions: BTreeMap::new(),
    specialized_type_definitions: BTreeMap::new(),
    specialized_functions: BTreeMap::new(),
  };
  for main_fn_name in &main_function_names {
    let original_fn = rewriter.original_functions.get(main_fn_name).cloned().unwrap();
    let rewritten = rewriter.rewrite_function(
      heap,
      &original_fn,
      *main_fn_name,
      original_fn.type_.clone(),
      &HashMap::new(),
    );
    rewriter.specialized_functions.insert(*main_fn_name, Rc::new(rewritten));
  }
  let Rewriter {
    used_string_names,
    specialized_closure_definitions,
    specialized_type_definitions,
    specialized_functions,
    ..
  } = rewriter;
  Sources {
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_string_names.contains(&it.name))
      .collect(),
    closure_types: rc_valued_bmap_into_vec(specialized_closure_definitions),
    type_definitions: rc_valued_bmap_into_vec(specialized_type_definitions),
    main_function_names,
    functions: rc_valued_bmap_into_vec(specialized_functions),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::ast::hir::{
    GlobalVariable, Operator, TypeDefinitionMappings, INT_TYPE, STRING_TYPE, TRUE, ZERO,
  };
  use pretty_assertions::assert_eq;

  fn assert_specialized(sources: Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected.trim(), perform_generics_specialization(heap, sources).debug_print(heap));
  }

  #[test]
  fn empty_test() {
    assert_specialized(
      Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![],
        functions: vec![],
      },
      &mut Heap::new(),
      "",
    );
  }

  #[test]
  fn dce_real_smoke_test() {
    let heap = &mut Heap::new();

    assert_specialized(
      Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            body: vec![],
            return_value: ZERO,
          },
          Function {
            name: heap.alloc_str_for_test("main2"),
            parameters: vec![],
            type_parameters: vec![],
            type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            body: vec![],
            return_value: ZERO,
          },
        ],
      },
      heap,
      r#"
function main(): int {
  return 0;
}

sources.mains = [main]
"#,
    );
  }

  #[test]
  fn builtin_function_call_no_dce_test() {
    let heap = &mut Heap::new();

    assert_specialized(
      Sources {
        global_variables: vec![GlobalVariable {
          name: heap.alloc_str_for_test("G1"),
          content: heap.alloc_str_for_test(""),
        }],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
          body: vec![Statement::Call {
            callee: Callee::FunctionName(FunctionName::new(
              heap.alloc_str_for_test("__builtins_println"),
              Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
            )),
            arguments: vec![Expression::StringName(heap.alloc_str_for_test("G1"))],
            return_type: INT_TYPE,
            return_collector: None,
          }],
          return_value: ZERO,
        }],
      },
      heap,
      r#"const G1 = '';

function main(): int {
  __builtins_println(G1);
  return 0;
}

sources.mains = [main]
"#,
    );
  }

  #[should_panic]
  #[test]
  fn panic_test_1() {
    let heap = &mut Heap::new();

    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::Break(ZERO)],
        return_value: ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[should_panic]
  #[test]
  fn panic_test_2() {
    let heap = &mut Heap::new();

    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::SingleIf {
          condition: ZERO,
          invert_condition: false,
          statements: vec![],
        }],
        return_value: ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[should_panic]
  #[test]
  fn panic_test_3() {
    let heap = &mut Heap::new();

    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
        body: vec![Statement::While {
          loop_variables: vec![],
          statements: vec![],
          break_collector: None,
        }],
        return_value: ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let type_a = Type::new_id_no_targs(heap.alloc_str_for_test("A"));
    let type_b = Type::new_id_no_targs(heap.alloc_str_for_test("B"));
    let type_j = Type::new_id_no_targs(heap.alloc_str_for_test("J"));
    let type_ia = Type::new_id(heap.alloc_str_for_test("I"), vec![type_a.clone(), STRING_TYPE]);
    let type_ib = Type::new_id(heap.alloc_str_for_test("I"), vec![INT_TYPE, type_b.clone()]);
    let type_i = Type::new_id(heap.alloc_str_for_test("I"), vec![INT_TYPE, STRING_TYPE]);
    let g1 = Expression::StringName(heap.alloc_str_for_test("G1"));
    assert_specialized(
      Sources {
        global_variables: vec![
          GlobalVariable {
            name: heap.alloc_str_for_test("G1"),
            content: heap.alloc_str_for_test(""),
          },
          GlobalVariable {
            name: heap.alloc_str_for_test("G2"),
            content: heap.alloc_str_for_test(""),
          },
        ],
        closure_types: vec![ClosureTypeDefinition {
          identifier: heap.alloc_str_for_test("CC"),
          type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
          function_type: Type::new_fn_unwrapped(vec![type_a.clone()], type_b.clone()),
        }],
        type_definitions: vec![
          TypeDefinition {
            identifier: heap.alloc_str_for_test("I"),
            type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
            names: vec![],
            mappings: TypeDefinitionMappings::Enum,
          },
          TypeDefinition {
            identifier: heap.alloc_str_for_test("J"),
            type_parameters: vec![],
            names: vec![],
            mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE]),
          },
        ],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          Function {
            name: heap.alloc_str_for_test("functor_fun"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: Type::new_fn_unwrapped(vec![type_a.clone()], INT_TYPE),
            body: vec![Statement::Call {
              callee: Callee::FunctionName(FunctionName::new(
                heap.alloc_str_for_test("$GENERICS$_A$bar"),
                Type::new_fn_unwrapped(vec![type_a.clone()], INT_TYPE),
              )),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            }],
            return_value: ZERO,
          },
          Function {
            name: heap.alloc_str_for_test("_I$bar"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            body: vec![],
            return_value: ZERO,
          },
          Function {
            name: heap.alloc_str_for_test("_J$bar"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
            body: vec![],
            return_value: ZERO,
          },
          Function {
            name: heap.alloc_str_for_test("creatorIA"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: Type::new_fn_unwrapped(vec![type_a.clone()], type_ia.clone()),
            body: vec![Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ia.clone().into_id().unwrap(),
              expression_list: vec![
                Expression::int(0),
                Expression::var_name(heap.alloc_str_for_test("a"), type_a),
              ],
            }],
            return_value: Expression::var_name(heap.alloc_str_for_test("v"), type_ia),
          },
          Function {
            name: heap.alloc_str_for_test("creatorIB"),
            parameters: vec![heap.alloc_str_for_test("b")],
            type_parameters: vec![heap.alloc_str_for_test("B")],
            type_: Type::new_fn_unwrapped(vec![type_b.clone()], type_ib.clone()),
            body: vec![Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ib.clone().into_id().unwrap(),
              expression_list: vec![
                Expression::int(1),
                Expression::var_name(heap.alloc_str_for_test("b"), type_b),
              ],
            }],
            return_value: Expression::var_name(heap.alloc_str_for_test("v"), type_ib),
          },
          Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            body: vec![Statement::IfElse {
              condition: TRUE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: Type::new_fn_unwrapped(vec![INT_TYPE], type_i.clone()),
                    type_arguments: vec![INT_TYPE],
                  }),
                  arguments: vec![ZERO],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("a")),
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: Type::new_fn_unwrapped(
                      vec![STRING_TYPE],
                      Type::new_id(heap.alloc_str_for_test("I"), vec![STRING_TYPE, STRING_TYPE]),
                    ),
                    type_arguments: vec![STRING_TYPE],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("a2")),
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName {
                    name: heap.alloc_str_for_test("creatorIB"),
                    type_: Type::new_fn_unwrapped(vec![STRING_TYPE], type_i.clone()),
                    type_arguments: vec![STRING_TYPE],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("b")),
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName {
                    name: heap.alloc_str_for_test("functor_fun"),
                    type_: Type::new_fn_unwrapped(vec![type_i.clone()], INT_TYPE),
                    type_arguments: vec![type_i.clone()],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName {
                    name: heap.alloc_str_for_test("functor_fun"),
                    type_: Type::new_fn_unwrapped(vec![type_j.clone()], INT_TYPE),
                    type_arguments: vec![type_j.clone()],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_j.clone(),
                  return_collector: None,
                },
                Statement::IndexedAccess {
                  name: heap.alloc_str_for_test("v1"),
                  type_: INT_TYPE,
                  pointer_expression: Expression::var_name(heap.alloc_str_for_test("a"), type_i),
                  index: 0,
                },
                Statement::Cast {
                  name: heap.alloc_str_for_test("cast"),
                  type_: INT_TYPE,
                  assigned_expression: Expression::var_name(heap.alloc_str_for_test("a"), INT_TYPE),
                },
              ],
              s2: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str_for_test("main"),
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![],
                  return_type: INT_TYPE,
                  return_collector: None,
                },
                Statement::binary(heap.alloc_str_for_test("v1"), Operator::PLUS, ZERO, ZERO),
                Statement::StructInit {
                  struct_variable_name: heap.alloc_str_for_test("j"),
                  type_: type_j.clone().into_id().unwrap(),
                  expression_list: vec![Expression::int(0)],
                },
                Statement::IndexedAccess {
                  name: heap.alloc_str_for_test("v2"),
                  type_: INT_TYPE,
                  pointer_expression: Expression::var_name(heap.alloc_str_for_test("j"), type_j),
                  index: 0,
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("c1"),
                  closure_type: Type::new_id_unwrapped(
                    heap.alloc_str_for_test("CC"),
                    vec![STRING_TYPE, STRING_TYPE],
                  ),
                  function_name: FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: Type::new_fn_unwrapped(
                      vec![STRING_TYPE],
                      Type::new_id(heap.alloc_str_for_test("I"), vec![STRING_TYPE, STRING_TYPE]),
                    ),
                    type_arguments: vec![STRING_TYPE],
                  },
                  context: g1.clone(),
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("c2"),
                  closure_type: Type::new_id_unwrapped(
                    heap.alloc_str_for_test("CC"),
                    vec![INT_TYPE, STRING_TYPE],
                  ),
                  function_name: FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: Type::new_fn_unwrapped(
                      vec![STRING_TYPE],
                      Type::new_id(heap.alloc_str_for_test("I"), vec![STRING_TYPE, STRING_TYPE]),
                    ),
                    type_arguments: vec![STRING_TYPE],
                  },
                  context: g1,
                },
              ],
              final_assignments: vec![(
                heap.alloc_str_for_test("finalV"),
                INT_TYPE,
                Expression::var_name(heap.alloc_str_for_test("v1"), INT_TYPE),
                Expression::var_name(heap.alloc_str_for_test("v2"), INT_TYPE),
              )],
            }],
            return_value: ZERO,
          },
        ],
      },
      heap,
      r#"
const G1 = '';

closure type CC_string_string = (string) -> string
closure type CC_int_string = (int) -> string
object type J = [int]
variant type I_int_string
variant type I_string_string
function main(): int {
  let finalV: int;
  if 1 {
    let a: I_int_string = creatorIA_int(0);
    let a2: I_int_string = creatorIA_string(G1);
    let b: I_int_string = creatorIB_string(G1);
    functor_fun_I_int_string(G1);
    functor_fun_J(G1);
    let v1: int = (a: I_int_string)[0];
    let cast = (a: int) as int;
    finalV = (v1: int);
  } else {
    main();
    let v1: int = 0 + 0;
    let j: J = [0];
    let v2: int = (j: J)[0];
    let c1: CC_string_string = Closure { fun: (creatorIA_string: (string) -> I_string_string), context: G1 };
    let c2: CC_int_string = Closure { fun: (creatorIA_string: (string) -> I_string_string), context: G1 };
    finalV = (v2: int);
  }
  return 0;
}

function _I$bar(a: I_int_string): int {
  return 0;
}

function _J$bar(a: J): int {
  return 0;
}

function creatorIA_int(a: int): I_int_string {
  let v: I_int_string = [0, (a: int)];
  return (v: I_int_string);
}

function creatorIA_string(a: string): I_string_string {
  let v: I_string_string = [0, (a: string)];
  return (v: I_string_string);
}

function creatorIB_string(b: string): I_int_string {
  let v: I_int_string = [1, (b: string)];
  return (v: I_int_string);
}

function functor_fun_I_int_string(a: I_int_string): int {
  _I$bar(0);
  return 0;
}

function functor_fun_J(a: J): int {
  _J$bar(0);
  return 0;
}

sources.mains = [main]"#,
    );
  }

  #[test]
  fn no_arg_function_type_def_test() {
    let heap = &mut Heap::new();

    assert_specialized(
      Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![
          TypeDefinition {
            identifier: heap.alloc_str_for_test("I"),
            type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
            names: vec![],
            mappings: TypeDefinitionMappings::Enum,
          },
          TypeDefinition {
            identifier: heap.alloc_str_for_test("J"),
            type_parameters: vec![],
            names: vec![],
            mappings: TypeDefinitionMappings::Struct(vec![Type::new_id(
              heap.alloc_str_for_test("I"),
              vec![INT_TYPE, INT_TYPE],
            )]),
          },
        ],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          Function {
            name: heap.alloc_str_for_test("creatorJ"),
            parameters: vec![],
            type_parameters: vec![],
            type_: Type::new_fn_unwrapped(
              vec![],
              Type::new_id_no_targs(heap.alloc_str_for_test("J")),
            ),
            body: vec![
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v1"),
                type_: Type::new_id_unwrapped(
                  heap.alloc_str_for_test("I"),
                  vec![INT_TYPE, INT_TYPE],
                ),
                expression_list: vec![],
              },
              Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v2"),
                type_: Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("J")),
                expression_list: vec![ZERO, ZERO],
              },
            ],
            return_value: Expression::var_name(
              heap.alloc_str_for_test("v2"),
              Type::new_id_no_targs(heap.alloc_str_for_test("J")),
            ),
          },
          Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
            body: vec![
              Statement::Call {
                callee: Callee::FunctionName(FunctionName::new(
                  heap.alloc_str_for_test("creatorJ"),
                  Type::new_fn_unwrapped(
                    vec![],
                    Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                  ),
                )),
                arguments: vec![],
                return_type: Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                return_collector: None,
              },
              Statement::Call {
                callee: Callee::Variable(VariableName {
                  name: heap.alloc_str_for_test("v"),
                  type_: INT_TYPE,
                }),
                arguments: vec![],
                return_type: Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                return_collector: None,
              },
            ],
            return_value: Expression::StringName(heap.alloc_str_for_test("creatorJ")),
          },
        ],
      },
      heap,
      r#"
object type J = [I_int_int]
variant type I_int_int
function main(): int {
  creatorJ();
  (v: int)();
  return creatorJ;
}

function creatorJ(): J {
  let v1: I_int_int = [];
  let v2: J = [0, 0];
  return (v2: J);
}

sources.mains = [main]"#,
    );
  }
}
