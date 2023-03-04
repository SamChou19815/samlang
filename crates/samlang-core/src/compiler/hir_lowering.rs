use super::{
  hir_generics_specialization,
  hir_string_manager::StringManager,
  hir_tail_recursion_rewrite,
  hir_type_conversion::{
    collect_used_generic_types, type_application, SynthesizedTypes, TypeLoweringManager,
    TypeSynthesizer,
  },
  hir_type_deduplication,
};
use crate::{
  ast::{
    common_names::{self, encode_samlang_type},
    hir, source,
  },
  checker::type_,
  common::{self, Heap, ModuleReference, PStr},
};
use itertools::Itertools;
use std::{
  collections::{HashMap, HashSet},
  rc::Rc,
};

struct LoweringResult {
  statements: Vec<hir::Statement>,
  expression: hir::Expression,
}

struct LoweringResultWithSyntheticFunctions {
  synthetic_functions: Vec<hir::Function>,
  statements: Vec<hir::Statement>,
  expression: hir::Expression,
}

type LoweringContext = common::LocalStackedContext<PStr, hir::Expression>;

impl LoweringContext {
  fn bind(&mut self, name: PStr, value: hir::Expression) {
    match &value {
      hir::Expression::IntLiteral(_, _) | hir::Expression::Variable(_) => {
        self.insert(name, value);
      }
      hir::Expression::StringName(n) => {
        let value_to_insert = self.get(n).cloned().unwrap_or(value);
        self.insert(name, value_to_insert);
      }
    }
  }
}

#[cfg(test)]
mod lowering_cx_boilterplate_tests {
  use super::*;

  #[test]
  fn tests() {
    let heap = &mut Heap::new();

    LoweringContext::new().bind(
      heap.alloc_str_for_test("a"),
      hir::Expression::var_name(heap.alloc_str_for_test("a"), hir::BOOL_TYPE),
    );
  }
}

struct ExpressionLoweringManager<'a> {
  // Immutable states
  heap: &'a mut Heap,
  module_reference: &'a ModuleReference,
  encoded_function_name: PStr,
  defined_variables: Vec<(PStr, hir::Type)>,
  type_definition_mapping: &'a HashMap<PStr, hir::TypeDefinition>,
  type_lowering_manager: &'a mut TypeLoweringManager,
  string_manager: &'a mut StringManager,
  // Mutable states
  next_temp_var_id: i32,
  next_synthetic_fn_id: i32,
  depth: i32,
  block_id: i32,
  variable_cx: LoweringContext,
  synthetic_functions: Vec<hir::Function>,
}

