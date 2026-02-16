use super::{
  hir_string_manager::StringManager,
  hir_type_conversion::{
    SynthesizedTypes, TypeLoweringManager, TypeSynthesizer, collect_used_generic_types,
    type_application,
  },
  mir_constant_param_elimination, mir_generics_specialization, mir_tail_recursion_rewrite,
  mir_type_deduplication,
};
use dupe::{Dupe, OptionDupedExt};
use itertools::Itertools;
use ordermap::OrderSet;
use samlang_ast::{hir, mir, source};
use samlang_checker::type_;
use samlang_collections::local_stacked_context::LocalStackedContext;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::{collections::HashMap, rc::Rc, sync::Arc};

struct LoweringResult {
  statements: Vec<hir::Statement>,
  expression: hir::Expression,
}

struct LoweringResultWithSyntheticFunctions {
  synthetic_functions: Vec<hir::Function>,
  statements: Vec<hir::Statement>,
  expression: hir::Expression,
}

type LoweringContext = LocalStackedContext<PStr, hir::Expression>;

fn bind_value(cx: &mut LoweringContext, name: PStr, value: hir::Expression) {
  match &value {
    hir::Expression::IntLiteral(_) | hir::Expression::Int31Zero | hir::Expression::Variable(_) => {
      cx.insert(name, value);
    }
    hir::Expression::StringName(n) => {
      let value_to_insert = cx.get(n).duped().unwrap_or(value);
      cx.insert(name, value_to_insert);
    }
  }
}

#[cfg(test)]
mod lowering_cx_boilterplate_tests {
  use super::*;

  #[test]
  fn tests() {
    bind_value(
      &mut LoweringContext::new(),
      PStr::LOWER_A,
      hir::Expression::var_name(PStr::LOWER_A, hir::INT_TYPE),
    );
    bind_value(
      &mut LoweringContext::new(),
      PStr::LOWER_B,
      hir::Expression::StringName(PStr::LOWER_A),
    );
  }
}

struct NextSyntheticFnIdManager {
  id: i32,
}

struct ExpressionLoweringManager<'a> {
  // Immutable states
  heap: &'a mut Heap,
  module_reference: &'a ModuleReference,
  defined_variables: Vec<(PStr, hir::Type)>,
  type_definition_mapping: &'a HashMap<hir::TypeName, hir::TypeDefinition>,
  type_lowering_manager: &'a mut TypeLoweringManager,
  string_manager: &'a mut StringManager,
  // Mutable states
  next_synthetic_fn_id_manager: &'a mut NextSyntheticFnIdManager,
  variable_cx: LoweringContext,
  synthetic_functions: Vec<hir::Function>,
}

