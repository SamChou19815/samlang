use itertools::Itertools;
use samlang_ast::{hir, mir};
use samlang_heap::{Heap, PStr};
use std::collections::{HashMap, HashSet};

struct Rewriter {
  original_closure_defs: HashMap<hir::TypeName, hir::ClosureTypeDefinition>,
  original_type_defs: HashMap<hir::TypeName, hir::TypeDefinition>,
  original_functions: HashMap<mir::FunctionName, hir::Function>,
  used_string_names: HashSet<PStr>,
  specialized_type_definition_names: HashSet<mir::TypeNameId>,
  specialized_function_names: HashSet<mir::FunctionName>,
  specialized_closure_definitions: Vec<mir::ClosureTypeDefinition>,
  specialized_type_definitions: HashMap<mir::TypeNameId, mir::TypeDefinition>,
  specialized_functions: Vec<mir::Function>,
  symbol_table: mir::SymbolTable,
}

impl Rewriter {
  fn rewrite_function(
    &mut self,
    heap: &mut Heap,
    f: &hir::Function,
    new_name: mir::FunctionName,
    new_type: mir::FunctionType,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Function {
    mir::Function {
      name: new_name,
      parameters: f.parameters.clone(),
      type_: new_type,
      body: self.rewrite_stmts(heap, &f.body, generics_replacement_map),
      return_value: self.rewrite_expr(heap, &f.return_value, generics_replacement_map),
    }
  }

  fn rewrite_stmts(
    &mut self,
    heap: &mut Heap,
    stmts: &[hir::Statement],
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> Vec<mir::Statement> {
    let mut collector = Vec::with_capacity(stmts.len().next_power_of_two());
    for stmt in stmts {
      self.rewrite_stmt(heap, stmt, generics_replacement_map, &mut collector);
    }
    collector
  }

  fn rewrite_stmt(
    &mut self,
    heap: &mut Heap,
    stmt: &hir::Statement,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
    collector: &mut Vec<mir::Statement>,
  ) {
    match stmt {
      hir::Statement::Not { name, operand } => {
        collector.push(mir::Statement::Not {
          name: *name,
          operand: self.rewrite_expr(heap, operand, generics_replacement_map),
        });
      }
      hir::Statement::Binary { name, operator, e1, e2 } => {
        collector.push(mir::Statement::Binary(mir::Statement::binary_unwrapped(
          *name,
          *operator,
          self.rewrite_expr(heap, e1, generics_replacement_map),
          self.rewrite_expr(heap, e2, generics_replacement_map),
        )));
      }
      hir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        collector.push(mir::Statement::IndexedAccess {
          name: *name,
          type_: self.rewrite_type(heap, type_, generics_replacement_map),
          pointer_expression: self.rewrite_expr(heap, pointer_expression, generics_replacement_map),
          index: *index,
        });
      }
      hir::Statement::Call { callee, arguments, return_type, return_collector } => {
        collector.push(mir::Statement::Call {
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
        });
      }
      hir::Statement::ConditionalDestructure {
        test_expr: hir_test_expr,
        tag,
        bindings,
        s1,
        s2,
        final_assignments,
      } => {
        let test_expr = self.rewrite_expr(heap, hir_test_expr, generics_replacement_map);
        let enum_type = *test_expr.as_variable().unwrap().type_.as_id().unwrap();
        match self.get_subtype(enum_type, *tag) {
          mir::EnumTypeDefinition::Boxed(_) => {
            let subtype = mir::Type::Id(
              self.symbol_table.derived_type_name_with_subtype_tag(enum_type, *tag as u32),
            );
            let variable_for_tag = heap.alloc_temp_str();
            let comparison_temp = heap.alloc_temp_str();
            let casted_collector = heap.alloc_temp_str();
            collector.push(mir::Statement::IndexedAccess {
              name: variable_for_tag,
              type_: mir::INT_32_TYPE,
              pointer_expression: test_expr,
              index: 0,
            });
            collector.push(mir::Statement::binary(
              comparison_temp,
              hir::BinaryOperator::EQ,
              mir::Expression::var_name(variable_for_tag, mir::INT_32_TYPE),
              mir::Expression::i32(i32::try_from(*tag * 2 + 1).unwrap()),
            ));
            let mut nested_stmts = Vec::new();
            // Once we pass the check, we can cast the general enum type to a
            // more specific subtype.
            nested_stmts.push(mir::Statement::Cast {
              name: casted_collector,
              type_: subtype,
              assigned_expression: test_expr,
            });
            for (i, binding) in bindings.iter().enumerate() {
              if let Some((name, type_)) = binding {
                nested_stmts.push(mir::Statement::IndexedAccess {
                  name: *name,
                  type_: self.rewrite_type(heap, type_, generics_replacement_map),
                  pointer_expression: mir::Expression::var_name(casted_collector, subtype),
                  index: i + 1,
                });
              }
            }
            nested_stmts.append(&mut self.rewrite_stmts(heap, s1, generics_replacement_map));
            collector.push(mir::Statement::IfElse {
              condition: mir::Expression::var_name(comparison_temp, mir::INT_32_TYPE),
              s1: nested_stmts,
              s2: self.rewrite_stmts(heap, s2, generics_replacement_map),
              final_assignments: self.rewrite_final_assignments(
                final_assignments,
                heap,
                generics_replacement_map,
              ),
            });
          }
          // If we are pattern matching on an unboxed case, it means that `unboxed_t` must be a
          // pointer type. Therefore, we only need to check whether the test expression is a pointer.
          mir::EnumTypeDefinition::Unboxed(unboxed_t) => {
            debug_assert!(bindings.len() == 1);
            let binded_name = bindings[0].as_ref().unwrap().0;
            let casted_int_collector = heap.alloc_temp_str();
            let comparison_temp = heap.alloc_temp_str();
            // We need to case the high level expression into int so we can
            // do low-level bitwise is-pointer check.
            collector.push(mir::Statement::Cast {
              name: casted_int_collector,
              type_: mir::INT_32_TYPE,
              assigned_expression: test_expr,
            });
            // Here we test whether this is a pointer
            collector.push(mir::Statement::IsPointer {
              name: comparison_temp,
              pointer_type: *unboxed_t,
              operand: mir::Expression::var_name(casted_int_collector, mir::INT_32_TYPE),
            });
            let mut nested_stmts = Vec::new();
            // Once we pass the is-pointer check, we can cast the test expression to the underlying
            // unboxed pointer type.
            nested_stmts.push(mir::Statement::Cast {
              name: binded_name,
              type_: mir::Type::Id(*unboxed_t),
              assigned_expression: test_expr,
            });
            nested_stmts.append(&mut self.rewrite_stmts(heap, s1, generics_replacement_map));
            collector.push(mir::Statement::IfElse {
              condition: mir::Expression::var_name(comparison_temp, mir::INT_32_TYPE),
              s1: nested_stmts,
              s2: self.rewrite_stmts(heap, s2, generics_replacement_map),
              final_assignments: self.rewrite_final_assignments(
                final_assignments,
                heap,
                generics_replacement_map,
              ),
            });
          }
          mir::EnumTypeDefinition::Int31 => {
            let casted_collector = heap.alloc_temp_str();
            let comparison_temp = heap.alloc_temp_str();
            // We cast the test expression to int to perform the test.
            // Once we have i31 type, the test should be performed on i31.
            collector.push(mir::Statement::Cast {
              name: casted_collector,
              type_: mir::INT_31_TYPE,
              assigned_expression: test_expr,
            });
            collector.push(mir::Statement::binary(
              comparison_temp,
              hir::BinaryOperator::EQ,
              mir::Expression::var_name(casted_collector, mir::INT_32_TYPE),
              mir::Expression::Int31Literal(i32::try_from(*tag).unwrap()),
            ));
            collector.push(mir::Statement::IfElse {
              condition: mir::Expression::var_name(comparison_temp, mir::INT_32_TYPE),
              s1: self.rewrite_stmts(heap, s1, generics_replacement_map),
              s2: self.rewrite_stmts(heap, s2, generics_replacement_map),
              final_assignments: self.rewrite_final_assignments(
                final_assignments,
                heap,
                generics_replacement_map,
              ),
            });
          }
        }
      }
      hir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        collector.push(mir::Statement::IfElse {
          condition: self.rewrite_expr(heap, condition, generics_replacement_map),
          s1: self.rewrite_stmts(heap, s1, generics_replacement_map),
          s2: self.rewrite_stmts(heap, s2, generics_replacement_map),
          final_assignments: self.rewrite_final_assignments(
            final_assignments,
            heap,
            generics_replacement_map,
          ),
        });
      }
      hir::Statement::LateInitDeclaration { name, type_ } => {
        collector.push(mir::Statement::LateInitDeclaration {
          name: *name,
          type_: self.rewrite_type(heap, type_, generics_replacement_map),
        })
      }
      hir::Statement::LateInitAssignment { name, assigned_expression } => {
        collector.push(mir::Statement::LateInitAssignment {
          name: *name,
          assigned_expression: self.rewrite_expr(
            heap,
            assigned_expression,
            generics_replacement_map,
          ),
        })
      }
      hir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_name =
          self.rewrite_id_type(heap, type_, generics_replacement_map).into_id().unwrap();
        collector.push(mir::Statement::StructInit {
          struct_variable_name: *struct_variable_name,
          type_name,
          expression_list: self.rewrite_expressions(
            heap,
            expression_list,
            generics_replacement_map,
          ),
        });
      }
      hir::Statement::EnumInit {
        enum_variable_name,
        enum_type: hir_enum_type,
        tag,
        associated_data_list,
      } => {
        let temp = heap.alloc_temp_str();
        let enum_type =
          self.rewrite_id_type(heap, hir_enum_type, generics_replacement_map).into_id().unwrap();
        match self.get_subtype(enum_type, *tag) {
          mir::EnumTypeDefinition::Boxed(_) => {
            let subtype_name =
              self.symbol_table.derived_type_name_with_subtype_tag(enum_type, *tag as u32);
            collector.push(mir::Statement::StructInit {
              struct_variable_name: temp,
              type_name: subtype_name,
              expression_list: vec![mir::Expression::i32(i32::try_from(*tag * 2 + 1).unwrap())]
                .into_iter()
                .chain(
                  associated_data_list
                    .iter()
                    .map(|e| self.rewrite_expr(heap, e, generics_replacement_map)),
                )
                .collect(),
            });
            // Cast from more specific subtype to the general enum type.
            collector.push(mir::Statement::Cast {
              name: *enum_variable_name,
              type_: mir::Type::Id(enum_type),
              assigned_expression: mir::Expression::var_name(temp, mir::Type::Id(subtype_name)),
            });
          }
          mir::EnumTypeDefinition::Unboxed(_) => {
            debug_assert_eq!(associated_data_list.len(), 1);
            // Cast from more specific subtype to the general enum type.
            collector.push(mir::Statement::Cast {
              name: *enum_variable_name,
              type_: mir::Type::Id(enum_type),
              assigned_expression: self.rewrite_expr(
                heap,
                &associated_data_list[0],
                generics_replacement_map,
              ),
            });
          }
          mir::EnumTypeDefinition::Int31 => {
            debug_assert!(associated_data_list.is_empty());
            // Cast from more specific subtype to the general enum type.
            collector.push(mir::Statement::Cast {
              name: *enum_variable_name,
              type_: mir::Type::Id(enum_type),
              assigned_expression: mir::Expression::Int31Literal(i32::try_from(*tag).unwrap()),
            });
          }
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
        collector.push(mir::Statement::ClosureInit {
          closure_variable_name: *closure_variable_name,
          closure_type_name,
          function_name: self.rewrite_fn_name_expr(heap, function_name, generics_replacement_map),
          context: self.rewrite_expr(heap, context, generics_replacement_map),
        });
      }
    }
  }