impl<'a> ExpressionLoweringManager<'a> {
  fn new(
    module_reference: &'a ModuleReference,
    encoded_function_name: PStr,
    defined_variables: Vec<(PStr, hir::Type)>,
    type_definition_mapping: &'a HashMap<PStr, hir::TypeDefinition>,
    heap: &'a mut Heap,
    type_lowering_manager: &'a mut TypeLoweringManager,
    string_manager: &'a mut StringManager,
  ) -> ExpressionLoweringManager<'a> {
    let mut variable_cx = LoweringContext::new();
    for (n, t) in &defined_variables {
      variable_cx.bind(*n, hir::Expression::var_name(*n, t.clone()));
    }
    ExpressionLoweringManager {
      heap,
      module_reference,
      encoded_function_name,
      defined_variables,
      type_definition_mapping,
      type_lowering_manager,
      string_manager,
      next_temp_var_id: 0,
      next_synthetic_fn_id: 0,
      depth: 0,
      block_id: 0,
      variable_cx,
      synthetic_functions: vec![],
    }
  }

  fn allocate_temp_variable(&mut self, favored_temp_variable: Option<PStr>) -> PStr {
    if let Some(v) = favored_temp_variable {
      v
    } else {
      self.heap.alloc_temp_str()
    }
  }

  fn allocate_synthetic_fn_name(&mut self) -> PStr {
    let fn_name = common_names::encode_function_name_globally(
      self.heap,
      self.module_reference,
      self.encoded_function_name.as_str(self.heap),
      &format!("_Synthetic_{}", self.next_synthetic_fn_id),
    );
    self.next_synthetic_fn_id += 1;
    self.heap.alloc_string(fn_name)
  }

  fn lowered_and_add_statements(
    &mut self,
    expression: &source::expr::E<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
    statements: &mut Vec<hir::Statement>,
  ) -> hir::Expression {
    let LoweringResult { statements: mut lowered_statements, expression: e } =
      self.lower(expression, favored_temp_variable);
    statements.append(&mut lowered_statements);
    e
  }

  fn get_synthetic_identifier_type_from_tuple(&mut self, mappings: Vec<hir::Type>) -> hir::IdType {
    let type_parameters = collect_used_generic_types(
      &hir::Type::new_fn_unwrapped(mappings.clone(), hir::BOOL_TYPE),
      &self.type_lowering_manager.generic_types,
    )
    .into_iter()
    .sorted()
    .collect_vec();
    let type_arguments =
      type_parameters.iter().cloned().map(hir::Type::new_id_no_targs).collect_vec();
    let name = self
      .type_lowering_manager
      .type_synthesizer
      .synthesize_tuple_type(self.heap, mappings, type_parameters)
      .identifier;
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
    let type_arguments =
      type_parameters.iter().cloned().map(hir::Type::new_id_no_targs).collect_vec();
    let name = self
      .type_lowering_manager
      .type_synthesizer
      .synthesize_closure_type(self.heap, fn_type, type_parameters)
      .identifier;
    hir::IdType { name, type_arguments }
  }

  fn resolve_variable(&mut self, variable_name: &PStr) -> hir::Expression {
    self
      .variable_cx
      .get(variable_name)
      .expect(&format!("Variable not resolved: {}", variable_name.as_str(self.heap)))
      .clone()
  }

  fn resolve_type_mapping_of_id_type(&mut self, hir_id_type: &hir::IdType) -> Vec<hir::Type> {
    let type_def = self.type_definition_mapping.get(&hir_id_type.name).unwrap().clone();
    let replacement_map: HashMap<_, _> =
      type_def.type_parameters.iter().cloned().zip(hir_id_type.type_arguments.clone()).collect();
    type_def.mappings.iter().map(|t| type_application(t, &replacement_map)).collect_vec()
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

  fn lower(
    &mut self,
    expression: &source::expr::E<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    match expression {
      source::expr::E::Literal(_, source::Literal::Bool(b)) => {
        LoweringResult { statements: vec![], expression: if *b { hir::TRUE } else { hir::FALSE } }
      }
      source::expr::E::Literal(_, source::Literal::Int(i)) => {
        LoweringResult { statements: vec![], expression: hir::Expression::int(*i) }
      }
      source::expr::E::Literal(_, source::Literal::String(s)) => LoweringResult {
        statements: vec![],
        expression: hir::Expression::StringName(self.string_manager.allocate(self.heap, *s).name),
      },
      source::expr::E::Id(_, id) => LoweringResult {
        statements: vec![],
        expression: if id.name.as_str(self.heap) == "this" {
          let this_str = self.heap.alloc_str_permanent("_this");
          self.resolve_variable(&this_str)
        } else {
          self.resolve_variable(&id.name)
        },
      },
      source::expr::E::ClassFn(e) => self.lower_class_fn(e, favored_temp_variable),
      source::expr::E::FieldAccess(e) => self.lower_field_access(e, favored_temp_variable),
      source::expr::E::MethodAccess(e) => self.lower_method_access(e, favored_temp_variable),
      source::expr::E::Unary(e) => self.lower_unary(e, favored_temp_variable),
      source::expr::E::Call(e) => self.lower_fn_call(e, favored_temp_variable),
      source::expr::E::Binary(_) => self.lower_binary(expression, favored_temp_variable),
      source::expr::E::IfElse(e) => self.lower_if_else(e, favored_temp_variable),
      source::expr::E::Match(e) => self.lower_match(e),
      source::expr::E::Lambda(e) => self.lower_lambda(e, favored_temp_variable),
      source::expr::E::Block(e) => self.lower_block(e, favored_temp_variable),
    }
  }

  fn encode_function_name_globally_considering_generics(
    &self,
    module_reference: &ModuleReference,
    class_name: &PStr,
    function_name: &str,
  ) -> String {
    if self.type_lowering_manager.generic_types.contains(class_name) {
      common_names::encode_generic_function_name_globally(
        class_name.as_str(self.heap),
        function_name,
      )
    } else {
      common_names::encode_function_name_globally(
        self.heap,
        module_reference,
        class_name.as_str(self.heap),
        function_name,
      )
    }
  }

  fn lower_class_fn(
    &mut self,
    expression: &source::expr::ClassFunction<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let encoded_original_fn_name = {
      let class_name = expression.class_name.name;
      let fn_name = expression.fn_name.name.as_str(self.heap);
      self.encode_function_name_globally_considering_generics(
        &expression.module_reference,
        &class_name,
        fn_name,
      )
    };
    let original_function_type = self.get_function_type_without_context(&expression.common.type_);
    let function_type = hir::FunctionType {
      argument_types: vec![hir::INT_TYPE]
        .into_iter()
        .chain(original_function_type.argument_types.iter().cloned())
        .collect_vec(),
      return_type: original_function_type.return_type.clone(),
    };
    let closure_type = self.get_synthetic_identifier_type_from_closure(original_function_type);
    let closure_variable_name = self.allocate_temp_variable(favored_temp_variable);
    let final_variable_expr =
      hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type.clone()));
    self.variable_cx.bind(closure_variable_name, final_variable_expr.clone());
    let statements = vec![hir::Statement::ClosureInit {
      closure_variable_name,
      closure_type,
      function_name: hir::FunctionName {
        name: self.heap.alloc_string(format!("{encoded_original_fn_name}_with_context")),
        type_: function_type,
        type_arguments: self
          .type_lowering_manager
          .lower_source_types(self.heap, &expression.inferred_type_arguments),
      },
      context: hir::ZERO,
    }];
    LoweringResult { statements, expression: final_variable_expr }
  }

  fn lower_field_access(
    &mut self,
    expression: &source::expr::FieldAccess<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let LoweringResult { mut statements, expression: result_expr } =
      self.lower(&expression.object, None);
    let mappings_for_id_type =
      self.resolve_type_mapping_of_id_type(result_expr.type_().as_id().unwrap());
    let index = usize::try_from(expression.field_order).unwrap();
    let extracted_field_type = &mappings_for_id_type[index];
    let value_name = self.allocate_temp_variable(favored_temp_variable);
    statements.push(hir::Statement::IndexedAccess {
      name: value_name,
      type_: extracted_field_type.clone(),
      pointer_expression: result_expr,
      index,
    });
    self
      .variable_cx
      .bind(value_name, hir::Expression::var_name(value_name, extracted_field_type.clone()));
    LoweringResult {
      statements,
      expression: hir::Expression::var_name(value_name, extracted_field_type.clone()),
    }
  }

  fn lower_method_access(
    &mut self,
    expression: &source::expr::MethodAccess<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let source_obj_type = expression.object.type_();
    let source_obj_id_type = source_obj_type.as_id().unwrap();
    let function_name = self.encode_function_name_globally_considering_generics(
      &source_obj_id_type.module_reference,
      &source_obj_id_type.id,
      expression.method_name.name.as_str(self.heap),
    );
    let LoweringResult { mut statements, expression: result_expr } =
      self.lower(&expression.object, None);
    let original_function_type = self.get_function_type_without_context(&expression.common.type_);
    let method_type = hir::FunctionType {
      argument_types: vec![result_expr.type_().clone()]
        .into_iter()
        .chain(original_function_type.argument_types.iter().cloned())
        .collect_vec(),
      return_type: original_function_type.return_type.clone(),
    };
    let closure_type = self.get_synthetic_identifier_type_from_closure(original_function_type);
    let closure_variable_name = self.allocate_temp_variable(favored_temp_variable);
    self.variable_cx.bind(
      closure_variable_name,
      hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type.clone())),
    );
    statements.push(hir::Statement::ClosureInit {
      closure_variable_name,
      closure_type: closure_type.clone(),
      function_name: hir::FunctionName {
        name: self.heap.alloc_string(function_name),
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

  fn lower_unary(
    &mut self,
    expression: &source::expr::Unary<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let LoweringResult { mut statements, expression: result_expr } =
      self.lower(&expression.argument, None);
    let value_name = self.allocate_temp_variable(favored_temp_variable);
    let new_binary = match expression.operator {
      source::expr::UnaryOperator::NOT => hir::Binary {
        name: value_name,
        type_: hir::BOOL_TYPE,
        operator: hir::Operator::XOR,
        e1: result_expr,
        e2: hir::TRUE,
      },
      source::expr::UnaryOperator::NEG => hir::Binary {
        name: value_name,
        type_: hir::INT_TYPE,
        operator: hir::Operator::MINUS,
        e1: hir::ZERO,
        e2: result_expr,
      },
    };
    let final_expr = hir::Expression::var_name(new_binary.name, new_binary.type_.clone());
    statements.push(hir::Statement::Binary(new_binary));
    LoweringResult { statements, expression: final_expr }
  }

  fn lower_fn_call(
    &mut self,
    expression: &source::expr::Call<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let mut lowered_stmts = vec![];
    let is_void_return = if let Some((_, kind)) = expression.common.type_.as_primitive() {
      *kind == type_::PrimitiveTypeKind::Unit
    } else {
      false
    };
    let return_collector_name = self.allocate_temp_variable(favored_temp_variable);
    let (function_return_collector_type, fn_call) = match expression.callee.as_ref() {
      source::expr::E::ClassFn(source_callee) => {
        let fn_name = self.encode_function_name_globally_considering_generics(
          &source_callee.module_reference,
          &source_callee.class_name.name,
          source_callee.fn_name.name.as_str(self.heap),
        );
        let fn_type_without_cx =
          self.get_function_type_without_context(&source_callee.common.type_);
        (
          fn_type_without_cx.return_type.as_ref().clone(),
          hir::Statement::Call {
            callee: hir::Callee::FunctionName(hir::FunctionName {
              name: self.heap.alloc_string(fn_name),
              type_: fn_type_without_cx.clone(),
              type_arguments: self
                .type_lowering_manager
                .lower_source_types(self.heap, &source_callee.inferred_type_arguments),
            }),
            arguments: expression
              .arguments
              .iter()
              .map(|a| self.lowered_and_add_statements(a, None, &mut lowered_stmts))
              .collect_vec(),
            return_type: fn_type_without_cx.return_type.as_ref().clone(),
            return_collector: if is_void_return { None } else { Some(return_collector_name) },
          },
        )
      }
      source::expr::E::MethodAccess(source_callee) => {
        let source_target_type = source_callee.object.type_();
        let source_target_id_type = source_target_type.as_id().unwrap();
        let fn_name = self.encode_function_name_globally_considering_generics(
          &source_target_id_type.module_reference,
          &source_target_id_type.id,
          source_callee.method_name.name.as_str(self.heap),
        );
        let fn_type_without_cx =
          self.get_function_type_without_context(&source_callee.common.type_);
        let hir_target =
          self.lowered_and_add_statements(&source_callee.object, None, &mut lowered_stmts);
        let hir_target_type = hir_target.type_();
        (
          fn_type_without_cx.return_type.as_ref().clone(),
          hir::Statement::Call {
            callee: hir::Callee::FunctionName(hir::FunctionName {
              name: self.heap.alloc_string(fn_name),
              type_: hir::FunctionType {
                argument_types: vec![hir_target.type_().clone()]
                  .into_iter()
                  .chain(fn_type_without_cx.argument_types.iter().cloned())
                  .collect_vec(),
                return_type: fn_type_without_cx.return_type.clone(),
              },
              type_arguments: hir_target_type
                .as_id()
                .unwrap()
                .type_arguments
                .iter()
                .cloned()
                .chain(
                  self
                    .type_lowering_manager
                    .lower_source_types(self.heap, &source_callee.inferred_type_arguments),
                )
                .collect_vec(),
            }),
            arguments: vec![hir_target]
              .into_iter()
              .chain(
                expression
                  .arguments
                  .iter()
                  .map(|a| self.lowered_and_add_statements(a, None, &mut lowered_stmts)),
              )
              .collect_vec(),
            return_type: fn_type_without_cx.return_type.as_ref().clone(),
            return_collector: Some(return_collector_name),
          },
        )
      }
      source_callee => {
        let lowered_fn_expr = self
          .lowered_and_add_statements(source_callee, None, &mut lowered_stmts)
          .as_variable()
          .cloned()
          .unwrap();
        let source_callee_type = source_callee.type_();
        let source_callee_fn_type = source_callee_type.as_fn().unwrap();
        let return_type = self
          .type_lowering_manager
          .lower_source_type(self.heap, &source_callee_fn_type.return_type);
        let lowered_args = expression
          .arguments
          .iter()
          .map(|a| self.lowered_and_add_statements(a, None, &mut lowered_stmts))
          .collect_vec();
        (
          return_type.clone(),
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

  fn lower_binary(
    &mut self,
    expression: &source::expr::E<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let expression = match expression {
      source::expr::E::Binary(e) => e,
      _ => return self.lower(expression, favored_temp_variable),
    };
    let operator = match expression.operator {
      source::expr::BinaryOperator::AND => {
        let temp = self.allocate_temp_variable(favored_temp_variable);
        let LoweringResult { statements: s1, expression: e1 } =
          self.lower_binary(&expression.e1, None);
        let LoweringResult { statements: s2, expression: e2 } =
          self.lower_binary(&expression.e2, None);
        if let hir::Expression::IntLiteral(v, _) = &e1 {
          return if *v != 0 {
            LoweringResult {
              statements: s1.into_iter().chain(s2.into_iter()).collect_vec(),
              expression: e2,
            }
          } else {
            LoweringResult { statements: s1, expression: hir::FALSE }
          };
        }
        let mut statements = s1;
        statements.push(hir::Statement::IfElse {
          condition: e1,
          s1: s2,
          s2: vec![],
          final_assignments: vec![(temp, hir::BOOL_TYPE, e2, hir::FALSE)],
        });
        return LoweringResult {
          statements,
          expression: hir::Expression::var_name(temp, hir::BOOL_TYPE),
        };
      }
      source::expr::BinaryOperator::OR => {
        let temp = self.allocate_temp_variable(favored_temp_variable);
        let LoweringResult { statements: s1, expression: e1 } =
          self.lower_binary(&expression.e1, None);
        let LoweringResult { statements: s2, expression: e2 } =
          self.lower_binary(&expression.e2, None);
        if let hir::Expression::IntLiteral(v, _) = &e1 {
          return if *v != 0 {
            LoweringResult { statements: s1, expression: hir::TRUE }
          } else {
            LoweringResult {
              statements: s1.into_iter().chain(s2.into_iter()).collect_vec(),
              expression: e2,
            }
          };
        }
        let mut statements = s1;
        statements.push(hir::Statement::IfElse {
          condition: e1,
          s1: vec![],
          s2,
          final_assignments: vec![(temp, hir::BOOL_TYPE, hir::TRUE, e2)],
        });
        return LoweringResult {
          statements,
          expression: hir::Expression::var_name(temp, hir::BOOL_TYPE),
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
            statements: vec![],
            expression: hir::Expression::StringName(
              self.string_manager.allocate(self.heap, concat_pstr).name,
            ),
          };
        }
        let mut lowered_stmts = vec![];
        let e1 = self.lowered_and_add_statements(&expression.e1, None, &mut lowered_stmts);
        let e2 = self.lowered_and_add_statements(&expression.e2, None, &mut lowered_stmts);
        let return_collector_name = self.allocate_temp_variable(favored_temp_variable);
        lowered_stmts.push(hir::Statement::Call {
          callee: hir::Callee::FunctionName(hir::FunctionName {
            name: self.heap.alloc_string(common_names::encoded_fn_name_string_concat()),
            type_: hir::Type::new_fn_unwrapped(
              vec![hir::STRING_TYPE, hir::STRING_TYPE],
              hir::STRING_TYPE,
            ),
            type_arguments: vec![],
          }),
          arguments: vec![e1, e2],
          return_type: hir::STRING_TYPE,
          return_collector: Some(return_collector_name),
        });
        return LoweringResult {
          statements: lowered_stmts,
          expression: hir::Expression::var_name(return_collector_name, hir::STRING_TYPE),
        };
      }
      source::expr::BinaryOperator::MUL => hir::Operator::MUL,
      source::expr::BinaryOperator::DIV => hir::Operator::DIV,
      source::expr::BinaryOperator::MOD => hir::Operator::MOD,
      source::expr::BinaryOperator::PLUS => hir::Operator::PLUS,
      source::expr::BinaryOperator::MINUS => hir::Operator::MINUS,
      source::expr::BinaryOperator::LT => hir::Operator::LT,
      source::expr::BinaryOperator::LE => hir::Operator::LE,
      source::expr::BinaryOperator::GT => hir::Operator::GT,
      source::expr::BinaryOperator::GE => hir::Operator::GE,
      source::expr::BinaryOperator::EQ => hir::Operator::EQ,
      source::expr::BinaryOperator::NE => hir::Operator::NE,
    };
    let mut lowered_stmts = vec![];
    let e1 = self.lowered_and_add_statements(&expression.e1, None, &mut lowered_stmts);
    let e2 = self.lowered_and_add_statements(&expression.e2, None, &mut lowered_stmts);
    let value_temp = self.allocate_temp_variable(favored_temp_variable);
    let binary = hir::Statement::binary_unwrapped(value_temp, operator, e1, e2);
    let final_type = binary.type_.clone();
    lowered_stmts.push(hir::Statement::Binary(binary));
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(value_temp, final_type),
    }
  }

  fn lower_if_else(
    &mut self,
    expression: &source::expr::IfElse<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let mut lowered_stmts = vec![];
    let condition =
      self.lowered_and_add_statements(&expression.condition, None, &mut lowered_stmts);
    let final_var_name = self.allocate_temp_variable(favored_temp_variable);
    let LoweringResult { statements: s1, expression: e1 } = self.lower(&expression.e1, None);
    let LoweringResult { statements: s2, expression: e2 } = self.lower(&expression.e2, None);
    let lowered_return_type = e1.type_().clone();
    lowered_stmts.push(hir::Statement::IfElse {
      condition,
      s1,
      s2,
      final_assignments: vec![(final_var_name, lowered_return_type.clone(), e1, e2)],
    });
    self
      .variable_cx
      .bind(final_var_name, hir::Expression::var_name(final_var_name, lowered_return_type.clone()));
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(final_var_name, lowered_return_type),
    }
  }

  fn lower_match(&mut self, expression: &source::expr::Match<Rc<type_::Type>>) -> LoweringResult {
    let mut lowered_stmts = vec![];
    let matched_expr =
      self.lowered_and_add_statements(&expression.matched, None, &mut lowered_stmts);
    let matched_expr_type_mapping =
      self.resolve_type_mapping_of_id_type(matched_expr.type_().as_id().unwrap());
    let variable_for_tag = self.allocate_temp_variable(None);
    lowered_stmts.push(hir::Statement::IndexedAccess {
      name: variable_for_tag,
      type_: hir::INT_TYPE,
      pointer_expression: matched_expr.clone(),
      index: 0,
    });
    self
      .variable_cx
      .bind(variable_for_tag, hir::Expression::var_name(variable_for_tag, hir::INT_TYPE));

    let mut lowered_matching_list = vec![];
    for source::expr::VariantPatternToExpression { tag_order, data_variable, body, .. } in
      &expression.cases
    {
      let mut local_stmts = vec![];
      self.variable_cx.push_scope();
      if let Some((data_var_name, _)) = data_variable {
        let data_var_type = &matched_expr_type_mapping[*tag_order];
        let name = data_var_name.name;
        local_stmts.push(hir::Statement::IndexedAccess {
          name,
          type_: data_var_type.clone(),
          pointer_expression: matched_expr.clone(),
          index: 1,
        });
        self.variable_cx.bind(name, hir::Expression::var_name(name, data_var_type.clone()));
      }
      let final_expr = self.lowered_and_add_statements(body, None, &mut local_stmts);
      self.variable_cx.pop_scope();
      lowered_matching_list.push((*tag_order, local_stmts, final_expr));
    }

    let mut cases_rev_iter = lowered_matching_list.into_iter().rev();
    let (_, last_case_stmts, last_case_e) = cases_rev_iter.next().unwrap();
    let mut acc = (last_case_stmts, last_case_e);
    for (tag_order, case_stmts, case_e) in cases_rev_iter {
      let comparison_temp = self.allocate_temp_variable(None);
      let final_assignment_temp = self.allocate_temp_variable(None);
      let lowered_return_type = acc.1.type_().clone();
      let (acc_stmts, acc_e) = acc;
      let new_stmts = vec![
        hir::Statement::Binary(hir::Statement::binary_unwrapped(
          comparison_temp,
          hir::Operator::EQ,
          hir::Expression::var_name(variable_for_tag, hir::INT_TYPE),
          hir::Expression::int(i32::try_from(tag_order).unwrap()),
        )),
        hir::Statement::IfElse {
          condition: hir::Expression::var_name(comparison_temp, hir::BOOL_TYPE),
          s1: case_stmts,
          s2: acc_stmts,
          final_assignments: vec![(
            final_assignment_temp,
            lowered_return_type.clone(),
            case_e,
            acc_e,
          )],
        },
      ];
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
    let mut lambda_stmts = vec![];
    let underscore_context_str = self.heap.alloc_str_permanent("_context");
    for (index, (name, e)) in captured.iter().enumerate() {
      lambda_stmts.push(hir::Statement::IndexedAccess {
        name: *name,
        type_: e.type_().clone(),
        pointer_expression: hir::Expression::var_name(underscore_context_str, context_type.clone()),
        index,
      });
    }

    let parameters = expression.parameters.iter().map(|it| it.name.name).collect_vec();
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
    let LoweringResult { statements: mut lowered_s, expression: lowered_e } =
      ExpressionLoweringManager::new(
        self.module_reference,
        fn_name,
        parameters
          .into_iter()
          .zip(fun_type_without_cx_argument_types.iter().cloned())
          .chain(self.defined_variables.iter().cloned())
          .chain(captured.iter().map(|(n, e)| (*n, e.type_().clone())))
          .collect_vec(),
        self.type_definition_mapping,
        self.heap,
        self.type_lowering_manager,
        self.string_manager,
      )
      .lower(&expression.body, None);
    lambda_stmts.append(&mut lowered_s);

    hir::Function {
      name: fn_name,
      parameters: vec![underscore_context_str]
        .into_iter()
        .chain(expression.parameters.iter().map(|it| it.name.name))
        .collect_vec(),
      type_parameters,
      type_: hir::FunctionType {
        argument_types: vec![context_type.clone()]
          .into_iter()
          .chain(fun_type_without_cx_argument_types.into_iter())
          .collect_vec(),
        return_type: fun_type_without_cx_return_type,
      },
      body: lambda_stmts,
      return_value: lowered_e,
    }
  }

  fn lower_lambda(
    &mut self,
    expression: &source::expr::Lambda<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let captured = expression.captured.keys().map(|k| (*k, self.resolve_variable(k))).collect_vec();

    let mut lowered_stmts = vec![];
    let closure_variable_name = self.allocate_temp_variable(favored_temp_variable);
    let context = if captured.is_empty() {
      hir::ZERO
    } else {
      let context_name = self.allocate_temp_variable(None);
      let context_type = self.get_synthetic_identifier_type_from_tuple(
        captured.iter().map(|(_, v)| v.type_().clone()).collect_vec(),
      );
      lowered_stmts.push(hir::Statement::StructInit {
        struct_variable_name: context_name,
        type_: context_type.clone(),
        expression_list: captured.iter().map(|(_, v)| v.clone()).collect_vec(),
      });
      self.variable_cx.bind(
        context_name,
        hir::Expression::var_name(context_name, hir::Type::Id(context_type.clone())),
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
      closure_type: closure_type.clone(),
      function_name: hir::FunctionName {
        name: synthetic_lambda.name,
        type_: synthetic_lambda.type_.clone(),
        type_arguments: synthetic_lambda
          .type_parameters
          .iter()
          .cloned()
          .map(hir::Type::new_id_no_targs)
          .collect_vec(),
      },
      context,
    });
    self.synthetic_functions.push(synthetic_lambda);
    self.variable_cx.bind(
      closure_variable_name,
      hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type.clone())),
    );
    LoweringResult {
      statements: lowered_stmts,
      expression: hir::Expression::var_name(closure_variable_name, hir::Type::Id(closure_type)),
    }
  }

  fn get_renamed_variable_for_nesting(&mut self, name: PStr, type_: &hir::Type) -> PStr {
    if self.depth == 0 {
      return name;
    }
    let renamed = self.heap.alloc_string(format!(
      "{}__depth_{}__block_{}",
      name.as_str(self.heap),
      self.depth,
      self.block_id
    ));
    self.variable_cx.bind(name, hir::Expression::var_name(renamed, type_.clone()));
    renamed
  }

  fn lower_block(
    &mut self,
    expression: &source::expr::Block<Rc<type_::Type>>,
    favored_temp_variable: Option<PStr>,
  ) -> LoweringResult {
    let mut lowered_stmts = vec![];
    self.depth += 1;
    self.variable_cx.push_scope();
    for s in &expression.statements {
      match &s.pattern {
        source::expr::Pattern::Object(_, destructured_names) => {
          let assigned_expr =
            self.lowered_and_add_statements(&s.assigned_expression, None, &mut lowered_stmts);
          let id_type = assigned_expr.type_().as_id().unwrap();
          for destructured_name in destructured_names {
            let field_type =
              &self.resolve_type_mapping_of_id_type(id_type)[destructured_name.field_order];
            let mangled_name = self.get_renamed_variable_for_nesting(
              if let Some(n) = &destructured_name.alias {
                n.name
              } else {
                destructured_name.field_name.name
              },
              field_type,
            );
            self
              .variable_cx
              .bind(mangled_name, hir::Expression::var_name(mangled_name, field_type.clone()));
            lowered_stmts.push(hir::Statement::IndexedAccess {
              name: mangled_name,
              type_: field_type.clone(),
              pointer_expression: assigned_expr.clone(),
              index: destructured_name.field_order,
            });
          }
        }
        source::expr::Pattern::Id(_, id) => {
          let e =
            self.lowered_and_add_statements(&s.assigned_expression, Some(*id), &mut lowered_stmts);
          self.variable_cx.bind(*id, e);
        }
        source::expr::Pattern::Wildcard(_) => {
          self.lowered_and_add_statements(&s.assigned_expression, None, &mut lowered_stmts);
        }
      }
    }
    let final_expr = if let Some(e) = &expression.expression {
      self.lowered_and_add_statements(e, favored_temp_variable, &mut lowered_stmts)
    } else {
      hir::ZERO
    };
    self.variable_cx.pop_scope();
    self.block_id += 1;
    self.depth -= 1;
    LoweringResult { statements: lowered_stmts, expression: final_expr }
  }
}

fn lower_source_expression(
  mut manager: ExpressionLoweringManager,
  expression: &source::expr::E<Rc<type_::Type>>,
) -> LoweringResultWithSyntheticFunctions {
  if let source::expr::E::Block(_) = expression {
    manager.depth -= 1;
  }
  let LoweringResult { statements, expression } = manager.lower(expression, None);
  LoweringResultWithSyntheticFunctions {
    synthetic_functions: manager.synthetic_functions,
    statements,
    expression,
  }
}

fn companion_fn_with_cx(heap: &mut Heap, original_fn: &hir::Function) -> hir::Function {
  hir::Function {
    name: heap.alloc_string(format!("{}_with_context", original_fn.name.as_str(heap))),
    parameters: vec![heap.alloc_str_permanent("_context")]
      .into_iter()
      .chain(original_fn.parameters.iter().cloned())
      .collect_vec(),
    type_parameters: original_fn.type_parameters.clone(),
    type_: hir::FunctionType {
      argument_types: vec![hir::INT_TYPE]
        .into_iter()
        .chain(original_fn.type_.argument_types.iter().cloned())
        .collect_vec(),
      return_type: original_fn.type_.return_type.clone(),
    },
    body: vec![hir::Statement::Call {
      callee: hir::Callee::FunctionName(hir::FunctionName {
        name: original_fn.name,
        type_: original_fn.type_.clone(),
        type_arguments: original_fn
          .type_parameters
          .iter()
          .cloned()
          .map(hir::Type::new_id_no_targs)
          .collect_vec(),
      }),
      arguments: original_fn
        .parameters
        .iter()
        .zip(original_fn.type_.argument_types.iter())
        .map(|(n, t)| hir::Expression::var_name(*n, t.clone()))
        .collect_vec(),
      return_type: original_fn.type_.return_type.as_ref().clone(),
      return_collector: Some(heap.alloc_str_permanent("_ret")),
    }],
    return_value: hir::Expression::var_name(
      heap.alloc_str_permanent("_ret"),
      original_fn.type_.return_type.as_ref().clone(),
    ),
  }
}

fn lower_constructors(
  heap: &mut Heap,
  module_reference: &ModuleReference,
  class_name: PStr,
  type_definition_mapping: &HashMap<PStr, hir::TypeDefinition>,
) -> Vec<hir::Function> {
  let type_name =
    heap.alloc_string(common_names::encode_samlang_type(heap, module_reference, class_name));
  let type_def = type_definition_mapping.get(&type_name).unwrap();
  let struct_var_name = "_struct";
  let struct_type = hir::IdType {
    name: type_name,
    type_arguments: type_def
      .type_parameters
      .iter()
      .map(|n| hir::Type::new_id_no_targs(*n))
      .collect_vec(),
  };
  let mut functions = vec![];
  if type_def.is_object {
    let f = hir::Function {
      name: heap.alloc_string(common_names::encode_function_name_globally(
        heap,
        module_reference,
        class_name.as_str(heap),
        "init",
      )),
      parameters: type_def
        .mappings
        .iter()
        .enumerate()
        .map(|(i, _)| heap.alloc_string(format!("_f{i}")))
        .collect_vec(),
      type_parameters: type_def.type_parameters.clone(),
      type_: hir::Type::new_fn_unwrapped(
        type_def.mappings.clone(),
        hir::Type::Id(struct_type.clone()),
      ),
      body: vec![hir::Statement::StructInit {
        struct_variable_name: heap.alloc_str_permanent(struct_var_name),
        type_: struct_type.clone(),
        expression_list: type_def
          .mappings
          .iter()
          .enumerate()
          .map(|(order, t)| {
            hir::Expression::var_name(heap.alloc_string(format!("_f{order}")), t.clone())
          })
          .collect_vec(),
      }],
      return_value: hir::Expression::var_name(
        heap.alloc_str_permanent(struct_var_name),
        hir::Type::Id(struct_type),
      ),
    };
    let companion = companion_fn_with_cx(heap, &f);
    functions.push(f);
    functions.push(companion);
  } else {
    for (tag_order, data_type) in type_def.mappings.iter().enumerate() {
      let f = hir::Function {
        name: heap.alloc_string(common_names::encode_function_name_globally(
          heap,
          module_reference,
          class_name.as_str(heap),
          type_def.names[tag_order].as_str(heap),
        )),
        parameters: vec![heap.alloc_str_permanent("_data")],
        type_parameters: type_def.type_parameters.clone(),
        type_: hir::Type::new_fn_unwrapped(
          vec![data_type.clone()],
          hir::Type::Id(struct_type.clone()),
        ),
        body: vec![hir::Statement::StructInit {
          struct_variable_name: heap.alloc_str_permanent(struct_var_name),
          type_: struct_type.clone(),
          expression_list: vec![
            hir::Expression::int(i32::try_from(tag_order).unwrap()),
            hir::Expression::var_name(heap.alloc_str_permanent("_data"), data_type.clone()),
          ],
        }],
        return_value: hir::Expression::var_name(
          heap.alloc_str_permanent(struct_var_name),
          hir::Type::Id(struct_type.clone()),
        ),
      };
      let companion = companion_fn_with_cx(heap, &f);
      functions.push(f);
      functions.push(companion);
    }
  }
  functions
}

fn lower_tparams(type_parameters: &[source::TypeParameter]) -> Vec<PStr> {
  type_parameters.iter().map(|it| it.name.name).collect_vec()
}

fn compile_sources_with_generics_preserved(
  heap: &mut Heap,
  sources: &HashMap<ModuleReference, source::Module<Rc<type_::Type>>>,
) -> hir::Sources {
  let mut type_lowering_manager =
    TypeLoweringManager { generic_types: HashSet::new(), type_synthesizer: TypeSynthesizer::new() };
  let mut compiled_type_defs = vec![];
  let mut main_function_names = vec![];
  for (mod_ref, source_module) in sources.iter() {
    for toplevel in &source_module.toplevels {
      if let source::Toplevel::Class(c) = &toplevel {
        type_lowering_manager.generic_types =
          c.type_parameters.iter().map(|it| it.name.name).collect();
        compiled_type_defs.push(type_lowering_manager.lower_source_type_definition(
          heap,
          mod_ref,
          c.name.name,
          &c.type_definition,
        ));
        if c.name.name.as_str(heap).eq("Main")
          && c.members.iter().any(|source::ClassMemberDefinition { decl, .. }| {
            decl.name.name.as_str(heap).eq("main")
              && decl.parameters.is_empty()
              && decl.type_parameters.is_empty()
          })
        {
          main_function_names
            .push(heap.alloc_string(common_names::encode_main_function_name(heap, mod_ref)));
        }
      }
    }
  }
  let type_def_mappings: HashMap<_, _> =
    compiled_type_defs.iter().map(|it| (it.identifier, it.clone())).collect();

  let mut string_manager = StringManager::new();
  let mut compiled_functions_with_added_dummy_cx = vec![];
  let mut compiled_functions = vec![];
  for (module_reference, source_module) in sources.iter() {
    for toplevel in &source_module.toplevels {
      if let source::Toplevel::Class(c) = &toplevel {
        compiled_functions.append(&mut lower_constructors(
          heap,
          module_reference,
          c.name.name,
          &type_def_mappings,
        ));
        for member in &c.members {
          let encoded_name = heap.alloc_string(common_names::encode_function_name_globally(
            heap,
            module_reference,
            c.name.name.as_str(heap),
            member.decl.name.name.as_str(heap),
          ));
          let class_tparams = lower_tparams(&c.type_parameters);
          if member.decl.is_method {
            let tparams = class_tparams
              .iter()
              .cloned()
              .chain(lower_tparams(&member.decl.type_parameters))
              .sorted()
              .collect_vec();
            let tparams_set: HashSet<_> = tparams.iter().cloned().collect();
            type_lowering_manager.generic_types = tparams_set;
            let main_function_parameter_with_types = vec![(
              heap.alloc_str_permanent("_this"),
              hir::Type::new_id(
                heap.alloc_string(encode_samlang_type(heap, module_reference, c.name.name)),
                class_tparams.into_iter().map(hir::Type::new_id_no_targs).collect_vec(),
              ),
            )]
            .into_iter()
            .chain(member.decl.parameters.iter().map(|id| {
              (
                id.name.name,
                type_lowering_manager
                  .lower_source_type(heap, &type_::Type::from_annotation(&id.annotation)),
              )
            }))
            .collect_vec();
            let manager = ExpressionLoweringManager::new(
              module_reference,
              encoded_name,
              main_function_parameter_with_types.clone(),
              &type_def_mappings,
              heap,
              &mut type_lowering_manager,
              &mut string_manager,
            );
            let LoweringResultWithSyntheticFunctions {
              statements,
              expression,
              synthetic_functions: mut compiled_functions_to_add,
            } = lower_source_expression(manager, &member.body);
            let main_fn_type = hir::Type::new_fn_unwrapped(
              main_function_parameter_with_types.iter().map(|(_, t)| t.clone()).collect_vec(),
              type_lowering_manager.lower_source_type(
                heap,
                &type_::Type::from_annotation(&member.decl.type_.return_type),
              ),
            );
            compiled_functions_to_add.push(hir::Function {
              name: encoded_name,
              parameters: main_function_parameter_with_types
                .into_iter()
                .map(|(n, _)| n)
                .collect_vec(),
              type_parameters: tparams,
              type_: main_fn_type,
              body: statements,
              return_value: expression,
            });
            compiled_functions.append(&mut compiled_functions_to_add);
          } else {
            let tparams_set: HashSet<_> =
              lower_tparams(&member.decl.type_parameters).into_iter().collect();
            let tparams = tparams_set.iter().sorted().cloned().collect_vec();
            type_lowering_manager.generic_types = tparams_set;
            let main_function_parameter_with_types = member
              .decl
              .parameters
              .iter()
              .map(|id| {
                (
                  id.name.name,
                  type_lowering_manager
                    .lower_source_type(heap, &type_::Type::from_annotation(&id.annotation)),
                )
              })
              .collect_vec();
            let manager = ExpressionLoweringManager::new(
              module_reference,
              encoded_name,
              main_function_parameter_with_types.clone(),
              &type_def_mappings,
              heap,
              &mut type_lowering_manager,
              &mut string_manager,
            );
            let LoweringResultWithSyntheticFunctions {
              statements,
              expression,
              synthetic_functions: mut compiled_functions_to_add,
            } = lower_source_expression(manager, &member.body);
            let main_fn_type = hir::Type::new_fn_unwrapped(
              main_function_parameter_with_types.iter().map(|(_, t)| t.clone()).collect_vec(),
              type_lowering_manager.lower_source_type(
                heap,
                &type_::Type::from_annotation(&member.decl.type_.return_type),
              ),
            );
            let original_f = hir::Function {
              name: encoded_name,
              parameters: main_function_parameter_with_types
                .into_iter()
                .map(|(n, _)| n)
                .collect_vec(),
              type_parameters: tparams,
              type_: main_fn_type,
              body: statements,
              return_value: expression,
            };
            let companion = companion_fn_with_cx(heap, &original_f);
            compiled_functions.append(&mut compiled_functions_to_add);
            compiled_functions.push(original_f);
            compiled_functions_with_added_dummy_cx.push(companion);
          }
        }
      }
    }
  }

  let SynthesizedTypes { closure_types, mut tuple_types } =
    type_lowering_manager.type_synthesizer.synthesized_types();
  compiled_type_defs.append(&mut tuple_types);

  hir::Sources {
    global_variables: string_manager.all_global_variables(),
    closure_types,
    type_definitions: compiled_type_defs,
    main_function_names,
    functions: compiled_functions_with_added_dummy_cx
      .into_iter()
      .chain(compiled_functions)
      .collect_vec(),
  }
}

fn optimize_by_tail_rec_rewrite(heap: &mut Heap, sources: hir::Sources) -> hir::Sources {
  let hir::Sources {
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions,
  } = sources;
  hir::Sources {
    global_variables,
    closure_types,
    type_definitions,
    main_function_names,
    functions: functions
      .into_iter()
      .map(|f| hir_tail_recursion_rewrite::optimize_function_by_tailrec_rewrite(heap, f))
      .collect(),
  }
}

pub(crate) fn compile_sources_to_hir(
  heap: &mut Heap,
  sources: &HashMap<ModuleReference, source::Module<Rc<type_::Type>>>,
) -> hir::Sources {
  let mut sources = compile_sources_with_generics_preserved(heap, sources);
  sources = hir_generics_specialization::perform_generics_specialization(heap, sources);
  sources = hir_type_deduplication::deduplicate(heap, sources);
  optimize_by_tail_rec_rewrite(heap, sources)
}

#[cfg(test)]
mod tests {
  use crate::{
    ast::{
      hir,
      source::{self, test_builder, CommentStore, NO_COMMENT_REFERENCE},
      Location,
    },
    checker::type_::{self, test_type_builder},
    common::{Heap, ModuleReference},
    compiler::{
      hir_lowering::ExpressionLoweringManager,
      hir_string_manager::StringManager,
      hir_type_conversion::{SynthesizedTypes, TypeLoweringManager, TypeSynthesizer},
    },
  };
  use itertools::Itertools;
  use pretty_assertions::assert_eq;
  use std::{
    collections::{HashMap, HashSet},
    rc::Rc,
  };

  fn assert_expr_correctly_lowered(
    source_expr: &source::expr::E<Rc<type_::Type>>,
    heap: &mut Heap,
    expected_str: &str,
  ) {
    let mut type_lowering_manager = TypeLoweringManager {
      generic_types: HashSet::from_iter(vec![heap.alloc_str_for_test("GENERIC_TYPE")]),
      type_synthesizer: TypeSynthesizer::new(),
    };
    let mut string_manager = StringManager::new();
    let mod_ref = ModuleReference::dummy();
    let type_def_mapping = HashMap::from([
      (
        heap.alloc_str_for_test("__DUMMY___Foo"),
        hir::TypeDefinition {
          identifier: heap.alloc_str_for_test("__DUMMY___Foo"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![hir::INT_TYPE, hir::INT_TYPE],
        },
      ),
      (
        heap.alloc_str_for_test("__DUMMY___Dummy"),
        hir::TypeDefinition {
          identifier: heap.alloc_str_for_test("__DUMMY___Dummy"),
          is_object: true,
          type_parameters: vec![],
          names: vec![],
          mappings: vec![hir::INT_TYPE, hir::INT_TYPE],
        },
      ),
    ]);
    let manager = ExpressionLoweringManager::new(
      &mod_ref,
      heap.alloc_str_for_test("ENCODED_FUNCTION_NAME"),
      vec![
        (
          heap.alloc_str_for_test("_this"),
          hir::Type::new_id_no_targs(heap.alloc_str_for_test("__DUMMY___Dummy")),
        ),
        (heap.alloc_str_for_test("foo"), hir::INT_TYPE),
        (heap.alloc_str_for_test("bar"), hir::BOOL_TYPE),
        (
          heap.alloc_str_for_test("closure"),
          hir::Type::new_id_no_targs(heap.alloc_str_for_test("Closure")),
        ),
        (
          heap.alloc_str_for_test("closure_unit_return"),
          hir::Type::new_id_no_targs(heap.alloc_str_for_test("Closure")),
        ),
        (heap.alloc_str_for_test("captured_a"), hir::INT_TYPE),
      ],
      &type_def_mapping,
      heap,
      &mut type_lowering_manager,
      &mut string_manager,
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
      main_function_names: vec![],
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

  fn dummy_source_id_type_unwrapped(heap: &mut Heap) -> type_::IdType {
    test_type_builder::create().simple_id_type_unwrapped(heap.alloc_str_for_test("Dummy"))
  }

  fn dummy_source_id_type(heap: &mut Heap) -> type_::Type {
    type_::Type::Id(dummy_source_id_type_unwrapped(heap))
  }

  fn dummy_source_id_annot(heap: &mut Heap) -> source::annotation::T {
    test_builder::create().simple_id_annot(heap.alloc_str_for_test("Dummy"))
  }

  fn dummy_source_this(heap: &mut Heap) -> source::expr::E<Rc<type_::Type>> {
    source::expr::E::Id(
      source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
      source::Id::from(heap.alloc_str_for_test("this")),
    )
  }

  fn id_expr(id: crate::common::PStr, type_: Rc<type_::Type>) -> source::expr::E<Rc<type_::Type>> {
    source::expr::E::Id(source::expr::ExpressionCommon::dummy(type_), source::Id::from(id))
  }

  #[test]
  fn simple_expressions_lowering_tests() {
    let builder = test_type_builder::create();

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
      "const GLOBAL_STRING_6 = 'foo';\n\n\nreturn GLOBAL_STRING_6;",
    );

    // This & variable lowering works.
    assert_expr_correctly_lowered(
      &dummy_source_this(heap),
      heap,
      "return (_this: __DUMMY___Dummy);",
    );
    assert_expr_correctly_lowered(
      &id_expr(heap.alloc_str_for_test("foo"), builder.unit_type()),
      heap,
      "return (foo: int);",
    );
  }

  #[test]
  fn access_expressions_lowering_tests() {
    let builder = test_type_builder::create();

    // ClassFn lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::ClassFn(source::expr::ClassFunction {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.int_type()], builder.int_type()),
        ),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        module_reference: ModuleReference::dummy(),
        class_name: source::Id::from(heap.alloc_str_for_test("A")),
        fn_name: source::Id::from(heap.alloc_str_for_test("b")),
      }),
      heap,
      r#"closure type $SyntheticIDType0 = (int) -> int
let _t15: $SyntheticIDType0 = Closure { fun: (___DUMMY___A$b_with_context: (int, int) -> int), context: 0 };
return (_t15: $SyntheticIDType0);"#,
    );

    // FieldAccess lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::FieldAccess(source::expr::FieldAccess {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(dummy_source_this(heap)),
        field_name: source::Id::from(heap.alloc_str_for_test("foo")),
        field_order: 0,
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy)[0];\nreturn (_t14: int);",
    );

    // MethodAccess lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::MethodAccess(source::expr::MethodAccess {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.int_type()], builder.int_type()),
        ),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(dummy_source_this(heap)),
        method_name: source::Id::from(heap.alloc_str_for_test("foo")),
      }),
      heap,
      r#"closure type $SyntheticIDType0 = (int) -> int