impl<'a> ExpressionLoweringManager<'a> {
  #[allow(clippy::too_many_arguments)]
  fn new(
    module_reference: &'a ModuleReference,
    defined_variables: Vec<(PStr, hir::Type)>,
    type_definition_mapping: &'a HashMap<hir::TypeName, hir::TypeDefinition>,
    heap: &'a mut Heap,
    type_lowering_manager: &'a mut TypeLoweringManager,
    string_manager: &'a mut StringManager,
    next_synthetic_fn_id_manager: &'a mut NextSyntheticFnIdManager,
  ) -> ExpressionLoweringManager<'a> {
    let mut variable_cx = LoweringContext::new();
    for (n, t) in &defined_variables {
      bind_value(&mut variable_cx, *n, hir::Expression::var_name(*n, t.dupe()));
    }
    ExpressionLoweringManager {
      heap,
      module_reference,
      defined_variables,
      type_definition_mapping,
      type_lowering_manager,
      string_manager,
      next_synthetic_fn_id_manager,
      variable_cx,
      synthetic_functions: Vec::new(),
    }
  }

  fn allocate_temp_variable(&mut self) -> PStr {
    self.heap.alloc_temp_str()
  }

  fn allocate_synthetic_fn_name(&mut self) -> hir::FunctionName {
    let fn_id_str = self.next_synthetic_fn_id_manager.id.to_string();
    self.next_synthetic_fn_id_manager.id += 1;
    hir::FunctionName {
      type_name: hir::TypeName {
        module_reference: Some(ModuleReference::ROOT),
        type_name: PStr::UNDERSCORE_GENERATED_FN,
      },
      fn_name: self.heap.alloc_string(fn_id_str),
    }
  }

  fn lowered_and_add_statements(
    &mut self,
    expression: &source::expr::E<Rc<type_::Type>>,
    statements: &mut Vec<hir::Statement>,
  ) -> hir::Expression {
    let LoweringResult { statements: mut lowered_statements, expression: e } =
      self.lower(expression);
    statements.append(&mut lowered_statements);
    e
  }

  fn get_synthetic_identifier_type_from_tuple(&mut self, mappings: Vec<hir::Type>) -> hir::IdType {
    let type_parameters = collect_used_generic_types(
      &hir::Type::new_fn_unwrapped(mappings.clone(), hir::INT_TYPE),
      &self.type_lowering_manager.generic_types,
    )
    .into_iter()
    .sorted()
    .collect_vec();
    let type_arguments: Arc<[_]> =
      type_parameters.iter().copied().map(hir::Type::new_generic_type).collect();
    let name = self
      .type_lowering_manager
      .type_synthesizer
      .synthesize_tuple_type(self.heap, mappings, type_parameters)
      .name;
    hir::IdType { name, type_arguments }
  }

  fn get_synthetic_identifier_type_from_closure(
    &mut self,
    fn_type: hir::FunctionType,
  ) -> hir::IdType {
    let type_parameters =
      collect_used_generic_types(&fn_type, &self.type_lowering_manager.generic_types)
        .into_iter()
        .sorted()
        .collect_vec();
    let type_arguments: Arc<[_]> =
      type_parameters.iter().copied().map(hir::Type::new_generic_type).collect();
    let name = self
      .type_lowering_manager
      .type_synthesizer
      .synthesize_closure_type(self.heap, fn_type, type_parameters)
      .name;
    hir::IdType { name, type_arguments }
  }

  fn resolve_variable(&mut self, variable_name: &PStr) -> hir::Expression {
    self.variable_cx.get(variable_name).unwrap().dupe()
  }

  fn resolve_struct_mapping_of_id_type(&mut self, hir_id_type: &hir::IdType) -> Vec<hir::Type> {
    let type_def = self.type_definition_mapping.get(&hir_id_type.name).unwrap();
    let replacement_map: HashMap<_, _> = type_def
      .type_parameters
      .iter()
      .copied()
      .zip(hir_id_type.type_arguments.iter().cloned())
      .collect();
    type_def
      .mappings
      .as_struct()
      .unwrap()
      .iter()
      .map(|t| type_application(t, &replacement_map))
      .collect()
  }

  fn get_function_type_without_context(&mut self, t: &type_::Type) -> hir::FunctionType {
    let type_::FunctionType { argument_types, return_type, .. } =
      t.as_fn().expect("Expecting function type");
    let (_, t) = self.type_lowering_manager.lower_source_function_type_for_toplevel(
      self.heap,
      argument_types,
      return_type,
    );
    t
  }

  fn lower(&mut self, expression: &source::expr::E<Rc<type_::Type>>) -> LoweringResult {
    match expression {
      source::expr::E::Literal(_, source::Literal::Bool(b)) => {
        LoweringResult { statements: Vec::new(), expression: if *b { hir::ONE } else { hir::ZERO } }
      }
      source::expr::E::Literal(_, source::Literal::Int(i)) => {
        LoweringResult { statements: Vec::new(), expression: hir::Expression::int(*i) }
      }
      source::expr::E::Literal(_, source::Literal::String(s)) => LoweringResult {
        statements: Vec::new(),
        expression: hir::Expression::StringName(self.string_manager.allocate(*s).0),
      },
      source::expr::E::LocalId(_, id) => LoweringResult {
        statements: Vec::new(),
        expression: if id.name == PStr::THIS {
          self.resolve_variable(&PStr::UNDERSCORE_THIS)
        } else {
          self.resolve_variable(&id.name)
        },
      },
      source::expr::E::ClassId(_, _, _) => {
        LoweringResult { statements: Vec::new(), expression: hir::Expression::Int31Zero }
      }
      source::expr::E::Tuple(common, es) => self.lower_tuple(common, &es.expressions),
      source::expr::E::FieldAccess(e) => self.lower_field_access(e),
      source::expr::E::MethodAccess(e) => self.lower_method_access(e),
      source::expr::E::Unary(e) => self.lower_unary(e),
      source::expr::E::Call(e) => self.lower_fn_call(e),
      source::expr::E::Binary(_) => self.lower_binary(expression),
      source::expr::E::IfElse(e) => self.lower_if_else(e),
      source::expr::E::Match(e) => self.lower_match(e),
      source::expr::E::Lambda(e) => self.lower_lambda(e),
      source::expr::E::Block(e) => self.lower_block(e),
    }
  }

  fn create_hir_function_name(&self, receiver: &type_::Type, fn_name: PStr) -> hir::FunctionName {
    let type_name = if let Some(t) = receiver.as_nominal() {
      hir::TypeName { module_reference: Some(t.module_reference), type_name: t.id }
    } else {
      hir::TypeName { module_reference: None, type_name: *receiver.as_generic().unwrap().1 }
    };
    hir::FunctionName { type_name, fn_name }
  }

  fn lower_field_access(
    &mut self,
    expression: &source::expr::FieldAccess<Rc<type_::Type>>,
  ) -> LoweringResult {
    let LoweringResult { mut statements, expression: result_expr } = self.lower(&expression.object);
    let mappings_for_id_type =
      self.resolve_struct_mapping_of_id_type(result_expr.type_().as_id().unwrap());
    let index = usize::try_from(expression.field_order).unwrap();
    let extracted_field_type = &mappings_for_id_type[index];
    let value_name = self.allocate_temp_variable();
    statements.push(hir::Statement::IndexedAccess {
      name: value_name,
      type_: extracted_field_type.dupe(),
      pointer_expression: result_expr,
      index,
    });

    bind_value(
      &mut self.variable_cx,
      value_name,
      hir::Expression::var_name(value_name, extracted_field_type.dupe()),
    );
    LoweringResult {
      statements,
      expression: hir::Expression::var_name(value_name, extracted_field_type.dupe()),
    }
  }

  fn lower_method_access(
    &mut self,
    expression: &source::expr::MethodAccess<Rc<type_::Type>>,
  ) -> LoweringResult {
    let source_obj_type = expression.object.type_();
    let function_name = self.create_hir_function_name(source_obj_type, expression.method_name.name);
    let LoweringResult { mut statements, expression: result_expr } = self.lower(&expression.object);
    let original_function_type = self.get_function_type_without_context(&expression.common.type_);
    let method_type = hir::FunctionType {
      argument_types: vec![result_expr.type_().dupe()]
        .into_iter()
        .chain(original_function_type.argument_types.iter().cloned())
        .collect_vec(),
      return_type: original_function_type.return_type.clone(),
    };
    let closure_type = self.get_synthetic_identifier_type_from_closure(original_function_type);
    let closure_variable_name = self.allocate_temp_variable();
    bind_value(
      &mut self.variable_cx,
      closure_variable_name,
      hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type.dupe())),
    );
    statements.push(hir::Statement::ClosureInit {
      closure_variable_name,
      closure_type: closure_type.dupe(),
      function_name: hir::FunctionNameExpression {
        name: function_name,
        type_: method_type,
        type_arguments: self
          .type_lowering_manager
          .lower_source_types(self.heap, &expression.inferred_type_arguments),
      },
      context: result_expr,
    });
    LoweringResult {
      statements,
      expression: hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type)),
    }
  }

  fn lower_unary(&mut self, expression: &source::expr::Unary<Rc<type_::Type>>) -> LoweringResult {
    let LoweringResult { mut statements, expression: result_expr } =
      self.lower(&expression.argument);
    let value_name = self.allocate_temp_variable();
    statements.push(match expression.operator {
      source::expr::UnaryOperator::NOT => {
        hir::Statement::Not { name: value_name, operand: result_expr }
      }
      source::expr::UnaryOperator::NEG => hir::Statement::Binary {
        name: value_name,
        operator: hir::BinaryOperator::MINUS,
        e1: hir::ZERO,
        e2: result_expr,
      },
    });
    LoweringResult { statements, expression: hir::Expression::var_name(value_name, hir::INT_TYPE) }
  }

  fn lower_tuple(
    &mut self,
    common: &source::expr::ExpressionCommon<Rc<type_::Type>>,
    expressions: &[source::expr::E<Rc<type_::Type>>],
  ) -> LoweringResult {
    let mut lowered_stmts = Vec::new();
    let return_collector_name = self.allocate_temp_variable();
    let fn_name = self.create_hir_function_name(&common.type_, PStr::INIT);
    let return_type = self.type_lowering_manager.lower_source_type(self.heap, &common.type_);

    let mut lowered_arguments = Vec::with_capacity(1 + expressions.len());
    let mut parameter_types = Vec::with_capacity(1 + expressions.len());
    let mut type_arguments = Vec::with_capacity(expressions.len());
    lowered_arguments.push(hir::ZERO);
    parameter_types.push(hir::INT_TYPE);
    for e in expressions {
      let lowered = self.lowered_and_add_statements(e, &mut lowered_stmts);
      parameter_types.push(lowered.type_().dupe());
      type_arguments.push(lowered.type_().dupe());
      lowered_arguments.push(lowered);
    }
    lowered_stmts.push(hir::Statement::Call {
      callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
        name: fn_name,
        type_: hir::FunctionType {
          argument_types: parameter_types,
          return_type: Box::new(return_type.dupe()),
        },
        type_arguments,
      }),
      arguments: lowered_arguments,
      return_type: return_type.dupe(),
      return_collector: Some(return_collector_name),
    });
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(return_collector_name, return_type),
    }
  }

  fn lower_fn_call(&mut self, expression: &source::expr::Call<Rc<type_::Type>>) -> LoweringResult {
    let mut lowered_stmts = Vec::new();
    let is_void_return = if let Some((_, kind)) = expression.common.type_.as_primitive() {
      *kind == type_::PrimitiveTypeKind::Unit
    } else {
      false
    };
    let return_collector_name = self.allocate_temp_variable();
    let (function_return_collector_type, fn_call) = match expression.callee.as_ref() {
      source::expr::E::MethodAccess(source_callee) => {
        let source_target_type = source_callee.object.type_();
        let fn_name =
          self.create_hir_function_name(source_target_type, source_callee.method_name.name);
        let fn_type_without_cx =
          self.get_function_type_without_context(&source_callee.common.type_);
        let hir_target = self.lowered_and_add_statements(&source_callee.object, &mut lowered_stmts);
        let hir_target_type = hir_target.type_();
        let inferred_targs = self
          .type_lowering_manager
          .lower_source_types(self.heap, &source_callee.inferred_type_arguments);
        let type_arguments = if let Some(id_type) = hir_target_type.as_id() {
          id_type.type_arguments.iter().cloned().chain(inferred_targs).collect_vec()
        } else {
          inferred_targs
        };
        (
          fn_type_without_cx.return_type.as_ref().dupe(),
          hir::Statement::Call {
            callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
              name: fn_name,
              type_: hir::FunctionType {
                argument_types: vec![hir_target.type_().dupe()]
                  .into_iter()
                  .chain(fn_type_without_cx.argument_types.iter().cloned())
                  .collect_vec(),
                return_type: fn_type_without_cx.return_type.clone(),
              },
              type_arguments,
            }),
            arguments: vec![hir_target]
              .into_iter()
              .chain(
                expression
                  .arguments
                  .expressions
                  .iter()
                  .map(|a| self.lowered_and_add_statements(a, &mut lowered_stmts)),
              )
              .collect_vec(),
            return_type: fn_type_without_cx.return_type.as_ref().dupe(),
            return_collector: if is_void_return { None } else { Some(return_collector_name) },
          },
        )
      }
      source_callee => {
        let lowered_fn_expr = self
          .lowered_and_add_statements(source_callee, &mut lowered_stmts)
          .as_variable()
          .duped()
          .unwrap();
        let source_callee_type = source_callee.type_();
        let source_callee_fn_type = source_callee_type.as_fn().unwrap();
        let return_type = self
          .type_lowering_manager
          .lower_source_type(self.heap, &source_callee_fn_type.return_type);
        let lowered_args = expression
          .arguments
          .expressions
          .iter()
          .map(|a| self.lowered_and_add_statements(a, &mut lowered_stmts))
          .collect_vec();
        (
          return_type.dupe(),
          hir::Statement::Call {
            callee: hir::Callee::Variable(lowered_fn_expr),
            arguments: lowered_args,
            return_type,
            return_collector: if is_void_return { None } else { Some(return_collector_name) },
          },
        )
      }
    };

    lowered_stmts.push(fn_call);
    LoweringResult {
      statements: lowered_stmts,
      expression: if is_void_return {
        hir::ZERO
      } else {
        hir::Expression::var_name(return_collector_name, function_return_collector_type)
      },
    }
  }

  fn lower_binary(&mut self, expression: &source::expr::E<Rc<type_::Type>>) -> LoweringResult {
    let expression = match expression {
      source::expr::E::Binary(e) => e,
      _ => return self.lower(expression),
    };
    let operator = match expression.operator {
      source::expr::BinaryOperator::AND => {
        let temp = self.allocate_temp_variable();
        let LoweringResult { statements: s1, expression: e1 } = self.lower_binary(&expression.e1);
        let LoweringResult { statements: s2, expression: e2 } = self.lower_binary(&expression.e2);
        if let hir::Expression::IntLiteral(v) = &e1 {
          return if *v != 0 {
            LoweringResult { statements: s1.into_iter().chain(s2).collect_vec(), expression: e2 }
          } else {
            LoweringResult { statements: s1, expression: hir::ZERO }
          };
        }
        let mut statements = s1;
        statements.push(hir::Statement::IfElse {
          condition: e1,
          s1: s2,
          s2: Vec::new(),
          final_assignments: vec![(temp, hir::INT_TYPE, e2, hir::ZERO)],
        });
        return LoweringResult {
          statements,
          expression: hir::Expression::var_name(temp, hir::INT_TYPE),
        };
      }
      source::expr::BinaryOperator::OR => {
        let temp = self.allocate_temp_variable();
        let LoweringResult { statements: s1, expression: e1 } = self.lower_binary(&expression.e1);
        let LoweringResult { statements: s2, expression: e2 } = self.lower_binary(&expression.e2);
        if let hir::Expression::IntLiteral(v) = &e1 {
          return if *v != 0 {
            LoweringResult { statements: s1, expression: hir::ONE }
          } else {
            LoweringResult { statements: s1.into_iter().chain(s2).collect_vec(), expression: e2 }
          };
        }
        let mut statements = s1;
        statements.push(hir::Statement::IfElse {
          condition: e1,
          s1: Vec::new(),
          s2,
          final_assignments: vec![(temp, hir::INT_TYPE, hir::ONE, e2)],
        });
        return LoweringResult {
          statements,
          expression: hir::Expression::var_name(temp, hir::INT_TYPE),
        };
      }
      source::expr::BinaryOperator::CONCAT => {
        if let (
          source::expr::E::Literal(_, source::Literal::String(s1)),
          source::expr::E::Literal(_, source::Literal::String(s2)),
        ) = (expression.e1.as_ref(), expression.e2.as_ref())
        {
          let concat_string = format!("{}{}", s1.as_str(self.heap), s2.as_str(self.heap));
          let concat_pstr = self.heap.alloc_string(concat_string);
          return LoweringResult {
            statements: Vec::new(),
            expression: hir::Expression::StringName(self.string_manager.allocate(concat_pstr).0),
          };
        }
        let mut lowered_stmts = Vec::new();
        let e1 = self.lowered_and_add_statements(&expression.e1, &mut lowered_stmts);
        let e2 = self.lowered_and_add_statements(&expression.e2, &mut lowered_stmts);
        let return_collector_name = self.allocate_temp_variable();
        lowered_stmts.push(hir::Statement::Call {
          callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
            name: hir::FunctionName {
              type_name: hir::TypeName {
                module_reference: Some(ModuleReference::ROOT),
                type_name: PStr::STR_TYPE,
              },
              fn_name: PStr::CONCAT,
            },
            type_: hir::Type::new_fn_unwrapped(
              vec![hir::STRING_TYPE.dupe(), hir::STRING_TYPE.dupe()],
              hir::STRING_TYPE.dupe(),
            ),
            type_arguments: Vec::new(),
          }),
          arguments: vec![e1, e2],
          return_type: hir::STRING_TYPE.dupe(),
          return_collector: Some(return_collector_name),
        });
        return LoweringResult {
          statements: lowered_stmts,
          expression: hir::Expression::var_name(return_collector_name, hir::STRING_TYPE.dupe()),
        };
      }
      source::expr::BinaryOperator::MUL => hir::BinaryOperator::MUL,
      source::expr::BinaryOperator::DIV => hir::BinaryOperator::DIV,
      source::expr::BinaryOperator::MOD => hir::BinaryOperator::MOD,
      source::expr::BinaryOperator::PLUS => hir::BinaryOperator::PLUS,
      source::expr::BinaryOperator::MINUS => hir::BinaryOperator::MINUS,
      source::expr::BinaryOperator::LT => hir::BinaryOperator::LT,
      source::expr::BinaryOperator::LE => hir::BinaryOperator::LE,
      source::expr::BinaryOperator::GT => hir::BinaryOperator::GT,
      source::expr::BinaryOperator::GE => hir::BinaryOperator::GE,
      source::expr::BinaryOperator::EQ => hir::BinaryOperator::EQ,
      source::expr::BinaryOperator::NE => hir::BinaryOperator::NE,
    };
    let mut lowered_stmts = Vec::new();
    let e1 = self.lowered_and_add_statements(&expression.e1, &mut lowered_stmts);
    let e2 = self.lowered_and_add_statements(&expression.e2, &mut lowered_stmts);
    let value_temp = self.allocate_temp_variable();
    lowered_stmts.push(hir::Statement::Binary { name: value_temp, operator, e1, e2 });
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(value_temp, hir::INT_TYPE),
    }
  }

  fn lower_if_else(
    &mut self,
    expression: &source::expr::IfElse<Rc<type_::Type>>,
  ) -> LoweringResult {
    let mut lowered_stmts = Vec::new();
    self.variable_cx.push_scope();
    let condition = match expression.condition.as_ref() {
      source::expr::IfElseCondition::Expression(e) => {
        self.lowered_and_add_statements(e, &mut lowered_stmts)
      }
      source::expr::IfElseCondition::Guard(p, e) => {
        let e = self.lowered_and_add_statements(e, &mut lowered_stmts);
        let mut binding_names = HashMap::new();
        for (n, t) in p.bindings() {
          let name = self.allocate_temp_variable();
          binding_names.insert(n, name);
          let type_ = self.type_lowering_manager.lower_source_type(self.heap, t);
          bind_value(&mut self.variable_cx, n, hir::Expression::var_name(name, type_.dupe()));
          lowered_stmts.push(hir::Statement::LateInitDeclaration { name, type_ });
        }
        let LoweringResult { statements: mut stmts, expression: condition } =
          self.lower_matching_pattern(p, &binding_names, e);
        lowered_stmts.append(&mut stmts);
        condition
      }
    };
    if condition == hir::ONE {
      let LoweringResult { statements: mut to_append, expression } =
        self.lower_block(&expression.e1);
      lowered_stmts.append(&mut to_append);
      return LoweringResult { statements: lowered_stmts, expression };
    } else if condition == hir::ZERO {
      let LoweringResult { statements: mut to_append, expression } =
        self.lower_if_else_or_block(&expression.e2);
      lowered_stmts.append(&mut to_append);
      return LoweringResult { statements: lowered_stmts, expression };
    }
    let final_var_name = self.allocate_temp_variable();
    let LoweringResult { statements: s1, expression: e1 } = self.lower_block(&expression.e1);
    let LoweringResult { statements: s2, expression: e2 } =
      self.lower_if_else_or_block(&expression.e2);
    let lowered_return_type = e1.type_().dupe();
    lowered_stmts.push(hir::Statement::IfElse {
      condition,
      s1,
      s2,
      final_assignments: vec![(final_var_name, lowered_return_type.dupe(), e1, e2)],
    });
    self.variable_cx.pop_scope();
    bind_value(
      &mut self.variable_cx,
      final_var_name,
      hir::Expression::var_name(final_var_name, lowered_return_type.dupe()),
    );
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(final_var_name, lowered_return_type),
    }
  }

  fn lower_if_else_or_block(
    &mut self,
    if_else_or_block: &source::expr::IfElseOrBlock<Rc<type_::Type>>,
  ) -> LoweringResult {
    match if_else_or_block {
      source::expr::IfElseOrBlock::IfElse(e) => self.lower_if_else(e),
      source::expr::IfElseOrBlock::Block(e) => self.lower_block(e),
    }
  }

  fn lower_matching_pattern(
    &mut self,
    pattern: &source::pattern::MatchingPattern<Rc<type_::Type>>,
    binding_names: &HashMap<PStr, PStr>,
    lowered_expression: hir::Expression,
  ) -> LoweringResult {
    match pattern {
      source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
        elements, ..
      }) => {
        let id_type = lowered_expression.type_().as_id().unwrap();
        let resolved_struct_mappings = self.resolve_struct_mapping_of_id_type(id_type);
        let mut acc = LoweringResult { statements: Vec::new(), expression: hir::ONE };
        for (index, nested) in elements.iter().enumerate().rev() {
          let field_type = &resolved_struct_mappings[index];
          let name = self.allocate_temp_variable();
          let LoweringResult {
            statements: mut nested_pattern_lowering_stmts,
            expression: nested_pattern_condition,
          } = self.lower_matching_pattern(
            &nested.pattern,
            binding_names,
            hir::Expression::var_name(name, field_type.dupe()),
          );
          nested_pattern_lowering_stmts.insert(
            0,
            hir::Statement::IndexedAccess {
              name,
              type_: field_type.dupe(),
              pointer_expression: lowered_expression.dupe(),
              index,
            },
          );
          if nested_pattern_condition == hir::ONE {
            nested_pattern_lowering_stmts.append(&mut acc.statements);
            acc = LoweringResult {
              statements: nested_pattern_lowering_stmts,
              expression: acc.expression,
            };
          } else {
            let final_condition = self.allocate_temp_variable();
            nested_pattern_lowering_stmts.push(hir::Statement::IfElse {
              condition: nested_pattern_condition,
              s1: acc.statements,
              s2: Vec::new(),
              final_assignments: vec![(final_condition, hir::INT_TYPE, acc.expression, hir::ZERO)],
            });
            acc = LoweringResult {
              statements: nested_pattern_lowering_stmts,
              expression: hir::Expression::var_name(final_condition, hir::INT_TYPE),
            };
          }
        }
        acc
      }
      source::pattern::MatchingPattern::Object { elements, .. } => {
        let id_type = lowered_expression.type_().as_id().unwrap();
        let resolved_struct_mappings = self.resolve_struct_mapping_of_id_type(id_type);
        let mut acc = LoweringResult { statements: Vec::new(), expression: hir::ONE };
        for (index, nested) in elements.iter().enumerate().rev() {
          let field_type = &resolved_struct_mappings[index];
          let name = self.allocate_temp_variable();
          let LoweringResult {
            statements: mut nested_pattern_lowering_stmts,
            expression: nested_pattern_condition,
          } = self.lower_matching_pattern(
            &nested.pattern,
            binding_names,
            hir::Expression::var_name(name, field_type.dupe()),
          );
          nested_pattern_lowering_stmts.insert(
            0,
            hir::Statement::IndexedAccess {
              name,
              type_: field_type.dupe(),
              pointer_expression: lowered_expression.dupe(),
              index,
            },
          );
          if nested_pattern_condition == hir::ONE {
            nested_pattern_lowering_stmts.append(&mut acc.statements);
            acc = LoweringResult {
              statements: nested_pattern_lowering_stmts,
              expression: acc.expression,
            };
          } else {
            let final_condition = self.allocate_temp_variable();
            nested_pattern_lowering_stmts.push(hir::Statement::IfElse {
              condition: nested_pattern_condition,
              s1: acc.statements,
              s2: Vec::new(),
              final_assignments: vec![(final_condition, hir::INT_TYPE, acc.expression, hir::ZERO)],
            });
            acc = LoweringResult {
              statements: nested_pattern_lowering_stmts,
              expression: hir::Expression::var_name(final_condition, hir::INT_TYPE),
            };
          }
        }
        acc
      }
      source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
        loc: _,
        tag_order,
        tag: _,
        data_variables,
        type_: _,
      }) => {
        let mut non_optional_bindings = Vec::new();
        let mut optional_bindings = Vec::new();
        for source::pattern::TuplePatternElement { pattern: _, type_: nested_type } in
          data_variables.iter().flat_map(|it| &it.elements)
        {
          let data_var_type = self.type_lowering_manager.lower_source_type(self.heap, nested_type);
          let name = self.allocate_temp_variable();
          non_optional_bindings.push((name, data_var_type.dupe()));
          optional_bindings.push(Some((name, data_var_type)));
        }
        let mut acc = LoweringResult { statements: Vec::new(), expression: hir::ONE };
        if let Some(data_variables) = data_variables {
          for (
            source::pattern::TuplePatternElement { pattern: nested_pattern, type_: _ },
            (name, data_var_type),
          ) in data_variables.elements.iter().zip(non_optional_bindings).rev()
          {
            let LoweringResult {
              statements: mut nested_pattern_lowering_stmts,
              expression: nested_pattern_condition,
            } = self.lower_matching_pattern(
              nested_pattern,
              binding_names,
              hir::Expression::var_name(name, data_var_type.dupe()),
            );
            if nested_pattern_condition == hir::ONE {
              nested_pattern_lowering_stmts.append(&mut acc.statements);
              acc = LoweringResult {
                statements: nested_pattern_lowering_stmts,
                expression: acc.expression,
              };
            } else {
              let final_condition = self.allocate_temp_variable();
              nested_pattern_lowering_stmts.push(hir::Statement::IfElse {
                condition: nested_pattern_condition,
                s1: acc.statements,
                s2: Vec::new(),
                final_assignments: vec![(
                  final_condition,
                  hir::INT_TYPE,
                  acc.expression,
                  hir::ZERO,
                )],
              });
              acc = LoweringResult {
                statements: nested_pattern_lowering_stmts,
                expression: hir::Expression::var_name(final_condition, hir::INT_TYPE),
              };
            }
          }
        }
        let final_assignment_temp = self.allocate_temp_variable();
        LoweringResult {
          statements: vec![hir::Statement::ConditionalDestructure {
            test_expr: lowered_expression,
            tag: *tag_order,
            bindings: optional_bindings,
            s1: acc.statements,
            s2: Vec::new(),
            final_assignments: vec![(
              final_assignment_temp,
              hir::INT_TYPE,
              acc.expression,
              hir::ZERO,
            )],
          }],
          expression: hir::Expression::var_name(final_assignment_temp, hir::INT_TYPE),
        }
      }
      source::pattern::MatchingPattern::Id(id, _) => LoweringResult {
        statements: vec![hir::Statement::LateInitAssignment {
          name: *binding_names.get(&id.name).unwrap(),
          assigned_expression: lowered_expression,
        }],
        expression: hir::ONE,
      },
      source::pattern::MatchingPattern::Wildcard { .. } => {
        LoweringResult { statements: Vec::with_capacity(0), expression: hir::ONE }
      }
    }
  }

  fn lower_match(&mut self, expression: &source::expr::Match<Rc<type_::Type>>) -> LoweringResult {
    let mut lowered_stmts = Vec::new();
    let matched_expr = self.lowered_and_add_statements(&expression.matched, &mut lowered_stmts);

    let unreachable_branch_collector = self.allocate_temp_variable();
    let final_return_type =
      self.type_lowering_manager.lower_source_type(self.heap, &expression.common.type_);
    let mut acc = (
      vec![hir::Statement::Call {
        callee: hir::Callee::FunctionName(hir::FunctionNameExpression {
          name: hir::FunctionName {
            type_name: hir::TypeName {
              module_reference: Some(ModuleReference::ROOT),
              type_name: PStr::PROCESS_TYPE,
            },
            fn_name: PStr::PANIC,
          },
          type_: hir::FunctionType {
            argument_types: vec![hir::INT_TYPE, hir::STRING_TYPE.dupe()],
            return_type: Box::new(final_return_type.dupe()),
          },
          type_arguments: vec![final_return_type.dupe()],
        }),
        arguments: vec![
          hir::ZERO,
          hir::Expression::StringName(self.string_manager.allocate(PStr::EMPTY).0),
        ],
        return_type: final_return_type.dupe(),
        return_collector: Some(unreachable_branch_collector),
      }],
      hir::Expression::var_name(unreachable_branch_collector, final_return_type),
    );
    for source::expr::VariantPatternToExpression {
      loc: _,
      pattern,
      body,
      ending_associated_comments: _,
    } in expression.cases.iter().rev()
    {
      let final_assignment_temp = self.allocate_temp_variable();
      let lowered_return_type = acc.1.type_().dupe();
      let (acc_stmts, acc_e) = acc;
      let mut new_stmts = Vec::new();
      self.variable_cx.push_scope();
      let mut binding_names = HashMap::new();
      for (n, t) in pattern.bindings() {
        let name = self.allocate_temp_variable();
        binding_names.insert(n, name);
        let type_ = self.type_lowering_manager.lower_source_type(self.heap, t);
        bind_value(&mut self.variable_cx, n, hir::Expression::var_name(name, type_.dupe()));
        new_stmts.push(hir::Statement::LateInitDeclaration { name, type_ });
      }
      let LoweringResult { statements: mut binding_stmts, expression: match_success_condition } =
        self.lower_matching_pattern(pattern, &binding_names, matched_expr.dupe());
      new_stmts.append(&mut binding_stmts);
      let body_lowering_result = self.lower(body);
      self.variable_cx.pop_scope();
      new_stmts.push(hir::Statement::IfElse {
        condition: match_success_condition,
        s1: body_lowering_result.statements,
        s2: acc_stmts,
        final_assignments: vec![(
          final_assignment_temp,
          lowered_return_type.dupe(),
          body_lowering_result.expression,
          acc_e,
        )],
      });
      acc = (new_stmts, hir::Expression::var_name(final_assignment_temp, lowered_return_type))
    }

    lowered_stmts.append(&mut acc.0);
    LoweringResult { statements: lowered_stmts, expression: acc.1 }
  }

  fn create_synthetic_lambda_function(
    &mut self,
    expression: &source::expr::Lambda<Rc<type_::Type>>,
    captured: &[(PStr, hir::Expression)],
    context_type: &hir::Type,
  ) -> hir::Function {
    let mut lambda_stmts = Vec::new();
    for (index, (name, e)) in captured.iter().enumerate() {
      lambda_stmts.push(hir::Statement::IndexedAccess {
        name: *name,
        type_: e.type_().dupe(),
        pointer_expression: hir::Expression::var_name(PStr::UNDERSCORE_THIS, context_type.dupe()),
        index,
      });
    }

    let parameters = expression.parameters.parameters.iter().map(|it| it.name.name).collect_vec();
    let source_fn_type = expression.common.type_.as_fn().unwrap();
    let (
      type_parameters,
      hir::FunctionType {
        argument_types: fun_type_without_cx_argument_types,
        return_type: fun_type_without_cx_return_type,
      },
    ) = self.type_lowering_manager.lower_source_function_type_for_toplevel(
      self.heap,
      &source_fn_type.argument_types,
      &source_fn_type.return_type,
    );
    let fn_name = self.allocate_synthetic_fn_name();
    let LoweringResultWithSyntheticFunctions {
      statements: mut lowered_s,
      expression: lowered_e,
      mut synthetic_functions,
    } = lower_source_expression(
      ExpressionLoweringManager::new(
        self.module_reference,
        parameters
          .into_iter()
          .zip(fun_type_without_cx_argument_types.iter().cloned())
          .chain(self.defined_variables.iter().cloned())
          .chain(captured.iter().map(|(n, e)| (*n, e.type_().dupe())))
          .collect_vec(),
        self.type_definition_mapping,
        self.heap,
        self.type_lowering_manager,
        self.string_manager,
        self.next_synthetic_fn_id_manager,
      ),
      &expression.body,
    );
    lambda_stmts.append(&mut lowered_s);
    self.synthetic_functions.append(&mut synthetic_functions);

    hir::Function {
      name: fn_name,
      parameters: vec![PStr::UNDERSCORE_THIS]
        .into_iter()
        .chain(expression.parameters.parameters.iter().map(|it| it.name.name))
        .collect_vec(),
      type_parameters,
      type_: hir::FunctionType {
        argument_types: vec![context_type.dupe()]
          .into_iter()
          .chain(fun_type_without_cx_argument_types)
          .collect_vec(),
        return_type: fun_type_without_cx_return_type,
      },
      body: lambda_stmts,
      return_value: lowered_e,
    }
  }

  fn lower_lambda(&mut self, expression: &source::expr::Lambda<Rc<type_::Type>>) -> LoweringResult {
    let captured = expression.captured.keys().map(|k| (*k, self.resolve_variable(k))).collect_vec();

    let mut lowered_stmts = Vec::new();
    let closure_variable_name = self.allocate_temp_variable();
    let context = if captured.is_empty() {
      hir::Expression::Int31Zero
    } else {
      let context_name = self.allocate_temp_variable();
      let context_type = self.get_synthetic_identifier_type_from_tuple(
        captured.iter().map(|(_, v)| v.type_().dupe()).collect_vec(),
      );
      lowered_stmts.push(hir::Statement::StructInit {
        struct_variable_name: context_name,
        type_: context_type.dupe(),
        expression_list: captured.iter().map(|(_, v)| v.dupe()).collect_vec(),
      });
      bind_value(
        &mut self.variable_cx,
        context_name,
        hir::Expression::var_name(context_name, hir::Type::Id(context_type.dupe())),
      );
      hir::Expression::var_name(context_name, hir::Type::Id(context_type))
    };
    let synthetic_lambda =
      self.create_synthetic_lambda_function(expression, &captured, context.type_());
    let closure_type = self.get_synthetic_identifier_type_from_closure(hir::FunctionType {
      argument_types: synthetic_lambda.type_.argument_types.iter().skip(1).cloned().collect_vec(),
      return_type: synthetic_lambda.type_.return_type.clone(),
    });
    lowered_stmts.push(hir::Statement::ClosureInit {
      closure_variable_name,
      closure_type: closure_type.dupe(),
      function_name: hir::FunctionNameExpression {
        name: synthetic_lambda.name,
        type_: synthetic_lambda.type_.clone(),
        type_arguments: synthetic_lambda
          .type_parameters
          .iter()
          .copied()
          .map(hir::Type::new_generic_type)
          .collect_vec(),
      },
      context,
    });
    self.synthetic_functions.push(synthetic_lambda);
    bind_value(
      &mut self.variable_cx,
      closure_variable_name,
      hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type.dupe())),
    );
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type)),
    }
  }

  fn lower_block(&mut self, expression: &source::expr::Block<Rc<type_::Type>>) -> LoweringResult {
    let mut lowered_stmts = Vec::new();
    self.variable_cx.push_scope();
    for s in &expression.statements {
      let assigned_expr =
        self.lowered_and_add_statements(&s.assigned_expression, &mut lowered_stmts);
      let mut binding_names = HashMap::new();
      for (n, t) in s.pattern.bindings() {
        let name = self.allocate_temp_variable();
        binding_names.insert(n, name);
        let type_ = self.type_lowering_manager.lower_source_type(self.heap, t);
        bind_value(&mut self.variable_cx, n, hir::Expression::var_name(name, type_.dupe()));
        lowered_stmts.push(hir::Statement::LateInitDeclaration { name, type_ });
      }
      let LoweringResult { statements: mut stmts, expression: _ } =
        self.lower_matching_pattern(&s.pattern, &binding_names, assigned_expr);
      lowered_stmts.append(&mut stmts);
    }
    let final_expr = if let Some(e) = &expression.expression {
      self.lowered_and_add_statements(e, &mut lowered_stmts)
    } else {
      hir::ZERO
    };
    self.variable_cx.pop_scope();
    LoweringResult { statements: lowered_stmts, expression: final_expr }
  }
}

