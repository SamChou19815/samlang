use super::{
  checker_utils::{
    contextual_type_meet, perform_fn_type_substitution, perform_id_type_substitution,
    perform_type_substitution, solve_multiple_type_constrains, TypeConstraint,
    TypeConstraintSolution,
  },
  global_signature,
  ssa_analysis::perform_ssa_analysis_on_module,
  type_::{
    FunctionType, GlobalSignature, ISourceType, IdType, MemberSignature, PrimitiveTypeKind, Type,
    TypeDefinitionSignature, TypeParameterSignature,
  },
  typing_context::{LocalTypingContext, TypingContext},
};
use crate::{
  ast::{
    source::{
      expr::{self, ExpressionCommon, ObjectPatternDestucturedName},
      ClassMemberDeclaration, ClassMemberDefinition, Id, InterfaceDeclarationCommon, Literal,
      Module, OptionallyAnnotatedId, Toplevel, TypeDefinition, TypeParameter,
    },
    Reason,
  },
  checker::checker_utils::solve_type_constraints,
  common::{Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{collections::HashMap, ops::Deref, rc::Rc};

pub(crate) fn mod_type(expression: expr::E<Rc<Type>>, new_type: Rc<Type>) -> expr::E<Rc<Type>> {
  let f = |common: expr::ExpressionCommon<Rc<Type>>| ExpressionCommon {
    loc: common.loc,
    associated_comments: common.associated_comments,
    type_: new_type,
  };
  match expression {
    expr::E::Literal(common, l) => expr::E::Literal(f(common), l),
    expr::E::Id(common, id) => expr::E::Id(f(common), id),
    expr::E::ClassFn(expr::ClassFunction {
      common,
      explicit_type_arguments,
      inferred_type_arguments,
      module_reference,
      class_name,
      fn_name,
    }) => expr::E::ClassFn(expr::ClassFunction {
      common: f(common),
      explicit_type_arguments,
      inferred_type_arguments,
      module_reference,
      class_name,
      fn_name,
    }),
    expr::E::FieldAccess(expr::FieldAccess {
      common,
      explicit_type_arguments,
      inferred_type_arguments,
      object,
      field_name,
      field_order,
    }) => expr::E::FieldAccess(expr::FieldAccess {
      common: f(common),
      explicit_type_arguments,
      inferred_type_arguments,
      object,
      field_name,
      field_order,
    }),
    expr::E::MethodAccess(expr::MethodAccess {
      common,
      explicit_type_arguments,
      inferred_type_arguments,
      object,
      method_name,
    }) => expr::E::MethodAccess(expr::MethodAccess {
      common: f(common),
      explicit_type_arguments,
      inferred_type_arguments,
      object,
      method_name,
    }),
    expr::E::Unary(expr::Unary { common, operator, argument }) => {
      expr::E::Unary(expr::Unary { common: f(common), operator, argument })
    }
    expr::E::Call(expr::Call { common, callee, arguments }) => {
      expr::E::Call(expr::Call { common: f(common), callee, arguments })
    }
    expr::E::Binary(expr::Binary { common, operator_preceding_comments, operator, e1, e2 }) => {
      expr::E::Binary(expr::Binary {
        common: f(common),
        operator_preceding_comments,
        operator,
        e1,
        e2,
      })
    }
    expr::E::IfElse(expr::IfElse { common, condition, e1, e2 }) => {
      expr::E::IfElse(expr::IfElse { common: f(common), condition, e1, e2 })
    }
    expr::E::Match(expr::Match { common, matched, cases }) => {
      expr::E::Match(expr::Match { common: f(common), matched, cases })
    }
    expr::E::Lambda(expr::Lambda { common, parameters, captured, body }) => {
      expr::E::Lambda(expr::Lambda { common: f(common), parameters, captured, body })
    }
    expr::E::Block(expr::Block { common, statements, expression }) => {
      expr::E::Block(expr::Block { common: f(common), statements, expression })
    }
  }
}

#[cfg(test)]
mod mod_type_tests {
  use super::mod_type;
  use crate::{
    ast::{
      source::{expr::*, Id, Literal, OptionallyAnnotatedId, NO_COMMENT_REFERENCE},
      Location, Reason,
    },
    checker::type_::{test_type_builder, Type},
    Heap, ModuleReference,
  };
  use std::{collections::HashMap, rc::Rc};

  fn common() -> ExpressionCommon<Rc<Type>> {
    ExpressionCommon::dummy(Rc::new(Type::unit_type(Reason::dummy())))
  }

  fn zero_expr() -> E<Rc<Type>> {
    E::Literal(ExpressionCommon::dummy(Rc::new(Type::unit_type(Reason::dummy()))), Literal::Int(0))
  }

  #[test]
  fn common_test() {
    let mut heap = Heap::new();
    let builder = test_type_builder::create();

    mod_type(zero_expr(), builder.bool_type());
    mod_type(E::Id(common(), Id::from(heap.alloc_str("d"))), builder.bool_type());
    mod_type(
      E::ClassFn(ClassFunction {
        common: common(),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        module_reference: ModuleReference::dummy(),
        class_name: Id::from(heap.alloc_str("name")),
        fn_name: Id::from(heap.alloc_str("name")),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::FieldAccess(FieldAccess {
        common: common(),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(zero_expr()),
        field_name: Id::from(heap.alloc_str("name")),
        field_order: -1,
      }),
      builder.bool_type(),
    );
    mod_type(
      E::MethodAccess(MethodAccess {
        common: common(),
        explicit_type_arguments: vec![],
        inferred_type_arguments: vec![],
        object: Box::new(zero_expr()),
        method_name: Id::from(heap.alloc_str("name")),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::Unary(Unary {
        common: common(),
        operator: UnaryOperator::NEG,
        argument: Box::new(zero_expr()),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::Call(Call { common: common(), callee: Box::new(zero_expr()), arguments: vec![] }),
      builder.bool_type(),
    );
    mod_type(
      E::Binary(Binary {
        common: common(),
        operator_preceding_comments: NO_COMMENT_REFERENCE,
        operator: BinaryOperator::AND,
        e1: Box::new(zero_expr()),
        e2: Box::new(zero_expr()),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::IfElse(IfElse {
        common: common(),
        condition: Box::new(zero_expr()),
        e1: Box::new(zero_expr()),
        e2: Box::new(zero_expr()),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::Match(Match {
        common: common(),
        matched: Box::new(zero_expr()),
        cases: vec![VariantPatternToExpression {
          loc: Location::dummy(),
          tag: Id::from(heap.alloc_str("name")),
          tag_order: 1,
          data_variable: None,
          body: Box::new(zero_expr()),
        }],
      }),
      builder.bool_type(),
    );
    mod_type(
      E::Lambda(Lambda {
        common: common(),
        parameters: vec![OptionallyAnnotatedId {
          name: Id::from(heap.alloc_str("name")),
          annotation: None,
        }],
        captured: HashMap::new(),
        body: Box::new(zero_expr()),
      }),
      builder.bool_type(),
    );
    mod_type(
      E::Block(Block {
        common: common(),
        statements: vec![DeclarationStatement {
          loc: Location::dummy(),
          associated_comments: NO_COMMENT_REFERENCE,
          pattern: Pattern::Object(
            Location::dummy(),
            vec![ObjectPatternDestucturedName {
              loc: Location::dummy(),
              field_order: 0,
              field_name: Id::from(heap.alloc_str("name")),
              alias: None,
              type_: builder.unit_type(),
            }],
          ),
          annotation: None,
          assigned_expression: Box::new(zero_expr()),
        }],
        expression: None,
      }),
      builder.bool_type(),
    );
  }
}

fn arguments_should_be_checked_without_hint(e: &expr::E<()>) -> bool {
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
      .or_insert_with(|| Rc::new(Type::Unknown(*function_call_reason)));
  }
  perform_fn_type_substitution(generic_function_type, &partially_solved_substitution)
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

impl<'a> TypingContext<'a> {
  fn type_meet(&mut self, heap: &Heap, general: Option<&Type>, specific: &Type) -> Type {
    if let Some(g) = general {
      contextual_type_meet(g, specific, heap, self.error_set)
    } else {
      specific.clone()
    }
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
        let substituted_bound = perform_id_type_substitution(bound, subst_map);
        if !solved_type_argument.is_the_same_type(&substituted_bound)
          && !self.is_subtype(solved_type_argument, &substituted_bound)
        {
          self.error_set.report_incompatible_subtype_error(
            solved_type_argument.get_reason().use_loc,
            substituted_bound.pretty_print(heap),
            solved_type_argument.pretty_print(heap),
          );
        }
      }
    }
  }

  fn check(
    &mut self,
    heap: &Heap,
    expression: &expr::E<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
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
    common: &expr::ExpressionCommon<()>,
    literal: &Literal,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let reason = Reason::new(common.loc, Some(common.loc));
    let kind = match &literal {
      Literal::Bool(_) => PrimitiveTypeKind::Bool,
      Literal::Int(_) => PrimitiveTypeKind::Int,
      Literal::String(_) => PrimitiveTypeKind::String,
    };
    let type_ = Rc::new(Type::Primitive(reason, kind));
    self.type_meet(heap, hint, &type_);
    expr::E::Literal(common.with_new_type(type_), *literal)
  }

  fn check_variable(
    &mut self,
    heap: &Heap,
    common: &expr::ExpressionCommon<()>,
    id: &Id,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let type_ = Rc::new(self.type_meet(heap, hint, &self.local_typing_context.read(&common.loc)));
    expr::E::Id(common.with_new_type(type_), *id)
  }

  fn check_class_fn_with_unresolved_tparams(
    &mut self,
    heap: &Heap,
    expression: &expr::ClassFunction<()>,
    hint: Option<&Type>,
  ) -> (expr::ClassFunction<Rc<Type>>, Vec<TypeParameterSignature>) {
    if let Some(class_function_type_information) = self.get_function_type(
      expression.module_reference,
      expression.class_name.name,
      expression.fn_name.name,
      expression.common.loc,
    ) {
      if !expression.explicit_type_arguments.is_empty() {
        if expression.explicit_type_arguments.len()
          == class_function_type_information.type_parameters.len()
        {
          let mut subst_map = HashMap::new();
          for (tparam, targ) in class_function_type_information
            .type_parameters
            .iter()
            .zip(&expression.explicit_type_arguments)
          {
            subst_map.insert(tparam.name, Rc::new(Type::from_annotation(targ)));
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
          let inferred_type_arguments = expression
            .explicit_type_arguments
            .iter()
            .map(|a| Rc::new(Type::from_annotation(a)))
            .collect_vec();
          let partially_checked_expr = expr::ClassFunction {
            common: expression.common.with_new_type(Rc::new(type_)),
            explicit_type_arguments: expression.explicit_type_arguments.clone(),
            inferred_type_arguments,
            module_reference: expression.module_reference,
            class_name: expression.class_name,
            fn_name: expression.fn_name,
          };
          return (partially_checked_expr, vec![]);
        }
        self.error_set.report_invalid_arity_error(
          expression.common.loc,
          "type arguments",
          class_function_type_information.type_parameters.len(),
          expression.explicit_type_arguments.len(),
        );
      } else if class_function_type_information.type_parameters.is_empty() {
        // No type parameter to solve
        let partially_checked_expr = expr::ClassFunction {
          common: expression.common.with_new_type(Rc::new(self.type_meet(
            heap,
            hint,
            &Type::Fn(class_function_type_information.type_),
          ))),
          explicit_type_arguments: expression.explicit_type_arguments.clone(),
          inferred_type_arguments: vec![],
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
            let inferred_type_arguments = class_function_type_information
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
              explicit_type_arguments: expression.explicit_type_arguments.clone(),
              inferred_type_arguments,
              module_reference: expression.module_reference,
              class_name: expression.class_name,
              fn_name: expression.fn_name,
            };
            return (partially_checked_expr, vec![]);
          }
          self.error_set.report_invalid_arity_error(
            expression.common.loc,
            "parameter",
            fun_hint.argument_types.len(),
            class_function_type_information.type_.argument_types.len(),
          );
        } else {
          self.error_set.report_incompatible_type_error(
            expression.common.loc,
            hint.pretty_print(heap),
            "function".to_string(),
          );
        }
      }
      let inferred_type_arguments = class_function_type_information
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
        .collect_vec();
      for targ in &expression.explicit_type_arguments {
        self.validate_type_instantiation_strictly(heap, &Type::from_annotation(targ));
      }
      // When hint is bad or there is no hint, we need to give up and let context help us more.
      let partially_checked_expr = expr::ClassFunction {
        common: expression
          .common
          .with_new_type(Rc::new(Type::Fn(class_function_type_information.type_.clone()))),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments,
        module_reference: expression.module_reference,
        class_name: expression.class_name,
        fn_name: expression.fn_name,
      };
      (partially_checked_expr, class_function_type_information.type_parameters.clone())
    } else {
      self.error_set.report_member_missing_error(
        expression.common.loc,
        expression.class_name.name.as_str(heap).to_string(),
        expression.fn_name.name.as_str(heap).to_string(),
      );
      let type_ = Rc::new(self.type_meet(
        heap,
        hint,
        &Type::Unknown(Reason::new(expression.common.loc, None)),
      ));
      (
        expr::ClassFunction {
          common: expression.common.with_new_type(type_),
          explicit_type_arguments: expression.explicit_type_arguments.clone(),
          inferred_type_arguments: vec![],
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
    expression: expr::E<Rc<Type>>,
    unresolved_type_parameters: Vec<TypeParameterSignature>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    if !unresolved_type_parameters.is_empty() {
      self.error_set.report_underconstrained_error(expression.loc());
    }
    let mut subst_map = HashMap::new();
    for tparam in unresolved_type_parameters {
      subst_map.insert(
        tparam.name,
        Rc::new(self.type_meet(heap, None, &Type::Unknown(Reason::new(expression.loc(), None)))),
      );
    }

    let type_ = Rc::new(self.type_meet(
      heap,
      hint,
      &perform_type_substitution(expression.type_(), &subst_map),
    ));
    match expression {
      expr::E::ClassFn(e) => expr::E::ClassFn(expr::ClassFunction {
        common: e.common.with_new_type(type_),
        explicit_type_arguments: e.explicit_type_arguments,
        inferred_type_arguments: e
          .inferred_type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &subst_map))
          .collect_vec(),
        module_reference: e.module_reference,
        class_name: e.class_name,
        fn_name: e.fn_name,
      }),
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
          .map(|it| perform_type_substitution(it, &subst_map))
          .collect_vec(),
        object: e.object,
        method_name: e.method_name,
      }),
      _ => mod_type(expression, type_),
    }
  }

  fn check_class_function(
    &mut self,
    heap: &Heap,
    expression: &expr::ClassFunction<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
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
    expression: &expr::FieldAccess<()>,
    hint: Option<&Type>,
  ) -> (FieldOrMethodAccesss, Vec<TypeParameterSignature>) {
    let checked_expression = self.check(heap, &expression.object, None);
    let obj_type = match checked_expression.type_().deref() {
      Type::Id(t) => t,
      _ => {
        self.error_set.report_incompatible_type_error(
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
          explicit_type_arguments: expression.explicit_type_arguments.clone(),
          inferred_type_arguments: vec![],
          object: Box::new(checked_expression),
          field_name: expression.field_name,
          field_order: expression.field_order,
        });
        return (partially_checked_expr, vec![]);
      }
    };
    if let Some(method_type_info) = self.get_method_type(
      obj_type.module_reference,
      obj_type.id,
      expression.field_name.name,
      obj_type.type_arguments.clone(),
      expression.common.loc,
    ) {
      // This is a valid method. We will now type check it as a method access
      for targ in &expression.explicit_type_arguments {
        self.validate_type_instantiation_strictly(heap, &Type::from_annotation(targ))
      }
      if !expression.explicit_type_arguments.is_empty() {
        if expression.explicit_type_arguments.len() == method_type_info.type_parameters.len() {
          let mut subst_map = HashMap::new();
          for (tparam, targ) in
            method_type_info.type_parameters.iter().zip(&expression.explicit_type_arguments)
          {
            subst_map.insert(tparam.name, Rc::new(Type::from_annotation(targ)));
          }
          self.validate_type_arguments(heap, &method_type_info.type_parameters, &subst_map);
          let type_ = Rc::new(self.type_meet(
            heap,
            hint,
            &Type::Fn(perform_fn_type_substitution(&method_type_info.type_, &subst_map)),
          ));
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
        self.error_set.report_invalid_arity_error(
          expression.common.loc,
          "type arguments",
          method_type_info.type_parameters.len(),
          expression.explicit_type_arguments.len(),
        );
      }
      if method_type_info.type_parameters.is_empty() {
        // No type parameter to solve
        let type_ = Rc::new(self.type_meet(heap, hint, &Type::Fn(method_type_info.type_)));
        let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
          common: expression.common.with_new_type(type_),
          explicit_type_arguments: expression.explicit_type_arguments.clone(),
          inferred_type_arguments: vec![],
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
            let inferred_type_arguments = method_type_info
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
              explicit_type_arguments: expression.explicit_type_arguments.clone(),
              inferred_type_arguments,
              object: Box::new(checked_expression),
              method_name: expression.field_name,
            });
            return (partially_checked_expr, vec![]);
          }
          self.error_set.report_invalid_arity_error(
            expression.common.loc,
            "parameter",
            fun_hint.argument_types.len(),
            method_type_info.type_.argument_types.len(),
          );
        } else {
          self.error_set.report_incompatible_type_error(
            expression.common.loc,
            hint.pretty_print(heap),
            "function".to_string(),
          );
        }
      }
      // When hint is bad or there is no hint, we need to give up and let context help us more.
      let partially_checked_expr = FieldOrMethodAccesss::Method(expr::MethodAccess {
        common: expression.common.with_new_type(Rc::new(Type::Fn(method_type_info.type_))),
        explicit_type_arguments: expression.explicit_type_arguments.clone(),
        inferred_type_arguments: method_type_info
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
      if !expression.explicit_type_arguments.is_empty() {
        self.error_set.report_invalid_arity_error(
          expression.common.loc,
          "type arguments",
          0,
          expression.explicit_type_arguments.len(),
        );
      }
      let TypeDefinitionSignature { is_object: _, names: field_names, mappings: field_mappings } =
        self.resolve_type_definition(checked_expression.type_(), true);
      if let Some((field_type, _)) = field_mappings.get(&expression.field_name.name) {
        let type_ =
          Rc::new(self.type_meet(heap, hint, &field_type.reposition(expression.common.loc)));
        let (order, _) =
          field_names.iter().find_position(|it| *it.deref() == expression.field_name.name).unwrap();
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
        self.error_set.report_member_missing_error(
          expression.field_name.loc,
          obj_type.id.as_str(heap).to_string(),
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
    &mut self,
    heap: &Heap,
    expression: &expr::FieldAccess<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
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

  fn check_unary(
    &mut self,
    heap: &Heap,
    expression: &expr::Unary<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let expected_type = Rc::new(Type::Primitive(
      Reason::new(expression.common.loc, Some(expression.common.loc)),
      match expression.operator {
        expr::UnaryOperator::NOT => PrimitiveTypeKind::Bool,
        expr::UnaryOperator::NEG => PrimitiveTypeKind::Int,
      },
    ));
    self.type_meet(heap, hint, &expected_type);
    let argument = Box::new(self.check(heap, &expression.argument, Some(&expected_type)));
    expr::E::Unary(expr::Unary {
      common: expression.common.with_new_type(expected_type),
      operator: expression.operator,
      argument,
    })
  }

  fn check_function_call_aux(
    &mut self,
    heap: &Heap,
    generic_function_type: &FunctionType,
    type_parameters: &Vec<TypeParameterSignature>,
    function_call_reason: &Reason,
    function_arguments: &Vec<expr::E<()>>,
    return_type_hint: Option<&Type>,
  ) -> FunctionCallTypeCheckingResult {
    if generic_function_type.argument_types.len() != function_arguments.len() {
      self.error_set.report_invalid_arity_error(
        function_call_reason.use_loc,
        "arguments",
        generic_function_type.argument_types.len(),
        function_arguments.len(),
      );
      return FunctionCallTypeCheckingResult {
        solved_generic_type: generic_function_type.clone(),
        solved_return_type: Type::Unknown(*function_call_reason),
        solved_substitution: HashMap::new(),
        checked_arguments: function_arguments.iter().map(|e| self.check(heap, e, None)).collect(),
      };
    }
    // Phase 0: Initial Synthesis -> Vec<(Expr, checked)>
    let mut partially_checked_arguments = vec![];
    let mut checked_argument_types = vec![];
    for arg in function_arguments {
      if arguments_should_be_checked_without_hint(arg) {
        let checked = self.check(heap, arg, None);
        checked_argument_types.push(checked.type_().clone());
        partially_checked_arguments.push(MaybeCheckedExpression::Checked(checked));
      } else {
        let loc = arg.loc();
        let unknown_t = Rc::new(Type::Unknown(Reason::new(loc, Some(loc))));
        checked_argument_types.push(unknown_t.clone());
        partially_checked_arguments.push(MaybeCheckedExpression::Unchecked(arg, unknown_t));
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
      let best_effort_instantiated_function_type = solve_type_arguments(
        function_call_reason,
        generic_function_type,
        type_parameters,
        &checked_argument_types.iter().map(|t| t.deref().clone()).collect_vec(),
        return_type_hint,
      );
      match maybe_checked_expr {
        MaybeCheckedExpression::Checked(e) => {
          contextual_type_meet(
            &best_effort_instantiated_function_type.argument_types[i],
            e.type_(),
            heap,
            self.error_set,
          );
          checked_arguments.push(e)
        }
        MaybeCheckedExpression::Unchecked(e, t) => {
          let hint = contextual_type_meet(
            &best_effort_instantiated_function_type.argument_types[i],
            &t,
            heap,
            self.error_set,
          );
          let fully_checked_expr = self.check(heap, e, Some(&hint));
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
      self.error_set.report_underconstrained_error(function_call_reason.use_loc);
    }
    for type_parameter in still_unresolved_type_parameters {
      fully_solved_substitution
        .insert(type_parameter.name, Rc::new(Type::Unknown(*function_call_reason)));
    }
    let fully_solved_generic_type =
      perform_fn_type_substitution(generic_function_type, &fully_solved_substitution);
    let fully_solved_concrete_return_type = contextual_type_meet(
      &return_type_hint.cloned().unwrap_or(Type::Unknown(*function_call_reason)),
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
    expression: &expr::Call<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let (partially_checked_callee, unresolved_tparams) = match expression.callee.deref() {
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
    let partially_checked_callee_type = partially_checked_callee.type_().deref();
    let callee_function_type = match partially_checked_callee_type {
      Type::Fn(fn_type) => fn_type,
      t => {
        if !matches!(t, Type::Unknown(_)) {
          self.error_set.report_incompatible_type_error(
            expression.common.loc,
            "function".to_string(),
            t.pretty_print(heap),
          );
        }
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
          arguments: expression.arguments.iter().map(|e| self.check(heap, e, None)).collect(),
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
      &expression.arguments,
      hint,
    );
    let fully_resolved_checked_callee =
      mod_type(partially_checked_callee, Rc::new(Type::Fn(solved_generic_type)));
    let callee_with_patched_targs = match fully_resolved_checked_callee {
      expr::E::ClassFn(class_fn) => expr::E::ClassFn(expr::ClassFunction {
        common: class_fn.common,
        explicit_type_arguments: class_fn.explicit_type_arguments,
        inferred_type_arguments: class_fn
          .inferred_type_arguments
          .iter()
          .map(|it| perform_type_substitution(it, &solved_substitution))
          .collect_vec(),
        module_reference: class_fn.module_reference,
        class_name: class_fn.class_name,
        fn_name: class_fn.fn_name,
      }),
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
    expression: &expr::Binary<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
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
      expr::BinaryOperator::CONCAT => Type::Primitive(
        Reason::new(expression.common.loc, Some(expression.common.loc)),
        PrimitiveTypeKind::String,
      ),
    });
    self.type_meet(heap, hint, &expected_type);
    match expression.operator {
      expr::BinaryOperator::MUL
      | expr::BinaryOperator::DIV
      | expr::BinaryOperator::MOD
      | expr::BinaryOperator::PLUS
      | expr::BinaryOperator::MINUS
      | expr::BinaryOperator::AND
      | expr::BinaryOperator::OR
      | expr::BinaryOperator::CONCAT => {
        let e1 = Box::new(self.check(heap, &expression.e1, Some(&expected_type)));
        let e2 = Box::new(self.check(heap, &expression.e2, Some(&expected_type)));
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
        let e1 = Box::new(self.check(heap, &expression.e1, Some(&child_type_hint)));
        let e2 = Box::new(self.check(heap, &expression.e2, Some(&child_type_hint)));
        expr::E::Binary(expr::Binary {
          common: expression.common.with_new_type(expected_type),
          operator_preceding_comments: expression.operator_preceding_comments,
          operator: expression.operator,
          e1,
          e2,
        })
      }
      expr::BinaryOperator::EQ | expr::BinaryOperator::NE => {
        let e1 = Box::new(self.check(heap, &expression.e1, None));
        let e2 = Box::new(self.check(heap, &expression.e2, Some(e1.type_())));
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
    &mut self,
    heap: &Heap,
    expression: &expr::IfElse<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let condition = Box::new(self.check(heap, &expression.condition, None));
    let e1 = Box::new(self.check(heap, &expression.e1, hint));
    let e2 = Box::new(self.check(heap, &expression.e2, Some(e1.type_())));
    let type_ = e2.type_().reposition(expression.common.loc);
    expr::E::IfElse(expr::IfElse {
      common: expression.common.with_new_type(Rc::new(type_)),
      condition,
      e1,
      e2,
    })
  }

  fn check_match(
    &mut self,
    heap: &Heap,
    expression: &expr::Match<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let checked_matched = self.check(heap, &expression.matched, None);
    let checked_matched_type = checked_matched.type_().deref();
    let TypeDefinitionSignature { is_object: _, names: variant_names, mappings: variant_mappings } =
      self.resolve_type_definition(checked_matched_type, false);
    let mut unused_mappings = variant_mappings;
    let mut checked_cases = vec![];
    let mut matching_list_types = vec![];
    for expr::VariantPatternToExpression { loc, tag, tag_order: _, data_variable, body } in
      &expression.cases
    {
      let mapping_data_type = match unused_mappings.remove(&tag.name) {
        Some((field_type, _)) => field_type,
        None => {
          self.error_set.report_member_missing_error(
            tag.loc,
            checked_matched_type.pretty_print(heap),
            tag.name.as_str(heap).to_string(),
          );
          continue;
        }
      };
      let (checked_body, checked_data_variable) = if let Some((data_variable, _)) = data_variable {
        self.local_typing_context.write(data_variable.loc, mapping_data_type.clone());
        (self.check(heap, body, hint), Some((*data_variable, mapping_data_type)))
      } else {
        (self.check(heap, body, hint), None)
      };
      let (tag_order, _) = variant_names.iter().find_position(|n| tag.name.eq(n)).unwrap();
      matching_list_types.push(checked_body.type_().clone());
      checked_cases.push(expr::VariantPatternToExpression {
        loc: *loc,
        tag: *tag,
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
    expression: &expr::Lambda<()>,
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
                Rc::new(Type::from_annotation(annot))
              } else {
                Rc::new(Type::Unknown(Reason::new(parameter.name.loc, None)))
              };
              let type_ = Rc::new(self.type_meet(heap, Some(parameter_hint), &annot));
              self.local_typing_context.write(parameter.name.loc, type_.clone());
              type_
            })
            .collect_vec();
        } else {
          self.error_set.report_invalid_arity_error(
            expression.common.loc,
            "function arguments",
            fun_hint.argument_types.len(),
            expression.parameters.len(),
          )
        }
      } else {
        self.error_set.report_incompatible_type_error(
          expression.common.loc,
          hint.pretty_print(heap),
          "function type".to_string(),
        );
      }
    }
    let mut types_ = vec![];
    for OptionallyAnnotatedId { name, annotation } in &expression.parameters {
      let type_ = if let Some(annot) = annotation {
        Rc::new(Type::from_annotation(annot))
      } else {
        self.error_set.report_underconstrained_error(name.loc);
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
    expression: &expr::Lambda<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    let argument_types = self.infer_lambda_parameter_types(heap, expression, hint);
    let body = self.check(
      heap,
      &expression.body,
      if let Some(Type::Fn(fun_hint)) = hint { Some(&fun_hint.return_type) } else { None },
    );
    let captured = self.local_typing_context.get_captured(heap, &expression.common.loc);
    let type_ = Type::Fn(FunctionType {
      reason: Reason::new(expression.common.loc, None),
      argument_types,
      return_type: body.type_().clone(),
    });
    expr::E::Lambda(expr::Lambda {
      common: expression.common.with_new_type(Rc::new(type_)),
      parameters: expression.parameters.clone(),
      captured,
      body: Box::new(body),
    })
  }

  fn check_statement(
    &mut self,
    heap: &Heap,
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
      self.validate_type_instantiation_strictly(heap, &t);
      Some(t)
    } else {
      None
    };
    let checked_assigned_expr = self.check(heap, assigned_expression, hint.as_ref());
    let checked_assigned_expr_type = checked_assigned_expr.type_();
    let checked_pattern = match pattern {
      expr::Pattern::Object(pattern_loc, destructed_names) => {
        let TypeDefinitionSignature { is_object: _, names: field_names, mappings: field_mappings } =
          self.resolve_type_definition(checked_assigned_expr_type, true);
        let mut field_order_mapping = HashMap::new();
        for (i, name) in field_names.into_iter().enumerate() {
          field_order_mapping.insert(name, i);
        }
        let mut checked_destructured_names = vec![];
        for ObjectPatternDestucturedName { loc, field_order, field_name, alias, type_: _ } in
          destructed_names
        {
          if let Some((field_type, _)) = field_mappings.get(&field_name.name) {
            let write_loc = if let Some(alias) = &alias { alias.loc } else { field_name.loc };
            self.local_typing_context.write(write_loc, field_type.clone());
            let field_order = field_order_mapping.get(&field_name.name).unwrap();
            checked_destructured_names.push(ObjectPatternDestucturedName {
              loc: *loc,
              field_order: *field_order,
              field_name: *field_name,
              alias: *alias,
              type_: Rc::new(field_type.reposition(*loc)),
            });
            continue;
          }
          self.error_set.report_member_missing_error(
            field_name.loc,
            checked_assigned_expr_type.pretty_print(heap),
            field_name.name.as_str(heap).to_string(),
          );
          checked_destructured_names.push(ObjectPatternDestucturedName {
            loc: *loc,
            field_order: *field_order,
            field_name: *field_name,
            alias: *alias,
            type_: Rc::new(Type::Unknown(Reason::new(*loc, Some(*loc)))),
          });
        }
        expr::Pattern::Object(*pattern_loc, checked_destructured_names)
      }
      expr::Pattern::Id(loc, name) => {
        self.local_typing_context.write(*loc, checked_assigned_expr_type.clone());
        expr::Pattern::Id(*loc, *name)
      }
      expr::Pattern::Wildcard(loc) => expr::Pattern::Wildcard(*loc),
    };
    expr::DeclarationStatement {
      loc: *loc,
      associated_comments: *associated_comments,
      pattern: checked_pattern,
      annotation: annotation.clone(),
      assigned_expression: Box::new(checked_assigned_expr),
    }
  }

  fn check_block(
    &mut self,
    heap: &Heap,
    expression: &expr::Block<()>,
    hint: Option<&Type>,
  ) -> expr::E<Rc<Type>> {
    if expression.expression.is_none() {
      self.type_meet(
        heap,
        hint,
        &Type::Primitive(Reason::new(expression.common.loc, None), PrimitiveTypeKind::Unit),
      );
    }
    let statements =
      expression.statements.iter().map(|it| self.check_statement(heap, it)).collect_vec();
    let checked_final_expr =
      expression.expression.as_ref().map(|e| Box::new(self.check(heap, e, hint)));
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
}

pub(super) fn type_check_expression(
  cx: &mut TypingContext,
  heap: &Heap,
  expression: &expr::E<()>,
  hint: Option<&Type>,
) -> expr::E<Rc<Type>> {
  cx.check(heap, expression, hint)
}

fn type_params_to_type_params_sig(
  type_parameters: &[TypeParameter],
) -> Vec<TypeParameterSignature> {
  type_parameters
    .iter()
    .map(|it| TypeParameterSignature {
      name: it.name.name,
      bound: it.bound.as_ref().map(|b| Rc::new(IdType::from_annotation(b))),
    })
    .collect_vec()
}

fn validate_signature_types(
  toplevel: &Toplevel<()>,
  global_cx: &GlobalSignature,
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
      cx.validate_type_instantiation_allow_abstract_types(
        heap,
        &Type::Id(IdType::from_annotation(bound)),
      );
    }
  }
  for node in toplevel.extends_or_implements_nodes() {
    cx.validate_type_instantiation_allow_abstract_types(
      heap,
      &Type::Id(IdType::from_annotation(node)),
    );
  }
  if let Some(type_definition) = toplevel.type_definition() {
    match type_definition {
      TypeDefinition::Struct { loc: _, fields } => {
        for field in fields {
          cx.validate_type_instantiation_strictly(heap, &Type::from_annotation(&field.annotation))
        }
      }
      TypeDefinition::Enum { loc: _, variants } => {
        for variant in variants {
          cx.validate_type_instantiation_strictly(
            heap,
            &Type::from_annotation(&variant.associated_data_type),
          )
        }
      }
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
        member_cx.validate_type_instantiation_allow_abstract_types(
          heap,
          &Type::Id(IdType::from_annotation(bound)),
        );
      }
    }
    member_cx.validate_type_instantiation_strictly(
      heap,
      &Type::Fn(FunctionType::from_annotation(&member.type_)),
    );
  }
}

fn check_class_member_conformance_with_signature(
  heap: &Heap,
  error_set: &mut ErrorSet,
  expected: &MemberSignature,
  actual: &ClassMemberDeclaration,
) {
  if expected.type_parameters.len() != actual.type_parameters.len() {
    error_set.report_invalid_arity_error(
      actual.type_.location,
      "type parameters",
      expected.type_parameters.len(),
      actual.type_parameters.len(),
    );
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
        if !e_bound.is_the_same_type(&IdType::from_annotation(a_bound)) {
          has_type_parameter_conformance_errors = true;
        }
      }
    }
  }
  if has_type_parameter_conformance_errors {
    error_set.report_type_parameter_mismatch_error(
      actual.type_.location,
      TypeParameterSignature::pretty_print_list(&expected.type_parameters, heap),
    );
  } else {
    let actual_fn_type = FunctionType::from_annotation(&actual.type_);
    if !expected.type_.is_the_same_type(&actual_fn_type) {
      error_set.report_incompatible_type_error(
        actual.type_.location,
        expected.type_.pretty_print(heap),
        actual_fn_type.pretty_print(heap),
      );
    }
  }
}

pub(crate) fn type_check_module(
  module_reference: ModuleReference,
  module: &Module<()>,
  global_cx: &GlobalSignature,
  heap: &Heap,
  error_set: &mut ErrorSet,
) -> (Module<Rc<Type>>, LocalTypingContext) {
  let mut local_cx =
    LocalTypingContext::new(perform_ssa_analysis_on_module(module, heap, error_set));

  for one_import in module.imports.iter() {
    if let Some(module_cx) = global_cx.get(&one_import.imported_module) {
      for id in one_import.imported_members.iter() {
        if !module_cx.interfaces.contains_key(&id.name) {
          error_set.report_missing_export_error(id.loc, one_import.imported_module, id.name);
        }
      }
    } else {
      error_set.report_cannot_unresolve_module_error(one_import.loc, one_import.imported_module);
    }
  }

  for toplevel in &module.toplevels {
    validate_signature_types(toplevel, global_cx, &mut local_cx, module_reference, heap, error_set);
    let id_type = IdType {
      reason: Reason::new(toplevel.name().loc, None),
      module_reference,
      id: toplevel.name().name,
      type_arguments: toplevel
        .type_parameters()
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
    };
    let global_signature::SuperTypesResolutionResult { types: resolved_super_types, is_cyclic } =
      global_signature::resolve_all_transitive_super_types(global_cx, &id_type);
    if is_cyclic {
      error_set
        .report_cyclic_type_definition_error(id_type.reason.use_loc, id_type.pretty_print(heap));
    }
    for super_type in &resolved_super_types {
      if global_cx
        .get(&super_type.module_reference)
        .and_then(|it| it.interfaces.get(&super_type.id))
        .map(|it| it.type_definition.is_some())
        .unwrap_or(false)
      {
        error_set.report_incompatible_type_error(
          super_type.reason.use_loc,
          "interface type".to_string(),
          "class type".to_string(),
        );
      }
    }
    for member in toplevel.members_iter() {
      let has_interface_def = if member.is_method {
        let resolved = global_signature::resolve_all_method_signatures(
          global_cx,
          &resolved_super_types,
          member.name.name,
        );
        for expected in &resolved {
          check_class_member_conformance_with_signature(heap, error_set, expected, member);
        }
        !resolved.is_empty()
      } else {
        let resolved = global_signature::resolve_all_function_signatures(
          global_cx,
          &resolved_super_types,
          member.name.name,
        );
        for expected in &resolved {
          check_class_member_conformance_with_signature(heap, error_set, expected, member);
        }
        !resolved.is_empty()
      };
      if !member.is_public && has_interface_def {
        error_set.report_incompatible_type_error(
          member.loc,
          "public class member".to_string(),
          "private class member".to_string(),
        );
      }
    }
    if let Toplevel::Class(c) = toplevel {
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
          missing_function_members.remove(&heap.get_allocated_str_opt("init").unwrap());
        }
        TypeDefinition::Enum { loc: _, variants } => {
          for variant in variants {
            missing_function_members.remove(&variant.name.name);
          }
        }
      }
      missing_function_members.extend(&missing_method_members);
      if !missing_function_members.is_empty() {
        error_set.report_missing_definition_error(
          toplevel.loc(),
          missing_function_members.iter().sorted().map(|p| p.as_str(heap).to_string()).collect(),
        );
      }
    }
    if let Toplevel::Class(c) = toplevel {
      local_cx.write(c.loc, Rc::new(Type::Id(id_type)));
    }
    for member in toplevel.members_iter() {
      for param in member.parameters.iter() {
        local_cx.write(param.name.loc, Rc::new(Type::from_annotation(&param.annotation)));
      }
    }
  }

  let mut checked_toplevels = vec![];
  for toplevel in &module.toplevels {
    let checked = match toplevel {
      Toplevel::Interface(i) => Toplevel::Interface(i.clone()),
      Toplevel::Class(c) => {
        let mut checked_members = vec![];
        for member in &c.members {
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
          let body_type_hint = Type::from_annotation(&member.decl.type_.return_type);
          checked_members.push(ClassMemberDefinition {
            decl: member.decl.clone(),
            body: type_check_expression(&mut cx, heap, &member.body, Some(&body_type_hint)),
          });
        }
        Toplevel::Class(InterfaceDeclarationCommon {
          loc: c.loc,
          associated_comments: c.associated_comments,
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
    },
    local_cx,
  )
}