let _t15: $SyntheticIDType0 = Closure { fun: (___DUMMY___Dummy$foo: (__DUMMY___Dummy, int) -> int), context: (_this: __DUMMY___Dummy) };
return (_t15: $SyntheticIDType0);"#,
    );
  }

  #[test]
  fn call_lowering_tests() {
    let builder = test_type_builder::create();

    // Function call 1/n: class fn call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
          common: source::expr::ExpressionCommon::dummy(
            builder.fun_type(vec![builder.int_type()], builder.int_type()),
          ),
          explicit_type_arguments: vec![],
          inferred_type_arguments: vec![],
          module_reference: heap
            .alloc_module_reference_from_string_vec(vec!["ModuleModule".to_string()]),
          class_name: source::Id::from(heap.alloc_str_for_test("ImportedClass")),
          fn_name: source::Id::from(heap.alloc_str_for_test("bar")),
        })),
        arguments: vec![dummy_source_this(heap), dummy_source_this(heap)],
      }),
      heap,
      r#"let _t16: int = _ModuleModule_ImportedClass$bar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t16: int);"#,
    );
    // Function call 2/n: class fn call without return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
          common: source::expr::ExpressionCommon::dummy(
            builder.fun_type(vec![builder.int_type()], builder.int_type()),
          ),
          explicit_type_arguments: vec![],
          inferred_type_arguments: vec![],
          module_reference: ModuleReference::dummy(),
          class_name: source::Id::from(heap.alloc_str_for_test("C")),
          fn_name: source::Id::from(heap.alloc_str_for_test("m1")),
        })),
        arguments: vec![source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.int_type()),
          source::Literal::Int(0),
        )],
      }),
      heap,
      "___DUMMY___C$m1(0);\nreturn 0;",
    );
    // Function call 3/n: class fn call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
          common: source::expr::ExpressionCommon::dummy(
            builder.fun_type(vec![builder.int_type()], Rc::new(dummy_source_id_type(heap))),
          ),
          explicit_type_arguments: vec![],
          inferred_type_arguments: vec![],
          module_reference: ModuleReference::dummy(),
          class_name: source::Id::from(heap.alloc_str_for_test("C")),
          fn_name: source::Id::from(heap.alloc_str_for_test("m2")),
        })),
        arguments: vec![source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.int_type()),
          source::Literal::Int(0),
        )],
      }),
      heap,
      "let _t15: __DUMMY___Dummy = ___DUMMY___C$m2(0);\nreturn (_t15: __DUMMY___Dummy);",
    );
    // Function call 4/n: class fn generic call
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
          common: source::expr::ExpressionCommon::dummy(
            builder.fun_type(vec![builder.int_type()], Rc::new(dummy_source_id_type(heap))),
          ),
          explicit_type_arguments: vec![],
          inferred_type_arguments: vec![],
          module_reference: ModuleReference::dummy(),
          class_name: source::Id::from(heap.alloc_str_for_test("GENERIC_TYPE")),
          fn_name: source::Id::from(heap.alloc_str_for_test("m2")),
        })),
        arguments: vec![source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.int_type()),
          source::Literal::Int(0),
        )],
      }),
      heap,
      "$GENERICS$_GENERIC_TYPE$m2(0);\nreturn 0;",
    );
    // Function call 5/n: method call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        callee: Box::new(source::expr::E::MethodAccess(source::expr::MethodAccess {
          common: source::expr::ExpressionCommon::dummy(builder.fun_type(
            vec![Rc::new(dummy_source_id_type(heap)), Rc::new(dummy_source_id_type(heap))],
            builder.int_type(),
          )),
          explicit_type_arguments: vec![],
          inferred_type_arguments: vec![],
          object: Box::new(dummy_source_this(heap)),
          method_name: source::Id::from(heap.alloc_str_for_test("fooBar")),
        })),
        arguments: vec![dummy_source_this(heap), dummy_source_this(heap)],
      }),
      heap,
      r#"let _t15: int = ___DUMMY___Dummy$fooBar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t15: int);"#,
    );
    // Function call 6/n: closure call with return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        callee: Box::new(id_expr(
          heap.alloc_str_for_test("closure"),
          builder.fun_type(vec![builder.bool_type()], builder.int_type()),
        )),
        arguments: vec![source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(true),
        )],
      }),
      heap,
      r#"let _t12: int = (closure: Closure)(1);