  fn rewrite_final_assignments(
    &mut self,
    final_assignments: &[(PStr, hir::Type, hir::Expression, hir::Expression)],
    heap: &mut Heap,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> Vec<mir::IfElseFinalAssignment> {
    final_assignments
      .iter()
      .map(|(n, t, e1, e2)| mir::IfElseFinalAssignment {
        name: *n,
        type_: self.rewrite_type(heap, t, generics_replacement_map),
        e1: self.rewrite_expr(heap, e1, generics_replacement_map),
        e2: self.rewrite_expr(heap, e2, generics_replacement_map),
      })
      .collect_vec()
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
      hir::Expression::IntLiteral(i) => mir::Expression::Int32Literal(*i),
      hir::Expression::Int31Zero => mir::Expression::Int31Literal(0),
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
    hir::FunctionNameExpression { name, type_, type_arguments }: &hir::FunctionNameExpression,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::FunctionNameExpression {
    let fn_type = self.rewrite_fn_type(heap, type_, generics_replacement_map);
    let rewritten_targs = self.rewrite_types(heap, type_arguments, generics_replacement_map);
    let rewritten_name =
      self.rewrite_fn_name(heap, *name, fn_type.clone(), rewritten_targs, generics_replacement_map);
    mir::FunctionNameExpression { name: rewritten_name, type_: fn_type }
  }

  fn rewrite_fn_name(
    &mut self,
    heap: &mut Heap,
    original_name: hir::FunctionName,
    function_type: mir::FunctionType,
    function_type_arguments: Vec<mir::Type>,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::FunctionName {
    if original_name.type_name.module_reference.is_none() {
      let generic_class_name = original_name.type_name.type_name;
      let fn_name = original_name.fn_name;
      let replacement_class =
        generics_replacement_map.get(&generic_class_name).unwrap().as_id().unwrap();
      let rewritten_fn_name = mir::FunctionName { type_name: *replacement_class, fn_name };
      self.rewrite_non_generic_fn_name(
        heap,
        rewritten_fn_name,
        function_type,
        function_type_arguments,
      )
    } else {
      let mir_fn_name = mir::FunctionName {
        type_name: self.symbol_table.create_simple_type_name(
          original_name.type_name.module_reference.unwrap(),
          original_name.type_name.type_name,
        ),
        fn_name: original_name.fn_name,
      };
      self.rewrite_non_generic_fn_name(heap, mir_fn_name, function_type, function_type_arguments)
    }
  }

  fn rewrite_non_generic_fn_name(
    &mut self,
    heap: &mut Heap,
    original_name: mir::FunctionName,
    function_type: mir::FunctionType,
    function_type_arguments: Vec<mir::Type>,
  ) -> mir::FunctionName {
    if let Some(existing_fn) = self.original_functions.get(&original_name).cloned() {
      let encoded_specialized_fn_name = mir::FunctionName {
        type_name: self
          .symbol_table
          .derived_type_name_with_suffix(original_name.type_name, function_type_arguments.clone()),
        fn_name: original_name.fn_name,
      };
      if !self.specialized_function_names.contains(&encoded_specialized_fn_name) {
        self.specialized_function_names.insert(encoded_specialized_fn_name);
        let rewritten_fn = self.rewrite_function(
          heap,
          &existing_fn,
          encoded_specialized_fn_name,
          function_type,
          &existing_fn.type_parameters.iter().cloned().zip(function_type_arguments).collect(),
        );
        self.specialized_functions.push(rewritten_fn);
      }
      encoded_specialized_fn_name
    } else {
      original_name
    }
  }

  /// Invariant: enum type has already been specialized.
  /// Returns: rewritten type, whether the result is optimized
  fn get_subtype(
    &mut self,
    mir_enum_type: mir::TypeNameId,
    tag: usize,
  ) -> &mir::EnumTypeDefinition {
    &self.specialized_type_definitions.get(&mir_enum_type).unwrap().mappings.as_enum().unwrap()[tag]
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
      hir::Type::Int32 => mir::Type::Int32,
      hir::Type::Int31 => mir::Type::Int31,
      hir::Type::Id(id) => self.rewrite_id_type(heap, id, generics_replacement_map),
    }
  }

  fn rewrite_id_type(
    &mut self,
    heap: &mut Heap,
    id_type: &hir::IdType,
    generics_replacement_map: &HashMap<PStr, mir::Type>,
  ) -> mir::Type {
    if id_type.name.module_reference.is_none() {
      return *generics_replacement_map.get(&id_type.name.type_name).unwrap();
    }
    let concrete_type_mir_targs = id_type
      .type_arguments
      .iter()
      .map(|t| self.rewrite_type(heap, t, generics_replacement_map))
      .collect_vec();
    let mir_type_name = self.symbol_table.create_type_name_with_suffix(
      id_type.name.module_reference.unwrap(),
      id_type.name.type_name,
      concrete_type_mir_targs.clone(),
    );
    if !self.specialized_type_definition_names.contains(&mir_type_name) {
      self.specialized_type_definition_names.insert(mir_type_name);
      if let Some(type_def) = self.original_type_defs.get(&id_type.name).cloned() {
        let solved_targs_replacement_map: HashMap<PStr, mir::Type> =
          type_def.type_parameters.iter().cloned().zip(concrete_type_mir_targs).collect();
        let rewritten_mappings = match &type_def.mappings {
          hir::TypeDefinitionMappings::Struct(types) => mir::TypeDefinitionMappings::Struct(
            types
              .iter()
              .map(|it| self.rewrite_type(heap, it, &solved_targs_replacement_map))
              .collect_vec(),
          ),
          hir::TypeDefinitionMappings::Enum(hir_variants) => {
            let mut mir_variants = Vec::with_capacity(hir_variants.len());
            let mut permit_unboxed_optimization = true;
            let mut already_unused_boxed_optimization = None;
            for (tag, (_, types)) in hir_variants.iter().enumerate() {
              if types.is_empty() {
                mir_variants.push(mir::EnumTypeDefinition::Int31);
              } else {
                if let Some((i, t)) = already_unused_boxed_optimization {
                  mir_variants[i] = mir::EnumTypeDefinition::Boxed(vec![mir::INT_32_TYPE, t]);
                  already_unused_boxed_optimization = None;
                }
                let mut mapping_types = Vec::with_capacity(types.len() + 1);
                mapping_types.push(mir::INT_32_TYPE);
                for t in types {
                  mapping_types.push(self.rewrite_type(heap, t, &solved_targs_replacement_map));
                }
                if permit_unboxed_optimization
                  && already_unused_boxed_optimization.is_none()
                  && mapping_types.len() == 2
                  && self.type_permit_enum_boxed_optimization(&mapping_types[1])
                {
                  let t = mapping_types[1].into_id().unwrap();
                  mir_variants.push(mir::EnumTypeDefinition::Unboxed(t));
                  already_unused_boxed_optimization = Some((tag, mir::Type::Id(t)));
                } else {
                  mir_variants.push(mir::EnumTypeDefinition::Boxed(mapping_types));
                }
                permit_unboxed_optimization = false;
              }
            }
            mir::TypeDefinitionMappings::Enum(mir_variants)
          }
        };
        self.specialized_type_definitions.insert(
          mir_type_name,
          mir::TypeDefinition { name: mir_type_name, mappings: rewritten_mappings },
        );
      } else {
        let closure_def = self.original_closure_defs.get(&id_type.name).unwrap();
        let solved_targs_replacement_map: HashMap<PStr, mir::Type> =
          closure_def.type_parameters.iter().cloned().zip(concrete_type_mir_targs).collect();
        let original_fn_type = closure_def.function_type.clone();
        let rewritten_fn_type =
          self.rewrite_fn_type(heap, &original_fn_type, &solved_targs_replacement_map);
        self.specialized_closure_definitions.push(mir::ClosureTypeDefinition {
          name: mir_type_name,
          function_type: rewritten_fn_type,
        });
      }
    }
    mir::Type::Id(mir_type_name)
  }

  fn type_permit_enum_boxed_optimization(&self, type_: &mir::Type) -> bool {
    match type_ {
      // We cannot distinguish unboxed int from tags
      mir::Type::Int32 | mir::Type::Int31 => false,
      mir::Type::Id(type_id) => {
        match &self.specialized_type_definitions.get(type_id).unwrap().mappings {
          // Structs are always pointers.
          mir::TypeDefinitionMappings::Struct(_) => true,
          // We must be careful with enums, since they are not always pointers.
          mir::TypeDefinitionMappings::Enum(defs) => {
            for def in defs {
              match def {
                mir::EnumTypeDefinition::Boxed(_) => {}
                // Deopt if enum can be int or unboxed.
                // This is essential to correctly pattern match on Some(Some(Some(_)))
                mir::EnumTypeDefinition::Unboxed(_) | mir::EnumTypeDefinition::Int31 => {
                  return false;
                }
              }
            }
            true
          }
        }
      }
    }
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
  let mut symbol_table = mir::SymbolTable::new();
  let mut rewriter = Rewriter {
    original_closure_defs: closure_types.into_iter().map(|it| (it.name, it)).collect(),
    original_type_defs: type_definitions.into_iter().map(|it| (it.name, it)).collect(),
    original_functions: functions
      .into_iter()
      .map(|it| {
        (
          mir::FunctionName {
            type_name: symbol_table.create_simple_type_name(
              it.name.type_name.module_reference.unwrap(),
              it.name.type_name.type_name,
            ),
            fn_name: it.name.fn_name,
          },
          it,
        )
      })
      .collect(),
    used_string_names: HashSet::new(),
    specialized_type_definition_names: HashSet::new(),
    specialized_function_names: HashSet::new(),
    specialized_closure_definitions: Vec::new(),
    specialized_type_definitions: HashMap::new(),
    specialized_functions: Vec::new(),
    symbol_table,
  };
  let empty_replacement_map = HashMap::new();
  let mut mir_main_function_names = Vec::with_capacity(main_function_names.len());
  for main_fn_name in &main_function_names {
    let mir_main_fn_name = mir::FunctionName {
      type_name: rewriter.symbol_table.create_simple_type_name(
        main_fn_name.type_name.module_reference.unwrap(),
        main_fn_name.type_name.type_name,
      ),
      fn_name: main_fn_name.fn_name,
    };
    rewriter.specialized_function_names.insert(mir_main_fn_name);
    let original_fn = rewriter.original_functions.get(&mir_main_fn_name).cloned().unwrap();
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
      rewriter.rewrite_function(heap, &original_fn, mir_main_fn_name, fn_type, &HashMap::new());
    rewriter.specialized_functions.push(rewritten);
    mir_main_function_names.push(mir_main_fn_name);
  }
  let Rewriter {
    used_string_names,
    specialized_closure_definitions,
    specialized_type_definitions,
    specialized_functions,
    symbol_table,
    ..
  } = rewriter;
  mir::Sources {
    symbol_table,
    global_variables: global_variables
      .into_iter()
      .filter(|it| used_string_names.contains(&it.0))
      .collect(),
    closure_types: specialized_closure_definitions.into_iter().sorted_by_key(|d| d.name).collect(),
    type_definitions: specialized_type_definitions
      .into_values()
      .sorted_by_key(|d| d.name)
      .collect(),
    main_function_names: mir_main_function_names,
    functions: specialized_functions.into_iter().sorted_by_key(|d| d.name).collect(),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use pretty_assertions::assert_eq;
  use samlang_ast::hir::{BinaryOperator, GlobalString};
  use samlang_heap::{Heap, ModuleReference, PStr};

  fn assert_specialized(sources: hir::Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected.trim(), perform_generics_specialization(heap, sources).debug_print(heap));
  }

  #[test]
  fn empty_test() {
    assert_specialized(
      hir::Sources {
        global_variables: Vec::new(),
        closure_types: Vec::new(),
        type_definitions: Vec::new(),
        main_function_names: Vec::new(),
        functions: Vec::new(),
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
        global_variables: Vec::new(),
        closure_types: Vec::new(),
        type_definitions: Vec::new(),
        main_function_names: vec![hir::FunctionName {
          type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
          fn_name: PStr::MAIN_FN,
        }],
        functions: vec![
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: PStr::MAIN_FN,
            },
            parameters: Vec::new(),
            type_parameters: Vec::new(),
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: Vec::new(),
            return_value: hir::ZERO,
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: heap.alloc_str_for_test("main2"),
            },
            parameters: Vec::new(),
            type_parameters: Vec::new(),
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: Vec::new(),
            return_value: hir::ZERO,
          },
        ],
      },
      heap,
      r#"
function _DUMMY_I$main(): int {
  return 0;
}

sources.mains = [_DUMMY_I$main]
"#,
    );
  }

