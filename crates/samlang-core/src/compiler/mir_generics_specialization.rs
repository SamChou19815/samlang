use super::hir_type_conversion::{
  encode_name_after_generics_specialization, fn_type_application, solve_type_arguments,
  type_application,
};
use crate::{
  ast::{hir, mir},
  common::{Heap, PStr},
};
use itertools::Itertools;
use std::{
  collections::{BTreeMap, HashMap, HashSet},
  fmt::Debug,
};

struct Rewriter {
  original_closure_defs: HashMap<PStr, hir::ClosureTypeDefinition>,
  original_type_defs: HashMap<PStr, hir::TypeDefinition>,
  original_functions: HashMap<PStr, hir::Function>,
  used_string_names: HashSet<PStr>,
  specialized_id_type_mappings: HashMap<PStr, PStr>,
  specialized_closure_definitions: BTreeMap<PStr, Option<mir::ClosureTypeDefinition>>,
  specialized_type_definitions: BTreeMap<PStr, Option<mir::TypeDefinition>>,
  specialized_functions: BTreeMap<PStr, Option<mir::Function>>,
}

fn mir_to_hir_type(t: &mir::Type) -> hir::Type {
  match t {
    mir::Type::Int => hir::Type::Int,
    mir::Type::Id(name) => hir::Type::Id(hir::IdType { name: *name, type_arguments: vec![] }),
  }
}

