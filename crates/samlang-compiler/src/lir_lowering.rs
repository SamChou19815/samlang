use itertools::Itertools;
use samlang_ast::{lir, mir};
use samlang_heap::{Heap, PStr};
use std::collections::{BTreeMap, HashSet};

use crate::lir_unused_name_elimination;

type TypesNeedingAnyPointer = HashSet<mir::TypeNameId>;

fn lower_type(type_: mir::Type, types_needing_any_pointer: &TypesNeedingAnyPointer) -> lir::Type {
  match type_ {
    mir::Type::Int32 => lir::Type::Int32,
    mir::Type::Int31 => lir::Type::Int31,
    mir::Type::Id(name) => {
      // Enum types with Int31 variants need to use AnyPointer in WASM GC
      // because a variable can hold either a struct reference or ref.i31
      if types_needing_any_pointer.contains(&name) {
        lir::Type::AnyPointer
      } else {
        lir::Type::Id(name)
      }
    }
  }
}

fn lower_fn_type(
  mir::FunctionType { argument_types, return_type }: mir::FunctionType,
  types_needing_any_pointer: &TypesNeedingAnyPointer,
) -> lir::FunctionType {
  lir::FunctionType {
    argument_types: argument_types
      .into_iter()
      .map(|t| lower_type(t, types_needing_any_pointer))
      .collect(),
    return_type: Box::new(lower_type(*return_type, types_needing_any_pointer)),
  }
}

fn lower_expression(expr: mir::Expression) -> lir::Expression {
  match expr {
    mir::Expression::Int32Literal(i) => lir::Expression::Int32Literal(i),
    mir::Expression::Int31Literal(i) => lir::Expression::Int31Literal(i),
    mir::Expression::StringName(n) => lir::Expression::StringName(n),
    mir::Expression::Variable(mir::VariableName { name, type_ }) => {
      let lir_type = match type_ {
        mir::Type::Int32 => lir::Type::Int32,
        mir::Type::Int31 => lir::Type::Int31,
        mir::Type::Id(name) => lir::Type::Id(name),
      };
      lir::Expression::Variable(name, lir_type)
    }
  }
}

struct LoweringManager<'a> {
  heap: &'a mut Heap,
  closure_defs: &'a BTreeMap<mir::TypeNameId, lir::FunctionType>,
  types_needing_any_pointer: &'a TypesNeedingAnyPointer,
}

