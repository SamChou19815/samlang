use super::mir_unused_name_elimination;
use crate::{
  ast::{common_names, hir, mir},
  common::{well_known_pstrs, PStr},
  Heap,
};
use itertools::Itertools;
use std::collections::{BTreeMap, HashSet};

fn lower_type(type_: hir::Type) -> mir::Type {
  match type_ {
    hir::Type::Primitive(hir::PrimitiveType::Int) => mir::Type::Primitive(mir::PrimitiveType::Int),
    hir::Type::Id(hir::IdType { name, type_arguments }) => {
      assert!(type_arguments.is_empty());
      mir::Type::Id(name)
    }
  }
}

fn lower_fn_type(
  hir::FunctionType { argument_types, return_type }: hir::FunctionType,
) -> mir::FunctionType {
  mir::FunctionType {
    argument_types: argument_types.into_iter().map(lower_type).collect(),
    return_type: Box::new(lower_type(*return_type)),
  }
}

fn unknown_member_destructor_type() -> mir::FunctionType {
  mir::Type::new_fn_unwrapped(vec![mir::ANY_TYPE], mir::INT_TYPE)
}

fn lower_expression(expr: hir::Expression) -> mir::Expression {
  match expr {
    hir::Expression::IntLiteral(i) => mir::Expression::IntLiteral(i, mir::INT_TYPE),
    hir::Expression::StringName(n) => mir::Expression::Name(n, mir::STRING_TYPE),
    hir::Expression::Variable(hir::VariableName { name, type_ }) => {
      mir::Expression::Variable(name, lower_type(type_))
    }
  }
}

fn variable_of_mir_expr(expression: &mir::Expression) -> Option<PStr> {
  if let mir::Expression::Variable(n, _) = expression {
    Some(*n)
  } else {
    None
  }
}

struct LoweringManager<'a> {
  heap: &'a mut Heap,
  closure_defs: &'a BTreeMap<PStr, mir::FunctionType>,
  type_defs: &'a BTreeMap<PStr, hir::TypeDefinition>,
}