  #[test]
  fn builtin_function_call_no_dce_test() {
    let heap = &mut Heap::new();

    assert_specialized(
      hir::Sources {
        global_variables: vec![GlobalString(heap.alloc_str_for_test("G1"))],
        closure_types: Vec::new(),
        type_definitions: vec![hir::TypeDefinition {
          name: hir::STRING_TYPE.into_id().unwrap().name,
          type_parameters: Vec::new(),
          mappings: hir::TypeDefinitionMappings::Enum(Vec::new()),
        }],
        main_function_names: vec![hir::FunctionName {
          type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
          fn_name: PStr::MAIN_FN,
        }],
        functions: vec![hir::Function {
          name: hir::FunctionName {
            type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
            fn_name: PStr::MAIN_FN,
          },
          parameters: Vec::new(),
          type_parameters: Vec::new(),
          type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
          body: vec![hir::Statement::Call {
            callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
              name: hir::FunctionName {
                type_name: hir::TypeName {
                  module_reference: Some(ModuleReference::ROOT),
                  type_name: PStr::PROCESS_TYPE,
                },
                fn_name: PStr::PRINTLN,
              },
              type_: hir::Type::new_fn_unwrapped(vec![hir::STRING_TYPE], hir::INT_TYPE),
              type_arguments: Vec::new(),
            }),
            arguments: vec![hir::Expression::StringName(heap.alloc_str_for_test("G1"))],
            return_type: hir::INT_TYPE,
            return_collector: None,
          }],
          return_value: hir::ZERO,
        }],
      },
      heap,
      r#"const GLOBAL_STRING_0 = 'G1';

variant type _Str = []
function _DUMMY_I$main(): int {
  __Process$println("G1");
  return 0;
}

sources.mains = [_DUMMY_I$main]
"#,
    );
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let type_j = hir::Type::new_id_no_targs(PStr::UPPER_J);
    let type_ia = hir::Type::new_id(
      PStr::UPPER_I,
      vec![hir::Type::new_generic_type(PStr::UPPER_A), hir::STRING_TYPE],
    );
    let type_ib = hir::Type::new_id(
      PStr::UPPER_I,
      vec![hir::INT_TYPE, hir::Type::new_generic_type(PStr::UPPER_B)],
    );
    let type_i = hir::Type::new_id(PStr::UPPER_I, vec![hir::INT_TYPE, hir::STRING_TYPE]);
    let g1 = hir::Expression::StringName(heap.alloc_str_for_test("G1"));
    assert_specialized(
      hir::Sources {
        global_variables: vec![
          GlobalString(heap.alloc_str_for_test("G1")),
          GlobalString(heap.alloc_str_for_test("G2")),
        ],
        closure_types: vec![hir::ClosureTypeDefinition {
          name: hir::TypeName::new_for_test(heap.alloc_str_for_test("CC")),
          type_parameters: vec![PStr::UPPER_A, PStr::UPPER_B],
          function_type: hir::Type::new_fn_unwrapped(
            vec![hir::Type::new_generic_type(PStr::UPPER_A)],
            hir::Type::new_generic_type(PStr::UPPER_B),
          ),
        }],
        type_definitions: vec![
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_A),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(Vec::new()),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_B),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(Vec::new()),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_I),
            type_parameters: vec![PStr::UPPER_A, PStr::UPPER_B],
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, Vec::new()),
              (PStr::UPPER_B, Vec::new()),
            ]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_J),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Struct(vec![hir::INT_TYPE]),
          },
          hir::TypeDefinition {
            name: hir::STRING_TYPE.into_id().unwrap().name,
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(Vec::new()),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(heap.alloc_str_for_test("Enum")),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, vec![hir::Type::new_id_no_targs(PStr::UPPER_J)]),
              (PStr::UPPER_B, Vec::new()),
            ]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(heap.alloc_str_for_test("Enum2")),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, vec![hir::INT_TYPE]),
              (PStr::UPPER_B, Vec::new()),
            ]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(heap.alloc_str_for_test("Enum3")),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, vec![hir::Type::new_id_no_targs(PStr::UPPER_J)]),
              (PStr::UPPER_B, vec![hir::Type::new_id_no_targs(PStr::UPPER_J)]),
              (PStr::UPPER_C, Vec::new()),
            ]),
          },
        ],
        main_function_names: vec![hir::FunctionName {
          type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
          fn_name: PStr::MAIN_FN,
        }],
        functions: vec![
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: heap.alloc_str_for_test("functor_fun"),
            },
            parameters: vec![PStr::LOWER_A],
            type_parameters: vec![PStr::UPPER_A],
            type_: hir::Type::new_fn_unwrapped(
              vec![hir::Type::new_generic_type(PStr::UPPER_A)],
              hir::INT_TYPE,
            ),
            body: vec![hir::Statement::Call {
              callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                name: hir::FunctionName {
                  type_name: hir::TypeName { module_reference: None, type_name: PStr::UPPER_A },
                  fn_name: heap.alloc_str_for_test("bar"),
                },
                type_: hir::Type::new_fn_unwrapped(
                  vec![hir::Type::new_generic_type(PStr::UPPER_A)],
                  hir::INT_TYPE,
                ),
                type_arguments: Vec::new(),
              }),
              arguments: vec![hir::ZERO],
              return_type: hir::INT_TYPE,
              return_collector: None,
            }],
            return_value: hir::ZERO,
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(heap.alloc_str_for_test("I_int__Str")),
              fn_name: heap.alloc_str_for_test("bar"),
            },
            parameters: vec![PStr::LOWER_A],
            type_parameters: vec![PStr::UPPER_A],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: Vec::new(),
            return_value: hir::ZERO,
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_J),
              fn_name: heap.alloc_str_for_test("bar"),
            },
            parameters: vec![PStr::LOWER_A],
            type_parameters: vec![PStr::UPPER_A],
            type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], hir::INT_TYPE),
            body: Vec::new(),
            return_value: hir::ZERO,
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: heap.alloc_str_for_test("creatorIA"),
            },
            parameters: vec![PStr::LOWER_A],
            type_parameters: vec![PStr::UPPER_A],
            type_: hir::Type::new_fn_unwrapped(
              vec![hir::Type::new_generic_type(PStr::UPPER_A)],
              type_ia.clone(),
            ),
            body: vec![hir::Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ia.clone().into_id().unwrap(),
              expression_list: vec![
                hir::Expression::int(0),
                hir::Expression::var_name(
                  PStr::LOWER_A,
                  hir::Type::new_generic_type(PStr::UPPER_A),
                ),
              ],
            }],
            return_value: hir::Expression::var_name(heap.alloc_str_for_test("v"), type_ia),
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: heap.alloc_str_for_test("creatorIB"),
            },
            parameters: vec![PStr::LOWER_B],
            type_parameters: vec![PStr::UPPER_B],
            type_: hir::Type::new_fn_unwrapped(
              vec![hir::Type::new_generic_type(PStr::UPPER_B)],
              type_ib.clone(),
            ),
            body: vec![hir::Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v"),
              type_: type_ib.clone().into_id().unwrap(),
              expression_list: vec![
                hir::Expression::int(1),
                hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_generic_type(PStr::UPPER_B),
                ),
              ],
            }],
            return_value: hir::Expression::var_name(heap.alloc_str_for_test("v"), type_ib),
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: PStr::MAIN_FN,
            },
            parameters: Vec::new(),
            type_parameters: Vec::new(),
            type_: hir::Type::new_fn_unwrapped(Vec::new(), hir::INT_TYPE),
            body: vec![
              hir::Statement::IfElse {
                condition: hir::ONE,
                s1: vec![
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("creatorIA"),
                      },
                      type_: hir::Type::new_fn_unwrapped(vec![hir::INT_TYPE], type_i.clone()),
                      type_arguments: vec![hir::INT_TYPE],
                    }),
                    arguments: vec![hir::ZERO],
                    return_type: type_i.clone(),
                    return_collector: Some(PStr::LOWER_A),
                  },
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("creatorIA"),
                      },
                      type_: hir::Type::new_fn_unwrapped(
                        vec![hir::STRING_TYPE],
                        hir::Type::new_id(PStr::UPPER_I, vec![hir::STRING_TYPE, hir::STRING_TYPE]),
                      ),
                      type_arguments: vec![hir::STRING_TYPE],
                    }),
                    arguments: vec![g1.clone()],
                    return_type: type_i.clone(),
                    return_collector: Some(heap.alloc_str_for_test("a2")),
                  },
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("creatorIB"),
                      },
                      type_: hir::Type::new_fn_unwrapped(vec![hir::STRING_TYPE], type_i.clone()),
                      type_arguments: vec![hir::STRING_TYPE],
                    }),
                    arguments: vec![g1.clone()],
                    return_type: type_i.clone(),
                    return_collector: Some(PStr::LOWER_B),
                  },
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("functor_fun"),
                      },
                      type_: hir::Type::new_fn_unwrapped(vec![type_i.clone()], hir::INT_TYPE),
                      type_arguments: vec![type_i.clone()],
                    }),
                    arguments: vec![g1.clone()],
                    return_type: type_i.clone(),
                    return_collector: None,
                  },
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("functor_fun"),
                      },
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
                    pointer_expression: hir::Expression::var_name(PStr::LOWER_A, type_i),
                    index: 0,
                  },
                  hir::Statement::LateInitDeclaration {
                    name: heap.alloc_str_for_test("late_init"),
                    type_: hir::INT_TYPE,
                  },
                  hir::Statement::LateInitAssignment {
                    name: heap.alloc_str_for_test("late_init"),
                    assigned_expression: hir::Expression::var_name(PStr::LOWER_A, hir::INT_TYPE),
                  },
                ],
                s2: vec![
                  hir::Statement::Call {
                    callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: PStr::MAIN_FN,
                      },
                      type_: hir::Type::new_fn_unwrapped(Vec::new(), hir::INT_TYPE),
                      type_arguments: Vec::new(),
                    }),
                    arguments: Vec::new(),
                    return_type: hir::INT_TYPE,
                    return_collector: None,
                  },
                  hir::Statement::Not { name: heap.alloc_str_for_test("v1"), operand: hir::ZERO },
                  hir::Statement::Binary {
                    name: heap.alloc_str_for_test("v1"),
                    operator: BinaryOperator::PLUS,
                    e1: hir::ZERO,
                    e2: hir::ZERO,
                  },
                  hir::Statement::StructInit {
                    struct_variable_name: PStr::LOWER_J,
                    type_: type_j.clone().into_id().unwrap(),
                    expression_list: vec![hir::Expression::int(0)],
                  },
                  hir::Statement::IndexedAccess {
                    name: heap.alloc_str_for_test("v2"),
                    type_: hir::INT_TYPE,
                    pointer_expression: hir::Expression::var_name(PStr::LOWER_J, type_j),
                    index: 0,
                  },
                  hir::Statement::ClosureInit {
                    closure_variable_name: heap.alloc_str_for_test("c1"),
                    closure_type: hir::Type::new_id_unwrapped(
                      heap.alloc_str_for_test("CC"),
                      vec![hir::STRING_TYPE, hir::STRING_TYPE],
                    ),
                    function_name: hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("creatorIA"),
                      },
                      type_: hir::Type::new_fn_unwrapped(
                        vec![hir::STRING_TYPE],
                        hir::Type::new_id(PStr::UPPER_I, vec![hir::STRING_TYPE, hir::STRING_TYPE]),
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
                    function_name: hir::FunctionNameExpression {
                      name: hir::FunctionName {
                        type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                        fn_name: heap.alloc_str_for_test("creatorIA"),
                      },
                      type_: hir::Type::new_fn_unwrapped(
                        vec![hir::STRING_TYPE],
                        hir::Type::new_id(PStr::UPPER_I, vec![hir::STRING_TYPE, hir::STRING_TYPE]),
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
              },
              hir::Statement::EnumInit {
                enum_variable_name: PStr::LOWER_B,
                enum_type: hir::Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Enum")),
                tag: 0,
                associated_data_list: vec![hir::ZERO],
              },
              hir::Statement::ConditionalDestructure {
                test_expr: hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_id_no_targs(heap.alloc_str_for_test("Enum")),
                ),
                tag: 0,
                bindings: vec![Some((PStr::LOWER_A, hir::INT_TYPE))],
                s1: Vec::new(),
                s2: Vec::new(),
                final_assignments: Vec::new(),
              },
              hir::Statement::ConditionalDestructure {
                test_expr: hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_id_no_targs(heap.alloc_str_for_test("Enum")),
                ),
                tag: 1,
                bindings: Vec::new(),
                s1: Vec::new(),
                s2: Vec::new(),
                final_assignments: Vec::new(),
              },
              hir::Statement::ConditionalDestructure {
                test_expr: hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_id_no_targs(heap.alloc_str_for_test("Enum3")),
                ),
                tag: 1,
                bindings: vec![Some((PStr::LOWER_A, hir::INT_TYPE))],
                s1: Vec::new(),
                s2: Vec::new(),
                final_assignments: Vec::new(),
              },
              hir::Statement::EnumInit {
                enum_variable_name: PStr::LOWER_B,
                enum_type: hir::Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Enum2")),
                tag: 0,
                associated_data_list: vec![hir::ZERO],
              },
              hir::Statement::EnumInit {
                enum_variable_name: PStr::LOWER_B,
                enum_type: hir::Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Enum3")),
                tag: 0,
                associated_data_list: vec![hir::ZERO],
              },
              hir::Statement::ConditionalDestructure {
                test_expr: hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_id_no_targs(heap.alloc_str_for_test("Enum2")),
                ),
                tag: 0,
                bindings: vec![None],
                s1: Vec::new(),
                s2: Vec::new(),
                final_assignments: Vec::new(),
              },
              hir::Statement::ConditionalDestructure {
                test_expr: hir::Expression::var_name(
                  PStr::LOWER_B,
                  hir::Type::new_id_no_targs(heap.alloc_str_for_test("Enum2")),
                ),
                tag: 1,
                bindings: Vec::new(),
                s1: Vec::new(),
                s2: Vec::new(),
                final_assignments: Vec::new(),
              },
              hir::Statement::EnumInit {
                enum_variable_name: PStr::LOWER_B,
                enum_type: hir::Type::new_id_no_targs_unwrapped(heap.alloc_str_for_test("Enum2")),
                tag: 1,
                associated_data_list: Vec::new(),
              },
            ],
            return_value: hir::ZERO,
          },
        ],
      },
      heap,
      r#"