impl<'a> LoweringManager<'a> {
  fn new(
    heap: &'a mut Heap,
    closure_defs: &'a BTreeMap<mir::TypeNameId, lir::FunctionType>,
    types_needing_any_pointer: &'a TypesNeedingAnyPointer,
  ) -> LoweringManager<'a> {
    LoweringManager { heap, closure_defs, types_needing_any_pointer }
  }

  fn lower_type(&self, type_: mir::Type) -> lir::Type {
    lower_type(type_, self.types_needing_any_pointer)
  }

  fn lower_fn_type(&self, type_: mir::FunctionType) -> lir::FunctionType {
    lower_fn_type(type_, self.types_needing_any_pointer)
  }

  fn lower_expression(&self, expr: mir::Expression) -> lir::Expression {
    lower_expression(expr)
  }

  fn lower_function(
    &mut self,
    mir::Function { name, parameters, type_, body, return_value }: mir::Function,
  ) -> lir::Function {
    let return_value = self.lower_expression(return_value);
    let mut fn_type = self.lower_fn_type(type_);
    // For closure functions (first param named "_this"), force the context type to AnyPointer.
    // This ensures the function signature matches what call_indirect expects when calling closures,
    // since closure calls always use a type-erased signature with (ref eq) as the context param.
    // The context can be Int31, a struct, or already AnyPointer - we unify all to AnyPointer.
    if parameters.first() == Some(&PStr::UNDERSCORE_THIS)
      && !fn_type.argument_types.is_empty()
      && fn_type.argument_types[0] != lir::Type::AnyPointer
    {
      fn_type.argument_types[0] = lir::Type::AnyPointer;
    }
    lir::Function {
      name,
      parameters,
      type_: fn_type,
      body: self.lower_stmt_block(body),
      return_value,
    }
  }

  fn lower_stmt_block(&mut self, stmts: Vec<mir::Statement>) -> Vec<lir::Statement> {
    stmts.into_iter().flat_map(|s| self.lower_stmt(s)).collect_vec()
  }

  fn lower_stmt(&mut self, stmt: mir::Statement) -> Vec<lir::Statement> {
    match stmt {
      mir::Statement::IsPointer { name, pointer_type, operand } => {
        vec![lir::Statement::IsPointer {
          name,
          pointer_type,
          operand: self.lower_expression(operand),
        }]
      }
      mir::Statement::Not { name, operand } => {
        vec![lir::Statement::Not { name, operand: self.lower_expression(operand) }]
      }
      mir::Statement::Binary(mir::Binary { name, operator, e1, e2 }) => {
        vec![lir::Statement::Binary {
          name,
          operator,
          e1: self.lower_expression(e1),
          e2: self.lower_expression(e2),
        }]
      }
      mir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let pointer_expr = self.lower_expression(pointer_expression);
        let variable_type = self.lower_type(type_);
        vec![lir::Statement::IndexedAccess {
          name,
          type_: variable_type,
          pointer_expression: pointer_expr,
          index,
        }]
      }
      mir::Statement::Call { callee, arguments, return_type, return_collector } => {
        let lowered_return_type = self.lower_type(return_type);
        let return_collector = if let Some(c) = return_collector {
          Some(c)
        } else if lowered_return_type.as_id().is_some() {
          Some(self.heap.alloc_temp_str())
        } else {
          None
        };
        let mut statements = Vec::new();
        match callee {
          mir::Callee::FunctionName(fn_name) => {
            statements.push(lir::Statement::Call {
              callee: lir::Expression::FnName(fn_name.name, self.lower_fn_type(fn_name.type_)),
              arguments: arguments.into_iter().map(|e| self.lower_expression(e)).collect(),
              return_type: lowered_return_type,
              return_collector,
            });
          }
          mir::Callee::Variable(mir::VariableName {
            name: closure_var_name,
            type_: closure_hir_type,
          }) => {
            let temp_fn = self.heap.alloc_temp_str();
            let temp_cx = self.heap.alloc_temp_str();
            let closure_type_name = &closure_hir_type.as_id().unwrap();
            let fn_type = self.closure_defs.get(closure_type_name).unwrap();
            let pointer_expr =
              lir::Expression::Variable(closure_var_name, self.lower_type(closure_hir_type));
            statements.push(lir::Statement::IndexedAccess {
              name: temp_fn,
              type_: lir::Type::Fn(fn_type.clone()),
              pointer_expression: pointer_expr.clone(),
              index: 0,
            });
            statements.push(lir::Statement::IndexedAccess {
              name: temp_cx,
              type_: lir::ANY_POINTER_TYPE,
              pointer_expression: pointer_expr,
              index: 1,
            });
            statements.push(lir::Statement::Call {
              callee: lir::Expression::Variable(temp_fn, lir::Type::Fn(fn_type.clone())),
              arguments: vec![lir::Expression::Variable(temp_cx, lir::ANY_POINTER_TYPE)]
                .into_iter()
                .chain(arguments.into_iter().map(|e| self.lower_expression(e)))
                .collect(),
              return_type: lowered_return_type,
              return_collector,
            });
          }
        }
        statements
      }
      mir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        let final_assignments = final_assignments
          .into_iter()
          .map(|mir::IfElseFinalAssignment { name, type_, e1, e2 }| {
            (name, self.lower_type(type_), self.lower_expression(e1), self.lower_expression(e2))
          })
          .collect_vec();
        vec![lir::Statement::IfElse {
          condition: self.lower_expression(condition),
          s1: self.lower_stmt_block(s1),
          s2: self.lower_stmt_block(s2),
          final_assignments,
        }]
      }
      mir::Statement::SingleIf { condition, invert_condition, statements } => {
        vec![lir::Statement::SingleIf {
          condition: self.lower_expression(condition),
          invert_condition,
          statements: self.lower_stmt_block(statements),
        }]
      }
      mir::Statement::Break(e) => vec![lir::Statement::Break(self.lower_expression(e))],
      mir::Statement::While { loop_variables, statements, break_collector } => {
        let loop_variables = loop_variables
          .into_iter()
          .map(|mir::GenenalLoopVariable { name, type_, initial_value, loop_value }| {
            lir::GenenalLoopVariable {
              name,
              type_: self.lower_type(type_),
              initial_value: self.lower_expression(initial_value),
              loop_value: self.lower_expression(loop_value),
            }
          })
          .collect_vec();
        let statements = self.lower_stmt_block(statements);
        let break_collector = if let Some(mir::VariableName { name, type_ }) = break_collector {
          Some((name, self.lower_type(type_)))
        } else {
          None
        };
        vec![lir::Statement::While { loop_variables, statements, break_collector }]
      }
      mir::Statement::Cast { name, type_, assigned_expression } => {
        let lowered = self.lower_expression(assigned_expression);
        vec![lir::Statement::Cast {
          name,
          type_: self.lower_type(type_),
          assigned_expression: lowered,
        }]
      }
      mir::Statement::LateInitDeclaration { name, type_ } => {
        vec![lir::Statement::LateInitDeclaration { name, type_: self.lower_type(type_) }]
      }
      mir::Statement::LateInitAssignment { name, assigned_expression } => {
        let lowered = self.lower_expression(assigned_expression);
        vec![lir::Statement::LateInitAssignment { name, assigned_expression: lowered }]
      }
      mir::Statement::StructInit { struct_variable_name, type_name, expression_list } => {
        let type_ = self.lower_type(mir::Type::Id(type_name));
        let lir_expression_list =
          expression_list.into_iter().map(|e| self.lower_expression(e)).collect();
        vec![lir::Statement::StructInit {
          struct_variable_name,
          type_,
          expression_list: lir_expression_list,
        }]
      }
      mir::Statement::ClosureInit {
        closure_variable_name,
        closure_type_name,
        function_name: mir::FunctionNameExpression { name: fn_name, type_: fn_type },
        context,
      } => {
        let closure_type = self.lower_type(mir::Type::Id(closure_type_name));
        let original_fn_type = self.lower_fn_type(fn_type);
        let type_erased_closure_type = lir::FunctionType {
          argument_types: vec![lir::ANY_POINTER_TYPE]
            .into_iter()
            .chain(original_fn_type.argument_types.iter().skip(1).cloned())
            .collect(),
          return_type: original_fn_type.return_type.clone(),
        };
        let mut statements = Vec::new();
        let context = self.lower_expression(context);
        let fn_name_slot = {
          let temp = self.heap.alloc_temp_str();
          statements.push(lir::Statement::Cast {
            name: temp,
            type_: lir::Type::Fn(type_erased_closure_type.clone()),
            assigned_expression: lir::Expression::FnName(fn_name, original_fn_type),
          });
          lir::Expression::Variable(temp, lir::Type::Fn(type_erased_closure_type))
        };
        let cx_slot = {
          let temp = self.heap.alloc_temp_str();
          statements.push(lir::Statement::Cast {
            name: temp,
            type_: lir::ANY_POINTER_TYPE,
            assigned_expression: context,
          });
          lir::Expression::Variable(temp, lir::ANY_POINTER_TYPE)
        };
        statements.push(lir::Statement::StructInit {
          struct_variable_name: closure_variable_name,
          type_: closure_type,
          expression_list: vec![fn_name_slot, cx_slot],
        });
        statements
      }
    }
  }
}