impl<'a> LoweringManager<'a> {
  fn new(
    heap: &'a mut Heap,
    closure_defs: &'a BTreeMap<PStr, mir::FunctionType>,
    type_defs: &'a BTreeMap<PStr, hir::TypeDefinition>,
  ) -> LoweringManager<'a> {
    LoweringManager { heap, closure_defs, type_defs }
  }

  fn alloc_temp(&mut self) -> PStr {
    self.heap.alloc_temp_str()
  }

  fn lower_function(
    &mut self,
    hir::Function { name, parameters, type_parameters, type_, body, return_value }: hir::Function,
  ) -> mir::Function {
    assert!(type_parameters.is_empty());
    let return_value = lower_expression(return_value);
    mir::Function {
      name,
      parameters,
      type_: lower_fn_type(type_),
      body: self.lower_stmt_block(body, &variable_of_mir_expr(&return_value).into_iter().collect()),
      return_value,
    }
  }

  fn lower_stmt_block(
    &mut self,
    stmts: Vec<hir::Statement>,
    variables_not_to_deref: &HashSet<PStr>,
  ) -> Vec<mir::Statement> {
    let mut lowered_statements = stmts.into_iter().flat_map(|s| self.lower_stmt(s)).collect_vec();
    let mut variable_to_decrease_reference_count = vec![];
    for s in &lowered_statements {
      match s {
        mir::Statement::Call { callee: _, arguments: _, return_type, return_collector } => {
          if let Some(type_name) = return_type.as_id() {
            variable_to_decrease_reference_count.push(((*return_collector).unwrap(), *type_name));
          }
        }
        mir::Statement::IfElse { condition: _, s1: _, s2: _, final_assignments } => {
          for (n, t, _, _) in final_assignments {
            if let Some(type_name) = t.as_id() {
              variable_to_decrease_reference_count.push((*n, *type_name));
            }
          }
        }
        mir::Statement::While {
          loop_variables: _,
          statements: _,
          break_collector: Some((n, t)),
        } => {
          if let Some(type_name) = t.as_id() {
            variable_to_decrease_reference_count.push((*n, *type_name));
          }
        }
        mir::Statement::StructInit { struct_variable_name, type_, expression_list: _ } => {
          variable_to_decrease_reference_count
            .push((*struct_variable_name, *type_.as_id().unwrap()));
        }
        _ => {}
      }
    }
    for (variable_name, type_name) in variable_to_decrease_reference_count {
      if variables_not_to_deref.contains(&variable_name) {
        continue;
      }
      let var_type = mir::Type::Id(type_name);
      lowered_statements.push(mir::Statement::Call {
        callee: mir::Expression::Name(
          self.heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
          mir::Type::Fn(unknown_member_destructor_type()),
        ),
        arguments: vec![mir::Expression::Variable(variable_name, var_type)],
        return_type: mir::INT_TYPE,
        return_collector: None,
      });
    }
    lowered_statements
  }

  fn lower_stmt(&mut self, stmt: hir::Statement) -> Vec<mir::Statement> {
    match stmt {
      hir::Statement::Binary(hir::Binary { name, operator, e1, e2 }) => {
        vec![mir::Statement::Binary {
          name,
          operator,
          e1: lower_expression(e1),
          e2: lower_expression(e2),
        }]
      }
      hir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let pointer_expr = lower_expression(pointer_expression);
        let variable_type = lower_type(type_);
        vec![mir::Statement::IndexedAccess {
          name,
          type_: variable_type,
          pointer_expression: pointer_expr,
          index: index + 1,
        }]
      }
      hir::Statement::Call { callee, arguments, return_type, return_collector } => {
        let lowered_return_type = lower_type(return_type);
        let return_collector = if let Some(c) = return_collector {
          Some(c)
        } else if lowered_return_type.as_id().is_some() {
          Some(self.alloc_temp())
        } else {
          None
        };
        let mut statements = vec![];
        match callee {
          hir::Callee::FunctionName(fn_name) => {
            assert!(fn_name.type_arguments.is_empty());
            statements.push(mir::Statement::Call {
              callee: mir::Expression::Name(
                fn_name.name,
                mir::Type::Fn(lower_fn_type(fn_name.type_)),
              ),
              arguments: arguments.into_iter().map(lower_expression).collect(),
              return_type: lowered_return_type.clone(),
              return_collector,
            });
          }
          hir::Callee::Variable(hir::VariableName {
            name: closure_var_name,
            type_: closure_hir_type,
          }) => {
            let temp_fn = self.alloc_temp();
            let temp_cx = self.alloc_temp();
            let closure_type_name = &closure_hir_type.as_id().unwrap().name;
            let fn_type = self.closure_defs.get(closure_type_name).unwrap();
            let pointer_expr =
              mir::Expression::Variable(closure_var_name, lower_type(closure_hir_type));
            statements.push(mir::Statement::IndexedAccess {
              name: temp_fn,
              type_: mir::Type::Fn(fn_type.clone()),
              pointer_expression: pointer_expr.clone(),
              index: 1,
            });
            statements.push(mir::Statement::IndexedAccess {
              name: temp_cx,
              type_: mir::ANY_TYPE,
              pointer_expression: pointer_expr,
              index: 2,
            });
            statements.push(mir::Statement::Call {
              callee: mir::Expression::Variable(temp_fn, mir::Type::Fn(fn_type.clone())),
              arguments: vec![mir::Expression::Variable(temp_cx, mir::ANY_TYPE)]
                .into_iter()
                .chain(arguments.into_iter().map(lower_expression))
                .collect(),
              return_type: lowered_return_type.clone(),
              return_collector,
            });
          }
        }
        if let Some(c) = return_collector {
          self.add_ref_counting_if_type_allowed(
            &mut statements,
            &mir::Expression::Variable(c, lowered_return_type),
          );
        }
        statements
      }
      hir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        let final_assignments = final_assignments
          .into_iter()
          .map(|(n, t, e1, e2)| (n, lower_type(t), lower_expression(e1), lower_expression(e2)))
          .collect_vec();
        let variables_not_to_deref_in_s1: HashSet<_> =
          final_assignments.iter().filter_map(|fa| variable_of_mir_expr(&fa.2)).collect();
        let variables_not_to_deref_in_s2: HashSet<_> =
          final_assignments.iter().filter_map(|fa| variable_of_mir_expr(&fa.3)).collect();
        vec![mir::Statement::IfElse {
          condition: lower_expression(condition),
          s1: self.lower_stmt_block(s1, &variables_not_to_deref_in_s1),
          s2: self.lower_stmt_block(s2, &variables_not_to_deref_in_s2),
          final_assignments,
        }]
      }
      hir::Statement::SingleIf { condition, invert_condition, statements } => {
        vec![mir::Statement::SingleIf {
          condition: lower_expression(condition),
          invert_condition,
          statements: self.lower_stmt_block(statements, &HashSet::new()),
        }]
      }
      hir::Statement::Break(e) => vec![mir::Statement::Break(lower_expression(e))],
      hir::Statement::While { loop_variables, statements, break_collector } => {
        let loop_variables = loop_variables
          .into_iter()
          .map(|hir::GenenalLoopVariable { name, type_, initial_value, loop_value }| {
            mir::GenenalLoopVariable {
              name,
              type_: lower_type(type_),
              initial_value: lower_expression(initial_value),
              loop_value: lower_expression(loop_value),
            }
          })
          .collect_vec();
        let variables_not_to_deref: HashSet<_> =
          loop_variables.iter().filter_map(|v| variable_of_mir_expr(&v.loop_value)).collect();
        let statements = self.lower_stmt_block(statements, &variables_not_to_deref);
        let break_collector = if let Some(hir::VariableName { name, type_ }) = break_collector {
          Some((name, lower_type(type_)))
        } else {
          None
        };
        vec![mir::Statement::While { loop_variables, statements, break_collector }]
      }
      hir::Statement::Cast { name, type_, assigned_expression } => {
        let lowered = lower_expression(assigned_expression);
        let mut statements = vec![];
        self.add_ref_counting_if_type_allowed(&mut statements, &lowered);
        statements.push(mir::Statement::Cast {
          name,
          type_: lower_type(type_),
          assigned_expression: lowered,
        });
        statements
      }
      hir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_def = self.type_defs.get(&type_.name).unwrap();
        let type_ = lower_type(hir::Type::Id(type_));
        let mut statements = vec![];
        let mut mir_expression_list = vec![];
        let mut header = 1;
        if type_def.mappings.as_struct().is_some() {
          for (index, e) in expression_list.into_iter().enumerate() {
            let lowered = lower_expression(e);
            if self.add_ref_counting_if_type_allowed(&mut statements, &lowered) {
              header &= 1 << (index + 16);
            }
            mir_expression_list.push(lowered);
          }
        } else {
          for (index, e) in expression_list.into_iter().enumerate() {
            let lowered = lower_expression(e);
            if self.add_ref_counting_if_type_allowed(&mut statements, &lowered) {
              header |= 1 << (index + 16);
            }
            mir_expression_list.push(lowered);
          }
        };
        mir_expression_list.insert(0, mir::Expression::int(header));
        statements.push(mir::Statement::StructInit {
          struct_variable_name,
          type_,
          expression_list: mir_expression_list,
        });
        statements
      }
      hir::Statement::ClosureInit {
        closure_variable_name,
        closure_type,
        function_name: hir::FunctionName { name: fn_name, type_: fn_type, type_arguments: _ },
        context,
      } => {
        let closure_type = lower_type(hir::Type::Id(closure_type));
        let original_fn_type = lower_fn_type(fn_type);
        let type_erased_closure_type = mir::FunctionType {
          argument_types: vec![mir::ANY_TYPE]
            .into_iter()
            .chain(original_fn_type.argument_types.iter().skip(1).cloned())
            .collect(),
          return_type: original_fn_type.return_type.clone(),
        };
        let mut statements = vec![];
        let context = lower_expression(context);
        let mut header = 1;
        if self.add_ref_counting_if_type_allowed(&mut statements, &context) {
          header |= 1 << (1 + 16);
        }
        let fn_name_slot = {
          let temp = self.alloc_temp();
          statements.push(mir::Statement::Cast {
            name: temp,
            type_: mir::Type::Fn(type_erased_closure_type.clone()),
            assigned_expression: mir::Expression::Name(fn_name, mir::Type::Fn(original_fn_type)),
          });
          mir::Expression::Variable(temp, mir::Type::Fn(type_erased_closure_type))
        };
        let cx_slot = {
          let temp = self.alloc_temp();
          statements.push(mir::Statement::Cast {
            name: temp,
            type_: mir::ANY_TYPE,
            assigned_expression: context.clone(),
          });
          mir::Expression::Variable(temp, mir::ANY_TYPE)
        };
        statements.push(mir::Statement::StructInit {
          struct_variable_name: closure_variable_name,
          type_: closure_type,
          expression_list: vec![mir::Expression::int(header), fn_name_slot, cx_slot],
        });
        statements
      }
    }
  }

  fn add_ref_counting_if_type_allowed(
    &mut self,
    collector: &mut Vec<mir::Statement>,
    expression: &mir::Expression,
  ) -> bool {
    if expression.type_().as_id().is_none() {
      return false;
    };
    let casted = self.alloc_temp();
    collector.push(mir::Statement::Cast {
      name: casted,
      type_: mir::ANY_TYPE,
      assigned_expression: expression.clone(),
    });
    collector.push(mir::Statement::Call {
      callee: mir::Expression::Name(
        self.heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_INC_REF),
        mir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![mir::Expression::Variable(casted, mir::ANY_TYPE)],
      return_type: mir::INT_TYPE,
      return_collector: None,
    });
    true
  }
}

