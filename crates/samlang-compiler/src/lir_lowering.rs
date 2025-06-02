use super::lir_unused_name_elimination;
use itertools::Itertools;
use samlang_ast::{hir, lir, mir};
use samlang_heap::{Heap, PStr};
use std::collections::{BTreeMap, HashSet};

fn lower_type(type_: mir::Type) -> lir::Type {
  match type_ {
    mir::Type::Int32 => lir::Type::Int32,
    mir::Type::Int31 => lir::Type::Int31,
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
  lir::Type::new_fn_unwrapped(vec![lir::ANY_POINTER_TYPE], lir::INT_32_TYPE)
}

fn lower_expression(expr: mir::Expression) -> lir::Expression {
  match expr {
    mir::Expression::Int32Literal(i) => lir::Expression::Int32Literal(i),
    mir::Expression::Int31Literal(i) => lir::Expression::Int31Literal(i),
    mir::Expression::StringName(n) => lir::Expression::StringName(n),
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
  closure_defs: &'a BTreeMap<mir::TypeNameId, lir::FunctionType>,
}

impl<'a> LoweringManager<'a> {
  fn new(
    heap: &'a mut Heap,
    closure_defs: &'a BTreeMap<mir::TypeNameId, lir::FunctionType>,
  ) -> LoweringManager<'a> {
    LoweringManager { heap, closure_defs }
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
        callee: lir::Expression::FnName(
          mir::FunctionName::BUILTIN_DEC_REF,
          unknown_member_destructor_type(),
        ),
        arguments: vec![lir::Expression::Variable(variable_name, var_type)],
        return_type: lir::INT_32_TYPE,
        return_collector: None,
      });
    }
    lowered_statements
  }

  fn lower_stmt(&mut self, stmt: mir::Statement) -> Vec<lir::Statement> {
    match stmt {
      mir::Statement::IsPointer { name, pointer_type, operand } => {
        vec![lir::Statement::IsPointer { name, pointer_type, operand: lower_expression(operand) }]
      }
      mir::Statement::Not { name, operand } => {
        vec![lir::Statement::Not { name, operand: lower_expression(operand) }]
      }
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
        vec![lir::Statement::UntypedIndexedAccess {
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
          Some(self.heap.alloc_temp_str())
        } else {
          None
        };
        let mut statements = vec![];
        match callee {
          mir::Callee::FunctionName(fn_name) => {
            statements.push(lir::Statement::Call {
              callee: lir::Expression::FnName(fn_name.name, lower_fn_type(fn_name.type_)),
              arguments: arguments.into_iter().map(lower_expression).collect(),
              return_type: lowered_return_type.clone(),
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
              lir::Expression::Variable(closure_var_name, lower_type(closure_hir_type));
            statements.push(lir::Statement::UntypedIndexedAccess {
              name: temp_fn,
              type_: lir::Type::Fn(fn_type.clone()),
              pointer_expression: pointer_expr.clone(),
              index: 1,
            });
            statements.push(lir::Statement::UntypedIndexedAccess {
              name: temp_cx,
              type_: lir::ANY_POINTER_TYPE,
              pointer_expression: pointer_expr,
              index: 2,
            });
            statements.push(lir::Statement::Call {
              callee: lir::Expression::Variable(temp_fn, lir::Type::Fn(fn_type.clone())),
              arguments: vec![lir::Expression::Variable(temp_cx, lir::ANY_POINTER_TYPE)]
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
          .map(|mir::IfElseFinalAssignment { name, type_, e1, e2 }| {
            (name, lower_type(type_), lower_expression(e1), lower_expression(e2))
          })
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
      mir::Statement::LateInitDeclaration { name, type_ } => {
        vec![lir::Statement::LateInitDeclaration { name, type_: lower_type(type_) }]
      }
      mir::Statement::LateInitAssignment { name, assigned_expression } => {
        let lowered = lower_expression(assigned_expression);
        let mut statements = vec![];
        self.add_ref_counting_if_type_allowed(&mut statements, &lowered);
        statements.push(lir::Statement::LateInitAssignment { name, assigned_expression: lowered });
        statements
      }
      mir::Statement::StructInit { struct_variable_name, type_name, expression_list } => {
        let type_ = lower_type(mir::Type::Id(type_name));
        let mut statements = vec![];
        let mut mir_expression_list = vec![];
        let mut header = 1;
        for (index, e) in expression_list.into_iter().enumerate() {
          let lowered = lower_expression(e);
          if self.add_ref_counting_if_type_allowed(&mut statements, &lowered) {
            header |= 1 << (index + 16);
          }
          mir_expression_list.push(lowered);
        }
        mir_expression_list.insert(0, lir::Expression::int32(header));
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
        function_name: mir::FunctionNameExpression { name: fn_name, type_: fn_type },
        context,
      } => {
        let closure_type = lower_type(mir::Type::Id(closure_type_name));
        let original_fn_type = lower_fn_type(fn_type);
        let type_erased_closure_type = lir::FunctionType {
          argument_types: vec![lir::ANY_POINTER_TYPE]
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
          expression_list: vec![lir::Expression::int32(header), fn_name_slot, cx_slot],
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
    if !expression.ref_countable() {
      return false;
    };
    let casted = self.heap.alloc_temp_str();
    collector.push(lir::Statement::Cast {
      name: casted,
      type_: lir::ANY_POINTER_TYPE,
      assigned_expression: expression.clone(),
    });
    collector.push(lir::Statement::Call {
      callee: lir::Expression::FnName(
        mir::FunctionName::BUILTIN_INC_REF,
        unknown_member_destructor_type(),
      ),
      arguments: vec![lir::Expression::Variable(casted, lir::ANY_POINTER_TYPE)],
      return_type: lir::INT_32_TYPE,
      return_collector: None,
    });
    true
  }
}

fn generate_inc_ref_fn() -> lir::Function {
  let ptr = PStr::three_letter_literal(b"ptr");
  let not_ptr = PStr::six_letter_literal(b"notPtr");
  let tiny_int = PStr::seven_letter_literal(b"tinyInt");
  let is_zero = PStr::six_letter_literal(b"isZero");
  let is_odd = PStr::five_letter_literal(b"isOdd");
  let ref_count = PStr::two_letter_literal(b"rc");
  let old_ref_count = PStr::five_letter_literal(b"oldRC");
  let lower = PStr::five_letter_literal(b"lower");
  let upper = PStr::five_letter_literal(b"upper");
  let header = PStr::six_letter_literal(b"header");
  let new_header = PStr::six_letter_literal(b"newHdr");

  lir::Function {
    name: mir::FunctionName::BUILTIN_INC_REF,
    parameters: vec![ptr],
    type_: unknown_member_destructor_type(),
    body: vec![
      lir::Statement::binary(
        tiny_int,
        hir::BinaryOperator::LT,
        lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
        lir::Expression::int32(1024),
      ),
      lir::Statement::binary(
        is_odd,
        hir::BinaryOperator::LAND,
        lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
        lir::ONE,
      ),
      lir::Statement::binary(
        not_ptr,
        hir::BinaryOperator::LOR,
        lir::Expression::Variable(tiny_int, lir::INT_32_TYPE),
        lir::Expression::Variable(is_odd, lir::INT_32_TYPE),
      ),
      lir::Statement::SingleIf {
        condition: lir::Expression::Variable(not_ptr, lir::INT_32_TYPE),
        invert_condition: true,
        statements: vec![
          lir::Statement::UntypedIndexedAccess {
            name: header,
            type_: lir::INT_32_TYPE,
            pointer_expression: lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
            index: 0,
          },
          lir::Statement::binary(
            old_ref_count,
            hir::BinaryOperator::LAND,
            lir::Expression::Variable(header, lir::INT_32_TYPE),
            lir::Expression::int32(65535),
          ),
          lir::Statement::binary(
            is_zero,
            hir::BinaryOperator::EQ,
            lir::Expression::Variable(old_ref_count, lir::INT_32_TYPE),
            lir::Expression::Int32Literal(0),
          ),
          lir::Statement::SingleIf {
            condition: lir::Expression::Variable(is_zero, lir::INT_32_TYPE),
            invert_condition: true,
            statements: vec![
              lir::Statement::binary(
                ref_count,
                hir::BinaryOperator::PLUS,
                lir::Expression::Variable(old_ref_count, lir::INT_32_TYPE),
                lir::ONE,
              ),
              lir::Statement::binary(
                lower,
                hir::BinaryOperator::LAND,
                lir::Expression::Variable(ref_count, lir::INT_32_TYPE),
                lir::Expression::int32(65535),
              ),
              lir::Statement::binary(
                upper,
                hir::BinaryOperator::LAND,
                lir::Expression::Variable(header, lir::INT_32_TYPE),
                lir::Expression::int32(!65535),
              ),
              lir::Statement::binary(
                new_header,
                hir::BinaryOperator::LOR,
                lir::Expression::Variable(upper, lir::INT_32_TYPE),
                lir::Expression::Variable(lower, lir::INT_32_TYPE),
              ),
              lir::Statement::UntypedIndexedAssign {
                assigned_expression: lir::Expression::Variable(new_header, lir::INT_32_TYPE),
                pointer_expression: lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
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

fn generate_dec_ref_fn() -> lir::Function {
  let ptr = PStr::three_letter_literal(b"ptr");
  let field_ptr = PStr::four_letter_literal(b"fPtr");
  let not_ptr = PStr::six_letter_literal(b"notPtr");
  let tiny_int = PStr::seven_letter_literal(b"tinyInt");
  let gt_one = PStr::five_letter_literal(b"gtOne");
  let is_zero = PStr::six_letter_literal(b"isZero");
  let is_odd = PStr::five_letter_literal(b"isOdd");
  let is_ref = PStr::five_letter_literal(b"isRef");
  let should_stop = PStr::four_letter_literal(b"stop");
  let ref_count = PStr::two_letter_literal(b"rc");
  let header = PStr::six_letter_literal(b"header");
  let new_header = PStr::six_letter_literal(b"newHdr");
  let new_i = PStr::four_letter_literal(b"newI");
  let bitset = PStr::six_letter_literal(b"bitSet");
  let is_ref_bit_set = PStr::six_letter_literal(b"isRefB");
  let new_is_ref_bit_set = PStr::seven_letter_literal(b"isRefB2");
  let byte_offset = PStr::seven_letter_literal(b"bytOfst");

  lir::Function {
    name: mir::FunctionName::BUILTIN_DEC_REF,
    parameters: vec![ptr],
    type_: unknown_member_destructor_type(),
    body: vec![
      lir::Statement::binary(
        tiny_int,
        hir::BinaryOperator::LT,
        lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
        lir::Expression::int32(1024),
      ),
      lir::Statement::binary(
        is_odd,
        hir::BinaryOperator::LAND,
        lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
        lir::ONE,
      ),
      lir::Statement::binary(
        not_ptr,
        hir::BinaryOperator::LOR,
        lir::Expression::Variable(tiny_int, lir::INT_32_TYPE),
        lir::Expression::Variable(is_odd, lir::INT_32_TYPE),
      ),
      lir::Statement::SingleIf {
        condition: lir::Expression::Variable(not_ptr, lir::INT_32_TYPE),
        invert_condition: true,
        statements: vec![
          lir::Statement::UntypedIndexedAccess {
            name: header,
            type_: lir::INT_32_TYPE,
            pointer_expression: lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
            index: 0,
          },
          lir::Statement::binary(
            ref_count,
            hir::BinaryOperator::LAND,
            lir::Expression::Variable(header, lir::INT_32_TYPE),
            lir::Expression::int32(65535),
          ),
          lir::Statement::binary(
            is_zero,
            hir::BinaryOperator::EQ,
            lir::Expression::Variable(ref_count, lir::INT_32_TYPE),
            lir::ZERO,
          ),
          lir::Statement::SingleIf {
            condition: lir::Expression::Variable(is_zero, lir::INT_32_TYPE),
            invert_condition: true,
            statements: vec![
              lir::Statement::binary(
                gt_one,
                hir::BinaryOperator::GT,
                lir::Expression::Variable(ref_count, lir::INT_32_TYPE),
                lir::ONE,
              ),
              lir::Statement::IfElse {
                condition: lir::Expression::Variable(gt_one, lir::INT_32_TYPE),
                s1: vec![
                  lir::Statement::binary(
                    new_header,
                    hir::BinaryOperator::MINUS,
                    lir::Expression::Variable(header, lir::INT_32_TYPE),
                    lir::Expression::int32(1),
                  ),
                  lir::Statement::UntypedIndexedAssign {
                    assigned_expression: lir::Expression::Variable(new_header, lir::INT_32_TYPE),
                    pointer_expression: lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE),
                    index: 0,
                  },
                ],
                s2: vec![
                  lir::Statement::binary(
                    is_ref_bit_set,
                    hir::BinaryOperator::SHR,
                    lir::Expression::Variable(header, lir::INT_32_TYPE),
                    lir::Expression::int32(16),
                  ),
                  lir::Statement::While {
                    loop_variables: vec![
                      lir::GenenalLoopVariable {
                        name: bitset,
                        type_: lir::INT_32_TYPE,
                        initial_value: lir::Expression::Variable(is_ref_bit_set, lir::INT_32_TYPE),
                        loop_value: lir::Expression::Variable(new_is_ref_bit_set, lir::INT_32_TYPE),
                      },
                      lir::GenenalLoopVariable {
                        name: PStr::LOWER_I,
                        type_: lir::INT_32_TYPE,
                        initial_value: lir::ONE,
                        loop_value: lir::Expression::Variable(new_i, lir::INT_32_TYPE),
                      },
                    ],
                    statements: vec![
                      lir::Statement::binary(
                        should_stop,
                        hir::BinaryOperator::GT,
                        lir::Expression::Variable(PStr::LOWER_I, lir::INT_32_TYPE),
                        lir::Expression::int32(16),
                      ),
                      lir::Statement::SingleIf {
                        condition: lir::Expression::Variable(should_stop, lir::INT_32_TYPE),
                        invert_condition: false,
                        statements: vec![lir::Statement::Break(lir::ZERO)],
                      },
                      lir::Statement::binary(
                        is_ref,
                        hir::BinaryOperator::LAND,
                        lir::Expression::Variable(is_ref_bit_set, lir::INT_32_TYPE),
                        lir::ONE,
                      ),
                      lir::Statement::SingleIf {
                        condition: lir::Expression::Variable(is_ref, lir::INT_32_TYPE),
                        invert_condition: false,
                        statements: vec![
                          lir::Statement::binary(
                            byte_offset,
                            hir::BinaryOperator::SHL,
                            lir::Expression::Variable(PStr::LOWER_I, lir::INT_32_TYPE),
                            lir::Expression::int32(2),
                          ),
                          lir::Statement::binary(
                            field_ptr,
                            hir::BinaryOperator::PLUS,
                            lir::Expression::Variable(ptr, lir::INT_32_TYPE),
                            lir::Expression::Variable(byte_offset, lir::INT_32_TYPE),
                          ),
                          lir::Statement::Call {
                            callee: lir::Expression::FnName(
                              mir::FunctionName::BUILTIN_DEC_REF,
                              unknown_member_destructor_type(),
                            ),
                            arguments: vec![lir::Expression::Variable(
                              field_ptr,
                              lir::ANY_POINTER_TYPE,
                            )],
                            return_type: lir::INT_32_TYPE,
                            return_collector: None,
                          },
                        ],
                      },
                      lir::Statement::binary(
                        new_is_ref_bit_set,
                        hir::BinaryOperator::SHR,
                        lir::Expression::Variable(bitset, lir::INT_32_TYPE),
                        lir::ONE,
                      ),
                      lir::Statement::binary(
                        new_i,
                        hir::BinaryOperator::PLUS,
                        lir::Expression::Variable(PStr::LOWER_I, lir::INT_32_TYPE),
                        lir::ONE,
                      ),
                    ],
                    break_collector: None,
                  },
                  lir::Statement::Call {
                    callee: lir::Expression::FnName(
                      mir::FunctionName::BUILTIN_FREE,
                      unknown_member_destructor_type(),
                    ),
                    arguments: vec![lir::Expression::Variable(ptr, lir::ANY_POINTER_TYPE)],
                    return_type: lir::INT_32_TYPE,
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

pub fn compile_mir_to_lir(heap: &mut Heap, sources: mir::Sources) -> lir::Sources {
  let mut type_defs = vec![];
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
  for mir::ClosureTypeDefinition { name, function_type } in closure_types {
    let lir::FunctionType { argument_types, return_type } = lower_fn_type(function_type);
    let fn_type = lir::FunctionType {
      argument_types: vec![lir::ANY_POINTER_TYPE].into_iter().chain(argument_types).collect_vec(),
      return_type,
    };
    type_defs.push(lir::TypeDefinition {
      name,
      mappings: vec![lir::INT_32_TYPE, lir::Type::Fn(fn_type.clone()), lir::ANY_POINTER_TYPE],
    });
    closure_def_map.insert(name, fn_type);
  }
  for type_def in type_definitions {
    match &type_def.mappings {
      mir::TypeDefinitionMappings::Struct(types) => {
        let mir_mappings = vec![lir::INT_32_TYPE]
          .into_iter()
          .chain(types.iter().cloned().map(lower_type))
          .collect_vec();
        type_defs.push(lir::TypeDefinition { name: type_def.name, mappings: mir_mappings });
        type_def_map.insert(type_def.name, type_def);
      }
      mir::TypeDefinitionMappings::Enum(variants) => {
        for (i, variant) in variants.iter().enumerate() {
          match variant {
            mir::EnumTypeDefinition::Unboxed(_) | mir::EnumTypeDefinition::Int31 => {}
            mir::EnumTypeDefinition::Boxed(types) => {
              let name = symbol_table.derived_type_name_with_subtype_tag(type_def.name, i as u32);
              let mut mappings = Vec::with_capacity(types.len() + 1);
              mappings.push(lir::INT_32_TYPE);
              for t in types {
                mappings.push(lower_type(*t));
              }
              type_defs.push(lir::TypeDefinition { name, mappings })
            }
          }
        }
        type_defs.push(lir::TypeDefinition {
          name: type_def.name,
          mappings: vec![lir::INT_32_TYPE, lir::INT_32_TYPE],
        });
        type_def_map.insert(type_def.name, type_def);
      }
    }
  }
  let mut functions = functions
    .into_iter()
    .map(|f| LoweringManager::new(heap, &closure_def_map).lower_function(f))
    .collect_vec();
  functions.push(generate_inc_ref_fn());
  functions.push(generate_dec_ref_fn());
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
    hir::{self, BinaryOperator},
    lir,
    mir::{
      Callee, ClosureTypeDefinition, EnumTypeDefinition, Expression, Function, FunctionName,
      FunctionNameExpression, GenenalLoopVariable, IfElseFinalAssignment, Sources, Statement,
      SymbolTable, Type, TypeDefinition, TypeDefinitionMappings, TypeNameId, VariableName,
      INT_31_TYPE, INT_32_TYPE, ONE, ZERO,
    },
  };
  use samlang_heap::{Heap, PStr};

  #[test]
  fn boilterplate() {
    assert!(super::lower_type(Type::Id(TypeNameId::STR))
      .is_the_same_type(&lir::Type::Id(TypeNameId::STR)));

    assert!(super::lower_type(Type::Int32).is_the_same_type(&lir::Type::Int32));
    assert!(super::lower_type(Type::Int31).is_the_same_type(&lir::Type::Int31));
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
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![],
        functions: vec![],
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
          mappings: TypeDefinitionMappings::Enum(vec![]),
        },
        TypeDefinition {
          name: table.create_type_name_for_test(heap.alloc_str_for_test("Variant3")),
          mappings: TypeDefinitionMappings::Enum(vec![]),
        },
      ],
      main_function_names: vec![FunctionName::new_for_test(
        heap.alloc_str_for_test("compiled_program_main"),
      )],
      functions: vec![
        Function {
          name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_31_TYPE),
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
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          body: vec![
            Statement::Not { name: heap.alloc_str_for_test("v1"), operand: ZERO },
            Statement::binary(heap.alloc_str_for_test("v1"), BinaryOperator::PLUS, ZERO, ZERO),
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
          parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
          body: vec![
            Statement::IfElse {
              condition: ONE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionNameExpression {
                    name: FunctionName::new_for_test(PStr::MAIN_FN),
                    type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
                  }),
                  arguments: vec![ZERO],
                  return_type: INT_32_TYPE,
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionNameExpression {
                    name: FunctionName::new_for_test(heap.alloc_str_for_test("cc")),
                    type_: Type::new_fn_unwrapped(vec![], INT_32_TYPE),
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
              loop_variables: vec![],
              statements: vec![],
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
type _CC = [number, (t0: any, t1: number) => number, any];
type _Object = [number, number, number];
type _Variant = [number, number];
function __$cc(): i31 {{
  let _t1: (t0: any, t1: number) => number = cc[1];
  let _t2: any = cc[2];
  _t1(_t2, 1);
  let v1: number = a[1];
  let v2: number = b[1];
  let v3: number = b[2];
  let v4: _Str = b[2];
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
  __$dec_ref(_);
  return 0;
}}
function __$main(): number {{
  let v1 = !0;
  let v1 = 0 + 0;
  let _t3 = obj as unknown as any;
  __$inc_ref(_t3);
  let O: _Object = [131073, 0, obj];
  let v1: _Variant = [1, 0, 0];
  let _t4 = GLOBAL_STRING_0 as unknown as any;
  __$inc_ref(_t4);
  let v2: _Variant = [131073, 0, GLOBAL_STRING_0];
  let _t5 = GLOBAL_STRING_0 as unknown as any;
  __$inc_ref(_t5);
  let _t6 = __$aaa as unknown as (t0: any) => number;
  let _t7 = GLOBAL_STRING_0 as unknown as any;
  let c1: _CC = [131073, _t6, _t7];
  let _t8 = __$bbb as unknown as (t0: any) => number;
  let _t9 = 0 as unknown as any;
  let c2: _CC = [1, _t8, _t9];
  __$dec_ref(O);
  __$dec_ref(v1);
  __$dec_ref(v2);
  __$dec_ref(c1);
  __$dec_ref(c2);
  return 0;
}}
function __$compiled_program_main(): number {{
  let finalV: _CC;
  if (1) {{
    __$main(0);
    let ccc: number = __$cc(0);
    finalV = v1;
  }} else {{
    let _t11: (t0: any, t1: number) => number = cc[1];
    let _t12: any = cc[2];
    let _t10: _CC = _t11(_t12, 0);
    let _t13 = _t10 as unknown as any;
    __$inc_ref(_t13);
    let _t14 = G1 as unknown as any;
    __$inc_ref(_t14);
    let _t15 = __$aaa as unknown as (t0: any) => number;
    let _t16 = G1 as unknown as any;
    let v2: _CC = [131073, _t15, _t16];
    __$dec_ref(_t10);
    finalV = v2;
  }}
  let finalV2: number;
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
  __$dec_ref(finalV);
  return 0;
}}
function __$inc_ref(ptr: any): number {{
  let tinyInt = Number(ptr < 1024);
  let isOdd = ptr & 1;
  let notPtr = tinyInt | isOdd;
  if (!notPtr) {{
    let header: number = ptr[0];
    let oldRC = header & 65535;
    let isZero = Number(oldRC == 0);
    if (!isZero) {{
      let rc = oldRC + 1;
      let lower = rc & 65535;
      let upper = header & -65536;
      let newHdr = upper | lower;
      ptr[0] = newHdr;
    }}
  }}
  return 0;
}}
function __$dec_ref(ptr: any): number {{
  let tinyInt = Number(ptr < 1024);
  let isOdd = ptr & 1;
  let notPtr = tinyInt | isOdd;
  if (!notPtr) {{
    let header: number = ptr[0];
    let rc = header & 65535;
    let isZero = Number(rc == 0);
    if (!isZero) {{
      let gtOne = Number(rc > 1);
      if (gtOne) {{
        let newHdr = header + -1;
        ptr[0] = newHdr;
      }} else {{
        let isRefB = header >>> 16;
        let bitSet: number = isRefB;
        let i: number = 1;
        while (true) {{
          let stop = Number(i > 16);
          if (stop) {{
            break;
          }}
          let isRef = isRefB & 1;
          if (isRef) {{
            let bytOfst = i << 2;
            let fPtr = ptr + bytOfst;
            __$dec_ref(fPtr);
          }}
          let isRefB2 = bitSet >>> 1;
          let newI = i + 1;
          bitSet = isRefB2;
          i = newI;
        }}
        __$free(ptr);
      }}
    }}
  }}
  return 0;
}}
"#,
      lir::ts_prolog(),
    );
    assert_lowered(sources, heap, &expected);
  }
}
