use super::lexer::{Keyword, Token, TokenContent, TokenOp};
use samlang_ast::{source::*, Location, Position};
use samlang_errors::ErrorSet;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::{
  cmp,
  collections::{HashMap, HashSet},
  vec,
};

const MAX_STRUCT_SIZE: usize = 16;
const MAX_VARIANT_SIZE: usize = 15;

pub(super) struct SourceParser<'a> {
  tokens: Vec<Token>,
  comments_store: CommentStore,
  module_reference: ModuleReference,
  heap: &'a mut Heap,
  error_set: &'a mut ErrorSet,
  builtin_classes: HashSet<PStr>,
  position: usize,
  class_source_map: HashMap<PStr, ModuleReference>,
  available_tparams: HashSet<PStr>,
}

impl<'a> SourceParser<'a> {
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
      available_tparams: HashSet::new(),
    }
  }

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
      PStr::MISSING,
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
      PStr::MISSING,
    )
  }

  fn assert_and_consume_identifier(&mut self) -> (Location, PStr) {
    let Token(location, content) = self.peek();
    self.consume();
    match content {
      TokenContent::LowerId(id) | TokenContent::UpperId(id) => (location, id),
      _ => {
        self.report(
          location,
          format!("Expected: identifier, actual: {}.", content.pretty_print(self.heap)),
        );
        (location, PStr::MISSING)
      }
    }
  }

  fn report(&mut self, loc: Location, reason: String) {
    self.error_set.report_invalid_syntax_error(loc, reason)
  }

  fn parse_comma_separated_list_with_end_token<T, F: FnMut(&mut Self) -> T>(
    &mut self,
    end_token: TokenOp,
    parser: &mut F,
  ) -> Vec<T> {
    let mut collector = vec![parser(self)];
    while let Token(_, TokenContent::Operator(op)) = self.peek() {
      if op != TokenOp::COMMA {
        break;
      }
      self.consume();
      if self.peek().1 == TokenContent::Operator(end_token) {
        return collector;
      }
      collector.push(parser(self));
    }
    collector
  }

  fn parse_upper_id(&mut self) -> Id {
    self.parse_upper_id_with_comments(vec![])
  }

  fn parse_upper_id_with_comments(&mut self, mut associated_comments: Vec<Comment>) -> Id {
    associated_comments.append(&mut self.collect_preceding_comments());
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
      match self.simple_peek() {
        Token(location, TokenContent::LineComment(text)) => {
          self.consume();
          comments.push(Comment { location, kind: CommentKind::LINE, text });
        }
        Token(location, TokenContent::BlockComment(text)) => {
          self.consume();
          comments.push(Comment { location, kind: CommentKind::BLOCK, text })
        }
        Token(location, TokenContent::DocComment(text)) => {
          self.consume();
          comments.push(Comment { location, kind: CommentKind::DOC, text })
        }
        _ => break,
      }
    }
    comments
  }
}

pub fn parse_module(mut parser: SourceParser) -> Module<()> {
  let mut imports = vec![];
  while let Token(import_start, TokenContent::Keyword(Keyword::IMPORT)) = parser.peek() {
    parser.consume();
    parser.assert_and_consume_operator(TokenOp::LBRACE);
    let imported_members = parser.parse_comma_separated_list_with_end_token(
      TokenOp::RBRACE,
      &mut SourceParser::parse_upper_id,
    );
    parser.assert_and_consume_operator(TokenOp::RBRACE);
    parser.assert_and_consume_keyword(Keyword::FROM);
    let import_loc_start = parser.peek().0;
    let imported_module_parts = {
      let mut collector = vec![parser.assert_and_consume_identifier().1];
      while let Token(_, TokenContent::Operator(TokenOp::DOT)) = parser.peek() {
        parser.consume();
        collector.push(parser.assert_and_consume_identifier().1);
      }
      collector
    };
    let imported_module = parser.heap.alloc_module_reference(imported_module_parts);
    let imported_module_loc = import_loc_start.union(&parser.last_location());
    for variable in imported_members.iter() {
      parser.class_source_map.insert(variable.name, imported_module);
    }
    let loc =
      if let Token(semicolon_loc, TokenContent::Operator(TokenOp::SEMICOLON)) = parser.peek() {
        parser.consume();
        import_start.union(&semicolon_loc)
      } else {
        import_start.union(&imported_module_loc)
      };
    imports.push(ModuleMembersImport {
      loc,
      imported_members,
      imported_module,
      imported_module_loc,
    });
  }

  let mut toplevels = vec![];
  'outer: loop {
    if let TokenContent::EOF = parser.peek().1 {
      break;
    }
    loop {
      match parser.peek() {
        Token(_, TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE)) => {
          break
        }
        Token(_, TokenContent::EOF) => break 'outer,
        Token(loc, content) => {
          parser.consume();
          parser.report(
            loc,
            format!(
              "Unexpected token among the classes and interfaces: {}",
              content.pretty_print(parser.heap)
            ),
          )
        }
      }
    }
    toplevels.push(toplevel_parser::parse_toplevel(&mut parser));
  }
  let comments = parser.collect_preceding_comments();
  let trailing_comments = parser.comments_store.create_comment_reference(comments);

  Module { comment_store: parser.comments_store, imports, toplevels, trailing_comments }
}

pub(super) fn parse_expression_with_comment_store(
  mut parser: SourceParser,
) -> (CommentStore, expr::E<()>) {
  let e = expression_parser::parse_expression(&mut parser);
  (parser.comments_store, e)
}

mod toplevel_parser {
  use super::{
    super::lexer::{Keyword, Token, TokenContent, TokenOp},
    MAX_STRUCT_SIZE, MAX_VARIANT_SIZE,
  };
  use itertools::Itertools;
  use samlang_ast::{source::*, Location};
  use std::collections::HashSet;

  pub(super) fn parse_toplevel(parser: &mut super::SourceParser) -> Toplevel<()> {
    parser.unconsume_comments();
    let is_private = if let TokenContent::Keyword(Keyword::PRIVATE) = parser.peek().1 {
      parser.consume();
      true
    } else {
      false
    };
    let is_class = matches!(parser.peek().1, TokenContent::Keyword(Keyword::CLASS));
    if is_private {
      parser.unconsume();
    }
    if is_class {
      Toplevel::Class(parse_class(parser))
    } else {
      Toplevel::Interface(parse_interface(parser))
    }
  }