fn lower_source_expression(
  mut manager: ExpressionLoweringManager,
  expression: &source::expr::E<Rc<type_::Type>>,
) -> LoweringResultWithSyntheticFunctions {
  let LoweringResult { statements, expression } = manager.lower(expression);
  LoweringResultWithSyntheticFunctions {
    synthetic_functions: manager.synthetic_functions,
    statements,
    expression,
  }
}

fn lower_constructors(
  heap: &mut Heap,
  module_reference: &ModuleReference,
  class_name: PStr,
  type_definition_mapping: &HashMap<hir::TypeName, hir::TypeDefinition>,
) -> Vec<hir::Function> {
  let type_name =
    hir::TypeName { module_reference: Some(*module_reference), type_name: class_name };
  let type_def = type_definition_mapping.get(&type_name).unwrap();
  let struct_var_name = PStr::LOWER_O;
  let struct_type = hir::IdType {
    name: type_name,
    type_arguments: type_def
      .type_parameters
      .iter()
      .map(|n| hir::Type::new_generic_type(*n))
      .collect(),
  };
  let mut functions = Vec::new();
  match &type_def.mappings {
    hir::TypeDefinitionMappings::Struct(types) => {
      let f = hir::Function {
        name: hir::FunctionName { type_name, fn_name: PStr::INIT },
        parameters: vec![PStr::UNDERSCORE_THIS]
          .into_iter()
          .chain(types.iter().enumerate().map(|(i, _)| heap.alloc_string(format!("_f{i}"))))
          .collect_vec(),
        type_parameters: type_def.type_parameters.clone(),
        type_: hir::Type::new_fn_unwrapped(
          vec![hir::INT_TYPE].into_iter().chain(types.iter().cloned()).collect_vec(),
          hir::Type::Id(struct_type.dupe()),
        ),
        body: vec![hir::Statement::StructInit {
          struct_variable_name: struct_var_name,
          type_: struct_type.dupe(),
          expression_list: types
            .iter()
            .enumerate()
            .map(|(order, t)| {
              hir::Expression::var_name(heap.alloc_string(format!("_f{order}")), t.dupe())
            })
            .collect_vec(),
        }],
        return_value: hir::Expression::var_name(struct_var_name, hir::Type::Id(struct_type)),
      };
      functions.push(f);
    }
    hir::TypeDefinitionMappings::Enum(variants) => {
      for (tag_order, (tag_name, data_types)) in variants.iter().enumerate() {
        let f = hir::Function {
          name: hir::FunctionName {
            type_name: hir::TypeName {
              module_reference: Some(*module_reference),
              type_name: class_name,
            },
            fn_name: *tag_name,
          },
          parameters: vec![PStr::UNDERSCORE_THIS]
            .into_iter()
            .chain((0..(data_types.len())).map(|i| heap.alloc_string(format!("_data{i}"))))
            .collect(),
          type_parameters: type_def.type_parameters.clone(),
          type_: hir::Type::new_fn_unwrapped(
            vec![hir::INT_TYPE].into_iter().chain(data_types.iter().cloned()).collect(),
            hir::Type::Id(struct_type.dupe()),
          ),
          body: vec![hir::Statement::EnumInit {
            enum_variable_name: struct_var_name,
            enum_type: struct_type.dupe(),
            tag: tag_order,
            associated_data_list: data_types
              .iter()
              .enumerate()
              .map(|(i, data_type)| {
                hir::Expression::var_name(heap.alloc_string(format!("_data{i}")), data_type.dupe())
              })
              .collect(),
          }],
          return_value: hir::Expression::var_name(
            struct_var_name,
            hir::Type::Id(struct_type.dupe()),
          ),
        };
        functions.push(f);
      }
    }
  }
  functions
}