impl Rewriter {
  fn rewrite_function(
    &mut self,
    heap: &mut Heap,
    hir::Function { name: _, parameters, type_parameters: _, type_: _, body, return_value }: &hir::Function,
    new_name: PStr,
    new_type: mir::FunctionType,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Function {
    mir::Function {
      name: new_name,
      parameters: parameters.clone(),
      type_: new_type,
      body: self.rewrite_stmts(heap, body, generics_replacement_map),
      return_value: self.rewrite_expr(heap, return_value, generics_replacement_map),
    }
  }

  fn rewrite_stmts(
    &mut self,
    heap: &mut Heap,
    stmts: &[hir::Statement],
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> Vec<mir::Statement> {
    stmts.iter().map(|stmt| self.rewrite_stmt(heap, stmt, generics_replacement_map)).collect_vec()
  }

  fn rewrite_stmt(
    &mut self,
    heap: &mut Heap,
    stmt: &hir::Statement,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Statement {
    match stmt {
      hir::Statement::Binary(hir::Binary { name, operator, e1, e2 }) => {
        mir::Statement::Binary(mir::Binary {
          name: *name,
          operator: *operator,
          e1: self.rewrite_expr(heap, e1, generics_replacement_map),
          e2: self.rewrite_expr(heap, e2, generics_replacement_map),
        })
      }
      hir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        mir::Statement::IndexedAccess {
          name: *name,
          type_: self.rewrite_type(heap, type_, generics_replacement_map),
          pointer_expression: self.rewrite_expr(heap, pointer_expression, generics_replacement_map),
          index: *index,
        }
      }
      hir::Statement::Call { callee, arguments, return_type, return_collector } => {
        mir::Statement::Call {
          callee: match callee {
            hir::Callee::FunctionName(fn_name) => mir::Callee::FunctionName(
              self.rewrite_fn_name_expr(heap, fn_name, generics_replacement_map),
            ),
            hir::Callee::Variable(hir::VariableName { name, type_ }) => {
              mir::Callee::Variable(mir::VariableName {
                name: *name,
                type_: self.rewrite_type(heap, type_, generics_replacement_map),
              })
            }
          },
          arguments: self.rewrite_expressions(heap, arguments, generics_replacement_map),
          return_type: self.rewrite_type(heap, return_type, generics_replacement_map),
          return_collector: *return_collector,
        }
      }
      hir::Statement::IfElse { condition, s1, s2, final_assignments } => mir::Statement::IfElse {
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
      hir::Statement::SingleIf { .. } => {
        panic!("SingleIf should not appear before tailrec optimization.")
      }
      hir::Statement::Break(_) => {
        panic!("Break should not appear before tailrec optimization.")
      }
      hir::Statement::While { .. } => {
        panic!("While should not appear before tailrec optimization.")
      }
      hir::Statement::Cast { name, type_, assigned_expression } => mir::Statement::Cast {
        name: *name,
        type_: self.rewrite_type(heap, type_, generics_replacement_map),
        assigned_expression: self.rewrite_expr(heap, assigned_expression, generics_replacement_map),
      },
      hir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_name =
          self.rewrite_id_type(heap, type_, generics_replacement_map).into_id().unwrap();
        mir::Statement::StructInit {
          struct_variable_name: *struct_variable_name,
          type_name,
          expression_list: self.rewrite_expressions(
            heap,
            expression_list,
            generics_replacement_map,
          ),
        }
      }
      hir::Statement::ClosureInit {
        closure_variable_name,
        closure_type,
        function_name,
        context,
      } => {
        let closure_type_name =
          self.rewrite_id_type(heap, closure_type, generics_replacement_map).into_id().unwrap();
        mir::Statement::ClosureInit {
          closure_variable_name: *closure_variable_name,
          closure_type_name,
          function_name: self.rewrite_fn_name_expr(heap, function_name, generics_replacement_map),
          context: self.rewrite_expr(heap, context, generics_replacement_map),
        }
      }
    }
  }

  fn rewrite_expressions(
    &mut self,
    heap: &mut Heap,
    expressions: &[hir::Expression],
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> Vec<mir::Expression> {
    expressions.iter().map(|e| self.rewrite_expr(heap, e, generics_replacement_map)).collect_vec()
  }

  fn rewrite_expr(
    &mut self,
    heap: &mut Heap,
    expression: &hir::Expression,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Expression {
    match expression {
      hir::Expression::IntLiteral(i) => mir::Expression::IntLiteral(*i),
      hir::Expression::StringName(s) => {
        self.used_string_names.insert(*s);
        mir::Expression::StringName(*s)
      }
      hir::Expression::Variable(hir::VariableName { name, type_ }) => {
        mir::Expression::Variable(mir::VariableName {
          name: *name,
          type_: self.rewrite_type(heap, type_, generics_replacement_map),
        })
      }
    }
  }

  fn rewrite_fn_name_expr(
    &mut self,
    heap: &mut Heap,
    hir::FunctionName { name, type_, type_arguments }: &hir::FunctionName,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::FunctionName {
    let fn_type = self.rewrite_fn_type(heap, type_, generics_replacement_map);
    let rewritten_targs = self.rewrite_types(heap, type_arguments, generics_replacement_map);
    let rewritten_name =
      self.rewrite_fn_name(heap, *name, fn_type.clone(), rewritten_targs, generics_replacement_map);
    mir::FunctionName { name: rewritten_name, type_: fn_type }
  }

  fn rewrite_fn_name(
    &mut self,
    heap: &mut Heap,
    original_name: PStr,
    function_type: mir::FunctionType,
    function_type_arguments: Vec<mir::Type>,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
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
        self.specialized_id_type_mappings.get(replacement_class).unwrap();
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
      let encoded_specialized_fn_name =
        heap.alloc_string(encode_name_after_generics_specialization(
          heap,
          original_name,
          &function_type_arguments.iter().map(mir_to_hir_type).collect_vec(),
        ));
      if !self.specialized_functions.contains_key(&encoded_specialized_fn_name) {
        self.specialized_functions.insert(encoded_specialized_fn_name, None);
        let rewritten_fn = self.rewrite_function(
          heap,
          &existing_fn,
          encoded_specialized_fn_name,
          function_type,
          &existing_fn.type_parameters.iter().cloned().zip(function_type_arguments).collect(),
        );
        self.specialized_functions.insert(encoded_specialized_fn_name, Some(rewritten_fn));
      }
      encoded_specialized_fn_name
    } else {
      original_name
    }
  }

  fn rewrite_types(
    &mut self,
    heap: &mut Heap,
    types: &[hir::Type],
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> Vec<mir::Type> {
    types.iter().map(|t| self.rewrite_type(heap, t, generics_replacement_map)).collect_vec()
  }

  fn rewrite_type(
    &mut self,
    heap: &mut Heap,
    type_: &hir::Type,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Type {
    match type_ {
      hir::Type::Int => mir::Type::Int,
      hir::Type::Id(id) => self.rewrite_id_type(heap, id, generics_replacement_map),
    }
  }

  fn rewrite_id_type(
    &mut self,
    heap: &mut Heap,
    id_type: &hir::IdType,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Type {
    if id_type.type_arguments.is_empty() {
      if let Some(replacement) = generics_replacement_map.get(&id_type.name) {
        return *replacement;
      }
    }
    let concrete_type_hir_targs = id_type
      .type_arguments
      .iter()
      .map(|t| mir_to_hir_type(&self.rewrite_type(heap, t, generics_replacement_map)))
      .collect_vec();
    let concrete_type = hir::IdType { name: id_type.name, type_arguments: concrete_type_hir_targs };
    let encoded_name = heap.alloc_string(encode_name_after_generics_specialization(
      heap,
      id_type.name,
      &concrete_type.type_arguments,
    ));
    if self.specialized_type_definitions.get(&encoded_name).is_none() {
      if let Some(type_def) = self.original_type_defs.get(&concrete_type.name).cloned() {
        let solved_targs_replacement_map: HashMap<PStr, hir::Type> = type_def
          .type_parameters
          .iter()
          .cloned()
          .zip(solve_type_arguments(
            &type_def.type_parameters,
            &concrete_type,
            &hir::IdType {
              name: concrete_type.name,
              type_arguments: type_def
                .type_parameters
                .iter()
                .cloned()
                .map(hir::Type::new_id_no_targs)
                .collect_vec(),
            },
          ))
          .collect();
        self.specialized_type_definitions.insert(encoded_name, None);
        let rewritten_mappings = match &type_def.mappings {
          hir::TypeDefinitionMappings::Struct(types) => mir::TypeDefinitionMappings::Struct(
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
          hir::TypeDefinitionMappings::Enum => mir::TypeDefinitionMappings::Enum,
        };
        self.specialized_type_definitions.insert(
          encoded_name,
          Some(mir::TypeDefinition {
            identifier: encoded_name,
            names: type_def.names,
            mappings: rewritten_mappings,
          }),
        );
      } else if self.specialized_closure_definitions.get(&encoded_name).is_none() {
        let closure_def = self
          .original_closure_defs
          .get(&concrete_type.name)
          .cloned()
          .expect(&format!("Missing {}", concrete_type.name.as_str(heap)));
        let solved_targs_replacement_map: HashMap<PStr, hir::Type> = closure_def
          .type_parameters
          .iter()
          .cloned()
          .zip(solve_type_arguments(
            &closure_def.type_parameters,
            &concrete_type,
            &hir::IdType {
              name: concrete_type.name,
              type_arguments: closure_def
                .type_parameters
                .iter()
                .cloned()
                .map(hir::Type::new_id_no_targs)
                .collect_vec(),
            },
          ))
          .collect();
        self.specialized_closure_definitions.insert(encoded_name, None);
        let rewritten_fn_type = self.rewrite_fn_type(
          heap,
          &fn_type_application(&closure_def.function_type, &solved_targs_replacement_map),
          &HashMap::new(),
        );
        self.specialized_closure_definitions.insert(
          encoded_name,
          Some(mir::ClosureTypeDefinition {
            identifier: encoded_name,
            function_type: rewritten_fn_type,
          }),
        );
      }
    }
    self.specialized_id_type_mappings.insert(encoded_name, concrete_type.name);
    mir::Type::Id(encoded_name)
  }

  fn rewrite_fn_type(
    &mut self,
    heap: &mut Heap,
    hir::FunctionType { argument_types, return_type }: &hir::FunctionType,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::FunctionType {
    mir::FunctionType {
      argument_types: self.rewrite_types(heap, argument_types, generics_replacement_map),
      return_type: Box::new(self.rewrite_type(heap, return_type, generics_replacement_map)),
    }
  }
}

fn option_valued_bmap_into_vec<K, T: Debug>(map: BTreeMap<K, Option<T>>) -> Vec<T> {
  map.into_values().map(|v| v.unwrap()).collect_vec()
}

pub(super) fn perform_generics_specialization(
  heap: &mut Heap,
  hir::Sources {
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions,
  }: hir::Sources,
) -> mir::Sources {
  let mut rewriter = Rewriter {
    original_closure_defs: closure_types.into_iter().map(|it| (it.identifier, it)).collect(),
    original_type_defs: type_definitions.into_iter().map(|it| (it.identifier, it)).collect(),
    original_functions: functions.into_iter().map(|it| (it.name, it)).collect(),
    used_string_names: HashSet::new(),
    specialized_id_type_mappings: HashMap::new(),
    specialized_closure_definitions: BTreeMap::new(),
    specialized_type_definitions: BTreeMap::new(),
    specialized_functions: BTreeMap::new(),
  };
  let empty_replacement_map = HashMap::new();
  for main_fn_name in &main_function_names {
    let original_fn = rewriter.original_functions.get(main_fn_name).cloned().unwrap();
    let fn_type = mir::FunctionType {
      argument_types: rewriter.rewrite_types(
        heap,
        &original_fn.type_.argument_types,
        &empty_replacement_map,
      ),
      return_type: Box::new(rewriter.rewrite_type(
        heap,
        &original_fn.type_.return_type,
        &empty_replacement_map,
      )),
    };
    let rewritten =
      rewriter.rewrite_function(heap, &original_fn, *main_fn_name, fn_type, &HashMap::new());
    rewriter.specialized_functions.insert(*main_fn_name, Some(rewritten));
  }
  let Rewriter {
    used_string_names,
    specialized_closure_definitions,
    specialized_type_definitions,
    specialized_functions,
    ..
  } = rewriter;
  mir::Sources {
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_string_names.contains(&it.name))
      .collect(),
    closure_types: option_valued_bmap_into_vec(specialized_closure_definitions),
    type_definitions: option_valued_bmap_into_vec(specialized_type_definitions),
    main_function_names,
    functions: option_valued_bmap_into_vec(specialized_functions),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{
    ast::hir::{GlobalVariable, Operator},
    common::well_known_pstrs,
  };
  use pretty_assertions::assert_eq;

  fn assert_specialized(sources: hir::Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected.trim(), perform_generics_specialization(heap, sources).debug_print(heap));
  }

  #[test]
  fn empty_test() {
    assert_specialized(
      hir::Sources {
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
      hir::Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          hir::Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: vec![],
            return_value: hir::ZERO,
          },
          hir::Function {
            name: heap.alloc_str_for_test("main2"),
            parameters: vec![],
            type_parameters: vec![],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: vec![],
            return_value: hir::ZERO,
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
      hir::Sources {
        global_variables: vec![GlobalVariable {
          name: heap.alloc_str_for_test("G1"),
          content: heap.alloc_str_for_test(""),
        }],
        closure_types: vec![],
        type_definitions: vec![hir::TypeDefinition {
          identifier: well_known_pstrs::UNDERSCORE_STR,
          type_parameters: vec![],
          names: vec![],
          mappings: hir::TypeDefinitionMappings::Enum,
        }],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![hir::Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
          body: vec![hir::Statement::Call {
            callee: hir::Callee::FunctionName(hir::FunctionName::new(
              heap.alloc_str_for_test("__builtins_println"),
              hir::Type::new_fn_unwrapped(vec![hir::STRING_TYPE], hir::INT_TYPE),
            )),
            arguments: vec![hir::Expression::StringName(heap.alloc_str_for_test("G1"))],
            return_type: hir::INT_TYPE,
            return_collector: None,
          }],
          return_value: hir::ZERO,
        }],
      },
      heap,
      r#"const G1 = '';

variant type _Str
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

    let sources = hir::Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![hir::TypeDefinition {
        identifier: well_known_pstrs::UNDERSCORE_STR,
        type_parameters: vec![],
        names: vec![],
        mappings: hir::TypeDefinitionMappings::Enum,
      }],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![hir::Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
        body: vec![hir::Statement::Break(hir::ZERO)],
        return_value: hir::ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[should_panic]
  #[test]
  fn panic_test_2() {
    let heap = &mut Heap::new();

    let sources = hir::Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![hir::TypeDefinition {
        identifier: well_known_pstrs::UNDERSCORE_STR,
        type_parameters: vec![],
        names: vec![],
        mappings: hir::TypeDefinitionMappings::Enum,
      }],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![hir::Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
        body: vec![hir::Statement::SingleIf {
          condition: hir::ZERO,
          invert_condition: false,
          statements: vec![],
        }],
        return_value: hir::ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[should_panic]
  #[test]
  fn panic_test_3() {
    let heap = &mut Heap::new();

    let sources = hir::Sources {
      global_variables: vec![],
      closure_types: vec![],
      type_definitions: vec![hir::TypeDefinition {
        identifier: well_known_pstrs::UNDERSCORE_STR,
        type_parameters: vec![],
        names: vec![],
        mappings: hir::TypeDefinitionMappings::Enum,
      }],
      main_function_names: vec![heap.alloc_str_for_test("main")],
      functions: vec![hir::Function {
        name: heap.alloc_str_for_test("main"),
        parameters: vec![],
        type_parameters: vec![],
        type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
        body: vec![hir::Statement::While {
          loop_variables: vec![],
          statements: vec![],
          break_collector: None,
        }],
        return_value: hir::ZERO,
      }],
    };
    perform_generics_specialization(heap, sources);
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let type_a = hir::Type::new_id_no_targs(heap.alloc_str_for_test("A"));
    let type_b = hir::Type::new_id_no_targs(heap.alloc_str_for_test("B"));
    let type_j = hir::Type::new_id_no_targs(heap.alloc_str_for_test("J"));
    let type_ia =
      hir::Type::new_id(heap.alloc_str_for_test("I"), vec![type_a.clone(), hir::STRING_TYPE]);
    let type_ib =
      hir::Type::new_id(heap.alloc_str_for_test("I"), vec![hir::INT_TYPE, type_b.clone()]);
    let type_i =
      hir::Type::new_id(heap.alloc_str_for_test("I"), vec![hir::INT_TYPE, hir::STRING_TYPE]);
    let g1 = hir::Expression::StringName(heap.alloc_str_for_test("G1"));
    assert_specialized(
      hir::Sources {
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
        closure_types: vec![hir::ClosureTypeDefinition {
          identifier: heap.alloc_str_for_test("CC"),
          type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
          function_type: hir::Type::new_fn_unwrapped(vec![type_a.clone()], type_b.clone()),
        }],
        type_definitions: vec![
          hir::TypeDefinition {
            identifier: heap.alloc_str_for_test("I"),
            type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
            names: vec![],
            mappings: hir::TypeDefinitionMappings::Enum,
          },
          hir::TypeDefinition {
            identifier: heap.alloc_str_for_test("J"),
            type_parameters: vec![],
            names: vec![],
            mappings: hir::TypeDefinitionMappings::Struct(vec![hir::INT_TYPE]),
          },
          hir::TypeDefinition {
            identifier: well_known_pstrs::UNDERSCORE_STR,
            type_parameters: vec![],
            names: vec![],
            mappings: hir::TypeDefinitionMappings::Enum,
          },
        ],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          hir::Function {
            name: heap.alloc_str_for_test("functor_fun"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: hir::Type::new_fn_unwrapped(vec![type_a.clone()], hir::INT_TYPE),
            body: vec![hir::Statement::Call {
              callee: hir::Callee::FunctionName(hir::FunctionName::new(
                heap.alloc_str_for_test("$GENERICS$_A$bar"),
                hir::Type::new_fn_unwrapped(vec![type_a.clone()], hir::INT_TYPE),
              )),
              arguments: vec![hir::ZERO],
              return_type: hir::INT_TYPE,
              return_collector: None,
            }],
            return_value: hir::ZERO,
          },
          hir::Function {
            name: heap.alloc_str_for_test("_I$bar"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: vec![],
            return_value: hir::ZERO,
          },
          hir::Function {
            name: heap.alloc_str_for_test("_J$bar"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: vec![],
            return_value: hir::ZERO,
          },
          hir::Function {
            name: heap.alloc_str_for_test("creatorIA"),
            parameters: vec![heap.alloc_str_for_test("a")],
            type_parameters: vec![heap.alloc_str_for_test("A")],
            type_: hir::Type::new_fn_unwrapped(vec![type_a.clone()], type_ia.clone()),
            body: vec![hir::Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ia.clone().into_id().unwrap(),
              expression_list: vec![
                hir::Expression::int(0),
                hir::Expression::var_name(heap.alloc_str_for_test("a"), type_a),
              ],
            }],
            return_value: hir::Expression::var_name(heap.alloc_str_for_test("v"), type_ia),
          },
          hir::Function {
            name: heap.alloc_str_for_test("creatorIB"),
            parameters: vec![heap.alloc_str_for_test("b")],
            type_parameters: vec![heap.alloc_str_for_test("B")],
            type_: hir::Type::new_fn_unwrapped(vec![type_b.clone()], type_ib.clone()),
            body: vec![hir::Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ib.clone().into_id().unwrap(),
              expression_list: vec![
                hir::Expression::int(1),
                hir::Expression::var_name(heap.alloc_str_for_test("b"), type_b),
              ],
            }],
            return_value: hir::Expression::var_name(heap.alloc_str_for_test("v"), type_ib),
          },
          hir::Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: hir::Type::new_fn_unwrapped(vec![], hir::INT_TYPE),
            body: vec![hir::Statement::IfElse {
              condition: hir::ONE,
              s1: vec![
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], type_i.clone()),
                    type_arguments: vec![hir::INT_TYPE],
                  }),
                  arguments: vec![hir::ZERO],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("a")),
                },
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: hir::Type::new_fn_unwrapped(
                      vec![hir::STRING_TYPE],
                      hir::Type::new_id(
                        heap.alloc_str_for_test("I"),
                        vec![hir::STRING_TYPE, hir::STRING_TYPE],
                      ),
                    ),
                    type_arguments: vec![hir::STRING_TYPE],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("a2")),
                },
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName {
                    name: heap.alloc_str_for_test("creatorIB"),
                    type_: hir::Type::new_fn_unwrapped(vec![hir::STRING_TYPE], type_i.clone()),
                    type_arguments: vec![hir::STRING_TYPE],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: Some(heap.alloc_str_for_test("b")),
                },
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName {
                    name: heap.alloc_str_for_test("functor_fun"),
                    type_: hir::Type::new_fn_unwrapped(vec![type_i.clone()], hir::INT_TYPE),
                    type_arguments: vec![type_i.clone()],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_i.clone(),
                  return_collector: None,
                },
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName {
                    name: heap.alloc_str_for_test("functor_fun"),
                    type_: hir::Type::new_fn_unwrapped(vec![type_j.clone()], hir::INT_TYPE),
                    type_arguments: vec![type_j.clone()],
                  }),
                  arguments: vec![g1.clone()],
                  return_type: type_j.clone(),
                  return_collector: None,
                },
                hir::Statement::IndexedAccess {
                  name: heap.alloc_str_for_test("v1"),
                  type_: hir::INT_TYPE,
                  pointer_expression: hir::Expression::var_name(
                    heap.alloc_str_for_test("a"),
                    type_i,
                  ),
                  index: 0,
                },
                hir::Statement::Cast {
                  name: heap.alloc_str_for_test("cast"),
                  type_: hir::INT_TYPE,
                  assigned_expression: hir::Expression::var_name(
                    heap.alloc_str_for_test("a"),
                    hir::INT_TYPE,
                  ),
                },
              ],
              s2: vec![
                hir::Statement::Call {
                  callee: hir::Callee::FunctionName(hir::FunctionName::new(
                    heap.alloc_str_for_test("main"),
                    hir::Type::new_fn_unwrapped(vec![], hir::INT_TYPE),
                  )),
                  arguments: vec![],
                  return_type: hir::INT_TYPE,
                  return_collector: None,
                },
                hir::Statement::binary(
                  heap.alloc_str_for_test("v1"),
                  Operator::PLUS,
                  hir::ZERO,
                  hir::ZERO,
                ),
                hir::Statement::StructInit {
                  struct_variable_name: heap.alloc_str_for_test("j"),
                  type_: type_j.clone().into_id().unwrap(),
                  expression_list: vec![hir::Expression::int(0)],
                },
                hir::Statement::IndexedAccess {
                  name: heap.alloc_str_for_test("v2"),
                  type_: hir::INT_TYPE,
                  pointer_expression: hir::Expression::var_name(
                    heap.alloc_str_for_test("j"),
                    type_j,
                  ),
                  index: 0,
                },
                hir::Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("c1"),
                  closure_type: hir::Type::new_id_unwrapped(
                    heap.alloc_str_for_test("CC"),
                    vec![hir::STRING_TYPE, hir::STRING_TYPE],
                  ),
                  function_name: hir::FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: hir::Type::new_fn_unwrapped(
                      vec![hir::STRING_TYPE],
                      hir::Type::new_id(
                        heap.alloc_str_for_test("I"),
                        vec![hir::STRING_TYPE, hir::STRING_TYPE],
                      ),
                    ),
                    type_arguments: vec![hir::STRING_TYPE],
                  },
                  context: g1.clone(),
                },
                hir::Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("c2"),
                  closure_type: hir::Type::new_id_unwrapped(
                    heap.alloc_str_for_test("CC"),
                    vec![hir::INT_TYPE, hir::STRING_TYPE],
                  ),
                  function_name: hir::FunctionName {
                    name: heap.alloc_str_for_test("creatorIA"),
                    type_: hir::Type::new_fn_unwrapped(
                      vec![hir::STRING_TYPE],
                      hir::Type::new_id(
                        heap.alloc_str_for_test("I"),
                        vec![hir::STRING_TYPE, hir::STRING_TYPE],
                      ),
                    ),
                    type_arguments: vec![hir::STRING_TYPE],
                  },
                  context: g1,
                },
              ],
              final_assignments: vec![(
                heap.alloc_str_for_test("finalV"),
                hir::INT_TYPE,
                hir::Expression::var_name(heap.alloc_str_for_test("v1"), hir::INT_TYPE),
                hir::Expression::var_name(heap.alloc_str_for_test("v2"), hir::INT_TYPE),
              )],
            }],
            return_value: hir::ZERO,
          },
        ],
      },
      heap,
      r#"
const G1 = '';

closure type CC__Str__Str = (_Str) -> _Str
closure type CC_int__Str = (int) -> _Str
object type J = [int]
variant type _Str
variant type I_int__Str
variant type I__Str__Str
function _I$bar(a: I_int__Str): int {
  return 0;
}

function _J$bar(a: J): int {
  return 0;
}

function main(): int {
  let finalV: int;
  if 1 {
    let a: I_int__Str = creatorIA_int(0);
    let a2: I_int__Str = creatorIA__Str(G1);
    let b: I_int__Str = creatorIB__Str(G1);
    functor_fun_I_int__Str(G1);
    functor_fun_J(G1);
    let v1: int = (a: I_int__Str)[0];
    let cast = (a: int) as int;
    finalV = (v1: int);
  } else {
    main();
    let v1 = 0 + 0;
    let j: J = [0];
    let v2: int = (j: J)[0];
    let c1: CC__Str__Str = Closure { fun: (creatorIA__Str: (_Str) -> I__Str__Str), context: G1 };
    let c2: CC_int__Str = Closure { fun: (creatorIA__Str: (_Str) -> I__Str__Str), context: G1 };
    finalV = (v2: int);
  }
  return 0;
}

function creatorIA_int(a: int): I_int__Str {
  let v: I_int__Str = [0, (a: int)];
  return (v: I_int__Str);
}

function creatorIA__Str(a: _Str): I__Str__Str {
  let v: I__Str__Str = [0, (a: _Str)];
  return (v: I__Str__Str);
}

function creatorIB__Str(b: _Str): I_int__Str {
  let v: I_int__Str = [1, (b: _Str)];
  return (v: I_int__Str);
}

function functor_fun_I_int__Str(a: I_int__Str): int {
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
      hir::Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![
          hir::TypeDefinition {
            identifier: heap.alloc_str_for_test("I"),
            type_parameters: vec![heap.alloc_str_for_test("A"), heap.alloc_str_for_test("B")],
            names: vec![],
            mappings: hir::TypeDefinitionMappings::Enum,
          },
          hir::TypeDefinition {
            identifier: heap.alloc_str_for_test("J"),
            type_parameters: vec![],
            names: vec![],
            mappings: hir::TypeDefinitionMappings::Struct(vec![hir::Type::new_id(
              heap.alloc_str_for_test("I"),
              vec![hir::INT_TYPE, hir::INT_TYPE],
            )]),
          },
        ],
        main_function_names: vec![heap.alloc_str_for_test("main")],
        functions: vec![
          hir::Function {
            name: heap.alloc_str_for_test("creatorJ"),
            parameters: vec![],
            type_parameters: vec![],
            type_: hir::Type::new_fn_unwrapped(
              vec![],
              hir::Type::new_id_no_targs(heap.alloc_str_for_test("J")),
            ),
            body: vec![
              hir::Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v1"),
                type_: hir::Type::new_id_unwrapped(
                  heap.alloc_str_for_test("I"),
                  vec![hir::INT_TYPE, hir::INT_TYPE],
                ),
                expression_list: vec![],
              },
              hir::Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v2"),
                type_: hir::Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("J")),
                expression_list: vec![hir::ZERO, hir::ZERO],
              },
            ],
            return_value: hir::Expression::var_name(
              heap.alloc_str_for_test("v2"),
              hir::Type::new_id_no_targs(heap.alloc_str_for_test("J")),
            ),
          },
          hir::Function {
            name: heap.alloc_str_for_test("main"),
            parameters: vec![],
            type_parameters: vec![],
            type_: hir::Type::new_fn_unwrapped(vec![], hir::INT_TYPE),
            body: vec![
              hir::Statement::Call {
                callee: hir::Callee::FunctionName(hir::FunctionName::new(
                  heap.alloc_str_for_test("creatorJ"),
                  hir::Type::new_fn_unwrapped(
                    vec![],
                    hir::Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                  ),
                )),
                arguments: vec![],
                return_type: hir::Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                return_collector: None,
              },
              hir::Statement::Call {
                callee: hir::Callee::Variable(hir::VariableName {
                  name: heap.alloc_str_for_test("v"),
                  type_: hir::INT_TYPE,
                }),
                arguments: vec![],
                return_type: hir::Type::new_id_no_targs(heap.alloc_str_for_test("J")),
                return_collector: None,
              },
            ],
            return_value: hir::Expression::StringName(heap.alloc_str_for_test("creatorJ")),
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
