use super::lexer::{Keyword, Token, TokenContent, TokenOp};
use crate::{
  ast::{source::*, Location, Position},
  common::{Heap, ModuleReference, PStr},
  errors::ErrorSet,
};
use itertools::Itertools;
use std::{
  cmp,
  collections::{HashMap, HashSet},
  rc::Rc,
  vec,
};

fn unescape_quotes(source: &str) -> String {
  source.replace("\\\"", "\"")
}

fn post_process_block_comment(heap: &mut Heap, block_comment: &str) -> PStr {
  heap.alloc_string(
    block_comment
      .split('\n')
      .into_iter()
      .map(|line| {
        let l = line.trim_start();
        if l.starts_with('*') {
          l.chars().skip(1).collect::<String>().trim().to_string()
        } else {
          l.trim_end().to_string()
        }
      })
      .filter(|line| !line.is_empty())
      .join(" "),
  )
}

pub(super) struct SourceParser<'a> {
  tokens: Vec<Token>,
  comments_store: CommentStore,
  module_reference: ModuleReference,
  heap: &'a mut Heap,
  error_set: &'a mut ErrorSet,
  builtin_classes: HashSet<PStr>,
  position: usize,
  class_source_map: HashMap<PStr, ModuleReference>,
}

impl<'a> SourceParser<'a> {
  // SECTION 1: Base Methods

  fn last_location(&self) -> Location {
    if self.position == 0 {
      return Location::dummy();
    }
    match self.tokens.get(self.position - 1) {
      Option::None => Location::dummy(),
      Option::Some(Token(loc, _)) => *loc,
    }
  }

  fn simple_peek(&self) -> Token {
    if let Some(peeked) = self.tokens.get(self.position) {
      *peeked
    } else {
      Token(self.last_location(), TokenContent::EOF)
    }
  }

  fn peek(&mut self) -> Token {
    loop {
      let peeked = self.simple_peek();
      let Token(_, content) = &peeked;
      match content {
        TokenContent::BlockComment(_)
        | TokenContent::DocComment(_)
        | TokenContent::LineComment(_) => self.consume(),
        _ => return peeked,
      }
    }
  }

  fn consume(&mut self) {
    let tokens = &self.tokens;
    if self.position > tokens.len() {
      let position = match tokens.last() {
        None => Position(0, 0),
        Some(Token(location, _)) => location.end,
      };
      let loc =
        Location { module_reference: self.module_reference, start: position, end: position };
      self.report(loc, "Unexpected end of file.".to_string());
      return;
    }
    self.position += 1
  }

  fn unconsume(&mut self) {
    let mut left_over = 1;
    while left_over > 0 {
      self.position -= 1;
      let content = &self.tokens[self.position].1;
      match content {
        TokenContent::BlockComment(_)
        | TokenContent::DocComment(_)
        | TokenContent::LineComment(_) => {}
        _ => left_over -= 1,
      }
    }
  }

  fn unconsume_comments(&mut self) {
    if self.position == 0 {
      return;
    }
    let mut i = cmp::min(self.position, self.tokens.len()) - 1;
    loop {
      let content = &self.tokens[i].1;
      match content {
        TokenContent::BlockComment(_)
        | TokenContent::DocComment(_)
        | TokenContent::LineComment(_) => {
          if i == 0 {
            self.position = 0;
            return;
          }
          i -= 1
        }
        _ => break,
      }
    }
    self.position = i + 1;
  }

  fn assert_and_consume_keyword(&mut self, expected_kind: Keyword) -> Location {
    let Token(location, content) = self.peek();
    if let TokenContent::Keyword(k) = content {
      if k == expected_kind {
        self.consume();
        return location;
      }
    }
    self.report(
      location,
      format!("Expected: {}, actual: {}.", expected_kind.as_str(), content.pretty_print(self.heap)),
    );
    location
  }

  fn assert_and_consume_operator(&mut self, expected_kind: TokenOp) -> Location {
    let Token(location, content) = self.peek();
    if let TokenContent::Operator(op) = content {
      if op == expected_kind {
        self.consume();
        return location;
      }
      self.consume();
    }
    self.report(
      location,
      format!("Expected: {}, actual: {}.", expected_kind.as_str(), content.pretty_print(self.heap)),
    );
    location
  }

  fn assert_and_peek_lower_id(&mut self) -> (Location, PStr) {
    let Token(location, content) = self.peek();
    if let TokenContent::LowerId(id) = content {
      self.consume();
      return (location, id);
    }
    self
      .report(location, format!("Expected: lowerId, actual: {}.", content.pretty_print(self.heap)));
    (
      Location {
        module_reference: location.module_reference,
        start: location.start,
        end: location.start,
      },
      self.heap.alloc_str_permanent("MISSING"),
    )
  }

  fn assert_and_peek_upper_id(&mut self) -> (Location, PStr) {
    let Token(location, content) = self.peek();
    if let TokenContent::UpperId(id) = content {
      self.consume();
      return (location, id);
    }
    self
      .report(location, format!("Expected: upperId, actual: {}.", content.pretty_print(self.heap)));
    (
      Location {
        module_reference: location.module_reference,
        start: location.start,
        end: location.start,
      },
      self.heap.alloc_str_permanent("MISSING"),
    )
  }