fn lower_tparams(type_parameters: Option<&source::annotation::TypeParameters>) -> Vec<PStr> {
  type_parameters.iter().flat_map(|it| &it.parameters).map(|it| it.name.name).collect_vec()
}

fn compile_sources_with_generics_preserved(
  heap: &mut Heap,
  sources: &HashMap<ModuleReference, source::Module<Rc<type_::Type>>>,
) -> hir::Sources {
  let mut type_lowering_manager = TypeLoweringManager {
    generic_types: OrderSet::new(),
    type_synthesizer: TypeSynthesizer::new(),
  };
  let mut compiled_type_defs = Vec::new();
  let mut main_function_names = Vec::new();
  for (mod_ref, source_module) in sources.iter() {
    for toplevel in &source_module.toplevels {
      if let source::Toplevel::Class(c) = &toplevel {
        type_lowering_manager.generic_types =
          c.type_parameters.iter().flat_map(|it| &it.parameters).map(|it| it.name.name).collect();
        compiled_type_defs.push(type_lowering_manager.lower_source_type_definition(
          heap,
          mod_ref,
          c.name.name,
          c.type_definition.as_ref(),
        ));
        if c.name.name == PStr::MAIN_TYPE
          && c.members.members.iter().any(|source::ClassMemberDefinition { decl, .. }| {
            decl.name.name == PStr::MAIN_FN
              && decl.parameters.parameters.is_empty()
              && decl.type_parameters.is_none()
          })
        {
          main_function_names.push(hir::FunctionName {
            type_name: hir::TypeName {
              module_reference: Some(*mod_ref),
              type_name: PStr::MAIN_TYPE,
            },
            fn_name: PStr::MAIN_FN,
          });
        }
      }
    }
  }
  let type_def_mappings: HashMap<_, _> =
    compiled_type_defs.iter().map(|it| (it.name, it.clone())).collect();

  let mut string_manager = StringManager::new();
  let mut next_synthetic_fn_id_manager = NextSyntheticFnIdManager { id: 0 };
  let mut compiled_functions = Vec::new();
  for (module_reference, source_module) in sources.iter() {
    for toplevel in &source_module.toplevels {
      if let source::Toplevel::Class(c) = &toplevel {
        compiled_functions.append(&mut lower_constructors(
          heap,
          module_reference,
          c.name.name,
          &type_def_mappings,
        ));
        for member in &c.members.members {
          let function_name = hir::FunctionName {
            type_name: hir::TypeName {
              module_reference: Some(*module_reference),
              type_name: c.name.name,
            },
            fn_name: member.decl.name.name,
          };
          let class_tparams = lower_tparams(c.type_parameters.as_ref());
          if member.decl.is_method {
            let tparams: OrderSet<_> = class_tparams
              .iter()
              .copied()
              .chain(lower_tparams(member.decl.type_parameters.as_ref()))
              .collect();
            type_lowering_manager.generic_types = tparams.clone();
            let main_function_parameter_with_types = vec![(
              PStr::UNDERSCORE_THIS,
              hir::Type::Id(hir::IdType {
                name: hir::TypeName {
                  module_reference: Some(*module_reference),
                  type_name: c.name.name,
                },
                type_arguments: class_tparams
                  .into_iter()
                  .map(hir::Type::new_generic_type)
                  .collect::<Arc<[_]>>(),
              }),
            )]
            .into_iter()
            .chain(member.decl.parameters.parameters.iter().map(|id| {
              (
                id.name.name,
                type_lowering_manager
                  .lower_source_type(heap, &type_::Type::from_annotation(&id.annotation)),
              )
            }))
            .collect_vec();
            let manager = ExpressionLoweringManager::new(
              module_reference,
              main_function_parameter_with_types.clone(),
              &type_def_mappings,
              heap,
              &mut type_lowering_manager,
              &mut string_manager,
              &mut next_synthetic_fn_id_manager,
            );
            let LoweringResultWithSyntheticFunctions {
              statements,
              expression,
              synthetic_functions: mut compiled_functions_to_add,
            } = lower_source_expression(manager, &member.body);
            let main_fn_type = hir::Type::new_fn_unwrapped(
              main_function_parameter_with_types.iter().map(|(_, t)| t.dupe()).collect_vec(),
              type_lowering_manager
                .lower_source_type(heap, &type_::Type::from_annotation(&member.decl.return_type)),
            );
            compiled_functions_to_add.push(hir::Function {
              name: function_name,
              parameters: main_function_parameter_with_types
                .into_iter()
                .map(|(n, _)| n)
                .collect_vec(),
              type_parameters: tparams.into_iter().collect(),
              type_: main_fn_type,
              body: statements,
              return_value: expression,
            });
            compiled_functions.append(&mut compiled_functions_to_add);
          } else {
            let tparams: OrderSet<_> =
              lower_tparams(member.decl.type_parameters.as_ref()).into_iter().collect();
            type_lowering_manager.generic_types = tparams.clone();
            let main_function_parameter_with_types = vec![(PStr::UNDERSCORE_THIS, hir::INT_TYPE)]
              .into_iter()
              .chain(member.decl.parameters.parameters.iter().map(|id| {
                (
                  id.name.name,
                  type_lowering_manager
                    .lower_source_type(heap, &type_::Type::from_annotation(&id.annotation)),
                )
              }))
              .collect_vec();
            let manager = ExpressionLoweringManager::new(
              module_reference,
              main_function_parameter_with_types.clone(),
              &type_def_mappings,
              heap,
              &mut type_lowering_manager,
              &mut string_manager,
              &mut next_synthetic_fn_id_manager,
            );
            let LoweringResultWithSyntheticFunctions {
              statements,
              expression,
              synthetic_functions: mut compiled_functions_to_add,
            } = lower_source_expression(manager, &member.body);
            let main_fn_type = hir::Type::new_fn_unwrapped(
              main_function_parameter_with_types.iter().map(|(_, t)| t.dupe()).collect_vec(),
              type_lowering_manager
                .lower_source_type(heap, &type_::Type::from_annotation(&member.decl.return_type)),
            );
            let original_f = hir::Function {
              name: function_name,
              parameters: main_function_parameter_with_types
                .into_iter()
                .map(|(n, _)| n)
                .collect_vec(),
              type_parameters: tparams.into_iter().collect(),
              type_: main_fn_type,
              body: statements,
              return_value: expression,
            };
            compiled_functions.append(&mut compiled_functions_to_add);
            compiled_functions.push(original_f);
          }
        }
      }
    }
  }

  let SynthesizedTypes { closure_types, mut tuple_types } =
    type_lowering_manager.type_synthesizer.synthesized_types();
  compiled_type_defs.append(&mut tuple_types);
  compiled_type_defs.push(hir::TypeDefinition {
    name: hir::TypeName {
      module_reference: Some(ModuleReference::ROOT),
      type_name: PStr::STR_TYPE,
    },
    type_parameters: Vec::new(),
    mappings: hir::TypeDefinitionMappings::Enum(Vec::new()),
  });

  hir::Sources {
    global_variables: string_manager.all_global_variables(),
    closure_types,
    type_definitions: compiled_type_defs,
    main_function_names,
    functions: compiled_functions,
  }
}

fn optimize_by_tail_rec_rewrite(heap: &mut Heap, sources: mir::Sources) -> mir::Sources {
  let mir::Sources {
    symbol_table,
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions,
  } = sources;
  mir::Sources {
    symbol_table,
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions: functions
      .into_iter()
      .map(|f| mir_tail_recursion_rewrite::optimize_function_by_tailrec_rewrite(heap, f))
      .collect(),
  }
}

pub fn compile_sources_to_mir(
  heap: &mut Heap,
  sources: &HashMap<ModuleReference, source::Module<Rc<type_::Type>>>,
) -> mir::Sources {
  let sources = compile_sources_with_generics_preserved(heap, sources);
  let mut sources = mir_generics_specialization::perform_generics_specialization(heap, sources);
  sources = mir_type_deduplication::deduplicate(sources);
  sources = mir_constant_param_elimination::rewrite_sources(sources);
  sources = optimize_by_tail_rec_rewrite(heap, sources);
  sources
}

#[cfg(test)]
mod tests {
  use super::super::{
    hir_lowering::ExpressionLoweringManager,
    hir_string_manager::StringManager,
    hir_type_conversion::{SynthesizedTypes, TypeLoweringManager, TypeSynthesizer},
  };
  use itertools::Itertools;
  use ordermap::OrderSet;
  use pretty_assertions::assert_eq;
  use samlang_ast::{Location, Reason, hir, source};
  use samlang_checker::type_;
  use samlang_heap::{Heap, ModuleReference, PStr};
  use std::{collections::HashMap, rc::Rc, sync::Arc};

  fn assert_expr_correctly_lowered(
    source_expr: &source::expr::E<Rc<type_::Type>>,
    heap: &mut Heap,
    expected_str: &str,
  ) {
    let mut type_lowering_manager = TypeLoweringManager {
      generic_types: OrderSet::from([heap.alloc_str_for_test("GENERIC_TYPE")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let mut string_manager = StringManager::new();
    let mut next_synthetic_fn_id_manager = super::NextSyntheticFnIdManager { id: 0 };
    let mod_ref = ModuleReference::DUMMY;
    let type_def_mapping = HashMap::from([
      (
        hir::TypeName {
          module_reference: Some(ModuleReference::DUMMY),
          type_name: heap.alloc_str_for_test("Foo"),
        },
        hir::TypeDefinition {
          name: hir::TypeName {
            module_reference: Some(ModuleReference::DUMMY),
            type_name: heap.alloc_str_for_test("Foo"),
          },
          type_parameters: Vec::new(),
          mappings: hir::TypeDefinitionMappings::Struct(vec![hir::INT_TYPE, hir::INT_TYPE]),
        },
      ),
      (
        hir::TypeName {
          module_reference: Some(ModuleReference::DUMMY),
          type_name: heap.alloc_str_for_test("Dummy"),
        },
        hir::TypeDefinition {
          name: hir::TypeName {
            module_reference: Some(ModuleReference::DUMMY),
            type_name: heap.alloc_str_for_test("Dummy"),
          },
          type_parameters: Vec::new(),
          mappings: hir::TypeDefinitionMappings::Struct(vec![hir::INT_TYPE, hir::INT_TYPE]),
        },
      ),
    ]);
    let manager = ExpressionLoweringManager::new(
      &mod_ref,
      vec![
        (
          heap.alloc_str_for_test("_this"),
          hir::Type::Id(hir::IdType {
            name: hir::TypeName {
              module_reference: Some(ModuleReference::DUMMY),
              type_name: heap.alloc_str_for_test("Dummy"),
            },
            type_arguments: Arc::from([]),
          }),
        ),
        (heap.alloc_str_for_test("foo"), hir::INT_TYPE),
        (heap.alloc_str_for_test("bar"), hir::INT_TYPE),
        (
          heap.alloc_str_for_test("closure"),
          hir::Type::Id(hir::IdType {
            name: hir::TypeName {
              module_reference: Some(ModuleReference::DUMMY),
              type_name: heap.alloc_str_for_test("Closure"),
            },
            type_arguments: Arc::from([]),
          }),
        ),
        (
          heap.alloc_str_for_test("closure_unit_return"),
          hir::Type::Id(hir::IdType {
            name: hir::TypeName {
              module_reference: Some(ModuleReference::DUMMY),
              type_name: heap.alloc_str_for_test("Closure"),
            },
            type_arguments: Arc::from([]),
          }),
        ),
        (heap.alloc_str_for_test("captured_a"), hir::INT_TYPE),
      ],
      &type_def_mapping,
      heap,
      &mut type_lowering_manager,
      &mut string_manager,
      &mut next_synthetic_fn_id_manager,
    );
    let super::LoweringResultWithSyntheticFunctions { statements, expression, synthetic_functions } =
      super::lower_source_expression(manager, source_expr);
    let SynthesizedTypes { tuple_types, closure_types } =
      type_lowering_manager.type_synthesizer.synthesized_types();
    let global_variables = string_manager.all_global_variables();
    let synthetic_module = hir::Sources {
      global_variables,
      closure_types,
      type_definitions: tuple_types,
      main_function_names: Vec::new(),
      functions: synthetic_functions,
    };
    let actual_string = format!(
      "{}\n{}\nreturn {};",
      synthetic_module.debug_print(heap),
      statements.iter().map(|it| it.debug_print(heap)).join("\n"),
      expression.debug_print(heap)
    );
    assert_eq!(expected_str, actual_string.trim());
  }

  fn dummy_source_id_type_unwrapped(heap: &mut Heap) -> type_::NominalType {
    type_::test_type_builder::create()
      .simple_nominal_type_unwrapped(heap.alloc_str_for_test("Dummy"))
  }

  fn dummy_source_id_type(heap: &mut Heap) -> type_::Type {
    type_::Type::Nominal(dummy_source_id_type_unwrapped(heap))
  }

  fn dummy_source_id_annot(heap: &mut Heap) -> source::annotation::T {
    source::test_builder::create().simple_id_annot(heap.alloc_str_for_test("Dummy"))
  }

  fn dummy_source_this(heap: &mut Heap) -> source::expr::E<Rc<type_::Type>> {
    source::expr::E::LocalId(
      source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
      source::Id::from(heap.alloc_str_for_test("this")),
    )
  }

  fn id_expr(id: PStr, type_: Rc<type_::Type>) -> source::expr::E<Rc<type_::Type>> {
    source::expr::E::LocalId(source::expr::ExpressionCommon::dummy(type_), source::Id::from(id))
  }

  #[test]
  fn simple_expressions_lowering_tests() {
    let builder = type_::test_type_builder::create();

    // Literal lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Literal(
        source::expr::ExpressionCommon::dummy(builder.bool_type()),
        source::Literal::Bool(false),
      ),
      heap,
      "return 0;",
    );
    assert_expr_correctly_lowered(
      &source::expr::E::Literal(
        source::expr::ExpressionCommon::dummy(builder.bool_type()),
        source::Literal::Bool(true),
      ),
      heap,
      "return 1;",
    );
    assert_expr_correctly_lowered(
      &source::expr::E::Literal(
        source::expr::ExpressionCommon::dummy(builder.int_type()),
        source::Literal::Int(0),
      ),
      heap,
      "return 0;",
    );
    assert_expr_correctly_lowered(
      &source::expr::E::Literal(
        source::expr::ExpressionCommon::dummy(builder.string_type()),
        source::Literal::String(heap.alloc_str_for_test("foo")),
      ),
      heap,
      "const GLOBAL_STRING_0 = 'foo';\n\n\nreturn \"foo\";",
    );

    // This & variable lowering works.
    assert_expr_correctly_lowered(&dummy_source_this(heap), heap, "return (_this: DUMMY_Dummy);");
    assert_expr_correctly_lowered(
      &id_expr(heap.alloc_str_for_test("foo"), builder.unit_type()),
      heap,
      "return (foo: int);",
    );
  }

  #[test]
  fn tuple_expressions_lowering_tests() {
    let builder = type_::test_type_builder::create();

    // Literal lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Tuple(
        source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        source::expr::ParenthesizedExpressionList {
          loc: Location::dummy(),
          start_associated_comments: source::NO_COMMENT_REFERENCE,
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          expressions: vec![
            source::expr::E::Literal(
              source::expr::ExpressionCommon::dummy(builder.int_type()),
              source::Literal::Int(0),
            ),
            source::expr::E::Literal(
              source::expr::ExpressionCommon::dummy(builder.int_type()),
              source::Literal::Int(0),
            ),
          ],
        },
      ),
      heap,
      "let _t1: DUMMY_Dummy = DUMMY_Dummy$init<int, int>(0, 0, 0);\nreturn (_t1: DUMMY_Dummy);",
    );
  }

  #[test]
  fn access_expressions_lowering_tests() {
    let builder = type_::test_type_builder::create();

    // FieldAccess lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::FieldAccess(source::expr::FieldAccess {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        explicit_type_arguments: None,
        inferred_type_arguments: Vec::new(),
        object: Box::new(dummy_source_this(heap)),
        field_name: source::Id::from(heap.alloc_str_for_test("foo")),
        field_order: 0,
      }),
      heap,
      "let _t1: int = (_this: DUMMY_Dummy)[0];\nreturn (_t1: int);",
    );

    // MethodAccess lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::MethodAccess(source::expr::MethodAccess {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.int_type()], builder.int_type()),
        ),
        explicit_type_arguments: None,
        inferred_type_arguments: Vec::new(),
        object: Box::new(dummy_source_this(heap)),
        method_name: source::Id::from(heap.alloc_str_for_test("foo")),
      }),
      heap,
      r#"closure type _$SyntheticIDType0 = (int) -> int
