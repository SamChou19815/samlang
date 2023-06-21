use super::lir_unused_name_elimination;
use crate::{
  ast::{common_names, hir, lir, mir},
  common::{well_known_pstrs, PStr},
  Heap,
};
use itertools::Itertools;
use std::collections::{BTreeMap, HashSet};

fn lower_type(type_: mir::Type) -> lir::Type {
  match type_ {
    mir::Type::Int => lir::Type::Primitive(lir::PrimitiveType::Int),
    mir::Type::Id(name) => lir::Type::Id(name),
  }
}

fn lower_fn_type(
  mir::FunctionType { argument_types, return_type }: mir::FunctionType,
) -> lir::FunctionType {
  lir::FunctionType {
    argument_types: argument_types.into_iter().map(lower_type).collect(),
    return_type: Box::new(lower_type(*return_type)),
  }
}

fn unknown_member_destructor_type() -> lir::FunctionType {
  lir::Type::new_fn_unwrapped(vec![lir::ANY_TYPE], lir::INT_TYPE)
}

fn lower_expression(expr: mir::Expression) -> lir::Expression {
  match expr {
    mir::Expression::IntLiteral(i) => lir::Expression::IntLiteral(i, lir::INT_TYPE),
    mir::Expression::StringName(n) => lir::Expression::Name(n, lir::STRING_TYPE),
    mir::Expression::Variable(mir::VariableName { name, type_ }) => {
      lir::Expression::Variable(name, lower_type(type_))
    }
  }
}

fn variable_of_mir_expr(expression: &lir::Expression) -> Option<PStr> {
  if let lir::Expression::Variable(n, _) = expression {
    Some(*n)
  } else {
    None
  }
}

struct LoweringManager<'a> {
  heap: &'a mut Heap,
  closure_defs: &'a BTreeMap<PStr, lir::FunctionType>,
  type_defs: &'a BTreeMap<PStr, mir::TypeDefinition>,
}

