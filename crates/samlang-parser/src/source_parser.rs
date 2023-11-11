use super::lexer::{Keyword, Token, TokenContent, TokenOp};
use itertools::Itertools;
use samlang_ast::{
  source::{expr::IfElseCondition, *},
  Location, Position,
};
use samlang_errors::ErrorSet;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::{
  cmp,
  collections::{HashMap, HashSet},
  rc::Rc,
  vec,
};

const MAX_STRUCT_SIZE: usize = 16;
const MAX_VARIANT_SIZE: usize = 15;

fn unescape_quotes(source: &str) -> String {
  source.replace("\\\"", "\"")
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
  available_tparams: HashSet<PStr>,
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
      available_tparams: HashSet::new(),
    }
  }

  pub(super) fn parse_module(mut self) -> Module<()> {
    let mut imports = vec![];
    while let Token(import_start, TokenContent::Keyword(Keyword::IMPORT)) = self.peek() {
      self.consume();
      self.assert_and_consume_operator(TokenOp::LBRACE);
      let imported_members = self.parse_comma_separated_list_with_end_token(
        TokenOp::RBRACE,
        &mut SourceParser::parse_upper_id,
      );
      self.assert_and_consume_operator(TokenOp::RBRACE);
      self.assert_and_consume_keyword(Keyword::FROM);
      let import_loc_start = self.peek().0;
      let imported_module_parts = {
        let mut collector = vec![self.assert_and_consume_identifier().1];
        while let Token(_, TokenContent::Operator(TokenOp::DOT)) = self.peek() {
          self.consume();
          collector.push(self.assert_and_consume_identifier().1);
        }
        collector
      };
      let imported_module = self.heap.alloc_module_reference(imported_module_parts);
      let imported_module_loc = import_loc_start.union(&self.last_location());
      for variable in imported_members.iter() {
        self.class_source_map.insert(variable.name, imported_module);
      }
      let loc =
        if let Token(semicolon_loc, TokenContent::Operator(TokenOp::SEMICOLON)) = self.peek() {
          self.consume();
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
      if let TokenContent::EOF = self.peek().1 {
        break;
      }
      loop {
        match self.peek() {
          Token(
            _,
            TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE),
          ) => break,
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
    let comments = self.collect_preceding_comments();
    let trailing_comments = self.comments_store.create_comment_reference(comments);

    Module { comment_store: self.comments_store, imports, toplevels, trailing_comments }
  }

  fn parse_toplevel(&mut self) -> Toplevel<()> {
    self.unconsume_comments();
    let is_private = if let TokenContent::Keyword(Keyword::PRIVATE) = self.peek().1 {
      self.consume();
      true
    } else {
      false
    };
    let is_class = matches!(self.peek().1, TokenContent::Keyword(Keyword::CLASS));
    if is_private {
      self.unconsume();
    }
    if is_class {
      Toplevel::Class(self.parse_class())
    } else {
      Toplevel::Interface(self.parse_interface())
    }
  }

  pub(super) fn parse_class(&mut self) -> ClassDefinition<()> {
    let associated_comments = self.collect_preceding_comments();
    let (mut loc, private) =
      if let Token(loc, TokenContent::Keyword(Keyword::PRIVATE)) = self.peek() {
        self.consume();
        self.assert_and_consume_keyword(Keyword::CLASS);
        (loc, true)
      } else {
        (self.assert_and_consume_keyword(Keyword::CLASS), false)
      };
    let name = self.parse_upper_id();
    loc = loc.union(&name.loc);
    let (type_param_loc_start, type_param_loc_end, mut type_parameters) =
      if let Token(loc_start, TokenContent::Operator(TokenOp::LT)) = self.peek() {
        self.consume();
        let type_params = self.parse_comma_separated_list_with_end_token(
          TokenOp::GT,
          &mut SourceParser::parse_type_parameter,
        );
        let loc_end = self.assert_and_consume_operator(TokenOp::GT);
        (Some(loc_start), Some(loc_end), type_params)
      } else {
        (None, None, vec![])
      };
    self.available_tparams = type_parameters.iter().map(|it| it.name.name).collect();
    self.fix_tparams_with_generic_annot(&mut type_parameters);
    let (type_definition, extends_or_implements_nodes) = match self.peek().1 {
      TokenContent::Operator(TokenOp::LBRACE | TokenOp::COLON)
      | TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE) => {
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
        let saved_upper_type_parameters = self.available_tparams.clone();
        members.push(self.parse_class_member_definition());
        self.available_tparams = saved_upper_type_parameters;
      }
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition,
      members,
    }
  }

  pub(super) fn parse_interface(&mut self) -> InterfaceDeclaration {
    let associated_comments = self.collect_preceding_comments();
    let (mut loc, private) =
      if let Token(loc, TokenContent::Keyword(Keyword::PRIVATE)) = self.peek() {
        self.consume();
        self.assert_and_consume_keyword(Keyword::INTERFACE);
        (loc, true)
      } else {
        (self.assert_and_consume_keyword(Keyword::INTERFACE), false)
      };
    let name = self.parse_upper_id();
    let mut type_parameters = if let TokenContent::Operator(TokenOp::LT) = self.peek().1 {
      self.consume();
      let type_params = self.parse_comma_separated_list_with_end_token(
        TokenOp::GT,
        &mut SourceParser::parse_type_parameter,
      );
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::GT));
      type_params
    } else {
      vec![]
    };
    self.available_tparams = type_parameters.iter().map(|it| it.name.name).collect();
    self.fix_tparams_with_generic_annot(&mut type_parameters);
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
        let saved_upper_type_parameters = self.available_tparams.clone();
        members.push(self.parse_class_member_declaration());
        self.available_tparams = saved_upper_type_parameters;
      }
      loc = loc.union(&self.assert_and_consume_operator(TokenOp::RBRACE));
    }
    InterfaceDeclarationCommon {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition: (),
      members,
    }
  }

  fn parse_extends_or_implements_nodes(&mut self) -> Vec<annotation::Id> {
    let id = self.parse_upper_id();
    let mut collector = vec![self.parse_identifier_annot(id)];
    while let Token(_, TokenContent::Operator(TokenOp::COMMA)) = self.peek() {
      self.consume();
      let id = self.parse_upper_id();
      collector.push(self.parse_identifier_annot(id));
    }
    collector
  }

  fn parse_type_definition_inner(&mut self) -> TypeDefinition {
    if let Token(_, TokenContent::UpperId(_)) = self.peek() {
      let mut variants = self.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut SourceParser::parse_variant_definition,
      );
      variants.truncate(MAX_VARIANT_SIZE);
      // Location is later patched by the caller
      TypeDefinition::Enum { loc: Location::dummy(), variants }
    } else {
      let mut fields = self.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut Self::parse_field_definition,
      );
      if let Some(node) = fields.get(MAX_STRUCT_SIZE) {
        self.error_set.report_invalid_syntax_error(
          node.name.loc,
          format!("Maximum allowed field size is {MAX_STRUCT_SIZE}"),
        );
      }
      fields.truncate(MAX_STRUCT_SIZE);
      // Location is later patched by the caller
      TypeDefinition::Struct { loc: Location::dummy(), fields }
    }
  }

  fn parse_field_definition(&mut self) -> FieldDefinition {
    let mut is_public = true;
    if let TokenContent::Keyword(Keyword::PRIVATE) = self.peek().1 {
      is_public = false;
      self.consume();
    }
    self.assert_and_consume_keyword(Keyword::VAL);
    let name = self.parse_lower_id();
    self.assert_and_consume_operator(TokenOp::COLON);
    let annotation = self.parse_annotation();
    FieldDefinition { name, annotation, is_public }
  }

  fn parse_variant_definition(&mut self) -> VariantDefinition {
    let name = self.parse_upper_id();
    if let Token(_, TokenContent::Operator(TokenOp::LPAREN)) = self.peek() {
      self.consume();
      let associated_data_types = self.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut SourceParser::parse_annotation,
      );

      if let Some(node) = associated_data_types.get(MAX_VARIANT_SIZE) {
        self.error_set.report_invalid_syntax_error(
          node.location(),
          format!("Maximum allowed field size is {MAX_VARIANT_SIZE}"),
        );
      }
      self.assert_and_consume_operator(TokenOp::RPAREN);
      VariantDefinition { name, associated_data_types }
    } else {
      VariantDefinition { name, associated_data_types: vec![] }
    }
  }

  fn peeked_class_or_interface_start(&mut self) -> bool {
    matches!(
      self.peek().1,
      TokenContent::Keyword(Keyword::CLASS | Keyword::INTERFACE | Keyword::PRIVATE)
    )
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
    if !is_method {
      self.available_tparams = HashSet::new();
    }
    let mut type_parameters = if let TokenContent::Operator(TokenOp::LT) = self.peek().1 {
      self.consume();
      let type_params = self.parse_comma_separated_list_with_end_token(
        TokenOp::GT,
        &mut SourceParser::parse_type_parameter,
      );
      self.assert_and_consume_operator(TokenOp::GT);
      type_params
    } else {
      vec![]
    };
    self.available_tparams.extend(type_parameters.iter().map(|it| it.name.name));
    self.fix_tparams_with_generic_annot(&mut type_parameters);
    let name = self.parse_lower_id();
    let fun_type_loc_start = self.assert_and_consume_operator(TokenOp::LPAREN);
    let parameters = if let TokenContent::Operator(TokenOp::RPAREN) = self.peek().1 {
      vec![]
    } else {
      self.parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut Self::parse_annotated_id)
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
    let mut expr = self.parse_expression();
    let mut new_comments = self.collect_preceding_comments();
    let common = expr.common_mut();
    let associated_comments = self.comments_store.get_mut(common.associated_comments);
    match associated_comments {
      CommentsNode::NoComment => {
        common.associated_comments = self.comments_store.create_comment_reference(new_comments);
      }
      CommentsNode::Comments(existing_loc, existing_comments) => {
        let new_loc = new_comments.iter().fold(*existing_loc, |l1, c| l1.union(&c.location));
        *existing_loc = new_loc;
        existing_comments.append(&mut new_comments);
      }
    }
    expr
  }

  fn parse_match(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::MATCH)) = self.peek() {
      self.consume();
      let match_expression = self.parse_expression_with_ending_comments();
      self.assert_and_consume_operator(TokenOp::LBRACE);
      let mut matching_list = vec![self.parse_pattern_to_expression()];
      while matches!(
        self.peek().1,
        TokenContent::Operator(TokenOp::LBRACE | TokenOp::LPAREN | TokenOp::UNDERSCORE)
          | TokenContent::LowerId(_)
          | TokenContent::UpperId(_)
      ) {
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
    let pattern = self.parse_matching_pattern();
    self.assert_and_consume_operator(TokenOp::ARROW);
    let expression = self.parse_expression();
    let loc = if matches!(self.peek().1, TokenContent::Operator(TokenOp::RBRACE)) {
      pattern.loc().union(&expression.loc())
    } else {
      pattern.loc().union(&self.assert_and_consume_operator(TokenOp::COMMA))
    };
    expr::VariantPatternToExpression { loc, pattern, body: Box::new(expression) }
  }

  fn parse_if_else(&mut self) -> expr::E<()> {
    let associated_comments = self.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::IF)) = self.peek() {
      self.consume();
      let condition =
        if let Token(_peeked_let_loc, TokenContent::Keyword(Keyword::LET)) = self.peek() {
          self.consume();
          let pattern = self.parse_matching_pattern();
          self.assert_and_consume_operator(TokenOp::ASSIGN);
          let expr = self.parse_expression();
          IfElseCondition::Guard(pattern, expr)
        } else {
          IfElseCondition::Expression(self.parse_expression())
        };
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
      match self.peek() {
        Token(dot_loc, TokenContent::Operator(TokenOp::DOT)) => {
          let mut field_preceding_comments = self.collect_preceding_comments();
          self.consume();
          field_preceding_comments.append(&mut self.collect_preceding_comments());
          let (field_loc, field_name) = match self.peek() {
            Token(l, TokenContent::LowerId(id) | TokenContent::UpperId(id)) => {
              self.consume();
              (l, id)
            }
            Token(l, t) => {
              self.report(l, format!("Expected identifier, but get {}", t.pretty_print(self.heap)));
              (Location { end: l.start, ..dot_loc }, PStr::MISSING)
            }
          };
          let mut loc = function_expression.loc().union(&field_loc);
          let explicit_type_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::LT)) = self.peek() {
              field_preceding_comments.append(&mut self.collect_preceding_comments());
              self.assert_and_consume_operator(TokenOp::LT);
              let type_args = self.parse_comma_separated_list_with_end_token(
                TokenOp::GT,
                &mut SourceParser::parse_annotation,
              );
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
        Token(_, TokenContent::Operator(TokenOp::LPAREN)) => {
          self.consume();
          let function_arguments =
            if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = self.peek() {
              vec![]
            } else {
              self.parse_comma_separated_list_with_end_token(
                TokenOp::RPAREN,
                &mut SourceParser::parse_expression_with_ending_comments,
              )
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

    match peeked {
      Token(peeked_loc, TokenContent::Keyword(Keyword::TRUE)) => {
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
      Token(peeked_loc, TokenContent::Keyword(Keyword::FALSE)) => {
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
      Token(peeked_loc, TokenContent::IntLiteral(i)) => {
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
      Token(peeked_loc, TokenContent::StringLiteral(s)) => {
        self.consume();
        let chars = s.as_str(self.heap).chars().collect_vec();
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
      Token(peeked_loc, TokenContent::Keyword(Keyword::THIS)) => {
        self.consume();
        return expr::E::LocalId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          Id {
            loc: peeked_loc,
            associated_comments: self.comments_store.create_comment_reference(vec![]),
            name: PStr::THIS,
          },
        );
      }
      Token(peeked_loc, TokenContent::LowerId(name)) => {
        self.consume();
        return expr::E::LocalId(
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
      Token(peeked_loc, TokenContent::UpperId(name)) => {
        self.consume();
        return expr::E::ClassId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: self.comments_store.create_comment_reference(associated_comments),
            type_: (),
          },
          self.resolve_class(name),
          Id {
            loc: peeked_loc,
            associated_comments: self.comments_store.create_comment_reference(vec![]),
            name,
          },
        );
      }
      _ => {}
    }

    // Lambda or tuple or nested expression
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

      // (id ...
      if let Token(loc_id_for_lambda, TokenContent::LowerId(id_for_lambda)) = self.peek() {
        self.consume();
        let next = self.peek();
        match next.1 {
          // (id: ... definitely a lambda
          TokenContent::Operator(TokenOp::COLON) => {
            self.unconsume();
            let parameters = self.parse_comma_separated_list_with_end_token(
              TokenOp::RPAREN,
              &mut Self::parse_optionally_annotated_id,
            );
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
          // (id, ..., might be lambda, might be tuple
          TokenContent::Operator(TokenOp::COMMA) => {
            self.unconsume();
            // Advance as far as possible for a comma separated lower id.
            // This is common for both arrow function and tuple.
            let mut parameters_or_tuple_elements_cover = vec![self.parse_lower_id()];
            while let Token(_, TokenContent::Operator(TokenOp::COMMA)) = self.peek() {
              self.consume();
              if let Token(_, TokenContent::LowerId(_)) = self.peek() {
                self.consume();
                match self.peek() {
                  Token(_, TokenContent::Operator(TokenOp::COMMA))
                  | Token(_, TokenContent::Operator(TokenOp::RPAREN)) => {
                    self.unconsume(); // unconsume lower id
                    parameters_or_tuple_elements_cover.push(self.parse_lower_id());
                  }
                  _ => {
                    self.unconsume(); // unconsume lower id
                    break;
                  }
                }
              } else {
                break;
              }
            }
            // If we see ), it means that the cover is complete and still ambiguous.
            if let Token(right_parenthesis_loc, TokenContent::Operator(TokenOp::RPAREN)) =
              self.peek()
            {
              self.consume();
              if let Token(_, TokenContent::Operator(TokenOp::ARROW)) = self.peek() {
                self.consume();
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
                    associated_comments: self
                      .comments_store
                      .create_comment_reference(associated_comments),
                    type_: (),
                  },
                  tuple_elements,
                );
              }
            }
            if let Token(_, TokenContent::LowerId(_)) = self.peek() {
              self.consume();
              if let Token(_, TokenContent::Operator(TokenOp::COLON)) = self.peek() {
                self.unconsume();
                let rest_parameters = self.parse_comma_separated_list_with_end_token(
                  TokenOp::RPAREN,
                  &mut Self::parse_optionally_annotated_id,
                );
                let parameters = parameters_or_tuple_elements_cover
                  .into_iter()
                  .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                  .chain(rest_parameters)
                  .collect_vec();
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
              self.unconsume();
            }
            let rest_tuple_elements = self.parse_comma_separated_list_with_end_token(
              TokenOp::RPAREN,
              &mut SourceParser::parse_expression,
            );
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
              self.error_set.report_invalid_syntax_error(
                node.loc(),
                format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
              );
            }
            tuple_elements.truncate(MAX_STRUCT_SIZE);
            let end_loc = self.assert_and_consume_operator(TokenOp::RPAREN);
            let loc = peeked_loc.union(&end_loc);
            let common = expr::ExpressionCommon {
              loc,
              associated_comments: self
                .comments_store
                .create_comment_reference(associated_comments),
              type_: (),
            };
            debug_assert!(tuple_elements.len() > 1);
            return expr::E::Tuple(common, tuple_elements);
          }
          // (id) -> ... OR (id)
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
                  type_: (),
                  annotation: None,
                }],
                captured: HashMap::new(),
                body: Box::new(body),
              });
            } else {
              // (id)
              self.unconsume();
            }
          }
          _ => {}
        }
        self.unconsume();
      }
      let mut expressions = self.parse_comma_separated_list_with_end_token(
        TokenOp::RPAREN,
        &mut SourceParser::parse_expression,
      );
      if let Some(node) = expressions.get(MAX_STRUCT_SIZE) {
        self.error_set.report_invalid_syntax_error(
          node.loc(),
          format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
        );
      }
      expressions.truncate(MAX_STRUCT_SIZE);
      let end_loc = self.assert_and_consume_operator(TokenOp::RPAREN);
      let loc = peeked_loc.union(&end_loc);
      let common = expr::ExpressionCommon {
        loc,
        associated_comments: self.comments_store.create_comment_reference(associated_comments),
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
      self.consume();

      let mut statements = vec![];
      while let Token(_, TokenContent::Keyword(Keyword::LET)) = self.peek() {
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
    let start_loc = self.assert_and_consume_keyword(Keyword::LET);
    let pattern = self.parse_matching_pattern();
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

  fn parse_matching_pattern_with_unit(&mut self) -> (pattern::MatchingPattern<()>, ()) {
    (self.parse_matching_pattern(), ())
  }

  pub(super) fn parse_matching_pattern(&mut self) -> pattern::MatchingPattern<()> {
    let peeked = self.peek();
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LPAREN)) = peeked {
      self.consume();
      let destructured_names =
        self.parse_comma_separated_list_with_end_token(TokenOp::RPAREN, &mut |s: &mut Self| {
          pattern::TuplePatternElement { pattern: Box::new(s.parse_matching_pattern()), type_: () }
        });
      let end_location = self.assert_and_consume_operator(TokenOp::RPAREN);
      return pattern::MatchingPattern::Tuple(peeked_loc.union(&end_location), destructured_names);
    }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LBRACE)) = peeked {
      self.consume();
      let destructured_names =
        self.parse_comma_separated_list_with_end_token(TokenOp::RBRACE, &mut |s: &mut Self| {
          let field_name = s.parse_lower_id();
          let (pattern, loc, shorthand) =
            if let Token(_, TokenContent::Keyword(Keyword::AS)) = s.peek() {
              s.consume();
              let nested = Box::new(s.parse_matching_pattern());
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
        });
      let end_location = self.assert_and_consume_operator(TokenOp::RBRACE);
      return pattern::MatchingPattern::Object(peeked_loc.union(&end_location), destructured_names);
    }
    if let Token(peeked_loc, TokenContent::UpperId(id)) = peeked {
      self.consume();
      let tag = Id { loc: peeked_loc, associated_comments: NO_COMMENT_REFERENCE, name: id };
      let (data_variables, loc) =
        if let Token(_, TokenContent::Operator(TokenOp::LPAREN)) = self.peek() {
          self.consume();
          let data_variables = self.parse_comma_separated_list_with_end_token(
            TokenOp::RPAREN,
            &mut Self::parse_matching_pattern_with_unit,
          );
          let end_loc = self.assert_and_consume_operator(TokenOp::RPAREN);
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
      self.consume();
      return pattern::MatchingPattern::Wildcard(peeked_loc);
    }
    pattern::MatchingPattern::Id(
      Id {
        loc: peeked.0,
        associated_comments: NO_COMMENT_REFERENCE,
        name: self.assert_and_peek_lower_id().1,
      },
      (),
    )
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

  fn parse_annotated_id(&mut self) -> AnnotatedId<()> {
    let name = self.parse_lower_id();
    self.assert_and_consume_operator(TokenOp::COLON);
    let annotation = self.parse_annotation();
    AnnotatedId { name, type_: (), annotation }
  }

  fn parse_optionally_annotated_id(&mut self) -> OptionallyAnnotatedId<()> {
    let name = self.parse_lower_id();
    let annotation = self.parse_optional_annotation();
    OptionallyAnnotatedId { name, type_: (), annotation }
  }

  fn parse_optional_annotation(&mut self) -> Option<annotation::T> {
    if let Token(_, TokenContent::Operator(TokenOp::COLON)) = self.peek() {
      self.consume();
      Some(self.parse_annotation())
    } else {
      None
    }
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
      TokenContent::UpperId(name) => {
        self.consume();
        let associated_comments = self.comments_store.create_comment_reference(vec![]);
        let id_annot = self.parse_identifier_annot(Id { loc: peeked.0, associated_comments, name });
        if id_annot.type_arguments.is_empty() && self.available_tparams.contains(&id_annot.id.name)
        {
          annotation::T::Generic(id_annot.location, id_annot.id)
        } else {
          annotation::T::Id(id_annot)
        }
      }
      TokenContent::Operator(TokenOp::LPAREN) => {
        self.consume();
        let argument_types = if let Token(_, TokenContent::Operator(TokenOp::RPAREN)) = self.peek()
        {
          self.consume();
          vec![]
        } else {
          let types = self.parse_comma_separated_list_with_end_token(
            TokenOp::RPAREN,
            &mut SourceParser::parse_annotation,
          );
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

  fn fix_tparams_with_generic_annot(&self, tparams: &mut [TypeParameter]) {
    for tparam in tparams {
      if let Some(bound) = &mut tparam.bound {
        for annot in &mut bound.type_arguments {
          self.fix_annot_with_generic_annot(annot);
        }
      }
    }
  }

  fn fix_annot_with_generic_annot(&self, annot: &mut annotation::T) {
    match annot {
      annotation::T::Primitive(_, _, _) | annotation::T::Generic(_, _) => {}
      annotation::T::Id(id_annot) => {
        if id_annot.type_arguments.is_empty() && self.available_tparams.contains(&id_annot.id.name)
        {
          *annot = annotation::T::Generic(id_annot.location, id_annot.id)
        }
      }
      annotation::T::Fn(t) => {
        for annot in &mut t.argument_types {
          self.fix_annot_with_generic_annot(annot);
        }
        self.fix_annot_with_generic_annot(&mut t.return_type);
      }
    }
  }

  fn parse_identifier_annot(&mut self, identifier: Id) -> annotation::Id {
    let (type_arguments, location) =
      if let Token(_, TokenContent::Operator(TokenOp::LT)) = self.peek() {
        self.consume();
        let types = self.parse_comma_separated_list_with_end_token(
          TokenOp::GT,
          &mut SourceParser::parse_annotation,
        );
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
      ModuleReference::ROOT
    } else {
      *self.class_source_map.get(&class_name).unwrap_or(&self.module_reference)
    }
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

    parser.parse_interface();
    parser.parse_class();
    parser.parse_class_member_definition();
    parser.parse_class_member_declaration();
    parser.parse_expression();
    parser.parse_matching_pattern();
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