  pub(super) fn parse_class(parser: &mut super::SourceParser) -> ClassDefinition<()> {
    let associated_comments = parser.collect_preceding_comments();
    let (mut loc, private) =
      if let Token(loc, TokenContent::Keyword(Keyword::PRIVATE)) = parser.peek() {
        parser.consume();
        parser.assert_and_consume_keyword(Keyword::CLASS);
        (loc, true)
      } else {
        (parser.assert_and_consume_keyword(Keyword::CLASS), false)
      };
    let name = parser.parse_upper_id();
    loc = loc.union(&name.loc);
    parser.available_tparams = HashSet::new();
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    let (type_definition, extends_or_implements_nodes) = match parser.peek().1 {
      TokenContent::Operator(TokenOp::LBRACE | TokenOp::COLON)
      | TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE) => {
        let nodes = if let TokenContent::Operator(TokenOp::COLON) = parser.peek().1 {
          parser.consume();
          let nodes = parse_extends_or_implements_nodes(parser);
          loc = loc.union(&nodes.last().unwrap().location);
          nodes
        } else {
          vec![]
        };
        loc = if let Some(tparams_node) = &type_parameters {
          loc.union(&tparams_node.location)
        } else {
          loc
        };
        let type_def = TypeDefinition::Struct { loc: parser.peek().0, fields: vec![] };
        (type_def, nodes)
      }
      _ => {
        let type_def_loc_start = parser.assert_and_consume_operator(TokenOp::LPAREN);
        let mut type_def = parse_type_definition_inner(parser);
        let type_def_loc_end = parser.assert_and_consume_operator(TokenOp::RPAREN);
        let type_def_loc = type_parameters
          .as_ref()
          .map(|it| it.location)
          .unwrap_or(type_def_loc_start)
          .union(&type_def_loc_end);
        match &mut type_def {
          TypeDefinition::Struct { loc, fields: _ } => *loc = type_def_loc,
          TypeDefinition::Enum { loc, variants: _ } => *loc = type_def_loc,
        }
        loc = loc.union(&type_def_loc_end);
        let nodes = if let TokenContent::Operator(TokenOp::COLON) = parser.peek().1 {
          parser.consume();
          let nodes = parse_extends_or_implements_nodes(parser);
          loc = loc.union(&nodes.last().unwrap().location);
          nodes
        } else {
          vec![]
        };
        (type_def, nodes)
      }
    };
    let mut members = vec![];
    if !peeked_class_or_interface_start(parser) {
      parser.assert_and_consume_operator(TokenOp::LBRACE);
      while let TokenContent::Keyword(Keyword::FUNCTION | Keyword::METHOD | Keyword::PRIVATE) =
        parser.peek().1
      {
        let saved_upper_type_parameters = parser.available_tparams.clone();
        members.push(parse_class_member_definition(parser));
        parser.available_tparams = saved_upper_type_parameters;
      }
      loc = loc.union(&parser.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition,
      members,
    }
  }