  fn assert_and_consume_identifier(&mut self) -> (Location, PStr) {
    let Token(location, content) = self.peek();
    self.consume();
    match content {
      TokenContent::LowerId(id) | TokenContent::UpperId(id) => {
        return (location, id);
      }
      _ => {}
    }
    self.report(
      location,
      format!("Expected: identifier, actual: {}.", content.pretty_print(self.heap)),
    );
    (location, self.heap.alloc_str_permanent("MISSING"))
  }

  fn report(&mut self, loc: Location, reason: String) {
    self.error_set.report_invalid_syntax_error(loc, reason)
  }

  fn parse_punctuation_separated_list<T, F: FnMut(&mut Self) -> T>(
    &mut self,
    punctuation: TokenOp,
    end_token: Option<TokenOp>,
    parser: &mut F,
  ) -> Vec<T> {
    let mut collector = vec![parser(self)];
    while let Token(_, TokenContent::Operator(op)) = self.peek() {
      if op != punctuation {
        break;
      }
      self.consume();
      match self.peek() {
        Token(_, TokenContent::Operator(token_op)) if end_token == Some(token_op) => {
          return collector
        }
        _ => {}
      }
      collector.push(parser(self));
    }
    collector
  }

  fn parse_comma_separated_list<T, F: FnMut(&mut Self) -> T>(
    &mut self,
    end_token: Option<TokenOp>,
    parser: &mut F,
  ) -> Vec<T> {
    self.parse_punctuation_separated_list(TokenOp::COMMA, end_token, parser)
  }

  // SECTION 2: Source Parser

