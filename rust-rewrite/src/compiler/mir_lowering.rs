use super::mir_unused_name_elimination;
use crate::{
  ast::{common_names::encoded_fn_name_free, hir, mir},
  common::{rc_string, rcs, Str},
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

fn reference_type_name(type_: &mir::Type) -> Option<Str> {
  match type_ {
    mir::Type::Primitive(mir::PrimitiveType::String) => Some(rcs("string")),
    mir::Type::Id(n) => Some(n.clone()),
    _ => None,
  }
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

fn dec_ref_fn_name(name: &str) -> Str {
  rc_string(format!("__decRef_{}", name))
}

fn dec_ref_fn_arg_type(type_name: &Str) -> mir::Type {
  if type_name.as_str().eq("string") {
    mir::STRING_TYPE
  } else {
    mir::Type::Id(type_name.clone())
  }
}

fn variable_of_mir_expr(expression: &mir::Expression) -> Option<Str> {
  if let mir::Expression::Variable(n, _) = expression {
    Some(n.clone())
  } else {
    None
  }
}

fn generate_single_destructor_function<F: FnOnce(Str, mir::Type, &mut Vec<mir::Statement>)>(
  type_name: &Str,
  get_destruct_member_stmts: F,
) -> mir::Function {
  let parameter_name = rcs("o");
  let parameter_type = dec_ref_fn_arg_type(type_name);
  let mut destruct_member_statements = vec![];
  get_destruct_member_stmts(
    parameter_name.clone(),
    parameter_type.clone(),
    &mut destruct_member_statements,
  );
  let body = generate_single_destructor_construct_body(
    &parameter_type,
    destruct_member_statements,
    mir::Expression::Variable(parameter_name.clone(), parameter_type.clone()),
    type_name,
  );
  mir::Function {
    name: dec_ref_fn_name(&type_name),
    parameters: vec![parameter_name],
    type_: mir::Type::new_fn_unwrapped(vec![parameter_type], mir::INT_TYPE),
    body,
    return_value: mir::ZERO,
  }
}

fn generate_single_destructor_construct_body(
  parameter_type: &mir::Type,
  mut destruct_member_statements: Vec<mir::Statement>,
  parameter: mir::Expression,
  type_name: &Str,
) -> Vec<mir::Statement> {
  if parameter_type.is_the_same_type(&mir::ANY_TYPE) {
    destruct_member_statements.push(mir::Statement::Call {
      callee: mir::Expression::Name(
        rc_string(encoded_fn_name_free()),
        mir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![parameter.clone()],
      return_type: mir::INT_TYPE,
      return_collector: None,
    });
  } else {
    destruct_member_statements.push(mir::Statement::Cast {
      name: rcs("pointer_casted"),
      type_: mir::ANY_TYPE,
      assigned_expression: parameter.clone(),
    });
    destruct_member_statements.push(mir::Statement::Call {
      callee: mir::Expression::Name(
        rc_string(encoded_fn_name_free()),
        mir::Type::Fn(unknown_member_destructor_type()),
      ),
      arguments: vec![mir::Expression::Variable(rcs("pointer_casted"), mir::ANY_TYPE)],
      return_type: mir::INT_TYPE,
      return_collector: None,
    });
  }
  if type_name.as_str().ne("string") {
    vec![
      /* currentRefCount = parameter[0] */
      mir::Statement::IndexedAccess {
        name: rcs("currentRefCount"),
        type_: mir::INT_TYPE,
        pointer_expression: parameter.clone(),
        index: 0,
      },
      /* decrementedRefCount = currentRefCount - 1 */
      mir::Statement::binary(
        "decrementedRefCount",
        hir::Operator::MINUS,
        mir::Expression::Variable(rcs("currentRefCount"), mir::INT_TYPE),
        mir::ONE,
      ),
      /* parameter[0] = decrementedRefCount */
      mir::Statement::IndexedAssign {
        assigned_expression: mir::Expression::Variable(rcs("decrementedRefCount"), mir::INT_TYPE),
        pointer_expression: parameter,
        index: 0,
      },
      /* dead = currentRefCount <= 1 */
      mir::Statement::binary(
        "dead",
        hir::Operator::LE,
        mir::Expression::Variable(rcs("currentRefCount"), mir::INT_TYPE),
        mir::ONE,
      ),
      /* if (dead) destructMemberStatements; */
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(rcs("dead"), mir::BOOL_TYPE),
        invert_condition: false,
        statements: destruct_member_statements,
      },
    ]
  } else {
    vec![
      /* currentRefCount = parameter[0] */
      mir::Statement::IndexedAccess {
        name: rcs("currentRefCount"),
        type_: mir::INT_TYPE,
        pointer_expression: parameter.clone(),
        index: 0,
      },
      /* performGC = currentRefCount > 0 */
      mir::Statement::binary(
        "performGC",
        hir::Operator::GT,
        mir::Expression::Variable(rcs("currentRefCount"), mir::INT_TYPE),
        mir::ZERO,
      ),
      mir::Statement::SingleIf {
        condition: mir::Expression::Variable(rcs("performGC"), mir::BOOL_TYPE),
        invert_condition: false,
        statements: vec![
          /* decrementedRefCount = currentRefCount - 1 */
          mir::Statement::binary(
            "decrementedRefCount",
            hir::Operator::MINUS,
            mir::Expression::Variable(rcs("currentRefCount"), mir::INT_TYPE),
            mir::ONE,
          ),
          /* parameter[0] = decrementedRefCount */
          mir::Statement::IndexedAssign {
            assigned_expression: mir::Expression::Variable(
              rcs("decrementedRefCount"),
              mir::INT_TYPE,
            ),
            pointer_expression: parameter,
            index: 0,
          },
          /* dead = currentRefCount <= 1 */
          mir::Statement::binary(
            "dead",
            hir::Operator::LE,
            mir::Expression::Variable(rcs("currentRefCount"), mir::INT_TYPE),
            mir::ONE,
          ),
          /* if (dead) destructMemberStatements; */
          mir::Statement::SingleIf {
            condition: mir::Expression::Variable(rcs("dead"), mir::BOOL_TYPE),
            invert_condition: false,
            statements: destruct_member_statements,
          },
        ],
      },
    ]
  }
}

struct LoweringManager<'a> {
  closure_defs: &'a BTreeMap<Str, mir::FunctionType>,
  type_defs: &'a BTreeMap<Str, hir::TypeDefinition>,
  temp_id: i32,
}

impl<'a> LoweringManager<'a> {
  fn new(
    closure_defs: &'a BTreeMap<Str, mir::FunctionType>,
    type_defs: &'a BTreeMap<Str, hir::TypeDefinition>,
  ) -> LoweringManager<'a> {
    LoweringManager { closure_defs, type_defs, temp_id: 0 }
  }

  fn alloc_temp(&mut self) -> Str {
    let name = rc_string(format!("_mid_t{}", self.temp_id));
    self.temp_id += 1;
    name
  }

  fn generate_destructor_functions(&mut self) -> Vec<mir::Function> {
    let mut functions = vec![];

    for type_def in self.type_defs.values() {
      functions.push(generate_single_destructor_function(
        &type_def.identifier,
        |var_name, var_type, destruct_member_stmts| {
          let pointer_expression = mir::Expression::Variable(var_name, var_type);
          if type_def.is_object {
            for (index, type_) in type_def.mappings.iter().enumerate() {
              let lowered_type = lower_type(type_.clone());
              if let Some(type_name) = reference_type_name(&lowered_type) {
                destruct_member_stmts.push(mir::Statement::IndexedAccess {
                  name: rc_string(format!("v{}", index)),
                  type_: lowered_type.clone(),
                  pointer_expression: pointer_expression.clone(),
                  index: index + 1,
                });
                destruct_member_stmts.push(mir::Statement::Call {
                  callee: mir::Expression::Name(
                    dec_ref_fn_name(&type_name),
                    mir::Type::new_fn(vec![dec_ref_fn_arg_type(&type_name)], mir::INT_TYPE),
                  ),
                  arguments: vec![mir::Expression::Variable(
                    rc_string(format!("v{}", index)),
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
              .any(|t| reference_type_name(&lower_type(t.clone())).is_some())
            {
              destruct_member_stmts.push(mir::Statement::IndexedAccess {
                name: rcs("tag"),
                type_: mir::INT_TYPE,
                pointer_expression: pointer_expression.clone(),
                index: 1,
              });
            }
            for (index, type_) in type_def.mappings.iter().enumerate() {
              let lowered_type = lower_type(type_.clone());
              if let Some(type_name) = reference_type_name(&lowered_type) {
                let mut statements = vec![];
                if lowered_type.is_the_same_type(&mir::ANY_TYPE) {
                  statements.push(mir::Statement::IndexedAccess {
                    name: rc_string(format!("v{}", index)),
                    type_: lowered_type.clone(),
                    pointer_expression: pointer_expression.clone(),
                    index: 2,
                  });
                } else {
                  let temp = rc_string(format!("vTemp{}", index));
                  statements.push(mir::Statement::IndexedAccess {
                    name: temp.clone(),
                    type_: mir::ANY_TYPE,
                    pointer_expression: pointer_expression.clone(),
                    index: 2,
                  });
                  statements.push(mir::Statement::Cast {
                    name: rc_string(format!("v{}", index)),
                    type_: lowered_type.clone(),
                    assigned_expression: mir::Expression::Variable(temp, mir::ANY_TYPE),
                  });
                }
                statements.push(mir::Statement::Call {
                  callee: mir::Expression::Name(
                    dec_ref_fn_name(&type_name),
                    mir::Type::new_fn(vec![dec_ref_fn_arg_type(&type_name)], mir::INT_TYPE),
                  ),
                  arguments: vec![mir::Expression::Variable(
                    rc_string(format!("v{}", index)),
                    lowered_type,
                  )],
                  return_type: mir::INT_TYPE,
                  return_collector: None,
                });
                destruct_member_stmts.push(mir::Statement::binary_str(
                  rc_string(format!("tagComparison{}", index)),
                  hir::Operator::EQ,
                  mir::Expression::Variable(rcs("tag"), mir::INT_TYPE),
                  mir::Expression::int(i32::try_from(index).unwrap() + 1),
                ));
                destruct_member_stmts.push(mir::Statement::SingleIf {
                  condition: mir::Expression::Variable(
                    rc_string(format!("tagComparison{}", index)),
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
      functions.push(generate_single_destructor_function(type_name, |n, t, stmts| {
        let pointer_expression = mir::Expression::Variable(n, t);
        stmts.push(mir::Statement::IndexedAccess {
          name: rcs("destructor"),
          type_: mir::Type::Fn(unknown_member_destructor_type()),
          pointer_expression: pointer_expression.clone(),
          index: 1,
        });
        stmts.push(mir::Statement::IndexedAccess {
          name: rcs("context"),
          type_: mir::ANY_TYPE,
          pointer_expression: pointer_expression.clone(),
          index: 3,
        });
        stmts.push(mir::Statement::Call {
          callee: mir::Expression::Variable(
            rcs("destructor"),
            mir::Type::Fn(unknown_member_destructor_type()),
          ),
          arguments: vec![mir::Expression::Variable(rcs("context"), mir::ANY_TYPE)],
          return_type: mir::INT_TYPE,
          return_collector: None,
        });
      }));
    }

    functions.push(generate_single_destructor_function(&rcs("string"), |_, _, _| {}));

    functions.push(mir::Function {
      name: dec_ref_fn_name("nothing"),
      parameters: vec![rcs("o")],
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
    variables_not_to_deref: &HashSet<Str>,
  ) -> Vec<mir::Statement> {
    let mut lowered_statements = stmts.into_iter().flat_map(|s| self.lower_stmt(s)).collect_vec();
    let mut variable_to_decrease_reference_count = vec![];
    for s in &lowered_statements {
      match s {
        mir::Statement::Call { callee: _, arguments: _, return_type, return_collector } => {
          if let Some(type_name) = reference_type_name(return_type) {
            variable_to_decrease_reference_count
              .push((return_collector.clone().unwrap(), type_name.clone()));
          }
        }
        mir::Statement::IfElse { condition: _, s1: _, s2: _, final_assignments } => {
          for (n, t, _, _) in final_assignments {
            if let Some(type_name) = reference_type_name(t) {
              variable_to_decrease_reference_count.push((n.clone(), type_name.clone()));
            }
          }
        }
        mir::Statement::While { loop_variables: _, statements: _, break_collector } => {
          if let Some((n, t)) = break_collector {
            if let Some(type_name) = reference_type_name(t) {
              variable_to_decrease_reference_count.push((n.clone(), type_name.clone()));
            }
          }
        }
        mir::Statement::StructInit { struct_variable_name, type_, expression_list: _ } => {
          variable_to_decrease_reference_count
            .push((struct_variable_name.clone(), reference_type_name(type_).unwrap()));
        }
        _ => {}
      }
    }
    for (variable_name, type_name) in variable_to_decrease_reference_count {
      if variables_not_to_deref.contains(&variable_name) {
        continue;
      }
      lowered_statements.push(mir::Statement::Call {
        callee: mir::Expression::Name(
          dec_ref_fn_name(&type_name),
          mir::Type::new_fn(vec![dec_ref_fn_arg_type(&type_name)], mir::INT_TYPE),
        ),
        arguments: vec![mir::Expression::Variable(variable_name, dec_ref_fn_arg_type(&type_name))],
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
        } else {
          if index == 0 {
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
                  name: temp.clone(),
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
      }
      hir::Statement::Call { callee, arguments, return_type, return_collector } => {
        let lowered_return_type = lower_type(return_type);
        let return_collector = if let Some(c) = return_collector {
          Some(c)
        } else if reference_type_name(&lowered_return_type).is_some() {
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
              return_collector: return_collector.clone(),
            });
          }
          hir::Callee::Variable(hir::VariableName {
            name: closure_var_name,
            type_: closure_hir_type,
          }) => {
            let temp_fn = self.alloc_temp();
            let temp_cx = self.alloc_temp();
            let fn_type = self.closure_defs.get(&closure_hir_type.as_id().unwrap().name).unwrap();
            let pointer_expr =
              mir::Expression::Variable(closure_var_name, lower_type(closure_hir_type));
            statements.push(mir::Statement::IndexedAccess {
              name: temp_fn.clone(),
              type_: mir::Type::Fn(fn_type.clone()),
              pointer_expression: pointer_expr.clone(),
              index: 2,
            });
            statements.push(mir::Statement::IndexedAccess {
              name: temp_cx.clone(),
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
              return_collector: return_collector.clone(),
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
            mir::GenenalLoopVariables {
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
                    name: temp.clone(),
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
            name: temp.clone(),
            type_: mir::Type::Fn(type_erased_closure_type.clone()),
            assigned_expression: mir::Expression::Name(fn_name, mir::Type::Fn(original_fn_type)),
          });
          mir::Expression::Variable(temp, mir::Type::Fn(type_erased_closure_type))
        };
        let context_type_name = reference_type_name(context.type_());
        let cx_slot = if context.type_().is_the_same_type(&mir::ANY_TYPE) {
          context.clone()
        } else {
          let temp = self.alloc_temp();
          statements.push(mir::Statement::Cast {
            name: temp.clone(),
            type_: mir::ANY_TYPE,
            assigned_expression: context.clone(),
          });
          mir::Expression::Variable(temp, mir::ANY_TYPE)
        };
        let destructor_function_slot = if let Some(context_type_name) = context_type_name {
          let name = mir::Expression::Name(
            dec_ref_fn_name(&context_type_name),
            mir::Type::new_fn(vec![context.type_().clone()], mir::INT_TYPE),
          );
          if context.type_().is_the_same_type(&mir::ANY_TYPE) {
            name
          } else {
            let temp = self.alloc_temp();
            statements.push(mir::Statement::Cast {
              name: temp.clone(),
              type_: mir::Type::Fn(unknown_member_destructor_type()),
              assigned_expression: name,
            });
            mir::Expression::Variable(temp, mir::Type::Fn(unknown_member_destructor_type()))
          }
        } else {
          mir::Expression::Name(
            dec_ref_fn_name("nothing"),
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
    let type_name = if let Some(n) = reference_type_name(expression.type_()) { n } else { return };
    let count = self.alloc_temp();
    let new_count = self.alloc_temp();
    if type_name.as_str().ne("string") {
      collector.push(mir::Statement::IndexedAccess {
        name: count.clone(),
        type_: mir::INT_TYPE,
        pointer_expression: expression.clone(),
        index: 0,
      });
      collector.push(mir::Statement::binary_str(
        new_count.clone(),
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
        name: count.clone(),
        type_: mir::INT_TYPE,
        pointer_expression: expression.clone(),
        index: 0,
      });
      collector.push(mir::Statement::binary_str(
        not_special.clone(),
        hir::Operator::GT,
        mir::Expression::Variable(count.clone(), mir::INT_TYPE),
        mir::ZERO,
      ));
      collector.push(mir::Statement::SingleIf {
        condition: mir::Expression::Variable(not_special, mir::BOOL_TYPE),
        invert_condition: false,
        statements: vec![
          mir::Statement::binary_str(
            new_count.clone(),
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

pub(crate) fn compile_hir_to_mir(sources: hir::Sources) -> mir::Sources {
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
      name: identifier.clone(),
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
    type_defs
      .push(mir::TypeDefinition { name: type_def.identifier.clone(), mappings: mir_mappings });
    type_def_map.insert(type_def.identifier.clone(), type_def);
  }
  let mut functions = functions
    .into_iter()
    .map(|f| LoweringManager::new(&closure_def_map, &type_def_map).lower_function(f))
    .collect_vec();
  functions.append(
    &mut LoweringManager::new(&closure_def_map, &type_def_map).generate_destructor_functions(),
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
    common::rcs,
  };
  use pretty_assertions::assert_eq;

  #[test]
  fn boilterplate() {
    assert_eq!(
      "(t0: number, t1: Str) => boolean",
      super::lower_type(Type::new_fn(vec![INT_TYPE, STRING_TYPE], BOOL_TYPE)).pretty_print()
    );
  }

  fn assert_lowered(sources: Sources, expected: &str) {
    assert_eq!(expected, super::compile_hir_to_mir(sources).pretty_print());
  }

  #[test]
  fn smoke_test() {
    assert_lowered(
      Sources {
        global_variables: vec![],
        closure_types: vec![],
        type_definitions: vec![],
        main_function_names: vec![rcs(common_names::ENCODED_COMPILED_PROGRAM_MAIN)],
        functions: vec![],
      },
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
    let closure_type = &Type::new_id_no_targs("CC");
    let obj_type = &Type::new_id_no_targs("Object");
    let variant_type = &Type::new_id_no_targs("Variant");
    let sources = Sources {
      global_variables: vec![],
      closure_types: vec![ClosureTypeDefinition {
        identifier: rcs("CC"),
        type_parameters: vec![],
        function_type: Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
      }],
      type_definitions: vec![
        TypeDefinition {
          identifier: rcs("Object"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, INT_TYPE],
        },
        TypeDefinition {
          identifier: rcs("Variant"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![INT_TYPE, INT_TYPE],
        },
        TypeDefinition {
          identifier: rcs("Object2"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE, Type::new_id_no_targs("Foo")],
        },
        TypeDefinition {
          identifier: rcs("Variant2"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE],
        },
        TypeDefinition {
          identifier: rcs("Variant3"),
          is_object: false,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![STRING_TYPE, Type::new_id_no_targs("Foo")],
        },
      ],
      main_function_names: vec![rcs(common_names::ENCODED_COMPILED_PROGRAM_MAIN)],
      functions: vec![
        Function {
          name: rcs("cc"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::Call {
              callee: Callee::Variable(VariableName::new("cc", closure_type.clone())),
              arguments: vec![ZERO],
              return_type: INT_TYPE,
              return_collector: None,
            },
            Statement::IndexedAccess {
              name: rcs("v1"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("a", obj_type.clone()),
              index: 0,
            },
            Statement::IndexedAccess {
              name: rcs("v2"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("b", variant_type.clone()),
              index: 0,
            },
            Statement::IndexedAccess {
              name: rcs("v3"),
              type_: INT_TYPE,
              pointer_expression: Expression::var_name("b", variant_type.clone()),
              index: 1,
            },
            Statement::IndexedAccess {
              name: rcs("v4"),
              type_: STRING_TYPE,
              pointer_expression: Expression::var_name("b", variant_type.clone()),
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
                name: rcs("_"),
                type_: INT_TYPE,
                initial_value: ZERO,
                loop_value: ZERO,
              }],
              statements: vec![Statement::SingleIf {
                condition: ZERO,
                invert_condition: true,
                statements: vec![Statement::Break(ZERO)],
              }],
              break_collector: Some(VariableName::new("_", Type::new_id_no_targs("_"))),
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: rcs("main"),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::binary("v1", Operator::PLUS, ZERO, ZERO),
            Statement::StructInit {
              struct_variable_name: rcs("O"),
              type_: obj_type.as_id().unwrap().clone(),
              expression_list: vec![
                ZERO,
                Expression::var_name("obj", Type::new_id_no_targs("Obj")),
              ],
            },
            Statement::StructInit {
              struct_variable_name: rcs("v1"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, ZERO],
            },
            Statement::StructInit {
              struct_variable_name: rcs("v2"),
              type_: variant_type.as_id().unwrap().clone(),
              expression_list: vec![ZERO, Expression::StringName(rcs("G1"))],
            },
            Statement::ClosureInit {
              closure_variable_name: rcs("c1"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                "aaa",
                Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
              ),
              context: Expression::StringName(rcs("G1")),
            },
            Statement::ClosureInit {
              closure_variable_name: rcs("c2"),
              closure_type: closure_type.as_id().unwrap().clone(),
              function_name: FunctionName::new(
                "bbb",
                Type::new_fn_unwrapped(vec![INT_TYPE], INT_TYPE),
              ),
              context: ZERO,
            },
          ],
          return_value: ZERO,
        },
        Function {
          name: rcs(common_names::ENCODED_COMPILED_PROGRAM_MAIN),
          parameters: vec![],
          type_parameters: vec![],
          type_: Type::new_fn_unwrapped(vec![], INT_TYPE),
          body: vec![
            Statement::IfElse {
              condition: TRUE,
              s1: vec![
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    "main",
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: None,
                },
                Statement::Call {
                  callee: Callee::FunctionName(FunctionName::new(
                    "cc",
                    Type::new_fn_unwrapped(vec![], INT_TYPE),
                  )),
                  arguments: vec![ZERO],
                  return_type: INT_TYPE,
                  return_collector: Some(rcs("ccc")),
                },
              ],
              s2: vec![
                Statement::Call {
                  callee: Callee::Variable(VariableName::new("cc", closure_type.clone())),
                  arguments: vec![ZERO],
                  return_type: Type::new_id_no_targs("CC"),
                  return_collector: None,
                },
                Statement::ClosureInit {
                  closure_variable_name: rcs("v2"),
                  closure_type: closure_type.as_id().unwrap().clone(),
                  function_name: FunctionName::new(
                    "aaa",
                    Type::new_fn_unwrapped(vec![STRING_TYPE], INT_TYPE),
                  ),
                  context: Expression::var_name("G1", Type::new_id_no_targs("CC")),
                },
              ],
              final_assignments: vec![(
                rcs("finalV"),
                closure_type.clone(),
                Expression::var_name("v1", closure_type.clone()),
                Expression::var_name("v2", closure_type.clone()),
              )],
            },
            Statement::IfElse {
              condition: TRUE,
              s1: vec![],
              s2: vec![],
              final_assignments: vec![(rcs("finalV2"), INT_TYPE, ZERO, ZERO)],
            },
            Statement::While {
              loop_variables: vec![],
              statements: vec![],
              break_collector: Some(VariableName::new("finalV3", INT_TYPE)),
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
  let _mid_t0: (t0: any, t1: number) => number = cc[2];
  let _mid_t1: any = cc[3];
  _mid_t0(_mid_t1, 0);
  let v1: number = a[1];
  let v2: number = b[1];
  let _mid_t2: any = b[2];
  let v3 = _mid_t2 as number;
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
  let _mid_t0: number = obj[0];
  let _mid_t1: number = _mid_t0 + 1;
  obj[0] = _mid_t1;
  let O: Object = [1, 0, obj];
  let _mid_t2 = 0 as any;
  let v1: Variant = [1, 0, _mid_t2];
  let _mid_t3: number = G1[0];
  let _mid_t5: boolean = _mid_t3 > 0;
  if (_mid_t5) {{
    let _mid_t4: number = _mid_t3 + 1;
    G1[0] = _mid_t4;
  }}
  let v2: Variant = [1, 0, G1];
  let _mid_t6: number = G1[0];
  let _mid_t8: boolean = _mid_t6 > 0;
  if (_mid_t8) {{
    let _mid_t7: number = _mid_t6 + 1;
    G1[0] = _mid_t7;
  }}
  let c1: CC = [1, __decRef_string, aaa, G1];
  let _mid_t9 = bbb as (t0: any) => number;
  let _mid_t10 = 0 as any;
  let c2: CC = [1, __decRef_nothing, _mid_t9, _mid_t10];
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
    let _mid_t1: (t0: any, t1: number) => number = cc[2];
    let _mid_t2: any = cc[3];
    let _mid_t0: CC = _mid_t1(_mid_t2, 0);
    let _mid_t3: number = _mid_t0[0];
    let _mid_t4: number = _mid_t3 + 1;
    _mid_t0[0] = _mid_t4;
    let _mid_t5: number = G1[0];
    let _mid_t6: number = _mid_t5 + 1;
    G1[0] = _mid_t6;
    let _mid_t7 = G1 as any;
    let _mid_t8 = __decRef_CC as (t0: any) => number;
    let v2: CC = [1, _mid_t8, aaa, _mid_t7];
    __decRef_CC(_mid_t0);
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
    assert_lowered(sources, &expected);
  }
}