const GLOBAL_STRING_0 = 'G1';

closure type DUMMY_CC___Str__Str = (_Str) -> _Str
closure type DUMMY_CC__int__Str = (int) -> _Str
variant type _Str = []
object type DUMMY_J = [int]
variant type DUMMY_I__int__Str = [i31, i31]
variant type DUMMY_I___Str__Str = [i31, i31]
variant type DUMMY_Enum = [Unboxed(DUMMY_J), i31]
variant type DUMMY_Enum3 = [Boxed(int, DUMMY_J), Boxed(int, DUMMY_J), i31]
variant type DUMMY_Enum2 = [Boxed(int, int), i31]
function _DUMMY_I$main(): int {
  let finalV: int;
  if 1 {
    let a: DUMMY_I__int__Str = _DUMMY_I__int$creatorIA(0);
    let a2: DUMMY_I__int__Str = _DUMMY_I___Str$creatorIA("G1");
    let b: DUMMY_I__int__Str = _DUMMY_I___Str$creatorIB("G1");
    _DUMMY_I__DUMMY_I__int__Str$functor_fun("G1");
    _DUMMY_I__DUMMY_J$functor_fun("G1");
    let v1: int = (a: DUMMY_I__int__Str)[0];
    let late_init: int;
    late_init = (a: int);
    finalV = (v1: int);
  } else {
    _DUMMY_I$main();
    let v1 = !0;
    let v1 = 0 + 0;
    let j: DUMMY_J = [0];
    let v2: int = (j: DUMMY_J)[0];
    let c1: DUMMY_CC___Str__Str = Closure { fun: (_DUMMY_I___Str$creatorIA: (_Str) -> DUMMY_I___Str__Str), context: "G1" };
    let c2: DUMMY_CC__int__Str = Closure { fun: (_DUMMY_I___Str$creatorIA: (_Str) -> DUMMY_I___Str__Str), context: "G1" };
    finalV = (v2: int);
  }
  let b = 0 as DUMMY_Enum;
  let _t1 = (b: DUMMY_Enum) as int;
  let _t2 = (_t1: int) is DUMMY_J;
  if (_t2: int) {
    let a = (b: DUMMY_Enum) as DUMMY_J;
  } else {
  }
  let _t3 = (b: DUMMY_Enum) as i31;
  let _t4 = (_t3: int) == 1 as i31;
  if (_t4: int) {
  } else {
  }
  let _t5: int = (b: DUMMY_Enum3)[0];
  let _t6 = (_t5: int) == 3;
  if (_t6: int) {
    let _t7 = (b: DUMMY_Enum3) as DUMMY_Enum3$_Sub1;
    let a: int = (_t7: DUMMY_Enum3$_Sub1)[1];
  } else {
  }
  let _t8: DUMMY_Enum2$_Sub0 = [1, 0];
  let b = (_t8: DUMMY_Enum2$_Sub0) as DUMMY_Enum2;
  let _t9: DUMMY_Enum3$_Sub0 = [1, 0];
  let b = (_t9: DUMMY_Enum3$_Sub0) as DUMMY_Enum3;
  let _t10: int = (b: DUMMY_Enum2)[0];
  let _t11 = (_t10: int) == 1;
  if (_t11: int) {
    let _t12 = (b: DUMMY_Enum2) as DUMMY_Enum2$_Sub0;
  } else {
  }
  let _t13 = (b: DUMMY_Enum2) as i31;
  let _t14 = (_t13: int) == 1 as i31;
  if (_t14: int) {
  } else {
  }
  let b = 1 as i31 as DUMMY_Enum2;
  return 0;
}