  pub(super) fn parse_interface(parser: &mut super::SourceParser) -> InterfaceDeclaration {
    let associated_comments = parser.collect_preceding_comments();
    let (mut loc, private) =
      if let Token(loc, TokenContent::Keyword(Keyword::PRIVATE)) = parser.peek() {
        parser.consume();
        parser.assert_and_consume_keyword(Keyword::INTERFACE);
        (loc, true)
      } else {
        (parser.assert_and_consume_keyword(Keyword::INTERFACE), false)
      };
    let name = parser.parse_upper_id();
    parser.available_tparams = HashSet::new();
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    let extends_or_implements_nodes =
      if let TokenContent::Operator(TokenOp::COLON) = parser.peek().1 {
        parser.consume();
        let nodes = parse_extends_or_implements_nodes(parser);
        loc = loc.union(&nodes.last().unwrap().location);
        nodes
      } else {
        vec![]
      };
    let mut members = vec![];
    if let TokenContent::Operator(TokenOp::LBRACE) = parser.peek().1 {
      parser.consume();
      while let TokenContent::Keyword(Keyword::FUNCTION | Keyword::METHOD | Keyword::PRIVATE) =
        parser.peek().1
      {
        let saved_upper_type_parameters = parser.available_tparams.clone();
        members.push(parse_class_member_declaration(parser));
        parser.available_tparams = saved_upper_type_parameters;
      }
      loc = loc.union(&parser.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition: (),
      members,
    }
  }

  fn parse_extends_or_implements_nodes(parser: &mut super::SourceParser) -> Vec<annotation::Id> {
    let id = parser.parse_upper_id();
    let mut collector = vec![super::type_parser::parse_identifier_annot(parser, id)];
    while let Token(_, TokenContent::Operator(TokenOp::COMMA)) = parser.peek() {
      parser.consume();
      let id = parser.parse_upper_id();
      collector.push(super::type_parser::parse_identifier_annot(parser, id));
    }
    collector
  }

  fn parse_type_definition_inner(parser: &mut super::SourceParser) -> TypeDefinition {
    if let Token(_, TokenContent::UpperId(_)) = parser.peek() {
      let mut variants = parser
        .parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut parse_variant_definition);
      variants.truncate(MAX_VARIANT_SIZE);
      // Location is later patched by the caller
      TypeDefinition::Enum { loc: Location::dummy(), variants }
    } else {
      let mut fields = parser
        .parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut parse_field_definition);
      if let Some(node) = fields.get(MAX_STRUCT_SIZE) {
        parser.error_set.report_invalid_syntax_error(
          node.name.loc,
          format!("Maximum allowed field size is {MAX_STRUCT_SIZE}"),
        );
      }
      fields.truncate(MAX_STRUCT_SIZE);
      // Location is later patched by the caller
      TypeDefinition::Struct { loc: Location::dummy(), fields }
    }
  }

  fn parse_field_definition(parser: &mut super::SourceParser) -> FieldDefinition {
    let mut is_public = true;
    if let TokenContent::Keyword(Keyword::PRIVATE) = parser.peek().1 {
      is_public = false;
      parser.consume();
    }
    parser.assert_and_consume_keyword(Keyword::VAL);
    let name = parser.parse_lower_id();
    let annotation = super::type_parser::parse_annotation_with_colon(parser);
    FieldDefinition { name, annotation, is_public }
  }

  fn parse_variant_definition(parser: &mut super::SourceParser) -> VariantDefinition {
    let name = parser.parse_upper_id();
    if let Token(_, TokenContent::Operator(TokenOp::LPAREN)) = parser.peek() {
      parser.consume();
      let associated_data_types = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut super::type_parser::parse_annotation,
      );

      if let Some(node) = associated_data_types.get(MAX_VARIANT_SIZE) {
        parser.error_set.report_invalid_syntax_error(
          node.location(),
          format!("Maximum allowed field size is {MAX_VARIANT_SIZE}"),
        );
      }
      parser.assert_and_consume_operator(TokenOp::RPAREN);
      VariantDefinition { name, associated_data_types }
    } else {
      VariantDefinition { name, associated_data_types: vec![] }
    }
  }

  fn peeked_class_or_interface_start(parser: &mut super::SourceParser) -> bool {
    matches!(
      parser.peek().1,
      TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE)
    )
  }

  pub(super) fn parse_class_member_definition(
    parser: &mut super::SourceParser,
  ) -> ClassMemberDefinition<()> {
    let mut decl = parse_class_member_declaration_common(parser, true);
    parser.assert_and_consume_operator(TokenOp::ASSIGN);
    let body = super::expression_parser::parse_expression(parser);
    decl.loc = decl.loc.union(&body.loc());
    ClassMemberDefinition { decl, body }
  }

  pub(super) fn parse_class_member_declaration(
    parser: &mut super::SourceParser,
  ) -> ClassMemberDeclaration {
    parse_class_member_declaration_common(parser, false)
  }

  fn parse_class_member_declaration_common(
    parser: &mut super::SourceParser,
    allow_private: bool,
  ) -> ClassMemberDeclaration {
    let associated_comments = parser.collect_preceding_comments();
    let mut is_public = true;
    let mut is_method = true;
    let mut peeked = parser.peek();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::PRIVATE)) = peeked {
      if allow_private {
        is_public = false;
      } else {
        parser.report(peeked_loc, "Unexpected `private`".to_string());
      }
      parser.consume();
      peeked = parser.peek();
    }
    let start_loc = &peeked.0;
    if let Token(_, TokenContent::Keyword(Keyword::FUNCTION)) = &peeked {
      is_method = false;
      parser.consume();
    } else {
      parser.assert_and_consume_keyword(Keyword::METHOD);
    }
    if !is_method {
      parser.available_tparams = HashSet::new();
    }
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    parser
      .available_tparams
      .extend(type_parameters.iter().flat_map(|it| &it.parameters).map(|it| it.name.name));
    let name = parser.parse_lower_id();
    let fun_type_loc_start = parser.assert_and_consume_operator(TokenOp::LPAREN);
    let parameters = if let TokenContent::Operator(TokenOp::RPAREN) = parser.peek().1 {
      vec![]
    } else {
      parser.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut super::type_parser::parse_annotated_id,
      )
    };
    parser.assert_and_consume_operator(TokenOp::RPAREN);
    let return_type = super::type_parser::parse_annotation_with_colon(parser);
    let fun_type_loc = fun_type_loc_start.union(&return_type.location());
    ClassMemberDeclaration {
      loc: start_loc.union(&fun_type_loc),
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      is_public,
      is_method,
      name,
      type_parameters,
      type_: annotation::Function {
        location: fun_type_loc,
        associated_comments: NO_COMMENT_REFERENCE,
        parameters: annotation::FunctionParameters {
          location: fun_type_loc,
          ending_associated_comments: NO_COMMENT_REFERENCE,
          parameters: parameters.iter().map(|it| it.annotation.clone()).collect_vec(),
        },
        return_type: Box::new(return_type),
      },
      parameters: std::rc::Rc::new(parameters),
    }
  }
}

mod expression_parser {
  use super::{
    super::lexer::{Keyword, Token, TokenContent, TokenOp},
    MAX_STRUCT_SIZE,
  };
  use itertools::Itertools;
  use samlang_ast::{source::*, Location};
  use samlang_heap::PStr;
  use std::collections::HashMap;

