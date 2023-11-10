use super::{
  global_signature,
  pattern_matching::{self, AbstractPatternNode},
  ssa_analysis::perform_ssa_analysis_on_module,
  type_::{
    FunctionType, GlobalSignature, ISourceType, MemberSignature, NominalType, PrimitiveTypeKind,
    Type, TypeParameterSignature,
  },
  type_system,
  typing_context::{LocalTypingContext, TypingContext},
};
use itertools::Itertools;
use samlang_ast::{
  source::{
    expr, pattern, ClassMemberDeclaration, ClassMemberDefinition, Id, InterfaceDeclarationCommon,
    Literal, Module, OptionallyAnnotatedId, Toplevel, TypeDefinition,
  },
  Description, Location, Reason,
};
use samlang_errors::{ErrorSet, StackableError};
use samlang_heap::{ModuleReference, PStr};
use std::{
  collections::{BTreeSet, HashMap},
  ops::Deref,
  rc::Rc,
};

mod type_hint {
  use super::super::type_::{FunctionType, Type};
  use super::super::type_system;

  #[derive(Clone, Copy)]
  pub(super) struct Hint<'a>(Option<&'a Type>);

  pub(super) const MISSING: Hint<'static> = Hint(None);

  pub(super) fn available(type_: &Type) -> Hint {
    Hint(Some(type_))
  }

  pub(super) fn from_option(optional_type: Option<&Type>) -> Hint<'_> {
    Hint(optional_type)
  }

  impl<'a> Hint<'a> {
    pub(super) fn get_valid_hint(&self) -> Option<&Type> {
      self.0.filter(|t| !type_system::contains_placeholder(t))
    }

    pub(super) fn transform_to_nth_param(&'a self, n: usize) -> Hint<'a> {
      match &self.0 {
        Some(Type::Fn(FunctionType { argument_types, .. })) if n < argument_types.len() => {
          available(&argument_types[n])
        }
        _ => MISSING,
      }
    }

    pub(super) fn transform_to_return_type(&'a self) -> Hint<'a> {
      match &self.0 {
        Some(Type::Fn(FunctionType { return_type, .. })) => available(return_type),
        _ => MISSING,
      }
    }
  }

  #[cfg(test)]
  mod tests {
    #[test]
    fn boilterplate() {
      super::MISSING.clone().get_valid_hint();
    }
  }
}

fn mod_type(mut expression: expr::E<Rc<Type>>, new_type: Rc<Type>) -> expr::E<Rc<Type>> {
  expression.common_mut().type_ = new_type;
  expression
}

fn arguments_should_be_checked_without_hint(e: &expr::E<()>) -> bool {
  match e {
    expr::E::Literal(_, _)
    | expr::E::LocalId(_, _)
    | expr::E::ClassId(_, _, _)
    | expr::E::Tuple(_, _)
    | expr::E::FieldAccess(_)
    | expr::E::MethodAccess(_)
    | expr::E::Unary(_)
    | expr::E::Binary(_) => true,
    expr::E::Call(_) => false,
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
  cx: &mut TypingContext,
  function_call_reason: &Reason,
  generic_function_type: &FunctionType,
  type_parameter_signatures: &Vec<TypeParameterSignature>,
  argument_types: &Vec<Type>,
  valid_return_type_hint: Option<&Type>,
) -> FunctionType {
  let mut constraints = vec![];
  for (generic_type, concrete_type) in
    generic_function_type.argument_types.iter().zip(argument_types)
  {
    constraints.push(type_system::TypeConstraint { concrete_type, generic_type });
  }
  if let Some(return_hint) = valid_return_type_hint {
    constraints.push(type_system::TypeConstraint {
      concrete_type: return_hint,
      generic_type: &generic_function_type.return_type,
    })
  }
  let mut partially_solved_substitution =
    type_system::solve_multiple_type_constrains(&constraints, type_parameter_signatures);
  for type_parameter in type_parameter_signatures {
    partially_solved_substitution
      .entry(type_parameter.name)
      // Fill in unknown for unsolved types.
      .or_insert_with(|| Rc::new(cx.mk_placeholder_type(*function_call_reason)));
  }
  type_system::subst_fn_type(generic_function_type, &partially_solved_substitution)
}

struct FunctionCallTypeCheckingResult {
  solved_generic_type: FunctionType,
  solved_return_type: Type,
  solved_substitution: HashMap<PStr, Rc<Type>>,
  checked_arguments: Vec<expr::E<Rc<Type>>>,
}

enum FieldOrMethodAccesss {
  Field(expr::FieldAccess<Rc<Type>>),
  Method(expr::MethodAccess<Rc<Type>>),
}

enum MaybeCheckedExpression<'a> {
  Checked(expr::E<Rc<Type>>),
  Unchecked(&'a expr::E<()>, Rc<Type>),
}

fn validate_type_arguments(
  cx: &mut TypingContext,
  type_params: &Vec<TypeParameterSignature>,
  subst_map: &HashMap<PStr, Rc<Type>>,
) {
  for type_param in type_params {
    if let (Some(bound), Some(solved_type_argument)) =
      (&type_param.bound, subst_map.get(&type_param.name))
    {
      let substituted_bound = Type::Nominal(type_system::subst_nominal_type(bound, subst_map));
      if !solved_type_argument.is_the_same_type(&substituted_bound)
        && !cx.is_subtype(solved_type_argument, &substituted_bound)
      {
        cx.error_set.report_incompatible_subtype_error(
          solved_type_argument.get_reason().use_loc,
          solved_type_argument.to_description(),
          substituted_bound.to_description(),
        );
      }
    }
  }
}

fn assignability_check(cx: &mut TypingContext, use_loc: Location, lower: &Type, upper: &Type) {
  if let Some(e) = type_system::assignability_check(lower, upper) {
    cx.error_set.report_stackable_error(use_loc, e);
  }
}

fn type_check_expression(
  cx: &mut TypingContext,
  expression: &expr::E<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  match expression {
    expr::E::Literal(common, literal) => check_literal(common, literal),
    expr::E::LocalId(common, id) => check_local_variable(cx, common, id),
    expr::E::ClassId(common, mod_ref, id) => check_class_id(cx, common, *mod_ref, id),
    expr::E::Tuple(common, expressions) => check_tuple(cx, common, expressions),
    expr::E::FieldAccess(e) => check_field_access(cx, e, hint),
    expr::E::MethodAccess(_) => panic!("Raw parsed expression does not contain MethodAccess!"),
    expr::E::Unary(e) => check_unary(cx, e),
    expr::E::Call(e) => check_function_call(cx, e, hint),
    expr::E::Binary(e) => check_binary(cx, e),
    expr::E::IfElse(e) => check_if_else(cx, e, hint),
    expr::E::Match(e) => check_match(cx, e, hint),
    expr::E::Lambda(e) => check_lambda(cx, e, hint),
    expr::E::Block(e) => check_block(cx, e, hint),
  }
}

#[cfg(test)]
pub(super) fn type_check_expression_for_tests(
  cx: &mut TypingContext,
  expression: &expr::E<()>,
  hint: Option<&Type>,
) -> expr::E<Rc<Type>> {
  type_check_expression(cx, expression, type_hint::from_option(hint))
}

fn check_literal(common: &expr::ExpressionCommon<()>, literal: &Literal) -> expr::E<Rc<Type>> {
  let reason = Reason::new(common.loc, Some(common.loc));
  let type_ = match &literal {
    Literal::Bool(_) => Rc::new(Type::Primitive(reason, PrimitiveTypeKind::Bool)),
    Literal::Int(_) => Rc::new(Type::Primitive(reason, PrimitiveTypeKind::Int)),
    Literal::String(_) => Rc::new(Type::Nominal(NominalType {
      reason,
      is_class_statics: false,
      module_reference: ModuleReference::ROOT,
      id: PStr::STR_TYPE,
      type_arguments: vec![],
    })),
  };
  expr::E::Literal(common.with_new_type(type_), *literal)
}

fn check_local_variable(
  cx: &mut TypingContext,
  common: &expr::ExpressionCommon<()>,
  id: &Id,
) -> expr::E<Rc<Type>> {
  let type_ = Rc::new(cx.local_typing_context.read(&common.loc));
  expr::E::LocalId(common.with_new_type(type_), *id)
}

fn check_class_id(
  cx: &mut TypingContext,
  common: &expr::ExpressionCommon<()>,
  module_reference: ModuleReference,
  id: &Id,
) -> expr::E<Rc<Type>> {
  let reason = Reason::new(common.loc, Some(common.loc));
  if cx.class_exists(module_reference, id.name) {
    let type_ = Rc::new(Type::Nominal(NominalType {
      reason,
      is_class_statics: true,
      module_reference,
      id: id.name,
      type_arguments: vec![],
    }));
    expr::E::ClassId(common.with_new_type(type_), module_reference, *id)
  } else {
    cx.error_set.report_cannot_resolve_class_error(common.loc, module_reference, id.name);
    expr::E::ClassId(common.with_new_type(Rc::new(Type::Any(reason, false))), module_reference, *id)
  }
}

fn check_tuple(
  cx: &mut TypingContext,
  common: &expr::ExpressionCommon<()>,
  expressions: &[expr::E<()>],
) -> expr::E<Rc<Type>> {
  let mut type_arguments = Vec::with_capacity(expressions.len());
  let mut checked_expressions = Vec::with_capacity(expressions.len());
  for e in expressions {
    let checked = type_check_expression(cx, e, type_hint::MISSING);
    type_arguments.push(checked.type_().clone());
    checked_expressions.push(checked);
  }
  let id = match expressions.len() {
    2 => PStr::PAIR,
    3 => PStr::TRIPLE,
    4 => PStr::TUPLE_4,
    5 => PStr::TUPLE_5,
    6 => PStr::TUPLE_6,
    7 => PStr::TUPLE_7,
    8 => PStr::TUPLE_8,
    9 => PStr::TUPLE_9,
    10 => PStr::TUPLE_10,
    11 => PStr::TUPLE_11,
    12 => PStr::TUPLE_12,
    13 => PStr::TUPLE_13,
    14 => PStr::TUPLE_14,
    15 => PStr::TUPLE_15,
    16 => PStr::TUPLE_16,
    _ => panic!("Invalid tuple length"),
  };
  let type_ = Rc::new(Type::Nominal(NominalType {
    reason: Reason::new(common.loc, None),
    is_class_statics: false,
    module_reference: ModuleReference::STD_TUPLES,
    id,
    type_arguments,
  }));
  expr::E::Tuple(common.with_new_type(type_), checked_expressions)
}

fn replace_undecided_tparam_with_unknown_and_update_type(
  cx: &mut TypingContext,
  expression: expr::E<Rc<Type>>,
  unresolved_type_parameters: Vec<TypeParameterSignature>,
) -> expr::E<Rc<Type>> {
  let mut subst_map = HashMap::new();
  for tparam in unresolved_type_parameters {
    let reason = Reason::new(expression.loc(), None);
    let t = cx.mk_underconstrained_any_type(reason);
    subst_map.insert(tparam.name, Rc::new(t));
  }

  let type_ = type_system::subst_type(expression.type_(), &subst_map);
  match expression {
    expr::E::FieldAccess(e) => {
      debug_assert!(e.inferred_type_arguments.is_empty());
      expr::E::FieldAccess(expr::FieldAccess {
        common: e.common.with_new_type(type_),
        explicit_type_arguments: e.explicit_type_arguments,
        inferred_type_arguments: vec![],
        object: e.object,
        field_name: e.field_name,
        field_order: e.field_order,
      })
    }
    expr::E::MethodAccess(e) => expr::E::MethodAccess(expr::MethodAccess {
      common: e.common.with_new_type(type_),
      explicit_type_arguments: e.explicit_type_arguments,
      inferred_type_arguments: e
        .inferred_type_arguments
        .iter()
        .map(|it| type_system::subst_type(it, &subst_map))
        .collect_vec(),
      object: e.object,
      method_name: e.method_name,
    }),
    _ => mod_type(expression, type_),
  }
}

fn check_member_with_unresolved_tparams(
  cx: &mut TypingContext,
  expression: &expr::FieldAccess<()>,
  hint: type_hint::Hint,
) -> (FieldOrMethodAccesss, Vec<TypeParameterSignature>) {
  let checked_expression = type_check_expression(cx, &expression.object, type_hint::MISSING);
  let obj_type = match cx.nominal_type_upper_bound(checked_expression.type_()) {
    Some(t) => t,
    None => {
      if checked_expression.type_().as_any().is_none() {
        cx.error_set.report_incompatible_type_kind_error(
          checked_expression.loc(),
          checked_expression.type_().to_description(),
          Description::GeneralNominalType,
        );
      }
      let any_type = Rc::new(Type::Any(Reason::new(expression.common.loc, None), false));
      let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
        common: expression.common.with_new_type(any_type),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments: vec![],
        object: Box::new(checked_expression),
        field_name: expression.field_name,
        field_order: expression.field_order,
      });
      return (partially_checked_expr, vec![]);
    }
  };
  let class_id = obj_type.id;
  if let Some(method_type_info) =
    cx.get_method_type(obj_type, expression.field_name.name, expression.common.loc)
  {
    // This is a valid method. We will now type check it as a method access
    for targ in &expression.explicit_type_arguments {
      cx.validate_type_instantiation_strictly(&Type::from_annotation(targ))
    }
    if !expression.explicit_type_arguments.is_empty() {
      if expression.explicit_type_arguments.len() == method_type_info.type_parameters.len() {
        let mut subst_map = HashMap::new();
        for (tparam, targ) in
          method_type_info.type_parameters.iter().zip(&expression.explicit_type_arguments)
        {
          subst_map.insert(tparam.name, Rc::new(Type::from_annotation(targ)));
        }
        validate_type_arguments(cx, &method_type_info.type_parameters, &subst_map);
        let type_ =
          Rc::new(Type::Fn(type_system::subst_fn_type(&method_type_info.type_, &subst_map)));
        let inferred_type_arguments = expression
          .explicit_type_arguments
          .iter()
          .map(|a| Rc::new(Type::from_annotation(a)))
          .collect_vec();
        let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
          common: expression.common.with_new_type(type_),
          explicit_type_arguments: expression.explicit_type_arguments.clone(),
          inferred_type_arguments,
          object: Box::new(checked_expression),
          method_name: expression.field_name,
        });
        return (partially_checked_expr, vec![]);
      }
      let mut error = StackableError::new();
      error.add_type_args_arity_error(
        expression.explicit_type_arguments.len(),
        method_type_info.type_parameters.len(),
      );
      cx.error_set.report_stackable_error(expression.common.loc, error);
    }
    if method_type_info.type_parameters.is_empty() {
      // No type parameter to solve
      let type_ = Rc::new(Type::Fn(method_type_info.type_));
      let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
        common: expression.common.with_new_type(type_),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments: vec![],
        object: Box::new(checked_expression),
        method_name: expression.field_name,
      });
      return (partially_checked_expr, vec![]);
    }
    if let Some(hint) = hint.get_valid_hint() {
      if let Type::Fn(fun_hint) = hint {
        if fun_hint.argument_types.len() == method_type_info.type_.argument_types.len() {
          // Hint matches the shape and can be useful.
          let type_system::TypeConstraintSolution { solved_generic_type, solved_substitution } =
            type_system::solve_type_constraints(
              hint,
              &Type::Fn(method_type_info.type_.clone()),
              &method_type_info.type_parameters,
              cx.error_set,
            );
          let common = expression.common.with_new_type(solved_generic_type);
          let inferred_type_arguments = method_type_info
            .type_parameters
            .iter()
            .map(|it| {
              type_system::subst_type(
                &Type::Generic(Reason::dummy(), it.name),
                &solved_substitution,
              )
            })
            .collect_vec();
          let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
            common,
            explicit_type_arguments: expression.explicit_type_arguments.clone(),
            inferred_type_arguments,
            object: Box::new(checked_expression),
            method_name: expression.field_name,
          });
          return (partially_checked_expr, vec![]);
        }
      }
    }
    // When hint is bad or there is no hint, we need to give up and let context help us more.
    let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
      common: expression.common.with_new_type(Rc::new(Type::Fn(method_type_info.type_))),
      explicit_type_arguments: expression.explicit_type_arguments.clone(),
      inferred_type_arguments: method_type_info
        .type_parameters
        .iter()
        .map(|it| Rc::new(Type::Generic(Reason::dummy(), it.name)))
        .collect_vec(),
      object: Box::new(checked_expression),
      method_name: expression.field_name,
    });
    (partially_checked_expr, method_type_info.type_parameters.clone())
  } else {
    // Now it should be checked as field access.
    if !expression.explicit_type_arguments.is_empty() {
      let mut error = StackableError::new();
      error.add_type_args_arity_error(expression.explicit_type_arguments.len(), 0);
      cx.error_set.report_stackable_error(expression.common.loc, error);
    }
    let fields = cx.resolve_struct_definitions(checked_expression.type_());
    let mut field_order_mapping = HashMap::new();
    let mut field_mappings = HashMap::new();
    for (i, field) in fields.into_iter().enumerate() {
      field_order_mapping.insert(field.name, i);
      field_mappings.insert(field.name, (field.type_, field.is_public));
    }
    if let Some((field_type, _)) =
      field_mappings.get(&expression.field_name.name).filter(|(_, is_public)| *is_public)
    {
      let type_ = Rc::new(field_type.reposition(expression.common.loc));
      let order = *field_order_mapping.get(&expression.field_name.name).unwrap();
      let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
        common: expression.common.with_new_type(type_),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments: vec![],
        object: Box::new(checked_expression),
        field_name: expression.field_name,
        field_order: order as i32,
      });
      (partially_checked_expr, vec![])
    } else {
      cx.error_set.report_cannot_resolve_member_error(
        expression.field_name.loc,
        Description::NominalType { name: class_id, type_args: vec![] },
        expression.field_name.name,
      );
      let any_type = Rc::new(Type::Any(Reason::new(expression.common.loc, None), false));
      let partially_checked_expr = FieldOrMethodAccesss::Field(expr::FieldAccess {
        common: expression.common.with_new_type(any_type),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments: vec![],
        object: Box::new(checked_expression),
        field_name: expression.field_name,
        field_order: expression.field_order,
      });
      (partially_checked_expr, vec![])
    }
  }
}