return (_t12: int);"#,
    );
    // Function call 7/n: closure call without return
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Call(source::expr::Call {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        callee: Box::new(id_expr(
          heap.alloc_str_for_test("closure_unit_return"),
          builder.fun_type(vec![builder.bool_type()], builder.unit_type()),
        )),
        arguments: vec![source::expr::E::Literal(
          source::expr::ExpressionCommon::dummy(builder.bool_type()),
          source::Literal::Bool(true),
        )],
      }),
      heap,
      r#"(closure_unit_return: Closure)(1);
return 0;"#,
    );
  }

  #[test]
  fn op_lowering_tests() {
    let builder = test_type_builder::create();

    // Unary lowering works.
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Unary(source::expr::Unary {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        operator: source::expr::UnaryOperator::NOT,
        argument: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) ^ 1;\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Unary(source::expr::Unary {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        operator: source::expr::UnaryOperator::NEG,
        argument: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = 0 - (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );

    // Binary Lowering: normal
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::PLUS,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy) + (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MINUS,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy) - (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MUL,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy) * (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::DIV,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy) / (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.int_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::MOD,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: int = (_this: __DUMMY___Dummy) % (_this: __DUMMY___Dummy);\nreturn (_t14: int);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::LT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) < (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::LE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) <= (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::GT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) > (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments:NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::GE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) >= (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::EQ,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) == (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::NE,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      "let _t14: bool = (_this: __DUMMY___Dummy) != (_this: __DUMMY___Dummy);\nreturn (_t14: bool);",
    );
    // Binary Lowering: Short circuiting &&
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::AND,
        e1: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.bool_type())),
        e2: Box::new(id_expr(heap.alloc_str_for_test("bar"), builder.bool_type())),
      }),
      heap,
      r#"let _t12: bool;
