use super::loc::Location;
use enum_as_inner::EnumAsInner;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::rc::Rc;

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum CommentKind {
  LINE,
  BLOCK,
  DOC,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) struct Comment {
  pub(crate) location: Location,
  pub(crate) kind: CommentKind,
  pub(crate) text: PStr,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) enum CommentsNode {
  NoComment,
  Comments(Location, Vec<Comment>),
}

static EMPTY_COMMENTS: Vec<Comment> = vec![];

impl CommentsNode {
  pub(crate) fn iter(&self) -> std::slice::Iter<'_, Comment> {
    match self {
      CommentsNode::NoComment => EMPTY_COMMENTS.iter(),
      CommentsNode::Comments(_, comments) => comments.iter(),
    }
  }

  pub(crate) fn from(comments: Vec<Comment>) -> CommentsNode {
    if !comments.is_empty() {
      let loc = comments.iter().map(|it| it.location).reduce(|l1, l2| l1.union(&l2)).unwrap();
      CommentsNode::Comments(loc, comments)
    } else {
      CommentsNode::NoComment
    }
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct CommentReference(usize);

pub(crate) const NO_COMMENT_REFERENCE: CommentReference = CommentReference(0);

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct CommentStore {
  store: Vec<CommentsNode>,
}

impl CommentStore {
  pub(crate) fn new() -> CommentStore {
    CommentStore { store: vec![CommentsNode::NoComment] }
  }

  pub(crate) fn all_comments(&self) -> &Vec<CommentsNode> {
    &self.store
  }

  pub(crate) fn get(&self, reference: CommentReference) -> &CommentsNode {
    &self.store[reference.0]
  }

  pub(crate) fn get_mut(&mut self, reference: CommentReference) -> &mut CommentsNode {
    &mut self.store[reference.0]
  }

  pub(crate) fn create_comment_reference(&mut self, comments: Vec<Comment>) -> CommentReference {
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

#[derive(Clone, Copy, PartialEq, Eq)]
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

  #[derive(Copy, Clone, PartialEq, Eq)]
  pub(crate) enum PrimitiveTypeKind {
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
  pub(crate) struct Id {
    pub(crate) location: Location,
    pub(crate) module_reference: ModuleReference,
    pub(crate) id: super::Id,
    pub(crate) type_arguments: Vec<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Function {
    pub(crate) location: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) argument_types: Vec<T>,
    pub(crate) return_type: Box<T>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) enum T {
    Primitive(Location, CommentReference, PrimitiveTypeKind),
    Id(Id),
    Generic(Location, super::Id),
    Fn(Function),
  }

  impl T {
    pub(crate) fn location(&self) -> Location {
      match self {
        T::Primitive(l, _, _) => *l,
        T::Id(annot) => annot.location,
        T::Generic(l, _) => *l,
        T::Fn(annot) => annot.location,
      }
    }

    pub(crate) fn associated_comments(&self) -> CommentReference {
      match self {
        T::Primitive(_, c, _) => *c,
        T::Id(annot) => annot.id.associated_comments,
        T::Generic(_, id) => id.associated_comments,
        T::Fn(annot) => annot.associated_comments,
      }
    }
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
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

pub(crate) mod pattern {
  use super::{Id, Location};
  use samlang_heap::PStr;
  use std::collections::BTreeMap;

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct TuplePatternElement<Base: Clone, T: Clone> {
    pub(crate) pattern: Box<Base>,
    pub(crate) type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct ObjectPatternElement<Base: Clone, T: Clone> {
    pub(crate) loc: Location,
    pub(crate) field_order: usize,
    pub(crate) field_name: Id,
    pub(crate) pattern: Box<Base>,
    pub(crate) shorthand: bool,
    pub(crate) type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct VariantPattern<T: Clone> {
    pub(crate) loc: Location,
    pub(crate) tag_order: usize,
    pub(crate) tag: Id,
    pub(crate) data_variables: Vec<(MatchingPattern<T>, T)>,
    pub(crate) type_: T,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) enum MatchingPattern<T: Clone> {
    Tuple(Location, Vec<TuplePatternElement<MatchingPattern<T>, T>>),
    Object(Location, Vec<ObjectPatternElement<MatchingPattern<T>, T>>),
    Variant(VariantPattern<T>),
    Id(Id, T),
    Wildcard(Location),
  }

  impl<T: Clone> MatchingPattern<T> {
    pub(crate) fn loc(&self) -> &Location {
      match self {
        Self::Tuple(loc, _)
        | Self::Object(loc, _)
        | Self::Variant(VariantPattern { loc, .. })
        | Self::Id(Id { loc, .. }, _)
        | Self::Wildcard(loc) => loc,
      }
    }

    pub(crate) fn always_matching(&self) -> bool {
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

    pub(crate) fn bindings(&self) -> BTreeMap<PStr, &T> {
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
pub(crate) struct OptionallyAnnotatedId<T: Clone> {
  pub(crate) name: Id,
  pub(crate) type_: T,
  pub(crate) annotation: Option<annotation::T>,
}

#[derive(PartialEq, Eq)]
pub(crate) struct AnnotatedId<T: Clone> {
  pub(crate) name: Id,
  pub(crate) type_: T,
  pub(crate) annotation: annotation::T,
}

pub(crate) mod expr {
  use super::super::loc::Location;
  use super::{annotation, pattern, CommentReference, Id, Literal};
  use samlang_heap::{ModuleReference, PStr};
  use std::collections::HashMap;

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct ExpressionCommon<T: Clone> {
    pub(crate) loc: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) type_: T,
  }

  impl<T: Clone> ExpressionCommon<T> {
    #[cfg(test)]
    pub(crate) fn dummy(type_: T) -> ExpressionCommon<T> {
      ExpressionCommon {
        loc: Location::dummy(),
        associated_comments: super::NO_COMMENT_REFERENCE,
        type_,
      }
    }

    pub(crate) fn with_new_type<NT: Clone>(&self, type_: NT) -> ExpressionCommon<NT> {
      ExpressionCommon { loc: self.loc, associated_comments: self.associated_comments, type_ }
    }
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct FieldAccess<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) explicit_type_arguments: Vec<annotation::T>,
    pub(crate) inferred_type_arguments: Vec<T>,
    pub(crate) object: Box<E<T>>,
    pub(crate) field_name: Id,
    pub(crate) field_order: i32,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct MethodAccess<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) explicit_type_arguments: Vec<annotation::T>,
    pub(crate) inferred_type_arguments: Vec<T>,
    pub(crate) object: Box<E<T>>,
    pub(crate) method_name: Id,
  }

  #[derive(Copy, Clone, PartialEq, Eq)]
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

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Unary<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) operator: UnaryOperator,
    pub(crate) argument: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Call<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) callee: Box<E<T>>,
    pub(crate) arguments: Vec<E<T>>,
  }

  #[derive(Copy, Clone, PartialEq, Eq)]
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

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Binary<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) operator_preceding_comments: CommentReference,
    pub(crate) operator: BinaryOperator,
    pub(crate) e1: Box<E<T>>,
    pub(crate) e2: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) enum IfElseCondition<T: Clone> {
    Expression(E<T>),
    Guard(super::pattern::MatchingPattern<T>, E<T>),
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct IfElse<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) condition: Box<IfElseCondition<T>>,
    pub(crate) e1: Box<E<T>>,
    pub(crate) e2: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct VariantPatternToExpression<T: Clone> {
    pub(crate) loc: Location,
    pub(crate) pattern: pattern::MatchingPattern<T>,
    pub(crate) body: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Match<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) matched: Box<E<T>>,
    pub(crate) cases: Vec<VariantPatternToExpression<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Lambda<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) parameters: Vec<super::OptionallyAnnotatedId<T>>,
    pub(crate) captured: HashMap<PStr, T>,
    pub(crate) body: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct DeclarationStatement<T: Clone> {
    pub(crate) loc: Location,
    pub(crate) associated_comments: CommentReference,
    pub(crate) pattern: super::pattern::MatchingPattern<T>,
    pub(crate) annotation: Option<annotation::T>,
    pub(crate) assigned_expression: Box<E<T>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) struct Block<T: Clone> {
    pub(crate) common: ExpressionCommon<T>,
    pub(crate) statements: Vec<DeclarationStatement<T>>,
    pub(crate) expression: Option<Box<E<T>>>,
  }

  #[derive(Clone, PartialEq, Eq)]
  pub(crate) enum E<T: Clone> {
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
    pub(crate) fn common(&self) -> &ExpressionCommon<T> {
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

    pub(crate) fn common_mut(&mut self) -> &mut ExpressionCommon<T> {
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

    pub(crate) fn loc(&self) -> Location {
      self.common().loc
    }

    pub(crate) fn type_(&self) -> &T {
      &self.common().type_
    }

    pub(crate) fn precedence(&self) -> i32 {
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
pub(crate) struct TypeParameter {
  pub(crate) loc: Location,
  pub(crate) name: Id,
  pub(crate) bound: Option<annotation::Id>,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ClassMemberDeclaration {
  pub(crate) loc: Location,
  pub(crate) associated_comments: CommentReference,
  pub(crate) is_public: bool,
  pub(crate) is_method: bool,
  pub(crate) name: Id,
  pub(crate) type_parameters: Rc<Vec<TypeParameter>>,
  pub(crate) type_: annotation::Function,
  pub(crate) parameters: Rc<Vec<AnnotatedId<()>>>,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ClassMemberDefinition<T: Clone> {
  pub(crate) decl: ClassMemberDeclaration,
  pub(crate) body: expr::E<T>,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct InterfaceDeclarationCommon<D, M> {
  pub(crate) loc: Location,
  pub(crate) associated_comments: CommentReference,
  pub(crate) private: bool,
  pub(crate) name: Id,
  pub(crate) type_parameters: Vec<TypeParameter>,
  /** The node after colon, interpreted as extends in interfaces and implements in classes. */
  pub(crate) extends_or_implements_nodes: Vec<annotation::Id>,
  pub(crate) type_definition: D,
  pub(crate) members: Vec<M>,
}

pub(crate) type InterfaceDeclaration = InterfaceDeclarationCommon<(), ClassMemberDeclaration>;

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct FieldDefinition {
  pub(crate) name: Id,
  pub(crate) annotation: annotation::T,
  pub(crate) is_public: bool,
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct VariantDefinition {
  pub(crate) name: Id,
  pub(crate) associated_data_types: Vec<annotation::T>,
}

#[derive(Clone, EnumAsInner, PartialEq, Eq)]
pub(crate) enum TypeDefinition {
  Struct { loc: Location, fields: Vec<FieldDefinition> },
  Enum { loc: Location, variants: Vec<VariantDefinition> },
}

pub(crate) type ClassDefinition<T> =
  InterfaceDeclarationCommon<TypeDefinition, ClassMemberDefinition<T>>;

#[derive(Clone, PartialEq, Eq)]
pub(crate) enum Toplevel<T: Clone> {
  Interface(InterfaceDeclaration),
  Class(ClassDefinition<T>),
}

pub(crate) enum MemberDeclarationsIterator<'a, T: Clone> {
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

  pub(crate) fn is_private(&self) -> bool {
    match self {
      Toplevel::Interface(i) => i.private,
      Toplevel::Class(c) => c.private,
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

  pub(crate) fn extends_or_implements_nodes(&self) -> &Vec<annotation::Id> {
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

  pub(crate) fn members_iter(&self) -> MemberDeclarationsIterator<T> {
    match self {
      Toplevel::Interface(i) => MemberDeclarationsIterator::Interface(i.members.iter()),
      Toplevel::Class(c) => MemberDeclarationsIterator::Class(c.members.iter()),
    }
  }
}

#[derive(Clone, PartialEq, Eq)]
pub(crate) struct ModuleMembersImport {
  pub(crate) loc: Location,
  pub(crate) imported_members: Vec<Id>,
  pub(crate) imported_module: ModuleReference,
  pub(crate) imported_module_loc: Location,
}

#[derive(Clone)]
pub(crate) struct Module<T: Clone> {
  pub(crate) comment_store: CommentStore,
  pub(crate) imports: Vec<ModuleMembersImport>,
  pub(crate) toplevels: Vec<Toplevel<T>>,
  pub(crate) trailing_comments: CommentReference,
}

#[cfg(test)]
pub(crate) mod test_builder {
  use super::super::loc::Location;
  use super::*;
  use samlang_heap::{ModuleReference, PStr};

  pub(crate) struct CustomizedAstBuilder {}

  impl CustomizedAstBuilder {
    pub(crate) fn any_annot(&self) -> annotation::T {
      annotation::T::Primitive(
        Location::dummy(),
        NO_COMMENT_REFERENCE,
        annotation::PrimitiveTypeKind::Any,
      )
    }

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
      annotation::T::Id(annotation::Id {
        location: Location::dummy(),
        module_reference: ModuleReference::ROOT,
        id: Id::from(PStr::STR_TYPE),
        type_arguments: vec![],
      })
    }

    pub(crate) fn general_id_annot_unwrapped(
      &self,
      id: PStr,
      type_arguments: Vec<annotation::T>,
    ) -> annotation::Id {
      annotation::Id {
        location: Location::dummy(),
        module_reference: ModuleReference::DUMMY,
        id: Id::from(id),
        type_arguments,
      }
    }

    pub(crate) fn general_id_annot(
      &self,
      id: PStr,
      type_arguments: Vec<annotation::T>,
    ) -> annotation::T {
      annotation::T::Id(self.general_id_annot_unwrapped(id, type_arguments))
    }

    pub(crate) fn simple_id_annot(&self, id: PStr) -> annotation::T {
      self.general_id_annot(id, vec![])
    }

    pub(crate) fn generic_annot(&self, id: PStr) -> annotation::T {
      annotation::T::Generic(Location::dummy(), Id::from(id))
    }

    pub(crate) fn fn_annot_unwrapped(
      &self,
      argument_types: Vec<annotation::T>,
      return_type: annotation::T,
    ) -> annotation::Function {
      annotation::Function {
        location: Location::dummy(),
        associated_comments: NO_COMMENT_REFERENCE,
        argument_types,
        return_type: Box::new(return_type),
      }
    }

    pub(crate) fn fn_annot(
      &self,
      argument_types: Vec<annotation::T>,
      return_type: annotation::T,
    ) -> annotation::T {
      annotation::T::Fn(self.fn_annot_unwrapped(argument_types, return_type))
    }
  }

  pub(crate) fn create() -> CustomizedAstBuilder {
    CustomizedAstBuilder {}
  }
}