fn generate_inc_ref_fn(heap: &mut Heap) -> mir::Function {
  mir::Function {
    name: heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_INC_REF),
    parameters: vec![heap.alloc_str_permanent("ptr")],
    type_: unknown_member_destructor_type(),
    body: vec![
      mir::Statement::binary(
        heap.alloc_str_permanent("isPrimitive"),
        hir::Operator::LT,
        mir::Expression::Variable(heap.alloc_str_permanent("ptr"), mir::ANY_TYPE),
        mir::Expression::int(1024),
      ),
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(
          heap.alloc_str_permanent("isPrimitive"),
          mir::INT_TYPE,
        ),
        invert_condition: true,
        statements: vec![
          mir::Statement::IndexedAccess {
            name: heap.alloc_str_permanent("header"),
            type_: mir::INT_TYPE,
            pointer_expression: mir::Expression::Variable(
              heap.alloc_str_permanent("ptr"),
              mir::ANY_TYPE,
            ),
            index: 0,
          },
          mir::Statement::binary(
            heap.alloc_str_permanent("originalRefCount"),
            hir::Operator::LAND,
            mir::Expression::Variable(heap.alloc_str_permanent("header"), mir::INT_TYPE),
            mir::Expression::int(65535),
          ),
          mir::Statement::binary(
            heap.alloc_str_permanent("isZero"),
            hir::Operator::EQ,
            mir::Expression::Variable(heap.alloc_str_permanent("originalRefCount"), mir::INT_TYPE),
            mir::ZERO,
          ),
          mir::Statement::SingleIf {
            condition: mir::Expression::Variable(heap.alloc_str_permanent("isZero"), mir::INT_TYPE),
            invert_condition: true,
            statements: vec![
              mir::Statement::binary(
                heap.alloc_str_permanent("refCount"),
                hir::Operator::PLUS,
                mir::Expression::Variable(
                  heap.alloc_str_permanent("originalRefCount"),
                  mir::INT_TYPE,
                ),
                mir::ONE,
              ),
              mir::Statement::binary(
                heap.alloc_str_permanent("lower"),
                hir::Operator::LAND,
                mir::Expression::Variable(heap.alloc_str_permanent("refCount"), mir::INT_TYPE),
                mir::Expression::int(65535),
              ),
              mir::Statement::binary(
                heap.alloc_str_permanent("upper"),
                hir::Operator::LAND,
                mir::Expression::Variable(heap.alloc_str_permanent("header"), mir::INT_TYPE),
                mir::Expression::int(!65535),
              ),
              mir::Statement::binary(
                heap.alloc_str_permanent("newHeader"),
                hir::Operator::LOR,
                mir::Expression::Variable(heap.alloc_str_permanent("upper"), mir::INT_TYPE),
                mir::Expression::Variable(heap.alloc_str_permanent("lower"), mir::INT_TYPE),
              ),
              mir::Statement::IndexedAssign {
                assigned_expression: mir::Expression::Variable(
                  heap.alloc_str_permanent("newHeader"),
                  mir::INT_TYPE,
                ),
                pointer_expression: mir::Expression::Variable(
                  heap.alloc_str_permanent("ptr"),
                  mir::ANY_TYPE,
                ),
                index: 0,
              },
            ],
          },
        ],
      },
    ],
    return_value: mir::ZERO,
  }
}