if (foo: int) {
  _t12 = (bar: bool);
} else {
  _t12 = 0;
}
return (_t12: bool);"#,
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.bool_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
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
        operator_preceding_comments: NO_COMMENT_REFERENCE,
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
        operator_preceding_comments: NO_COMMENT_REFERENCE,
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
        operator_preceding_comments: NO_COMMENT_REFERENCE,
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
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::OR,
        e1: Box::new(id_expr(heap.alloc_str_for_test("foo"), builder.bool_type())),
        e2: Box::new(id_expr(heap.alloc_str_for_test("bar"), builder.bool_type())),
      }),
      heap,
      r#"let _t12: bool;
if (foo: int) {
  _t12 = 1;
} else {
  _t12 = (bar: bool);
}
return (_t12: bool);"#,
    );
    // Binary Lowering: string concat
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.string_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: source::expr::BinaryOperator::CONCAT,
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"let _t14: string = __Builtins$stringConcat((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));
return (_t14: string);"#,
    );
    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Binary(source::expr::Binary {
        common: source::expr::ExpressionCommon::dummy(builder.string_type()),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
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
      "const GLOBAL_STRING_14 = 'hello world';\n\n\nreturn GLOBAL_STRING_14;",
    );
  }

  #[test]
  fn lambda_lowering_tests() {
    let annot_builder = test_builder::create();
    let builder = test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], builder.unit_type()),
        ),
        parameters: vec![source::OptionallyAnnotatedId {
          name: source::Id::from(heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
        }],
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type $SyntheticIDType1 = (int) -> int
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0(_context: $SyntheticIDType0, a: int): int {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t16: $SyntheticIDType0 = [(captured_a: int)];
let _t15: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0: ($SyntheticIDType0, int) -> int), context: (_t16: $SyntheticIDType0) };
return (_t15: $SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], builder.int_type()),
        ),
        parameters: vec![source::OptionallyAnnotatedId {
          name: source::Id::from(heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
        }],
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type $SyntheticIDType1 = (int) -> int
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0(_context: $SyntheticIDType0, a: int): int {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t16: $SyntheticIDType0 = [(captured_a: int)];
let _t15: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0: ($SyntheticIDType0, int) -> int), context: (_t16: $SyntheticIDType0) };
return (_t15: $SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], Rc::new(dummy_source_id_type(heap))),
        ),
        parameters: vec![source::OptionallyAnnotatedId {
          name: source::Id::from(heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
        }],
        captured: HashMap::from([(heap.alloc_str_for_test("captured_a"), builder.unit_type())]),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type $SyntheticIDType1 = (int) -> __DUMMY___Dummy
object type $SyntheticIDType0 = [int]
function ___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0(_context: $SyntheticIDType0, a: int): __DUMMY___Dummy {
  let captured_a: int = (_context: $SyntheticIDType0)[0];
  return (_this: __DUMMY___Dummy);
}

let _t16: $SyntheticIDType0 = [(captured_a: int)];
let _t15: $SyntheticIDType1 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0: ($SyntheticIDType0, int) -> __DUMMY___Dummy), context: (_t16: $SyntheticIDType0) };
return (_t15: $SyntheticIDType1);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Lambda(source::expr::Lambda {
        common: source::expr::ExpressionCommon::dummy(
          builder.fun_type(vec![builder.unit_type()], Rc::new(dummy_source_id_type(heap))),
        ),
        parameters: vec![source::OptionallyAnnotatedId {
          name: source::Id::from(heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
        }],
        captured: HashMap::new(),
        body: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"closure type $SyntheticIDType0 = (int) -> __DUMMY___Dummy
function ___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0(_context: int, a: int): __DUMMY___Dummy {
  return (_this: __DUMMY___Dummy);
}

let _t15: $SyntheticIDType0 = Closure { fun: (___DUMMY___ENCODED_FUNCTION_NAME$_Synthetic_0: (int, int) -> __DUMMY___Dummy), context: 0 };
return (_t15: $SyntheticIDType0);"#,
    );
  }

  #[test]
  fn control_flow_lowering_tests() {
    let builder = test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::IfElse(source::expr::IfElse {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        condition: Box::new(dummy_source_this(heap)),
        e1: Box::new(dummy_source_this(heap)),
        e2: Box::new(dummy_source_this(heap)),
      }),
      heap,
      r#"let _t14: __DUMMY___Dummy;
if (_this: __DUMMY___Dummy) {
  _t14 = (_this: __DUMMY___Dummy);
} else {
  _t14 = (_this: __DUMMY___Dummy);
}
return (_t14: __DUMMY___Dummy);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Match(source::expr::Match {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        matched: Box::new(dummy_source_this(heap)),
        cases: vec![
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            tag: source::Id::from(heap.alloc_str_for_test("Foo")),
            tag_order: 0,
            data_variable: Some((
              source::Id::from(heap.alloc_str_for_test("bar")),
              builder.int_type(),
            )),
            body: Box::new(dummy_source_this(heap)),
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            tag: source::Id::from(heap.alloc_str_for_test("Bar")),
            tag_order: 1,
            data_variable: None,
            body: Box::new(dummy_source_this(heap)),
          },
        ],
      }),
      heap,
      r#"let _t16: int = (_this: __DUMMY___Dummy)[0];
let _t17: bool = (_t16: int) == 0;
let _t18: __DUMMY___Dummy;
if (_t17: bool) {
  let bar: int = (_this: __DUMMY___Dummy)[1];
  _t18 = (_this: __DUMMY___Dummy);
} else {
  _t18 = (_this: __DUMMY___Dummy);
}
return (_t18: __DUMMY___Dummy);"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Match(source::expr::Match {
        common: source::expr::ExpressionCommon::dummy(Rc::new(dummy_source_id_type(heap))),
        matched: Box::new(dummy_source_this(heap)),
        cases: vec![
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            tag: source::Id::from(heap.alloc_str_for_test("Foo")),
            tag_order: 0,
            data_variable: None,
            body: Box::new(dummy_source_this(heap)),
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            tag: source::Id::from(heap.alloc_str_for_test("Bar")),
            tag_order: 1,
            data_variable: Some((
              source::Id::from(heap.alloc_str_for_test("bar")),
              Rc::new(dummy_source_id_type(heap)),
            )),
            body: Box::new(id_expr(
              heap.alloc_str_for_test("bar"),
              Rc::new(dummy_source_id_type(heap)),
            )),
          },
          source::expr::VariantPatternToExpression {
            loc: Location::dummy(),
            tag: source::Id::from(heap.alloc_str_for_test("Baz")),
            tag_order: 2,
            data_variable: None,
            body: Box::new(dummy_source_this(heap)),
          },
        ],
      }),
      heap,
      r#"let _t17: int = (_this: __DUMMY___Dummy)[0];