  pub(super) fn parse_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    parse_match(parser)
  }

  fn parse_expression_with_ending_comments(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut expr = parse_expression(parser);
    let mut new_comments = parser.collect_preceding_comments();
    let common = expr.common_mut();
    let associated_comments = parser.comments_store.get_mut(common.associated_comments);
    match associated_comments {
      CommentsNode::NoComment => {
        common.associated_comments = parser.comments_store.create_comment_reference(new_comments);
      }
      CommentsNode::Comments(existing_loc, existing_comments) => {
        let new_loc = new_comments.iter().fold(*existing_loc, |l1, c| l1.union(&c.location));
        *existing_loc = new_loc;
        existing_comments.append(&mut new_comments);
      }
    }
    expr
  }

  fn parse_match(parser: &mut super::SourceParser) -> expr::E<()> {
    let associated_comments = parser.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::MATCH)) = parser.peek() {
      parser.consume();
      let match_expression = parse_expression_with_ending_comments(parser);
      parser.assert_and_consume_operator(TokenOp::LBRACE);
      let mut matching_list = vec![parse_pattern_to_expression(parser)];
      while matches!(
        parser.peek().1,
        TokenContent::Operator(TokenOp::LBRACE | TokenOp::LPAREN | TokenOp::UNDERSCORE)
          | TokenContent::LowerId(_)
          | TokenContent::UpperId(_)
      ) {
        matching_list.push(parse_pattern_to_expression(parser));
      }
      let loc = peeked_loc.union(&parser.assert_and_consume_operator(TokenOp::RBRACE));
      expr::E::Match(expr::Match {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        matched: Box::new(match_expression),
        cases: matching_list,
      })
    } else {
      parse_if_else(parser)
    }
  }

  fn parse_pattern_to_expression(
    parser: &mut super::SourceParser,
  ) -> expr::VariantPatternToExpression<()> {
    let pattern = super::pattern_parser::parse_matching_pattern(parser);
    parser.assert_and_consume_operator(TokenOp::ARROW);
    let expression = parse_expression(parser);
    let loc = if matches!(parser.peek().1, TokenContent::Operator(TokenOp::RBRACE)) {
      pattern.loc().union(&expression.loc())
    } else {
      pattern.loc().union(&parser.assert_and_consume_operator(TokenOp::COMMA))
    };
    expr::VariantPatternToExpression { loc, pattern, body: Box::new(expression) }
  }

  fn parse_if_else(parser: &mut super::SourceParser) -> expr::E<()> {
    let associated_comments = parser.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::IF)) = parser.peek() {
      parser.consume();
      let condition =
        if let Token(_peeked_let_loc, TokenContent::Keyword(Keyword::LET)) = parser.peek() {
          parser.consume();
          let pattern = super::pattern_parser::parse_matching_pattern(parser);
          parser.assert_and_consume_operator(TokenOp::ASSIGN);
          let expr = parse_expression(parser);
          expr::IfElseCondition::Guard(pattern, expr)
        } else {
          expr::IfElseCondition::Expression(parse_expression(parser))
        };
      parser.assert_and_consume_keyword(Keyword::THEN);
      let e1 = parse_expression(parser);
      parser.assert_and_consume_keyword(Keyword::ELSE);
      let e2 = parse_expression(parser);
      let loc = peeked_loc.union(&e2.loc());
      return expr::E::IfElse(expr::IfElse {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        condition: Box::new(condition),
        e1: Box::new(e1),
        e2: Box::new(e2),
      });
    }
    parse_disjunction(parser)
  }

  fn parse_disjunction(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_conjunction(parser);
    while let TokenContent::Operator(TokenOp::OR) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
      let e2 = parse_conjunction(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_conjunction(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_comparison(parser);
    while let TokenContent::Operator(TokenOp::AND) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
      let e2 = parse_comparison(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_comparison(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_term(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::LT) => expr::BinaryOperator::LT,
        TokenContent::Operator(TokenOp::LE) => expr::BinaryOperator::LE,
        TokenContent::Operator(TokenOp::GT) => expr::BinaryOperator::GT,
        TokenContent::Operator(TokenOp::GE) => expr::BinaryOperator::GE,
        TokenContent::Operator(TokenOp::EQ) => expr::BinaryOperator::EQ,
        TokenContent::Operator(TokenOp::NE) => expr::BinaryOperator::NE,
        _ => break,
      };
      parser.consume();
      let e2 = parse_term(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_term(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_factor(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::PLUS) => expr::BinaryOperator::PLUS,
        TokenContent::Operator(TokenOp::MINUS) => expr::BinaryOperator::MINUS,
        _ => break,
      };
      parser.consume();
      let e2 = parse_factor(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_factor(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_concat(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::MUL) => expr::BinaryOperator::MUL,
        TokenContent::Operator(TokenOp::DIV) => expr::BinaryOperator::DIV,
        TokenContent::Operator(TokenOp::MOD) => expr::BinaryOperator::MOD,
        _ => break,
      };
      parser.consume();
      let e2 = parse_concat(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_concat(parser: &mut super::SourceParser) -> expr::E<()> {
    let mut e = parse_unary_expression(parser);
    while let TokenContent::Operator(TokenOp::COLONCOLON) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
      let e2 = parse_unary_expression(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_unary_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    let associated_comments = parser.collect_preceding_comments();
    let Token(peeked_loc, content) = parser.peek();
    match content {
      TokenContent::Operator(TokenOp::NOT) => {
        parser.consume();
        let argument = parse_function_call_or_field_access(parser);
        let loc = peeked_loc.union(&argument.loc());
        expr::E::Unary(expr::Unary {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          operator: expr::UnaryOperator::NOT,
          argument: Box::new(argument),
        })
      }
      TokenContent::Operator(TokenOp::MINUS) => {
        parser.consume();
        let argument = parse_function_call_or_field_access(parser);
        let loc = peeked_loc.union(&argument.loc());
        expr::E::Unary(expr::Unary {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          operator: expr::UnaryOperator::NEG,
          argument: Box::new(argument),
        })
      }
      _ => parse_function_call_or_field_access(parser),
    }
  }

  fn parse_function_call_or_field_access(parser: &mut super::SourceParser) -> expr::E<()> {
    // Treat function arguments or field name as postfix.
    // Then use Kleene star trick to parse.
    let mut function_expression = parse_base_expression(parser);
    loop {
      match parser.peek() {
        Token(dot_loc, TokenContent::Operator(TokenOp::DOT)) => {
          let mut field_preceding_comments = parser.collect_preceding_comments();
          parser.consume();
          field_preceding_comments.append(&mut parser.collect_preceding_comments());
          let (field_loc, field_name) = match parser.peek() {
            Token(l, TokenContent::LowerId(id) | TokenContent::UpperId(id)) => {
              parser.consume();
              (l, id)
            }
            Token(l, t) => {
              parser
                .report(l, format!("Expected identifier, but get {}", t.pretty_print(parser.heap)));
              (Location { end: l.start, ..dot_loc }, PStr::MISSING)
            }
          };
          let mut loc = function_expression.loc().union(&field_loc);
          let explicit_type_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::LT)) = parser.peek() {
              field_preceding_comments.append(&mut parser.collect_preceding_comments());
              parser.assert_and_consume_operator(TokenOp::LT);
              let type_args = parser.parse_comma_separated_list_with_end_token(
                TokenOp::GT,
                &mut super::type_parser::parse_annotation,
              );
              loc = loc.union(&parser.assert_and_consume_operator(TokenOp::GT));
              type_args
            } else {
              vec![]
            };
          function_expression = expr::E::FieldAccess(expr::FieldAccess {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: parser.comments_store.create_comment_reference(vec![]),
              type_: (),
            },
            explicit_type_arguments,
            inferred_type_arguments: vec![],
            object: Box::new(function_expression),
            field_name: Id {
              loc: field_loc,
              associated_comments: parser
                .comments_store
                .create_comment_reference(field_preceding_comments),
              name: field_name,
            },
            field_order: -1,
          });
        }
        Token(_, TokenContent::Operator(TokenOp::LPAREN)) => {
          parser.consume();
          let function_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = parser.peek() {
              vec![]
            } else {
              parser.parse_comma_separated_list_with_end_token(
                TokenOp::RPAREN,
                &mut parse_expression_with_ending_comments,
              )
            };
          let loc =
            function_expression.loc().union(&parser.assert_and_consume_operator(TokenOp::RPAREN));
          function_expression = expr::E::Call(expr::Call {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: parser.comments_store.create_comment_reference(vec![]),
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

  fn parse_base_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    let associated_comments = parser.collect_preceding_comments();
    let peeked = parser.peek();

    match peeked {
      Token(peeked_loc, TokenContent::Keyword(Keyword::TRUE)) => {
        parser.consume();
        return expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Bool(true),
        );
      }
      Token(peeked_loc, TokenContent::Keyword(Keyword::FALSE)) => {
        parser.consume();
        return expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Bool(false),
        );
      }
      Token(peeked_loc, TokenContent::IntLiteral(i)) => {
        parser.consume();
        return expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Int(i.as_str(parser.heap).parse::<i32>().unwrap_or(0)),
        );
      }
      Token(peeked_loc, TokenContent::StringLiteral(s)) => {
        parser.consume();
        let chars = s.as_str(parser.heap).chars().collect_vec();
        let str_lit =
          super::utils::unescape_quotes(&chars[1..(chars.len() - 1)].iter().collect::<String>());
        return expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::String(parser.heap.alloc_string(str_lit)),
        );
      }
      Token(peeked_loc, TokenContent::Keyword(Keyword::THIS)) => {
        parser.consume();
        return expr::E::LocalId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Id {
            loc: peeked_loc,
            associated_comments: parser.comments_store.create_comment_reference(vec![]),
            name: PStr::THIS,
          },
        );
      }
      Token(peeked_loc, TokenContent::LowerId(name)) => {
        parser.consume();
        return expr::E::LocalId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Id {
            loc: peeked_loc,
            associated_comments: parser.comments_store.create_comment_reference(vec![]),
            name,
          },
        );
      }
      Token(peeked_loc, TokenContent::UpperId(name)) => {
        parser.consume();
        return expr::E::ClassId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          super::utils::resolve_class(parser, name),
          Id {
            loc: peeked_loc,
            associated_comments: parser.comments_store.create_comment_reference(vec![]),
            name,
          },
        );
      }
      _ => {}
    }

    // Lambda or tuple or nested expression
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LPAREN)) = peeked {
      parser.consume();
      // () -> ...
      if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = parser.peek() {
        let mut comments = associated_comments;
        parser.consume();
        comments.append(&mut parser.collect_preceding_comments());
        parser.assert_and_consume_operator(TokenOp::ARROW);
        let body = parse_expression(parser);
        let loc = peeked_loc.union(&body.loc());
        return expr::E::Lambda(expr::Lambda {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: parser.comments_store.create_comment_reference(comments),
            type_: (),
          },
          parameters: vec![],
          captured: HashMap::new(),
          body: Box::new(body),
        });
      }

      // (id ...
      if let Token(loc_id_for_lambda, TokenContent::LowerId(id_for_lambda)) = parser.peek() {
        parser.consume();
        let next = parser.peek();
        match next.1 {
          // (id: ... definitely a lambda
          TokenContent::Operator(TokenOp::COLON) => {
            parser.unconsume();
            let parameters = parser.parse_comma_separated_list_with_end_token(
              TokenOp::RPAREN,
              &mut super::type_parser::parse_optionally_annotated_id,
            );
            parser.assert_and_consume_operator(TokenOp::RPAREN);
            parser.assert_and_consume_operator(TokenOp::ARROW);
            let body = parse_expression(parser);
            let loc = peeked_loc.union(&body.loc());
            return expr::E::Lambda(expr::Lambda {
              common: expr::ExpressionCommon {
                loc,
                associated_comments: parser
                  .comments_store
                  .create_comment_reference(associated_comments),
                type_: (),
              },
              parameters,
              captured: HashMap::new(),
              body: Box::new(body),
            });
          }
          // (id, ..., might be lambda, might be tuple
          TokenContent::Operator(TokenOp::COMMA) => {
            parser.unconsume();
            // Advance as far as possible for a comma separated lower id.
            // This is common for both arrow function and tuple.
            let mut parameters_or_tuple_elements_cover = vec![parser.parse_lower_id()];
            while let Token(_, TokenContent::Operator(TokenOp::COMMA)) = parser.peek() {
              parser.consume();
              if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
                parser.consume();
                match parser.peek() {
                  Token(_, TokenContent::Operator(TokenOp::COMMA))
                  | Token(_, TokenContent::Operator(TokenOp::RPAREN)) => {
                    parser.unconsume(); // unconsume lower id
                    parameters_or_tuple_elements_cover.push(parser.parse_lower_id());
                  }
                  _ => {
                    parser.unconsume(); // unconsume lower id
                    break;
                  }
                }
              } else {
                break;
              }
            }
            // If we see ), it means that the cover is complete and still ambiguous.
            if let Token(right_parenthesis_loc, TokenContent::Operator(TokenOp::RPAREN)) =
              parser.peek()
            {
              parser.consume();
              if let Token(_, TokenContent::Operator(TokenOp::ARROW)) = parser.peek() {
                parser.consume();
                let body = parse_expression(parser);
                let loc = peeked_loc.union(&body.loc());
                return expr::E::Lambda(expr::Lambda {
                  common: expr::ExpressionCommon {
                    loc,
                    associated_comments: parser
                      .comments_store
                      .create_comment_reference(associated_comments),
                    type_: (),
                  },
                  parameters: parameters_or_tuple_elements_cover
                    .into_iter()
                    .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                    .collect(),
                  captured: HashMap::new(),
                  body: Box::new(body),
                });
              } else {
                let tuple_elements = parameters_or_tuple_elements_cover
                  .into_iter()
                  .map(|name| {
                    expr::E::LocalId(
                      expr::ExpressionCommon {
                        loc: name.loc,
                        associated_comments: NO_COMMENT_REFERENCE,
                        type_: (),
                      },
                      name,
                    )
                  })
                  .collect_vec();
                let loc = peeked_loc.union(&right_parenthesis_loc);
                return expr::E::Tuple(
                  expr::ExpressionCommon {
                    loc,
                    associated_comments: parser
                      .comments_store
                      .create_comment_reference(associated_comments),
                    type_: (),
                  },
                  tuple_elements,
                );
              }
            }
            if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
              parser.consume();
              if let Token(_, TokenContent::Operator(TokenOp::COLON)) = parser.peek() {
                parser.unconsume();
                let rest_parameters = parser.parse_comma_separated_list_with_end_token(
                  TokenOp::RPAREN,
                  &mut super::type_parser::parse_optionally_annotated_id,
                );
                let parameters = parameters_or_tuple_elements_cover
                  .into_iter()
                  .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                  .chain(rest_parameters)
                  .collect_vec();
                parser.assert_and_consume_operator(TokenOp::RPAREN);
                parser.assert_and_consume_operator(TokenOp::ARROW);
                let body = parse_expression(parser);
                let loc = peeked_loc.union(&body.loc());
                return expr::E::Lambda(expr::Lambda {
                  common: expr::ExpressionCommon {
                    loc,
                    associated_comments: parser
                      .comments_store
                      .create_comment_reference(associated_comments),
                    type_: (),
                  },
                  parameters,
                  captured: HashMap::new(),
                  body: Box::new(body),
                });
              }
              parser.unconsume();
            }
            let rest_tuple_elements = parser
              .parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut parse_expression);
            let mut tuple_elements = parameters_or_tuple_elements_cover
              .into_iter()
              .map(|name| {
                expr::E::LocalId(
                  expr::ExpressionCommon {
                    loc: name.loc,
                    associated_comments: NO_COMMENT_REFERENCE,
                    type_: (),
                  },
                  name,
                )
              })
              .chain(rest_tuple_elements)
              .collect_vec();
            if let Some(node) = tuple_elements.get(MAX_STRUCT_SIZE) {
              parser.error_set.report_invalid_syntax_error(
                node.loc(),
                format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
              );
            }
            tuple_elements.truncate(MAX_STRUCT_SIZE);
            let end_loc = parser.assert_and_consume_operator(TokenOp::RPAREN);
            let loc = peeked_loc.union(&end_loc);
            let common = expr::ExpressionCommon {
              loc,
              associated_comments: parser
                .comments_store
                .create_comment_reference(associated_comments),
              type_: (),
            };
            debug_assert!(tuple_elements.len() > 1);
            return expr::E::Tuple(common, tuple_elements);
          }
          // (id) -> ... OR (id)
          TokenContent::Operator(TokenOp::RPAREN) => {
            parser.consume();
            if let Token(_, TokenContent::Operator(TokenOp::ARROW)) = parser.peek() {
              let mut comments = associated_comments;
              comments.append(&mut parser.collect_preceding_comments());
              parser.consume();
              let body = parse_expression(parser);
              let loc = peeked_loc.union(&body.loc());
              return expr::E::Lambda(expr::Lambda {
                common: expr::ExpressionCommon {
                  loc,
                  associated_comments: parser.comments_store.create_comment_reference(comments),
                  type_: (),
                },
                parameters: vec![OptionallyAnnotatedId {
                  name: Id {
                    loc: loc_id_for_lambda,
                    associated_comments: parser.comments_store.create_comment_reference(vec![]),
                    name: id_for_lambda,
                  },
                  type_: (),
                  annotation: None,
                }],
                captured: HashMap::new(),
                body: Box::new(body),
              });
            } else {
              // (id)
              parser.unconsume();
            }
          }
          _ => {}
        }
        parser.unconsume();
      }
      let mut expressions =
        parser.parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut parse_expression);
      if let Some(node) = expressions.get(MAX_STRUCT_SIZE) {
        parser.error_set.report_invalid_syntax_error(
          node.loc(),
          format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
        );
      }
      expressions.truncate(MAX_STRUCT_SIZE);
      let end_loc = parser.assert_and_consume_operator(TokenOp::RPAREN);
      let loc = peeked_loc.union(&end_loc);
      let common = expr::ExpressionCommon {
        loc,
        associated_comments: parser.comments_store.create_comment_reference(associated_comments),
        type_: (),
      };
      debug_assert!(!expressions.is_empty());
      if expressions.len() == 1 {
        return expressions.pop().unwrap();
      }
      return expr::E::Tuple(common, expressions);
    }

    // Statement Block: { ... }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LBRACE)) = peeked {
      parser.consume();

      let mut statements = vec![];
      while let Token(_, TokenContent::Keyword(Keyword::LET)) = parser.peek() {
        statements.push(parse_statement(parser));
      }

      // No final expression
      if let Token(end_loc, TokenContent::Operator(TokenOp::RBRACE)) = parser.peek() {
        parser.consume();
        let loc = peeked_loc.union(&end_loc);
        return expr::E::Block(expr::Block {
          common: expr::ExpressionCommon {
            loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          statements,
          expression: None,
        });
      }

      // Has final expression
      let expression = parse_expression_with_ending_comments(parser);
      let loc = peeked_loc.union(&parser.assert_and_consume_operator(TokenOp::RBRACE));
      return expr::E::Block(expr::Block {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        statements,
        expression: Some(Box::new(expression)),
      });
    }

    // Error case
    parser.report(
      peeked.0,
      format!("Expected: expression, actual: {}", peeked.1.pretty_print(parser.heap)),
    );
    expr::E::Literal(
      expr::ExpressionCommon {
        loc: peeked.0,
        associated_comments: parser.comments_store.create_comment_reference(associated_comments),
        type_: (),
      },
      Literal::Int(0),
    )
  }

  pub(super) fn parse_statement(
    parser: &mut super::SourceParser,
  ) -> expr::DeclarationStatement<()> {
    let mut concrete_comments = parser.collect_preceding_comments();
    let start_loc = parser.assert_and_consume_keyword(Keyword::LET);
    let pattern = super::pattern_parser::parse_matching_pattern(parser);
    let annotation = if let Token(_, TokenContent::Operator(TokenOp::COLON)) = parser.peek() {
      Some(super::type_parser::parse_annotation_with_colon(parser))
    } else {
      None
    };
    concrete_comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_operator(TokenOp::ASSIGN);
    let assigned_expression = Box::new(parse_expression(parser));
    concrete_comments.append(&mut parser.collect_preceding_comments());
    let loc = start_loc.union(&parser.assert_and_consume_operator(TokenOp::SEMICOLON));
    let associated_comments = parser.comments_store.create_comment_reference(concrete_comments);
    expr::DeclarationStatement {
      loc,
      associated_comments,
      pattern,
      annotation,
      assigned_expression,
    }
  }
}

