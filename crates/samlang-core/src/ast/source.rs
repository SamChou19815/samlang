use super::loc::Location;
use crate::{
  checker::type_::{FunctionType, ISourceType, IdType, Type},
  common::{Heap, ModuleReference, PStr},
};
use std::{collections::HashMap, rc::Rc};

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommentKind {
  LINE,
  BLOCK,
  DOC,
}

#[derive(Clone, Copy)]
pub(crate) struct Comment {
  pub(crate) kind: CommentKind,
  pub(crate) text: PStr,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct CommentReference(usize);

pub(crate) const NO_COMMENT_REFERENCE: CommentReference = CommentReference(0);

#[derive(Clone)]
pub(crate) struct CommentStore {
  store: Vec<Vec<Comment>>,
}

impl CommentStore {
  pub(crate) fn new() -> CommentStore {
    CommentStore { store: vec![vec![]] }
  }

  pub(crate) fn all_comments(&self) -> &Vec<Vec<Comment>> {
    &self.store
  }

  pub(crate) fn get(&self, reference: CommentReference) -> &Vec<Comment> {
    &self.store[reference.0]
  }

  pub(crate) fn get_mut(&mut self, reference: CommentReference) -> &mut Vec<Comment> {
    &mut self.store[reference.0]
  }

  pub(crate) fn create_comment_reference(&mut self, comments: Vec<Comment>) -> CommentReference {
    let id = self.store.len();
    self.store.push(comments);
    CommentReference(id)
  }
}

#[derive(Clone, Copy)]
pub(crate) enum Literal {
  Bool(bool),
  Int(i32),
  String(PStr),
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

  pub(crate) fn string_literal(s: PStr) -> Literal {
    Literal::String(s)
  }

  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Self::Bool(true) => "true".to_string(),
      Self::Bool(false) => "false".to_string(),
      Self::Int(i) => i.to_string(),
      Self::String(s) => format!("\"{}\"", s.as_str(heap)),
    }
  }
}

pub(crate) mod annotation {
  use super::CommentReference;
  use crate::{ast::Location, ModuleReference};

  #[derive(Copy, Clone)]
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

  #[derive(Clone)]
  pub(crate) struct Id {
    pub(crate) location: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) module_reference: ModuleReference,
    pub(crate) id: super::Id,
    pub(crate) type_arguments: Vec<T>,
  }

  #[derive(Clone)]
  pub(crate) struct Function {
    pub(crate) location: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) argument_types: Vec<T>,
    pub(crate) return_type: Box<T>,
  }

  #[derive(Clone)]
  pub(crate) enum T {
    Primitive(Location, CommentReference, PrimitiveTypeKind),
    Id(Id),
    Fn(Function),
  }
}

#[derive(Clone)]
pub(crate) struct Id {
  pub(crate) loc: Location,
  pub(crate) associated_comments: CommentReference,
  pub(crate) name: PStr,
}

impl Id {
  pub(crate) fn from(name: PStr) -> Id {
    Id { loc: Location::dummy(), associated_comments: NO_COMMENT_REFERENCE, name }
  }
}

#[derive(Clone)]
pub(crate) struct OptionallyAnnotatedId {
  pub(crate) name: Id,
  pub(crate) annotation: Option<Rc<Type>>,
}

pub(crate) struct AnnotatedId {
  pub(crate) name: Id,
  pub(crate) annotation: Rc<Type>,
}

pub(crate) mod expr {
  use super::super::loc::Location;
  use super::{CommentReference, Id, Literal, OptionallyAnnotatedId, Type};
  use crate::common::{ModuleReference, PStr};
  use std::collections::HashMap;
  use std::rc::Rc;