let _t20: bool = (_t17: int) == 0;
let _t21: __DUMMY___Dummy;
if (_t20: bool) {
  _t21 = (_this: __DUMMY___Dummy);
} else {
  let _t18: bool = (_t17: int) == 1;
  let _t19: __DUMMY___Dummy;
  if (_t18: bool) {
    let bar: int = (_this: __DUMMY___Dummy)[1];
    _t19 = (bar: int);
  } else {
    _t19 = (_this: __DUMMY___Dummy);
  }
  _t21 = (_t19: __DUMMY___Dummy);
}
return (_t21: __DUMMY___Dummy);"#,
    );
  }

  #[test]
  fn block_lowering_tests() {
    let annot_builder = test_builder::create();
    let builder = test_type_builder::create();

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
          assigned_expression: Box::new(source::expr::E::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
            statements: vec![
              source::expr::DeclarationStatement {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                pattern: source::expr::Pattern::Object(
                  Location::dummy(),
                  vec![
                    source::expr::ObjectPatternDestucturedName {
                      loc: Location::dummy(),
                      field_order: 0,
                      field_name: source::Id::from(heap.alloc_str_for_test("a")),
                      alias: None,
                      type_: builder.int_type(),
                    },
                    source::expr::ObjectPatternDestucturedName {
                      loc: Location::dummy(),
                      field_order: 1,
                      field_name: source::Id::from(heap.alloc_str_for_test("b")),
                      alias: Some(source::Id::from(heap.alloc_str_for_test("c"))),
                      type_: builder.int_type(),
                    },
                  ],
                ),
                annotation: Some(dummy_source_id_annot(heap)),
                assigned_expression: Box::new(dummy_source_this(heap)),
              },
              source::expr::DeclarationStatement {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                pattern: source::expr::Pattern::Wildcard(Location::dummy()),
                annotation: Some(dummy_source_id_annot(heap)),
                assigned_expression: Box::new(dummy_source_this(heap)),
              },
            ],
            expression: None,
          })),
        }],
        expression: None,
      }),
      heap,
      r#"let a__depth_1__block_0: int = (_this: __DUMMY___Dummy)[0];
