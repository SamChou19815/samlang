use super::mir_unused_name_elimination;
use crate::{
  ast::{common_names::encoded_fn_name_free, hir, mir},
  common::PStr,
  Heap,
};
use itertools::Itertools;
use std::collections::{BTreeMap, HashSet};

fn lower_type(type_: hir::Type) -> mir::Type {
  match type_ {
    hir::Type::Primitive(hir::PrimitiveType::Bool) => {
      mir::Type::Primitive(mir::PrimitiveType::Bool)
    }
    hir::Type::Primitive(hir::PrimitiveType::Int) => mir::Type::Primitive(mir::PrimitiveType::Int),
    hir::Type::Primitive(hir::PrimitiveType::String) => {
      mir::Type::Primitive(mir::PrimitiveType::String)
    }
    hir::Type::Id(hir::IdType { name, type_arguments }) => {
      assert!(type_arguments.is_empty());
      mir::Type::Id(name)
    }
    hir::Type::Fn(f) => mir::Type::Fn(lower_fn_type(f)),
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
    hir::Expression::IntLiteral(i, is_int) => {
      mir::Expression::IntLiteral(i, if is_int { mir::INT_TYPE } else { mir::BOOL_TYPE })
    }
    hir::Expression::StringName(n) => mir::Expression::Name(n, mir::STRING_TYPE),
    hir::Expression::FunctionName(hir::FunctionName { name, type_, type_arguments }) => {
      assert!(type_arguments.is_empty());
      mir::Expression::Name(name, mir::Type::Fn(lower_fn_type(type_)))
    }
    hir::Expression::Variable(hir::VariableName { name, type_ }) => {
      mir::Expression::Variable(name, lower_type(type_))
    }
  }
}

fn reference_type_name(heap: &mut Heap, type_: &mir::Type) -> Option<PStr> {
  match type_ {
    mir::Type::Primitive(mir::PrimitiveType::String) => Some(heap.alloc_str("string")),
    mir::Type::Id(n) => Some(*n),
    _ => None,
  }
}

fn dec_ref_fn_name(name: &str) -> String {
  format!("__decRef_{name}")
}

fn dec_ref_fn_arg_type(heap: &Heap, type_name: PStr) -> mir::Type {
  if type_name.as_str(heap).eq("string") {
    mir::STRING_TYPE
  } else {
    mir::Type::Id(type_name)
  }
}

fn variable_of_mir_expr(expression: &mir::Expression) -> Option<PStr> {
  if let mir::Expression::Variable(n, _) = expression {
    Some(*n)
  } else {
    None
  }
}

fn generate_single_destructor_function<
  F: FnOnce(&mut Heap, PStr, mir::Type, &mut Vec<mir::Statement>),
>(
  type_name: PStr,
  heap: &mut Heap,
  get_destruct_member_stmts: F,
) -> mir::Function {
  let parameter_name = heap.alloc_str("o");
  let parameter_type = dec_ref_fn_arg_type(heap, type_name);
  let mut destruct_member_statements = vec![];
  get_destruct_member_stmts(
    heap,
    parameter_name,
    parameter_type.clone(),
    &mut destruct_member_statements,
  );
  let body = generate_single_destructor_construct_body(
    heap,
    &parameter_type,
    destruct_member_statements,
    mir::Expression::Variable(parameter_name, parameter_type.clone()),
    type_name,
  );
  mir::Function {
    name: heap.alloc_string(dec_ref_fn_name(type_name.as_str(heap))),
    parameters: vec![parameter_name],
    type_: mir::Type::new_fn_unwrapped(vec![parameter_type], mir::INT_TYPE),
    body,
    return_value: mir::ZERO,
  }
}