mod pattern_parser {
  use super::super::lexer::{Keyword, Token, TokenContent, TokenOp};
  use samlang_ast::source::*;

  pub(super) fn parse_matching_pattern_with_unit(
    parser: &mut super::SourceParser,
  ) -> (pattern::MatchingPattern<()>, ()) {
    (parse_matching_pattern(parser), ())
  }

  pub(super) fn parse_matching_pattern(
    parser: &mut super::SourceParser,
  ) -> pattern::MatchingPattern<()> {
    let peeked = parser.peek();
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LPAREN)) = peeked {
      parser.consume();
      let destructured_names = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut |s: &mut super::SourceParser| pattern::TuplePatternElement {
          pattern: Box::new(parse_matching_pattern(s)),
          type_: (),
        },
      );
      let end_location = parser.assert_and_consume_operator(TokenOp::RPAREN);
      return pattern::MatchingPattern::Tuple(peeked_loc.union(&end_location), destructured_names);
    }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LBRACE)) = peeked {
      parser.consume();
      let destructured_names = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RBRACE,
        &mut |s: &mut super::SourceParser| {
          let field_name = s.parse_lower_id();
          let (pattern, loc, shorthand) =
            if let Token(_, TokenContent::Keyword(Keyword::AS)) = s.peek() {
              s.consume();
              let nested = Box::new(parse_matching_pattern(s));
              let loc = field_name.loc.union(nested.loc());
              (nested, loc, false)
            } else {
              (Box::new(pattern::MatchingPattern::Id(field_name, ())), field_name.loc, true)
            };
          pattern::ObjectPatternElement {
            loc,
            field_name,
            field_order: 0,
            pattern,
            shorthand,
            type_: (),
          }
        },
      );
      let end_location = parser.assert_and_consume_operator(TokenOp::RBRACE);
      return pattern::MatchingPattern::Object(peeked_loc.union(&end_location), destructured_names);
    }
    if let Token(peeked_loc, TokenContent::UpperId(id)) = peeked {
      parser.consume();
      let tag = Id { loc: peeked_loc, associated_comments: NO_COMMENT_REFERENCE, name: id };
      let (data_variables, loc) =
        if let Token(_, TokenContent::Operator(TokenOp::LPAREN)) = parser.peek() {
          parser.consume();
          let data_variables = parser.parse_comma_separated_list_with_end_token(
            TokenOp::RPAREN,
            &mut parse_matching_pattern_with_unit,
          );
          let end_loc = parser.assert_and_consume_operator(TokenOp::RPAREN);
          (data_variables, peeked_loc.union(&end_loc))
        } else {
          (Vec::with_capacity(0), peeked_loc)
        };
      return pattern::MatchingPattern::Variant(pattern::VariantPattern {
        loc,
        tag_order: 0,
        tag,
        data_variables,
        type_: (),
      });
    }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::UNDERSCORE)) = peeked {
      parser.consume();
      return pattern::MatchingPattern::Wildcard(peeked_loc);
    }
    pattern::MatchingPattern::Id(
      Id {
        loc: peeked.0,
        associated_comments: NO_COMMENT_REFERENCE,
        name: parser.assert_and_peek_lower_id().1,
      },
      (),
    )
  }
}

