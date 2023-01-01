use super::{
  loc::{Location, ModuleReference},
  reason::Reason,
};
use crate::common::{rcs, Str};
use enum_as_inner::EnumAsInner;
use itertools::join;
use std::{collections::HashMap, sync::Arc};

#[derive(Clone, PartialEq, Eq)]
pub(crate) enum CommentKind {
  LINE,
  BLOCK,
  DOC,
}

#[derive(Clone)]
pub(crate) struct Comment {
  pub(crate) kind: CommentKind,
  pub(crate) text: Str,
}

#[derive(Clone)]
pub(crate) enum Literal {
  Bool(bool),
  Int(i32),
  String(Str),
}

impl Literal {
  pub(crate) fn true_literal() -> Literal {
    Literal::Bool(true)
  }
  pub(crate) fn false_literal() -> Literal {
    Literal::Bool(false)
  }

  pub(crate) fn int_literal(i: i32) -> Literal {
    Literal::Int(i)
  }

  pub(crate) fn string_literal(s: Str) -> Literal {
    Literal::String(s)
  }

  pub(crate) fn pretty_print(&self) -> String {
    match self {
      Self::Bool(true) => "true".to_string(),
      Self::Bool(false) => "false".to_string(),
      Self::Int(i) => i.to_string(),
      Self::String(s) => format!("\"{}\"", s),
    }
  }
}

#[derive(Copy, Clone, PartialEq, Eq)]
pub(crate) enum PrimitiveTypeKind {
  Unit,
  Bool,
  Int,
  String,
}

impl ToString for PrimitiveTypeKind {
  fn to_string(&self) -> String {
    match self {
      Self::Unit => "unit".to_string(),
      Self::Bool => "bool".to_string(),
      Self::Int => "int".to_string(),
      Self::String => "string".to_string(),
    }
  }
}

pub(crate) trait ISourceType {
  fn pretty_print(&self) -> String;
  fn is_the_same_type(&self, other: &Self) -> bool;
}

#[derive(Clone)]
pub(crate) struct IdType {
  pub(crate) reason: Reason,
  pub(crate) module_reference: ModuleReference,
  pub(crate) id: Str,
  pub(crate) type_arguments: Vec<Arc<Type>>,
}

impl ISourceType for IdType {
  fn pretty_print(&self) -> String {
    let IdType { reason: _, module_reference: _, id, type_arguments } = self;
    if type_arguments.is_empty() {
      id.to_string()
    } else {
      format!("{}<{}>", id, join(type_arguments.iter().map(|t| t.pretty_print()), ", "))
    }
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    let IdType { module_reference: mod_ref1, id: id1, type_arguments: targs1, .. } = self;
    let IdType { module_reference: mod_ref2, id: id2, type_arguments: targs2, .. } = other;
    mod_ref1 == mod_ref2
      && id1 == id2
      && targs1.len() == targs2.len()
      && targs1.iter().zip(targs2.iter()).all(|(a, b)| a.is_the_same_type(b))
  }
}

impl IdType {
  pub(crate) fn reposition(self, use_loc: Location) -> IdType {
    IdType {
      reason: self.reason.to_use_reason(use_loc),
      module_reference: self.module_reference,
      id: self.id,
      type_arguments: self.type_arguments,
    }
  }
}

#[derive(Clone)]
pub(crate) struct FunctionType {
  pub(crate) reason: Reason,
  pub(crate) argument_types: Vec<Arc<Type>>,
  pub(crate) return_type: Arc<Type>,
}

impl ISourceType for FunctionType {
  fn pretty_print(&self) -> String {
    let FunctionType { reason: _, argument_types, return_type } = self;
    format!(
      "({}) -> {}",
      join(argument_types.iter().map(|t| t.pretty_print()), ", "),
      return_type.pretty_print()
    )
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    let FunctionType { reason: _, argument_types: arguments1, return_type: return_t1 } = self;
    let FunctionType { reason: _, argument_types: arguments2, return_type: return_t2 } = other;
    arguments1.len() == arguments2.len()
      && arguments1.iter().zip(arguments2.iter()).all(|(a, b)| a.is_the_same_type(b))
      && return_t1.is_the_same_type(return_t2)
  }
}