fn check_field_access(
  cx: &mut TypingContext,
  expression: &expr::FieldAccess<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let (partially_checked_expr, unresolved_type_parameters) =
    check_member_with_unresolved_tparams(cx, expression, hint);
  match partially_checked_expr {
    FieldOrMethodAccesss::Field(f) => replace_undecided_tparam_with_unknown_and_update_type(
      cx,
      expr::E::FieldAccess(f),
      unresolved_type_parameters,
    ),
    FieldOrMethodAccesss::Method(m) => replace_undecided_tparam_with_unknown_and_update_type(
      cx,
      expr::E::MethodAccess(m),
      unresolved_type_parameters,
    ),
  }
}

fn check_unary(cx: &mut TypingContext, expression: &expr::Unary<()>) -> expr::E<Rc<Type>> {
  let expected_type = Rc::new(Type::Primitive(
    Reason::new(expression.common.loc, Some(expression.common.loc)),
    match expression.operator {
      expr::UnaryOperator::NOT => PrimitiveTypeKind::Bool,
      expr::UnaryOperator::NEG => PrimitiveTypeKind::Int,
    },
  ));
  let argument = Box::new(type_check_expression(cx, &expression.argument, type_hint::MISSING));
  assignability_check(cx, argument.loc(), argument.type_(), &expected_type);
  expr::E::Unary(expr::Unary {
    common: expression.common.with_new_type(expected_type),
    operator: expression.operator,
    argument,
  })
}

