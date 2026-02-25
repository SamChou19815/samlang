use super::loc::Location;
use dupe::Dupe;
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::rc::Rc;

#[derive(Clone, Dupe, Copy, PartialEq, Eq)]
pub enum CommentKind {
  LINE,
  BLOCK,
  DOC,
}

#[derive(Clone, Dupe, Copy, PartialEq, Eq)]
pub struct Comment {
  pub kind: CommentKind,
  pub text: PStr,
}

#[derive(Clone, PartialEq, Eq)]
pub enum CommentsNode {
  NoComment,
  Comments(Vec<Comment>),
}

static EMPTY_COMMENTS: Vec<Comment> = Vec::new();

impl CommentsNode {
  pub fn iter(&self) -> std::slice::Iter<'_, Comment> {
    match self {
      CommentsNode::NoComment => EMPTY_COMMENTS.iter(),
      CommentsNode::Comments(comments) => comments.iter(),
    }
  }

  pub fn from(comments: Vec<Comment>) -> CommentsNode {
    if !comments.is_empty() { CommentsNode::Comments(comments) } else { CommentsNode::NoComment }
  }
}

#[derive(Debug, Clone, Dupe, Copy, PartialEq, Eq)]
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

#[derive(Clone, Dupe, Copy, PartialEq, Eq)]
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
  use super::super::Location;
  use super::CommentReference;
  use dupe::Dupe;
  use samlang_heap::ModuleReference;

  #[derive(Copy, Clone, Dupe, PartialEq, Eq)]
  pub enum PrimitiveTypeKind {
    Unit,
    Bool,
    Int,
    Any,
  }

  impl PrimitiveTypeKind {
    pub fn kind_str(&self) -> &'static str {
      match self {
        Self::Unit => "unit",
        Self::Bool => "bool",
        Self::Int => "int",
        Self::Any => "any",
      }
    }
  }

  impl std::fmt::Display for PrimitiveTypeKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
      write!(f, "{}", self.kind_str())
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
  pub struct ParenthesizedAnnotationList {
    pub location: Location,
    pub start_associated_comments: CommentReference,
    pub ending_associated_comments: CommentReference,
    pub annotations: Vec<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Function {
    pub location: Location,
    pub associated_comments: CommentReference,
    pub parameters: ParenthesizedAnnotationList,
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
        Self::Primitive(l, _, _) => *l,
        Self::Id(annot) => annot.location,
        Self::Generic(l, _) => *l,
        Self::Fn(annot) => annot.location,
      }
    }

    pub fn associated_comments(&self) -> CommentReference {
      match self {
        Self::Primitive(_, c, _) => *c,
        Self::Id(annot) => annot.id.associated_comments,
        Self::Generic(_, id) => id.associated_comments,
        Self::Fn(annot) => annot.associated_comments,
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

#[derive(Clone, Dupe, Copy, PartialEq, Eq)]
pub struct Id {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub name: PStr,
}

impl Id {
  pub fn from(name: PStr) -> Self {
    Self { loc: Location::dummy(), associated_comments: NO_COMMENT_REFERENCE, name }
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
  pub struct TuplePattern<T: Clone> {
    pub location: Location,
    pub start_associated_comments: super::CommentReference,
    pub ending_associated_comments: super::CommentReference,
    pub elements: Vec<TuplePatternElement<T>>,
  }

  impl<T: Clone> TuplePattern<T> {
    fn collect_bindings<'a>(&'a self, collector: &mut BTreeMap<PStr, &'a T>) {
      for nested in &self.elements {
        nested.pattern.collect_bindings(collector)
      }
    }
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
    pub data_variables: Option<TuplePattern<T>>,
    pub type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum MatchingPattern<T: Clone> {
    Tuple(TuplePattern<T>),
    Object {
      location: Location,
      start_associated_comments: super::CommentReference,
      ending_associated_comments: super::CommentReference,
      elements: Vec<ObjectPatternElement<T>>,
    },
    Variant(VariantPattern<T>),
    Id(Id, T),
    Wildcard {
      location: Location,
      associated_comments: super::CommentReference,
    },
    Or {
      location: Location,
      patterns: Vec<MatchingPattern<T>>,
    },
  }

  impl<T: Clone> MatchingPattern<T> {
    pub fn loc(&self) -> &Location {
      match self {
        Self::Tuple(TuplePattern { location, .. })
        | Self::Object { location, .. }
        | Self::Variant(VariantPattern { loc: location, .. })
        | Self::Id(Id { loc: location, .. }, _)
        | Self::Wildcard { location, .. }
        | Self::Or { location, .. } => location,
      }
    }

    pub fn always_matching(&self) -> bool {
      match self {
        Self::Tuple(TuplePattern { elements, .. }) => {
          for e in elements {
            if !e.pattern.always_matching() {
              return false;
            }
          }
          true
        }
        Self::Object { elements, .. } => {
          for e in elements {
            if !e.pattern.always_matching() {
              return false;
            }
          }
          true
        }
        Self::Variant(_) => false,
        Self::Id(_, _) | Self::Wildcard { .. } => true,
        Self::Or { patterns, .. } => patterns.iter().any(|p| p.always_matching()),
      }
    }

    pub fn bindings(&self) -> BTreeMap<PStr, &T> {
      let mut map = BTreeMap::new();
      self.collect_bindings(&mut map);
      map
    }

    fn collect_bindings<'a>(&'a self, collector: &mut BTreeMap<PStr, &'a T>) {
      match self {
        Self::Tuple(p) => p.collect_bindings(collector),
        Self::Object { elements: ps, .. } => {
          for nested in ps {
            nested.pattern.collect_bindings(collector)
          }
        }
        Self::Variant(VariantPattern { data_variables, .. }) => {
          if let Some(p) = data_variables {
            p.collect_bindings(collector)
          }
        }
        Self::Id(Id { name, .. }, t) => {
          collector.insert(*name, t);
        }
        Self::Wildcard { .. } => {}
        Self::Or { patterns, .. } => {
          if let Some(first) = patterns.first() {
            first.collect_bindings(collector)
          }
        }
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
  use super::{CommentReference, Id, Literal, annotation, pattern};
  use dupe::Dupe;
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
  pub struct ParenthesizedExpressionList<T: Clone> {
    pub loc: Location,
    pub start_associated_comments: CommentReference,
    pub ending_associated_comments: CommentReference,
    pub expressions: Vec<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct FieldAccess<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub explicit_type_arguments: Option<super::annotation::TypeArguments>,
    pub inferred_type_arguments: Vec<T>,
    pub object: Box<E<T>>,
    pub field_name: Id,
    pub field_order: i32,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct MethodAccess<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub explicit_type_arguments: Option<super::annotation::TypeArguments>,
    pub inferred_type_arguments: Vec<T>,
    pub object: Box<E<T>>,
    pub method_name: Id,
  }

  #[derive(Copy, Clone, Dupe, PartialEq, Eq)]
  pub enum UnaryOperator {
    NOT,
    NEG,
  }

  impl UnaryOperator {
    pub fn kind_str(&self) -> &'static str {
      match self {
        Self::NOT => "!",
        Self::NEG => "-",
      }
    }
  }

  impl std::fmt::Display for UnaryOperator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
      write!(f, "{}", self.kind_str())
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
    pub arguments: ParenthesizedExpressionList<T>,
  }

  #[derive(Copy, Clone, Dupe, PartialEq, Eq)]
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

  impl BinaryOperator {
    pub fn kind_str(&self) -> &'static str {
      match self {
        Self::MUL => "*",
        Self::DIV => "/",
        Self::MOD => "%",
        Self::PLUS => "+",
        Self::MINUS => "-",
        Self::CONCAT => "::",
        Self::LT => "<",
        Self::LE => "<=",
        Self::GT => ">",
        Self::GE => ">=",
        Self::EQ => "==",
        Self::NE => "!=",
        Self::AND => "&&",
        Self::OR => "||",
      }
    }
  }

  impl std::fmt::Display for BinaryOperator {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
      write!(f, "{}", self.kind_str())
    }
  }

  impl BinaryOperator {
    pub fn precedence(&self) -> i32 {
      match self {
        Self::MUL => 0,
        Self::DIV => 0,
        Self::MOD => 0,
        Self::PLUS => 1,
        Self::MINUS => 1,
        Self::CONCAT => 1,
        Self::LT => 2,
        Self::LE => 2,
        Self::GT => 2,
        Self::GE => 2,
        Self::EQ => 2,
        Self::NE => 2,
        Self::AND => 3,
        Self::OR => 4,
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
  pub enum IfElseOrBlock<T: Clone> {
    IfElse(IfElse<T>),
    Block(Block<T>),
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct IfElse<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub condition: Box<IfElseCondition<T>>,
    pub e1: Box<Block<T>>,
    pub e2: Box<IfElseOrBlock<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct VariantPatternToExpression<T: Clone> {
    pub loc: Location,
    pub pattern: pattern::MatchingPattern<T>,
    pub body: Box<E<T>>,
    pub ending_associated_comments: CommentReference,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Match<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub matched: Box<E<T>>,
    pub cases: Vec<VariantPatternToExpression<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct LambdaParameters<T: Clone> {
    pub loc: Location,
    pub parameters: Vec<super::OptionallyAnnotatedId<T>>,
    pub ending_associated_comments: CommentReference,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Lambda<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub parameters: LambdaParameters<T>,
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
  pub enum Statement<T: Clone> {
    Declaration(Box<DeclarationStatement<T>>),
    Expression(Box<E<T>>),
  }

  impl<T: Clone> Statement<T> {
    pub fn loc(&self) -> Location {
      match self {
        Self::Declaration(s) => s.loc,
        Self::Expression(e) => e.loc(),
      }
    }
  }

  #[derive(Clone, PartialEq, Eq)]
  pub struct Block<T: Clone> {
    pub common: ExpressionCommon<T>,
    pub statements: Vec<Statement<T>>,
    pub expression: Option<Box<E<T>>>,
    pub ending_associated_comments: CommentReference,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub enum E<T: Clone> {
    Literal(ExpressionCommon<T>, Literal),
    LocalId(ExpressionCommon<T>, Id),
    ClassId(ExpressionCommon<T>, ModuleReference, Id),
    Tuple(ExpressionCommon<T>, ParenthesizedExpressionList<T>),
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
        Self::Literal(common, _)
        | Self::LocalId(common, _)
        | Self::ClassId(common, _, _)
        | Self::Tuple(common, _)
        | Self::FieldAccess(FieldAccess { common, .. })
        | Self::MethodAccess(MethodAccess { common, .. })
        | Self::Unary(Unary { common, .. })
        | Self::Call(Call { common, .. })
        | Self::Binary(Binary { common, .. })
        | Self::IfElse(IfElse { common, .. })
        | Self::Match(Match { common, .. })
        | Self::Lambda(Lambda { common, .. })
        | Self::Block(Block { common, .. }) => common,
      }
    }

    pub fn common_mut(&mut self) -> &mut ExpressionCommon<T> {
      match self {
        Self::Literal(common, _)
        | Self::LocalId(common, _)
        | Self::ClassId(common, _, _)
        | Self::Tuple(common, _)
        | Self::FieldAccess(FieldAccess { common, .. })
        | Self::MethodAccess(MethodAccess { common, .. })
        | Self::Unary(Unary { common, .. })
        | Self::Call(Call { common, .. })
        | Self::Binary(Binary { common, .. })
        | Self::IfElse(IfElse { common, .. })
        | Self::Match(Match { common, .. })
        | Self::Lambda(Lambda { common, .. })
        | Self::Block(Block { common, .. }) => common,
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
        Self::Literal(_, _) | Self::LocalId(_, _) | Self::ClassId(_, _, _) | Self::Tuple(_, _) => 0,
        Self::FieldAccess(_) | Self::MethodAccess(_) | Self::Call(_) | Self::Block(_) => 1,
        Self::Unary(_) => 2,
        Self::Binary(b) => 4 + b.operator.precedence(),
        Self::IfElse(_) => 10,
        Self::Match(_) => 11,
        Self::Lambda(_) => 12,
      }
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub struct FunctionParameters {
  pub location: Location,
  pub start_associated_comments: CommentReference,
  pub ending_associated_comments: CommentReference,
  pub parameters: Rc<Vec<AnnotatedId<()>>>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct ClassMemberDeclaration {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub is_public: bool,
  pub is_method: bool,
  pub name: Id,
  pub type_parameters: Option<annotation::TypeParameters>,
  pub parameters: FunctionParameters,
  pub return_type: annotation::T,
}

#[derive(Clone, PartialEq, Eq)]
pub struct ClassMemberDefinition<T: Clone> {
  pub decl: ClassMemberDeclaration,
  pub body: expr::E<T>,
}

/// The node after colon, interpreted as extends in interfaces and implements in classes.
#[derive(Clone, PartialEq, Eq)]
pub struct ExtendsOrImplementsNodes {
  pub location: Location,
  pub associated_comments: CommentReference,
  pub nodes: Vec<annotation::Id>,
}

#[derive(Clone, PartialEq, Eq)]
pub struct InterfaceMembersCommon<M> {
  pub loc: Location,
  pub members: Vec<M>,
  pub ending_associated_comments: CommentReference,
}

#[derive(Clone, PartialEq, Eq)]
pub struct InterfaceDeclarationCommon<D, M> {
  pub loc: Location,
  pub associated_comments: CommentReference,
  pub private: bool,
  pub name: Id,
  pub type_parameters: Option<annotation::TypeParameters>,
  pub extends_or_implements_nodes: Option<ExtendsOrImplementsNodes>,
  pub type_definition: D,
  pub members: InterfaceMembersCommon<M>,
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
  pub associated_data_types: Option<annotation::ParenthesizedAnnotationList>,
}

#[derive(Clone, EnumAsInner, PartialEq, Eq)]
pub enum TypeDefinition {
  Struct {
    loc: Location,
    start_associated_comments: CommentReference,
    ending_associated_comments: CommentReference,
    fields: Vec<FieldDefinition>,
  },
  Enum {
    loc: Location,
    start_associated_comments: CommentReference,
    ending_associated_comments: CommentReference,
    variants: Vec<VariantDefinition>,
  },
}

impl TypeDefinition {
  pub fn loc(&self) -> &Location {
    match self {
      Self::Struct {
        loc,
        start_associated_comments: _,
        ending_associated_comments: _,
        fields: _,
      }
      | Self::Enum {
        loc,
        start_associated_comments: _,
        ending_associated_comments: _,
        variants: _,
      } => loc,
    }
  }

  pub fn loc_mut(&mut self) -> &mut Location {
    match self {
      Self::Struct {
        loc,
        start_associated_comments: _,
        ending_associated_comments: _,
        fields: _,
      }
      | Self::Enum {
        loc,
        start_associated_comments: _,
        ending_associated_comments: _,
        variants: _,
      } => loc,
    }
  }
}

pub type ClassDefinition<T> =
  InterfaceDeclarationCommon<Option<TypeDefinition>, ClassMemberDefinition<T>>;

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
      Self::Class(iter) => iter.next().map(|it| &it.decl),
      Self::Interface(iter) => iter.next(),
    }
  }
}

impl<T: Clone> Toplevel<T> {
  pub fn is_class(&self) -> bool {
    match self {
      Self::Interface(_) => false,
      Self::Class(_) => true,
    }
  }

  pub fn loc(&self) -> Location {
    match self {
      Self::Interface(i) => i.loc,
      Self::Class(c) => c.loc,
    }
  }

  pub fn associated_comments(&self) -> CommentReference {
    match self {
      Self::Interface(i) => i.associated_comments,
      Self::Class(c) => c.associated_comments,
    }
  }

  pub fn is_private(&self) -> bool {
    match self {
      Self::Interface(i) => i.private,
      Self::Class(c) => c.private,
    }
  }

  pub fn name(&self) -> &Id {
    match self {
      Self::Interface(i) => &i.name,
      Self::Class(c) => &c.name,
    }
  }

  pub fn type_parameters(&self) -> Option<&annotation::TypeParameters> {
    match self {
      Self::Interface(i) => i.type_parameters.as_ref(),
      Self::Class(c) => c.type_parameters.as_ref(),
    }
  }

  pub fn extends_or_implements_nodes(&self) -> Option<&ExtendsOrImplementsNodes> {
    match self {
      Self::Interface(i) => i.extends_or_implements_nodes.as_ref(),
      Self::Class(c) => c.extends_or_implements_nodes.as_ref(),
    }
  }

  pub fn type_definition(&self) -> Option<&TypeDefinition> {
    match self {
      Self::Interface(_) => None,
      Self::Class(c) => c.type_definition.as_ref(),
    }
  }

  pub fn members_iter(&self) -> MemberDeclarationsIterator<'_, T> {
    match self {
      Self::Interface(i) => MemberDeclarationsIterator::Interface(i.members.members.iter()),
      Self::Class(c) => MemberDeclarationsIterator::Class(c.members.members.iter()),
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub struct ModuleMembersImport {
  pub loc: Location,
  pub associated_comments: CommentReference,
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
      self.general_id_annot(id, Vec::new())
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
        parameters: annotation::ParenthesizedAnnotationList {
          location: Location::dummy(),
          start_associated_comments: NO_COMMENT_REFERENCE,
          ending_associated_comments: NO_COMMENT_REFERENCE,
          annotations: parameters,
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