  pub(super) fn new(
    tokens: Vec<Token>,
    heap: &'a mut Heap,
    error_set: &'a mut ErrorSet,
    module_reference: ModuleReference,
    builtin_classes: HashSet<PStr>,
  ) -> SourceParser<'a> {
    SourceParser {
      tokens,
      comments_store: CommentStore::new(),
      module_reference,
      heap,
      error_set,
      builtin_classes,
      position: 0,
      class_source_map: HashMap::new(),
    }
  }

  pub(super) fn parse_module(mut self) -> Module<()> {
    let mut imports = vec![];
    while let Token(import_start, TokenContent::Keyword(Keyword::IMPORT)) = self.peek() {
      self.consume();
      self.assert_and_consume_operator(TokenOp::LBRACE);
      let imported_members =
        self.parse_comma_separated_list(Some(TokenOp::RBRACE), &mut SourceParser::parse_upper_id);
      self.assert_and_consume_operator(TokenOp::RBRACE);
      self.assert_and_consume_keyword(Keyword::FROM);
      let import_loc_start = self.peek().0;
      let imported_module_parts =
        self.parse_punctuation_separated_list(TokenOp::DOT, None, &mut |s: &mut Self| {
          s.assert_and_consume_identifier().1
        });
      let imported_module = self.heap.alloc_module_reference(imported_module_parts);
      let imported_module_loc = import_loc_start.union(&self.last_location());
      for variable in imported_members.iter() {
        self.class_source_map.insert(variable.name, imported_module);
      }
      imports.push(ModuleMembersImport {
        loc: import_start.union(&imported_module_loc),
        imported_members,
        imported_module,
        imported_module_loc,
      });
    }

    let mut toplevels = vec![];
    'outer: loop {
      if let TokenContent::EOF = self.peek().1 {
        break;
      }
      loop {
        match self.peek() {
          Token(_, TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE)) => break,
          Token(_, TokenContent::EOF) => break 'outer,
          Token(loc, content) => {
            self.consume();
            self.report(
              loc,
              format!(
                "Unexpected token among the classes and interfaces: {}",
                content.pretty_print(self.heap)
              ),
            )
          }
        }
      }
      toplevels.push(self.parse_toplevel());
    }

    Module { comment_store: self.comments_store, imports, toplevels }
  }

  fn parse_toplevel(&mut self) -> Toplevel<()> {
    let peeked = self.peek().1;
    self.unconsume_comments();
    if let TokenContent::Keyword(Keyword::CLASS) = peeked {
      Toplevel::Class(self.parse_class())
    } else {
      Toplevel::Interface(self.parse_interface())
    }
  }

  pub(super) fn parse_class(&mut self) -> ClassDefinition<()> {
    let associated_comments = self.collect_preceding_comments();
    let mut loc = self.assert_and_consume_keyword(Keyword::CLASS);
    let name = self.parse_upper_id();
    loc = loc.union(&name.loc);
    let (type_param_loc_start, type_param_loc_end, type_parameters) =
      if let Token(loc_start, TokenContent::Operator(TokenOp::LT)) = self.peek() {
        self.consume();
        let type_params = self
          .parse_comma_separated_list(Some(TokenOp::GT), &mut SourceParser::parse_type_parameter);
        let loc_end = self.assert_and_consume_operator(TokenOp::GT);
        (Some(loc_start), Some(loc_end), type_params)
      } else {
        (None, None, vec![])
      };
    let (type_definition, extends_or_implements_nodes) = match self.peek().1 {
      TokenContent::Operator(TokenOp::LBRACE | TokenOp::COLON)
      | TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE) => {
        let nodes = if let TokenContent::Operator(TokenOp::COLON) = self.peek().1 {
          self.consume();
          let nodes = self.parse_extends_or_implements_nodes();
          loc = loc.union(&nodes.last().unwrap().location);
          nodes
        } else {
          vec![]
        };
        loc = if let Some(loc_end) = type_param_loc_end { loc.union(&loc_end) } else { loc };
        let type_def = TypeDefinition::Struct { loc: self.peek().0, fields: vec![] };
        (type_def, nodes)
      }
      _ => {
        let type_def_loc_start = self.assert_and_consume_operator(TokenOp::LPAREN);
        let mut type_def = self.parse_type_definition_inner();
        let type_def_loc_end = self.assert_and_consume_operator(TokenOp::RPAREN);
        let type_def_loc =
          type_param_loc_start.unwrap_or(type_def_loc_start).union(&type_def_loc_end);
        match &mut type_def {
          TypeDefinition::Struct { loc, fields: _ } => *loc = type_def_loc,
          TypeDefinition::Enum { loc, variants: _ } => *loc = type_def_loc,
        }
        loc = loc.union(&type_def_loc_end);
        let nodes = if let TokenContent::Operator(TokenOp::COLON) = self.peek().1 {
          self.consume();
          let nodes = self.parse_extends_or_implements_nodes();
          loc = loc.union(&nodes.last().unwrap().location);
          nodes
        } else {
          vec![]
        };
        (type_def, nodes)
      }
    };
    let mut members = vec![];
    if !self.peeked_class_or_interface_start() {
      self.assert_and_consume_operator(TokenOp::LBRACE);
      while let TokenContent::Keyword(Keyword::FUNCTION | Keyword::METHOD | Keyword::PRIVATE) =
        self.peek().1
      {
        members.push(self.parse_class_member_definition());
      }
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition,
      members,
    }
  }

  pub(super) fn parse_interface(&mut self) -> InterfaceDeclaration {
    let associated_comments = self.collect_preceding_comments();
    let mut loc = self.assert_and_consume_keyword(Keyword::INTERFACE);
    let name = self.parse_upper_id();
    let type_parameters = if let TokenContent::Operator(TokenOp::LT) = self.peek().1 {
      self.consume();
      let type_params =
        self.parse_comma_separated_list(Some(TokenOp::GT), &mut SourceParser::parse_type_parameter);
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::GT));
      type_params
    } else {
      vec![]
    };
    let extends_or_implements_nodes = if let TokenContent::Operator(TokenOp::COLON) = self.peek().1
    {
      self.consume();
      let nodes = self.parse_extends_or_implements_nodes();
      loc = loc.union(&nodes.last().unwrap().location);
      nodes
    } else {
      vec![]
    };
    let mut members = vec![];
    if let TokenContent::Operator(TokenOp::LBRACE) = self.peek().1 {
      self.consume();
      while let TokenContent::Keyword(Keyword::FUNCTION | Keyword::METHOD | Keyword::PRIVATE) =
        self.peek().1
      {
        members.push(self.parse_class_member_declaration());
      }
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition: (),
      members,
    }
  }

  fn parse_extends_or_implements_nodes(&mut self) -> Vec<annotation::Id> {
    self.parse_comma_separated_list(None, &mut |s: &mut Self| {
      let id = s.parse_upper_id();
      s.parse_identifier_annot(id)
    })
  }

  fn parse_type_definition_inner(&mut self) -> TypeDefinition {
    if let Token(_, TokenContent::UpperId(_)) = self.peek() {
      let variants = self.parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
        let name = s.parse_upper_id();
        s.assert_and_consume_operator(TokenOp::LPAREN);
        let associated_data_type = s.parse_annotation();
        s.assert_and_consume_operator(TokenOp::RPAREN);
        VariantDefinition { name, associated_data_type }
      });
      // Location is later patched by the caller
      TypeDefinition::Enum { loc: Location::dummy(), variants }
    } else {
      let fields = self.parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
        let mut is_public = true;
        if let TokenContent::Keyword(Keyword::PRIVATE) = s.peek().1 {
          is_public = false;
          s.consume();
        }
        s.assert_and_consume_keyword(Keyword::VAL);
        let name = s.parse_lower_id();
        s.assert_and_consume_operator(TokenOp::COLON);
        let annotation = s.parse_annotation();
        FieldDefinition { name, annotation, is_public }
      });
      // Location is later patched by the caller
      TypeDefinition::Struct { loc: Location::dummy(), fields }
    }
  }

  fn peeked_class_or_interface_start(&mut self) -> bool {
    matches!(self.peek().1, TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE))
  }

  pub(super) fn parse_class_member_definition(&mut self) -> ClassMemberDefinition<()> {
    let mut decl = self.parse_class_member_declaration_common(true);
    self.assert_and_consume_operator(TokenOp::ASSIGN);
    let body = self.parse_expression();
    decl.loc = decl.loc.union(&body.loc());
    ClassMemberDefinition { decl, body }
  }

  pub(super) fn parse_class_member_declaration(&mut self) -> ClassMemberDeclaration {
    self.parse_class_member_declaration_common(false)
  }

  fn parse_class_member_declaration_common(
    &mut self,
    allow_private: bool,
  ) -> ClassMemberDeclaration {
    let associated_comments = self.collect_preceding_comments();
    let mut is_public = true;
    let mut is_method = true;
    let mut peeked = self.peek();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::PRIVATE)) = peeked {
      if allow_private {
        is_public = false;
      } else {
        self.report(peeked_loc, "Unexpected `private`".to_string());
      }
      self.consume();
      peeked = self.peek();
    }
    let start_loc = &peeked.0;
    if let Token(_, TokenContent::Keyword(Keyword::FUNCTION)) = &peeked {
      is_method = false;
      self.consume();
    } else {
      self.assert_and_consume_keyword(Keyword::METHOD);
    }
    let type_parameters = if let TokenContent::Operator(TokenOp::LT) = self.peek().1 {
      self.consume();
      let type_params = self.parse_comma_separated_list(Some(TokenOp::GT), &mut |s: &mut Self| {
        s.parse_type_parameter()
      });
      self.assert_and_consume_operator(TokenOp::GT);
      type_params
    } else {
      vec![]
    };
    let name = self.parse_lower_id();
    let fun_type_loc_start = self.assert_and_consume_operator(TokenOp::LPAREN);
    let parameters = if let TokenContent::Operator(TokenOp::RPAREN) = self.peek().1 {
      vec![]
    } else {
      self.parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
        let name = s.parse_lower_id();
        s.assert_and_consume_operator(TokenOp::COLON);
        let annotation = s.parse_annotation();
        AnnotatedId { name, annotation }
      })
    };
    self.assert_and_consume_operator(TokenOp::RPAREN);
    self.assert_and_consume_operator(TokenOp::COLON);
    let return_type = self.parse_annotation();
    let fun_type_loc = fun_type_loc_start.union(&return_type.location());
    ClassMemberDeclaration {
      loc: start_loc.union(&fun_type_loc),
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      is_public,
      is_method,
      name,
      type_parameters: Rc::new(type_parameters),
      type_: annotation::Function {
        location: fun_type_loc,
        associated_comments: NO_COMMENT_REFERENCE,
        argument_types: parameters.iter().map(|it| it.annotation.clone()).collect_vec(),
        return_type: Box::new(return_type),
      },
      parameters: Rc::new(parameters),
    }
  }

  fn parse_type_parameter(&mut self) -> TypeParameter {
    let name = &self.parse_upper_id();
    let (bound, loc) = if let Token(_, TokenContent::Operator(TokenOp::COLON)) = self.peek() {
      self.consume();
      let id = self.parse_upper_id();
      let bound = self.parse_identifier_annot(id);
      let loc = name.loc.union(&bound.location);
      (Some(bound), loc)
    } else {
      (None, name.loc)
    };
    TypeParameter { loc, name: *name, bound }
  }

  pub(super) fn parse_expression_with_comment_store(mut self) -> (CommentStore, expr::E<()>) {
    let e = self.parse_expression();
    (self.comments_store, e)
  }

  fn parse_expression(&mut self) -> expr::E<()> {
    self.parse_match()
  }

  fn parse_expression_with_ending_comments(&mut self) -> expr::E<()> {
    let expr = self.parse_expression();
    let mut new_comments = self.collect_preceding_comments();
    let associated_comments = self.comments_store.get_mut(expr.common().associated_comments);
    associated_comments.append(&mut new_comments);
    expr
  }

  fn parse_match(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::MATCH)) = self.peek() {
      self.consume();
      let match_expression = self.parse_expression_with_ending_comments();
      self.assert_and_consume_operator(TokenOp::LBRACE);
      let mut matching_list = vec![self.parse_pattern_to_expression()];
      while let TokenContent::UpperId(_) = self.peek().1 {
        matching_list.push(self.parse_pattern_to_expression());
      }
      let loc = peeked_loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
      expr::E::Match(expr::Match {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        matched: Box::new(match_expression),
        cases: matching_list,
      })
    } else {
      self.parse_if_else()
    }
  }

  fn parse_pattern_to_expression(&mut self) -> expr::VariantPatternToExpression<()> {
    let tag = self.parse_upper_id();
    self.assert_and_consume_operator(TokenOp::LPAREN);
    let data_variable = if let TokenContent::Operator(TokenOp::UNDERSCORE) = self.peek().1 {
      self.consume();
      None
    } else {
      let name = self.parse_lower_id();
      Some((name, ()))
    };
    self.assert_and_consume_operator(TokenOp::RPAREN);
    self.assert_and_consume_operator(TokenOp::ARROW);
    let expression = self.parse_expression();
    let mut loc = tag.loc.union(&expression.loc());
    if matches!(expression, expr::E::Block(_) | expr::E::Match(_))
      || matches!(self.peek().1, TokenContent::Operator(TokenOp::RBRACE))
    {
      if matches!(self.peek().1, TokenContent::Operator(TokenOp::COMMA)) {
        loc = loc.union(&self.assert_and_consume_operator(TokenOp::COMMA));
      }
    } else {
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::COMMA));
    }
    expr::VariantPatternToExpression {
      loc,
      tag,
      tag_order: 0,
      data_variable,
      body: Box::new(expression),
    }
  }

  fn parse_if_else(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::IF)) = self.peek() {
      self.consume();
      let condition = self.parse_expression();
      self.assert_and_consume_keyword(Keyword::THEN);
      let e1 = self.parse_expression();
      self.assert_and_consume_keyword(Keyword::ELSE);
      let e2 = self.parse_expression();
      let loc = peeked_loc.union(&e2.loc());
      return expr::E::IfElse(expr::IfElse {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        condition: Box::new(condition),
        e1: Box::new(e1),
        e2: Box::new(e2),
      });
    }
    self.parse_disjunction()
  }

  fn parse_disjunction(&mut self) -> expr::E<()> {
    let mut e = self.parse_conjunction();
    while let TokenContent::Operator(TokenOp::OR) = self.peek().1 {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      self.consume();
      let e2 = self.parse_conjunction();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator: expr::BinaryOperator::OR,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_conjunction(&mut self) -> expr::E<()> {
    let mut e = self.parse_comparison();
    while let TokenContent::Operator(TokenOp::AND) = self.peek().1 {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      self.consume();
      let e2 = self.parse_comparison();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator: expr::BinaryOperator::AND,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_comparison(&mut self) -> expr::E<()> {
    let mut e = self.parse_term();
    loop {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      let operator = match self.peek().1 {
        TokenContent::Operator(TokenOp::LT) => expr::BinaryOperator::LT,
        TokenContent::Operator(TokenOp::LE) => expr::BinaryOperator::LE,
        TokenContent::Operator(TokenOp::GT) => expr::BinaryOperator::GT,
        TokenContent::Operator(TokenOp::GE) => expr::BinaryOperator::GE,
        TokenContent::Operator(TokenOp::EQ) => expr::BinaryOperator::EQ,
        TokenContent::Operator(TokenOp::NE) => expr::BinaryOperator::NE,
        _ => break,
      };
      self.consume();
      let e2 = self.parse_term();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_term(&mut self) -> expr::E<()> {
    let mut e = self.parse_factor();
    loop {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      let operator = match self.peek().1 {
        TokenContent::Operator(TokenOp::PLUS) => expr::BinaryOperator::PLUS,
        TokenContent::Operator(TokenOp::MINUS) => expr::BinaryOperator::MINUS,
        _ => break,
      };
      self.consume();
      let e2 = self.parse_factor();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_factor(&mut self) -> expr::E<()> {
    let mut e = self.parse_concat();
    loop {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      let operator = match self.peek().1 {
        TokenContent::Operator(TokenOp::MUL) => expr::BinaryOperator::MUL,
        TokenContent::Operator(TokenOp::DIV) => expr::BinaryOperator::DIV,
        TokenContent::Operator(TokenOp::MOD) => expr::BinaryOperator::MOD,
        _ => break,
      };
      self.consume();
      let e2 = self.parse_concat();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_concat(&mut self) -> expr::E<()> {
    let mut e = self.parse_unary_expression();
    while let TokenContent::Operator(TokenOp::COLONCOLON) = self.peek().1 {
      let concrete_comments = self.collect_preceding_comments();
      let operator_preceding_comments =
        self.comments_store.create_comment_reference(concrete_comments);
      self.consume();
      let e2 = self.parse_unary_expression();
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          type_: (),
        },
        operator_preceding_comments,
        operator: expr::BinaryOperator::CONCAT,
        e1: Box::new(e),
        e2: Box::new(e2),
      })
    }
    e
  }

  fn parse_unary_expression(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    let Token(peeked_loc, content) = self.peek();
    match content {
      TokenContent::Operator(TokenOp::NOT) => {
        self.consume();
        let argument = self.parse_function_call_or_field_access();
        let loc = peeked_loc.union(&argument.loc());
        expr::E::Unary(expr::Unary {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          operator: expr::UnaryOperator::NOT,
          argument: Box::new(argument),
        })
      }
      TokenContent::Operator(TokenOp::MINUS) => {
        self.consume();
        let argument = self.parse_function_call_or_field_access();
        let loc = peeked_loc.union(&argument.loc());
        expr::E::Unary(expr::Unary {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          operator: expr::UnaryOperator::NEG,
          argument: Box::new(argument),
        })
      }
      _ => self.parse_function_call_or_field_access(),
    }
  }

  fn parse_function_call_or_field_access(&mut self) -> expr::E<()> {
    // Treat function arguments or field name as postfix.
    // Then use Kleene star trick to parse.
    let mut function_expression = self.parse_base_expression();
    loop {
      match self.peek().1 {
        TokenContent::Operator(TokenOp::DOT) => {
          let mut field_preceding_comments = self.collect_preceding_comments();
          self.consume();
          field_preceding_comments.append(&mut self.collect_preceding_comments());
          let (field_loc, field_name) = self.assert_and_peek_lower_id();
          let mut loc = function_expression.loc().union(&field_loc);
          let explicit_type_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::LT)) = self.peek() {
              field_preceding_comments.append(&mut self.collect_preceding_comments());
              self.assert_and_consume_operator(TokenOp::LT);
              let type_args = self
                .parse_comma_separated_list(Some(TokenOp::GT), &mut |s: &mut Self| {
                  s.parse_annotation()
                });
              loc = loc.union(&self.assert_and_consume_operator(TokenOp::GT));
              type_args
            } else {
              vec![]
            };
          function_expression = expr::E::FieldAccess(expr::FieldAccess {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: self.comments_store.create_comment_reference(vec![]),
              type_: (),
            },
            explicit_type_arguments,
            inferred_type_arguments: vec![],
            object: Box::new(function_expression),
            field_name: Id {
              loc: field_loc,
              associated_comments: self
                .comments_store
                .create_comment_reference(field_preceding_comments),
              name: field_name,
            },
            field_order: -1,
          });
        }
        TokenContent::Operator(TokenOp::LPAREN) => {
          self.consume();
          let function_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = self.peek() {
              vec![]
            } else {
              self.parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
                s.parse_expression_with_ending_comments()
              })
            };
          let loc =
            function_expression.loc().union(&self.assert_and_consume_operator(TokenOp::RPAREN));
          function_expression = expr::E::Call(expr::Call {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: self.comments_store.create_comment_reference(vec![]),
              type_: (),
            },
            callee: Box::new(function_expression),
            arguments: function_arguments,
          })
        }
        _ => return function_expression,
      }
    }
  }

  fn parse_base_expression(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    let peeked = self.peek();

    if let Token(peeked_loc, TokenContent::Keyword(Keyword::TRUE)) = peeked {
      self.consume();
      return expr::E::Literal(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Literal::Bool(true),
      );
    }
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::FALSE)) = peeked {
      self.consume();
      return expr::E::Literal(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Literal::Bool(false),
      );
    }
    if let Token(peeked_loc, TokenContent::IntLiteral(i)) = peeked {
      self.consume();
      return expr::E::Literal(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Literal::Int(i.as_str(self.heap).parse::<i32>().unwrap_or(0)),
      );
    }
    if let Token(peeked_loc, TokenContent::StringLiteral(s)) = peeked {
      self.consume();
      let chars = s.as_str(self.heap).chars().into_iter().collect_vec();
      let str_lit = unescape_quotes(&chars[1..(chars.len() - 1)].iter().collect::<String>());
      return expr::E::Literal(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Literal::String(self.heap.alloc_string(str_lit)),
      );
    }
    if let Token(peeked_loc, TokenContent::LowerId(name)) = peeked {
      self.consume();
      return expr::E::Id(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Id {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          name,
        },
      );
    }
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::THIS)) = peeked {
      self.consume();
      return expr::E::Id(
        expr::ExpressionCommon {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        Id {
          loc: peeked_loc,
          associated_comments: self.comments_store.create_comment_reference(vec![]),
          name: self.heap.alloc_str_permanent("this"),
        },
      );
    }

    // Class function
    if let Token(peeked_loc, TokenContent::UpperId(class_name)) = peeked {
      self.consume();
      let next_peeked = self.peek();
      if let Token(_, TokenContent::Operator(TokenOp::DOT)) = next_peeked {
        let mut member_preceding_comments = self.collect_preceding_comments();
        self.consume();
        member_preceding_comments.append(&mut self.collect_preceding_comments());
        let (member_name_loc, function_name) = self.assert_and_consume_identifier();
        let mut loc = peeked_loc.union(&member_name_loc);
        let explicit_type_arguments = if let TokenContent::Operator(TokenOp::LT) = self.peek().1 {
          member_preceding_comments.append(&mut self.collect_preceding_comments());
          self.assert_and_consume_operator(TokenOp::LT);
          let type_args = self
            .parse_comma_separated_list(Some(TokenOp::GT), &mut |s: &mut Self| {
              s.parse_annotation()
            });
          loc = loc.union(&self.assert_and_consume_operator(TokenOp::GT));
          type_args
        } else {
          vec![]
        };
        return expr::E::ClassFn(expr::ClassFunction {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          explicit_type_arguments,
          inferred_type_arguments: vec![],
          module_reference: self.resolve_class(class_name),
          class_name: Id {
            loc: peeked_loc,
            associated_comments: self.comments_store.create_comment_reference(vec![]),
            name: class_name,
          },
          fn_name: Id {
            loc: member_name_loc,
            associated_comments: self
              .comments_store
              .create_comment_reference(member_preceding_comments),
            name: function_name,
          },
        });
      }
    }

    // Lambda or nested expression
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LPAREN)) = peeked {
      self.consume();
      // () -> ...
      if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = self.peek() {
        let mut comments = associated_comments;
        self.consume();
        comments.append(&mut self.collect_preceding_comments());
        self.assert_and_consume_operator(TokenOp::ARROW);
        let body = self.parse_expression();
        let loc = peeked_loc.union(&body.loc());
        return expr::E::Lambda(expr::Lambda {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: self.comments_store.create_comment_reference(comments),
            type_: (),
          },
          parameters: vec![],
          captured: HashMap::new(),
          body: Box::new(body),
        });
      }

      if let Token(loc_id_for_lambda, TokenContent::LowerId(id_for_lambda)) = self.peek() {
        self.consume();
        let next = self.peek();
        match next.1 {
          // (...) -> ...
          TokenContent::Operator(TokenOp::COMMA) | TokenContent::Operator(TokenOp::COLON) => {
            self.unconsume();
            let parameters =
              self.parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
                let name = s.parse_lower_id();
                if let Token(_, TokenContent::Operator(TokenOp::COLON)) = s.peek() {
                  s.consume();
                  OptionallyAnnotatedId { name, annotation: Some(s.parse_annotation()) }
                } else {
                  OptionallyAnnotatedId { name, annotation: None }
                }
              });
            self.assert_and_consume_operator(TokenOp::RPAREN);
            self.assert_and_consume_operator(TokenOp::ARROW);
            let body = self.parse_expression();
            let loc = peeked_loc.union(&body.loc());
            return expr::E::Lambda(expr::Lambda {
              common: expr::ExpressionCommon {
                loc,
                associated_comments: self
                  .comments_store
                  .create_comment_reference(associated_comments),
                type_: (),
              },
              parameters,
              captured: HashMap::new(),
              body: Box::new(body),
            });
          }
          // (id) -> ...
          TokenContent::Operator(TokenOp::RPAREN) => {
            self.consume();
            if let Token(_, TokenContent::Operator(TokenOp::ARROW)) = self.peek() {
              let mut comments = associated_comments;
              comments.append(&mut self.collect_preceding_comments());
              self.consume();
              let body = self.parse_expression();
              let loc = peeked_loc.union(&body.loc());
              return expr::E::Lambda(expr::Lambda {
                common: expr::ExpressionCommon {
                  loc,
                  associated_comments: self.comments_store.create_comment_reference(comments),
                  type_: (),
                },
                parameters: vec![OptionallyAnnotatedId {
                  name: Id {
                    loc: loc_id_for_lambda,
                    associated_comments: self.comments_store.create_comment_reference(vec![]),
                    name: id_for_lambda,
                  },
                  annotation: None,
                }],
                captured: HashMap::new(),
                body: Box::new(body),
              });
            } else {
              self.unconsume();
            }
          }
          _ => {}
        }
        self.unconsume();
      }
      let nested_expr = self.parse_expression_with_ending_comments();
      self.assert_and_consume_operator(TokenOp::RPAREN);
      return nested_expr;
    }

    // Statement Block: { ... }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LBRACE)) = peeked {
      self.consume();

      let mut statements = vec![];
      while let Token(_, TokenContent::Keyword(Keyword::VAL)) = self.peek() {
        statements.push(self.parse_statement());
      }

      // No final expression
      if let Token(end_loc, TokenContent::Operator(TokenOp::RBRACE)) = self.peek() {
        self.consume();
        let loc = peeked_loc.union(&end_loc);
        return expr::E::Block(expr::Block {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          statements,
          expression: None,
        });
      }

      // Has final expression
      let expression = self.parse_expression_with_ending_comments();
      let loc = peeked_loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
      return expr::E::Block(expr::Block {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        statements,
        expression: Some(Box::new(expression)),
      });
    }

    // Error case
    self.report(
      peeked.0,
      format!("Expected: expression, actual: {}", peeked.1.pretty_print(self.heap)),
    );
    expr::E::Literal(
      expr::ExpressionCommon {
        loc: peeked.0,
        associated_comments: self.comments_store.create_comment_reference(associated_comments),
        type_: (),
      },
      Literal::Int(0),
    )
  }

  pub(super) fn parse_statement(&mut self) -> expr::DeclarationStatement<()> {
    let concrete_comments = self.collect_preceding_comments();
    let associated_comments = self.comments_store.create_comment_reference(concrete_comments);
    let start_loc = self.assert_and_consume_keyword(Keyword::VAL);
    let pattern = self.parse_pattern();
    let annotation = if let Token(_, TokenContent::Operator(TokenOp::COLON)) = self.peek() {
      self.consume();
      Some(self.parse_annotation())
    } else {
      None
    };
    self.assert_and_consume_operator(TokenOp::ASSIGN);
    let assigned_expression = Box::new(self.parse_expression());
    let loc = start_loc.union(&self.assert_and_consume_operator(TokenOp::SEMICOLON));
    expr::DeclarationStatement {
      loc,
      associated_comments,
      pattern,
      annotation,
      assigned_expression,
    }
  }

  pub(super) fn parse_pattern(&mut self) -> expr::Pattern<()> {
    let peeked = self.peek();
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LBRACE)) = peeked {
      self.consume();
      let destructured_names =
        self.parse_comma_separated_list(Some(TokenOp::RBRACE), &mut |s: &mut Self| {
          let field_name = s.parse_lower_id();
          let (alias, loc) = if let Token(_, TokenContent::Keyword(Keyword::AS)) = s.peek() {
            s.consume();
            let alias = s.parse_lower_id();
            let loc = field_name.loc.union(&alias.loc);
            (Some(alias), loc)
          } else {
            (None, field_name.loc)
          };
          expr::ObjectPatternDestucturedName { loc, field_name, field_order: 0, alias, type_: () }
        });
      let end_location = self.assert_and_consume_operator(TokenOp::RBRACE);
      return expr::Pattern::Object(peeked_loc.union(&end_location), destructured_names);
    }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::UNDERSCORE)) = peeked {
      self.consume();
      return expr::Pattern::Wildcard(peeked_loc);
    }
    expr::Pattern::Id(peeked.0, self.assert_and_peek_lower_id().1)
  }

  fn parse_upper_id(&mut self) -> Id {
    let associated_comments = self.collect_preceding_comments();
    let (loc, name) = self.assert_and_peek_upper_id();
    Id {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
    }
  }

  fn parse_lower_id(&mut self) -> Id {
    let associated_comments = self.collect_preceding_comments();
    let (loc, name) = self.assert_and_peek_lower_id();
    Id {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
    }
  }

  fn collect_preceding_comments(&mut self) -> Vec<Comment> {
    self.unconsume_comments();
    let mut comments = vec![];
    loop {
      match self.simple_peek().1 {
        TokenContent::LineComment(text) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::LINE, text });
        }
        TokenContent::BlockComment(text) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::BLOCK, text })
        }
        TokenContent::DocComment(text) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::DOC, text })
        }
        _ => break,
      }
    }
    comments
  }

  pub(super) fn parse_annotation(&mut self) -> annotation::T {
    let associated_comments = self.collect_preceding_comments();
    let peeked = self.peek();
    match peeked.1 {
      TokenContent::Keyword(Keyword::UNIT) => {
        self.consume();
        annotation::T::Primitive(
          peeked.0,
          self.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Unit,
        )
      }
      TokenContent::Keyword(Keyword::BOOL) => {
        self.consume();
        annotation::T::Primitive(
          peeked.0,
          self.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Bool,
        )
      }
      TokenContent::Keyword(Keyword::INT) => {
        self.consume();
        annotation::T::Primitive(
          peeked.0,
          self.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Int,
        )
      }
      TokenContent::Keyword(Keyword::STRING) => {
        self.consume();
        annotation::T::Primitive(
          peeked.0,
          self.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::String,
        )
      }
      TokenContent::UpperId(name) => {
        self.consume();
        let associated_comments = self.comments_store.create_comment_reference(vec![]);
        annotation::T::Id(self.parse_identifier_annot(Id {
          loc: peeked.0,
          associated_comments,
          name,
        }))
      }
      TokenContent::Operator(TokenOp::LPAREN) => {
        self.consume();
        let argument_types = if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = self.peek()
        {
          self.consume();
          vec![]
        } else {
          let types = self
            .parse_comma_separated_list(Some(TokenOp::RPAREN), &mut |s: &mut Self| {
              s.parse_annotation()
            });
          self.assert_and_consume_operator(TokenOp::RPAREN);
          types
        };
        self.assert_and_consume_operator(TokenOp::ARROW);
        let return_type = self.parse_annotation();
        let location = peeked.0.union(&return_type.location());
        annotation::T::Fn(annotation::Function {
          location,
          associated_comments: self.comments_store.create_comment_reference(associated_comments),
          argument_types,
          return_type: Box::new(return_type),
        })
      }
      content => {
        self.report(
          peeked.0,
          format!("Expecting: type, actual: {}", content.pretty_print(self.heap)),
        );
        annotation::T::Primitive(
          peeked.0,
          self.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Any,
        )
      }
    }
  }

  fn parse_identifier_annot(&mut self, identifier: Id) -> annotation::Id {
    let (type_arguments, location) =
      if let Token(_, TokenContent::Operator(TokenOp::LT)) = self.peek() {
        self.consume();
        let types = self
          .parse_comma_separated_list(Some(TokenOp::GT), &mut |s: &mut Self| s.parse_annotation());
        let location = identifier.loc.union(&self.assert_and_consume_operator(TokenOp::GT));
        (types, location)
      } else {
        (vec![], identifier.loc)
      };
    annotation::Id {
      location,
      module_reference: self.resolve_class(identifier.name),
      id: identifier,
      type_arguments,
    }
  }

  fn resolve_class(&mut self, class_name: PStr) -> ModuleReference {
    if self.builtin_classes.contains(&class_name) {
      ModuleReference::root()
    } else {
      *self.class_source_map.get(&class_name).unwrap_or(&self.module_reference)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::{post_process_block_comment, SourceParser};
  use crate::{
    ast::Location,
    common::{Heap, ModuleReference},
    errors::ErrorSet,
    parser::lexer::{Token, TokenContent},
  };
  use std::collections::HashSet;

  #[test]
  fn processor_test() {
    let mut heap = Heap::new();
    assert_eq!("/* ff dd*/", post_process_block_comment(&mut heap, "/*\n*ff\n*dd*/").as_str(&heap));
  }

  #[test]
  fn base_tests_1() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut parser = SourceParser::new(
      vec![],
      &mut heap,
      &mut error_set,
      ModuleReference::dummy(),
      HashSet::new(),
    );

    parser.consume();
    parser.peek();

    parser.position = 1;
    parser.consume();
  }

  #[test]
  fn base_tests_2() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut parser = SourceParser::new(
      vec![Token(Location::dummy(), TokenContent::Error(heap.alloc_str_for_test("ouch")))],
      &mut heap,
      &mut error_set,
      ModuleReference::dummy(),
      HashSet::new(),
    );

    parser.position = 100;
    parser.consume();
  }

  fn with_tokens_robustness_tests(heap: &mut Heap, tokens: Vec<Token>) {
    let mut error_set = ErrorSet::new();
    let mut parser =
      SourceParser::new(tokens, heap, &mut error_set, ModuleReference::dummy(), HashSet::new());

    parser.parse_interface();
    parser.parse_class();
    parser.parse_class_member_definition();
    parser.parse_class_member_declaration();
    parser.parse_expression();
    parser.parse_pattern();
    parser.parse_statement();
    parser.parse_annotation();
    parser.parse_module();
  }

  #[test]
  fn empty_robustness_tests() {
    with_tokens_robustness_tests(&mut Heap::new(), vec![]);
  }

  #[test]
  fn error_robustness_tests() {
    let heap = &mut Heap::new();
    let tokens =
      vec![Token(Location::dummy(), TokenContent::Error(heap.alloc_str_for_test("ouch")))];
    with_tokens_robustness_tests(heap, tokens);
  }
}