fn generate_single_destructor_construct_body(
  heap: &mut Heap,
  parameter_type: &mir::Type,
  mut destruct_member_statements: Vec<mir::Statement>,
  parameter: mir::Expression,
  type_name: PStr,
) -> Vec<mir::Statement> {
  if parameter_type.is_the_same_type(&mir::ANY_TYPE) {
    destruct_member_statements.push(mir::Statement::Call {
      callee: mir::Expression::Name(
        heap.alloc_string(encoded_fn_name_free()),
        mir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![parameter.clone()],
      return_type: mir::INT_TYPE,
      return_collector: None,
    });
  } else {
    destruct_member_statements.push(mir::Statement::Cast {
      name: heap.alloc_str("pointer_casted"),
      type_: mir::ANY_TYPE,
      assigned_expression: parameter.clone(),
    });
    destruct_member_statements.push(mir::Statement::Call {
      callee: mir::Expression::Name(
        heap.alloc_string(encoded_fn_name_free()),
        mir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![mir::Expression::Variable(heap.alloc_str("pointer_casted"), mir::ANY_TYPE)],
      return_type: mir::INT_TYPE,
      return_collector: None,
    });
  }
  if type_name.as_str(heap).ne("string") {
    vec![
      /* currentRefCount = parameter[0] */
      mir::Statement::IndexedAccess {
        name: heap.alloc_str("currentRefCount"),
        type_: mir::INT_TYPE,
        pointer_expression: parameter.clone(),
        index: 0,
      },
      /* decrementedRefCount = currentRefCount - 1 */
      mir::Statement::binary(
        heap.alloc_str("decrementedRefCount"),
        hir::Operator::MINUS,
        mir::Expression::Variable(heap.alloc_str("currentRefCount"), mir::INT_TYPE),
        mir::ONE,
      ),
      /* parameter[0] = decrementedRefCount */
      mir::Statement::IndexedAssign {
        assigned_expression: mir::Expression::Variable(
          heap.alloc_str("decrementedRefCount"),
          mir::INT_TYPE,
        ),
        pointer_expression: parameter,
        index: 0,
      },
      /* dead = currentRefCount <= 1 */
      mir::Statement::binary(
        heap.alloc_str("dead"),
        hir::Operator::LE,
        mir::Expression::Variable(heap.alloc_str("currentRefCount"), mir::INT_TYPE),
        mir::ONE,
      ),
      /* if (dead) destructMemberStatements; */
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(heap.alloc_str("dead"), mir::BOOL_TYPE),
        invert_condition: false,
        statements: destruct_member_statements,
      },
    ]
  } else {
    vec![
      /* currentRefCount = parameter[0] */
      mir::Statement::IndexedAccess {
        name: heap.alloc_str("currentRefCount"),
        type_: mir::INT_TYPE,
        pointer_expression: parameter.clone(),
        index: 0,
      },
      /* performGC = currentRefCount > 0 */
      mir::Statement::binary(
        heap.alloc_str("performGC"),
        hir::Operator::GT,
        mir::Expression::Variable(heap.alloc_str("currentRefCount"), mir::INT_TYPE),
        mir::ZERO,
      ),
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(heap.alloc_str("performGC"), mir::BOOL_TYPE),
        invert_condition: false,
        statements: vec![
          /* decrementedRefCount = currentRefCount - 1 */
          mir::Statement::binary(
            heap.alloc_str("decrementedRefCount"),
            hir::Operator::MINUS,
            mir::Expression::Variable(heap.alloc_str("currentRefCount"), mir::INT_TYPE),
            mir::ONE,
          ),
          /* parameter[0] = decrementedRefCount */
          mir::Statement::IndexedAssign {
            assigned_expression: mir::Expression::Variable(
              heap.alloc_str("decrementedRefCount"),
              mir::INT_TYPE,
            ),
            pointer_expression: parameter,
            index: 0,
          },
          /* dead = currentRefCount <= 1 */
          mir::Statement::binary(
            heap.alloc_str("dead"),
            hir::Operator::LE,
            mir::Expression::Variable(heap.alloc_str("currentRefCount"), mir::INT_TYPE),
            mir::ONE,
          ),
          /* if (dead) destructMemberStatements; */
          mir::Statement::SingleIf {
            condition: mir::Expression::Variable(heap.alloc_str("dead"), mir::BOOL_TYPE),
            invert_condition: false,
            statements: destruct_member_statements,
          },
        ],
      },
    ]
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

  fn generate_destructor_functions(&mut self) -> Vec<mir::Function> {
    let mut functions = vec![];

    for type_def in self.type_defs.values() {
      functions.push(generate_single_destructor_function(
        type_def.identifier,
        self.heap,
        |heap, var_name, var_type, destruct_member_stmts| {
          let pointer_expression = mir::Expression::Variable(var_name, var_type);
          if type_def.is_object {
            for (index, type_) in type_def.mappings.iter().enumerate() {
              let lowered_type = lower_type(type_.clone());
              if let Some(type_name) = reference_type_name(heap, &lowered_type) {
                destruct_member_stmts.push(mir::Statement::IndexedAccess {
                  name: heap.alloc_string(format!("v{index}")),
                  type_: lowered_type.clone(),
                  pointer_expression: pointer_expression.clone(),
                  index: index + 1,
                });
                destruct_member_stmts.push(mir::Statement::Call {
                  callee: mir::Expression::Name(
                    heap.alloc_string(dec_ref_fn_name(type_name.as_str(heap))),
                    mir::Type::new_fn(vec![dec_ref_fn_arg_type(heap, type_name)], mir::INT_TYPE),
                  ),
                  arguments: vec![mir::Expression::Variable(
                    heap.alloc_string(format!("v{index}")),
                    lowered_type,
                  )],
                  return_type: mir::INT_TYPE,
                  return_collector: None,
                });
              }
            }
          } else {
            if type_def
              .mappings
              .iter()
              .any(|t| reference_type_name(heap, &lower_type(t.clone())).is_some())
            {
              destruct_member_stmts.push(mir::Statement::IndexedAccess {
                name: heap.alloc_str("tag"),
                type_: mir::INT_TYPE,
                pointer_expression: pointer_expression.clone(),
                index: 1,
              });
            }
            for (index, type_) in type_def.mappings.iter().enumerate() {
              let lowered_type = lower_type(type_.clone());
              if let Some(type_name) = reference_type_name(heap, &lowered_type) {
                let mut statements = vec![];
                if lowered_type.is_the_same_type(&mir::ANY_TYPE) {
                  statements.push(mir::Statement::IndexedAccess {
                    name: heap.alloc_string(format!("v{index}")),
                    type_: lowered_type.clone(),
                    pointer_expression: pointer_expression.clone(),
                    index: 2,
                  });
                } else {
                  let temp = heap.alloc_string(format!("vTemp{index}"));
                  statements.push(mir::Statement::IndexedAccess {
                    name: temp,
                    type_: mir::ANY_TYPE,
                    pointer_expression: pointer_expression.clone(),
                    index: 2,
                  });
                  statements.push(mir::Statement::Cast {
                    name: heap.alloc_string(format!("v{index}")),
                    type_: lowered_type.clone(),
                    assigned_expression: mir::Expression::Variable(temp, mir::ANY_TYPE),
                  });
                }
                statements.push(mir::Statement::Call {
                  callee: mir::Expression::Name(
                    heap.alloc_string(dec_ref_fn_name(type_name.as_str(heap))),
                    mir::Type::new_fn(vec![dec_ref_fn_arg_type(heap, type_name)], mir::INT_TYPE),
                  ),
                  arguments: vec![mir::Expression::Variable(
                    heap.alloc_string(format!("v{index}")),
                    lowered_type,
                  )],
                  return_type: mir::INT_TYPE,
                  return_collector: None,
                });
                destruct_member_stmts.push(mir::Statement::binary(
                  heap.alloc_string(format!("tagComparison{index}")),
                  hir::Operator::EQ,
                  mir::Expression::Variable(heap.alloc_str("tag"), mir::INT_TYPE),
                  mir::Expression::int(i32::try_from(index).unwrap() + 1),
                ));
                destruct_member_stmts.push(mir::Statement::SingleIf {
                  condition: mir::Expression::Variable(
                    heap.alloc_string(format!("tagComparison{index}")),
                    mir::BOOL_TYPE,
                  ),
                  invert_condition: false,
                  statements,
                });
              }
            }
          }
        },
      ));
    }

    for type_name in self.closure_defs.keys() {
      functions.push(generate_single_destructor_function(
        *type_name,
        self.heap,
        |heap, n, t, stmts| {
          let pointer_expression = mir::Expression::Variable(n, t);
          stmts.push(mir::Statement::IndexedAccess {
            name: heap.alloc_str("destructor"),
            type_: mir::Type::Fn(unknown_member_destructor_type()),
            pointer_expression: pointer_expression.clone(),
            index: 1,
          });
          stmts.push(mir::Statement::IndexedAccess {
            name: heap.alloc_str("context"),
            type_: mir::ANY_TYPE,
            pointer_expression,
            index: 3,
          });
          stmts.push(mir::Statement::Call {
            callee: mir::Expression::Variable(
              heap.alloc_str("destructor"),
              mir::Type::Fn(unknown_member_destructor_type()),
            ),
            arguments: vec![mir::Expression::Variable(heap.alloc_str("context"), mir::ANY_TYPE)],
            return_type: mir::INT_TYPE,
            return_collector: None,
          });
        },
      ));
    }

    functions.push(generate_single_destructor_function(
      self.heap.alloc_str("string"),
      self.heap,
      |_, _, _, _| {},
    ));

    functions.push(mir::Function {
      name: self.heap.alloc_string(dec_ref_fn_name("nothing")),
      parameters: vec![self.heap.alloc_str("o")],
      type_: unknown_member_destructor_type(),
      body: vec![],
      return_value: mir::ZERO,
    });

    functions
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
          if let Some(type_name) = reference_type_name(self.heap, return_type) {
            variable_to_decrease_reference_count.push(((*return_collector).unwrap(), type_name));
          }
        }
        mir::Statement::IfElse { condition: _, s1: _, s2: _, final_assignments } => {
          for (n, t, _, _) in final_assignments {
            if let Some(type_name) = reference_type_name(self.heap, t) {
              variable_to_decrease_reference_count.push((*n, type_name));
            }
          }
        }
        mir::Statement::While {
          loop_variables: _,
          statements: _,
          break_collector: Some((n, t)),
        } => {
          if let Some(type_name) = reference_type_name(self.heap, t) {
            variable_to_decrease_reference_count.push((*n, type_name));
          }
        }
        mir::Statement::StructInit { struct_variable_name, type_, expression_list: _ } => {
          variable_to_decrease_reference_count
            .push((*struct_variable_name, reference_type_name(self.heap, type_).unwrap()));
        }
        _ => {}
      }
    }
    for (variable_name, type_name) in variable_to_decrease_reference_count {
      if variables_not_to_deref.contains(&variable_name) {
        continue;
      }
      let var_type = dec_ref_fn_arg_type(self.heap, type_name);
      lowered_statements.push(mir::Statement::Call {
        callee: mir::Expression::Name(
          self.heap.alloc_string(dec_ref_fn_name(type_name.as_str(self.heap))),
          mir::Type::new_fn(vec![var_type.clone()], mir::INT_TYPE),
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
      hir::Statement::Binary(hir::Binary { name, type_, operator, e1, e2 }) => {
        vec![mir::Statement::Binary {
          name,
          type_: lower_type(type_),
          operator,
          e1: lower_expression(e1),
          e2: lower_expression(e2),
        }]
      }
      hir::Statement::IndexedAccess { name, type_, pointer_expression, index } => {
        let pointer_expr = lower_expression(pointer_expression);
        let variable_type = lower_type(type_);
        let type_def = self.type_defs.get(pointer_expr.type_().as_id().unwrap()).unwrap();
        if type_def.is_object {
          vec![mir::Statement::IndexedAccess {
            name,
            type_: variable_type,
            pointer_expression: pointer_expr,
            index: index + 1,
          }]
        } else if index == 0 {
          // Access the tag
          assert!(variable_type.as_primitive().unwrap().eq(&mir::PrimitiveType::Int));
          vec![mir::Statement::IndexedAccess {
            name,
            type_: variable_type,
            pointer_expression: pointer_expr,
            index: 1,
          }]
        } else {
          // Access the data, might need cast
          assert!(index == 1);
          if variable_type.is_the_same_type(&mir::ANY_TYPE) {
            vec![mir::Statement::IndexedAccess {
              name,
              type_: variable_type,
              pointer_expression: pointer_expr,
              index: 2,
            }]
          } else {
            let temp = self.alloc_temp();
            vec![
              mir::Statement::IndexedAccess {
                name: temp,
                type_: mir::ANY_TYPE,
                pointer_expression: pointer_expr,
                index: 2,
              },
              mir::Statement::Cast {
                name,
                type_: variable_type,
                assigned_expression: mir::Expression::Variable(temp, mir::ANY_TYPE),
              },
            ]
          }
        }
      }
      hir::Statement::Call { callee, arguments, return_type, return_collector } => {
        let lowered_return_type = lower_type(return_type);
        let return_collector = if let Some(c) = return_collector {
          Some(c)
        } else if reference_type_name(self.heap, &lowered_return_type).is_some() {
          Some(self.alloc_temp())
        } else {
          None
        };
        let mut statements = vec![];
        match callee {
          hir::Callee::FunctionName(fn_name) => {
            statements.push(mir::Statement::Call {
              callee: lower_expression(hir::Expression::FunctionName(fn_name)),
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
              index: 2,
            });
            statements.push(mir::Statement::IndexedAccess {
              name: temp_cx,
              type_: mir::ANY_TYPE,
              pointer_expression: pointer_expr,
              index: 3,
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
      hir::Statement::StructInit { struct_variable_name, type_, expression_list } => {
        let type_def = self.type_defs.get(&type_.name).unwrap();
        let type_ = lower_type(hir::Type::Id(type_));
        let mut statements = vec![];
        let mut expression_list = if type_def.is_object {
          expression_list
            .into_iter()
            .map(|e| {
              let lowered = lower_expression(e);
              self.add_ref_counting_if_type_allowed(&mut statements, &lowered);
              lowered
            })
            .collect_vec()
        } else {
          expression_list
            .into_iter()
            .enumerate()
            .map(|(index, e)| {
              let lowered = lower_expression(e);
              self.add_ref_counting_if_type_allowed(&mut statements, &lowered);
              if index == 0 {
                lowered
              } else {
                assert!(index == 1);
                if lowered.type_().is_the_same_type(&mir::ANY_TYPE) {
                  lowered
                } else {
                  let temp = self.alloc_temp();
                  statements.push(mir::Statement::Cast {
                    name: temp,
                    type_: mir::ANY_TYPE,
                    assigned_expression: lowered,
                  });
                  mir::Expression::Variable(temp, mir::ANY_TYPE)
                }
              }
            })
            .collect_vec()
        };
        expression_list.insert(0, mir::ONE);
        statements.push(mir::Statement::StructInit {
          struct_variable_name,
          type_,
          expression_list,
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
        self.add_ref_counting_if_type_allowed(&mut statements, &context);
        let fn_name_slot = if mir::Type::Fn(original_fn_type.clone())
          .is_the_same_type(&mir::Type::Fn(type_erased_closure_type.clone()))
        {
          mir::Expression::Name(fn_name, mir::Type::Fn(original_fn_type))
        } else {
          let temp = self.alloc_temp();
          statements.push(mir::Statement::Cast {
            name: temp,
            type_: mir::Type::Fn(type_erased_closure_type.clone()),
            assigned_expression: mir::Expression::Name(fn_name, mir::Type::Fn(original_fn_type)),
          });
          mir::Expression::Variable(temp, mir::Type::Fn(type_erased_closure_type))
        };
        let context_type_name = reference_type_name(self.heap, context.type_());
        let cx_slot = if context.type_().is_the_same_type(&mir::ANY_TYPE) {
          context.clone()
        } else {
          let temp = self.alloc_temp();
          statements.push(mir::Statement::Cast {
            name: temp,
            type_: mir::ANY_TYPE,
            assigned_expression: context.clone(),
          });
          mir::Expression::Variable(temp, mir::ANY_TYPE)
        };
        let destructor_function_slot = if let Some(context_type_name) = context_type_name {
          let name = mir::Expression::Name(
            self.heap.alloc_string(dec_ref_fn_name(context_type_name.as_str(self.heap))),
            mir::Type::new_fn(vec![context.type_().clone()], mir::INT_TYPE),
          );
          if context.type_().is_the_same_type(&mir::ANY_TYPE) {
            name
          } else {
            let temp = self.alloc_temp();
            statements.push(mir::Statement::Cast {
              name: temp,
              type_: mir::Type::Fn(unknown_member_destructor_type()),
              assigned_expression: name,
            });
            mir::Expression::Variable(temp, mir::Type::Fn(unknown_member_destructor_type()))
          }
        } else {
          mir::Expression::Name(
            self.heap.alloc_string(dec_ref_fn_name("nothing")),
            mir::Type::Fn(unknown_member_destructor_type()),
          )
        };
        statements.push(mir::Statement::StructInit {
          struct_variable_name: closure_variable_name,
          type_: closure_type,
          expression_list: vec![mir::ONE, destructor_function_slot, fn_name_slot, cx_slot],
        });
        statements
      }
    }
  }

  fn add_ref_counting_if_type_allowed(
    &mut self,
    collector: &mut Vec<mir::Statement>,
    expression: &mir::Expression,
  ) {
    let type_name = if let Some(n) = reference_type_name(self.heap, expression.type_()) {
      n
    } else {
      return;
    };
    let count = self.alloc_temp();
    let new_count = self.alloc_temp();
    if type_name.as_str(self.heap).ne("string") {
      collector.push(mir::Statement::IndexedAccess {
        name: count,
        type_: mir::INT_TYPE,
        pointer_expression: expression.clone(),
        index: 0,
      });
      collector.push(mir::Statement::binary(
        new_count,
        hir::Operator::PLUS,
        mir::Expression::Variable(count, mir::INT_TYPE),
        mir::ONE,
      ));
      collector.push(mir::Statement::IndexedAssign {
        assigned_expression: mir::Expression::Variable(new_count, mir::INT_TYPE),
        pointer_expression: expression.clone(),
        index: 0,
      });
    } else {
      let not_special = self.alloc_temp();
      collector.push(mir::Statement::IndexedAccess {
        name: count,
        type_: mir::INT_TYPE,
        pointer_expression: expression.clone(),
        index: 0,
      });
      collector.push(mir::Statement::binary(
        not_special,
        hir::Operator::GT,
        mir::Expression::Variable(count, mir::INT_TYPE),
        mir::ZERO,
      ));
      collector.push(mir::Statement::SingleIf {
        condition: mir::Expression::Variable(not_special, mir::BOOL_TYPE),
        invert_condition: false,
        statements: vec![
          mir::Statement::binary(
            new_count,
            hir::Operator::PLUS,
            mir::Expression::Variable(count, mir::INT_TYPE),
            mir::ONE,
          ),
          mir::Statement::IndexedAssign {
            assigned_expression: mir::Expression::Variable(new_count, mir::INT_TYPE),
            pointer_expression: expression.clone(),
            index: 0,
          },
        ],
      });
    }
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
      mappings: vec![
        mir::INT_TYPE,
        mir::Type::new_fn(vec![mir::ANY_TYPE], mir::INT_TYPE),
        mir::Type::Fn(fn_type.clone()),
        mir::ANY_TYPE,
      ],
    });
    closure_def_map.insert(identifier, fn_type);
  }
  for type_def in type_definitions {
    let mut mir_mappings = if type_def.is_object {
      type_def.mappings.iter().cloned().map(lower_type).collect_vec()
    } else {
      vec![mir::INT_TYPE, mir::ANY_TYPE]
    };
    mir_mappings.insert(0, mir::INT_TYPE);
    type_defs.push(mir::TypeDefinition { name: type_def.identifier, mappings: mir_mappings });
    type_def_map.insert(type_def.identifier, type_def);
  }
  let mut functions = functions
    .into_iter()
    .map(|f| LoweringManager::new(heap, &closure_def_map, &type_def_map).lower_function(f))
    .collect_vec();
  functions.append(
    &mut LoweringManager::new(heap, &closure_def_map, &type_def_map)
      .generate_destructor_functions(),
  );
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
        Operator, Sources, Statement, Type, TypeDefinition, VariableName, BOOL_TYPE, INT_TYPE,
        STRING_TYPE, TRUE, ZERO,
      },
    },
    common::Heap,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert_eq!(
      "(t0: number, t1: Str) => boolean",
      super::lower_type(Type::new_fn(vec![INT_TYPE, STRING_TYPE], BOOL_TYPE))
        .pretty_print(&Heap::new())
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
        main_function_names: vec![heap.alloc_str(common_names::ENCODED_COMPILED_PROGRAM_MAIN)],
        functions: vec![],
      },
      heap,
      &format!(
        r#"type Str = [number, string];
const {} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const {} = ([, line]: Str): number => {{ console.log(line); return 0; }};
const {} = ([, v]: Str): number => parseInt(v, 10);
const {} = (v: number): Str => [1, String(v)];
const {} = ([, v]: Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
"#,
        common_names::encoded_fn_name_string_concat(),
        common_names::encoded_fn_name_println(),
        common_names::encoded_fn_name_string_to_int(),
        common_names::encoded_fn_name_int_to_string(),
        common_names::encoded_fn_name_panic(),
        common_names::encoded_fn_name_free()
      ),
    );
  }

  #[test]
  fn comprehensive_test() {
    let heap = &mut Heap::new();

    let closure_type = &Type::new_id_no_targs(heap.alloc_str("CC"));
    let obj_type = &Type::new_id_no_targs(heap.alloc_str("Object"));
    let variant_type = &Type::new_id_no_targs(heap.alloc_str("Variant"));
    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![ClosureTypeDefinition {
        identifier: heap.alloc_str("CC"),
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      }],
      type_definitions: vec![
        TypeDefinition {
          identifier: heap.alloc_str("Object"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, INT_TYPE],
        },
        TypeDefinition {
          identifier: heap.alloc_str("Variant"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, INT_TYPE],
        },
        TypeDefinition {
          identifier: heap.alloc_str("Object2"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE, Type::new_id_no_targs(heap.alloc_str("Foo"))],
        },
        TypeDefinition {
          identifier: heap.alloc_str("Variant2"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE],
        },
        TypeDefinition {
          identifier: heap.alloc_str("Variant3"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE, Type::new_id_no_targs(heap.alloc_str("Foo"))],
        },
      ],
      main_function_names: vec![heap.alloc_str(common_names::ENCODED_COMPILED_PROGRAM_MAIN)],
      functions: vec![
        Function {
          name: heap.alloc_str("cc"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::Variable(VariableName::new(
                heap.alloc_str("cc"),
                closure_type.clone(),
              )),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str("v1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("a"), obj_type.clone()),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str("v2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("b"), variant_type.clone()),
              index: 0,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str("v3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("b"), variant_type.clone()),
              index: 1,
            },
            Statement::IndexedAccess {
              name: heap.alloc_str("v4"),
              type_: STRING_TYPE,
              pointer_expression: Expression::var_name(heap.alloc_str("b"), variant_type.clone()),
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
                name: heap.alloc_str("_"),
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
                heap.alloc_str("_"),
                Type::new_id_no_targs(heap.alloc_str("_")),
              )),
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::binary(heap.alloc_str("v1"), Operator::PLUS, ZERO, ZERO),
            Statement::StructInit {
              struct_variable_name: heap.alloc_str("O"),
              type_: obj_type.as_id().unwrap().clone(),
              expression_list: vec![
                ZERO,
                Expression::var_name(
                  heap.alloc_str("obj"),
                  Type::new_id_no_targs(heap.alloc_str("Obj")),
                ),
              ],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str("v1"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, ZERO],
            },
            Statement::StructInit {
              struct_variable_name: heap.alloc_str("v2"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, Expression::StringName(heap.alloc_str("G1"))],
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str("c1"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                heap.alloc_str("aaa"),
                Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
              ),
              context: Expression::StringName(heap.alloc_str("G1")),
            },
            Statement::ClosureInit {
              closure_variable_name: heap.alloc_str("c2"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                heap.alloc_str("bbb"),
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              ),
              context: ZERO,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: heap.alloc_str(common_names::ENCODED_COMPILED_PROGRAM_MAIN),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::IfElse {
              condition: TRUE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str("main"),
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    heap.alloc_str("cc"),
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: Some(heap.alloc_str("ccc")),
                },
              ],
              s2: vec![
                Statement::Call {
                  callee: Callee::Variable(VariableName::new(
                    heap.alloc_str("cc"),
                    closure_type.clone(),
                  )),
                  arguments: vec![ZERO],
                  return_type: Type::new_id_no_targs(heap.alloc_str("CC")),
                  return_collector: None,
                },
                Statement::ClosureInit {
                  closure_variable_name: heap.alloc_str("v2"),
                  closure_type: closure_type.as_id().unwrap().clone(),
                  function_name: FunctionName::new(
                    heap.alloc_str("aaa"),
                    Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
                  ),
                  context: Expression::var_name(
                    heap.alloc_str("G1"),
                    Type::new_id_no_targs(heap.alloc_str("CC")),
                  ),
                },
              ],
              final_assignments: vec![(
                heap.alloc_str("finalV"),
                closure_type.clone(),
                Expression::var_name(heap.alloc_str("v1"), closure_type.clone()),
                Expression::var_name(heap.alloc_str("v2"), closure_type.clone()),
              )],
            },
            Statement::IfElse {
              condition: TRUE,
              s1: vec![],
              s2: vec![],
              final_assignments: vec![(heap.alloc_str("finalV2"), INT_TYPE, ZERO, ZERO)],
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![],
              break_collector: Some(VariableName::new(heap.alloc_str("finalV3"), INT_TYPE)),
            },
          ],
          return_value: ZERO,
        },
      ],
    };
    let expected = format!(
      r#"type Str = [number, string];
const {} = ([, a]: Str, [, b]: Str): Str => [1, a + b];
const {} = ([, line]: Str): number => {{ console.log(line); return 0; }};
const {} = ([, v]: Str): number => parseInt(v, 10);
const {} = (v: number): Str => [1, String(v)];
const {} = ([, v]: Str): number => {{ throw Error(v); }};
const {} = (v: any): number => {{ v.length = 0; return 0 }};
type CC = [number, (t0: any) => number, (t0: any, t1: number) => number, any];
type Object = [number, number, number];
type Variant = [number, number, any];
function cc(): number {{
  let _t32: (t0: any, t1: number) => number = cc[2];
  let _t33: any = cc[3];
  _t32(_t33, 0);
  let v1: number = a[1];
  let v2: number = b[1];
  let _t34: any = b[2];
  let v3 = _t34 as number;
  let v4: Str = b[2];
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
  __decRef__(_);
  return 0;
}}
function main(): number {{
  let v1: number = 0 + 0;
  let _t36: number = obj[0];
  let _t37: number = _t36 + 1;
  obj[0] = _t37;
  let O: Object = [1, 0, obj];
  let _t38 = 0 as any;
  let v1: Variant = [1, 0, _t38];
  let _t40: number = G1[0];
  let _t42: boolean = _t40 > 0;
  if (_t42) {{
    let _t41: number = _t40 + 1;
    G1[0] = _t41;
  }}
  let v2: Variant = [1, 0, G1];
  let _t43: number = G1[0];
  let _t45: boolean = _t43 > 0;
  if (_t45) {{
    let _t44: number = _t43 + 1;
    G1[0] = _t44;
  }}
  let c1: CC = [1, __decRef_string, aaa, G1];
  let _t47 = bbb as (t0: any) => number;
  let _t48 = 0 as any;
  let c2: CC = [1, __decRef_nothing, _t47, _t48];
  __decRef_Object(O);
  __decRef_Variant(v1);
  __decRef_Variant(v2);
  __decRef_CC(c1);
  __decRef_CC(c2);
  return 0;
}}
function _compiled_program_main(): number {{
  let finalV: CC;
  if (true) {{
    main(0);
    let ccc: number = cc(0);
    finalV = v1;
  }} else {{
    let _t54: (t0: any, t1: number) => number = cc[2];
    let _t55: any = cc[3];
    let _t53: CC = _t54(_t55, 0);
    let _t56: number = _t53[0];
    let _t57: number = _t56 + 1;
    _t53[0] = _t57;
    let _t58: number = G1[0];
    let _t59: number = _t58 + 1;
    G1[0] = _t59;
    let _t60 = G1 as any;
    let _t61 = __decRef_CC as (t0: any) => number;
    let v2: CC = [1, _t61, aaa, _t60];
    __decRef_CC(_t53);
    finalV = v2;
  }}
  let finalV2: number;
  if (true) {{
    finalV2 = 0;
  }} else {{
    finalV2 = 0;
  }}
  let finalV3: number;
  while (true) {{
  }}
  __decRef_CC(finalV);
  return 0;
}}
function __decRef_Object(o: Object): number {{
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {{
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }}
  return 0;
}}
function __decRef_Variant(o: Variant): number {{
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {{
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }}
  return 0;
}}
function __decRef_CC(o: CC): number {{
  let currentRefCount: number = o[0];
  let decrementedRefCount: number = currentRefCount + -1;
  o[0] = decrementedRefCount;
  let dead: boolean = currentRefCount <= 1;
  if (dead) {{
    let destructor: (t0: any) => number = o[1];
    let context: any = o[3];
    destructor(context);
    let pointer_casted = o as any;
    _builtin_free(pointer_casted);
  }}
  return 0;
}}
function __decRef_string(o: Str): number {{
  let currentRefCount: number = o[0];
  let performGC: boolean = currentRefCount > 0;
  if (performGC) {{
    let decrementedRefCount: number = currentRefCount + -1;
    o[0] = decrementedRefCount;
    let dead: boolean = currentRefCount <= 1;
    if (dead) {{
      _builtin_free(o);
    }}
  }}
  return 0;
}}
function __decRef_nothing(o: any): number {{
  return 0;
}}
"#,
      common_names::encoded_fn_name_string_concat(),
      common_names::encoded_fn_name_println(),
      common_names::encoded_fn_name_string_to_int(),
      common_names::encoded_fn_name_int_to_string(),
      common_names::encoded_fn_name_panic(),
      common_names::encoded_fn_name_free()
    );
    assert_lowered(sources, heap, &expected);
  }
}