let _t2: _$SyntheticIDType0 = Closure { fun: (DUMMY_Dummy$foo: (DUMMY_Dummy, int) -> int), context: (_this: DUMMY_Dummy) };
return (_t2: _$SyntheticIDType0);"#,
    );
  }

  #[test]
  fn call_lowering_tests() {
    let builder = type_::test_type_builder::create();

    // Function call 1/n: method call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
          common: source::expr::ExpressionCommon::dummy(builder.fun_type(
            vec![Rc::new(dummy_source_id_type(heap)), Rc::new(dummy_source_id_type(heap))],
            builder.int_type(),
          )),
          explicit_type_arguments: None,
          inferred_type_arguments: Vec::new(),
          object: Box::new(dummy_source_this(heap)),
          method_name: source::Id::from(heap.alloc_str_for_test("fooBar")),
        })),
        arguments: source::expr::ParenthesizedExpressionList {
          loc: Location::dummy(),
          start_associated_comments: source::NO_COMMENT_REFERENCE,
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          expressions: vec![dummy_source_this(heap), dummy_source_this(heap)],
        },
      }),
      heap,
      r#"let _t1: int = DUMMY_Dummy$fooBar((_this: DUMMY_Dummy), (_this: DUMMY_Dummy), (_this: DUMMY_Dummy));
return (_t1: int);"#,
    );
    // Function call 2/n: closure call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        callee: Box::new(id_expr(
          heap.alloc_str_for_test("closure"),
          builder.fun_type(vec![builder.bool_type()], builder.int_type()),
        )),
        arguments: source::expr::ParenthesizedExpressionList {
          loc: Location::dummy(),
          start_associated_comments: source::NO_COMMENT_REFERENCE,
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          expressions: vec![source::expr::E::Literal(
            source::expr::ExpressionCommon::dummy(builder.bool_type()),
            source::Literal::Bool(true),
          )],
        },
      }),
      heap,
      r#"let _t1: int = (closure: DUMMY_Closure)(1);
return (_t1: int);"#,
    );
    // Function call 3/n: closure call without return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        callee: Box::new(id_expr(
          heap.alloc_str_for_test("closure_unit_return"),
          builder.fun_type(vec![builder.bool_type()], builder.unit_type()),
        )),
        arguments: source::expr::ParenthesizedExpressionList {
          loc: Location::dummy(),
          start_associated_comments: source::NO_COMMENT_REFERENCE,
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          expressions: vec![source::expr::E::Literal(
            source::expr::ExpressionCommon::dummy(builder.bool_type()),
            source::Literal::Bool(true),
          )],
        },
      }),
      heap,
      r#"(closure_unit_return: DUMMY_Closure)(1);
return 0;"#,
    );
  }

  #[test]
  fn op_lowering_tests() {
    let builder = type_::test_type_builder::create();

    // Unary lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Unary(source::expr::Unary {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        operator: source::expr::UnaryOperator::NOT,
        argument: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = !(_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Unary(source::expr::Unary {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        operator: source::expr::UnaryOperator::NEG,
        argument: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = 0 - (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );

    // Binary Lowering: normal
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::PLUS,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) + (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MINUS,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) - (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MUL,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) * (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::DIV,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) / (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MOD,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) % (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::LT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) < (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::LE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) <= (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::GT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) > (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::GE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) >= (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::EQ,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) == (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::NE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t1 = (_this: DUMMY_Dummy) != (_this: DUMMY_Dummy);\nreturn (_t1: int);",
    );
    // Binary Lowering: Short circuiting &&
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::AND,
        e1: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.bool_type())),
        e2: Box::new(id_expr(heap.alloc_str_for_test("bar"), builder.bool_type())),
      }),
      heap,
      r#"let _t1: int;
if (foo: int) {
  _t1 = (bar: int);
} else {
  _t1 = 0;
}
return (_t1: int);"#,
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::AND,
        e1: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(true),
        )),
        e2: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.int_type())),
      }),
      heap,
      "return (foo: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::AND,
        e1: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(false),
        )),
        e2: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.int_type())),
      }),
      heap,
      "return 0;",
    );
    // Binary Lowering: Short circuiting ||
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::OR,
        e1: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(true),
        )),
        e2: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.int_type()),
          source::Literal::Int(65536),
        )),
      }),
      heap,
      "return 1;",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::OR,
        e1: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(false),
        )),
        e2: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.int_type()),
          source::Literal::Int(65536),
        )),
      }),
      heap,
      "return 65536;",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::OR,
        e1: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.bool_type())),
        e2: Box::new(id_expr(heap.alloc_str_for_test("bar"), builder.bool_type())),
      }),
      heap,
      r#"let _t1: int;
if (foo: int) {
  _t1 = 1;
} else {
  _t1 = (bar: int);
}
return (_t1: int);"#,
    );
    // Binary Lowering: string concat
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.string_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::CONCAT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"let _t1: _Str = _Str$concat((_this: DUMMY_Dummy), (_this: DUMMY_Dummy));
return (_t1: _Str);"#,
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.string_type()),
        operator_preceding_comments: source::NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::CONCAT,
        e1: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.string_type()),
          source::Literal::String(heap.alloc_str_for_test("hello ")),
        )),
        e2: Box::new(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.string_type()),
          source::Literal::String(heap.alloc_str_for_test("world")),
        )),
      }),
      heap,
      "const GLOBAL_STRING_0 = 'hello world';\n\n\nreturn \"hello world\";",
    );
  }

  #[test]
  fn lambda_lowering_tests() {
    let annot_builder = source::test_builder::create();
    let builder = type_::test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], builder.unit_type()),
        ),
        parameters: source::expr::LambdaParameters {
          loc: Location::dummy(),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          parameters: vec![source::OptionallyAnnotatedId {
            name: source::Id::from(PStr::LOWER_A),
            type_: builder.unit_type(),
            annotation: Some(annot_builder.unit_annot()),
          }],
        },
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type _$SyntheticIDType1 = (int) -> int
object type _$SyntheticIDType0 = [int]
function __GenFn$0(_this: _$SyntheticIDType0, a: int): int {
  let captured_a: int = (_this: _$SyntheticIDType0)[0];
  return (_this: DUMMY_Dummy);
}

let _t2: _$SyntheticIDType0 = [(captured_a: int)];
let _t1: _$SyntheticIDType1 = Closure { fun: (__GenFn$0: (_$SyntheticIDType0, int) -> int), context: (_t2: _$SyntheticIDType0) };
return (_t1: _$SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], builder.int_type()),
        ),
        parameters: source::expr::LambdaParameters {
          loc: Location::dummy(),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          parameters: vec![source::OptionallyAnnotatedId {
            name: source::Id::from(PStr::LOWER_A),
            type_: builder.unit_type(),
            annotation: Some(annot_builder.unit_annot()),
          }],
        },
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type _$SyntheticIDType1 = (int) -> int
object type _$SyntheticIDType0 = [int]
function __GenFn$0(_this: _$SyntheticIDType0, a: int): int {
  let captured_a: int = (_this: _$SyntheticIDType0)[0];
  return (_this: DUMMY_Dummy);
}

let _t2: _$SyntheticIDType0 = [(captured_a: int)];
let _t1: _$SyntheticIDType1 = Closure { fun: (__GenFn$0: (_$SyntheticIDType0, int) -> int), context: (_t2: _$SyntheticIDType0) };
return (_t1: _$SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], Rc::new(dummy_source_id_type(heap))),
        ),
        parameters: source::expr::LambdaParameters {
          loc: Location::dummy(),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          parameters: vec![source::OptionallyAnnotatedId {
            name: source::Id::from(PStr::LOWER_A),
            type_: builder.unit_type(),
            annotation: Some(annot_builder.unit_annot()),
          }],
        },
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type _$SyntheticIDType1 = (int) -> DUMMY_Dummy
object type _$SyntheticIDType0 = [int]
function __GenFn$0(_this: _$SyntheticIDType0, a: int): DUMMY_Dummy {
  let captured_a: int = (_this: _$SyntheticIDType0)[0];
  return (_this: DUMMY_Dummy);
}

let _t2: _$SyntheticIDType0 = [(captured_a: int)];
let _t1: _$SyntheticIDType1 = Closure { fun: (__GenFn$0: (_$SyntheticIDType0, int) -> DUMMY_Dummy), context: (_t2: _$SyntheticIDType0) };
return (_t1: _$SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], Rc::new(dummy_source_id_type(heap))),
        ),
        parameters: source::expr::LambdaParameters {
          loc: Location::dummy(),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
          parameters: vec![source::OptionallyAnnotatedId {
            name: source::Id::from(PStr::LOWER_A),
            type_: builder.unit_type(),
            annotation: Some(annot_builder.unit_annot()),
          }],
        },
        captured: HashMap::new(),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type _$SyntheticIDType0 = (int) -> DUMMY_Dummy
function __GenFn$0(_this: i31, a: int): DUMMY_Dummy {
  return (_this: DUMMY_Dummy);
}

let _t1: _$SyntheticIDType0 = Closure { fun: (__GenFn$0: (i31, int) -> DUMMY_Dummy), context: 0 as i31 };
return (_t1: _$SyntheticIDType0);"#,
    );
  }

  #[test]
  fn control_flow_lowering_tests() {
    let builder = type_::test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Expression(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          source::Literal::Bool(true),
        ))),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        })),
      }),
      heap,
      "return (_this: DUMMY_Dummy);",
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Expression(source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          source::Literal::Bool(false),
        ))),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        })),
      }),
      heap,
      "return (_this: DUMMY_Dummy);",
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Expression(dummy_source_this(heap))),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        })),
      }),
      heap,
      r#"let _t1: DUMMY_Dummy;
if (_this: DUMMY_Dummy) {
  _t1 = (_this: DUMMY_Dummy);
} else {
  _t1 = (_this: DUMMY_Dummy);
}
return (_t1: DUMMY_Dummy);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Match(source::expr::Match {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        matched: Box::new(dummy_source_this(heap)),
        cases: vec![
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            pattern: source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
              loc: Location::dummy(),
              tag_order: 0,
              tag: source::Id::from(heap.alloc_str_for_test("Foo")),
              data_variables: Some(source::pattern::TuplePattern {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                elements: vec![source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(heap.alloc_str_for_test("bar")),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                }],
              }),
              type_: Rc::new(dummy_source_id_type(heap)),
            }),
            body: Box::new(source::expr::E::LocalId(
              source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              source::Id::from(heap.alloc_str_for_test("bar")),
            )),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            pattern: source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
              loc: Location::dummy(),
              tag_order: 1,
              tag: source::Id::from(heap.alloc_str_for_test("Bar")),
              data_variables: Some(source::pattern::TuplePattern {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                elements: vec![source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Wildcard {
                    location: Location::dummy(),
                    associated_comments: source::NO_COMMENT_REFERENCE,
                  }),
                  type_: builder.int_type(),
                }],
              }),
              type_: Rc::new(dummy_source_id_type(heap)),
            }),
            body: Box::new(dummy_source_this(heap)),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        ],
      }),
      heap,
      r#"const GLOBAL_STRING_0 = '';