fn generate_dec_ref_fn(heap: &mut Heap) -> mir::Function {
  mir::Function {
    name: heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
    parameters: vec![heap.alloc_str_permanent("ptr")],
    type_: unknown_member_destructor_type(),
    body: vec![
      mir::Statement::binary(
        heap.alloc_str_permanent("isPrimitive"),
        hir::Operator::LT,
        mir::Expression::Variable(heap.alloc_str_permanent("ptr"), mir::ANY_TYPE),
        mir::Expression::int(1024),
      ),
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(
          heap.alloc_str_permanent("isPrimitive"),
          mir::INT_TYPE,
        ),
        invert_condition: true,
        statements: vec![
          mir::Statement::IndexedAccess {
            name: heap.alloc_str_permanent("header"),
            type_: mir::INT_TYPE,
            pointer_expression: mir::Expression::Variable(
              heap.alloc_str_permanent("ptr"),
              mir::ANY_TYPE,
            ),
            index: 0,
          },
          mir::Statement::binary(
            heap.alloc_str_permanent("refCount"),
            hir::Operator::LAND,
            mir::Expression::Variable(heap.alloc_str_permanent("header"), mir::INT_TYPE),
            mir::Expression::int(65535),
          ),
          mir::Statement::binary(
            heap.alloc_str_permanent("isZero"),
            hir::Operator::EQ,
            mir::Expression::Variable(heap.alloc_str_permanent("refCount"), mir::INT_TYPE),
            mir::ZERO,
          ),
          mir::Statement::SingleIf {
            condition: mir::Expression::Variable(heap.alloc_str_permanent("isZero"), mir::INT_TYPE),
            invert_condition: true,
            statements: vec![
              mir::Statement::binary(
                heap.alloc_str_permanent("gtOne"),
                hir::Operator::GT,
                mir::Expression::Variable(heap.alloc_str_permanent("refCount"), mir::INT_TYPE),
                mir::ONE,
              ),
              mir::Statement::IfElse {
                condition: mir::Expression::Variable(
                  heap.alloc_str_permanent("gtOne"),
                  mir::INT_TYPE,
                ),
                s1: vec![
                  mir::Statement::binary(
                    heap.alloc_str_permanent("newHeader"),
                    hir::Operator::MINUS,
                    mir::Expression::Variable(heap.alloc_str_permanent("header"), mir::INT_TYPE),
                    mir::Expression::int(1),
                  ),
                  mir::Statement::IndexedAssign {
                    assigned_expression: mir::Expression::Variable(
                      heap.alloc_str_permanent("newHeader"),
                      mir::INT_TYPE,
                    ),
                    pointer_expression: mir::Expression::Variable(
                      heap.alloc_str_permanent("ptr"),
                      mir::ANY_TYPE,
                    ),
                    index: 0,
                  },
                ],
                s2: vec![
                  mir::Statement::binary(
                    heap.alloc_str_permanent("isRefBitSet"),
                    hir::Operator::SHR,
                    mir::Expression::Variable(heap.alloc_str_permanent("header"), mir::INT_TYPE),
                    mir::Expression::int(16),
                  ),
                  mir::Statement::While {
                    loop_variables: vec![
                      mir::GenenalLoopVariable {
                        name: heap.alloc_str_permanent("bitSet"),
                        type_: mir::INT_TYPE,
                        initial_value: mir::Expression::Variable(
                          heap.alloc_str_permanent("isRefBitSet"),
                          mir::INT_TYPE,
                        ),
                        loop_value: mir::Expression::Variable(
                          heap.alloc_str_permanent("newIsRefBitSet"),
                          mir::INT_TYPE,
                        ),
                      },
                      mir::GenenalLoopVariable {
                        name: well_known_pstrs::LOWER_I,
                        type_: mir::INT_TYPE,
                        initial_value: mir::ONE,
                        loop_value: mir::Expression::Variable(
                          heap.alloc_str_permanent("newI"),
                          mir::INT_TYPE,
                        ),
                      },
                    ],
                    statements: vec![
                      mir::Statement::binary(
                        heap.alloc_str_permanent("shouldStop"),
                        hir::Operator::GT,
                        mir::Expression::Variable(well_known_pstrs::LOWER_I, mir::INT_TYPE),
                        mir::Expression::int(16),
                      ),
                      mir::Statement::SingleIf {
                        condition: mir::Expression::Variable(
                          heap.alloc_str_permanent("shouldStop"),
                          mir::INT_TYPE,
                        ),
                        invert_condition: false,
                        statements: vec![mir::Statement::Break(mir::ZERO)],
                      },
                      mir::Statement::binary(
                        heap.alloc_str_permanent("isRef"),
                        hir::Operator::LAND,
                        mir::Expression::Variable(
                          heap.alloc_str_permanent("isRefBitSet"),
                          mir::INT_TYPE,
                        ),
                        mir::ONE,
                      ),
                      mir::Statement::SingleIf {
                        condition: mir::Expression::Variable(
                          heap.alloc_str_permanent("isRef"),
                          mir::INT_TYPE,
                        ),
                        invert_condition: false,
                        statements: vec![
                          mir::Statement::binary(
                            heap.alloc_str_permanent("offsetToHeader"),
                            hir::Operator::PLUS,
                            mir::Expression::Variable(well_known_pstrs::LOWER_I, mir::INT_TYPE),
                            mir::ONE,
                          ),
                          mir::Statement::binary(
                            heap.alloc_str_permanent("byteOffset"),
                            hir::Operator::SHL,
                            mir::Expression::Variable(
                              heap.alloc_str_permanent("offsetToHeader"),
                              mir::INT_TYPE,
                            ),
                            mir::Expression::int(2),
                          ),
                          mir::Statement::binary(
                            heap.alloc_str_permanent("fieldPtr"),
                            hir::Operator::PLUS,
                            mir::Expression::Variable(
                              heap.alloc_str_permanent("ptr"),
                              mir::INT_TYPE,
                            ),
                            mir::Expression::Variable(
                              heap.alloc_str_permanent("byteOffset"),
                              mir::INT_TYPE,
                            ),
                          ),
                          mir::Statement::Call {
                            callee: mir::Expression::Name(
                              heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
                              mir::Type::Fn(unknown_member_destructor_type()),
                            ),
                            arguments: vec![mir::Expression::Variable(
                              heap.alloc_str_permanent("fieldPtr"),
                              mir::ANY_TYPE,
                            )],
                            return_type: mir::INT_TYPE,
                            return_collector: None,
                          },
                        ],
                      },
                      mir::Statement::binary(
                        heap.alloc_str_permanent("newIsRefBitSet"),
                        hir::Operator::SHR,
                        mir::Expression::Variable(
                          heap.alloc_str_permanent("bitSet"),
                          mir::INT_TYPE,
                        ),
                        mir::ONE,
                      ),
                      mir::Statement::binary(
                        heap.alloc_str_permanent("newI"),
                        hir::Operator::PLUS,
                        mir::Expression::Variable(well_known_pstrs::LOWER_I, mir::INT_TYPE),
                        mir::ONE,
                      ),
                    ],
                    break_collector: None,
                  },
                  mir::Statement::Call {
                    callee: mir::Expression::Name(
                      heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_FREE),
                      mir::Type::Fn(unknown_member_destructor_type()),
                    ),
                    arguments: vec![mir::Expression::Variable(
                      heap.alloc_str_permanent("ptr"),
                      mir::ANY_TYPE,
                    )],
                    return_type: mir::INT_TYPE,
                    return_collector: None,
                  },
                ],
                final_assignments: vec![],
              },
            ],
          },
        ],
      },
    ],
    return_value: mir::ZERO,
  }
}