fn check_function_call_implicit_instantiation(
  cx: &mut TypingContext,
  generic_function_type: &FunctionType,
  type_parameters: &Vec<TypeParameterSignature>,
  function_call_reason: &Reason,
  function_arguments: &Vec<expr::E<()>>,
  valid_return_type_hint: Option<&Type>,
) -> FunctionCallTypeCheckingResult {
  if type_parameters.is_empty() {
    let checked_arguments = function_arguments
      .iter()
      .enumerate()
      .map(|(i, e)| {
        type_check_expression(cx, e, type_hint::available(&generic_function_type.argument_types[i]))
      })
      .collect_vec();
    for ((l, arg_t), param_t) in checked_arguments
      .iter()
      .map(|e| (e.loc(), e.type_()))
      .zip(generic_function_type.argument_types.iter())
    {
      assignability_check(cx, l, arg_t, param_t);
    }
    return FunctionCallTypeCheckingResult {
      solved_generic_type: generic_function_type.clone(),
      solved_return_type: generic_function_type
        .return_type
        .reposition(function_call_reason.use_loc),
      solved_substitution: HashMap::new(),
      checked_arguments,
    };
  }
  // Phase 0: Initial Synthesis -> Vec<(Expr, checked)>
  let mut partially_checked_arguments = vec![];
  let mut checked_argument_types = vec![];
  for arg in function_arguments {
    if arguments_should_be_checked_without_hint(arg) {
      let checked = type_check_expression(cx, arg, type_hint::MISSING);
      checked_argument_types.push(checked.type_().clone());
      partially_checked_arguments.push(MaybeCheckedExpression::Checked(checked));
    } else {
      let (checked, produced_placeholders) =
        cx.run_in_synthesis_mode(|cx| type_check_expression(cx, arg, type_hint::MISSING));
      checked_argument_types.push(checked.type_().clone());
      if produced_placeholders {
        partially_checked_arguments
          .push(MaybeCheckedExpression::Unchecked(arg, checked.type_().clone()));
      } else {
        partially_checked_arguments.push(MaybeCheckedExpression::Checked(checked));
      }
    }
  }
  // Phase 1-n: Best effort inference through arguments that are already checked.
  let mut checked_arguments = vec![];
  for maybe_checked_expr in &partially_checked_arguments {
    checked_argument_types.push(match maybe_checked_expr {
      MaybeCheckedExpression::Checked(e) => e.type_().clone(),
      MaybeCheckedExpression::Unchecked(_, t) => t.clone(),
    });
  }
  for (i, maybe_checked_expr) in partially_checked_arguments.into_iter().enumerate() {
    match maybe_checked_expr {
      MaybeCheckedExpression::Checked(e) => checked_arguments.push(e),
      MaybeCheckedExpression::Unchecked(e, t) => {
        let best_effort_instantiated_function_type = solve_type_arguments(
          cx,
          function_call_reason,
          generic_function_type,
          type_parameters,
          &checked_argument_types.iter().map(|t| t.deref().clone()).collect_vec(),
          valid_return_type_hint,
        );
        let hint =
          type_system::type_meet(&t, &best_effort_instantiated_function_type.argument_types[i])
            .ok();
        let fully_checked_expr =
          type_check_expression(cx, e, type_hint::from_option(hint.as_ref()));
        checked_argument_types[i] = fully_checked_expr.type_().clone();
        checked_arguments.push(fully_checked_expr);
      }
    }
  }
  // Phase n+1: Use fully checked arguments to infer remaining type parameters.
  let mut final_phase_arguments_constraints = vec![];
  for (generic_type, concrete_type) in
    generic_function_type.argument_types.iter().zip(&checked_argument_types)
  {
    final_phase_arguments_constraints
      .push(type_system::TypeConstraint { generic_type, concrete_type });
  }
  if let Some(return_hint) = valid_return_type_hint {
    final_phase_arguments_constraints.push(type_system::TypeConstraint {
      concrete_type: return_hint,
      generic_type: &generic_function_type.return_type,
    })
  }
  let mut fully_solved_substitution = type_system::solve_multiple_type_constrains(
    &final_phase_arguments_constraints,
    type_parameters,
  );
  let still_unresolved_type_parameters = type_parameters
    .iter()
    .filter(|it| !fully_solved_substitution.contains_key(&it.name))
    .collect_vec();
  for type_parameter in still_unresolved_type_parameters {
    let t = cx.mk_underconstrained_any_type(*function_call_reason);
    fully_solved_substitution.insert(type_parameter.name, Rc::new(t));
  }
  let fully_solved_generic_type =
    type_system::subst_fn_type(generic_function_type, &fully_solved_substitution);

  let fully_solved_concrete_return_type =
    fully_solved_generic_type.return_type.reposition(function_call_reason.use_loc);
  validate_type_arguments(cx, type_parameters, &fully_solved_substitution);
  for ((l, arg_t), param_t) in checked_arguments
    .iter()
    .map(|e| (e.loc(), e.type_()))
    .zip(fully_solved_generic_type.argument_types.iter())
  {
    assignability_check(cx, l, arg_t, param_t);
  }

  FunctionCallTypeCheckingResult {
    solved_generic_type: fully_solved_generic_type,
    solved_return_type: fully_solved_concrete_return_type,
    solved_substitution: fully_solved_substitution,
    checked_arguments,
  }
}