let _t6: int;
let [_t7: int] if tagof((_this: DUMMY_Dummy))==0 {
  _t6 = (_t7: int);
  _t8 = 1;
} else {
  _t8 = 0;
}
let _t5: DUMMY_Dummy;
if (_t8: int) {
  _t5 = (_t6: int);
} else {
  let [_t3: int] if tagof((_this: DUMMY_Dummy))==1 {
    _t4 = 1;
  } else {
    _t4 = 0;
  }
  let _t2: DUMMY_Dummy;
  if (_t4: int) {
    _t2 = (_this: DUMMY_Dummy);
  } else {
    let _t1: DUMMY_Dummy = _Process$panic<DUMMY_Dummy>(0, "");
    _t2 = (_t1: DUMMY_Dummy);
  }
  _t5 = (_t2: DUMMY_Dummy);
}
return (_t5: DUMMY_Dummy);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Match(source::expr::Match {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        matched: Box::new(dummy_source_this(heap)),
        cases: vec![
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            pattern: source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
              loc: Location::dummy(),
              tag_order: 0,
              tag: source::Id::from(heap.alloc_str_for_test("Foo")),
              data_variables: Some(source::pattern::TuplePattern {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                elements: vec![source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Wildcard {
                    location: Location::dummy(),
                    associated_comments: source::NO_COMMENT_REFERENCE,
                  }),
                  type_: builder.int_type(),
                }],
              }),
              type_: Rc::new(dummy_source_id_type(heap)),
            }),
            body: Box::new(dummy_source_this(heap)),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            pattern: source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
              loc: Location::dummy(),
              tag_order: 1,
              tag: source::Id::from(heap.alloc_str_for_test("Bar")),
              data_variables: Some(source::pattern::TuplePattern {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                elements: vec![source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(heap.alloc_str_for_test("bar")),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                }],
              }),
              type_: Rc::new(dummy_source_id_type(heap)),
            }),
            body: Box::new(id_expr(
              heap.alloc_str_for_test("bar"),
              Rc::new(dummy_source_id_type(heap)),
            )),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            pattern: source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
              loc: Location::dummy(),
              tag_order: 2,
              tag: source::Id::from(heap.alloc_str_for_test("Baz")),
              data_variables: Some(source::pattern::TuplePattern {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                elements: vec![source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Wildcard {
                    location: Location::dummy(),
                    associated_comments: source::NO_COMMENT_REFERENCE,
                  }),
                  type_: builder.int_type(),
                }],
              }),
              type_: Rc::new(dummy_source_id_type(heap)),
            }),
            body: Box::new(dummy_source_this(heap)),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        ],
      }),
      heap,
      r#"const GLOBAL_STRING_0 = '';

let [_t10: int] if tagof((_this: DUMMY_Dummy))==0 {
  _t11 = 1;
} else {
  _t11 = 0;
}
let _t9: DUMMY_Dummy;
if (_t11: int) {
  _t9 = (_this: DUMMY_Dummy);
} else {
  let _t6: int;
  let [_t7: int] if tagof((_this: DUMMY_Dummy))==1 {
    _t6 = (_t7: int);
    _t8 = 1;
  } else {
    _t8 = 0;
  }
  let _t5: DUMMY_Dummy;
  if (_t8: int) {
    _t5 = (_t6: int);
  } else {
    let [_t3: int] if tagof((_this: DUMMY_Dummy))==2 {
      _t4 = 1;
    } else {
      _t4 = 0;
    }
    let _t2: DUMMY_Dummy;
    if (_t4: int) {
      _t2 = (_this: DUMMY_Dummy);
    } else {
      let _t1: DUMMY_Dummy = _Process$panic<DUMMY_Dummy>(0, "");
      _t2 = (_t1: DUMMY_Dummy);
    }
    _t5 = (_t2: DUMMY_Dummy);
  }
  _t9 = (_t5: DUMMY_Dummy);
}
return (_t9: DUMMY_Dummy);"#,
    );
  }

  #[test]
  fn if_let_test() {
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Guard(
          source::pattern::MatchingPattern::Wildcard {
            location: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
          },
          dummy_source_this(heap),
        )),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(dummy_source_this(heap))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        })),
      }),
      heap,
      "return (_this: DUMMY_Dummy);",
    );

    let heap = &mut Heap::new();
    let builder = type_::test_type_builder::create();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Guard(
          source::pattern::MatchingPattern::Object {
            location: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            elements: vec![
              source::pattern::ObjectPatternElement {
                loc: Location::dummy(),
                field_order: 0,
                field_name: source::Id::from(PStr::LOWER_A),
                pattern: Box::new(source::pattern::MatchingPattern::Id(
                  source::Id::from(PStr::LOWER_A),
                  builder.int_type(),
                )),
                shorthand: true,
                type_: builder.int_type(),
              },
              source::pattern::ObjectPatternElement {
                loc: Location::dummy(),
                field_order: 1,
                field_name: source::Id::from(PStr::LOWER_B),
                pattern: Box::new(source::pattern::MatchingPattern::Id(
                  source::Id::from(PStr::LOWER_C),
                  builder.int_type(),
                )),
                shorthand: false,
                type_: builder.int_type(),
              },
            ],
          },
          dummy_source_this(heap),
        )),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(source::expr::E::IfElse(source::expr::IfElse {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            condition: Box::new(source::expr::IfElseCondition::Guard(
              source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
                loc: Location::dummy(),
                tag_order: 0,
                tag: source::Id::from(PStr::EMPTY),
                data_variables: Some(source::pattern::TuplePattern {
                  location: Location::dummy(),
                  start_associated_comments: source::NO_COMMENT_REFERENCE,
                  ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  elements: vec![
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Variant(
                        source::pattern::VariantPattern {
                          loc: Location::dummy(),
                          tag_order: 0,
                          tag: source::Id::from(PStr::EMPTY),
                          data_variables: Some(source::pattern::TuplePattern {
                            location: Location::dummy(),
                            start_associated_comments: source::NO_COMMENT_REFERENCE,
                            ending_associated_comments: source::NO_COMMENT_REFERENCE,
                            elements: vec![
                              source::pattern::TuplePatternElement {
                                pattern: Box::new(source::pattern::MatchingPattern::Id(
                                  source::Id::from(heap.alloc_str_for_test("bar")),
                                  builder.int_type(),
                                )),
                                type_: builder.int_type(),
                              },
                              source::pattern::TuplePatternElement {
                                pattern: Box::new(source::pattern::MatchingPattern::Id(
                                  source::Id::from(heap.alloc_str_for_test("baz")),
                                  builder.int_type(),
                                )),
                                type_: builder.int_type(),
                              },
                            ],
                          }),
                          type_: builder.int_type(),
                        },
                      )),
                      type_: builder.int_type(),
                    },
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(heap.alloc_str_for_test("baz")),
                        builder.int_type(),
                      )),
                      type_: builder.int_type(),
                    },
                  ],
                }),
                type_: builder.int_type(),
              }),
              dummy_source_this(heap),
            )),
            e1: Box::new(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(id_expr(
                heap.alloc_str_for_test("bar"),
                Rc::new(dummy_source_id_type(heap)),
              ))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            }),
            e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(dummy_source_this(heap))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            })),
          }))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::IfElse(source::expr::IfElse {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          condition: Box::new(source::expr::IfElseCondition::Guard(
            source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
              location: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              elements: vec![
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_A),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_C),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
              ],
            }),
            dummy_source_this(heap),
          )),
          e1: Box::new(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          }),
          e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          })),
        })),
      }),
      heap,
      r#"let _t1: int;
let _t2: int;
let _t4: int = (_this: DUMMY_Dummy)[0];
_t1 = (_t4: int);
let _t3: int = (_this: DUMMY_Dummy)[1];
_t2 = (_t3: int);
let _t5: int;
let _t6: int;
let [_t7: int, _t8: int] if tagof((_this: DUMMY_Dummy))==0 {
  let [_t9: int, _t10: int] if tagof((_t7: int))==0 {
    _t5 = (_t9: int);
    _t6 = (_t10: int);
    _t11 = 1;
  } else {
    _t11 = 0;
  }
  let _t12: int;
  if (_t11: int) {
    _t6 = (_t8: int);
    _t12 = 1;
  } else {
    _t12 = 0;
  }
  _t13 = (_t12: int);
} else {
  _t13 = 0;
}
let _t14: int;
if (_t13: int) {
  _t14 = (_t5: int);
} else {
  _t14 = (_this: DUMMY_Dummy);
}
return (_t14: int);"#,
    );

    let heap = &mut Heap::new();
    let builder = type_::test_type_builder::create();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Guard(
          source::pattern::MatchingPattern::Object {
            location: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            elements: vec![
              source::pattern::ObjectPatternElement {
                loc: Location::dummy(),
                field_order: 0,
                field_name: source::Id::from(PStr::LOWER_A),
                pattern: Box::new(source::pattern::MatchingPattern::Variant(
                  source::pattern::VariantPattern {
                    loc: Location::dummy(),
                    tag_order: 0,
                    tag: source::Id::from(PStr::UPPER_A),
                    data_variables: Some(source::pattern::TuplePattern {
                      location: Location::dummy(),
                      start_associated_comments: source::NO_COMMENT_REFERENCE,
                      ending_associated_comments: source::NO_COMMENT_REFERENCE,
                      elements: vec![source::pattern::TuplePatternElement {
                        pattern: Box::new(source::pattern::MatchingPattern::Id(
                          source::Id::from(PStr::LOWER_C),
                          builder.int_type(),
                        )),
                        type_: builder.int_type(),
                      }],
                    }),
                    type_: builder.int_type(),
                  },
                )),
                shorthand: true,
                type_: builder.int_type(),
              },
              source::pattern::ObjectPatternElement {
                loc: Location::dummy(),
                field_order: 1,
                field_name: source::Id::from(PStr::LOWER_B),
                pattern: Box::new(source::pattern::MatchingPattern::Variant(
                  source::pattern::VariantPattern {
                    loc: Location::dummy(),
                    tag_order: 1,
                    tag: source::Id::from(PStr::UPPER_A),
                    data_variables: Some(source::pattern::TuplePattern {
                      location: Location::dummy(),
                      start_associated_comments: source::NO_COMMENT_REFERENCE,
                      ending_associated_comments: source::NO_COMMENT_REFERENCE,
                      elements: vec![source::pattern::TuplePatternElement {
                        pattern: Box::new(source::pattern::MatchingPattern::Id(
                          source::Id::from(PStr::LOWER_C),
                          builder.int_type(),
                        )),
                        type_: builder.int_type(),
                      }],
                    }),
                    type_: builder.int_type(),
                  },
                )),
                shorthand: false,
                type_: builder.int_type(),
              },
            ],
          },
          dummy_source_this(heap),
        )),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(source::expr::E::IfElse(source::expr::IfElse {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            condition: Box::new(source::expr::IfElseCondition::Guard(
              source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
                loc: Location::dummy(),
                tag_order: 0,
                tag: source::Id::from(PStr::EMPTY),
                data_variables: Some(source::pattern::TuplePattern {
                  location: Location::dummy(),
                  start_associated_comments: source::NO_COMMENT_REFERENCE,
                  ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  elements: vec![
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(heap.alloc_str_for_test("bar")),
                        builder.int_type(),
                      )),
                      type_: builder.int_type(),
                    },
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(heap.alloc_str_for_test("baz")),
                        builder.int_type(),
                      )),
                      type_: builder.int_type(),
                    },
                  ],
                }),
                type_: builder.int_type(),
              }),
              dummy_source_this(heap),
            )),
            e1: Box::new(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(id_expr(
                heap.alloc_str_for_test("bar"),
                Rc::new(dummy_source_id_type(heap)),
              ))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            }),
            e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(dummy_source_this(heap))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            })),
          }))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::IfElse(source::expr::IfElse {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          condition: Box::new(source::expr::IfElseCondition::Guard(
            source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
              location: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              elements: vec![
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_A),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_C),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
              ],
            }),
            dummy_source_this(heap),
          )),
          e1: Box::new(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          }),
          e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          })),
        })),
      }),
      heap,
      r#"let _t1: int;
let _t6: int = (_this: DUMMY_Dummy)[0];
let [_t7: int] if tagof((_t6: int))==0 {
  _t1 = (_t7: int);
  _t8 = 1;
} else {
  _t8 = 0;
}
let _t9: int;
if (_t8: int) {
  let _t2: int = (_this: DUMMY_Dummy)[1];
  let [_t3: int] if tagof((_t2: int))==1 {
    _t1 = (_t3: int);
    _t4 = 1;
  } else {
    _t4 = 0;
  }
  let _t5: int;
  if (_t4: int) {
    _t5 = 1;
  } else {
    _t5 = 0;
  }
  _t9 = (_t5: int);
} else {
  _t9 = 0;
}
let _t10: int;
if (_t9: int) {
  let _t11: int;
  let _t12: int;
  let [_t13: int, _t14: int] if tagof((_this: DUMMY_Dummy))==0 {
    _t11 = (_t13: int);
    _t12 = (_t14: int);
    _t15 = 1;
  } else {
    _t15 = 0;
  }
  let _t16: int;
  if (_t15: int) {
    _t16 = (_t11: int);
  } else {
    _t16 = (_this: DUMMY_Dummy);
  }
  _t10 = (_t16: int);
} else {
  let _t17: int;
  let _t18: int;
  let _t20: int = (_this: DUMMY_Dummy)[0];
  _t17 = (_t20: int);
  let _t19: int = (_this: DUMMY_Dummy)[1];
  _t18 = (_t19: int);
  _t10 = (_this: DUMMY_Dummy);
}
return (_t10: int);"#,
    );

    let heap = &mut Heap::new();
    let builder = type_::test_type_builder::create();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(source::expr::IfElseCondition::Guard(
          source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
            location: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            elements: vec![
              source::pattern::TuplePatternElement {
                pattern: Box::new(source::pattern::MatchingPattern::Variant(
                  source::pattern::VariantPattern {
                    loc: Location::dummy(),
                    tag_order: 0,
                    tag: source::Id::from(PStr::UPPER_A),
                    data_variables: Some(source::pattern::TuplePattern {
                      location: Location::dummy(),
                      start_associated_comments: source::NO_COMMENT_REFERENCE,
                      ending_associated_comments: source::NO_COMMENT_REFERENCE,
                      elements: vec![source::pattern::TuplePatternElement {
                        pattern: Box::new(source::pattern::MatchingPattern::Id(
                          source::Id::from(PStr::LOWER_C),
                          builder.int_type(),
                        )),
                        type_: builder.int_type(),
                      }],
                    }),
                    type_: builder.int_type(),
                  },
                )),
                type_: builder.int_type(),
              },
              source::pattern::TuplePatternElement {
                pattern: Box::new(source::pattern::MatchingPattern::Variant(
                  source::pattern::VariantPattern {
                    loc: Location::dummy(),
                    tag_order: 1,
                    tag: source::Id::from(PStr::UPPER_A),
                    data_variables: Some(source::pattern::TuplePattern {
                      location: Location::dummy(),
                      start_associated_comments: source::NO_COMMENT_REFERENCE,
                      ending_associated_comments: source::NO_COMMENT_REFERENCE,
                      elements: vec![source::pattern::TuplePatternElement {
                        pattern: Box::new(source::pattern::MatchingPattern::Id(
                          source::Id::from(PStr::LOWER_C),
                          builder.int_type(),
                        )),
                        type_: builder.int_type(),
                      }],
                    }),
                    type_: builder.int_type(),
                  },
                )),
                type_: builder.int_type(),
              },
            ],
          }),
          dummy_source_this(heap),
        )),
        e1: Box::new(source::expr::Block {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          statements: Vec::new(),
          expression: Some(Box::new(source::expr::E::IfElse(source::expr::IfElse {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            condition: Box::new(source::expr::IfElseCondition::Guard(
              source::pattern::MatchingPattern::Variant(source::pattern::VariantPattern {
                loc: Location::dummy(),
                tag_order: 0,
                tag: source::Id::from(PStr::EMPTY),
                data_variables: Some(source::pattern::TuplePattern {
                  location: Location::dummy(),
                  start_associated_comments: source::NO_COMMENT_REFERENCE,
                  ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  elements: vec![
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(heap.alloc_str_for_test("bar")),
                        builder.int_type(),
                      )),
                      type_: builder.int_type(),
                    },
                    source::pattern::TuplePatternElement {
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(heap.alloc_str_for_test("baz")),
                        builder.int_type(),
                      )),
                      type_: builder.int_type(),
                    },
                  ],
                }),
                type_: builder.int_type(),
              }),
              dummy_source_this(heap),
            )),
            e1: Box::new(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(id_expr(
                heap.alloc_str_for_test("bar"),
                Rc::new(dummy_source_id_type(heap)),
              ))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            }),
            e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
              common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
              statements: Vec::new(),
              expression: Some(Box::new(dummy_source_this(heap))),
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
            })),
          }))),
          ending_associated_comments: source::NO_COMMENT_REFERENCE,
        }),
        e2: Box::new(source::expr::IfElseOrBlock::IfElse(source::expr::IfElse {
          common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
          condition: Box::new(source::expr::IfElseCondition::Guard(
            source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
              location: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              elements: vec![
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_A),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_C),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
              ],
            }),
            dummy_source_this(heap),
          )),
          e1: Box::new(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          }),
          e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
            statements: Vec::new(),
            expression: Some(Box::new(dummy_source_this(heap))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          })),
        })),
      }),
      heap,
      r#"let _t1: int;