pub fn compile_mir_to_lir(heap: &mut Heap, sources: mir::Sources) -> lir::Sources {
  let mut type_defs = Vec::new();
  let mut closure_def_map = BTreeMap::new();
  let mut type_def_map = BTreeMap::new();
  let mir::Sources {
    mut symbol_table,
    global_variables,
    type_definitions,
    closure_types,
    main_function_names,
    functions,
  } = sources;

  // First pass: identify enum types with Int31 variants
  // These types need to use AnyPointer in WASM GC because they can hold either
  // a struct reference or ref.i31
  let mut types_needing_any_pointer: TypesNeedingAnyPointer = HashSet::new();
  for type_def in &type_definitions {
    if let mir::TypeDefinitionMappings::Enum(variants) = &type_def.mappings {
      let has_i31_variant = variants.iter().any(|v| matches!(v, mir::EnumTypeDefinition::Int31));
      if has_i31_variant {
        types_needing_any_pointer.insert(type_def.name);
      }
    }
  }

  for mir::ClosureTypeDefinition { name, function_type } in closure_types {
    let lir::FunctionType { argument_types, return_type } =
      lower_fn_type(function_type, &types_needing_any_pointer);
    let fn_type = lir::FunctionType {
      argument_types: vec![lir::ANY_POINTER_TYPE].into_iter().chain(argument_types).collect_vec(),
      return_type,
    };
    type_defs.push(lir::TypeDefinition {
      name,
      parent_type: None,
      is_extensible: false,
      mappings: vec![lir::Type::Fn(fn_type.clone()), lir::ANY_POINTER_TYPE],
    });
    closure_def_map.insert(name, fn_type);
  }
  for type_def in type_definitions {
    match &type_def.mappings {
      mir::TypeDefinitionMappings::Struct(types) => {
        let lir_mappings =
          types.iter().copied().map(|t| lower_type(t, &types_needing_any_pointer)).collect_vec();
        type_defs.push(lir::TypeDefinition {
          name: type_def.name,
          parent_type: None,
          is_extensible: false,
          mappings: lir_mappings,
        });
        type_def_map.insert(type_def.name, type_def);
      }
      mir::TypeDefinitionMappings::Enum(variants) => {
        // Parent type must come BEFORE subtypes in WASM GC, and be extensible
        type_defs.push(lir::TypeDefinition {
          name: type_def.name,
          parent_type: None,
          is_extensible: true,
          mappings: vec![lir::INT_32_TYPE],
        });
        for (i, variant) in variants.iter().enumerate() {
          match variant {
            mir::EnumTypeDefinition::Unboxed(_) | mir::EnumTypeDefinition::Int31 => {}
            mir::EnumTypeDefinition::Boxed(types) => {
              let name = symbol_table.derived_type_name_with_subtype_tag(type_def.name, i as u32);
              let mappings =
                types.iter().map(|t| lower_type(*t, &types_needing_any_pointer)).collect();
              type_defs.push(lir::TypeDefinition {
                name,
                parent_type: Some(type_def.name),
                is_extensible: false,
                mappings,
              })
            }
          }
        }
        type_def_map.insert(type_def.name, type_def);
      }
    }
  }
  let functions = functions
    .into_iter()
    .map(|f| {
      LoweringManager::new(heap, &closure_def_map, &types_needing_any_pointer).lower_function(f)
    })
    .collect_vec();
  lir_unused_name_elimination::optimize_lir_sources_by_eliminating_unused_ones(lir::Sources {
    symbol_table,
    global_variables,
    type_definitions: type_defs,
    main_function_names,
    functions,
  })
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;
  use samlang_ast::{
    hir, lir,
    mir::{
      Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function, FunctionName,
      FunctionNameExpression, GenenalLoopVariable, INT_31_TYPE, INT_32_TYPE, IfElseFinalAssignment,
      ONE, Sources, Statement, SymbolTable, Type, TypeDefinition, TypeDefinitionMappings,
      TypeNameId, VariableName, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    use std::collections::HashSet;
    let empty_set: HashSet<TypeNameId> = HashSet::new();
    assert!(
      super::lower_type(Type::Id(TypeNameId::STR), &empty_set)
        .is_the_same_type(&lir::Type::Id(TypeNameId::STR))
    );

    assert!(super::lower_type(Type::Int32, &empty_set).is_the_same_type(&lir::Type::Int32));
    assert!(super::lower_type(Type::Int31, &empty_set).is_the_same_type(&lir::Type::Int31));

    assert!(
      lir::Type::new_fn(vec![lir::INT_32_TYPE, lir::INT_31_TYPE], lir::INT_32_TYPE)
        .is_the_same_type(&lir::Type::new_fn(
          vec![lir::INT_32_TYPE, lir::INT_31_TYPE],
          lir::INT_32_TYPE
        ))
    );
    assert!(
      !lir::Type::new_fn(vec![lir::INT_32_TYPE, lir::INT_32_TYPE], lir::INT_32_TYPE)
        .is_the_same_type(&lir::Type::new_fn(
          vec![lir::INT_32_TYPE, lir::INT_31_TYPE],
          lir::INT_32_TYPE
        ))
    );

    assert!(!matches!(lir::Expression::int32(42), lir::Expression::Int31Literal(42)));

    let heap = &mut Heap::new();
    let table = &SymbolTable::new();

    let fn_type_0 = lir::Type::new_fn_unwrapped(vec![], lir::INT_32_TYPE);
    let mut collector = String::new();
    fn_type_0.pretty_print(&mut collector, heap, table);
    assert_eq!(collector, "() => number");

    let fn_type_1 = lir::Type::new_fn_unwrapped(vec![lir::INT_32_TYPE], lir::INT_32_TYPE);
    collector.clear();
    fn_type_1.pretty_print(&mut collector, heap, table);
    assert_eq!(collector, "(t0: number) => number");

    let fn_type_2 =
      lir::Type::new_fn_unwrapped(vec![lir::INT_32_TYPE, lir::INT_31_TYPE], lir::INT_32_TYPE);
    collector.clear();
    fn_type_2.pretty_print(&mut collector, heap, table);
    assert_eq!(collector, "(t0: number, t1: i31) => number");

    let fn_type_3 = lir::Type::new_fn_unwrapped(
      vec![lir::INT_32_TYPE, lir::INT_31_TYPE, lir::Type::AnyPointer],
      lir::INT_32_TYPE,
    );
    collector.clear();
    fn_type_3.pretty_print(&mut collector, heap, table);
    assert_eq!(collector, "(t0: number, t1: i31, t2: any) => number");

    let stmt = lir::Statement::binary(
      PStr::LOWER_A,
      hir::BinaryOperator::MINUS,
      lir::ZERO,
      lir::Expression::Int32Literal(5),
    );
    assert!(!matches!(
      stmt,
      lir::Statement::Binary {
        operator: hir::BinaryOperator::PLUS,
        e2: lir::Expression::Int31Literal(_),
        ..
      }
    ));

    let mut table = SymbolTable::new();
    let lir_sources = lir::Sources {
      global_variables: Vec::new(),
      type_definitions: vec![
        lir::TypeDefinition {
          name: TypeNameId::STR,
          parent_type: None,
          is_extensible: false,
          mappings: vec![lir::INT_32_TYPE],
        },
        lir::TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Empty")),
          parent_type: None,
          is_extensible: false,
          mappings: Vec::new(),
        },
      ],
      main_function_names: Vec::new(),
      functions: Vec::new(),
      symbol_table: table,
    };
    let _ = lir_sources.pretty_print(heap);
  }

  fn assert_lowered(sources: Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected, super::compile_mir_to_lir(heap, sources).pretty_print(heap));
  }

  #[test]
  fn smoke_test() {
    let heap = &mut Heap::new();

    assert_lowered(
      Sources {
        symbol_table: SymbolTable::new(),
        global_variables: Vec::new(),
        closure_types: Vec::new(),
        type_definitions: Vec::new(),
        main_function_names: Vec::new(),
        functions: Vec::new(),
      },
      heap,
      &lir::ts_prolog(),
    );
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();
    let mut table = SymbolTable::new();

    let closure_type = Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("CC")));
    let obj_type = Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Object")));
    let variant_type =
      Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Variant")));
    let sources = Sources {
      global_variables: vec![hir::GlobalString(heap.alloc_str_for_test("G1"))],
      closure_types: vec![ClosureTypeDefinition {
        name: table.create_type_name_for_test(heap.alloc_str_for_test("CC")),
        function_type: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
      }],
      type_definitions: vec![
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Object")),
          mappings: TypeDefinitionMappings::Struct(vec![INT_32_TYPE, INT_32_TYPE]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Variant")),
          mappings: TypeDefinitionMappings::Enum(vec![
            EnumTypeDefinition::Int31,
            EnumTypeDefinition::Unboxed(TypeNameId::STR),
            EnumTypeDefinition::Boxed(vec![INT_32_TYPE, INT_31_TYPE]),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Object2")),
          mappings: TypeDefinitionMappings::Struct(vec![
            Type::Id(table.create_type_name_for_test(PStr::STR_TYPE)),
            Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Foo"))),
          ]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Variant2")),
          mappings: TypeDefinitionMappings::Enum(Vec::new()),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Variant3")),
          mappings: TypeDefinitionMappings::Enum(Vec::new()),
        },
      ],
      main_function_names: vec![FunctionName::new_for_test(
        heap.alloc_str_for_test("compiled_program_main"),
      )],
      functions: vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_31_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::Variable(VariableName::new(
                heap.alloc_str_for_test("cc"),
                closure_type,
              )),
              arguments: vec![Expression::Int31Literal(0)],
              return_type: INT_32_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v1"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_A, obj_type),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v2"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_B, variant_type),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v3"),
              type_: INT_32_TYPE,
              pointer_expression: Expression::var_name(PStr::LOWER_B, variant_type),
              index: 1,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v4"),
              type_: Type::Id(table.create_type_name_for_test(PStr::STR_TYPE)),
              pointer_expression: Expression::var_name(PStr::LOWER_B, variant_type),
              index: 1,
            },
            Statement::While {
              loop_variables: Vec::new(),
              statements: vec![Statement::SingleIf {
                condition: ZERO,
                invert_condition: false,
                statements: Vec::new(),
              }],
              break_collector: None,
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: PStr::UNDERSCORE,
                type_: INT_32_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![Statement::SingleIf {
                condition: ZERO,
                invert_condition: true,
                statements: vec![Statement::Break(ZERO)],
              }],
              break_collector: Some(VariableName::new(
                PStr::UNDERSCORE,
                Type::Id(table.create_type_name_for_test(PStr::UNDERSCORE)),
              )),
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(PStr::MAIN_FN),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: vec![
            Statement::Not { name: heap.alloc_str_for_test("v1"), operand: ZERO },
            Statement::Not {
              name: heap.alloc_str_for_test("v1"),
              operand: Expression::var_name(heap.alloc_str_for_test("i31var"), INT_31_TYPE),
            },
            Statement::binary(heap.alloc_str_for_test("v1"), hir::BinaryOperator::PLUS, ZERO, ZERO),
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("O"),
              type_name: obj_type.into_id().unwrap(),
              expression_list: vec![
                ZERO,
                Expression::var_name(
                  heap.alloc_str_for_test("obj"),
                  Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("Obj"))),
                ),
              ],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v1"),
              type_name: variant_type.into_id().unwrap(),
              expression_list: vec![ZERO, ZERO],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v2"),
              type_name: variant_type.into_id().unwrap(),
              expression_list: vec![ZERO, Expression::StringName(heap.alloc_str_for_test("G1"))],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c1"),
              closure_type_name: closure_type.into_id().unwrap(),
              function_name: FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("aaa")),
                type_: Type::new_fn_unwrapped(
                  vec![Type::Id(table.create_type_name_for_test(PStr::STR_TYPE))],
                  INT_32_TYPE,
                ),
              },
              context: Expression::StringName(heap.alloc_str_for_test("G1")),
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c2"),
              closure_type_name: *closure_type.as_id().unwrap(),
              function_name: FunctionNameExpression {
                name: FunctionName::new_for_test(heap.alloc_str_for_test("bbb")),
                type_: Type::new_fn_unwrapped(vec![INT_32_TYPE], INT_32_TYPE),
              },
              context: ZERO,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("compiled_program_main")),
          parameters: Vec::new(),
          type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
          body: vec![
            Statement::IfElse {
              condition: ONE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionNameExpression {
                    name: FunctionName::new_for_test(PStr::MAIN_FN),
                    type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
                  }),
                  arguments: vec![ZERO],
                  return_type: INT_32_TYPE,
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionNameExpression {
                    name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
                    type_: Type::new_fn_unwrapped(Vec::new(), INT_32_TYPE),
                  }),
                  arguments: vec![ZERO],
                  return_type: INT_32_TYPE,
                  return_collector: Some(heap.alloc_str_for_test("ccc")),
                },
              ],
              s2: vec![
                Statement::Call {
                  callee: Callee::Variable(VariableName::new(
                    heap.alloc_str_for_test("cc"),
                    closure_type,
                  )),
                  arguments: vec![ZERO],
                  return_type: Type::Id(
                    table.create_type_name_for_test(heap.alloc_str_for_test("CC")),
                  ),
                  return_collector: None,
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("v2"),
                  closure_type_name: closure_type.into_id().unwrap(),
                  function_name: FunctionNameExpression {
                    name: FunctionName::new_for_test(heap.alloc_str_for_test("aaa")),
                    type_: Type::new_fn_unwrapped(
                      vec![Type::Id(table.create_type_name_for_test(PStr::STR_TYPE))],
                      INT_32_TYPE,
                    ),
                  },
                  context: Expression::var_name(
                    heap.alloc_str_for_test("G1"),
                    Type::Id(table.create_type_name_for_test(heap.alloc_str_for_test("CC"))),
                  ),
                },
              ],
              final_assignments: vec![IfElseFinalAssignment {
                name: heap.alloc_str_for_test("finalV"),
                type_: closure_type,
                e1: Expression::var_name(heap.alloc_str_for_test("v1"), closure_type),
                e2: Expression::var_name(heap.alloc_str_for_test("v2"), closure_type),
              }],
            },
            Statement::IfElse {
              condition: ONE,
              s1: vec![Statement::Cast {
                name: heap.alloc_str_for_test("cast"),
                type_: INT_32_TYPE,
                assigned_expression: ZERO,
              }],
              s2: vec![
                Statement::LateInitDeclaration {
                  name: heap.alloc_str_for_test("cast"),
                  type_: INT_32_TYPE,
                },
                Statement::LateInitAssignment {
                  name: heap.alloc_str_for_test("cast"),
                  assigned_expression: ZERO,
                },
              ],
              final_assignments: vec![IfElseFinalAssignment {
                name: heap.alloc_str_for_test("finalV2"),
                type_: INT_32_TYPE,
                e1: ZERO,
                e2: ZERO,
              }],
            },
            Statement::While {
              loop_variables: Vec::new(),
              statements: Vec::new(),
              break_collector: Some(VariableName::new(
                heap.alloc_str_for_test("finalV3"),
                INT_32_TYPE,
              )),
            },
          ],
          return_value: ZERO,
        },
      ],
      symbol_table: table,
    };
    let expected = format!(
      r#"{}const GLOBAL_STRING_0: _Str = [0, `G1` as unknown as number];
type _CC = [(t0: any, t1: number) => number, any];
type _Object = [number, number];
type _Variant = [number];
function __$cc(): i31 {{
  let _t1: (t0: any, t1: number) => number = cc[0];
  let _t2: any = cc[1];
  _t1(_t2, 1);
  let v1: number = a[0];
  let v2: number = b[0];
  let v3: number = b[1];
  let v4: _Str = b[1];
  while (true) {{
    if (0) {{
    }}
  }}
  let _: number = 0;
  let _: __;
  while (true) {{
    if (!0) {{
      _ = 0;
      break;
    }}
    _ = 0;
  }}
  return 0;
}}
function __$main(): number {{
  let v1 = !0;
  let v1 = !i31var;
  let v1 = 0 + 0;
  let O: _Object = [0, obj];
  let v1: any = [0, 0];
  let v2: any = [0, GLOBAL_STRING_0];
  let _t3 = __$aaa as unknown as (t0: any) => number;
  let _t4 = GLOBAL_STRING_0 as unknown as any;
  let c1: _CC = [_t3, _t4];
  let _t5 = __$bbb as unknown as (t0: any) => number;
  let _t6 = 0 as unknown as any;
  let c2: _CC = [_t5, _t6];
  return 0;
}}
function __$compiled_program_main(): number {{
  var finalV: _CC;
  if (1) {{
    __$main(0);
    let ccc: number = __$cc(0);
    finalV = v1;
  }} else {{
    let _t8: (t0: any, t1: number) => number = cc[0];
    let _t9: any = cc[1];
    let _t7: _CC = _t8(_t9, 0);
    let _t10 = __$aaa as unknown as (t0: any) => number;
    let _t11 = G1 as unknown as any;
    let v2: _CC = [_t10, _t11];
    finalV = v2;
  }}
  var finalV2: number;
  if (1) {{
    let cast = 0 as unknown as number;
    finalV2 = 0;
  }} else {{
    let cast: number = undefined as any;
    cast = 0;
    finalV2 = 0;
  }}
  let finalV3: number;
  while (true) {{
  }}
  return 0;
}}
"#,
      lir::ts_prolog(),
    );
    assert_lowered(sources, heap, &expected);
  }
}