impl FunctionType {
  pub(crate) fn reposition(self, use_loc: Location) -> FunctionType {
    FunctionType {
      reason: self.reason.to_use_reason(use_loc),
      argument_types: self.argument_types,
      return_type: self.return_type,
    }
  }
}

#[derive(Clone, EnumAsInner)]
pub(crate) enum Type {
  Unknown(Reason),
  Primitive(Reason, PrimitiveTypeKind),
  Id(IdType),
  Fn(FunctionType),
}

impl ISourceType for Type {
  fn pretty_print(&self) -> String {
    match self {
      Self::Unknown(_) => String::from("unknown"),
      Self::Primitive(_, p) => p.to_string(),
      Self::Id(id_type) => id_type.pretty_print(),
      Self::Fn(fn_type) => fn_type.pretty_print(),
    }
  }

  fn is_the_same_type(&self, other: &Self) -> bool {
    match (self, other) {
      (Self::Unknown(_), Self::Unknown(_)) => true,
      (Self::Primitive(_, p1), Self::Primitive(_, p2)) => *p1 == *p2,
      (Self::Id(id1), Self::Id(id2)) => id1.is_the_same_type(id2),
      (Self::Fn(f1), Self::Fn(f2)) => f1.is_the_same_type(f2),
      _ => false,
    }
  }
}

impl Type {
  pub(crate) fn unit_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Unit)
  }
  pub(crate) fn bool_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Bool)
  }
  pub(crate) fn int_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::Int)
  }
  pub(crate) fn string_type(reason: Reason) -> Type {
    Type::Primitive(reason, PrimitiveTypeKind::String)
  }

  pub(crate) fn get_reason(&self) -> &Reason {
    match self {
      Self::Unknown(reason) => reason,
      Self::Primitive(reason, _) => reason,
      Self::Id(IdType { reason, .. }) => reason,
      Self::Fn(FunctionType { reason, .. }) => reason,
    }
  }

  pub(crate) fn mod_reason<F: FnOnce(&Reason) -> Reason>(&self, f: F) -> Type {
    match self {
      Self::Unknown(reason) => Type::Unknown(f(reason)),
      Self::Primitive(reason, p) => Type::Primitive(f(reason), *p),
      Self::Id(IdType { reason, module_reference, id, type_arguments }) => Type::Id(IdType {
        reason: f(reason),
        module_reference: module_reference.clone(),
        id: id.clone(),
        type_arguments: type_arguments.clone(),
      }),
      Self::Fn(FunctionType { reason, argument_types, return_type }) => Type::Fn(FunctionType {
        reason: f(reason),
        argument_types: argument_types.clone(),
        return_type: return_type.clone(),
      }),
    }
  }

  pub(crate) fn reposition(&self, use_loc: Location) -> Type {
    self.mod_reason(|r| r.to_use_reason(use_loc))
  }
}

#[derive(Clone)]
pub(crate) struct TypeParameterSignature {
  pub(crate) name: Str,
  pub(crate) bound: Option<Arc<IdType>>,
}

impl TypeParameterSignature {
  pub(crate) fn pretty_print(&self) -> String {
    match &self.bound {
      Option::None => self.name.to_string(),
      Option::Some(id_type) => format!("{} : {}", self.name, id_type.pretty_print()),
    }
  }

  pub(crate) fn pretty_print_list(list: &Vec<TypeParameterSignature>) -> String {
    if list.is_empty() {
      "".to_string()
    } else {
      format!("<{}>", list.iter().map(|t| t.pretty_print()).collect::<Vec<_>>().join(", "))
    }
  }
}

#[derive(Clone)]
pub(crate) struct Id {
  pub(crate) loc: Location,
  pub(crate) associated_comments: Arc<Vec<Comment>>,
  pub(crate) name: Str,
}