let _t6: int = (_this: DUMMY_Dummy)[0];
let [_t7: int] if tagof((_t6: int))==0 {
  _t1 = (_t7: int);
  _t8 = 1;
} else {
  _t8 = 0;
}
let _t9: int;
if (_t8: int) {
  let _t2: int = (_this: DUMMY_Dummy)[1];
  let [_t3: int] if tagof((_t2: int))==1 {
    _t1 = (_t3: int);
    _t4 = 1;
  } else {
    _t4 = 0;
  }
  let _t5: int;
  if (_t4: int) {
    _t5 = 1;
  } else {
    _t5 = 0;
  }
  _t9 = (_t5: int);
} else {
  _t9 = 0;
}
let _t10: int;
if (_t9: int) {
  let _t11: int;
  let _t12: int;
  let [_t13: int, _t14: int] if tagof((_this: DUMMY_Dummy))==0 {
    _t11 = (_t13: int);
    _t12 = (_t14: int);
    _t15 = 1;
  } else {
    _t15 = 0;
  }
  let _t16: int;
  if (_t15: int) {
    _t16 = (_t11: int);
  } else {
    _t16 = (_this: DUMMY_Dummy);
  }
  _t10 = (_t16: int);
} else {
  let _t17: int;
  let _t18: int;
  let _t20: int = (_this: DUMMY_Dummy)[0];
  _t17 = (_t20: int);
  let _t19: int = (_this: DUMMY_Dummy)[1];
  _t18 = (_t19: int);
  _t10 = (_this: DUMMY_Dummy);
}
return (_t10: int);"#,
    );
  }

  #[test]
  fn block_lowering_tests() {
    let annot_builder = source::test_builder::create();
    let builder = type_::test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          pattern: source::pattern::MatchingPattern::Id(
            source::Id::from(PStr::LOWER_A),
            builder.unit_type(),
          ),
          annotation: Some(annot_builder.unit_annot()),
          assigned_expression: Box::new(source::expr::E::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
            statements: vec![
              source::expr::DeclarationStatement {
                loc: Location::dummy(),
                associated_comments: source::NO_COMMENT_REFERENCE,
                pattern: source::pattern::MatchingPattern::Object {
                  location: Location::dummy(),
                  start_associated_comments: source::NO_COMMENT_REFERENCE,
                  ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  elements: vec![
                    source::pattern::ObjectPatternElement {
                      loc: Location::dummy(),
                      field_order: 0,
                      field_name: source::Id::from(PStr::LOWER_A),
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(PStr::LOWER_A),
                        builder.int_type(),
                      )),
                      shorthand: true,
                      type_: builder.int_type(),
                    },
                    source::pattern::ObjectPatternElement {
                      loc: Location::dummy(),
                      field_order: 1,
                      field_name: source::Id::from(PStr::LOWER_B),
                      pattern: Box::new(source::pattern::MatchingPattern::Id(
                        source::Id::from(PStr::LOWER_C),
                        builder.int_type(),
                      )),
                      shorthand: false,
                      type_: builder.int_type(),
                    },
                  ],
                },
                annotation: Some(dummy_source_id_annot(heap)),
                assigned_expression: Box::new(dummy_source_this(heap)),
              },
              source::expr::DeclarationStatement {
                loc: Location::dummy(),
                associated_comments: source::NO_COMMENT_REFERENCE,
                pattern: source::pattern::MatchingPattern::Wildcard {
                  location: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                },
                annotation: Some(dummy_source_id_annot(heap)),
                assigned_expression: Box::new(dummy_source_this(heap)),
              },
            ],
            expression: None,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          })),
        }],
        expression: None,
        ending_associated_comments: source::NO_COMMENT_REFERENCE,
      }),
      heap,
      r#"let _t1: int;
let _t2: int;
let _t4: int = (_this: DUMMY_Dummy)[0];
_t1 = (_t4: int);
let _t3: int = (_this: DUMMY_Dummy)[1];
_t2 = (_t3: int);
let _t5: int;
_t5 = 0;
return 0;"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
            pattern: source::pattern::MatchingPattern::Object {
              location: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              elements: vec![
                source::pattern::ObjectPatternElement {
                  loc: Location::dummy(),
                  field_order: 0,
                  field_name: source::Id::from(PStr::LOWER_A),
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_A),
                    builder.int_type(),
                  )),
                  shorthand: true,
                  type_: builder.int_type(),
                },
                source::pattern::ObjectPatternElement {
                  loc: Location::dummy(),
                  field_order: 1,
                  field_name: source::Id::from(PStr::LOWER_B),
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_C),
                    builder.int_type(),
                  )),
                  shorthand: false,
                  type_: builder.int_type(),
                },
              ],
            },
            annotation: Some(dummy_source_id_annot(heap)),
            assigned_expression: Box::new(dummy_source_this(heap)),
          },
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
            pattern: source::pattern::MatchingPattern::Tuple(source::pattern::TuplePattern {
              location: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              elements: vec![
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Id(
                    source::Id::from(PStr::LOWER_D),
                    builder.int_type(),
                  )),
                  type_: builder.int_type(),
                },
                source::pattern::TuplePatternElement {
                  pattern: Box::new(source::pattern::MatchingPattern::Wildcard {
                    location: Location::dummy(),
                    associated_comments: source::NO_COMMENT_REFERENCE,
                  }),
                  type_: builder.int_type(),
                },
              ],
            }),
            annotation: Some(dummy_source_id_annot(heap)),
            assigned_expression: Box::new(dummy_source_this(heap)),
          },
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
            pattern: source::pattern::MatchingPattern::Wildcard {
              location: Location::dummy(),
              associated_comments: source::NO_COMMENT_REFERENCE,
            },
            annotation: Some(dummy_source_id_annot(heap)),
            assigned_expression: Box::new(dummy_source_this(heap)),
          },
        ],
        expression: None,
        ending_associated_comments: source::NO_COMMENT_REFERENCE,
      }),
      heap,
      r#"let _t1: int;
let _t2: int;
let _t4: int = (_this: DUMMY_Dummy)[0];
_t1 = (_t4: int);
let _t3: int = (_this: DUMMY_Dummy)[1];
_t2 = (_t3: int);
let _t5: int;
let _t7: int = (_this: DUMMY_Dummy)[0];
_t5 = (_t7: int);
let _t6: int = (_this: DUMMY_Dummy)[1];
return 0;"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          pattern: source::pattern::MatchingPattern::Id(
            source::Id::from(PStr::LOWER_A),
            builder.int_type(),
          ),
          annotation: Some(annot_builder.int_annot()),
          assigned_expression: Box::new(source::expr::E::Call(source::expr::Call {
            common: source::expr::ExpressionCommon::dummy(builder.int_type()),
            callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
              common: source::expr::ExpressionCommon::dummy(
                builder.fun_type(vec![builder.int_type()], builder.int_type()),
              ),
              explicit_type_arguments: None,
              inferred_type_arguments: Vec::new(),
              object: Box::new(source::expr::E::ClassId(
                source::expr::ExpressionCommon::dummy(Rc::new(type_::Type::Nominal(
                  type_::NominalType {
                    reason: Reason::dummy(),
                    is_class_statics: true,
                    module_reference: heap
                      .alloc_module_reference_from_string_vec(vec!["ModuleModule".to_string()]),
                    id: heap.alloc_str_for_test("ImportedClass"),
                    type_arguments: Vec::new(),
                  },
                ))),
                heap.alloc_module_reference_from_string_vec(vec!["ModuleModule".to_string()]),
                source::Id::from(heap.alloc_str_for_test("ImportedClass")),
              )),
              method_name: source::Id::from(heap.alloc_str_for_test("bar")),
            })),
            arguments: source::expr::ParenthesizedExpressionList {
              loc: Location::dummy(),
              start_associated_comments: source::NO_COMMENT_REFERENCE,
              ending_associated_comments: source::NO_COMMENT_REFERENCE,
              expressions: vec![dummy_source_this(heap), dummy_source_this(heap)],
            },
          })),
        }],
        expression: Some(Box::new(id_expr(PStr::LOWER_A, builder.string_type()))),
        ending_associated_comments: source::NO_COMMENT_REFERENCE,
      }),
      heap,
      r#"let _t1: int = ModuleModule_ImportedClass$bar(0 as i31, (_this: DUMMY_Dummy), (_this: DUMMY_Dummy));
let _t2: int;
_t2 = (_t1: int);
return (_t2: int);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
            pattern: source::pattern::MatchingPattern::Id(
              source::Id::from(PStr::LOWER_A),
              builder.unit_type(),
            ),
            annotation: Some(annot_builder.unit_annot()),
            assigned_expression: Box::new(source::expr::E::Literal(
              source::expr::ExpressionCommon::dummy(builder.string_type()),
              source::Literal::String(heap.alloc_str_for_test("foo")),
            )),
          },
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: source::NO_COMMENT_REFERENCE,
            pattern: source::pattern::MatchingPattern::Id(
              source::Id::from(PStr::LOWER_B),
              builder.unit_type(),
            ),
            annotation: Some(annot_builder.unit_annot()),
            assigned_expression: Box::new(id_expr(PStr::LOWER_A, builder.string_type())),
          },
        ],
        expression: Some(Box::new(id_expr(PStr::LOWER_B, builder.string_type()))),
        ending_associated_comments: source::NO_COMMENT_REFERENCE,
      }),
      heap,
      r#"const GLOBAL_STRING_0 = 'foo';

let _t1: int;
_t1 = "foo";
let _t2: int;
_t2 = (_t1: int);
return (_t2: int);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          pattern: source::pattern::MatchingPattern::Id(
            source::Id::from(PStr::LOWER_A),
            builder.unit_type(),
          ),
          annotation: Some(annot_builder.unit_annot()),
          assigned_expression: Box::new(source::expr::E::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
            statements: vec![source::expr::DeclarationStatement {
              loc: Location::dummy(),
              associated_comments: source::NO_COMMENT_REFERENCE,
              pattern: source::pattern::MatchingPattern::Id(
                source::Id::from(PStr::LOWER_A),
                builder.unit_type(),
              ),
              annotation: Some(annot_builder.int_annot()),
              assigned_expression: Box::new(dummy_source_this(heap)),
            }],
            expression: Some(Box::new(id_expr(PStr::LOWER_A, builder.string_type()))),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          })),
        }],
        expression: Some(Box::new(id_expr(PStr::LOWER_A, builder.string_type()))),
        ending_associated_comments: source::NO_COMMENT_REFERENCE,
      }),
      heap,
      r#"let _t1: int;