let c__depth_1__block_0: int = (_this: __DUMMY___Dummy)[1];
return 0;"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            pattern: source::expr::Pattern::Object(
              Location::dummy(),
              vec![
                source::expr::ObjectPatternDestucturedName {
                  loc: Location::dummy(),
                  field_order: 0,
                  field_name: source::Id::from(heap.alloc_str_for_test("a")),
                  alias: None,
                  type_: builder.int_type(),
                },
                source::expr::ObjectPatternDestucturedName {
                  loc: Location::dummy(),
                  field_order: 1,
                  field_name: source::Id::from(heap.alloc_str_for_test("b")),
                  alias: Some(source::Id::from(heap.alloc_str_for_test("c"))),
                  type_: builder.int_type(),
                },
              ],
            ),
            annotation: Some(dummy_source_id_annot(heap)),
            assigned_expression: Box::new(dummy_source_this(heap)),
          },
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            pattern: source::expr::Pattern::Wildcard(Location::dummy()),
            annotation: Some(dummy_source_id_annot(heap)),
            assigned_expression: Box::new(dummy_source_this(heap)),
          },
        ],
        expression: None,
      }),
      heap,
      r#"let a: int = (_this: __DUMMY___Dummy)[0];
let c: int = (_this: __DUMMY___Dummy)[1];
return 0;"#,
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.int_annot()),
          assigned_expression: Box::new(source::expr::E::Call(source::expr::Call {
            common: source::expr::ExpressionCommon::dummy(builder.int_type()),
            callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
              common: source::expr::ExpressionCommon::dummy(
                builder.fun_type(vec![builder.int_type()], builder.int_type())
              ),
              explicit_type_arguments: vec![],
              inferred_type_arguments: vec![],
              module_reference: heap.alloc_module_reference_from_string_vec(
                vec!["ModuleModule".to_string()],
              ),
              class_name: source::Id::from(heap.alloc_str_for_test("ImportedClass")),
              fn_name: source::Id::from(heap.alloc_str_for_test("bar")),
            })),
            arguments: vec![dummy_source_this(heap), dummy_source_this(heap)],
          })),
        }],
        expression: Some(Box::new( id_expr(heap.alloc_str_for_test("a"), builder.string_type()))),
      }),
      heap,
      "let a: int = _ModuleModule_ImportedClass$bar((_this: __DUMMY___Dummy), (_this: __DUMMY___Dummy));\nreturn (a: int);",
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("a")),
            annotation: Some(annot_builder.unit_annot()),
            assigned_expression: Box::new(source::expr::E::Literal(
              source::expr::ExpressionCommon::dummy(builder.string_type()),
              source::Literal::String(heap.alloc_str_for_test("foo")),
            )),
          },
          source::expr::DeclarationStatement {
            loc: Location::dummy(),
            associated_comments: NO_COMMENT_REFERENCE,
            pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("b")),
            annotation: Some(annot_builder.unit_annot()),
            assigned_expression: Box::new(id_expr(
              heap.alloc_str_for_test("a"),
              builder.string_type(),
            )),
          },
        ],
        expression: Some(Box::new(id_expr(heap.alloc_str_for_test("b"), builder.string_type()))),
      }),
      heap,
      "const GLOBAL_STRING_2 = 'foo';\n\n\nreturn GLOBAL_STRING_2;",
    );

    let heap = &mut Heap::new();
    assert_expr_correctly_lowered(
      &source::expr::E::Block(source::expr::Block {
        common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
        statements: vec![source::expr::DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("a")),
          annotation: Some(annot_builder.unit_annot()),
          assigned_expression: Box::new(source::expr::E::Block(source::expr::Block {
            common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
            statements: vec![source::expr::DeclarationStatement {
              loc: Location::dummy(),
              associated_comments: NO_COMMENT_REFERENCE,
              pattern: source::expr::Pattern::Id(Location::dummy(), heap.alloc_str_for_test("a")),
              annotation: Some(annot_builder.int_annot()),
              assigned_expression: Box::new(dummy_source_this(heap)),
            }],
            expression: Some(Box::new(id_expr(
              heap.alloc_str_for_test("a"),
              builder.string_type(),
            ))),
          })),
        }],
        expression: Some(Box::new(id_expr(heap.alloc_str_for_test("a"), builder.string_type()))),
      }),
      heap,
      "return (_this: __DUMMY___Dummy);",
    );
  }

  #[test]
  fn integration_tests() {
    let heap = &mut Heap::new();
    let annot_builder = test_builder::create();
    let builder = test_type_builder::create();

    let this_expr = &source::expr::E::Id(
      source::expr::ExpressionCommon::dummy(
        builder.simple_id_type(heap.alloc_str_for_test("Dummy")),
      ),
      source::Id::from(heap.alloc_str_for_test("this")),
    );

    let source_module = source::Module {
      comment_store: CommentStore::new(),
      imports: vec![],
      toplevels: vec![
        source::Toplevel::Interface(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: source::Id::from(heap.alloc_str_for_test("I")),
          type_parameters: vec![],
          extends_or_implements_nodes: vec![],
          type_definition: (),
          members: vec![],
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: source::Id::from(heap.alloc_str_for_test("Main")),
          type_parameters: vec![],
          extends_or_implements_nodes: vec![],
          type_definition: source::TypeDefinition::Struct {
            loc: Location::dummy(),
            fields: vec![],
          },
          members: vec![
            source::ClassMemberDefinition {
              decl: source::ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                is_public: true,
                is_method: false,
                name: source::Id::from(heap.alloc_str_for_test("main")),
                type_parameters: Rc::new(vec![]),
                type_: annot_builder.fn_annot_unwrapped(vec![], annot_builder.unit_annot()),
                parameters: Rc::new(vec![]),
              },
              body: source::expr::E::Call(source::expr::Call {
                common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
                  common: source::expr::ExpressionCommon::dummy(
                    builder.fun_type(vec![], builder.int_type()),
                  ),
                  explicit_type_arguments: vec![],
                  inferred_type_arguments: vec![],
                  module_reference: ModuleReference::dummy(),
                  class_name: source::Id::from(heap.alloc_str_for_test("Class1")),
                  fn_name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                })),
                arguments: vec![],
              }),
            },
            source::ClassMemberDefinition {
              decl: source::ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                is_public: true,
                is_method: false,
                name: source::Id::from(heap.alloc_str_for_test("loopy")),
                type_parameters: Rc::new(vec![source::TypeParameter {
                  loc: Location::dummy(),
                  name: source::Id::from(heap.alloc_str_for_test("T")),
                  bound: None,
                }]),
                type_: annot_builder.fn_annot_unwrapped(vec![], annot_builder.unit_annot()),
                parameters: Rc::new(vec![]),
              },
              body: source::expr::E::Call(source::expr::Call {
                common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
                  common: source::expr::ExpressionCommon::dummy(
                    builder.fun_type(vec![], builder.int_type()),
                  ),
                  explicit_type_arguments: vec![],
                  inferred_type_arguments: vec![],
                  module_reference: ModuleReference::dummy(),
                  class_name: source::Id::from(heap.alloc_str_for_test("T")),
                  fn_name: source::Id::from(heap.alloc_str_for_test("loopy")),
                })),
                arguments: vec![],
              }),
            },
          ],
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: source::Id::from(heap.alloc_str_for_test("Class1")),
          type_parameters: vec![],
          extends_or_implements_nodes: vec![],
          type_definition: source::TypeDefinition::Struct {
            loc: Location::dummy(),
            fields: vec![source::FieldDefinition {
              name: source::Id::from(heap.alloc_str_for_test("a")),
              annotation: annot_builder.int_annot(),
              is_public: true,
            }],
          },
          members: vec![
            source::ClassMemberDefinition {
              decl: source::ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                is_public: true,
                is_method: true,
                name: source::Id::from(heap.alloc_str_for_test("foo")),
                type_parameters: Rc::new(vec![]),
                type_: annot_builder
                  .fn_annot_unwrapped(vec![annot_builder.int_annot()], annot_builder.int_annot()),
                parameters: Rc::new(vec![source::AnnotatedId {
                  name: source::Id::from(heap.alloc_str_for_test("a")),
                  annotation: annot_builder.int_annot(),
                }]),
              },
              body: this_expr.clone(),
            },
            source::ClassMemberDefinition {
              decl: source::ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                is_public: true,
                is_method: false,
                name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                type_parameters: Rc::new(vec![]),
                type_: annot_builder.fn_annot_unwrapped(vec![], annot_builder.unit_annot()),
                parameters: Rc::new(vec![]),
              },
              body: source::expr::E::Call(source::expr::Call {
                common: source::expr::ExpressionCommon::dummy(builder.unit_type()),
                callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
                  common: source::expr::ExpressionCommon::dummy(
                    builder.fun_type(vec![], builder.int_type()),
                  ),
                  explicit_type_arguments: vec![],
                  inferred_type_arguments: vec![],
                  module_reference: ModuleReference::dummy(),
                  class_name: source::Id::from(heap.alloc_str_for_test("Class1")),
                  fn_name: source::Id::from(heap.alloc_str_for_test("infiniteLoop")),
                })),
                arguments: vec![],
              }),
            },
            source::ClassMemberDefinition {
              decl: source::ClassMemberDeclaration {
                loc: Location::dummy(),
                associated_comments: NO_COMMENT_REFERENCE,
                is_public: true,
                is_method: false,
                name: source::Id::from(heap.alloc_str_for_test("factorial")),
                type_parameters: Rc::new(vec![]),
                type_: annot_builder.fn_annot_unwrapped(
                  vec![annot_builder.int_annot(), annot_builder.int_annot()],
                  annot_builder.int_annot(),
                ),
                parameters: Rc::new(vec![
                  source::AnnotatedId {
                    name: source::Id::from(heap.alloc_str_for_test("n")),
                    annotation: annot_builder.int_annot(),
                  },
                  source::AnnotatedId {
                    name: source::Id::from(heap.alloc_str_for_test("acc")),
                    annotation: annot_builder.int_annot(),
                  },
                ]),
              },
              body: source::expr::E::IfElse(source::expr::IfElse {
                common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                condition: Box::new(source::expr::E::Binary(source::expr::Binary {
                  common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                  operator_preceding_comments: NO_COMMENT_REFERENCE,
                  operator: source::expr::BinaryOperator::EQ,
                  e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                  e2: Box::new(source::expr::E::Literal(
                    source::expr::ExpressionCommon::dummy(builder.int_type()),
                    source::Literal::Int(0),
                  )),
                })),
                e1: Box::new(source::expr::E::Literal(
                  source::expr::ExpressionCommon::dummy(builder.int_type()),
                  source::Literal::Int(1),
                )),
                e2: Box::new(source::expr::E::Call(source::expr::Call {
                  common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                  callee: Box::new(source::expr::E::ClassFn(source::expr::ClassFunction {
                    common: source::expr::ExpressionCommon::dummy(
                      builder
                        .fun_type(vec![builder.int_type(), builder.int_type()], builder.int_type()),
                    ),
                    explicit_type_arguments: vec![],
                    inferred_type_arguments: vec![],
                    module_reference: ModuleReference::dummy(),
                    class_name: source::Id::from(heap.alloc_str_for_test("Class1")),
                    fn_name: source::Id::from(heap.alloc_str_for_test("factorial")),
                  })),
                  arguments: vec![
                    source::expr::E::Binary(source::expr::Binary {
                      common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                      operator_preceding_comments: NO_COMMENT_REFERENCE,
                      operator: source::expr::BinaryOperator::MINUS,
                      e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                      e2: Box::new(source::expr::E::Literal(
                        source::expr::ExpressionCommon::dummy(builder.int_type()),
                        source::Literal::Int(1),
                      )),
                    }),
                    source::expr::E::Binary(source::expr::Binary {
                      common: source::expr::ExpressionCommon::dummy(builder.int_type()),
                      operator_preceding_comments: NO_COMMENT_REFERENCE,
                      operator: source::expr::BinaryOperator::MUL,
                      e1: Box::new(id_expr(heap.alloc_str_for_test("n"), builder.int_type())),
                      e2: Box::new(id_expr(heap.alloc_str_for_test("acc"), builder.int_type())),
                    }),
                  ],
                })),
              }),
            },
          ],
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: source::Id::from(heap.alloc_str_for_test("Class2")),
          type_parameters: vec![],
          extends_or_implements_nodes: vec![],
          type_definition: source::TypeDefinition::Enum {
            loc: Location::dummy(),
            variants: vec![source::VariantDefinition {
              name: source::Id::from(heap.alloc_str_for_test("Tag")),
              associated_data_type: annot_builder.int_annot(),
            }],
          },
          members: vec![],
        }),
        source::Toplevel::Class(source::InterfaceDeclarationCommon {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          name: source::Id::from(heap.alloc_str_for_test("Class3")),
          type_parameters: vec![source::TypeParameter {
            loc: Location::dummy(),
            name: source::Id::from(heap.alloc_str_for_test("T")),
            bound: None,
          }],
          extends_or_implements_nodes: vec![],
          type_definition: source::TypeDefinition::Struct {
            loc: Location::dummy(),
            fields: vec![source::FieldDefinition {
              name: source::Id::from(heap.alloc_str_for_test("a")),
              annotation: annot_builder.fn_annot(
                vec![
                  annot_builder.general_id_annot(
                    heap.alloc_str_for_test("A"),
                    vec![annot_builder.int_annot()],
                  ),
                  annot_builder.simple_id_annot(heap.alloc_str_for_test("T")),
                ],
                annot_builder.int_annot(),
              ),
              is_public: true,
            }],
          },
          members: vec![],
        }),
      ],
    };
    let sources = HashMap::from([
      (ModuleReference::dummy(), source_module),
      (
        heap.alloc_module_reference_from_string_vec(vec!["Foo".to_string()]),
        source::Module { comment_store: CommentStore::new(), imports: vec![], toplevels: vec![] },
      ),
    ]);

    let generics_preserved_expected = r#"closure type $SyntheticIDType0<T> = (__DUMMY___A<int>, T) -> int
