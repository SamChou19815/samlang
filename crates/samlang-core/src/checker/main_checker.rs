use super::{
  checker_utils::{
    contextual_type_meet, perform_fn_type_substitution, perform_type_substitution,
    solve_multiple_type_constrains, TypeConstraint, TypeConstraintSolution,
  },
  ssa_analysis::perform_ssa_analysis_on_module,
  typing_context::{GlobalTypingContext, LocalTypingContext, TypingContext},
};
use crate::{
  ast::{
    source::{
      expr::{self, ObjectPatternDestucturedName},
      ClassMemberDefinition, FunctionType, ISourceType, Id, IdType, InterfaceDeclarationCommon,
      Literal, Module, OptionallyAnnotatedId, PrimitiveTypeKind, Toplevel, Type, TypeParameter,
      TypeParameterSignature,
    },
    Reason,
  },
  checker::checker_utils::solve_type_constraints,
  common::{Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{collections::HashMap, ops::Deref, rc::Rc};

fn arguments_should_be_checked_without_hint(e: &expr::E) -> bool {
  match e {
    expr::E::Literal(_, _)
    | expr::E::Id(_, _)
    | expr::E::ClassFn(_)
    | expr::E::FieldAccess(_)
    | expr::E::MethodAccess(_)
    | expr::E::Unary(_)
    | expr::E::Binary(_) => true,
    expr::E::Call(_) => true, /* TODO: revisit after rust migration */
    expr::E::IfElse(expr::IfElse { common: _, condition: _, e1, e2 }) => {
      arguments_should_be_checked_without_hint(e1) && arguments_should_be_checked_without_hint(e2)
    }
    expr::E::Match(expr::Match { common: _, matched: _, cases }) => {
      for case in cases {
        if !arguments_should_be_checked_without_hint(&case.body) {
          return false;
        }
      }
      true
    }
    expr::E::Lambda(expr::Lambda { common: _, parameters, captured: _, body }) => {
      for param in parameters {
        if param.annotation.is_none() {
          return false;
        }
      }
      arguments_should_be_checked_without_hint(body)
    }
    expr::E::Block(expr::Block { common: _, statements: _, expression }) => {
      if let Some(final_expression) = expression {
        arguments_should_be_checked_without_hint(final_expression)
      } else {
        true
      }
    }
  }
}

fn solve_type_arguments(
  function_call_reason: &Reason,
  generic_function_type: &FunctionType,
  type_parameter_signatures: &Vec<TypeParameterSignature>,
  argument_types: &Vec<Type>,
  return_type_hint: Option<&Type>,
) -> FunctionType {
  let mut constraints = vec![];
  for (generic_type, concrete_type) in
    generic_function_type.argument_types.iter().zip(argument_types)
  {
    constraints.push(TypeConstraint { concrete_type, generic_type });
  }
  if let Some(return_hint) = return_type_hint {
    constraints.push(TypeConstraint {
      concrete_type: return_hint,
      generic_type: &generic_function_type.return_type,
    })
  }
  let mut partially_solved_substitution =
    solve_multiple_type_constrains(&constraints, type_parameter_signatures);
  for type_parameter in type_parameter_signatures {
    partially_solved_substitution
      .entry(type_parameter.name)
      // Fill in unknown for unsolved types.
      .or_insert_with(|| Rc::new(Type::Unknown(function_call_reason.clone())));
  }
  perform_fn_type_substitution(generic_function_type, &partially_solved_substitution)
}

struct FunctionCallTypeCheckingResult {
  solved_generic_type: FunctionType,
  solved_return_type: Type,
  solved_substitution: HashMap<PStr, Rc<Type>>,
  checked_arguments: Vec<expr::E>,
}

enum FieldOrMethodAccesss {
  Field(expr::FieldAccess),
  Method(expr::MethodAccess),
}

impl<'a> TypingContext<'a> {
  fn type_meet(&mut self, heap: &Heap, general: Option<&Type>, specific: &Type) -> Type {
    if let Some(g) = general {
      contextual_type_meet(g, specific, heap, self.error_set)
    } else {
      specific.clone()
    }
  }

  fn best_effort_unknown_type(
    &mut self,
    heap: &Heap,
    general: Option<&Type>,
    expression: &expr::E,
  ) -> Type {
    self.type_meet(heap, general, &Type::Unknown(Reason::new(expression.loc(), None)))
  }

  fn validate_type_arguments(
    &mut self,
    heap: &Heap,
    type_params: &Vec<TypeParameterSignature>,
    subst_map: &HashMap<PStr, Rc<Type>>,
  ) {
    for type_param in type_params {
      if let (Some(bound), Some(solved_type_argument)) =
        (&type_param.bound, subst_map.get(&type_param.name))
      {
        let substituted_bound =
          perform_type_substitution(&Type::Id(bound.deref().clone()), subst_map);
        if !solved_type_argument.is_the_same_type(&substituted_bound)
          && !self.is_subtype(solved_type_argument, &substituted_bound)
        {
          self.error_set.report_unexpected_subtype_error(
            solved_type_argument.get_reason().use_loc,
            substituted_bound.pretty_print(heap),
            solved_type_argument.pretty_print(heap),
          );
        }
      }
    }
  }

  fn check(&mut self, heap: &Heap, expression: expr::E, hint: Option<&Type>) -> expr::E {
    match expression {
      expr::E::Literal(common, literal) => self.check_literal(heap, common, literal, hint),
      expr::E::Id(common, id) => self.check_variable(heap, common, id, hint),
      expr::E::ClassFn(e) => self.check_class_function(heap, e, hint),
      expr::E::FieldAccess(e) => self.check_field_access(heap, e, hint),
      expr::E::MethodAccess(_) => panic!("Raw parsed expression does not contain MethodAccess!"),
      expr::E::Unary(e) => self.check_unary(heap, e, hint),
      expr::E::Call(e) => self.check_function_call(heap, e, hint),
      expr::E::Binary(e) => self.check_binary(heap, e, hint),
      expr::E::IfElse(e) => self.check_if_else(heap, e, hint),
      expr::E::Match(e) => self.check_match(heap, e, hint),
      expr::E::Lambda(e) => self.check_lambda(heap, e, hint),
      expr::E::Block(e) => self.check_block(heap, e, hint),
    }
  }

  fn check_literal(
    &mut self,
    heap: &Heap,
    common: expr::ExpressionCommon,
    literal: Literal,
    hint: Option<&Type>,
  ) -> expr::E {
    self.type_meet(heap, hint, &common.type_);
    expr::E::Literal(common, literal)
  }

  fn check_variable(
    &mut self,
    heap: &Heap,
    common: expr::ExpressionCommon,
    id: Id,
    hint: Option<&Type>,
  ) -> expr::E {
    let type_ = Rc::new(self.type_meet(heap, hint, &self.local_typing_context.read(&common.loc)));
    expr::E::Id(common.with_new_type(type_), id)
  }

  fn check_class_fn_with_unresolved_tparams(
    &mut self,
    heap: &Heap,
    expression: expr::ClassFunction,
    hint: Option<&Type>,
  ) -> (expr::ClassFunction, Vec<TypeParameterSignature>) {
    if let Some(class_function_type_information) = self.get_function_type(
      &expression.module_reference,
      &expression.class_name.name,
      &expression.fn_name.name,
      expression.common.loc,
    ) {
      if !expression.type_arguments.is_empty() {
        if expression.type_arguments.len() == class_function_type_information.type_parameters.len()
        {
          let mut subst_map = HashMap::new();
          for (tparam, targ) in
            class_function_type_information.type_parameters.iter().zip(&expression.type_arguments)
          {
            subst_map.insert(tparam.name, targ.clone());
          }
          self.validate_type_arguments(
            heap,
            &class_function_type_information.type_parameters,
            &subst_map,
          );
          let type_ = self.type_meet(
            heap,
            hint,
            &Type::Fn(perform_fn_type_substitution(
              &class_function_type_information.type_,
              &subst_map,
            )),
          );
          let partially_checked_expr = expr::ClassFunction {
            common: expression.common.with_new_type(Rc::new(type_)),
            type_arguments: expression.type_arguments,
            module_reference: expression.module_reference,
            class_name: expression.class_name,
            fn_name: expression.fn_name,
          };
          return (partially_checked_expr, vec![]);
        }
        self.error_set.report_arity_mismatch_error(
          expression.common.loc,
          "type arguments",
          class_function_type_information.type_parameters.len(),
          expression.type_arguments.len(),
        );
      } else if class_function_type_information.type_parameters.is_empty() {
        // No type parameter to solve
        let partially_checked_expr = expr::ClassFunction {
          common: expression.common.with_new_type(Rc::new(self.type_meet(
            heap,
            hint,
            &Type::Fn(class_function_type_information.type_),
          ))),
          type_arguments: expression.type_arguments,
          module_reference: expression.module_reference,
          class_name: expression.class_name,
          fn_name: expression.fn_name,
        };
        return (partially_checked_expr, vec![]);
      }
      // Now we know we have some type parameters that cannot be locally resolved.
      if let Some(hint) = hint {
        if let Type::Fn(fun_hint) = hint {
          if fun_hint.argument_types.len()
            == class_function_type_information.type_.argument_types.len()
          {
            // Hint matches the shape and can be useful.
            let TypeConstraintSolution {
              solved_generic_type,
              solved_substitution,
              solved_contextually_typed_concrete_type: _,
            } = solve_type_constraints(
              hint,
              &Type::Fn(class_function_type_information.type_.clone()),
              &class_function_type_information.type_parameters,
              heap,
              self.error_set,
            );
            let common = expression.common.with_new_type(solved_generic_type);
            let type_arguments = class_function_type_information
              .type_parameters
              .iter()
              .map(|it| {
                perform_type_substitution(
                  &Type::Id(IdType {
                    reason: Reason::dummy(),
                    module_reference: self.current_module_reference,
                    id: it.name,
                    type_arguments: vec![],
                  }),
                  &solved_substitution,
                )
              })
              .collect_vec();
            let partially_checked_expr = expr::ClassFunction {
              common,
              type_arguments,
              module_reference: expression.module_reference,
              class_name: expression.class_name,
              fn_name: expression.fn_name,
            };
            return (partially_checked_expr, vec![]);
          }
          self.error_set.report_arity_mismatch_error(
            expression.common.loc,
            "parameter",
            fun_hint.argument_types.len(),
            class_function_type_information.type_.argument_types.len(),
          );
        } else {
          self.error_set.report_unexpected_type_kind_error(
            expression.common.loc,
            hint.pretty_print(heap),
            "function".to_string(),
          );
        }
      }
      // When hint is bad or there is no hint, we need to give up and let context help us more.
      let partially_checked_expr = expr::ClassFunction {
        common: expression
          .common
          .with_new_type(Rc::new(Type::Fn(class_function_type_information.type_.clone()))),
        type_arguments: class_function_type_information
          .type_parameters
          .iter()
          .map(|it| {
            Rc::new(Type::Id(IdType {
              reason: Reason::dummy(),
              module_reference: self.current_module_reference,
              id: it.name,
              type_arguments: vec![],
            }))
          })
          .collect_vec(),
        module_reference: expression.module_reference,
        class_name: expression.class_name,
        fn_name: expression.fn_name,
      };
      for targ in &expression.type_arguments {
        self.validate_type_instantiation_strictly(heap, targ);
      }
      (partially_checked_expr, class_function_type_information.type_parameters.clone())
    } else {
      self.error_set.report_unresolved_name_error(
        expression.common.loc,
        format!(
          "{}.{}",
          expression.class_name.name.as_str(heap),
          expression.fn_name.name.as_str(heap)
        ),
      );
      let type_ = Rc::new(self.type_meet(
        heap,
        hint,
        &Type::Unknown(Reason::new(expression.common.loc, None)),
      ));
      (
        expr::ClassFunction {
          common: expression.common.with_new_type(type_),
          type_arguments: expression.type_arguments,
          module_reference: expression.module_reference,
          class_name: expression.class_name,
          fn_name: expression.fn_name,
        },
        vec![],
      )
    }
  }

  fn replace_undecided_tparam_with_unknown_and_update_type(
    &mut self,
    heap: &Heap,
    expression: expr::E,
    unresolved_type_parameters: Vec<TypeParameterSignature>,
    hint: Option<&Type>,
  ) -> expr::E {
    if !unresolved_type_parameters.is_empty() {
      self.error_set.report_insufficient_type_inference_context_error(expression.loc());
    }
    let mut subst_map = HashMap::new();
    for tparam in unresolved_type_parameters {
      subst_map
        .insert(tparam.name, Rc::new(self.best_effort_unknown_type(heap, None, &expression)));
    }
    let type_ = Rc::new(self.type_meet(
      heap,
      hint,
      &perform_type_substitution(&expression.type_(), &subst_map),
    ));
    match expression {
      expr::E::ClassFn(e) => expr::E::ClassFn(expr::ClassFunction {
        common: e.common.with_new_type(type_),
        type_arguments: e
          .type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &subst_map))
          .collect_vec(),
        module_reference: e.module_reference,
        class_name: e.class_name,
        fn_name: e.fn_name,
      }),
      expr::E::FieldAccess(e) => expr::E::FieldAccess(expr::FieldAccess {
        common: e.common.with_new_type(type_),
        type_arguments: e
          .type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &subst_map))
          .collect_vec(),
        object: e.object,
        field_name: e.field_name,
        field_order: e.field_order,
      }),
      expr::E::MethodAccess(e) => expr::E::MethodAccess(expr::MethodAccess {
        common: e.common.with_new_type(type_),
        type_arguments: e
          .type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &subst_map))
          .collect_vec(),
        object: e.object,
        method_name: e.method_name,
      }),
      _ => expression.mod_common(|c| c.with_new_type(type_)),
    }
  }

  fn check_class_function(
    &mut self,
    heap: &Heap,
    expression: expr::ClassFunction,
    hint: Option<&Type>,
  ) -> expr::E {
    let (partially_checked_expr, unsolved_type_parameters) =
      self.check_class_fn_with_unresolved_tparams(heap, expression, hint);
    self.replace_undecided_tparam_with_unknown_and_update_type(
      heap,
      expr::E::ClassFn(partially_checked_expr),
      unsolved_type_parameters,
      hint,
    )
  }

  fn check_member_with_unresolved_tparams(
    &mut self,
    heap: &Heap,
    expression: expr::FieldAccess,
    hint: Option<&Type>,
  ) -> (FieldOrMethodAccesss, Vec<TypeParameterSignature>) {
    let checked_expression = self.check(heap, *expression.object, None);
    let obj_type = match (*checked_expression.type_()).clone() {
      Type::Id(t) => t,
      _ => {
        self.error_set.report_unexpected_type_kind_error(
          checked_expression.loc(),
          "identifier".to_string(),
          checked_expression.type_().pretty_print(heap),
        );
        let unknown_type = Rc::new(self.type_meet(
          heap,
          hint,
          &Type::Unknown(Reason::new(expression.common.loc, None)),
        ));
        let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
          common: expression.common.with_new_type(unknown_type),
          type_arguments: expression.type_arguments,
          object: Box::new(checked_expression),
          field_name: expression.field_name,
          field_order: expression.field_order,
        });
        return (partially_checked_expr, vec![]);
      }
    };
    if let Some(method_type_info) = self.get_method_type(
      &obj_type.module_reference,
      &obj_type.id,
      &expression.field_name.name,
      obj_type.type_arguments.clone(),
      expression.common.loc,
    ) {
      // This is a valid method. We will now type check it as a method access
      for targ in &expression.type_arguments {
        self.validate_type_instantiation_strictly(heap, targ)
      }
      if !expression.type_arguments.is_empty() {
        if expression.type_arguments.len() == method_type_info.type_parameters.len() {
          let mut subst_map = HashMap::new();
          for (tparam, targ) in
            method_type_info.type_parameters.iter().zip(&expression.type_arguments)
          {
            subst_map.insert(tparam.name, targ.clone());
          }
          self.validate_type_arguments(heap, &method_type_info.type_parameters, &subst_map);
          let type_ = Rc::new(self.type_meet(
            heap,
            hint,
            &Type::Fn(perform_fn_type_substitution(&method_type_info.type_, &subst_map)),
          ));
          let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
            common: expression.common.with_new_type(type_),
            type_arguments: expression.type_arguments,
            object: Box::new(checked_expression),
            method_name: expression.field_name,
          });
          return (partially_checked_expr, vec![]);
        }
        self.error_set.report_arity_mismatch_error(
          expression.common.loc,
          "type arguments",
          method_type_info.type_parameters.len(),
          expression.type_arguments.len(),
        );
      }
      if method_type_info.type_parameters.is_empty() {
        // No type parameter to solve
        let type_ = Rc::new(self.type_meet(heap, hint, &Type::Fn(method_type_info.type_)));
        let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
          common: expression.common.with_new_type(type_),
          type_arguments: expression.type_arguments,
          object: Box::new(checked_expression),
          method_name: expression.field_name,
        });
        return (partially_checked_expr, vec![]);
      }
      if let Some(hint) = hint {
        if let Type::Fn(fun_hint) = hint {
          if fun_hint.argument_types.len() == method_type_info.type_.argument_types.len() {
            // Hint matches the shape and can be useful.
            let TypeConstraintSolution {
              solved_generic_type,
              solved_substitution,
              solved_contextually_typed_concrete_type: _,
            } = solve_type_constraints(
              hint,
              &Type::Fn(method_type_info.type_.clone()),
              &method_type_info.type_parameters,
              heap,
              self.error_set,
            );
            let common = expression.common.with_new_type(solved_generic_type);
            let type_arguments = method_type_info
              .type_parameters
              .iter()
              .map(|it| {
                perform_type_substitution(
                  &Type::Id(IdType {
                    reason: Reason::dummy(),
                    module_reference: self.current_module_reference,
                    id: it.name,
                    type_arguments: vec![],
                  }),
                  &solved_substitution,
                )
              })
              .collect_vec();
            let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
              common,
              type_arguments,
              object: Box::new(checked_expression),
              method_name: expression.field_name,
            });
            return (partially_checked_expr, vec![]);
          }
          self.error_set.report_arity_mismatch_error(
            expression.common.loc,
            "parameter",
            fun_hint.argument_types.len(),
            method_type_info.type_.argument_types.len(),
          );
        } else {
          self.error_set.report_unexpected_type_kind_error(
            expression.common.loc,
            hint.pretty_print(heap),
            "function".to_string(),
          );
        }
      }
      // When hint is bad or there is no hint, we need to give up and let context help us more.
      let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
        common: expression.common.with_new_type(Rc::new(Type::Fn(method_type_info.type_))),
        type_arguments: method_type_info
          .type_parameters
          .iter()
          .map(|it| {
            Rc::new(Type::Id(IdType {
              reason: Reason::dummy(),
              module_reference: self.current_module_reference,
              id: it.name,
              type_arguments: vec![],
            }))
          })
          .collect_vec(),
        object: Box::new(checked_expression),
        method_name: expression.field_name,
      });
      (partially_checked_expr, method_type_info.type_parameters.clone())
    } else {
      // Now it should be checked as field access.
      if !expression.type_arguments.is_empty() {
        self.error_set.report_arity_mismatch_error(
          expression.common.loc,
          "type arguments",
          0,
          expression.type_arguments.len(),
        );
      }
      let (field_names, field_mappings) = self.resolve_type_definition(&obj_type, true);
      if let Some(field_type) = field_mappings.get(&expression.field_name.name) {
        let type_ =
          Rc::new(self.type_meet(heap, hint, &field_type.type_.reposition(expression.common.loc)));
        if obj_type.id != self.current_class && !field_type.is_public {
          self.error_set.report_unresolved_name_error(
            expression.field_name.loc,
            expression.field_name.name.as_str(heap).to_string(),
          );
          let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
            common: expression.common.with_new_type(type_),
            type_arguments: expression.type_arguments,
            object: Box::new(checked_expression),
            field_name: expression.field_name,
            field_order: expression.field_order,
          });
          return (partially_checked_expr, vec![]);
        }
        let (order, _) =
          field_names.iter().find_position(|it| *it.deref() == expression.field_name.name).unwrap();
        let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
          common: expression.common.with_new_type(type_),
          type_arguments: expression.type_arguments,
          object: Box::new(checked_expression),
          field_name: expression.field_name,
          field_order: order as i32,
        });
        (partially_checked_expr, vec![])
      } else {
        self.error_set.report_unresolved_name_error(
          expression.field_name.loc,
          expression.field_name.name.as_str(heap).to_string(),
        );
        let unknown_type = Rc::new(self.type_meet(
          heap,
          hint,
          &Type::Unknown(Reason::new(expression.common.loc, None)),
        ));
        let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
          common: expression.common.with_new_type(Rc::new(self.type_meet(
            heap,
            hint,
            &unknown_type,
          ))),
          type_arguments: expression.type_arguments,
          object: Box::new(checked_expression),
          field_name: expression.field_name,
          field_order: expression.field_order,
        });
        (partially_checked_expr, vec![])
      }
    }
  }

  fn check_field_access(
    &mut self,
    heap: &Heap,
    expression: expr::FieldAccess,
    hint: Option<&Type>,
  ) -> expr::E {
    let (partially_checked_expr, unresolved_type_parameters) =
      self.check_member_with_unresolved_tparams(heap, expression, hint);
    match partially_checked_expr {
      FieldOrMethodAccesss::Field(f) => self.replace_undecided_tparam_with_unknown_and_update_type(
        heap,
        expr::E::FieldAccess(f),
        unresolved_type_parameters,
        hint,
      ),
      FieldOrMethodAccesss::Method(m) => self
        .replace_undecided_tparam_with_unknown_and_update_type(
          heap,
          expr::E::MethodAccess(m),
          unresolved_type_parameters,
          hint,
        ),
    }
  }

  fn check_unary(&mut self, heap: &Heap, expression: expr::Unary, hint: Option<&Type>) -> expr::E {
    // Type of unary expression can be decided at parse time.
    self.type_meet(heap, hint, &expression.common.type_);
    let hint = expression.common.type_.clone();
    expr::E::Unary(expr::Unary {
      common: expression.common,
      operator: expression.operator,
      argument: Box::new(self.check(heap, expression.argument.deref().clone(), Some(&hint))),
    })
  }

  fn check_function_call_aux(
    &mut self,
    heap: &Heap,
    generic_function_type: &FunctionType,
    type_parameters: &Vec<TypeParameterSignature>,
    function_call_reason: &Reason,
    function_arguments: Vec<expr::E>,
    return_type_hint: Option<&Type>,
  ) -> FunctionCallTypeCheckingResult {
    if generic_function_type.argument_types.len() != function_arguments.len() {
      self.error_set.report_arity_mismatch_error(
        function_call_reason.use_loc,
        "arguments",
        generic_function_type.argument_types.len(),
        function_arguments.len(),
      );
      return FunctionCallTypeCheckingResult {
        solved_generic_type: generic_function_type.clone(),
        solved_return_type: Type::Unknown(function_call_reason.clone()),
        solved_substitution: HashMap::new(),
        checked_arguments: function_arguments,
      };
    }
    // Phase 0: Initial Synthesis -> Vec<(Expr, checked)>
    let mut partially_checked_arguments = vec![];
    for arg in function_arguments {
      if arguments_should_be_checked_without_hint(&arg) {
        partially_checked_arguments.push((self.check(heap, arg, None), true));
      } else {
        partially_checked_arguments.push((arg, false));
      }
    }
    // Phase 1-n: Best effort inference through arguments that are already checked.
    let mut checked_argument_types = vec![];
    let mut checked_arguments = vec![];
    for (partially_checked_expr, _) in &partially_checked_arguments {
      checked_argument_types.push(partially_checked_expr.type_().clone());
    }
    for (i, (partially_checked_expr, checked)) in
      partially_checked_arguments.into_iter().enumerate()
    {
      let best_effort_instantiated_function_type = solve_type_arguments(
        function_call_reason,
        generic_function_type,
        type_parameters,
        &checked_argument_types.iter().map(|t| t.deref().clone()).collect_vec(),
        return_type_hint,
      );
      let hint = contextual_type_meet(
        &best_effort_instantiated_function_type.argument_types[i],
        &partially_checked_expr.type_(),
        heap,
        self.error_set,
      );
      if checked {
        checked_arguments.push(partially_checked_expr);
      } else {
        let fully_checked_expr = self.check(heap, partially_checked_expr, Some(&hint));
        checked_argument_types[i] = fully_checked_expr.type_().clone();
        checked_arguments.push(fully_checked_expr);
      }
    }
    // Phase n+1: Use fully checked arguments to infer remaining type parameters.
    let mut final_phase_arguments_constraints = vec![];
    for (generic_type, concrete_type) in
      generic_function_type.argument_types.iter().zip(&checked_argument_types)
    {
      final_phase_arguments_constraints.push(TypeConstraint { generic_type, concrete_type });
    }
    if let Some(return_hint) = return_type_hint {
      final_phase_arguments_constraints.push(TypeConstraint {
        concrete_type: return_hint,
        generic_type: &generic_function_type.return_type,
      })
    }
    let mut fully_solved_substitution =
      solve_multiple_type_constrains(&final_phase_arguments_constraints, type_parameters);
    let still_unresolved_type_parameters = type_parameters
      .iter()
      .filter(|it| !fully_solved_substitution.contains_key(&it.name))
      .collect_vec();
    if !still_unresolved_type_parameters.is_empty() {
      self.error_set.report_insufficient_type_inference_context_error(function_call_reason.use_loc);
    }
    for type_parameter in still_unresolved_type_parameters {
      fully_solved_substitution
        .insert(type_parameter.name, Rc::new(Type::Unknown(function_call_reason.clone())));
    }
    let fully_solved_generic_type =
      perform_fn_type_substitution(generic_function_type, &fully_solved_substitution);
    let fully_solved_concrete_return_type = contextual_type_meet(
      &return_type_hint.cloned().unwrap_or(Type::Unknown(function_call_reason.clone())),
      &fully_solved_generic_type.return_type.reposition(function_call_reason.use_loc),
      heap,
      self.error_set,
    );
    self.validate_type_arguments(heap, type_parameters, &fully_solved_substitution);

    FunctionCallTypeCheckingResult {
      solved_generic_type: fully_solved_generic_type,
      solved_return_type: fully_solved_concrete_return_type,
      solved_substitution: fully_solved_substitution,
      checked_arguments,
    }
  }

  fn check_function_call(
    &mut self,
    heap: &Heap,
    expression: expr::Call,
    hint: Option<&Type>,
  ) -> expr::E {
    let (partially_checked_callee, unresolved_tparams) = match *expression.callee {
      expr::E::ClassFn(class_fn) => {
        let (partially_checked_class_fn, unresolved_tparams) =
          self.check_class_fn_with_unresolved_tparams(heap, class_fn, None);
        (expr::E::ClassFn(partially_checked_class_fn), unresolved_tparams)
      }
      expr::E::FieldAccess(field_access) => {
        let (partially_checked_field_or_method_access, unresolved_tparams) =
          self.check_member_with_unresolved_tparams(heap, field_access, None);
        let partially_checked_expr = match partially_checked_field_or_method_access {
          FieldOrMethodAccesss::Field(f) => expr::E::FieldAccess(f),
          FieldOrMethodAccesss::Method(m) => expr::E::MethodAccess(m),
        };
        (partially_checked_expr, unresolved_tparams)
      }
      e => (self.check(heap, e, None), vec![]),
    };
    let partially_checked_callee_type = partially_checked_callee.type_();
    let callee_function_type = match &*partially_checked_callee_type {
      Type::Unknown(_) => {
        let loc = expression.common.loc;
        let type_ = Rc::new(self.type_meet(heap, hint, &Type::Unknown(Reason::new(loc, None))));
        return expr::E::Call(expr::Call {
          common: expression.common.with_new_type(type_),
          callee: Box::new(self.replace_undecided_tparam_with_unknown_and_update_type(
            heap,
            partially_checked_callee,
            unresolved_tparams,
            None,
          )),
          arguments: expression.arguments,
        });
      }
      Type::Fn(fn_type) => fn_type,
      t => {
        self.error_set.report_unexpected_type_kind_error(
          expression.common.loc,
          "function".to_string(),
          t.pretty_print(heap),
        );
        let loc = expression.common.loc;
        let type_ = Rc::new(self.type_meet(heap, hint, &Type::Unknown(Reason::new(loc, None))));
        return expr::E::Call(expr::Call {
          common: expression.common.with_new_type(type_),
          callee: Box::new(self.replace_undecided_tparam_with_unknown_and_update_type(
            heap,
            partially_checked_callee,
            unresolved_tparams,
            None,
          )),
          arguments: expression.arguments,
        });
      }
    };
    let FunctionCallTypeCheckingResult {
      solved_generic_type,
      solved_return_type,
      solved_substitution,
      checked_arguments,
    } = self.check_function_call_aux(
      heap,
      callee_function_type,
      &unresolved_tparams,
      &Reason::new(expression.common.loc, None),
      expression.arguments,
      hint,
    );
    let fully_resolved_checked_callee = partially_checked_callee
      .mod_common(|c| c.with_new_type(Rc::new(Type::Fn(solved_generic_type))));
    let callee_with_patched_targs = match fully_resolved_checked_callee {
      expr::E::ClassFn(class_fn) => expr::E::ClassFn(expr::ClassFunction {
        common: class_fn.common,
        type_arguments: class_fn
          .type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &solved_substitution))
          .collect_vec(),
        module_reference: class_fn.module_reference,
        class_name: class_fn.class_name,
        fn_name: class_fn.fn_name,
      }),
      expr::E::FieldAccess(f) => expr::E::FieldAccess(expr::FieldAccess {
        common: f.common,
        type_arguments: f.type_arguments,
        object: f.object,
        field_name: f.field_name,
        field_order: f.field_order,
      }),
      expr::E::MethodAccess(m) => expr::E::MethodAccess(expr::MethodAccess {
        common: m.common,
        type_arguments: m
          .type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &solved_substitution))
          .collect_vec(),
        object: m.object,
        method_name: m.method_name,
      }),
      e => e,
    };
    expr::E::Call(expr::Call {
      common: expression.common.with_new_type(Rc::new(solved_return_type)),
      callee: Box::new(callee_with_patched_targs),
      arguments: checked_arguments,
    })
  }

  fn check_binary(
    &mut self,
    heap: &Heap,
    expression: expr::Binary,
    hint: Option<&Type>,
  ) -> expr::E {
    let checked_expr = match expression.operator {
      expr::BinaryOperator::MUL
      | expr::BinaryOperator::DIV
      | expr::BinaryOperator::MOD
      | expr::BinaryOperator::PLUS
      | expr::BinaryOperator::MINUS
      | expr::BinaryOperator::LT
      | expr::BinaryOperator::LE
      | expr::BinaryOperator::GT
      | expr::BinaryOperator::GE => {
        let e1_type_hint =
          Type::Primitive(Reason::new(expression.e1.loc(), None), PrimitiveTypeKind::Int);
        let e2_type_hint =
          Type::Primitive(Reason::new(expression.e2.loc(), None), PrimitiveTypeKind::Int);
        expr::E::Binary(expr::Binary {
          common: expression.common,
          operator_preceding_comments: expression.operator_preceding_comments,
          operator: expression.operator,
          e1: Box::new(self.check(heap, *expression.e1, Some(&e1_type_hint))),
          e2: Box::new(self.check(heap, *expression.e2, Some(&e2_type_hint))),
        })
      }
      expr::BinaryOperator::AND | expr::BinaryOperator::OR => {
        let e1_type_hint =
          Type::Primitive(Reason::new(expression.e1.loc(), None), PrimitiveTypeKind::Bool);
        let e2_type_hint =
          Type::Primitive(Reason::new(expression.e2.loc(), None), PrimitiveTypeKind::Bool);
        expr::E::Binary(expr::Binary {
          common: expression.common,
          operator_preceding_comments: expression.operator_preceding_comments,
          operator: expression.operator,
          e1: Box::new(self.check(heap, *expression.e1, Some(&e1_type_hint))),
          e2: Box::new(self.check(heap, *expression.e2, Some(&e2_type_hint))),
        })
      }
      expr::BinaryOperator::CONCAT => {
        let e1_type_hint =
          Type::Primitive(Reason::new(expression.e1.loc(), None), PrimitiveTypeKind::String);
        let e2_type_hint =
          Type::Primitive(Reason::new(expression.e2.loc(), None), PrimitiveTypeKind::String);
        expr::E::Binary(expr::Binary {
          common: expression.common,
          operator_preceding_comments: expression.operator_preceding_comments,
          operator: expression.operator,
          e1: Box::new(self.check(heap, *expression.e1, Some(&e1_type_hint))),
          e2: Box::new(self.check(heap, *expression.e2, Some(&e2_type_hint))),
        })
      }
      expr::BinaryOperator::EQ | expr::BinaryOperator::NE => {
        let e1 = Box::new(self.check(heap, *expression.e1, None));
        let e2 = Box::new(self.check(heap, *expression.e2, Some(&e1.type_())));
        expr::E::Binary(expr::Binary {
          common: expression.common,
          operator_preceding_comments: expression.operator_preceding_comments,
          operator: expression.operator,
          e1,
          e2,
        })
      }
    };
    self.type_meet(heap, hint, &checked_expr.type_());
    checked_expr
  }

  fn check_if_else(
    &mut self,
    heap: &Heap,
    expression: expr::IfElse,
    hint: Option<&Type>,
  ) -> expr::E {
    let condition = Box::new(self.check(heap, *expression.condition, None));
    let e1 = Box::new(self.check(heap, *expression.e1, hint));
    let e2 = Box::new(self.check(heap, *expression.e2, Some(&e1.type_())));
    let type_ = e2.type_().reposition(expression.common.loc);
    expr::E::IfElse(expr::IfElse {
      common: expression.common.with_new_type(Rc::new(type_)),
      condition,
      e1,
      e2,
    })
  }

  fn check_match(&mut self, heap: &Heap, expression: expr::Match, hint: Option<&Type>) -> expr::E {
    let checked_matched = self.check(heap, *expression.matched, None);
    let checked_matched_type = checked_matched.type_();
    let checked_matched_id_type = match &*checked_matched_type {
      Type::Id(t) => t,
      t => {
        self.error_set.report_unexpected_type_kind_error(
          checked_matched.loc(),
          "identifier".to_string(),
          t.pretty_print(heap),
        );
        let type_ =
          self.type_meet(heap, hint, &Type::Unknown(Reason::new(expression.common.loc, None)));
        return expr::E::Match(expr::Match {
          common: expression.common.with_new_type(Rc::new(type_)),
          matched: Box::new(checked_matched),
          cases: expression.cases,
        });
      }
    };
    let (variant_names, variant_mappings) =
      self.resolve_type_definition(checked_matched_id_type, false);
    let mut unused_mappings = variant_mappings;
    let mut checked_cases = vec![];
    let mut matching_list_types = vec![];
    for expr::VariantPatternToExpression { loc, tag, tag_order: _, data_variable, body } in
      expression.cases
    {
      let mapping_data_type = match unused_mappings.remove(&tag.name) {
        Some(field_type) => field_type.type_,
        None => {
          self.error_set.report_unresolved_name_error(tag.loc, tag.name.as_str(heap).to_string());
          continue;
        }
      };
      let (checked_body, checked_data_variable) = if let Some((data_variable, _)) = data_variable {
        self.local_typing_context.write(data_variable.loc, mapping_data_type.clone());
        (self.check(heap, *body, hint), Some((data_variable.clone(), mapping_data_type)))
      } else {
        (self.check(heap, *body, hint), None)
      };
      let (tag_order, _) = variant_names.iter().find_position(|n| tag.name.eq(n)).unwrap();
      matching_list_types.push(checked_body.type_());
      checked_cases.push(expr::VariantPatternToExpression {
        loc,
        tag,
        tag_order,
        data_variable: checked_data_variable,
        body: Box::new(checked_body),
      });
    }
    if !unused_mappings.is_empty() {
      let missing_tags =
        unused_mappings.keys().map(|k| k.as_str(heap).to_string()).sorted().collect_vec();
      self.error_set.report_non_exhausive_match_error(expression.common.loc, missing_tags);
    }
    let final_type = matching_list_types.iter().fold(
      Rc::new(self.type_meet(heap, hint, &Type::Unknown(Reason::new(expression.common.loc, None)))),
      |general, specific| Rc::new(self.type_meet(heap, Some(&general), specific)),
    );
    expr::E::Match(expr::Match {
      common: expression.common.with_new_type(final_type),
      matched: Box::new(checked_matched),
      cases: checked_cases,
    })
  }

  fn infer_lambda_parameter_types(
    &mut self,
    heap: &Heap,
    expression: &expr::Lambda,
    hint: Option<&Type>,
  ) -> Vec<Rc<Type>> {
    if let Some(hint) = hint {
      if let Type::Fn(fun_hint) = hint {
        if fun_hint.argument_types.len() == expression.parameters.len() {
          return fun_hint
            .argument_types
            .iter()
            .zip(&expression.parameters)
            .map(|(parameter_hint, parameter)| {
              let annot = if let Some(annot) = &parameter.annotation {
                annot.clone()
              } else {
                Rc::new(Type::Unknown(Reason::new(parameter.name.loc, None)))
              };
              let type_ = Rc::new(self.type_meet(heap, Some(parameter_hint), &annot));
              self.local_typing_context.write(parameter.name.loc, type_.clone());
              type_
            })
            .collect_vec();
        } else {
          self.error_set.report_arity_mismatch_error(
            expression.common.loc,
            "function arguments",
            fun_hint.argument_types.len(),
            expression.parameters.len(),
          )
        }
      } else {
        self.error_set.report_unexpected_type_error(
          expression.common.loc,
          hint.pretty_print(heap),
          expression.common.type_.pretty_print(heap),
        );
      }
    }
    let mut types_ = vec![];
    for OptionallyAnnotatedId { name, annotation } in &expression.parameters {
      let type_ = if let Some(annot) = annotation {
        annot.clone()
      } else {
        self.error_set.report_insufficient_type_inference_context_error(name.loc);
        Rc::new(Type::Unknown(Reason::new(name.loc, None)))
      };
      self.validate_type_instantiation_strictly(heap, &type_);
      self.local_typing_context.write(name.loc, type_.clone());
      types_.push(type_);
    }
    types_
  }

  fn check_lambda(
    &mut self,
    heap: &Heap,
    expression: expr::Lambda,
    hint: Option<&Type>,
  ) -> expr::E {
    let argument_types = self.infer_lambda_parameter_types(heap, &expression, hint);
    let body = self.check(
      heap,
      *expression.body,
      if let Some(Type::Fn(fun_hint)) = hint { Some(&fun_hint.return_type) } else { None },
    );
    let captured = self.local_typing_context.get_captured(heap, &expression.common.loc);
    let type_ = Type::Fn(FunctionType {
      reason: Reason::new(expression.common.loc, None),
      argument_types,
      return_type: body.type_(),
    });
    expr::E::Lambda(expr::Lambda {
      common: expression.common.with_new_type(Rc::new(type_)),
      parameters: expression.parameters,
      captured,
      body: Box::new(body),
    })
  }

  fn check_statement(
    &mut self,
    heap: &Heap,
    statement: expr::DeclarationStatement,
  ) -> expr::DeclarationStatement {
    let expr::DeclarationStatement {
      loc,
      associated_comments,
      pattern,
      annotation,
      assigned_expression,
    } = statement;
    let hint = if let Some(annot) = &annotation {
      self.validate_type_instantiation_strictly(heap, annot);
      Some(annot.deref())
    } else {
      None
    };
    let checked_assigned_expr = self.check(heap, *assigned_expression, hint);
    let checked_assigned_expr_type = checked_assigned_expr.type_();
    let checked_pattern = match pattern {
      expr::Pattern::Object(pattern_loc, destructed_names) => {
        let id_type = match &*checked_assigned_expr_type {
          Type::Id(t) => t,
          t => {
            self.error_set.report_unexpected_type_kind_error(
              checked_assigned_expr.loc(),
              "identifier".to_string(),
              t.pretty_print(heap),
            );
            return expr::DeclarationStatement {
              loc,
              associated_comments,
              pattern: expr::Pattern::Object(pattern_loc, destructed_names),
              annotation,
              assigned_expression: Box::new(checked_assigned_expr),
            };
          }
        };
        let (field_names, field_mappings) = self.resolve_type_definition(id_type, true);
        let mut field_order_mapping = HashMap::new();
        for (i, name) in field_names.into_iter().enumerate() {
          field_order_mapping.insert(name, i);
        }
        let mut checked_destructured_names = vec![];
        for ObjectPatternDestucturedName { loc, field_order, field_name, alias, type_ } in
          destructed_names
        {
          if let Some(field_information) = field_mappings.get(&field_name.name) {
            if id_type.id.eq(&self.current_class) || field_information.is_public {
              let write_loc = if let Some(alias) = &alias { alias.loc } else { field_name.loc };
              self.local_typing_context.write(write_loc, field_information.type_.clone());
              let field_order = field_order_mapping.get(&field_name.name).unwrap();
              checked_destructured_names.push(ObjectPatternDestucturedName {
                loc,
                field_order: *field_order,
                field_name,
                alias,
                type_,
              });
              continue;
            }
          }
          self
            .error_set
            .report_unresolved_name_error(field_name.loc, field_name.name.as_str(heap).to_string());
          checked_destructured_names.push(ObjectPatternDestucturedName {
            loc,
            field_order,
            field_name,
            alias,
            type_,
          });
        }
        expr::Pattern::Object(pattern_loc, checked_destructured_names)
      }
      expr::Pattern::Id(loc, name) => {
        self.local_typing_context.write(loc, checked_assigned_expr_type);
        expr::Pattern::Id(loc, name)
      }
      expr::Pattern::Wildcard(loc) => expr::Pattern::Wildcard(loc),
    };
    expr::DeclarationStatement {
      loc,
      associated_comments,
      pattern: checked_pattern,
      annotation,
      assigned_expression: Box::new(checked_assigned_expr),
    }
  }

  fn check_block(&mut self, heap: &Heap, expression: expr::Block, hint: Option<&Type>) -> expr::E {
    if expression.expression.is_none() {
      self.type_meet(
        heap,
        hint,
        &Type::Primitive(Reason::new(expression.common.loc, None), PrimitiveTypeKind::Unit),
      );
    }
    let statements =
      expression.statements.into_iter().map(|it| self.check_statement(heap, it)).collect_vec();
    let checked_final_expr = expression.expression.map(|e| Box::new(self.check(heap, *e, hint)));
    let type_ = if let Some(e) = &checked_final_expr {
      e.type_()
    } else {
      Rc::new(Type::Primitive(Reason::new(expression.common.loc, None), PrimitiveTypeKind::Unit))
    };
    expr::E::Block(expr::Block {
      common: expression.common.with_new_type(type_),
      statements,
      expression: checked_final_expr,
    })
  }
}