impl<'a> LoweringManager<'a> {
  fn new(
    heap: &'a mut Heap,
    closure_defs: &'a BTreeMap<PStr, lir::FunctionType>,
    type_defs: &'a BTreeMap<PStr, mir::TypeDefinition>,
  ) -> LoweringManager<'a> {
    LoweringManager { heap, closure_defs, type_defs }
  }

  fn alloc_temp(&mut self) -> PStr {
    self.heap.alloc_temp_str()
  }

  fn lower_function(
    &mut self,
    mir::Function { name, parameters, type_, body, return_value }: mir::Function,
  ) -> lir::Function {
    let return_value = lower_expression(return_value);
    lir::Function {
      name,
      parameters,
      type_: lower_fn_type(type_),
      body: self.lower_stmt_block(body, &variable_of_mir_expr(&return_value).into_iter().collect()),
      return_value,
    }
  }

  fn lower_stmt_block(
    &mut self,
    stmts: Vec<mir::Statement>,
    variables_not_to_deref: &HashSet<PStr>,
  ) -> Vec<lir::Statement> {
    let mut lowered_statements = stmts.into_iter().flat_map(|s| self.lower_stmt(s)).collect_vec();
    let mut variable_to_decrease_reference_count = vec![];
    for s in &lowered_statements {
      match s {
        lir::Statement::Call { callee: _, arguments: _, return_type, return_collector } => {
          if let Some(type_name) = return_type.as_id() {
            variable_to_decrease_reference_count.push(((*return_collector).unwrap(), *type_name));
          }
        }
        lir::Statement::IfElse { condition: _, s1: _, s2: _, final_assignments } => {
          for (n, t, _, _) in final_assignments {
            if let Some(type_name) = t.as_id() {
              variable_to_decrease_reference_count.push((*n, *type_name));
            }
          }
        }
        lir::Statement::While {
          loop_variables: _,
          statements: _,
          break_collector: Some((n, t)),
        } => {
          if let Some(type_name) = t.as_id() {
            variable_to_decrease_reference_count.push((*n, *type_name));
          }
        }
        lir::Statement::StructInit { struct_variable_name, type_, expression_list: _ } => {
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
      let var_type = lir::Type::Id(type_name);
      lowered_statements.push(lir::Statement::Call {
        callee: lir::Expression::Name(
          self.heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
          lir::Type::Fn(unknown_member_destructor_type()),
        ),
        arguments: vec![lir::Expression::Variable(variable_name, var_type)],
        return_type: lir::INT_TYPE,
        return_collector: None,
      });
    }
    lowered_statements
  }

  fn lower_stmt(&mut self, stmt: mir::Statement) -> Vec<lir::Statement> {
    match stmt {
      mir::Statement::Binary(mir::Binary { name, operator, e1, e2 }) => {
        vec![lir::Statement::Binary {
          name,
          operator,
          e1: lower_expression(e1),
          e2: lower_expression(e2),
        }]
      }
      mir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let pointer_expr = lower_expression(pointer_expression);
        let variable_type = lower_type(type_);
        vec![lir::Statement::IndexedAccess {
          name,
          type_: variable_type,
          pointer_expression: pointer_expr,
          index: index + 1,
        }]
      }
      mir::Statement::Call { callee, arguments, return_type, return_collector } => {
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
          mir::Callee::FunctionName(fn_name) => {
            statements.push(lir::Statement::Call {
              callee: lir::Expression::Name(
                fn_name.name,
                lir::Type::Fn(lower_fn_type(fn_name.type_)),
              ),
              arguments: arguments.into_iter().map(lower_expression).collect(),
              return_type: lowered_return_type.clone(),
              return_collector,
            });
          }
          mir::Callee::Variable(mir::VariableName {
            name: closure_var_name,
            type_: closure_hir_type,
          }) => {
            let temp_fn = self.alloc_temp();
            let temp_cx = self.alloc_temp();
            let closure_type_name = &closure_hir_type.as_id().unwrap();
            let fn_type = self.closure_defs.get(closure_type_name).unwrap();
            let pointer_expr =
              lir::Expression::Variable(closure_var_name, lower_type(closure_hir_type));
            statements.push(lir::Statement::IndexedAccess {
              name: temp_fn,
              type_: lir::Type::Fn(fn_type.clone()),
              pointer_expression: pointer_expr.clone(),
              index: 1,
            });
            statements.push(lir::Statement::IndexedAccess {
              name: temp_cx,
              type_: lir::ANY_TYPE,
              pointer_expression: pointer_expr,
              index: 2,
            });
            statements.push(lir::Statement::Call {
              callee: lir::Expression::Variable(temp_fn, lir::Type::Fn(fn_type.clone())),
              arguments: vec![lir::Expression::Variable(temp_cx, lir::ANY_TYPE)]
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
            &lir::Expression::Variable(c, lowered_return_type),
          );
        }
        statements
      }
      mir::Statement::IfElse { condition, s1, s2, final_assignments } => {
        let final_assignments = final_assignments
          .into_iter()
          .map(|(n, t, e1, e2)| (n, lower_type(t), lower_expression(e1), lower_expression(e2)))
          .collect_vec();
        let variables_not_to_deref_in_s1: HashSet<_> =
          final_assignments.iter().filter_map(|fa| variable_of_mir_expr(&fa.2)).collect();
        let variables_not_to_deref_in_s2: HashSet<_> =
          final_assignments.iter().filter_map(|fa| variable_of_mir_expr(&fa.3)).collect();
        vec![lir::Statement::IfElse {
          condition: lower_expression(condition),
          s1: self.lower_stmt_block(s1, &variables_not_to_deref_in_s1),
          s2: self.lower_stmt_block(s2, &variables_not_to_deref_in_s2),
          final_assignments,
        }]
      }
      mir::Statement::SingleIf { condition, invert_condition, statements } => {
        vec![lir::Statement::SingleIf {
          condition: lower_expression(condition),
          invert_condition,
          statements: self.lower_stmt_block(statements, &HashSet::new()),
        }]
      }
      mir::Statement::Break(e) => vec![lir::Statement::Break(lower_expression(e))],
      mir::Statement::While { loop_variables, statements, break_collector } => {
        let loop_variables = loop_variables
          .into_iter()
          .map(|mir::GenenalLoopVariable { name, type_, initial_value, loop_value }| {
            lir::GenenalLoopVariable {
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
        let break_collector = if let Some(mir::VariableName { name, type_ }) = break_collector {
          Some((name, lower_type(type_)))
        } else {
          None
        };
        vec![lir::Statement::While { loop_variables, statements, break_collector }]
      }
      mir::Statement::Cast { name, type_, assigned_expression } => {
        let lowered = lower_expression(assigned_expression);
        let mut statements = vec![];
        self.add_ref_counting_if_type_allowed(&mut statements, &lowered);
        statements.push(lir::Statement::Cast {
          name,
          type_: lower_type(type_),
          assigned_expression: lowered,
        });
        statements
      }
      mir::Statement::StructInit { struct_variable_name, type_name, expression_list } => {
        let type_def = self.type_defs.get(&type_name).unwrap();
        let type_ = lower_type(mir::Type::Id(type_name));
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
        mir_expression_list.insert(0, lir::Expression::int(header));
        statements.push(lir::Statement::StructInit {
          struct_variable_name,
          type_,
          expression_list: mir_expression_list,
        });
        statements
      }
      mir::Statement::ClosureInit {
        closure_variable_name,
        closure_type_name,
        function_name: mir::FunctionName { name: fn_name, type_: fn_type },
        context,
      } => {
        let closure_type = lower_type(mir::Type::Id(closure_type_name));
        let original_fn_type = lower_fn_type(fn_type);
        let type_erased_closure_type = lir::FunctionType {
          argument_types: vec![lir::ANY_TYPE]
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
          statements.push(lir::Statement::Cast {
            name: temp,
            type_: lir::Type::Fn(type_erased_closure_type.clone()),
            assigned_expression: lir::Expression::Name(fn_name, lir::Type::Fn(original_fn_type)),
          });
          lir::Expression::Variable(temp, lir::Type::Fn(type_erased_closure_type))
        };
        let cx_slot = {
          let temp = self.alloc_temp();
          statements.push(lir::Statement::Cast {
            name: temp,
            type_: lir::ANY_TYPE,
            assigned_expression: context.clone(),
          });
          lir::Expression::Variable(temp, lir::ANY_TYPE)
        };
        statements.push(lir::Statement::StructInit {
          struct_variable_name: closure_variable_name,
          type_: closure_type,
          expression_list: vec![lir::Expression::int(header), fn_name_slot, cx_slot],
        });
        statements
      }
    }
  }

  fn add_ref_counting_if_type_allowed(
    &mut self,
    collector: &mut Vec<lir::Statement>,
    expression: &lir::Expression,
  ) -> bool {
    if expression.type_().as_id().is_none() {
      return false;
    };
    let casted = self.alloc_temp();
    collector.push(lir::Statement::Cast {
      name: casted,
      type_: lir::ANY_TYPE,
      assigned_expression: expression.clone(),
    });
    collector.push(lir::Statement::Call {
      callee: lir::Expression::Name(
        self.heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_INC_REF),
        lir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![lir::Expression::Variable(casted, lir::ANY_TYPE)],
      return_type: lir::INT_TYPE,
      return_collector: None,
    });
    true
  }
}

fn generate_inc_ref_fn(heap: &mut Heap) -> lir::Function {
  lir::Function {
    name: heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_INC_REF),
    parameters: vec![heap.alloc_str_permanent("ptr")],
    type_: unknown_member_destructor_type(),
    body: vec![
      lir::Statement::binary(
        heap.alloc_str_permanent("tinyInt"),
        hir::Operator::LT,
        lir::Expression::Variable(heap.alloc_str_permanent("ptr"), lir::ANY_TYPE),
        lir::Expression::int(1024),
      ),
      lir::Statement::binary(
        heap.alloc_str_permanent("isOdd"),
        hir::Operator::LAND,
        lir::Expression::Variable(heap.alloc_str_permanent("ptr"), lir::ANY_TYPE),
        lir::ONE,
      ),
      lir::Statement::binary(
        heap.alloc_str_permanent("notPtr"),
        hir::Operator::LOR,
        lir::Expression::Variable(heap.alloc_str_permanent("tinyInt"), lir::INT_TYPE),
        lir::Expression::Variable(heap.alloc_str_permanent("isOdd"), lir::INT_TYPE),
      ),
      lir::Statement::SingleIf {
        condition: lir::Expression::Variable(heap.alloc_str_permanent("notPtr"), lir::INT_TYPE),
        invert_condition: true,
        statements: vec![
          lir::Statement::IndexedAccess {
            name: heap.alloc_str_permanent("header"),
            type_: lir::INT_TYPE,
            pointer_expression: lir::Expression::Variable(
              heap.alloc_str_permanent("ptr"),
              lir::ANY_TYPE,
            ),
            index: 0,
          },
          lir::Statement::binary(
            heap.alloc_str_permanent("originalRefCount"),
            hir::Operator::LAND,
            lir::Expression::Variable(heap.alloc_str_permanent("header"), lir::INT_TYPE),
            lir::Expression::int(65535),
          ),
          lir::Statement::binary(
            heap.alloc_str_permanent("isZero"),
            hir::Operator::EQ,
            lir::Expression::Variable(heap.alloc_str_permanent("originalRefCount"), lir::INT_TYPE),
            lir::ZERO,
          ),
          lir::Statement::SingleIf {
            condition: lir::Expression::Variable(heap.alloc_str_permanent("isZero"), lir::INT_TYPE),
            invert_condition: true,
            statements: vec![
              lir::Statement::binary(
                heap.alloc_str_permanent("refCount"),
                hir::Operator::PLUS,
                lir::Expression::Variable(
                  heap.alloc_str_permanent("originalRefCount"),
                  lir::INT_TYPE,
                ),
                lir::ONE,
              ),
              lir::Statement::binary(
                heap.alloc_str_permanent("lower"),
                hir::Operator::LAND,
                lir::Expression::Variable(heap.alloc_str_permanent("refCount"), lir::INT_TYPE),
                lir::Expression::int(65535),
              ),
              lir::Statement::binary(
                heap.alloc_str_permanent("upper"),
                hir::Operator::LAND,
                lir::Expression::Variable(heap.alloc_str_permanent("header"), lir::INT_TYPE),
                lir::Expression::int(!65535),
              ),
              lir::Statement::binary(
                heap.alloc_str_permanent("newHeader"),
                hir::Operator::LOR,
                lir::Expression::Variable(heap.alloc_str_permanent("upper"), lir::INT_TYPE),
                lir::Expression::Variable(heap.alloc_str_permanent("lower"), lir::INT_TYPE),
              ),
              lir::Statement::IndexedAssign {
                assigned_expression: lir::Expression::Variable(
                  heap.alloc_str_permanent("newHeader"),
                  lir::INT_TYPE,
                ),
                pointer_expression: lir::Expression::Variable(
                  heap.alloc_str_permanent("ptr"),
                  lir::ANY_TYPE,
                ),
                index: 0,
              },
            ],
          },
        ],
      },
    ],
    return_value: lir::ZERO,
  }
}

fn generate_dec_ref_fn(heap: &mut Heap) -> lir::Function {
  lir::Function {
    name: heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
    parameters: vec![heap.alloc_str_permanent("ptr")],
    type_: unknown_member_destructor_type(),
    body: vec![
      lir::Statement::binary(
        heap.alloc_str_permanent("tinyInt"),
        hir::Operator::LT,
        lir::Expression::Variable(heap.alloc_str_permanent("ptr"), lir::ANY_TYPE),
        lir::Expression::int(1024),
      ),
      lir::Statement::binary(
        heap.alloc_str_permanent("isOdd"),
        hir::Operator::LAND,
        lir::Expression::Variable(heap.alloc_str_permanent("ptr"), lir::ANY_TYPE),
        lir::ONE,
      ),
      lir::Statement::binary(
        heap.alloc_str_permanent("notPtr"),
        hir::Operator::LOR,
        lir::Expression::Variable(heap.alloc_str_permanent("tinyInt"), lir::INT_TYPE),
        lir::Expression::Variable(heap.alloc_str_permanent("isOdd"), lir::INT_TYPE),
      ),
      lir::Statement::SingleIf {
        condition: lir::Expression::Variable(heap.alloc_str_permanent("notPtr"), lir::INT_TYPE),
        invert_condition: true,
        statements: vec![
          lir::Statement::IndexedAccess {
            name: heap.alloc_str_permanent("header"),
            type_: lir::INT_TYPE,
            pointer_expression: lir::Expression::Variable(
              heap.alloc_str_permanent("ptr"),
              lir::ANY_TYPE,
            ),
            index: 0,
          },
          lir::Statement::binary(
            heap.alloc_str_permanent("refCount"),
            hir::Operator::LAND,
            lir::Expression::Variable(heap.alloc_str_permanent("header"), lir::INT_TYPE),
            lir::Expression::int(65535),
          ),
          lir::Statement::binary(
            heap.alloc_str_permanent("isZero"),
            hir::Operator::EQ,
            lir::Expression::Variable(heap.alloc_str_permanent("refCount"), lir::INT_TYPE),
            lir::ZERO,
          ),
          lir::Statement::SingleIf {
            condition: lir::Expression::Variable(heap.alloc_str_permanent("isZero"), lir::INT_TYPE),
            invert_condition: true,
            statements: vec![
              lir::Statement::binary(
                heap.alloc_str_permanent("gtOne"),
                hir::Operator::GT,
                lir::Expression::Variable(heap.alloc_str_permanent("refCount"), lir::INT_TYPE),
                lir::ONE,
              ),
              lir::Statement::IfElse {
                condition: lir::Expression::Variable(
                  heap.alloc_str_permanent("gtOne"),
                  lir::INT_TYPE,
                ),
                s1: vec![
                  lir::Statement::binary(
                    heap.alloc_str_permanent("newHeader"),
                    hir::Operator::MINUS,
                    lir::Expression::Variable(heap.alloc_str_permanent("header"), lir::INT_TYPE),
                    lir::Expression::int(1),
                  ),
                  lir::Statement::IndexedAssign {
                    assigned_expression: lir::Expression::Variable(
                      heap.alloc_str_permanent("newHeader"),
                      lir::INT_TYPE,
                    ),
                    pointer_expression: lir::Expression::Variable(
                      heap.alloc_str_permanent("ptr"),
                      lir::ANY_TYPE,
                    ),
                    index: 0,
                  },
                ],
                s2: vec![
                  lir::Statement::binary(
                    heap.alloc_str_permanent("isRefBitSet"),
                    hir::Operator::SHR,
                    lir::Expression::Variable(heap.alloc_str_permanent("header"), lir::INT_TYPE),
                    lir::Expression::int(16),
                  ),
                  lir::Statement::While {
                    loop_variables: vec![
                      lir::GenenalLoopVariable {
                        name: heap.alloc_str_permanent("bitSet"),
                        type_: lir::INT_TYPE,
                        initial_value: lir::Expression::Variable(
                          heap.alloc_str_permanent("isRefBitSet"),
                          lir::INT_TYPE,
                        ),
                        loop_value: lir::Expression::Variable(
                          heap.alloc_str_permanent("newIsRefBitSet"),
                          lir::INT_TYPE,
                        ),
                      },
                      lir::GenenalLoopVariable {
                        name: well_known_pstrs::LOWER_I,
                        type_: lir::INT_TYPE,
                        initial_value: lir::ONE,
                        loop_value: lir::Expression::Variable(
                          heap.alloc_str_permanent("newI"),
                          lir::INT_TYPE,
                        ),
                      },
                    ],
                    statements: vec![
                      lir::Statement::binary(
                        heap.alloc_str_permanent("shouldStop"),
                        hir::Operator::GT,
                        lir::Expression::Variable(well_known_pstrs::LOWER_I, lir::INT_TYPE),
                        lir::Expression::int(16),
                      ),
                      lir::Statement::SingleIf {
                        condition: lir::Expression::Variable(
                          heap.alloc_str_permanent("shouldStop"),
                          lir::INT_TYPE,
                        ),
                        invert_condition: false,
                        statements: vec![lir::Statement::Break(lir::ZERO)],
                      },
                      lir::Statement::binary(
                        heap.alloc_str_permanent("isRef"),
                        hir::Operator::LAND,
                        lir::Expression::Variable(
                          heap.alloc_str_permanent("isRefBitSet"),
                          lir::INT_TYPE,
                        ),
                        lir::ONE,
                      ),
                      lir::Statement::SingleIf {
                        condition: lir::Expression::Variable(
                          heap.alloc_str_permanent("isRef"),
                          lir::INT_TYPE,
                        ),
                        invert_condition: false,
                        statements: vec![
                          lir::Statement::binary(
                            heap.alloc_str_permanent("offsetToHeader"),
                            hir::Operator::PLUS,
                            lir::Expression::Variable(well_known_pstrs::LOWER_I, lir::INT_TYPE),
                            lir::ONE,
                          ),
                          lir::Statement::binary(
                            heap.alloc_str_permanent("byteOffset"),
                            hir::Operator::SHL,
                            lir::Expression::Variable(
                              heap.alloc_str_permanent("offsetToHeader"),
                              lir::INT_TYPE,
                            ),
                            lir::Expression::int(2),
                          ),
                          lir::Statement::binary(
                            heap.alloc_str_permanent("fieldPtr"),
                            hir::Operator::PLUS,
                            lir::Expression::Variable(
                              heap.alloc_str_permanent("ptr"),
                              lir::INT_TYPE,
                            ),
                            lir::Expression::Variable(
                              heap.alloc_str_permanent("byteOffset"),
                              lir::INT_TYPE,
                            ),
                          ),
                          lir::Statement::Call {
                            callee: lir::Expression::Name(
                              heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_DEC_REF),
                              lir::Type::Fn(unknown_member_destructor_type()),
                            ),
                            arguments: vec![lir::Expression::Variable(
                              heap.alloc_str_permanent("fieldPtr"),
                              lir::ANY_TYPE,
                            )],
                            return_type: lir::INT_TYPE,
                            return_collector: None,
                          },
                        ],
                      },
                      lir::Statement::binary(
                        heap.alloc_str_permanent("newIsRefBitSet"),
                        hir::Operator::SHR,
                        lir::Expression::Variable(
                          heap.alloc_str_permanent("bitSet"),
                          lir::INT_TYPE,
                        ),
                        lir::ONE,
                      ),
                      lir::Statement::binary(
                        heap.alloc_str_permanent("newI"),
                        hir::Operator::PLUS,
                        lir::Expression::Variable(well_known_pstrs::LOWER_I, lir::INT_TYPE),
                        lir::ONE,
                      ),
                    ],
                    break_collector: None,
                  },
                  lir::Statement::Call {
                    callee: lir::Expression::Name(
                      heap.alloc_str_permanent(common_names::ENCODED_FN_NAME_FREE),
                      lir::Type::Fn(unknown_member_destructor_type()),
                    ),
                    arguments: vec![lir::Expression::Variable(
                      heap.alloc_str_permanent("ptr"),
                      lir::ANY_TYPE,
                    )],
                    return_type: lir::INT_TYPE,
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
    return_value: lir::ZERO,
  }
}

pub(crate) fn compile_mir_to_lir(heap: &mut Heap, sources: mir::Sources) -> lir::Sources {
  let mut type_defs = vec![];
  let mut closure_def_map = BTreeMap::new();
  let mut type_def_map = BTreeMap::new();
  let mir::Sources {
    global_variables,
    type_definitions,
    closure_types,
    main_function_names,
    functions,
  } = sources;
  for mir::ClosureTypeDefinition { identifier, function_type } in closure_types {
    let lir::FunctionType { argument_types, return_type } = lower_fn_type(function_type);
    let fn_type = lir::FunctionType {
      argument_types: vec![lir::ANY_TYPE].into_iter().chain(argument_types).collect_vec(),
      return_type,
    };
    type_defs.push(lir::TypeDefinition {
      name: identifier,
      mappings: vec![lir::INT_TYPE, lir::Type::Fn(fn_type.clone()), lir::ANY_TYPE],
    });
    closure_def_map.insert(identifier, fn_type);
  }
  for type_def in type_definitions {
    match &type_def.mappings {
      mir::TypeDefinitionMappings::Struct(types) => {
        let mir_mappings = vec![lir::INT_TYPE]
          .into_iter()
          .chain(types.iter().cloned().map(lower_type))
          .collect_vec();
        type_defs.push(lir::TypeDefinition { name: type_def.identifier, mappings: mir_mappings });
        type_def_map.insert(type_def.identifier, type_def);
      }
      mir::TypeDefinitionMappings::Enum => {
        type_defs.push(lir::TypeDefinition {
          name: type_def.identifier,
          mappings: vec![lir::INT_TYPE, lir::INT_TYPE],
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
  lir_unused_name_elimination::optimize_mir_sources_by_eliminating_unused_ones(lir::Sources {
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
      hir::Operator,
      mir::{
        Callee, ClosureTypeDefinition, Expression, Function, FunctionName, GenenalLoopVariable,
        Sources, Statement, Type, TypeDefinition, TypeDefinitionMappings, VariableName, INT_TYPE,
        ONE, STRING_TYPE, ZERO,
      },
    },
    common::{well_known_pstrs, Heap},
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    let heap = &mut Heap::new();
    assert_eq!("A", super::lower_type(Type::Id(well_known_pstrs::UPPER_A)).pretty_print(heap));
  }

  fn assert_lowered(sources: Sources, heap: &mut Heap, expected: &str) {
    assert_eq!(expected, super::compile_mir_to_lir(heap, sources).pretty_print(heap));
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

    let closure_type = &Type::Id(heap.alloc_str_for_test("CC"));
    let obj_type = &Type::Id(heap.alloc_str_for_test("Object"));
    let variant_type = &Type::Id(heap.alloc_str_for_test("Variant"));
    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![ClosureTypeDefinition {
        identifier: heap.alloc_str_for_test("CC"),
        function_type: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      }],
      type_definitions: vec![
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Object"),
          mappings: TypeDefinitionMappings::Struct(vec![INT_TYPE, INT_TYPE]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant"),
          mappings: TypeDefinitionMappings::Enum,
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Object2"),
          mappings: TypeDefinitionMappings::Struct(vec![
            STRING_TYPE,
            Type::Id(heap.alloc_str_for_test("Foo")),
          ]),
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant2"),
          mappings: TypeDefinitionMappings::Enum,
        },
        TypeDefinition {
          identifier: heap.alloc_str_for_test("Variant3"),
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
              pointer_expression: Expression::var_name(well_known_pstrs::LOWER_A, obj_type.clone()),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(
                well_known_pstrs::LOWER_B,
                variant_type.clone(),
              ),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(
                well_known_pstrs::LOWER_B,
                variant_type.clone(),
              ),
              index: 1,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str_for_test("v4"),
              type_: STRING_TYPE,
              pointer_expression: Expression::var_name(
                well_known_pstrs::LOWER_B,
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
                Type::Id(heap.alloc_str_for_test("_")),
              )),
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str_for_test("main"),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::binary(heap.alloc_str_for_test("v1"), Operator::PLUS, ZERO, ZERO),
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("O"),
              type_name: obj_type.as_id().unwrap().clone(),
              expression_list: vec![
                ZERO,
                Expression::var_name(
                  heap.alloc_str_for_test("obj"),
                  Type::Id(heap.alloc_str_for_test("Obj")),
                ),
              ],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v1"),
              type_name: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, ZERO],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str_for_test("v2"),
              type_name: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, Expression::StringName(heap.alloc_str_for_test("G1"))],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c1"),
              closure_type_name: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                heap.alloc_str_for_test("aaa"),
                Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
              ),
              context: Expression::StringName(heap.alloc_str_for_test("G1")),
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str_for_test("c2"),
              closure_type_name: *closure_type.as_id().unwrap(),
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
                  return_type: Type::Id(heap.alloc_str_for_test("CC")),
                  return_collector: None,
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str_for_test("v2"),
                  closure_type_name: closure_type.as_id().unwrap().clone(),
                  function_name: FunctionName::new(
                    heap.alloc_str_for_test("aaa"),
                    Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
                  ),
                  context: Expression::var_name(
                    heap.alloc_str_for_test("G1"),
                    Type::Id(heap.alloc_str_for_test("CC")),
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
  let _t3: (t0: any, t1: number) => number = cc[1];
  let _t4: any = cc[2];
  _t3(_t4, 0);
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
  let _t6 = obj as any;
  _builtin_inc_ref(_t6);
  let O: Object = [0, 0, obj];
  let v1: Variant = [1, 0, 0];
  let _t8 = G1 as any;
  _builtin_inc_ref(_t8);
  let v2: Variant = [131073, 0, G1];
  let _t9 = G1 as any;
  _builtin_inc_ref(_t9);
  let _t10 = aaa as (t0: any) => number;
  let _t11 = G1 as any;
  let c1: CC = [131073, _t10, _t11];
  let _t12 = bbb as (t0: any) => number;
  let _t13 = 0 as any;
  let c2: CC = [1, _t12, _t13];
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
    let _t15: (t0: any, t1: number) => number = cc[1];
    let _t16: any = cc[2];
    let _t14: CC = _t15(_t16, 0);
    let _t17 = _t14 as any;
    _builtin_inc_ref(_t17);
    let _t18 = G1 as any;
    _builtin_inc_ref(_t18);
    let _t19 = aaa as (t0: any) => number;
    let _t20 = G1 as any;
    let v2: CC = [131073, _t19, _t20];
    _builtin_dec_ref(_t14);
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
  let tinyInt = Number(ptr < 1024);
  let isOdd = ptr & 1;
  let notPtr = tinyInt | isOdd;
  if (!notPtr) {{
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
  let tinyInt = Number(ptr < 1024);
  let isOdd = ptr & 1;
  let notPtr = tinyInt | isOdd;
  if (!notPtr) {{
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