impl Id {
  pub(crate) fn from(name: &'static str) -> Id {
    Id { loc: Location::dummy(), associated_comments: Arc::new(vec![]), name: rcs(name) }
  }
}

#[derive(Clone)]
pub(crate) struct OptionallyAnnotatedId {
  pub(crate) name: Id,
  pub(crate) annotation: Option<Arc<Type>>,
}

pub(crate) struct AnnotatedId {
  pub(crate) name: Id,
  pub(crate) annotation: Arc<Type>,
}

pub(crate) mod expr {
  use super::super::loc::{Location, ModuleReference};
  use super::{Comment, Id, Literal, OptionallyAnnotatedId, Type};
  use crate::common::Str;
  use std::collections::HashMap;
  use std::sync::Arc;

  #[derive(Clone)]
  pub(crate) struct ExpressionCommon {
    pub(crate) loc: Location,
    pub(crate) associated_comments: Arc<Vec<Comment>>,
    pub(crate) type_: Arc<Type>,
  }

  impl ExpressionCommon {
    pub(crate) fn with_new_type(self, type_: Arc<Type>) -> ExpressionCommon {
      ExpressionCommon { loc: self.loc, associated_comments: self.associated_comments, type_ }
    }
  }

  #[derive(Clone)]
  pub(crate) struct ClassFunction {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Arc<Type>>,
    pub(crate) module_reference: ModuleReference,
    pub(crate) class_name: Id,
    pub(crate) fn_name: Id,
  }

  #[derive(Clone)]
  pub(crate) struct FieldAccess {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Arc<Type>>,
    pub(crate) object: Box<E>,
    pub(crate) field_name: Id,
    pub(crate) field_order: i32,
  }

  #[derive(Clone)]
  pub(crate) struct MethodAccess {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Arc<Type>>,
    pub(crate) object: Box<E>,
    pub(crate) method_name: Id,
  }

  #[derive(Copy, Clone)]
  pub(crate) enum UnaryOperator {
    NOT,
    NEG,
  }

  impl ToString for UnaryOperator {
    fn to_string(&self) -> String {
      match self {
        Self::NOT => "!".to_string(),
        Self::NEG => "-".to_string(),
      }
    }
  }

  #[derive(Clone)]
  pub(crate) struct Unary {
    pub(crate) common: ExpressionCommon,
    pub(crate) operator: UnaryOperator,
    pub(crate) argument: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct Call {
    pub(crate) common: ExpressionCommon,
    pub(crate) callee: Box<E>,
    pub(crate) arguments: Vec<E>,
  }

  #[derive(Copy, Clone)]
  pub(crate) enum BinaryOperator {
    MUL,
    DIV,
    MOD,
    PLUS,
    MINUS,
    LT,
    LE,
    GT,
    GE,
    EQ,
    NE,
    AND,
    OR,
    CONCAT,
  }

  impl ToString for BinaryOperator {
    fn to_string(&self) -> String {
      match self {
        BinaryOperator::MUL => "*".to_string(),
        BinaryOperator::DIV => "/".to_string(),
        BinaryOperator::MOD => "%".to_string(),
        BinaryOperator::PLUS => "+".to_string(),
        BinaryOperator::MINUS => "-".to_string(),
        BinaryOperator::CONCAT => "::".to_string(),
        BinaryOperator::LT => "<".to_string(),
        BinaryOperator::LE => "<=".to_string(),
        BinaryOperator::GT => ">".to_string(),
        BinaryOperator::GE => ">=".to_string(),
        BinaryOperator::EQ => "==".to_string(),
        BinaryOperator::NE => "!=".to_string(),
        BinaryOperator::AND => "&&".to_string(),
        BinaryOperator::OR => "||".to_string(),
      }
    }
  }