fn check_function_call(
  cx: &mut TypingContext,
  expression: &expr::Call<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let (partially_checked_callee, unresolved_tparams) = match expression.callee.deref() {
    expr::E::FieldAccess(field_access) => {
      let (partially_checked_field_or_method_access, unresolved_tparams) =
        check_member_with_unresolved_tparams(cx, field_access, type_hint::MISSING);
      let partially_checked_expr = match partially_checked_field_or_method_access {
        FieldOrMethodAccesss::Field(f) => expr::E::FieldAccess(f),
        FieldOrMethodAccesss::Method(m) => expr::E::MethodAccess(m),
      };
      (partially_checked_expr, unresolved_tparams)
    }
    e => (type_check_expression(cx, e, type_hint::MISSING), vec![]),
  };
  let partially_checked_callee_type = partially_checked_callee.type_().deref();
  let callee_function_type = match partially_checked_callee_type {
    Type::Fn(fn_type) => fn_type,
    t => {
      if !matches!(t, Type::Any(_, _)) {
        cx.error_set.report_incompatible_type_kind_error(
          expression.callee.loc(),
          t.to_description(),
          Description::GeneralNominalType,
        );
      }
      let loc = expression.common.loc;
      let type_ = Rc::new(Type::Any(Reason::new(loc, None), false));
      return expr::E::Call(expr::Call {
        common: expression.common.with_new_type(type_),
        callee: Box::new(replace_undecided_tparam_with_unknown_and_update_type(
          cx,
          partially_checked_callee,
          unresolved_tparams,
        )),
        arguments: expression
          .arguments
          .iter()
          .map(|e| type_check_expression(cx, e, type_hint::MISSING))
          .collect(),
      });
    }
  };
  if callee_function_type.argument_types.len() != expression.arguments.len() {
    let mut stackable = StackableError::new();
    stackable.add_fn_param_arity_error(
      expression.arguments.len(),
      callee_function_type.argument_types.len(),
    );
    cx.error_set.report_stackable_error(expression.common.loc, stackable);
    return expr::E::Call(expr::Call {
      common: expression
        .common
        .with_new_type(Rc::new(Type::Any(Reason::new(expression.common.loc, None), false))),
      callee: Box::new(replace_undecided_tparam_with_unknown_and_update_type(
        cx,
        partially_checked_callee,
        unresolved_tparams,
      )),
      arguments: expression
        .arguments
        .iter()
        .map(|e| type_check_expression(cx, e, type_hint::MISSING))
        .collect(),
    });
  }
  let FunctionCallTypeCheckingResult {
    solved_generic_type,
    solved_return_type,
    solved_substitution,
    checked_arguments,
  } = check_function_call_implicit_instantiation(
    cx,
    callee_function_type,
    &unresolved_tparams,
    &Reason::new(expression.common.loc, None),
    &expression.arguments,
    hint.get_valid_hint(),
  );
  let fully_resolved_checked_callee =
    mod_type(partially_checked_callee, Rc::new(Type::Fn(solved_generic_type)));
  let callee_with_patched_targs = match fully_resolved_checked_callee {
    expr::E::FieldAccess(f) => expr::E::FieldAccess(expr::FieldAccess {
      common: f.common,
      explicit_type_arguments: f.explicit_type_arguments,
      inferred_type_arguments: f.inferred_type_arguments,
      object: f.object,
      field_name: f.field_name,
      field_order: f.field_order,
    }),
    expr::E::MethodAccess(m) => expr::E::MethodAccess(expr::MethodAccess {
      common: m.common,
      explicit_type_arguments: m.explicit_type_arguments,
      inferred_type_arguments: m
        .inferred_type_arguments
        .iter()
        .map(|it| type_system::subst_type(it, &solved_substitution))
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

fn check_binary(cx: &mut TypingContext, expression: &expr::Binary<()>) -> expr::E<Rc<Type>> {
  let expected_type = Rc::new(match expression.operator {
    expr::BinaryOperator::MUL
    | expr::BinaryOperator::DIV
    | expr::BinaryOperator::MOD
    | expr::BinaryOperator::PLUS
    | expr::BinaryOperator::MINUS => Type::Primitive(
      Reason::new(expression.common.loc, Some(expression.common.loc)),
      PrimitiveTypeKind::Int,
    ),
    expr::BinaryOperator::LT
    | expr::BinaryOperator::LE
    | expr::BinaryOperator::GT
    | expr::BinaryOperator::GE
    | expr::BinaryOperator::EQ
    | expr::BinaryOperator::NE
    | expr::BinaryOperator::AND
    | expr::BinaryOperator::OR => Type::Primitive(
      Reason::new(expression.common.loc, Some(expression.common.loc)),
      PrimitiveTypeKind::Bool,
    ),
    expr::BinaryOperator::CONCAT => Type::Nominal(NominalType {
      reason: Reason::new(expression.common.loc, Some(expression.common.loc)),
      is_class_statics: false,
      module_reference: ModuleReference::ROOT,
      id: PStr::STR_TYPE,
      type_arguments: vec![],
    }),
  });
  match expression.operator {
    expr::BinaryOperator::MUL
    | expr::BinaryOperator::DIV
    | expr::BinaryOperator::MOD
    | expr::BinaryOperator::PLUS
    | expr::BinaryOperator::MINUS
    | expr::BinaryOperator::AND
    | expr::BinaryOperator::OR
    | expr::BinaryOperator::CONCAT => {
      let e1 = Box::new(type_check_expression(cx, &expression.e1, type_hint::MISSING));
      assignability_check(cx, e1.loc(), e1.type_(), &expected_type);
      let e2 = Box::new(type_check_expression(cx, &expression.e2, type_hint::MISSING));
      assignability_check(cx, e2.loc(), e2.type_(), &expected_type);
      expr::E::Binary(expr::Binary {
        common: expression.common.with_new_type(expected_type),
        operator_preceding_comments: expression.operator_preceding_comments,
        operator: expression.operator,
        e1,
        e2,
      })
    }
    expr::BinaryOperator::LT
    | expr::BinaryOperator::LE
    | expr::BinaryOperator::GT
    | expr::BinaryOperator::GE => {
      let child_type_hint =
        Type::Primitive(Reason::new(expression.common.loc, None), PrimitiveTypeKind::Int);
      let e1 = Box::new(type_check_expression(cx, &expression.e1, type_hint::MISSING));
      assignability_check(cx, e1.loc(), e1.type_(), &child_type_hint);
      let e2 = Box::new(type_check_expression(cx, &expression.e2, type_hint::MISSING));
      assignability_check(cx, e2.loc(), e2.type_(), &child_type_hint);
      expr::E::Binary(expr::Binary {
        common: expression.common.with_new_type(expected_type),
        operator_preceding_comments: expression.operator_preceding_comments,
        operator: expression.operator,
        e1,
        e2,
      })
    }
    expr::BinaryOperator::EQ | expr::BinaryOperator::NE => {
      let e1 = Box::new(type_check_expression(cx, &expression.e1, type_hint::MISSING));
      let e2 =
        Box::new(type_check_expression(cx, &expression.e2, type_hint::available(e1.type_())));
      assignability_check(cx, e2.loc(), e2.type_(), e1.type_());
      expr::E::Binary(expr::Binary {
        common: expression.common.with_new_type(expected_type),
        operator_preceding_comments: expression.operator_preceding_comments,
        operator: expression.operator,
        e1,
        e2,
      })
    }
  }
}

fn check_if_else(
  cx: &mut TypingContext,
  expression: &expr::IfElse<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let condition = Box::new(match expression.condition.as_ref() {
    expr::IfElseCondition::Expression(expr) => {
      expr::IfElseCondition::Expression(type_check_expression(cx, expr, type_hint::MISSING))
    }
    expr::IfElseCondition::Guard(p, expr) => {
      let expr = type_check_expression(cx, expr, type_hint::MISSING);
      let (pattern, abstract_pattern_node) = check_matching_pattern(cx, p, false, expr.type_());
      if !pattern_matching::is_additional_pattern_useful(
        cx,
        &[abstract_pattern_node],
        AbstractPatternNode::wildcard(),
      ) {
        cx.error_set.report_useless_pattern_error(*p.loc(), true);
      }
      expr::IfElseCondition::Guard(pattern, expr)
    }
  });
  let e1 = Box::new(type_check_expression(cx, &expression.e1, hint));
  let e2 = Box::new(type_check_expression(cx, &expression.e2, type_hint::available(e1.type_())));
  assignability_check(cx, e2.loc(), e2.type_(), e1.type_());
  let type_ = e1.type_().reposition(expression.common.loc);
  expr::E::IfElse(expr::IfElse {
    common: expression.common.with_new_type(Rc::new(type_)),
    condition,
    e1,
    e2,
  })
}

fn check_match(
  cx: &mut TypingContext,
  expression: &expr::Match<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let checked_matched = type_check_expression(cx, &expression.matched, type_hint::MISSING);
  let checked_matched_type = checked_matched.type_();
  let mut checked_cases = vec![];
  let mut matching_list_type: Option<Rc<Type>> = None;
  let mut abstract_pattern_nodes = Vec::with_capacity(expression.cases.len());
  for expr::VariantPatternToExpression { loc, pattern, body } in &expression.cases {
    let (pattern, abstract_pattern_node) =
      check_matching_pattern(cx, pattern, true, checked_matched_type);
    abstract_pattern_nodes.push(abstract_pattern_node);
    let checked_body = type_check_expression(cx, body, hint);
    match &matching_list_type {
      Some(expected) => assignability_check(cx, *loc, checked_body.type_(), expected),
      None => matching_list_type = Some(checked_body.type_().clone()),
    }
    checked_cases.push(expr::VariantPatternToExpression {
      loc: *loc,
      pattern,
      body: Box::new(checked_body),
    });
  }
  if let Some(description) =
    pattern_matching::incomplete_counterexample(cx, &abstract_pattern_nodes)
  {
    cx.error_set.report_non_exhausive_match_error(expression.common.loc, description);
  }
  expr::E::Match(expr::Match {
    common: expression.common.with_new_type(Rc::new(
      matching_list_type
        .map(|t| t.reposition(expression.common.loc))
        .unwrap_or(Type::Any(Reason::new(expression.common.loc, None), false)),
    )),
    matched: Box::new(checked_matched),
    cases: checked_cases,
  })
}

/// Invariant: returned type list has the same length as the param list
fn infer_lambda_parameter_types(
  cx: &mut TypingContext,
  expression: &expr::Lambda<()>,
  hint: type_hint::Hint,
) -> (Vec<Rc<Type>>, bool) {
  let mut underconstrained = false;
  let mut types_ = Vec::with_capacity(expression.parameters.len());
  for (i, OptionallyAnnotatedId { name, type_: _, annotation }) in
    expression.parameters.iter().enumerate()
  {
    let type_ = if let Some(annot) = annotation {
      Rc::new(Type::from_annotation(annot))
    } else if let Some(param_hint) = hint.transform_to_nth_param(i).get_valid_hint() {
      Rc::new(param_hint.reposition(name.loc))
    } else {
      underconstrained = true;
      Rc::new(cx.mk_underconstrained_any_type(Reason::new(name.loc, None)))
    };
    cx.validate_type_instantiation_strictly(&type_);
    cx.local_typing_context.write(name.loc, type_.clone());
    types_.push(type_);
  }
  (types_, underconstrained)
}

fn check_lambda(
  cx: &mut TypingContext,
  expression: &expr::Lambda<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let (argument_types, underconstrained) = infer_lambda_parameter_types(cx, expression, hint);
  let checked_parameters = expression
    .parameters
    .iter()
    .zip(&argument_types)
    .map(|(param, t)| OptionallyAnnotatedId {
      name: param.name,
      type_: t.clone(),
      annotation: param.annotation.clone(),
    })
    .collect_vec();
  let body = if cx.in_synthesis_mode() && underconstrained {
    expr::E::Literal(
      expression
        .common
        .with_new_type(Rc::new(cx.mk_placeholder_type(Reason::new(expression.common.loc, None)))),
      Literal::Bool(false),
    )
  } else {
    type_check_expression(cx, &expression.body, hint.transform_to_return_type())
  };
  let captured = cx.local_typing_context.get_captured(&expression.common.loc);
  let type_ = Type::Fn(FunctionType {
    reason: Reason::new(expression.common.loc, None),
    argument_types,
    return_type: body.type_().clone(),
  });
  expr::E::Lambda(expr::Lambda {
    common: expression.common.with_new_type(Rc::new(type_)),
    parameters: checked_parameters,
    captured,
    body: Box::new(body),
  })
}

fn bad_pattern_default(wildcard_on_bad_pattern: bool) -> pattern_matching::AbstractPatternNode {
  if wildcard_on_bad_pattern {
    pattern_matching::AbstractPatternNode::wildcard()
  } else {
    pattern_matching::AbstractPatternNode::nothing()
  }
}

fn any_typed_invalid_matching_pattern(
  cx: &mut TypingContext,
  pattern: &pattern::MatchingPattern<()>,
) -> pattern::MatchingPattern<Rc<Type>> {
  match pattern {
    pattern::MatchingPattern::Tuple(pattern_loc, destructured_names) => {
      let mut checked_destructured_names = vec![];
      for pattern::TuplePatternElement { pattern, type_: _ } in destructured_names {
        let loc = pattern.loc();
        checked_destructured_names.push(pattern::TuplePatternElement {
          pattern: Box::new(any_typed_invalid_matching_pattern(cx, pattern)),
          type_: Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false)),
        });
      }
      pattern::MatchingPattern::Tuple(*pattern_loc, checked_destructured_names)
    }
    pattern::MatchingPattern::Object(pattern_loc, destructed_names) => {
      let mut checked_destructured_names = vec![];
      for pattern::ObjectPatternElement {
        loc,
        field_order,
        field_name,
        pattern,
        shorthand,
        type_: _,
      } in destructed_names
      {
        checked_destructured_names.push(pattern::ObjectPatternElement {
          loc: *loc,
          field_order: *field_order,
          field_name: *field_name,
          pattern: Box::new(any_typed_invalid_matching_pattern(cx, pattern)),
          shorthand: *shorthand,
          type_: Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false)),
        });
      }
      pattern::MatchingPattern::Object(*pattern_loc, checked_destructured_names)
    }
    pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc,
      tag_order,
      tag,
      data_variables,
      type_: _,
    }) => pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc: *loc,
      tag_order: *tag_order,
      tag: *tag,
      data_variables: data_variables
        .iter()
        .map(|(p, ())| {
          (
            any_typed_invalid_matching_pattern(cx, p),
            Rc::new(Type::Any(Reason::new(*p.loc(), Some(*p.loc())), false)),
          )
        })
        .collect(),
      type_: Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false)),
    }),
    pattern::MatchingPattern::Id(id, ()) => {
      let type_ = Rc::new(Type::Any(Reason::new(id.loc, Some(id.loc)), false));
      cx.local_typing_context.write(id.loc, type_.clone());
      pattern::MatchingPattern::Id(*id, type_)
    }
    pattern::MatchingPattern::Wildcard(loc) => pattern::MatchingPattern::Wildcard(*loc),
  }
}