mod type_parser {
  use super::super::lexer::{Keyword, Token, TokenContent, TokenOp};
  use samlang_ast::source::*;

  pub(super) fn parse_type_parameters(
    parser: &mut super::SourceParser,
  ) -> Option<annotation::TypeParameters> {
    if let Token(start_loc, TokenContent::Operator(TokenOp::LT)) = parser.peek() {
      let start_comments = parser.collect_preceding_comments();
      parser.consume();
      let mut parameters = parser.parse_comma_separated_list_with_end_token(
        TokenOp::GT,
        &mut super::type_parser::parse_type_parameter,
      );
      let end_comments = parser.collect_preceding_comments();
      let location = start_loc.union(&parser.assert_and_consume_operator(TokenOp::GT));
      parser.available_tparams.extend(parameters.iter().map(|it| it.name.name));
      fix_tparams_with_generic_annot(parser, &mut parameters);
      Some(annotation::TypeParameters {
        location,
        start_associated_comments: parser.comments_store.create_comment_reference(start_comments),
        ending_associated_comments: parser.comments_store.create_comment_reference(end_comments),
        parameters,
      })
    } else {
      None
    }
  }

  pub(super) fn parse_type_parameter(
    parser: &mut super::SourceParser,
  ) -> annotation::TypeParameter {
    let name = &parser.parse_upper_id();
    let (bound, loc) = if let Token(_, TokenContent::Operator(TokenOp::COLON)) = parser.peek() {
      let id_comments = parser.collect_preceding_comments();
      parser.consume();
      let id = parser.parse_upper_id_with_comments(id_comments);
      let bound = super::type_parser::parse_identifier_annot(parser, id);
      let loc = name.loc.union(&bound.location);
      (Some(bound), loc)
    } else {
      (None, name.loc)
    };
    annotation::TypeParameter { loc, name: *name, bound }
  }