  impl BinaryOperator {
    pub(crate) fn precedence(&self) -> i32 {
      match self {
        BinaryOperator::MUL => 0,
        BinaryOperator::DIV => 0,
        BinaryOperator::MOD => 0,
        BinaryOperator::PLUS => 1,
        BinaryOperator::MINUS => 1,
        BinaryOperator::CONCAT => 1,
        BinaryOperator::LT => 2,
        BinaryOperator::LE => 2,
        BinaryOperator::GT => 2,
        BinaryOperator::GE => 2,
        BinaryOperator::EQ => 2,
        BinaryOperator::NE => 2,
        BinaryOperator::AND => 3,
        BinaryOperator::OR => 4,
      }
    }
  }

  #[derive(Clone)]
  pub(crate) struct Binary {
    pub(crate) common: ExpressionCommon,
    pub(crate) operator_preceding_comments: Vec<Comment>,
    pub(crate) operator: BinaryOperator,
    pub(crate) e1: Box<E>,
    pub(crate) e2: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct IfElse {
    pub(crate) common: ExpressionCommon,
    pub(crate) condition: Box<E>,
    pub(crate) e1: Box<E>,
    pub(crate) e2: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct VariantPatternToExpression {
    pub(crate) loc: Location,
    pub(crate) tag: Id,
    pub(crate) tag_order: usize,
    pub(crate) data_variable: Option<(Id, Arc<Type>)>,
    pub(crate) body: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct Match {
    pub(crate) common: ExpressionCommon,
    pub(crate) matched: Box<E>,
    pub(crate) cases: Vec<VariantPatternToExpression>,
  }

  #[derive(Clone)]
  pub(crate) struct Lambda {
    pub(crate) common: ExpressionCommon,
    pub(crate) parameters: Vec<OptionallyAnnotatedId>,
    pub(crate) captured: HashMap<Str, Arc<Type>>,
    pub(crate) body: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct ObjectPatternDestucturedName {
    pub(crate) loc: Location,
    pub(crate) field_order: usize,
    pub(crate) field_name: Id,
    pub(crate) alias: Option<Id>,
    pub(crate) type_: Arc<Type>,
  }

  #[derive(Clone)]
  pub(crate) enum Pattern {
    Object(Location, Vec<ObjectPatternDestucturedName>),
    Id(Location, Str),
    Wildcard(Location),
  }

  #[derive(Clone)]
  pub(crate) struct DeclarationStatement {
    pub(crate) loc: Location,
    pub(crate) associated_comments: Vec<Comment>,
    pub(crate) pattern: Pattern,
    pub(crate) annotation: Option<Arc<Type>>,
    pub(crate) assigned_expression: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct Block {
    pub(crate) common: ExpressionCommon,
    pub(crate) statements: Vec<DeclarationStatement>,
    pub(crate) expression: Option<Box<E>>,
  }

  #[derive(Clone)]
  pub(crate) enum E {
    Literal(ExpressionCommon, Literal),
    This(ExpressionCommon),
    Id(ExpressionCommon, Id),
    ClassFn(ClassFunction),
    FieldAccess(FieldAccess),
    MethodAccess(MethodAccess),
    Unary(Unary),
    Call(Call),
    Binary(Binary),
    IfElse(IfElse),
    Match(Match),
    Lambda(Lambda),
    Block(Block),
  }

  impl E {
    pub(crate) fn common(&self) -> &ExpressionCommon {
      match self {
        E::Literal(common, _)
        | E::This(common)
        | E::Id(common, _)
        | E::ClassFn(ClassFunction { common, .. })
        | E::FieldAccess(FieldAccess { common, .. })
        | E::MethodAccess(MethodAccess { common, .. })
        | E::Unary(Unary { common, .. })
        | E::Call(Call { common, .. })
        | E::Binary(Binary { common, .. })
        | E::IfElse(IfElse { common, .. })
        | E::Match(Match { common, .. })
        | E::Lambda(Lambda { common, .. })
        | E::Block(Block { common, .. }) => common,
      }
    }

    pub(crate) fn loc(&self) -> &Location {
      &self.common().loc
    }

    pub(crate) fn type_(&self) -> Arc<Type> {
      self.common().type_.clone()
    }

    pub(crate) fn precedence(&self) -> i32 {
      match self {
        E::Literal(_, _) | E::This(_) | E::Id(_, _) => 0,
        E::ClassFn(_) => 1,
        E::FieldAccess(_) | E::MethodAccess(_) | E::Call(_) | E::Block(_) => 2,
        E::Unary(_) => 3,
        E::Binary(b) => 5 + b.operator.precedence(),
        E::IfElse(_) => 11,
        E::Match(_) => 12,
        E::Lambda(_) => 13,
      }
    }

    pub(crate) fn mod_common<F: FnOnce(ExpressionCommon) -> ExpressionCommon>(self, f: F) -> E {
      match self {
        E::Literal(common, l) => E::Literal(f(common), l),
        E::This(common) => E::This(f(common)),
        E::Id(common, id) => E::Id(f(common), id),
        E::ClassFn(ClassFunction {
          common,
          type_arguments,
          module_reference,
          class_name,
          fn_name,
        }) => E::ClassFn(ClassFunction {
          common: f(common),
          type_arguments,
          module_reference,
          class_name,
          fn_name,
        }),
        E::FieldAccess(FieldAccess { common, type_arguments, object, field_name, field_order }) => {
          E::FieldAccess(FieldAccess {
            common: f(common),
            type_arguments,
            object,
            field_name,
            field_order,
          })
        }
        E::MethodAccess(MethodAccess { common, type_arguments, object, method_name }) => {
          E::MethodAccess(MethodAccess { common: f(common), type_arguments, object, method_name })
        }
        E::Unary(Unary { common, operator, argument }) => {
          E::Unary(Unary { common: f(common), operator, argument })
        }
        E::Call(Call { common, callee, arguments }) => {
          E::Call(Call { common: f(common), callee, arguments })
        }
        E::Binary(Binary { common, operator_preceding_comments, operator, e1, e2 }) => {
          E::Binary(Binary { common: f(common), operator_preceding_comments, operator, e1, e2 })
        }
        E::IfElse(IfElse { common, condition, e1, e2 }) => {
          E::IfElse(IfElse { common: f(common), condition, e1, e2 })
        }
        E::Match(Match { common, matched, cases }) => {
          E::Match(Match { common: f(common), matched, cases })
        }
        E::Lambda(Lambda { common, parameters, captured, body }) => {
          E::Lambda(Lambda { common: f(common), parameters, captured, body })
        }
        E::Block(Block { common, statements, expression }) => {
          E::Block(Block { common: f(common), statements, expression })
        }
      }
    }
  }
}

#[derive(Clone)]
pub(crate) struct TypeParameter {
  pub(crate) loc: Location,
  pub(crate) associated_comments: Arc<Vec<Comment>>,
  pub(crate) name: Id,
  pub(crate) bound: Option<Arc<IdType>>,
}

impl TypeParameter {
  pub(crate) fn pretty_print(&self) -> String {
    if let Some(bound) = &self.bound {
      format!("{}: {}", self.name.name, bound.pretty_print())
    } else {
      self.name.name.to_string()
    }
  }
}

#[derive(Clone)]
pub(crate) struct ClassMemberDeclaration {
  pub(crate) loc: Location,
  pub(crate) associated_comments: Arc<Vec<Comment>>,
  pub(crate) is_public: bool,
  pub(crate) is_method: bool,
  pub(crate) name: Id,
  pub(crate) type_parameters: Arc<Vec<TypeParameter>>,
  pub(crate) type_: FunctionType,
  pub(crate) parameters: Arc<Vec<AnnotatedId>>,
}

pub(crate) struct ClassMemberDefinition {
  pub(crate) decl: ClassMemberDeclaration,
  pub(crate) body: expr::E,
}

#[derive(Clone)]
pub(crate) struct InterfaceDeclarationCommon<D, M> {
  pub(crate) loc: Location,
  pub(crate) associated_comments: Arc<Vec<Comment>>,
  pub(crate) name: Id,
  pub(crate) type_parameters: Vec<TypeParameter>,
  /** The node after colon, interpreted as extends in interfaces and implements in classes. */
  pub(crate) extends_or_implements_nodes: Vec<IdType>,
  pub(crate) type_definition: D,
  pub(crate) members: Vec<M>,
}

pub(crate) type InterfaceDeclaration = InterfaceDeclarationCommon<(), ClassMemberDeclaration>;

#[derive(Clone)]
pub(crate) struct FieldType {
  pub(crate) is_public: bool,
  pub(crate) type_: Arc<Type>,
}

impl ToString for FieldType {
  fn to_string(&self) -> String {
    let access_str = if self.is_public { "" } else { "(private) " };
    format!("{}{}", access_str, self.type_.pretty_print())
  }
}

#[derive(Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) loc: Location,
  pub(crate) is_object: bool,
  pub(crate) names: Vec<Id>,
  pub(crate) mappings: HashMap<Str, FieldType>,
}

pub(crate) type ClassDefinition = InterfaceDeclarationCommon<TypeDefinition, ClassMemberDefinition>;

pub(crate) enum Toplevel {
  Interface(InterfaceDeclaration),
  Class(ClassDefinition),
}

pub(crate) enum MemberDeclarationsIterator<'a> {
  Class(std::slice::Iter<'a, ClassMemberDefinition>),
  Interface(std::slice::Iter<'a, ClassMemberDeclaration>),
}

impl<'a> Iterator for MemberDeclarationsIterator<'a> {
  type Item = &'a ClassMemberDeclaration;

  fn next(&mut self) -> Option<Self::Item> {
    match self {
      MemberDeclarationsIterator::Class(iter) => iter.next().map(|it| &it.decl),
      MemberDeclarationsIterator::Interface(iter) => iter.next(),
    }
  }
}

impl Toplevel {
  pub(crate) fn is_class(&self) -> bool {
    match self {
      Toplevel::Interface(_) => false,
      Toplevel::Class(_) => true,
    }
  }

  pub(crate) fn loc(&self) -> &Location {
    match self {
      Toplevel::Interface(i) => &i.loc,
      Toplevel::Class(c) => &c.loc,
    }
  }

  pub(crate) fn associated_comments(&self) -> &Vec<Comment> {
    match self {
      Toplevel::Interface(i) => &i.associated_comments,
      Toplevel::Class(c) => &c.associated_comments,
    }
  }

  pub(crate) fn name(&self) -> &Id {
    match self {
      Toplevel::Interface(i) => &i.name,
      Toplevel::Class(c) => &c.name,
    }
  }

  pub(crate) fn type_parameters(&self) -> &Vec<TypeParameter> {
    match self {
      Toplevel::Interface(i) => &i.type_parameters,
      Toplevel::Class(c) => &c.type_parameters,
    }
  }

  pub(crate) fn extends_or_implements_nodes(&self) -> &Vec<IdType> {
    match self {
      Toplevel::Interface(i) => &i.extends_or_implements_nodes,
      Toplevel::Class(c) => &c.extends_or_implements_nodes,
    }
  }

  pub(crate) fn type_definition(&self) -> Option<&TypeDefinition> {
    match self {
      Toplevel::Interface(_) => None,
      Toplevel::Class(c) => Some(&c.type_definition),
    }
  }

  pub(crate) fn members_iter(&self) -> MemberDeclarationsIterator {
    match self {
      Toplevel::Interface(i) => MemberDeclarationsIterator::Interface(i.members.iter()),
      Toplevel::Class(c) => MemberDeclarationsIterator::Class(c.members.iter()),
    }
  }
}

#[derive(Clone)]
pub(crate) struct ModuleMembersImport {
  pub(crate) loc: Location,
  pub(crate) imported_members: Vec<Id>,
  pub(crate) imported_module: ModuleReference,
  pub(crate) imported_module_loc: Location,
}

pub(crate) struct Module {
  pub(crate) imports: Vec<ModuleMembersImport>,
  pub(crate) toplevels: Vec<Toplevel>,
}

#[cfg(test)]
pub(crate) mod test_builder {
  use crate::common::rcs;

  use super::super::{
    loc::{Location, ModuleReference},
    reason::Reason,
  };
  use super::*;

  pub(crate) struct CustomizedAstBuilder {
    reason: Reason,
    module_reference: ModuleReference,
  }

  impl CustomizedAstBuilder {
    pub(crate) fn unit_type(&self) -> Arc<Type> {
      Arc::new(Type::unit_type(self.reason.clone()))
    }
    pub(crate) fn bool_type(&self) -> Arc<Type> {
      Arc::new(Type::bool_type(self.reason.clone()))
    }
    pub(crate) fn int_type(&self) -> Arc<Type> {
      Arc::new(Type::int_type(self.reason.clone()))
    }
    pub(crate) fn string_type(&self) -> Arc<Type> {
      Arc::new(Type::string_type(self.reason.clone()))
    }

    pub(crate) fn simple_id_type_unwrapped(&self, id: &'static str) -> IdType {
      IdType {
        reason: self.reason.clone(),
        module_reference: self.module_reference.clone(),
        id: rcs(id),
        type_arguments: vec![],
      }
    }

    pub(crate) fn general_id_type_unwrapped(
      &self,
      id: &'static str,
      type_arguments: Vec<Arc<Type>>,
    ) -> IdType {
      IdType {
        reason: self.reason.clone(),
        module_reference: self.module_reference.clone(),
        id: rcs(id),
        type_arguments,
      }
    }

    pub(crate) fn simple_id_type(&self, id: &'static str) -> Arc<Type> {
      Arc::new(Type::Id(self.simple_id_type_unwrapped(id)))
    }

    pub(crate) fn general_id_type(
      &self,
      id: &'static str,
      type_arguments: Vec<Arc<Type>>,
    ) -> Arc<Type> {
      Arc::new(Type::Id(self.general_id_type_unwrapped(id, type_arguments)))
    }

    pub(crate) fn fun_type(
      &self,
      argument_types: Vec<Arc<Type>>,
      return_type: Arc<Type>,
    ) -> Arc<Type> {
      Arc::new(Type::Fn(FunctionType { reason: self.reason.clone(), argument_types, return_type }))
    }

    pub(crate) fn expr_common(&self, type_: Arc<Type>) -> expr::ExpressionCommon {
      expr::ExpressionCommon {
        loc: Location::dummy(),
        associated_comments: Arc::new(vec![]),
        type_,
      }
    }

    pub(crate) fn true_expr(&self) -> expr::E {
      expr::E::Literal(self.expr_common(self.bool_type()), Literal::Bool(true))
    }

    pub(crate) fn false_expr(&self) -> expr::E {
      expr::E::Literal(self.expr_common(self.bool_type()), Literal::Bool(false))
    }

    pub(crate) fn zero_expr(&self) -> expr::E {
      self.int_lit(0)
    }

    pub(crate) fn int_lit(&self, value: i32) -> expr::E {
      expr::E::Literal(self.expr_common(self.int_type()), Literal::Int(value))
    }

    pub(crate) fn string_expr(&self, s: &'static str) -> expr::E {
      expr::E::Literal(self.expr_common(self.string_type()), Literal::string_literal(rcs(s)))
    }

    pub(crate) fn id_expr(&self, id: &'static str, type_: Arc<Type>) -> expr::E {
      expr::E::Id(self.expr_common(type_), Id::from(id))
    }
  }

  pub(crate) fn create() -> CustomizedAstBuilder {
    CustomizedAstBuilder { reason: Reason::dummy(), module_reference: ModuleReference::dummy() }
  }
}