pub(super) fn type_check_expression(
  cx: &mut TypingContext,
  heap: &Heap,
  expression: expr::E,
  hint: Option<&Type>,
) -> expr::E {
  cx.check(heap, expression, hint)
}

fn type_params_to_type_params_sig(
  type_parameters: &[TypeParameter],
) -> Vec<TypeParameterSignature> {
  type_parameters
    .iter()
    .map(|it| TypeParameterSignature { name: it.name.name, bound: it.bound.clone() })
    .collect_vec()
}

fn validate_signature_types(
  toplevel: &Toplevel,
  global_cx: &GlobalTypingContext,
  local_cx: &mut LocalTypingContext,
  module_reference: ModuleReference,
  heap: &Heap,
  error_set: &mut ErrorSet,
) {
  let mut cx = TypingContext::new(
    global_cx,
    local_cx,
    error_set,
    module_reference,
    toplevel.name().name,
    type_params_to_type_params_sig(toplevel.type_parameters()),
  );

  for tparam in toplevel.type_parameters() {
    if let Some(bound) = &tparam.bound {
      cx.validate_type_instantiation_allow_abstract_types(heap, &Type::Id(bound.deref().clone()));
    }
  }
  for node in toplevel.extends_or_implements_nodes() {
    cx.validate_type_instantiation_allow_abstract_types(heap, &Type::Id(node.deref().clone()));
  }
  if let Some(type_definition) = toplevel.type_definition() {
    for field_type in type_definition.mappings.values() {
      cx.validate_type_instantiation_strictly(heap, &field_type.type_);
    }
  }
  for member in toplevel.members_iter() {
    let tparam_sigs = if member.is_method {
      let mut sigs = type_params_to_type_params_sig(toplevel.type_parameters());
      sigs.append(&mut type_params_to_type_params_sig(&member.type_parameters));
      sigs
    } else {
      type_params_to_type_params_sig(&member.type_parameters)
    };
    let mut member_cx = TypingContext::new(
      global_cx,
      local_cx,
      error_set,
      module_reference,
      toplevel.name().name,
      tparam_sigs,
    );
    for tparam in member.type_parameters.iter() {
      if let Some(bound) = &tparam.bound {
        member_cx
          .validate_type_instantiation_allow_abstract_types(heap, &Type::Id(bound.deref().clone()));
      }
    }
    member_cx.validate_type_instantiation_strictly(heap, &Type::Fn(member.type_.clone()));
  }
}

