use super::loc::Location;
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::rc::Rc;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CommentKind {
  LINE,
  BLOCK,
  DOC,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Comment {
  pub location: Location,
  pub kind: CommentKind,
  pub text: PStr,
}

#[derive(Clone, PartialEq, Eq)]
pub enum CommentsNode {
  NoComment,
  Comments(Location, Vec<Comment>),
}

static EMPTY_COMMENTS: Vec<Comment> = vec![];

impl CommentsNode {
  pub fn iter(&self) -> std::slice::Iter<'_, Comment> {
    match self {
      CommentsNode::NoComment => EMPTY_COMMENTS.iter(),
      CommentsNode::Comments(_, comments) => comments.iter(),
    }
  }

  pub fn from(comments: Vec<Comment>) -> CommentsNode {
    if !comments.is_empty() {
      let loc = comments.iter().map(|it| it.location).reduce(|l1, l2| l1.union(&l2)).unwrap();
      CommentsNode::Comments(loc, comments)
    } else {
      CommentsNode::NoComment
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CommentReference(usize);

pub const NO_COMMENT_REFERENCE: CommentReference = CommentReference(0);

#[derive(Clone, PartialEq, Eq)]
pub struct CommentStore {
  store: Vec<CommentsNode>,
}

impl CommentStore {
  pub fn new() -> CommentStore {
    Self::default()
  }

  pub fn all_comments(&self) -> &Vec<CommentsNode> {
    &self.store
  }

  pub fn get(&self, reference: CommentReference) -> &CommentsNode {
    &self.store[reference.0]
  }

  pub fn get_mut(&mut self, reference: CommentReference) -> &mut CommentsNode {
    &mut self.store[reference.0]
  }

  pub fn create_comment_reference(&mut self, comments: Vec<Comment>) -> CommentReference {
    let node = CommentsNode::from(comments);
    if matches!(node, CommentsNode::NoComment) {
      NO_COMMENT_REFERENCE
    } else {
      let id = self.store.len();
      self.store.push(node);
      CommentReference(id)
    }
  }
}

impl Default for CommentStore {
  fn default() -> Self {
    CommentStore { store: vec![CommentsNode::NoComment] }
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Literal {
  Bool(bool),
  Int(i32),
  String(PStr),
}

impl Literal {
  pub fn true_literal() -> Literal {
    Literal::Bool(true)
  }
  pub fn false_literal() -> Literal {
    Literal::Bool(false)
  }

  pub fn int_literal(i: i32) -> Literal {
    Literal::Int(i)
  }

  pub fn string_literal(s: PStr) -> Literal {
    Literal::String(s)
  }

  pub fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      Self::Bool(true) => "true".to_string(),
      Self::Bool(false) => "false".to_string(),
      Self::Int(i) => i.to_string(),
      Self::String(s) => format!("\"{}\"", s.as_str(heap)),
    }
  }
}

pub mod annotation {
  use samlang_heap::ModuleReference;

  use super::CommentReference;
  use crate::Location;

  #[derive(Copy, Clone, PartialEq, Eq)]
  pub enum PrimitiveTypeKind {
    Unit,
    Bool,
    Int,
    Any,
  }

  impl ToString for PrimitiveTypeKind {
    fn to_string(&self) -> String {
      match self {
        Self::Unit => "unit".to_string(),
        Self::Bool => "bool".to_string(),
        Self::Int => "int".to_string(),
        Self::Any => "any".to_string(),
      }
    }
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct TypeArguments {
    pub location: Location,
    pub start_associated_comments: CommentReference,
    pub ending_associated_comments: CommentReference,
    pub arguments: Vec<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Id {
    pub location: Location,
    pub module_reference: ModuleReference,
    pub id: super::Id,
    pub type_arguments: Option<TypeArguments>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct FunctionParameters {
    pub location: Location,
    pub ending_associated_comments: CommentReference,
    pub parameters: Vec<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Function {
    pub location: Location,
    pub associated_comments: CommentReference,
    pub parameters: FunctionParameters,
    pub return_type: Box<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum T {
    Primitive(Location, CommentReference, PrimitiveTypeKind),
    Id(Id),
    Generic(Location, super::Id),
    Fn(Function),
  }

  impl T {
    pub fn location(&self) -> Location {
      match self {
        T::Primitive(l, _, _) => *l,
        T::Id(annot) => annot.location,
        T::Generic(l, _) => *l,
        T::Fn(annot) => annot.location,
      }
    }

    pub fn associated_comments(&self) -> CommentReference {
      match self {
        T::Primitive(_, c, _) => *c,
        T::Id(annot) => annot.id.associated_comments,
        T::Generic(_, id) => id.associated_comments,
        T::Fn(annot) => annot.associated_comments,
      }
    }
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct TypeParameter {
    pub loc: Location,
    pub name: super::Id,
    pub bound: Option<Id>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct TypeParameters {
    pub location: Location,
    pub start_associated_comments: CommentReference,
    pub ending_associated_comments: CommentReference,
    pub parameters: Vec<TypeParameter>,
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Id {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub name: PStr,
}

impl Id {
  pub fn from(name: PStr) -> Id {
    Id { loc: Location::dummy(), associated_comments: NO_COMMENT_REFERENCE, name }
  }
}

pub mod pattern {
  use super::{Id, Location};
  use samlang_heap::PStr;
  use std::collections::BTreeMap;

  #[derive(Clone, PartialEq, Eq)]
  pub struct TuplePatternElement<T: Clone> {
    pub pattern: Box<MatchingPattern<T>>,
    pub type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct ObjectPatternElement<T: Clone> {
    pub loc: Location,
    pub field_order: usize,
    pub field_name: Id,
    pub pattern: Box<MatchingPattern<T>>,
    pub shorthand: bool,
    pub type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct VariantPattern<T: Clone> {
    pub loc: Location,
    pub tag_order: usize,
    pub tag: Id,
    pub data_variables: Vec<(MatchingPattern<T>, T)>,
    pub type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum MatchingPattern<T: Clone> {
    Tuple(Location, Vec<TuplePatternElement<T>>),
    Object(Location, Vec<ObjectPatternElement<T>>),
    Variant(VariantPattern<T>),
    Id(Id, T),
    Wildcard(Location),
  }

  impl<T: Clone> MatchingPattern<T> {
    pub fn loc(&self) -> &Location {
      match self {
        Self::Tuple(loc, _)
        | Self::Object(loc, _)
        | Self::Variant(VariantPattern { loc, .. })
        | Self::Id(Id { loc, .. }, _)
        | Self::Wildcard(loc) => loc,
      }
    }

    pub fn always_matching(&self) -> bool {
      match self {
        Self::Tuple(_, elements) => {
          for e in elements {
            if !e.pattern.always_matching() {
              return false;
            }
          }
          true
        }
        Self::Object(_, elements) => {
          for e in elements {
            if !e.pattern.always_matching() {
              return false;
            }
          }
          true
        }
        Self::Variant(_) => false,
        Self::Id(_, _) | Self::Wildcard(_) => true,
      }
    }

    pub fn bindings(&self) -> BTreeMap<PStr, &T> {
      let mut map = BTreeMap::new();
      self.collect_bindings(&mut map);
      map
    }

    fn collect_bindings<'a>(&'a self, collector: &mut BTreeMap<PStr, &'a T>) {
      match self {
        Self::Tuple(_, ps) => {
          for nested in ps {
            nested.pattern.collect_bindings(collector)
          }
        }
        Self::Object(_, ps) => {
          for nested in ps {
            nested.pattern.collect_bindings(collector)
          }
        }
        Self::Variant(VariantPattern { data_variables, .. }) => {
          for (p, _) in data_variables {
            p.collect_bindings(collector)
          }
        }
        Self::Id(Id { name, .. }, t) => {
          collector.insert(*name, t);
        }
        Self::Wildcard(_) => {}
      }
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub struct OptionallyAnnotatedId<T: Clone> {
  pub name: Id,
  pub type_: T,
  pub annotation: Option<annotation::T>,
}

#[derive(PartialEq, Eq)]
pub struct AnnotatedId<T: Clone> {
  pub name: Id,
  pub type_: T,
  pub annotation: annotation::T,
}

pub mod expr {
  use super::super::loc::Location;
  use super::{annotation, pattern, CommentReference, Id, Literal};
  use samlang_heap::{ModuleReference, PStr};
  use std::collections::HashMap;

  #[derive(Clone, PartialEq, Eq)]
  pub struct ExpressionCommon<T: Clone> {
    pub loc: Location,
    pub associated_comments: CommentReference,
    pub type_: T,
  }

  impl<T: Clone> ExpressionCommon<T> {
    pub fn dummy(type_: T) -> ExpressionCommon<T> {
      ExpressionCommon {
        loc: Location::dummy(),
        associated_comments: super::NO_COMMENT_REFERENCE,
        type_,
      }
    }

    pub fn with_new_type<NT: Clone>(&self, type_: NT) -> ExpressionCommon<NT> {
      ExpressionCommon { loc: self.loc, associated_comments: self.associated_comments, type_ }
    }
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct FieldAccess<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub explicit_type_arguments: Vec<annotation::T>,
    pub inferred_type_arguments: Vec<T>,
    pub object: Box<E<T>>,
    pub field_name: Id,
    pub field_order: i32,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct MethodAccess<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub explicit_type_arguments: Vec<annotation::T>,
    pub inferred_type_arguments: Vec<T>,
    pub object: Box<E<T>>,
    pub method_name: Id,
  }

  #[derive(Copy, Clone, PartialEq, Eq)]
  pub enum UnaryOperator {
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

  #[derive(Clone, PartialEq, Eq)]
  pub struct Unary<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub operator: UnaryOperator,
    pub argument: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Call<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub callee: Box<E<T>>,
    pub arguments: Vec<E<T>>,
  }

  #[derive(Copy, Clone, PartialEq, Eq)]
  pub enum BinaryOperator {
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
    pub fn precedence(&self) -> i32 {
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

  #[derive(Clone, PartialEq, Eq)]
  pub struct Binary<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub operator_preceding_comments: CommentReference,
    pub operator: BinaryOperator,
    pub e1: Box<E<T>>,
    pub e2: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum IfElseCondition<T: Clone> {
    Expression(E<T>),
    Guard(super::pattern::MatchingPattern<T>, E<T>),
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct IfElse<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub condition: Box<IfElseCondition<T>>,
    pub e1: Box<E<T>>,
    pub e2: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct VariantPatternToExpression<T: Clone> {
    pub loc: Location,
    pub pattern: pattern::MatchingPattern<T>,
    pub body: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Match<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub matched: Box<E<T>>,
    pub cases: Vec<VariantPatternToExpression<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Lambda<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub parameters: Vec<super::OptionallyAnnotatedId<T>>,
    pub captured: HashMap<PStr, T>,
    pub body: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct DeclarationStatement<T: Clone> {
    pub loc: Location,
    pub associated_comments: CommentReference,
    pub pattern: super::pattern::MatchingPattern<T>,
    pub annotation: Option<annotation::T>,
    pub assigned_expression: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Block<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub statements: Vec<DeclarationStatement<T>>,
    pub expression: Option<Box<E<T>>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum E<T: Clone> {
    Literal(ExpressionCommon<T>, Literal),
    LocalId(ExpressionCommon<T>, Id),
    ClassId(ExpressionCommon<T>, ModuleReference, Id),
    Tuple(ExpressionCommon<T>, Vec<E<T>>),
    FieldAccess(FieldAccess<T>),
    MethodAccess(MethodAccess<T>),
    Unary(Unary<T>),
    Call(Call<T>),
    Binary(Binary<T>),
    IfElse(IfElse<T>),
    Match(Match<T>),
    Lambda(Lambda<T>),
    Block(Block<T>),
  }

  impl<T: Clone> E<T> {
    pub fn common(&self) -> &ExpressionCommon<T> {
      match self {
        E::Literal(common, _)
        | E::LocalId(common, _)
        | E::ClassId(common, _, _)
        | E::Tuple(common, _)
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

    pub fn common_mut(&mut self) -> &mut ExpressionCommon<T> {
      match self {
        E::Literal(common, _)
        | E::LocalId(common, _)
        | E::ClassId(common, _, _)
        | E::Tuple(common, _)
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

    pub fn loc(&self) -> Location {
      self.common().loc
    }

    pub fn type_(&self) -> &T {
      &self.common().type_
    }

    pub fn precedence(&self) -> i32 {
      match self {
        E::Literal(_, _) | E::LocalId(_, _) | E::ClassId(_, _, _) | E::Tuple(_, _) => 0,
        E::FieldAccess(_) | E::MethodAccess(_) | E::Call(_) | E::Block(_) => 1,
        E::Unary(_) => 2,
        E::Binary(b) => 4 + b.operator.precedence(),
        E::IfElse(_) => 10,
        E::Match(_) => 11,
        E::Lambda(_) => 12,
      }
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub struct ClassMemberDeclaration {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub is_public: bool,
  pub is_method: bool,
  pub name: Id,
  pub type_parameters: Option<annotation::TypeParameters>,
  pub type_: annotation::Function,
  pub parameters: Rc<Vec<AnnotatedId<()>>>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct ClassMemberDefinition<T: Clone> {
  pub decl: ClassMemberDeclaration,
  pub body: expr::E<T>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct InterfaceDeclarationCommon<D, M> {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub private: bool,
  pub name: Id,
  pub type_parameters: Option<annotation::TypeParameters>,
  /** The node after colon, interpreted as extends in interfaces and implements in classes. */
  pub extends_or_implements_nodes: Vec<annotation::Id>,
  pub type_definition: D,
  pub members: Vec<M>,
}

pub type InterfaceDeclaration = InterfaceDeclarationCommon<(), ClassMemberDeclaration>;

#[derive(Clone, PartialEq, Eq)]
pub struct FieldDefinition {
  pub name: Id,
  pub annotation: annotation::T,
  pub is_public: bool,
}

#[derive(Clone, PartialEq, Eq)]
pub struct VariantDefinition {
  pub name: Id,
  pub associated_data_types: Vec<annotation::T>,
}

#[derive(Clone, EnumAsInner, PartialEq, Eq)]
pub enum TypeDefinition {
  Struct { loc: Location, fields: Vec<FieldDefinition> },
  Enum { loc: Location, variants: Vec<VariantDefinition> },
}

pub type ClassDefinition<T> = InterfaceDeclarationCommon<TypeDefinition, ClassMemberDefinition<T>>;

#[derive(Clone, PartialEq, Eq)]
pub enum Toplevel<T: Clone> {
  Interface(InterfaceDeclaration),
  Class(ClassDefinition<T>),
}

pub enum MemberDeclarationsIterator<'a, T: Clone> {
  Class(std::slice::Iter<'a, ClassMemberDefinition<T>>),
  Interface(std::slice::Iter<'a, ClassMemberDeclaration>),
}

impl<'a, T: Clone> Iterator for MemberDeclarationsIterator<'a, T> {
  type Item = &'a ClassMemberDeclaration;

  fn next(&mut self) -> Option<Self::Item> {
    match self {
      MemberDeclarationsIterator::Class(iter) => iter.next().map(|it| &it.decl),
      MemberDeclarationsIterator::Interface(iter) => iter.next(),
    }
  }
}

impl<T: Clone> Toplevel<T> {
  pub fn is_class(&self) -> bool {
    match self {
      Toplevel::Interface(_) => false,
      Toplevel::Class(_) => true,
    }
  }

  pub fn loc(&self) -> Location {
    match self {
      Toplevel::Interface(i) => i.loc,
      Toplevel::Class(c) => c.loc,
    }
  }

  pub fn associated_comments(&self) -> CommentReference {
    match self {
      Toplevel::Interface(i) => i.associated_comments,
      Toplevel::Class(c) => c.associated_comments,
    }
  }

  pub fn is_private(&self) -> bool {
    match self {
      Toplevel::Interface(i) => i.private,
      Toplevel::Class(c) => c.private,
    }
  }

  pub fn name(&self) -> &Id {
    match self {
      Toplevel::Interface(i) => &i.name,
      Toplevel::Class(c) => &c.name,
    }
  }

  pub fn type_parameters(&self) -> Option<&annotation::TypeParameters> {
    match self {
      Toplevel::Interface(i) => i.type_parameters.as_ref(),
      Toplevel::Class(c) => c.type_parameters.as_ref(),
    }
  }

  pub fn extends_or_implements_nodes(&self) -> &Vec<annotation::Id> {
    match self {
      Toplevel::Interface(i) => &i.extends_or_implements_nodes,
      Toplevel::Class(c) => &c.extends_or_implements_nodes,
    }
  }

  pub fn type_definition(&self) -> Option<&TypeDefinition> {
    match self {
      Toplevel::Interface(_) => None,
      Toplevel::Class(c) => Some(&c.type_definition),
    }
  }

  pub fn members_iter(&self) -> MemberDeclarationsIterator<T> {
    match self {
      Toplevel::Interface(i) => MemberDeclarationsIterator::Interface(i.members.iter()),
      Toplevel::Class(c) => MemberDeclarationsIterator::Class(c.members.iter()),
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub struct ModuleMembersImport {
  pub loc: Location,
  pub imported_members: Vec<Id>,
  pub imported_module: ModuleReference,
  pub imported_module_loc: Location,
}

#[derive(Clone)]
pub struct Module<T: Clone> {
  pub comment_store: CommentStore,
  pub imports: Vec<ModuleMembersImport>,
  pub toplevels: Vec<Toplevel<T>>,
  pub trailing_comments: CommentReference,
}

pub mod test_builder {
  use super::*;
  use super::{super::loc::Location, annotation::TypeArguments};
  use samlang_heap::{ModuleReference, PStr};

  pub struct CustomizedAstBuilder {}

  impl CustomizedAstBuilder {
    pub fn any_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Any,
      )
    }

    pub fn unit_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Unit,
      )
    }

    pub fn bool_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Bool,
      )
    }

    pub fn int_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Int,
      )
    }

    pub fn string_annot(&self) -> annotation::T {
      annotation::T::Id(annotation::Id {
        location: Location::dummy(),
        module_reference: ModuleReference::ROOT,
        id: Id::from(PStr::STR_TYPE),
        type_arguments: None,
      })
    }

    pub fn general_id_annot_unwrapped(
      &self,
      id: PStr,
      type_arguments: Vec<annotation::T>,
    ) -> annotation::Id {
      annotation::Id {
        location: Location::dummy(),
        module_reference: ModuleReference::DUMMY,
        id: Id::from(id),
        type_arguments: Some(TypeArguments {
          location: Location::dummy(),
          start_associated_comments: NO_COMMENT_REFERENCE,
          ending_associated_comments: NO_COMMENT_REFERENCE,
          arguments: type_arguments,
        }),
      }
    }

    pub fn general_id_annot(&self, id: PStr, type_arguments: Vec<annotation::T>) -> annotation::T {
      annotation::T::Id(self.general_id_annot_unwrapped(id, type_arguments))
    }

    pub fn simple_id_annot(&self, id: PStr) -> annotation::T {
      self.general_id_annot(id, vec![])
    }

    pub fn generic_annot(&self, id: PStr) -> annotation::T {
      annotation::T::Generic(Location::dummy(), Id::from(id))
    }

    pub fn fn_annot_unwrapped(
      &self,
      parameters: Vec<annotation::T>,
      return_type: annotation::T,
    ) -> annotation::Function {
      annotation::Function {
        location: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        parameters: annotation::FunctionParameters {
          location: Location::dummy(),
          ending_associated_comments: NO_COMMENT_REFERENCE,
          parameters,
        },
        return_type: Box::new(return_type),
      }
    }

    pub fn fn_annot(
      &self,
      argument_types: Vec<annotation::T>,
      return_type: annotation::T,
    ) -> annotation::T {
      annotation::T::Fn(self.fn_annot_unwrapped(argument_types, return_type))
    }
  }

  pub fn create() -> CustomizedAstBuilder {
    CustomizedAstBuilder {}
  }
}