fn check_matching_pattern(
  cx: &mut TypingContext,
  pattern: &pattern::MatchingPattern<()>,
  wildcard_on_bad_pattern: bool,
  pattern_type: &Rc<Type>,
) -> (pattern::MatchingPattern<Rc<Type>>, pattern_matching::AbstractPatternNode) {
  match pattern {
    pattern::MatchingPattern::Tuple(pattern_loc, destructured_names) => {
      let Some((_, _, fields)) = cx.resolve_detailed_struct_definitions_opt(pattern_type) else {
        cx.error_set.report_not_a_struct_error(*pattern_loc, pattern_type.to_description());
        return (
          any_typed_invalid_matching_pattern(cx, pattern),
          bad_pattern_default(wildcard_on_bad_pattern),
        );
      };
      let mut checked_destructured_names = vec![];
      let mut abstract_pattern_nodes = vec![];
      for (index, pattern::TuplePatternElement { pattern, type_: _ }) in
        destructured_names.iter().enumerate()
      {
        let loc = pattern.loc();
        if let Some(field_sig) = fields.get(index) {
          if !field_sig.is_public {
            cx.error_set.report_element_missing_error(*loc, pattern_type.to_description(), index);
          }
          let (checked, abstract_node) =
            check_matching_pattern(cx, pattern, wildcard_on_bad_pattern, &field_sig.type_);
          checked_destructured_names.push(pattern::TuplePatternElement {
            pattern: Box::new(checked),
            type_: Rc::new(field_sig.type_.reposition(*loc)),
          });
          abstract_pattern_nodes.push(abstract_node);
          continue;
        }
        cx.error_set.report_element_missing_error(*loc, pattern_type.to_description(), index);
        let type_ = Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false));
        let (checked, abstract_node) =
          check_matching_pattern(cx, pattern, wildcard_on_bad_pattern, &type_);
        checked_destructured_names
          .push(pattern::TuplePatternElement { pattern: Box::new(checked), type_ });
        abstract_pattern_nodes.push(abstract_node);
      }
      if fields.len() > checked_destructured_names.len() {
        cx.error_set.report_non_exhausive_tuple_binding_error(
          *pattern_loc,
          fields.len(),
          checked_destructured_names.len(),
        );
        for _ in checked_destructured_names.len()..fields.len() {
          abstract_pattern_nodes.push(pattern_matching::AbstractPatternNode::wildcard());
        }
      }
      (
        pattern::MatchingPattern::Tuple(*pattern_loc, checked_destructured_names),
        pattern_matching::AbstractPatternNode::tuple(abstract_pattern_nodes),
      )
    }
    pattern::MatchingPattern::Object(pattern_loc, destructed_names) => {
      let Some((_, _, fields)) = cx.resolve_detailed_struct_definitions_opt(pattern_type) else {
        cx.error_set.report_not_a_struct_error(*pattern_loc, pattern_type.to_description());
        return (
          any_typed_invalid_matching_pattern(cx, pattern),
          bad_pattern_default(wildcard_on_bad_pattern),
        );
      };
      let mut not_mentioned_fields = BTreeSet::new();
      let mut field_order_mapping = HashMap::new();
      let mut field_mappings = HashMap::new();
      let mut abstract_pattern_nodes = Vec::with_capacity(fields.len());
      for (i, field) in fields.into_iter().enumerate() {
        field_order_mapping.insert(field.name, i);
        not_mentioned_fields.insert(field.name);
        field_mappings.insert(field.name, (field.type_, field.is_public));
        abstract_pattern_nodes.push(AbstractPatternNode::wildcard());
      }
      let mut checked_destructured_names = vec![];
      for pattern::ObjectPatternElement {
        loc,
        field_order,
        field_name,
        pattern,
        shorthand,
        type_: _,
      } in destructed_names
      {
        if let Some((field_type, is_public)) = field_mappings.get(&field_name.name) {
          if !is_public {
            cx.error_set.report_cannot_resolve_member_error(
              field_name.loc,
              pattern_type.to_description(),
              field_name.name,
            );
          }
          not_mentioned_fields.remove(&field_name.name);
          let (checked, abstract_node) =
            check_matching_pattern(cx, pattern, wildcard_on_bad_pattern, field_type);
          let field_order = field_order_mapping.get(&field_name.name).unwrap();
          checked_destructured_names.push(pattern::ObjectPatternElement {
            loc: *loc,
            field_order: *field_order,
            field_name: *field_name,
            pattern: Box::new(checked),
            shorthand: *shorthand,
            type_: Rc::new(field_type.reposition(*loc)),
          });
          abstract_pattern_nodes[*field_order] = abstract_node;
          continue;
        }
        cx.error_set.report_cannot_resolve_member_error(
          field_name.loc,
          pattern_type.to_description(),
          field_name.name,
        );
        let type_ = Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false));
        let (checked, abstract_node) =
          check_matching_pattern(cx, pattern, wildcard_on_bad_pattern, &type_);
        checked_destructured_names.push(pattern::ObjectPatternElement {
          loc: *loc,
          field_order: *field_order,
          field_name: *field_name,
          pattern: Box::new(checked),
          shorthand: *shorthand,
          type_: Rc::new(Type::Any(Reason::new(*loc, Some(*loc)), false)),
        });
        abstract_pattern_nodes[*field_order] = abstract_node;
      }
      if !not_mentioned_fields.is_empty() {
        cx.error_set.report_non_exhausive_struct_binding_error(
          *pattern_loc,
          not_mentioned_fields.into_iter().collect(),
        );
      }
      (
        pattern::MatchingPattern::Object(*pattern_loc, checked_destructured_names),
        pattern_matching::AbstractPatternNode::tuple(abstract_pattern_nodes),
      )
    }
    pattern::MatchingPattern::Variant(pattern::VariantPattern {
      loc,
      tag_order: _,
      tag,
      data_variables,
      type_: _,
    }) => {
      let Some((
        abstract_variant_constructor_mod_ref,
        abstract_variant_constructor_class_name,
        resolved_enum,
      )) = cx.resolve_detailed_enum_definitions_opt(pattern_type)
      else {
        cx.error_set.report_not_an_enum_error(tag.loc, pattern_type.to_description());
        return (
          any_typed_invalid_matching_pattern(cx, pattern),
          bad_pattern_default(wildcard_on_bad_pattern),
        );
      };
      let Some((tag_order, resolved_enum_variant)) =
        resolved_enum.into_iter().find_position(|e| e.name == tag.name)
      else {
        cx.error_set.report_cannot_resolve_member_error(
          tag.loc,
          pattern_type.to_description(),
          tag.name,
        );
        return (
          any_typed_invalid_matching_pattern(cx, pattern),
          pattern_matching::AbstractPatternNode::nothing(),
        );
      };
      let mut checked_data_variables = Vec::with_capacity(data_variables.len());
      let abstract_variant_constructor = pattern_matching::VariantPatternConstructor {
        module_reference: abstract_variant_constructor_mod_ref,
        class_name: abstract_variant_constructor_class_name,
        variant_name: resolved_enum_variant.name,
      };
      let mut abstract_pattern_nodes = vec![];
      for (index, (p, ())) in data_variables.iter().enumerate() {
        if let Some(resolved_pattern_type) = resolved_enum_variant.types.get(index) {
          let (checked, abstract_node) =
            check_matching_pattern(cx, p, wildcard_on_bad_pattern, resolved_pattern_type);
          checked_data_variables.push((checked, resolved_pattern_type.clone()));
          abstract_pattern_nodes.push(abstract_node);
        } else {
          cx.error_set.report_element_missing_error(*p.loc(), pattern_type.to_description(), index);
          let type_ = Rc::new(Type::Any(Reason::new(*p.loc(), Some(*p.loc())), false));
          let (checked, abstract_node) =
            check_matching_pattern(cx, p, wildcard_on_bad_pattern, &type_);
          checked_data_variables.push((checked, type_));
          abstract_pattern_nodes.push(abstract_node);
        }
      }
      if resolved_enum_variant.types.len() > checked_data_variables.len() {
        cx.error_set.report_non_exhausive_tuple_binding_error(
          *loc,
          resolved_enum_variant.types.len(),
          checked_data_variables.len(),
        );
        for _ in checked_data_variables.len()..resolved_enum_variant.types.len() {
          abstract_pattern_nodes.push(pattern_matching::AbstractPatternNode::wildcard());
        }
      }
      (
        pattern::MatchingPattern::Variant(pattern::VariantPattern {
          loc: *loc,
          tag_order,
          tag: *tag,
          data_variables: checked_data_variables,
          type_: pattern_type.clone(),
        }),
        pattern_matching::AbstractPatternNode::variant(
          abstract_variant_constructor,
          abstract_pattern_nodes,
        ),
      )
    }
    pattern::MatchingPattern::Id(id, ()) => {
      cx.local_typing_context.write(id.loc, pattern_type.clone());
      (
        pattern::MatchingPattern::Id(*id, pattern_type.clone()),
        pattern_matching::AbstractPatternNode::wildcard(),
      )
    }
    pattern::MatchingPattern::Wildcard(loc) => {
      (pattern::MatchingPattern::Wildcard(*loc), pattern_matching::AbstractPatternNode::wildcard())
    }
  }
}