_t1 = (_this: DUMMY_Dummy);
let _t2: int;
_t2 = (_t1: int);
return (_t2: int);"#,
    );
  }

  #[test]
  fn integration_tests() {
    let heap = &mut Heap::new();
    let annot_builder = source::test_builder::create();
    let builder = type_::test_type_builder::create();

    let this_expr = &source::expr::E::LocalId(
      source::expr::ExpressionCommon::dummy(
        builder.simple_nominal_type(heap.alloc_str_for_test("Dummy")),
      ),
      source::Id::from(heap.alloc_str_for_test("this")),
    );

    let source_module = source::Module {
      comment_store: source::CommentStore::new(),
      imports: Vec::new(),
      toplevels: vec![
        source::Toplevel::Interface(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          private: false,
          name: source::Id::from(heap.alloc_str_for_test("I")),
          type_parameters: None,
          extends_or_implements_nodes: None,
          type_definition: (),
          members: source::InterfaceMembersCommon {
            loc: Location::dummy(),
            members: Vec::new(),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          private: false,
          name: source::Id::from(PStr::MAIN_TYPE),
          type_parameters: None,
          extends_or_implements_nodes: None,
          type_definition: None,
          members: source::InterfaceMembersCommon {
            loc: Location::dummy(),
            members: vec![
              source::ClassMemberDefinition {
                decl: source::ClassMemberDeclaration {
                  loc: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                  is_public: true,
                  is_method: false,
                  name: source::Id::from(PStr::MAIN_FN),
                  type_parameters: None,
                  parameters: source::FunctionParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: Rc::new(Vec::new()),
                  },
                  return_type: annot_builder.unit_annot(),
                },
                body: source::expr::E::Call(source::expr::Call {
                  common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                  callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
                    common: source::expr::ExpressionCommon::dummy(
                      builder.fun_type(Vec::new(), builder.int_type()),
                    ),
                    explicit_type_arguments: None,
                    inferred_type_arguments: Vec::new(),
                    object: Box::new(source::expr::E::ClassId(
                      source::expr::ExpressionCommon::dummy(Rc::new(type_::Type::Nominal(
                        type_::NominalType {
                          reason: Reason::dummy(),
                          is_class_statics: true,
                          module_reference: ModuleReference::DUMMY,
                          id: heap.alloc_str_for_test("Class1"),
                          type_arguments: Vec::new(),
                        },
                      ))),
                      ModuleReference::DUMMY,
                      source::Id::from(heap.alloc_str_for_test("Class1")),
                    )),
                    method_name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                  })),
                  arguments: source::expr::ParenthesizedExpressionList {
                    loc: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    expressions: Vec::new(),
                  },
                }),
              },
              source::ClassMemberDefinition {
                decl: source::ClassMemberDeclaration {
                  loc: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                  is_public: true,
                  is_method: false,
                  name: source::Id::from(heap.alloc_str_for_test("loopy")),
                  type_parameters: Some(source::annotation::TypeParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: vec![source::annotation::TypeParameter {
                      loc: Location::dummy(),
                      name: source::Id::from(heap.alloc_str_for_test("T")),
                      bound: None,
                    }],
                  }),
                  parameters: source::FunctionParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: Rc::new(Vec::new()),
                  },
                  return_type: annot_builder.unit_annot(),
                },
                body: source::expr::E::Call(source::expr::Call {
                  common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                  callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
                    common: source::expr::ExpressionCommon::dummy(
                      builder.fun_type(Vec::new(), builder.int_type()),
                    ),
                    explicit_type_arguments: None,
                    inferred_type_arguments: Vec::new(),
                    object: Box::new(source::expr::E::ClassId(
                      source::expr::ExpressionCommon::dummy(Rc::new(type_::Type::Nominal(
                        type_::NominalType {
                          reason: Reason::dummy(),
                          is_class_statics: true,
                          module_reference: ModuleReference::DUMMY,
                          id: heap.alloc_str_for_test("T"),
                          type_arguments: Vec::new(),
                        },
                      ))),
                      ModuleReference::DUMMY,
                      source::Id::from(heap.alloc_str_for_test("T")),
                    )),
                    method_name: source::Id::from(heap.alloc_str_for_test("loopy")),
                  })),
                  arguments: source::expr::ParenthesizedExpressionList {
                    loc: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    expressions: Vec::new(),
                  },
                }),
              },
            ],
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          private: false,
          name: source::Id::from(heap.alloc_str_for_test("Class1")),
          type_parameters: None,
          extends_or_implements_nodes: None,
          type_definition: Some(source::TypeDefinition::Struct {
            loc: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            fields: vec![source::FieldDefinition {
              name: source::Id::from(PStr::LOWER_A),
              annotation: annot_builder.int_annot(),
              is_public: true,
            }],
          }),
          members: source::InterfaceMembersCommon {
            loc: Location::dummy(),
            members: vec![
              source::ClassMemberDefinition {
                decl: source::ClassMemberDeclaration {
                  loc: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                  is_public: true,
                  is_method: true,
                  name: source::Id::from(heap.alloc_str_for_test("foo")),
                  type_parameters: None,
                  parameters: source::FunctionParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: Rc::new(vec![source::AnnotatedId {
                      name: source::Id::from(PStr::LOWER_A),
                      type_: (), // builder.int_type(),
                      annotation: annot_builder.int_annot(),
                    }]),
                  },
                  return_type: annot_builder.int_annot(),
                },
                body: this_expr.clone(),
              },
              source::ClassMemberDefinition {
                decl: source::ClassMemberDeclaration {
                  loc: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                  is_public: true,
                  is_method: false,
                  name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                  type_parameters: None,
                  parameters: source::FunctionParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: Rc::new(Vec::new()),
                  },
                  return_type: annot_builder.unit_annot(),
                },
                body: source::expr::E::Call(source::expr::Call {
                  common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                  callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
                    common: source::expr::ExpressionCommon::dummy(
                      builder.fun_type(Vec::new(), builder.int_type()),
                    ),
                    explicit_type_arguments: None,
                    inferred_type_arguments: Vec::new(),
                    object: Box::new(source::expr::E::ClassId(
                      source::expr::ExpressionCommon::dummy(Rc::new(type_::Type::Nominal(
                        type_::NominalType {
                          reason: Reason::dummy(),
                          is_class_statics: true,
                          module_reference: ModuleReference::DUMMY,
                          id: heap.alloc_str_for_test("Class1"),
                          type_arguments: Vec::new(),
                        },
                      ))),
                      ModuleReference::DUMMY,
                      source::Id::from(heap.alloc_str_for_test("Class1")),
                    )),
                    method_name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                  })),
                  arguments: source::expr::ParenthesizedExpressionList {
                    loc: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    expressions: Vec::new(),
                  },
                }),
              },
              source::ClassMemberDefinition {
                decl: source::ClassMemberDeclaration {
                  loc: Location::dummy(),
                  associated_comments: source::NO_COMMENT_REFERENCE,
                  is_public: true,
                  is_method: false,
                  name: source::Id::from(heap.alloc_str_for_test("factorial")),
                  type_parameters: None,
                  parameters: source::FunctionParameters {
                    location: Location::dummy(),
                    start_associated_comments: source::NO_COMMENT_REFERENCE,
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                    parameters: Rc::new(vec![
                      source::AnnotatedId {
                        name: source::Id::from(heap.alloc_str_for_test("n")),
                        type_: (), // builder.int_type(),
                        annotation: annot_builder.int_annot(),
                      },
                      source::AnnotatedId {
                        name: source::Id::from(heap.alloc_str_for_test("acc")),
                        type_: (), // builder.int_type(),
                        annotation: annot_builder.int_annot(),
                      },
                    ]),
                  },
                  return_type: annot_builder.int_annot(),
                },
                body: source::expr::E::IfElse(source::expr::IfElse {
                  common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                  condition: Box::new(source::expr::IfElseCondition::Expression(
                    source::expr::E::Binary(source::expr::Binary {
                      common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                      operator_preceding_comments: source::NO_COMMENT_REFERENCE,
                      operator: source::expr::BinaryOperator::EQ,
                      e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                      e2: Box::new(source::expr::E::Literal(
                        source::expr::ExpressionCommon::dummy(builder.int_type()),
                        source::Literal::Int(0),
                      )),
                    }),
                  )),
                  e1: Box::new(source::expr::Block {
                    common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                    statements: Vec::new(),
                    expression: Some(Box::new(source::expr::E::Literal(
                      source::expr::ExpressionCommon::dummy(builder.int_type()),
                      source::Literal::Int(1),
                    ))),
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  }),
                  e2: Box::new(source::expr::IfElseOrBlock::Block(source::expr::Block {
                    common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                    statements: Vec::new(),
                    expression: Some(Box::new(source::expr::E::Call(source::expr::Call {
                      common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                      callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
                        common: source::expr::ExpressionCommon::dummy(builder.fun_type(
                          vec![builder.int_type(), builder.int_type()],
                          builder.int_type(),
                        )),
                        explicit_type_arguments: None,
                        inferred_type_arguments: Vec::new(),
                        object: Box::new(source::expr::E::ClassId(
                          source::expr::ExpressionCommon::dummy(Rc::new(type_::Type::Nominal(
                            type_::NominalType {
                              reason: Reason::dummy(),
                              is_class_statics: true,
                              module_reference: ModuleReference::DUMMY,
                              id: heap.alloc_str_for_test("Class1"),
                              type_arguments: Vec::new(),
                            },
                          ))),
                          ModuleReference::DUMMY,
                          source::Id::from(heap.alloc_str_for_test("Class1")),
                        )),
                        method_name: source::Id::from(heap.alloc_str_for_test("factorial")),
                      })),
                      arguments: source::expr::ParenthesizedExpressionList {
                        loc: Location::dummy(),
                        start_associated_comments: source::NO_COMMENT_REFERENCE,
                        ending_associated_comments: source::NO_COMMENT_REFERENCE,
                        expressions: vec![
                          source::expr::E::Binary(source::expr::Binary {
                            common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                            operator_preceding_comments: source::NO_COMMENT_REFERENCE,
                            operator: source::expr::BinaryOperator::MINUS,
                            e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                            e2: Box::new(source::expr::E::Literal(
                              source::expr::ExpressionCommon::dummy(builder.int_type()),
                              source::Literal::Int(1),
                            )),
                          }),
                          source::expr::E::Binary(source::expr::Binary {
                            common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                            operator_preceding_comments: source::NO_COMMENT_REFERENCE,
                            operator: source::expr::BinaryOperator::MUL,
                            e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                            e2: Box::new(id_expr(
                              heap.alloc_str_for_test("acc"),
                              builder.int_type(),
                            )),
                          }),
                        ],
                      },
                    }))),
                    ending_associated_comments: source::NO_COMMENT_REFERENCE,
                  })),
                }),
              },
            ],
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          private: false,
          name: source::Id::from(heap.alloc_str_for_test("Class2")),
          type_parameters: None,
          extends_or_implements_nodes: None,
          type_definition: Some(source::TypeDefinition::Enum {
            loc: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            variants: vec![source::VariantDefinition {
              name: source::Id::from(heap.alloc_str_for_test("Tag")),
              associated_data_types: Some(source::annotation::ParenthesizedAnnotationList {
                location: Location::dummy(),
                start_associated_comments: source::NO_COMMENT_REFERENCE,
                ending_associated_comments: source::NO_COMMENT_REFERENCE,
                annotations: vec![annot_builder.int_annot()],
              }),
            }],
          }),
          members: source::InterfaceMembersCommon {
            loc: Location::dummy(),
            members: Vec::new(),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: source::NO_COMMENT_REFERENCE,
          private: false,
          name: source::Id::from(heap.alloc_str_for_test("Class3")),
          type_parameters: Some(source::annotation::TypeParameters {
            location: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            parameters: vec![source::annotation::TypeParameter {
              loc: Location::dummy(),
              name: source::Id::from(heap.alloc_str_for_test("T")),
              bound: None,
            }],
          }),
          extends_or_implements_nodes: None,
          type_definition: Some(source::TypeDefinition::Struct {
            loc: Location::dummy(),
            start_associated_comments: source::NO_COMMENT_REFERENCE,
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
            fields: vec![source::FieldDefinition {
              name: source::Id::from(PStr::LOWER_A),
              annotation: annot_builder.fn_annot(
                vec![
                  annot_builder.general_id_annot(PStr::UPPER_A, vec![annot_builder.int_annot()]),
                  annot_builder.generic_annot(heap.alloc_str_for_test("T")),
                ],
                annot_builder.int_annot(),
              ),
              is_public: true,
            }],
          }),
          members: source::InterfaceMembersCommon {
            loc: Location::dummy(),
            members: Vec::new(),
            ending_associated_comments: source::NO_COMMENT_REFERENCE,
          },
        }),
      ],
      trailing_comments: source::NO_COMMENT_REFERENCE,
    };
    let sources = HashMap::from([
      (ModuleReference::DUMMY, source_module),
      (
        heap.alloc_module_reference_from_string_vec(vec!["Foo".to_string()]),
        source::Module {
          comment_store: source::CommentStore::new(),
          imports: Vec::new(),
          toplevels: Vec::new(),
          trailing_comments: source::NO_COMMENT_REFERENCE,
        },
      ),
    ]);

    let generics_preserved_expected = r#"closure type _$SyntheticIDType0<T> = (DUMMY_A<int>, T) -> int
variant type DUMMY_Main = []
object type DUMMY_Class1 = [int]
variant type DUMMY_Class2 = [(Tag: [int])]
object type DUMMY_Class3<T> = [_$SyntheticIDType0<T>]
variant type _Str = []
function DUMMY_Main$main(_this: int): int {
  DUMMY_Class1$infiniteLoop(0 as i31);
  return 0;
}

function DUMMY_Main$loopy<T>(_this: int): int {
  DUMMY_T$loopy(0 as i31);
  return 0;
}

function DUMMY_Class1$init(_this: int, _f0: int): DUMMY_Class1 {
  let o: DUMMY_Class1 = [(_f0: int)];
  return (o: DUMMY_Class1);
}

function DUMMY_Class1$foo(_this: DUMMY_Class1, a: int): int {
  return (_this: DUMMY_Class1);
}

function DUMMY_Class1$infiniteLoop(_this: int): int {
  DUMMY_Class1$infiniteLoop(0 as i31);
  return 0;
}

function DUMMY_Class1$factorial(_this: int, n: int, acc: int): int {
  let _t4 = (n: int) == 0;
  let _t5: int;
  if (_t4: int) {
    _t5 = 1;
  } else {
    let _t7 = (n: int) - 1;
    let _t8 = (n: int) * (acc: int);
    let _t6: int = DUMMY_Class1$factorial(0 as i31, (_t7: int), (_t8: int));
    _t5 = (_t6: int);
  }
  return (_t5: int);
}

function DUMMY_Class2$Tag(_this: int, _data0: int): DUMMY_Class2 {
  let o: DUMMY_Class2 = [0, (_data0: int)];
  return (o: DUMMY_Class2);
}

function DUMMY_Class3$init<T>(_this: int, _f0: _$SyntheticIDType0<T>): DUMMY_Class3<T> {
  let o: DUMMY_Class3<T> = [(_f0: _$SyntheticIDType0<T>)];
  return (o: DUMMY_Class3<T>);
}

sources.mains = [DUMMY_Main$main]"#;

    let optimized_expected = r#"function _DUMMY_Main$main(): int {
  _DUMMY_Class1$infiniteLoop();
  return 0;
}

function _DUMMY_Class1$infiniteLoop(): int {
  while (true) {
  }
  return 0;
}

sources.mains = [_DUMMY_Main$main]"#;

    assert_eq!(
      generics_preserved_expected,
      super::compile_sources_with_generics_preserved(heap, &sources).debug_print(heap)
    );
    assert_eq!(optimized_expected, super::compile_sources_to_mir(heap, &sources).debug_print(heap));
  }
}