  pub(super) fn parse_annotated_id(parser: &mut super::SourceParser) -> AnnotatedId<()> {
    let name = parser.parse_lower_id();
    let annotation = parse_annotation_with_colon(parser);
    AnnotatedId { name, type_: (), annotation }
  }

  pub(super) fn parse_optionally_annotated_id(
    parser: &mut super::SourceParser,
  ) -> OptionallyAnnotatedId<()> {
    let name = parser.parse_lower_id();
    let annotation = parse_optional_annotation(parser);
    OptionallyAnnotatedId { name, type_: (), annotation }
  }

  fn parse_optional_annotation(parser: &mut super::SourceParser) -> Option<annotation::T> {
    if let Token(_, TokenContent::Operator(TokenOp::COLON)) = parser.peek() {
      Some(parse_annotation_with_colon(parser))
    } else {
      None
    }
  }

  pub(super) fn parse_annotation(parser: &mut super::SourceParser) -> annotation::T {
    parse_annotation_with_additional_comments(parser, vec![])
  }

  pub(super) fn parse_annotation_with_colon(parser: &mut super::SourceParser) -> annotation::T {
    let annotation_comments = parser.collect_preceding_comments();
    parser.assert_and_consume_operator(TokenOp::COLON);
    parse_annotation_with_additional_comments(parser, annotation_comments)
  }