fn check_statement(
  cx: &mut TypingContext,
  statement: &expr::DeclarationStatement<()>,
) -> expr::DeclarationStatement<Rc<Type>> {
  let expr::DeclarationStatement {
    loc,
    associated_comments,
    pattern,
    annotation,
    assigned_expression,
  } = statement;
  let hint = if let Some(annot) = &annotation {
    let t = Type::from_annotation(annot);
    cx.validate_type_instantiation_strictly(&t);
    Some(t)
  } else {
    None
  };
  let checked_assigned_expr =
    type_check_expression(cx, assigned_expression, type_hint::from_option(hint.as_ref()));
  let checked_assigned_expr_type = checked_assigned_expr.type_();
  if let Some(hint) = &hint {
    assignability_check(cx, *loc, checked_assigned_expr_type, hint);
  }
  let (checked_pattern, abstract_pattern_node) =
    check_matching_pattern(cx, pattern, true, checked_assigned_expr_type);
  if let Some(description) =
    pattern_matching::incomplete_counterexample(cx, &[abstract_pattern_node])
  {
    cx.error_set.report_non_exhausive_match_error(*checked_pattern.loc(), description);
  }
  expr::DeclarationStatement {
    loc: *loc,
    associated_comments: *associated_comments,
    pattern: checked_pattern,
    annotation: annotation.clone(),
    assigned_expression: Box::new(checked_assigned_expr),
  }
}