object type __DUMMY___Main = []
object type __DUMMY___Class1 = [int]
variant type __DUMMY___Class2 = [int]
object type __DUMMY___Class3<T> = [$SyntheticIDType0<T>]
function ___DUMMY___Main$main_with_context(_context: int): int {
  let _ret: int = ___DUMMY___Main$main();
  return (_ret: int);
}

function ___DUMMY___Main$loopy_with_context<T>(_context: int): int {
  let _ret: int = ___DUMMY___Main$loopy<T>();
  return (_ret: int);
}

function ___DUMMY___Class1$infiniteLoop_with_context(_context: int): int {
  let _ret: int = ___DUMMY___Class1$infiniteLoop();
  return (_ret: int);
}

function ___DUMMY___Class1$factorial_with_context(_context: int, n: int, acc: int): int {
  let _ret: int = ___DUMMY___Class1$factorial((n: int), (acc: int));
  return (_ret: int);
}

function ___DUMMY___Main$init(): __DUMMY___Main {
  let _struct: __DUMMY___Main = [];
  return (_struct: __DUMMY___Main);
}

function ___DUMMY___Main$init_with_context(_context: int): __DUMMY___Main {
  let _ret: __DUMMY___Main = ___DUMMY___Main$init();
  return (_ret: __DUMMY___Main);
}

function ___DUMMY___Main$main(): int {
  ___DUMMY___Class1$infiniteLoop();
  return 0;
}

function ___DUMMY___Main$loopy<T>(): int {
  $GENERICS$_T$loopy();
  return 0;
}

function ___DUMMY___Class1$init(_f0: int): __DUMMY___Class1 {
  let _struct: __DUMMY___Class1 = [(_f0: int)];
  return (_struct: __DUMMY___Class1);
}

function ___DUMMY___Class1$init_with_context(_context: int, _f0: int): __DUMMY___Class1 {
  let _ret: __DUMMY___Class1 = ___DUMMY___Class1$init((_f0: int));
  return (_ret: __DUMMY___Class1);
}

function ___DUMMY___Class1$foo(_this: __DUMMY___Class1, a: int): int {
  return (_this: __DUMMY___Class1);
}

function ___DUMMY___Class1$infiniteLoop(): int {
  ___DUMMY___Class1$infiniteLoop();
  return 0;
}

function ___DUMMY___Class1$factorial(n: int, acc: int): int {
  let _t47: bool = (n: int) == 0;
  let _t48: int;
  if (_t47: bool) {
    _t48 = 1;
  } else {
    let _t50: int = (n: int) + -1;
    let _t51: int = (n: int) * (acc: int);
    let _t49: int = ___DUMMY___Class1$factorial((_t50: int), (_t51: int));
    _t48 = (_t49: int);
  }
  return (_t48: int);
}

function ___DUMMY___Class2$Tag(_data: int): __DUMMY___Class2 {
  let _struct: __DUMMY___Class2 = [0, (_data: int)];
  return (_struct: __DUMMY___Class2);
}

function ___DUMMY___Class2$Tag_with_context(_context: int, _data: int): __DUMMY___Class2 {
  let _ret: __DUMMY___Class2 = ___DUMMY___Class2$Tag((_data: int));
  return (_ret: __DUMMY___Class2);
}

function ___DUMMY___Class3$init<T>(_f0: $SyntheticIDType0<T>): __DUMMY___Class3<T> {
  let _struct: __DUMMY___Class3<T> = [(_f0: $SyntheticIDType0<T>)];
  return (_struct: __DUMMY___Class3<T>);
}

function ___DUMMY___Class3$init_with_context<T>(_context: int, _f0: $SyntheticIDType0<T>): __DUMMY___Class3<T> {
  let _ret: __DUMMY___Class3<T> = ___DUMMY___Class3$init<T>((_f0: $SyntheticIDType0<T>));
  return (_ret: __DUMMY___Class3<T>);
}

sources.mains = [___DUMMY___Main$main]"#;

    let optimized_expected = r#"function ___DUMMY___Main$main(): int {
  ___DUMMY___Class1$infiniteLoop();
  return 0;
}

function ___DUMMY___Class1$infiniteLoop(): int {
  while (true) {
  }
  return 0;
}

sources.mains = [___DUMMY___Main$main]"#;

    assert_eq!(
      generics_preserved_expected,
      super::compile_sources_with_generics_preserved(heap, &sources).debug_print(heap)
    );
    assert_eq!(optimized_expected, super::compile_sources_to_hir(heap, &sources).debug_print(heap));
  }
}