  pub(super) fn parse_annotation_with_additional_comments(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> annotation::T {
    associated_comments.append(&mut parser.collect_preceding_comments());
    let peeked = parser.peek();
    match peeked.1 {
      TokenContent::Keyword(Keyword::UNIT) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Unit,
        )
      }
      TokenContent::Keyword(Keyword::BOOL) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Bool,
        )
      }
      TokenContent::Keyword(Keyword::INT) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Int,
        )
      }
      TokenContent::UpperId(name) => {
        parser.consume();
        let associated_comments = parser.comments_store.create_comment_reference(vec![]);
        let id_annot =
          parse_identifier_annot(parser, Id { loc: peeked.0, associated_comments, name });
        if id_annot.type_arguments.is_none() && parser.available_tparams.contains(&id_annot.id.name)
        {
          annotation::T::Generic(id_annot.location, id_annot.id)
        } else {
          annotation::T::Id(id_annot)
        }
      }
      TokenContent::Operator(TokenOp::LPAREN) => {
        parser.consume();
        let parameters = if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = parser.peek() {
          let mut comments = parser.collect_preceding_comments();
          let location = peeked.0.union(&parser.assert_and_consume_operator(TokenOp::RPAREN));
          comments.append(&mut parser.collect_preceding_comments());
          parser.assert_and_consume_operator(TokenOp::ARROW);
          annotation::FunctionParameters {
            location,
            ending_associated_comments: parser.comments_store.create_comment_reference(comments),
            parameters: Vec::with_capacity(0),
          }
        } else {
          let parameters = parser
            .parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut parse_annotation);
          let mut comments = parser.collect_preceding_comments();
          let location = peeked.0.union(&parser.assert_and_consume_operator(TokenOp::RPAREN));
          comments.append(&mut parser.collect_preceding_comments());
          parser.assert_and_consume_operator(TokenOp::ARROW);
          annotation::FunctionParameters {
            location,
            ending_associated_comments: parser.comments_store.create_comment_reference(comments),
            parameters,
          }
        };
        let return_type = parse_annotation(parser);
        let location = peeked.0.union(&return_type.location());
        annotation::T::Fn(annotation::Function {
          location,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          parameters,
          return_type: Box::new(return_type),
        })
      }
      content => {
        parser.report(
          peeked.0,
          format!("Expecting: type, actual: {}", content.pretty_print(parser.heap)),
        );
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Any,
        )
      }
    }
  }

  pub(super) fn fix_tparams_with_generic_annot(
    parser: &mut super::SourceParser,
    tparams: &mut [annotation::TypeParameter],
  ) {
    for tparam in tparams {
      if let Some(bound) = &mut tparam.bound {
        if let Some(targs) = &mut bound.type_arguments {
          for annot in &mut targs.arguments {
            fix_annot_with_generic_annot(parser, annot);
          }
        }
      }
    }
  }

  pub(super) fn fix_annot_with_generic_annot(
    parser: &mut super::SourceParser,
    annot: &mut annotation::T,
  ) {
    match annot {
      annotation::T::Primitive(_, _, _) | annotation::T::Generic(_, _) => {}
      annotation::T::Id(id_annot) => {
        if id_annot.type_arguments.is_none() && parser.available_tparams.contains(&id_annot.id.name)
        {
          *annot = annotation::T::Generic(id_annot.location, id_annot.id)
        }
      }
      annotation::T::Fn(t) => {
        for annot in &mut t.parameters.parameters {
          fix_annot_with_generic_annot(parser, annot);
        }
        fix_annot_with_generic_annot(parser, &mut t.return_type);
      }
    }
  }

  pub(super) fn parse_identifier_annot(
    parser: &mut super::SourceParser,
    identifier: Id,
  ) -> annotation::Id {
    let type_arguments =
      if let Token(start_loc, TokenContent::Operator(TokenOp::LT)) = parser.peek() {
        let start_associated_comments = {
          let comments = parser.collect_preceding_comments();
          parser.comments_store.create_comment_reference(comments)
        };
        parser.consume();
        let arguments =
          parser.parse_comma_separated_list_with_end_token(TokenOp::GT, &mut parse_annotation);
        let ending_associated_comments = {
          let comments = parser.collect_preceding_comments();
          parser.comments_store.create_comment_reference(comments)
        };
        let location = start_loc.union(&parser.assert_and_consume_operator(TokenOp::GT));
        Some(annotation::TypeArguments {
          location,
          start_associated_comments,
          ending_associated_comments,
          arguments,
        })
      } else {
        None
      };
    let location = if let Some(node) = &type_arguments {
      identifier.loc.union(&node.location)
    } else {
      identifier.loc
    };
    annotation::Id {
      location,
      module_reference: super::utils::resolve_class(parser, identifier.name),
      id: identifier,
      type_arguments,
    }
  }
}

mod utils {
  pub(super) fn resolve_class(
    parser: &super::SourceParser,
    class_name: samlang_heap::PStr,
  ) -> samlang_heap::ModuleReference {
    if parser.builtin_classes.contains(&class_name) {
      samlang_heap::ModuleReference::ROOT
    } else {
      *parser.class_source_map.get(&class_name).unwrap_or(&parser.module_reference)
    }
  }

  pub(super) fn unescape_quotes(source: &str) -> String {
    source.replace("\\\"", "\"")
  }
}

#[cfg(test)]
mod tests {
  use super::super::lexer::{Token, TokenContent};
  use super::SourceParser;
  use samlang_ast::Location;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference};
  use std::collections::HashSet;

  #[test]
  fn base_tests_1() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let mut parser =
      SourceParser::new(vec![], &mut heap, &mut error_set, ModuleReference::DUMMY, HashSet::new());

    parser.assert_and_consume_identifier();
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
      ModuleReference::DUMMY,
      HashSet::new(),
    );

    parser.simple_peek();
    parser.consume();
    parser.position = 100;
    parser.simple_peek();
    parser.consume();
    parser.simple_peek();
    parser.position = 2;
    parser.simple_peek();
    parser.consume();
    parser.consume();
  }

  fn with_tokens_robustness_tests(heap: &mut Heap, tokens: Vec<Token>) {
    let mut error_set = ErrorSet::new();
    let mut parser =
      SourceParser::new(tokens, heap, &mut error_set, ModuleReference::DUMMY, HashSet::new());

    super::pattern_parser::parse_matching_pattern(&mut parser);
    super::expression_parser::parse_expression(&mut parser);
    super::expression_parser::parse_statement(&mut parser);
    super::type_parser::parse_annotation(&mut parser);
    super::toplevel_parser::parse_interface(&mut parser);
    super::toplevel_parser::parse_class(&mut parser);
    super::toplevel_parser::parse_class_member_definition(&mut parser);
    super::toplevel_parser::parse_class_member_declaration(&mut parser);
    super::parse_module(parser);
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