fn check_block(
  cx: &mut TypingContext,
  expression: &expr::Block<()>,
  hint: type_hint::Hint,
) -> expr::E<Rc<Type>> {
  let statements = expression.statements.iter().map(|s| check_statement(cx, s)).collect_vec();
  let checked_final_expr =
    expression.expression.as_ref().map(|e| Box::new(type_check_expression(cx, e, hint)));
  let type_ = if let Some(e) = &checked_final_expr {
    Rc::new(e.type_().reposition(expression.common.loc))
  } else {
    Rc::new(Type::Primitive(Reason::new(expression.common.loc, None), PrimitiveTypeKind::Unit))
  };
  expr::E::Block(expr::Block {
    common: expression.common.with_new_type(type_),
    statements,
    expression: checked_final_expr,
  })
}

fn validate_tparams_signature_type_instantiation(
  cx: &mut TypingContext,
  tparams_sig: &[TypeParameterSignature],
) {
  for tparam in tparams_sig {
    if let Some(bound) = &tparam.bound {
      cx.validate_type_instantiation_allow_abstract_types(&Type::Nominal(bound.clone()));
    }
  }
}

fn check_class_member_conformance_with_signature(
  error_set: &mut ErrorSet,
  expected: &MemberSignature,
  actual: &ClassMemberDeclaration,
) {
  if expected.type_parameters.len() != actual.type_parameters.len() {
    let mut error = StackableError::new();
    error.add_type_params_arity_error(actual.type_parameters.len(), expected.type_parameters.len());
    error_set.report_stackable_error(actual.type_.location, error);
  }
  let mut has_type_parameter_conformance_errors = false;
  for (e, a) in expected.type_parameters.iter().zip(actual.type_parameters.deref()) {
    if e.name != a.name.name {
      has_type_parameter_conformance_errors = true;
    }
    match (&e.bound, &a.bound) {
      (None, Some(_)) | (Some(_), None) => {
        has_type_parameter_conformance_errors = true;
      }
      (None, None) => { /* Great! */ }
      (Some(e_bound), Some(a_bound)) => {
        if !e_bound.is_the_same_type(&NominalType::from_annotation(a_bound)) {
          has_type_parameter_conformance_errors = true;
        }
      }
    }
  }
  if has_type_parameter_conformance_errors {
    error_set.report_type_parameter_mismatch_error(
      actual.type_.location,
      expected.type_parameters.iter().map(TypeParameterSignature::to_description).collect(),
    );
  } else {
    let actual_fn_type = FunctionType::from_annotation(&actual.type_);
    if !expected.type_.is_the_same_type(&actual_fn_type) {
      let mut error = StackableError::new();
      error.add_type_incompatibility_error(
        actual_fn_type.reason,
        actual_fn_type.to_description(),
        expected.type_.reason,
        expected.type_.to_description(),
      );
      error_set.report_stackable_error(actual.type_.location, error);
    }
  }
}