pub(crate) fn compile_hir_to_mir(heap: &mut Heap, sources: hir::Sources) -> mir::Sources {
  let mut type_defs = vec![];
  let mut closure_def_map = BTreeMap::new();
  let mut type_def_map = BTreeMap::new();
  let hir::Sources {
    global_variables,
    type_definitions,
    closure_types,
    main_function_names,
    functions,
  } = sources;
  for hir::ClosureTypeDefinition { identifier, type_parameters, function_type } in closure_types {
    assert!(type_parameters.is_empty());
    let mir::FunctionType { argument_types, return_type } = lower_fn_type(function_type);
    let fn_type = mir::FunctionType {
      argument_types: vec![mir::ANY_TYPE].into_iter().chain(argument_types).collect_vec(),
      return_type,
    };
    type_defs.push(mir::TypeDefinition {
      name: identifier,
      mappings: vec![mir::INT_TYPE, mir::Type::Fn(fn_type.clone()), mir::ANY_TYPE],
    });
    closure_def_map.insert(identifier, fn_type);
  }
  for type_def in type_definitions {
    match &type_def.mappings {
      hir::TypeDefinitionMappings::Struct(types) => {
        let mir_mappings = vec![mir::INT_TYPE]
          .into_iter()
          .chain(types.iter().cloned().map(lower_type))
          .collect_vec();
        type_defs.push(mir::TypeDefinition { name: type_def.identifier, mappings: mir_mappings });
        type_def_map.insert(type_def.identifier, type_def);
      }
      hir::TypeDefinitionMappings::Enum => {
        type_defs.push(mir::TypeDefinition {
          name: type_def.identifier,
          mappings: vec![mir::INT_TYPE, mir::INT_TYPE],
        });
        type_def_map.insert(type_def.identifier, type_def);
      }
    }
  }
  let mut functions = functions
    .into_iter()
    .map(|f| LoweringManager::new(heap, &closure_def_map, &type_def_map).lower_function(f))
    .collect_vec();
  functions.push(generate_inc_ref_fn(heap));
  functions.push(generate_dec_ref_fn(heap));
  mir_unused_name_elimination::optimize_mir_sources_by_eliminating_unused_ones(mir::Sources {
    global_variables,
    type_definitions: type_defs,
    main_function_names,
    functions,
  })
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      common_names,
      hir::{
        Callee, ClosureTypeDefinition, Expression, Function, FunctionName, GenenalLoopVariable,
        Operator, Sources, Statement, Type, TypeDefinition, TypeDefinitionMappings, VariableName,
        INT_TYPE, ONE, STRING_TYPE, ZERO,
      },
    },
    common::Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();
    assert_eq!(
      "A",
      super::lower_type(Type::new_id(heap.alloc_str_for_test("A"), vec![])).pretty_print(heap)
    );
  }

  fn assert_lowered(sources: Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected, super::compile_hir_to_mir(heap, sources).pretty_print(heap));
  }

  #[test]
  fn smoke_test() {
    let heap = &mut Heap::new();

    assert_lowered(
      Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![
          heap.alloc_str_for_test(common_names::ENCODED_COMPILED_PROGRAM_MAIN)
        ],
        functions: vec![],
      },
      heap,
      &format!(
        r#"const {} = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const {} = (_: number, [, line]: _Str): number => {{ console.log(line); return 0; }};
const {} = (_: number, [, v]: _Str): number => parseInt(v, 10);
const {} = (_: number, v: number): _Str => [1, String(v)];
const {} = (_: number, [, v]: _Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
"#,
        common_names::encoded_fn_name_string_concat(),
        common_names::encoded_fn_name_println(),
        common_names::encoded_fn_name_string_to_int(),
        common_names::encoded_fn_name_int_to_string(),
        common_names::encoded_fn_name_panic(),
        common_names::ENCODED_FN_NAME_FREE
      ),
    );
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let closure_type = &Type::new_id_no_targs(heap.alloc_str_for_test("CC"));
    let obj_type = &Type::new_id_no_targs(heap.alloc_str_for_test("Object"));
    let variant_type = &Type::new_id_no_targs(heap.alloc_str_for_test("Variant"));
    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![ClosureTypeDefinition {
        identifier: heap.alloc_str_for_test("CC"),
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      }],
      type_definitions: vec![
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Object"),
          type_parameters: vec![],
          names: vec![],
          mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant"),
          type_parameters: vec![],
          names: vec![],
          mappings: TypeDefinitionMappings::Enum,
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Object2"),
          type_parameters: vec![],
          names: vec![],
          mappings: TypeDefinitionMappings::Struct(vec![
            STRING_TYPE,
            Type::new_id_no_targs(heap.alloc_str_for_test("Foo")),
          ]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant2"),
          type_parameters: vec![],
          names: vec![],
          mappings: TypeDefinitionMappings::Enum,
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant3"),
          type_parameters: vec![],
          names: vec![],
          mappings: TypeDefinitionMappings::Enum,
        },
      ],
      main_function_names: vec![
        heap.alloc_str_for_test(common_names::ENCODED_COMPILED_PROGRAM_MAIN)
      ],
      functions: vec![
        Function {
          name: heap.alloc_str_for_test("cc"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::Variable(VariableName::new(
                heap.alloc_str_for_test("cc"),
                closure_type.clone(),
              )),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(
                heap.alloc_str_for_test("a"),
                obj_type.clone(),
              ),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(
                heap.alloc_str_for_test("b"),
                variant_type.clone(),
              ),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(
                heap.alloc_str_for_test("b"),
                variant_type.clone(),
              ),
              index: 1,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v4"),
              type_: STRING_TYPE,
              pointer_expression: Expression::var_name(
                heap.alloc_str_for_test("b"),
                variant_type.clone(),
              ),
              index: 1,
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![Statement::SingleIf {
                condition: ZERO,
                invert_condition: false,
                statements: vec![],
              }],
              break_collector: None,
            },
            Statement::While {
              loop_variables: vec![GenenalLoopVariable {
                name: heap.alloc_str_for_test("_"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![Statement::SingleIf {
                condition: ZERO,
                invert_condition: true,
                statements: vec![Statement::Break(ZERO)],
              }],
              break_collector: Some(VariableName::new(
                heap.alloc_str_for_test("_"),
                Type::new_id_no_targs(heap.alloc_str_for_test("_")),
              )),
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::binary(heap.alloc_str_for_test("v1"), Operator::PLUS, ZERO, ZERO),
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("O"),
              type_: obj_type.as_id().unwrap().clone(),
              expression_list: vec![
                ZERO,
                Expression::var_name(
                  heap.alloc_str_for_test("obj"),
                  Type::new_id_no_targs(heap.alloc_str_for_test("Obj")),
                ),
              ],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v1"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, ZERO],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v2"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, Expression::StringName(heap.alloc_str_for_test("G1"))],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c1"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                heap.alloc_str_for_test("aaa"),
                Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
              ),
              context: Expression::StringName(heap.alloc_str_for_test("G1")),
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c2"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                heap.alloc_str_for_test("bbb"),
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              ),
              context: ZERO,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test(common_names::ENCODED_COMPILED_PROGRAM_MAIN),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::IfElse {
              condition: ONE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str_for_test("main"),
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str_for_test("cc"),
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: Some(heap.alloc_str_for_test("ccc")),
                },
              ],
              s2: vec![
                Statement::Call {
                  callee: Callee::Variable(VariableName::new(
                    heap.alloc_str_for_test("cc"),
                    closure_type.clone(),
                  )),
                  arguments: vec![ZERO],
                  return_type: Type::new_id_no_targs(heap.alloc_str_for_test("CC")),
                  return_collector: None,
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("v2"),
                  closure_type: closure_type.as_id().unwrap().clone(),
                  function_name: FunctionName::new(
                    heap.alloc_str_for_test("aaa"),
                    Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
                  ),
                  context: Expression::var_name(
                    heap.alloc_str_for_test("G1"),
                    Type::new_id_no_targs(heap.alloc_str_for_test("CC")),
                  ),
                },
              ],
              final_assignments: vec![(
                heap.alloc_str_for_test("finalV"),
                closure_type.clone(),
                Expression::var_name(heap.alloc_str_for_test("v1"), closure_type.clone()),
                Expression::var_name(heap.alloc_str_for_test("v2"), closure_type.clone()),
              )],
            },
            Statement::IfElse {
              condition: ONE,
              s1: vec![Statement::Cast {
                name: heap.alloc_str_for_test("cast"),
                type_: INT_TYPE,
                assigned_expression: ZERO,
              }],
              s2: vec![],
              final_assignments: vec![(heap.alloc_str_for_test("finalV2"), INT_TYPE, ZERO, ZERO)],
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![],
              break_collector: Some(VariableName::new(
                heap.alloc_str_for_test("finalV3"),
                INT_TYPE,
              )),
            },
          ],
          return_value: ZERO,
        },
      ],
    };
    let expected = format!(
      r#"const {} = ([, a]: _Str, [, b]: _Str): _Str => [1, a + b];
const {} = (_: number, [, line]: _Str): number => {{ console.log(line); return 0; }};
const {} = (_: number, [, v]: _Str): number => parseInt(v, 10);
const {} = (_: number, v: number): _Str => [1, String(v)];
const {} = (_: number, [, v]: _Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
type CC = [number, (t0: any, t1: number) => number, any];
type Object = [number, number, number];
type Variant = [number, number];
function cc(): number {{
  let _t7: (t0: any, t1: number) => number = cc[1];
  let _t8: any = cc[2];
  _t7(_t8, 0);
  let v1: number = a[1];
  let v2: number = b[1];
  let v3: number = b[2];
  let v4: _Str = b[2];
  while (true) {{
    if (0) {{
    }}
  }}
  let _: number = 0;
  let _: _;
  while (true) {{
    if (!0) {{
      _ = 0;
      break;
    }}
    _ = 0;
  }}
  _builtin_dec_ref(_);
  return 0;
}}
function main(): number {{
  let v1 = 0 + 0;
  let _t10 = obj as any;
  _builtin_inc_ref(_t10);
  let O: Object = [0, 0, obj];
  let v1: Variant = [1, 0, 0];
  let _t12 = G1 as any;
  _builtin_inc_ref(_t12);
  let v2: Variant = [131073, 0, G1];
  let _t13 = G1 as any;
  _builtin_inc_ref(_t13);
  let _t14 = aaa as (t0: any) => number;
  let _t15 = G1 as any;
  let c1: CC = [131073, _t14, _t15];
  let _t16 = bbb as (t0: any) => number;
  let _t17 = 0 as any;
  let c2: CC = [1, _t16, _t17];
  _builtin_dec_ref(O);
  _builtin_dec_ref(v1);
  _builtin_dec_ref(v2);
  _builtin_dec_ref(c1);
  _builtin_dec_ref(c2);
  return 0;
}}
function _compiled_program_main(): number {{
  let finalV: CC;
  if (1) {{
    main(0);
    let ccc: number = cc(0);
    finalV = v1;
  }} else {{
    let _t19: (t0: any, t1: number) => number = cc[1];
    let _t20: any = cc[2];
    let _t18: CC = _t19(_t20, 0);
    let _t21 = _t18 as any;
    _builtin_inc_ref(_t21);
    let _t22 = G1 as any;
    _builtin_inc_ref(_t22);
    let _t23 = aaa as (t0: any) => number;
    let _t24 = G1 as any;
    let v2: CC = [131073, _t23, _t24];
    _builtin_dec_ref(_t18);
    finalV = v2;
  }}
  let finalV2: number;
  if (1) {{
    let cast = 0 as number;
    finalV2 = 0;
  }} else {{
    finalV2 = 0;
  }}
  let finalV3: number;
  while (true) {{
  }}
  _builtin_dec_ref(finalV);
  return 0;
}}
function _builtin_inc_ref(ptr: any): number {{
  let isPrimitive = Number(ptr < 1024);
  if (!isPrimitive) {{
    let header: number = ptr[0];
    let originalRefCount = header & 65535;
    let isZero = Number(originalRefCount == 0);
    if (!isZero) {{
      let refCount = originalRefCount + 1;
      let lower = refCount & 65535;
      let upper = header & -65536;
      let newHeader = upper | lower;
      ptr[0] = newHeader;
    }}
  }}
  return 0;
}}
function _builtin_dec_ref(ptr: any): number {{
  let isPrimitive = Number(ptr < 1024);
  if (!isPrimitive) {{
    let header: number = ptr[0];
    let refCount = header & 65535;
    let isZero = Number(refCount == 0);
    if (!isZero) {{
      let gtOne = Number(refCount > 1);
      if (gtOne) {{
        let newHeader = header + -1;
        ptr[0] = newHeader;
      }} else {{
        let isRefBitSet = header >>> 16;
        let bitSet: number = isRefBitSet;
        let i: number = 1;
        while (true) {{
          let shouldStop = Number(i > 16);
          if (shouldStop) {{
            break;
          }}
          let isRef = isRefBitSet & 1;
          if (isRef) {{
            let offsetToHeader = i + 1;
            let byteOffset = offsetToHeader << 2;
            let fieldPtr = ptr + byteOffset;
            _builtin_dec_ref(fieldPtr);
          }}
          let newIsRefBitSet = bitSet >>> 1;
          let newI = i + 1;
          bitSet = newIsRefBitSet;
          i = newI;
        }}
        _builtin_free(ptr);
      }}
    }}
  }}
  return 0;
}}
"#,
      common_names::encoded_fn_name_string_concat(),
      common_names::encoded_fn_name_println(),
      common_names::encoded_fn_name_string_to_int(),
      common_names::encoded_fn_name_int_to_string(),
      common_names::encoded_fn_name_panic(),
      common_names::ENCODED_FN_NAME_FREE,
    );
    assert_lowered(sources, heap, &expected);
  }
}