  #[derive(Clone)]
  pub(crate) struct ExpressionCommon {
    pub(crate) loc: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) type_: Rc<Type>,
  }

  impl ExpressionCommon {
    #[cfg(test)]
    pub(crate) fn dummy(type_: Rc<Type>) -> ExpressionCommon {
      ExpressionCommon {
        loc: Location::dummy(),
        associated_comments: super::NO_COMMENT_REFERENCE,
        type_,
      }
    }

    pub(crate) fn with_new_type(self, type_: Rc<Type>) -> ExpressionCommon {
      ExpressionCommon { loc: self.loc, associated_comments: self.associated_comments, type_ }
    }
  }

  #[derive(Clone)]
  pub(crate) struct ClassFunction {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Rc<Type>>,
    pub(crate) module_reference: ModuleReference,
    pub(crate) class_name: Id,
    pub(crate) fn_name: Id,
  }

  #[derive(Clone)]
  pub(crate) struct FieldAccess {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Rc<Type>>,
    pub(crate) object: Box<E>,
    pub(crate) field_name: Id,
    pub(crate) field_order: i32,
  }

  #[derive(Clone)]
  pub(crate) struct MethodAccess {
    pub(crate) common: ExpressionCommon,
    pub(crate) type_arguments: Vec<Rc<Type>>,
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
    pub(crate) operator_preceding_comments: CommentReference,
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
    pub(crate) data_variable: Option<(Id, Rc<Type>)>,
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
    pub(crate) captured: HashMap<PStr, Rc<Type>>,
    pub(crate) body: Box<E>,
  }

  #[derive(Clone)]
  pub(crate) struct ObjectPatternDestucturedName {
    pub(crate) loc: Location,
    pub(crate) field_order: usize,
    pub(crate) field_name: Id,
    pub(crate) alias: Option<Id>,
    pub(crate) type_: Rc<Type>,
  }

  #[derive(Clone)]
  pub(crate) enum Pattern {
    Object(Location, Vec<ObjectPatternDestucturedName>),
    Id(Location, PStr),
    Wildcard(Location),
  }

  #[derive(Clone)]
  pub(crate) struct DeclarationStatement {
    pub(crate) loc: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) pattern: Pattern,
    pub(crate) annotation: Option<Rc<Type>>,
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

    pub(crate) fn loc(&self) -> Location {
      self.common().loc
    }

    pub(crate) fn type_(&self) -> Rc<Type> {
      self.common().type_.clone()
    }

    pub(crate) fn precedence(&self) -> i32 {
      match self {
        E::Literal(_, _) | E::Id(_, _) => 0,
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
  pub(crate) associated_comments: CommentReference,
  pub(crate) name: Id,
  pub(crate) bound: Option<Rc<IdType>>,
}

impl TypeParameter {
  pub(crate) fn pretty_print(&self, heap: &Heap) -> String {
    if let Some(bound) = &self.bound {
      format!("{}: {}", self.name.name.as_str(heap), bound.pretty_print(heap))
    } else {
      self.name.name.as_str(heap).to_string()
    }
  }
}

#[derive(Clone)]
pub(crate) struct ClassMemberDeclaration {
  pub(crate) loc: Location,
  pub(crate) associated_comments: CommentReference,
  pub(crate) is_public: bool,
  pub(crate) is_method: bool,
  pub(crate) name: Id,
  pub(crate) type_parameters: Rc<Vec<TypeParameter>>,
  pub(crate) type_: FunctionType,
  pub(crate) parameters: Rc<Vec<AnnotatedId>>,
}

pub(crate) struct ClassMemberDefinition {
  pub(crate) decl: ClassMemberDeclaration,
  pub(crate) body: expr::E,
}

#[derive(Clone)]
pub(crate) struct InterfaceDeclarationCommon<D, M> {
  pub(crate) loc: Location,
  pub(crate) associated_comments: CommentReference,
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
  pub(crate) type_: Rc<Type>,
}

impl FieldType {
  pub(crate) fn to_string(&self, heap: &Heap) -> String {
    let access_str = if self.is_public { "" } else { "(private) " };
    format!("{}{}", access_str, self.type_.pretty_print(heap))
  }
}

#[derive(Clone)]
pub(crate) struct TypeDefinition {
  pub(crate) loc: Location,
  pub(crate) is_object: bool,
  pub(crate) names: Vec<Id>,
  pub(crate) mappings: HashMap<PStr, FieldType>,
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

  pub(crate) fn loc(&self) -> Location {
    match self {
      Toplevel::Interface(i) => i.loc,
      Toplevel::Class(c) => c.loc,
    }
  }

  pub(crate) fn associated_comments(&self) -> CommentReference {
    match self {
      Toplevel::Interface(i) => i.associated_comments,
      Toplevel::Class(c) => c.associated_comments,
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
  pub(crate) comment_store: CommentStore,
  pub(crate) imports: Vec<ModuleMembersImport>,
  pub(crate) toplevels: Vec<Toplevel>,
}

#[cfg(test)]
pub(crate) mod test_builder {
  use super::super::{loc::Location, reason::Reason};
  use super::*;

  pub(crate) struct CustomizedAstBuilder {
    reason: Reason,
    module_reference: ModuleReference,
  }

  impl CustomizedAstBuilder {
    pub(crate) fn unit_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Unit,
      )
    }

    pub(crate) fn bool_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Bool,
      )
    }

    pub(crate) fn int_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Int,
      )
    }

    pub(crate) fn string_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::String,
      )
    }

    pub(crate) fn general_id_annot(
      &self,
      id: PStr,
      type_arguments: Vec<annotation::T>,
    ) -> annotation::T {
      annotation::T::Id(annotation::Id {
        location: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        module_reference: self.module_reference,
        id: Id::from(id),
        type_arguments,
      })
    }

    pub(crate) fn simple_id_annot(&self, id: PStr) -> annotation::T {
      self.general_id_annot(id, vec![])
    }

    pub(crate) fn fn_annot(
      &self,
      argument_types: Vec<annotation::T>,
      return_type: annotation::T,
    ) -> annotation::T {
      annotation::T::Fn(annotation::Function {
        location: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        argument_types,
        return_type: Box::new(return_type),
      })
    }
  }

  pub(crate) fn create() -> CustomizedAstBuilder {
    CustomizedAstBuilder { reason: Reason::dummy(), module_reference: ModuleReference::dummy() }
  }
}