pub fn type_check_module(
  module_reference: ModuleReference,
  module: &Module<()>,
  global_cx: &GlobalSignature,
  error_set: &mut ErrorSet,
) -> (Module<Rc<Type>>, LocalTypingContext) {
  let mut local_cx =
    LocalTypingContext::new(perform_ssa_analysis_on_module(module_reference, module, error_set));

  for one_import in module.imports.iter() {
    if let Some(module_cx) = global_cx.get(&one_import.imported_module) {
      for id in one_import.imported_members.iter() {
        if module_cx.interfaces.get(&id.name).filter(|interface_cx| !interface_cx.private).is_none()
        {
          error_set.report_missing_export_error(id.loc, one_import.imported_module, id.name);
        }
      }
    } else {
      error_set.report_cannot_resolve_module_error(one_import.loc, one_import.imported_module);
    }
  }

  let mut checked_toplevels = vec![];
  for toplevel in &module.toplevels {
    let nominal_type = NominalType {
      reason: Reason::new(toplevel.name().loc, None),
      is_class_statics: false,
      module_reference,
      id: toplevel.name().name,
      type_arguments: toplevel
        .type_parameters()
        .iter()
        .map(|it| Rc::new(Type::Generic(Reason::new(it.loc, Some(it.loc)), it.name.name)))
        .collect_vec(),
    };
    let global_signature::SuperTypesResolutionResult { types: resolved_super_types, is_cyclic } =
      global_signature::resolve_all_transitive_super_types(global_cx, &nominal_type);
    if is_cyclic {
      error_set.report_cyclic_type_definition_error(
        nominal_type.reason.use_loc,
        nominal_type.to_description(),
      );
    }
    for super_type in &resolved_super_types {
      if global_cx
        .get(&super_type.module_reference)
        .and_then(|it| it.interfaces.get(&super_type.id))
        .map(|it| it.type_definition.is_some())
        .unwrap_or(false)
      {
        error_set.report_incompatible_type_kind_error(
          super_type.reason.use_loc,
          Description::GeneralClassType,
          Description::GeneralInterfaceType,
        );
      }
    }
    let toplevel_tparams_sig = TypeParameterSignature::from_list(toplevel.type_parameters());
    let mut cx = TypingContext::new(
      global_cx,
      &mut local_cx,
      error_set,
      module_reference,
      toplevel.name().name,
      toplevel_tparams_sig.clone(),
    );
    validate_tparams_signature_type_instantiation(&mut cx, &toplevel_tparams_sig);
    for bound in toplevel.extends_or_implements_nodes() {
      cx.validate_type_instantiation_allow_abstract_types(&Type::Nominal(
        NominalType::from_annotation(bound),
      ));
    }
    if let Some(type_definition) = toplevel.type_definition() {
      match type_definition {
        TypeDefinition::Struct { loc: _, fields } => {
          for field in fields {
            cx.validate_type_instantiation_strictly(&Type::from_annotation(&field.annotation))
          }
        }
        TypeDefinition::Enum { loc: _, variants } => {
          for t in variants.iter().flat_map(|it| it.associated_data_types.iter()) {
            cx.validate_type_instantiation_strictly(&Type::from_annotation(t))
          }
        }
      }
    }
    for member in toplevel.members_iter() {
      let tparam_sigs = if member.is_method {
        let mut sigs = TypeParameterSignature::from_list(toplevel.type_parameters());
        sigs.append(&mut TypeParameterSignature::from_list(&member.type_parameters));
        sigs
      } else {
        if !toplevel.is_class() {
          error_set.report_illegal_function_in_interface(member.loc);
        }
        TypeParameterSignature::from_list(&member.type_parameters)
      };
      let has_interface_def = if member.is_method {
        let resolved = global_signature::resolve_all_method_signatures(
          global_cx,
          &resolved_super_types,
          member.name.name,
        );
        for expected in &resolved {
          check_class_member_conformance_with_signature(error_set, expected, member);
        }
        !resolved.is_empty()
      } else {
        false
      };
      if !member.is_public && has_interface_def {
        error_set.report_incompatible_type_kind_error(
          member.loc,
          Description::PrivateMember,
          Description::PublicMember,
        );
      }

      let mut member_cx = TypingContext::new(
        global_cx,
        &mut local_cx,
        error_set,
        module_reference,
        toplevel.name().name,
        tparam_sigs,
      );
      for tparam in member.type_parameters.iter() {
        if let Some(bound) = &tparam.bound {
          member_cx.validate_type_instantiation_allow_abstract_types(&Type::Nominal(
            NominalType::from_annotation(bound),
          ));
        }
      }
      member_cx.validate_type_instantiation_strictly(&Type::Fn(FunctionType::from_annotation(
        &member.type_,
      )));
      for param in member.parameters.iter() {
        local_cx.write(param.name.loc, Rc::new(Type::from_annotation(&param.annotation)));
      }
    }

    let checked = match toplevel {
      Toplevel::Interface(i) => Toplevel::Interface(i.clone()),
      Toplevel::Class(c) => {
        let mut missing_function_members =
          global_signature::resolve_all_member_names(global_cx, &resolved_super_types, false);
        let mut missing_method_members =
          global_signature::resolve_all_member_names(global_cx, &resolved_super_types, true);
        for member in &c.members {
          let n = member.decl.name.name;
          if member.decl.is_method {
            missing_method_members.remove(&n);
          } else {
            missing_function_members.remove(&n);
          }
        }
        match &c.type_definition {
          TypeDefinition::Struct { .. } => {
            missing_function_members.remove(&PStr::INIT);
          }
          TypeDefinition::Enum { loc: _, variants } => {
            for variant in variants {
              missing_function_members.remove(&variant.name.name);
            }
          }
        }
        missing_function_members.extend(&missing_method_members);
        if !missing_function_members.is_empty() {
          error_set.report_missing_class_member_definition_error(
            toplevel.name().loc,
            missing_function_members.iter().copied().collect(),
          );
        }
        local_cx.write(c.loc, Rc::new(Type::Nominal(nominal_type)));

        let mut checked_members = vec![];
        for member in &c.members {
          let tparam_sigs = if member.decl.is_method {
            let mut sigs = TypeParameterSignature::from_list(toplevel.type_parameters());
            let mut local_sigs = TypeParameterSignature::from_list(&member.decl.type_parameters);
            sigs.append(&mut local_sigs);
            sigs
          } else {
            TypeParameterSignature::from_list(&member.decl.type_parameters)
          };
          let mut cx = TypingContext::new(
            global_cx,
            &mut local_cx,
            error_set,
            module_reference,
            c.name.name,
            tparam_sigs,
          );
          let body_type_hint = Type::from_annotation(&member.decl.type_.return_type);
          let body =
            type_check_expression(&mut cx, &member.body, type_hint::available(&body_type_hint));
          assignability_check(&mut cx, body.loc(), body.type_(), &body_type_hint);
          checked_members.push(ClassMemberDefinition { decl: member.decl.clone(), body });
        }
        Toplevel::Class(InterfaceDeclarationCommon {
          loc: c.loc,
          associated_comments: c.associated_comments,
          private: c.private,
          name: c.name,
          type_parameters: c.type_parameters.clone(),
          extends_or_implements_nodes: c.extends_or_implements_nodes.clone(),
          type_definition: c.type_definition.clone(),
          members: checked_members,
        })
      }
    };
    checked_toplevels.push(checked);
  }

  (
    Module {
      comment_store: module.comment_store.clone(),
      imports: module.imports.clone(),
      toplevels: checked_toplevels,
      trailing_comments: module.trailing_comments,
    },
    local_cx,
  )
}