function _DUMMY_J$bar(a: DUMMY_J): int {
  return 0;
}

function _DUMMY_I__int$creatorIA(a: int): DUMMY_I__int__Str {
  let v: DUMMY_I__int__Str = [0, (a: int)];
  return (v: DUMMY_I__int__Str);
}

function _DUMMY_I___Str$creatorIA(a: _Str): DUMMY_I___Str__Str {
  let v: DUMMY_I___Str__Str = [0, (a: _Str)];
  return (v: DUMMY_I___Str__Str);
}

function _DUMMY_I___Str$creatorIB(b: _Str): DUMMY_I__int__Str {
  let v: DUMMY_I__int__Str = [1, (b: _Str)];
  return (v: DUMMY_I__int__Str);
}

function _DUMMY_I__DUMMY_I__int__Str$functor_fun(a: DUMMY_I__int__Str): int {
  _DUMMY_I__int__Str$bar(0);
  return 0;
}

function _DUMMY_I__DUMMY_J$functor_fun(a: DUMMY_J): int {
  _DUMMY_J$bar(0);
  return 0;
}

sources.mains = [_DUMMY_I$main]"#,
    );
  }

  #[test]
  fn no_arg_function_type_def_test() {
    let heap = &mut Heap::new();

    assert_specialized(
      hir::Sources {
        global_variables: Vec::new(),
        closure_types: Vec::new(),
        type_definitions: vec![
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_I),
            type_parameters: vec![PStr::UPPER_A, PStr::UPPER_B],
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, Vec::new()),
              (PStr::UPPER_B, Vec::new()),
            ]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_J),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Struct(vec![hir::Type::new_id(
              PStr::UPPER_I,
              vec![hir::INT_TYPE, hir::INT_TYPE],
            )]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(PStr::UPPER_K),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, vec![hir::INT_TYPE]),
              (PStr::UPPER_B, vec![hir::INT_TYPE]),
            ]),
          },
          hir::TypeDefinition {
            name: hir::TypeName::new_for_test(heap.alloc_str_for_test("StrOption")),
            type_parameters: Vec::new(),
            mappings: hir::TypeDefinitionMappings::Enum(vec![
              (PStr::UPPER_A, vec![hir::Type::new_id_no_targs(PStr::UPPER_K)]),
              (PStr::UPPER_B, Vec::new()),
            ]),
          },
        ],
        main_function_names: vec![hir::FunctionName {
          type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
          fn_name: PStr::MAIN_FN,
        }],
        functions: vec![
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: heap.alloc_str_for_test("creatorJ"),
            },
            parameters: Vec::new(),
            type_parameters: Vec::new(),
            type_: hir::Type::new_fn_unwrapped(
              Vec::new(),
              hir::Type::new_id_no_targs(PStr::UPPER_J),
            ),
            body: vec![
              hir::Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v1"),
                type_: hir::Type::new_id_unwrapped(
                  PStr::UPPER_I,
                  vec![hir::INT_TYPE, hir::INT_TYPE],
                ),
                expression_list: Vec::new(),
              },
              hir::Statement::StructInit {
                struct_variable_name: heap.alloc_str_for_test("v2"),
                type_: hir::Type::new_id_no_targs_unwrapped(PStr::UPPER_J),
                expression_list: vec![hir::ZERO, hir::ZERO],
              },
            ],
            return_value: hir::Expression::var_name(
              heap.alloc_str_for_test("v2"),
              hir::Type::new_id_no_targs(PStr::UPPER_J),
            ),
          },
          hir::Function {
            name: hir::FunctionName {
              type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
              fn_name: PStr::MAIN_FN,
            },
            parameters: Vec::new(),
            type_parameters: Vec::new(),
            type_: hir::Type::new_fn_unwrapped(Vec::new(), hir::INT_TYPE),
            body: vec![
              hir::Statement::Call {
                callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
                  name: hir::FunctionName {
                    type_name: hir::TypeName::new_for_test(PStr::UPPER_I),
                    fn_name: heap.alloc_str_for_test("creatorJ"),
                  },
                  type_: hir::Type::new_fn_unwrapped(
                    Vec::new(),
                    hir::Type::new_id_no_targs(PStr::UPPER_J),
                  ),
                  type_arguments: Vec::new(),
                }),
                arguments: Vec::new(),
                return_type: hir::Type::new_id_no_targs(PStr::UPPER_J),
                return_collector: None,
              },
              hir::Statement::Call {
                callee: hir::Callee::Variable(hir::VariableName {
                  name: heap.alloc_str_for_test("v"),
                  type_: hir::INT31_TYPE,
                }),
                arguments: vec![
                  hir::Expression::var_name(
                    PStr::LOWER_B,
                    hir::Type::new_id_no_targs(heap.alloc_str_for_test("StrOption")),
                  ),
                  hir::Expression::Int31Zero,
                ],
                return_type: hir::Type::new_id_no_targs(PStr::UPPER_J),
                return_collector: None,
              },
            ],
            return_value: hir::Expression::StringName(heap.alloc_str_for_test("creatorJ")),
          },
        ],
      },
      heap,
      r#"
object type DUMMY_J = [DUMMY_I__int_int]
variant type DUMMY_I__int_int = [i31, i31]
variant type DUMMY_StrOption = [Unboxed(DUMMY_K), i31]
variant type DUMMY_K = [Boxed(int, int), Boxed(int, int)]
function _DUMMY_I$creatorJ(): DUMMY_J {
  let v1: DUMMY_I__int_int = [];
  let v2: DUMMY_J = [0, 0];
  return (v2: DUMMY_J);
}

function _DUMMY_I$main(): int {
  _DUMMY_I$creatorJ();
  (v: i31)((b: DUMMY_StrOption), 0 as i31);
  return "creatorJ";
}

sources.mains = [_DUMMY_I$main]"#,
    );
  }
}