pub(super) fn type_check_module(
  module_reference: ModuleReference,
  module: Module,
  global_cx: &GlobalTypingContext,
  heap: &Heap,
  error_set: &mut ErrorSet,
) -> Module {
  let mut local_cx =
    LocalTypingContext::new(perform_ssa_analysis_on_module(&module, heap, error_set));

  for toplevel in &module.toplevels {
    validate_signature_types(toplevel, global_cx, &mut local_cx, module_reference, heap, error_set);
    if let Toplevel::Class(c) = toplevel {
      let type_ = Type::Id(IdType {
        reason: Reason::new(c.loc, None),
        module_reference,
        id: c.name.name,
        type_arguments: c
          .type_parameters
          .iter()
          .map(|it| {
            Rc::new(Type::Id(IdType {
              reason: Reason::new(it.loc, Some(it.loc)),
              module_reference,
              id: it.name.name,
              type_arguments: vec![],
            }))
          })
          .collect_vec(),
      });
      local_cx.write(c.loc, Rc::new(type_));
    }
    for member in toplevel.members_iter() {
      for param in member.parameters.iter() {
        local_cx.write(param.name.loc, param.annotation.clone());
      }
    }
  }

  let mut checked_toplevels = vec![];
  for toplevel in module.toplevels {
    let checked = match toplevel {
      Toplevel::Interface(i) => Toplevel::Interface(i),
      Toplevel::Class(c) => {
        let mut checked_members = vec![];
        for member in c.members {
          let tparam_sigs = if member.decl.is_method {
            let mut sigs = type_params_to_type_params_sig(&c.type_parameters);
            sigs.append(&mut type_params_to_type_params_sig(&member.decl.type_parameters));
            sigs
          } else {
            type_params_to_type_params_sig(&member.decl.type_parameters)
          };
          let mut cx = TypingContext::new(
            global_cx,
            &mut local_cx,
            error_set,
            module_reference,
            c.name.name,
            tparam_sigs,
          );
          let body_type_hint = member.decl.type_.return_type.clone();
          checked_members.push(ClassMemberDefinition {
            decl: member.decl,
            body: type_check_expression(&mut cx, heap, member.body, Some(&body_type_hint)),
          });
        }
        Toplevel::Class(InterfaceDeclarationCommon {
          loc: c.loc,
          associated_comments: c.associated_comments,
          name: c.name,
          type_parameters: c.type_parameters,
          extends_or_implements_nodes: c.extends_or_implements_nodes,
          type_definition: c.type_definition,
          members: checked_members,
        })
      }
    };
    checked_toplevels.push(checked);
  }

  Module {
    comment_store: module.comment_store,
    imports: module.imports,
    toplevels: checked_toplevels,
  }
}
