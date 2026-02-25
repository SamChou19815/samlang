use super::lexer::{Keyword, Token, TokenContent, TokenOp, TokenProducer};
use samlang_ast::{Location, source::*};
use samlang_errors::ErrorSet;
use samlang_heap::{Heap, ModuleReference, PStr};
use std::collections::{HashMap, HashSet};

const MAX_STRUCT_SIZE: usize = 16;

pub(super) struct SourceParser<'a> {
  token_producer: TokenProducer<'a>,
  peeked: Option<Token>,
  pending_comments: Vec<Comment>,
  last_location: Location,
  comments_store: CommentStore,
  module_reference: ModuleReference,
  heap: &'a mut Heap,
  error_set: &'a mut ErrorSet,
  builtin_classes: HashSet<PStr>,
  class_source_map: HashMap<PStr, ModuleReference>,
  available_tparams: HashSet<PStr>,
}

impl<'a> SourceParser<'a> {
  pub(super) fn new(
    token_producer: TokenProducer<'a>,
    heap: &'a mut Heap,
    error_set: &'a mut ErrorSet,
    module_reference: ModuleReference,
    builtin_classes: HashSet<PStr>,
  ) -> SourceParser<'a> {
    SourceParser {
      token_producer,
      peeked: None,
      pending_comments: Vec::new(),
      last_location: Location::dummy(),
      comments_store: CommentStore::new(),
      module_reference,
      heap,
      error_set,
      builtin_classes,
      class_source_map: HashMap::new(),
      available_tparams: HashSet::new(),
    }
  }

  fn peek(&mut self) -> Token {
    if let Some(token) = self.peeked {
      return token;
    }
    loop {
      match self.token_producer.next_token(self.heap, self.error_set) {
        Some(Token(loc, TokenContent::LineComment(text))) => {
          self.pending_comments.push(Comment { kind: CommentKind::LINE, text });
          self.last_location = loc;
        }
        Some(Token(loc, TokenContent::BlockComment(text))) => {
          self.pending_comments.push(Comment { kind: CommentKind::BLOCK, text });
          self.last_location = loc;
        }
        Some(Token(loc, TokenContent::DocComment(text))) => {
          self.pending_comments.push(Comment { kind: CommentKind::DOC, text });
          self.last_location = loc;
        }
        Some(token) => {
          self.peeked = Some(token);
          return token;
        }
        None => {
          let eof = Token(self.last_location, TokenContent::EndOfFile);
          self.peeked = Some(eof);
          return eof;
        }
      }
    }
  }

  #[must_use]
  fn consume(&mut self) -> Vec<Comment> {
    self.peek();
    let comments = std::mem::take(&mut self.pending_comments);
    let Token(loc, _) = self.peeked.take().unwrap();
    self.last_location = loc;
    comments
  }

  #[must_use]
  fn assert_and_consume_keyword(&mut self, expected_kind: Keyword) -> (Location, Vec<Comment>) {
    let Token(location, content) = self.peek();
    if TokenContent::Keyword(expected_kind) == content {
      let comments = self.consume();
      return (location, comments);
    }
    self.report(
      location,
      format!("Expected: {}, actual: {}.", expected_kind.as_str(), content.pretty_print(self.heap)),
    );
    (location, Vec::new())
  }

  #[must_use]
  fn assert_and_consume_operator(&mut self, expected_kind: TokenOp) -> (Location, Vec<Comment>) {
    let Token(location, content) = self.peek();
    let comments = if let TokenContent::Operator(op) = content {
      if op == expected_kind {
        return (location, self.consume());
      }
      self.consume()
    } else {
      Vec::new()
    };
    self.report(
      location,
      format!("Expected: {}, actual: {}.", expected_kind.as_str(), content.pretty_print(self.heap)),
    );
    (location, comments)
  }

  fn assert_and_peek_lower_id(&mut self) -> (Location, PStr, Vec<Comment>) {
    let Token(location, content) = self.peek();
    if let TokenContent::LowerId(id) = content {
      return (location, id, self.consume());
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
      Vec::new(),
    )
  }

  fn assert_and_peek_upper_id(&mut self) -> (Location, PStr, Vec<Comment>) {
    let Token(location, content) = self.peek();
    if let TokenContent::UpperId(id) = content {
      return (location, id, self.consume());
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
      Vec::new(),
    )
  }

  fn assert_and_consume_identifier(&mut self) -> (Location, PStr, Vec<Comment>) {
    let Token(location, content) = self.peek();
    match content {
      TokenContent::LowerId(id) | TokenContent::UpperId(id) => (location, id, self.consume()),
      _ => {
        self.report(
          location,
          format!("Expected: identifier, actual: {}.", content.pretty_print(self.heap)),
        );
        (location, PStr::MISSING, Vec::new())
      }
    }
  }

  fn report(&mut self, loc: Location, reason: String) {
    self.error_set.report_invalid_syntax_error(loc, reason)
  }

  fn parse_comma_separated_list_with_end_token<T>(
    &mut self,
    end_token: TokenOp,
    mut parser: impl FnMut(&mut Self, Vec<Comment>) -> T,
  ) -> Vec<T> {
    let start = parser(self, Vec::new());
    self.parse_comma_separated_list_with_end_token_with_start(start, end_token, parser)
  }

  fn parse_comma_separated_list_with_end_token_with_start<T>(
    &mut self,
    start: T,
    end_token: TokenOp,
    mut parser: impl FnMut(&mut Self, Vec<Comment>) -> T,
  ) -> Vec<T> {
    let mut collector = vec![start];
    while let Token(_, TokenContent::Operator(op)) = self.peek() {
      if op != TokenOp::Comma {
        break;
      }
      let additional_comments = self.consume();
      if self.peek().1 == TokenContent::Operator(end_token) {
        return collector;
      }
      collector.push(parser(self, additional_comments));
    }
    collector
  }

  fn parse_upper_id_with_comments(&mut self, mut associated_comments: Vec<Comment>) -> Id {
    let (loc, name, mut additional_comments) = self.assert_and_peek_upper_id();
    associated_comments.append(&mut additional_comments);
    Id {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
    }
  }

  fn parse_lower_id_with_comments(&mut self, mut associated_comments: Vec<Comment>) -> Id {
    let (loc, name, mut additional_comments) = self.assert_and_peek_lower_id();
    associated_comments.append(&mut additional_comments);
    Id {
      loc,
      associated_comments: self.comments_store.create_comment_reference(associated_comments),
      name,
    }
  }

  fn parse_upper_id(&mut self) -> Id {
    self.parse_upper_id_with_comments(Vec::new())
  }

  fn parse_lower_id(&mut self) -> Id {
    self.parse_lower_id_with_comments(Vec::new())
  }
}

pub fn parse_module(mut parser: SourceParser) -> Module<()> {
  let mut imports = Vec::new();
  while let Token(import_start, TokenContent::Keyword(Keyword::Import)) = parser.peek() {
    let mut associated_comments = parser.consume();
    associated_comments.append(&mut parser.assert_and_consume_operator(TokenOp::LeftBrace).1);
    let imported_members = parser.parse_comma_separated_list_with_end_token(
      TokenOp::RightBrace,
      &mut SourceParser::parse_upper_id_with_comments,
    );
    associated_comments.append(&mut parser.assert_and_consume_operator(TokenOp::RightBrace).1);
    associated_comments.append(&mut parser.assert_and_consume_keyword(Keyword::From).1);
    let import_loc_start = parser.peek().0;
    let imported_module_parts = {
      let (_, id, mut comments) = parser.assert_and_consume_identifier();
      associated_comments.append(&mut comments);
      let mut collector = vec![id];
      while let Token(_, TokenContent::Operator(TokenOp::Dot)) = parser.peek() {
        associated_comments.append(&mut parser.consume());
        let (_, id, mut comments) = parser.assert_and_consume_identifier();
        associated_comments.append(&mut comments);
        collector.push(id);
      }
      collector
    };
    let imported_module = parser.heap.alloc_module_reference(imported_module_parts);
    let imported_module_loc = import_loc_start.union(&parser.last_location);
    for variable in imported_members.iter() {
      parser.class_source_map.insert(variable.name, imported_module);
    }
    let loc =
      if let Token(semicolon_loc, TokenContent::Operator(TokenOp::Semicolon)) = parser.peek() {
        associated_comments.append(&mut parser.consume());
        import_start.union(&semicolon_loc)
      } else {
        import_start.union(&imported_module_loc)
      };
    imports.push(ModuleMembersImport {
      loc,
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      imported_members,
      imported_module,
      imported_module_loc,
    });
  }

  let mut toplevels = Vec::new();
  'outer: loop {
    if let TokenContent::EndOfFile = parser.peek().1 {
      break;
    }
    loop {
      match parser.peek() {
        Token(_, TokenContent::Keyword(Keyword::Class | Keyword::Interface | Keyword::Private)) => {
          break;
        }
        Token(_, TokenContent::EndOfFile) => break 'outer,
        Token(loc, content) => {
          let _ignored_comment_for_bad_keyword = parser.consume();
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
  let trailing_comments = {
    parser.peek();
    let comments = std::mem::take(&mut parser.pending_comments);
    parser.comments_store.create_comment_reference(comments)
  };

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
    MAX_STRUCT_SIZE,
  };
  use samlang_ast::{Location, source::*};
  use std::collections::HashSet;

  pub(super) fn parse_toplevel(parser: &mut super::SourceParser) -> Toplevel<()> {
    let (loc, is_private, is_interface, comments) =
      parse_private_interface_or_class_keyword(parser);
    if is_interface {
      Toplevel::Interface(parse_interface(parser, (loc, is_private, comments)))
    } else {
      Toplevel::Class(parse_class(parser, (loc, is_private, comments)))
    }
  }

  pub(super) fn parse_class(
    parser: &mut super::SourceParser,
    (mut loc, private, mut associated_comments): (Location, bool, Vec<Comment>),
  ) -> ClassDefinition<()> {
    let name = parser.parse_upper_id();
    loc = loc.union(&name.loc);
    parser.available_tparams = HashSet::new();
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    let (type_definition, extends_or_implements_nodes) = match parser.peek().1 {
      TokenContent::Operator(TokenOp::LeftBrace | TokenOp::Colon) => {
        loc = if let Some(tparams_node) = &type_parameters {
          loc.union(&tparams_node.location)
        } else {
          loc
        };
        let extends_or_implements_nodes = parse_extends_or_implements_nodes(parser);
        if let Some(node) = &extends_or_implements_nodes {
          loc = loc.union(&node.location);
        }
        (None, extends_or_implements_nodes)
      }
      _ => {
        let mut type_def = parse_type_definition_inner(parser);
        let type_def_loc = type_parameters
          .as_ref()
          .map(|it| it.location)
          .unwrap_or(*type_def.loc())
          .union(type_def.loc());
        *type_def.loc_mut() = type_def_loc;
        loc = loc.union(&type_def_loc);
        let extends_or_implements_nodes = parse_extends_or_implements_nodes(parser);
        if let Some(node) = &extends_or_implements_nodes {
          loc = loc.union(&node.location);
        }
        (Some(type_def), extends_or_implements_nodes)
      }
    };
    let mut members = Vec::new();
    let (members_start_loc, mut additional_associated_comments) =
      parser.assert_and_consume_operator(TokenOp::LeftBrace);
    associated_comments.append(&mut additional_associated_comments);
    while let TokenContent::Keyword(Keyword::Function | Keyword::Method | Keyword::Private) =
      parser.peek().1
    {
      let saved_upper_type_parameters = parser.available_tparams.clone();
      members.push(parse_class_member_definition(parser));
      parser.available_tparams = saved_upper_type_parameters;
    }
    let (end_loc, ending_associated_comments) =
      parser.assert_and_consume_operator(TokenOp::RightBrace);
    let ending_associated_comments =
      parser.comments_store.create_comment_reference(ending_associated_comments);
    loc = loc.union(&end_loc);
    InterfaceDeclarationCommon {
      loc,
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition,
      members: InterfaceMembersCommon {
        loc: members_start_loc.union(&end_loc),
        members,
        ending_associated_comments,
      },
    }
  }

  pub(super) fn parse_interface(
    parser: &mut super::SourceParser,
    (mut loc, private, mut associated_comments): (Location, bool, Vec<Comment>),
  ) -> InterfaceDeclaration {
    let name = parser.parse_upper_id();
    parser.available_tparams = HashSet::new();
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    let extends_or_implements_nodes = parse_extends_or_implements_nodes(parser);
    let mut members = Vec::new();
    let (members_start_loc, mut additional_associated_comments) =
      parser.assert_and_consume_operator(TokenOp::LeftBrace);
    associated_comments.append(&mut additional_associated_comments);
    while let TokenContent::Keyword(Keyword::Function | Keyword::Method | Keyword::Private) =
      parser.peek().1
    {
      let saved_upper_type_parameters = parser.available_tparams.clone();
      members.push(parse_class_member_declaration(parser));
      parser.available_tparams = saved_upper_type_parameters;
    }
    let (end_loc, ending_associated_comments) =
      parser.assert_and_consume_operator(TokenOp::RightBrace);
    let ending_associated_comments =
      parser.comments_store.create_comment_reference(ending_associated_comments);
    loc = loc.union(&end_loc);
    InterfaceDeclarationCommon {
      loc,
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      private,
      name,
      type_parameters,
      extends_or_implements_nodes,
      type_definition: (),
      members: InterfaceMembersCommon {
        loc: members_start_loc.union(&end_loc),
        members,
        ending_associated_comments,
      },
    }
  }

  fn parse_private_interface_or_class_keyword(
    parser: &mut super::SourceParser,
  ) -> (Location, bool, bool, Vec<Comment>) {
    let mut associated_comments = Vec::new();
    if let Token(loc, TokenContent::Keyword(Keyword::Private)) = parser.peek() {
      associated_comments.append(&mut parser.consume());
      let is_interface = if matches!(parser.peek().1, TokenContent::Keyword(Keyword::Interface)) {
        associated_comments.append(&mut parser.assert_and_consume_keyword(Keyword::Interface).1);
        true
      } else {
        associated_comments.append(&mut parser.assert_and_consume_keyword(Keyword::Class).1);
        false
      };
      (loc, true, is_interface, associated_comments)
    } else {
      let (loc, is_interface) =
        if matches!(parser.peek().1, TokenContent::Keyword(Keyword::Interface)) {
          let (loc, mut comments) = parser.assert_and_consume_keyword(Keyword::Interface);
          associated_comments.append(&mut comments);
          (loc, true)
        } else {
          let (loc, mut comments) = parser.assert_and_consume_keyword(Keyword::Class);
          associated_comments.append(&mut comments);
          (loc, false)
        };
      (loc, false, is_interface, associated_comments)
    }
  }

  fn parse_extends_or_implements_nodes(
    parser: &mut super::SourceParser,
  ) -> Option<ExtendsOrImplementsNodes> {
    if let TokenContent::Operator(TokenOp::Colon) = parser.peek().1 {
      let (mut location, comments) = parser.assert_and_consume_operator(TokenOp::Colon);
      let id = parser.parse_upper_id();
      let mut nodes = vec![super::type_parser::parse_identifier_annot(parser, id)];
      while let Token(_, TokenContent::Operator(TokenOp::Comma)) = parser.peek() {
        let comments = parser.consume();
        let id = parser.parse_upper_id_with_comments(comments);
        nodes.push(super::type_parser::parse_identifier_annot(parser, id));
      }
      location = location.union(&nodes.last().unwrap().location);
      Some(ExtendsOrImplementsNodes {
        location,
        associated_comments: parser.comments_store.create_comment_reference(comments),
        nodes,
      })
    } else {
      None
    }
  }

  fn parse_type_definition_inner(parser: &mut super::SourceParser) -> TypeDefinition {
    let (loc_start, start_comments) = parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    if let Token(_, TokenContent::UpperId(_)) = parser.peek() {
      let variants = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut parse_variant_definition,
      );
      let (loc_end, end_comments) = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
      TypeDefinition::Enum {
        loc: loc_start.union(&loc_end),
        start_associated_comments: parser.comments_store.create_comment_reference(start_comments),
        ending_associated_comments: parser.comments_store.create_comment_reference(end_comments),
        variants,
      }
    } else {
      let mut fields = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut parse_field_definition,
      );
      if let Some(node) = fields.get(MAX_STRUCT_SIZE) {
        parser.error_set.report_invalid_syntax_error(
          node.name.loc,
          format!("Maximum allowed field size is {MAX_STRUCT_SIZE}"),
        );
      }
      fields.truncate(MAX_STRUCT_SIZE);
      let (loc_end, end_comments) = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
      TypeDefinition::Struct {
        loc: loc_start.union(&loc_end),
        start_associated_comments: parser.comments_store.create_comment_reference(start_comments),
        ending_associated_comments: parser.comments_store.create_comment_reference(end_comments),
        fields,
      }
    }
  }

  fn parse_field_definition(
    parser: &mut super::SourceParser,
    mut comments: Vec<Comment>,
  ) -> FieldDefinition {
    let mut is_public = true;
    if let TokenContent::Keyword(Keyword::Private) = parser.peek().1 {
      is_public = false;
      comments.append(&mut parser.consume());
    }
    comments.append(&mut parser.assert_and_consume_keyword(Keyword::Val).1);
    let name = parser.parse_lower_id_with_comments(comments);
    let annotation = super::type_parser::parse_annotation_with_colon(parser);
    FieldDefinition { name, annotation, is_public }
  }

  fn parse_variant_definition(
    parser: &mut super::SourceParser,
    addtional_preceding_comments: Vec<Comment>,
  ) -> VariantDefinition {
    let name = parser.parse_upper_id_with_comments(addtional_preceding_comments);
    if let Token(left_paren_loc, TokenContent::Operator(TokenOp::LeftParenthesis)) = parser.peek() {
      let start_comments = parser.consume();
      let annotations = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut super::type_parser::parse_annotation_with_additional_comments,
      );
      let (right_paren_loc, end_comments) =
        parser.assert_and_consume_operator(TokenOp::RightParenthesis);
      VariantDefinition {
        name,
        associated_data_types: Some(annotation::ParenthesizedAnnotationList {
          location: left_paren_loc.union(&right_paren_loc),
          start_associated_comments: parser.comments_store.create_comment_reference(start_comments),
          ending_associated_comments: parser.comments_store.create_comment_reference(end_comments),
          annotations,
        }),
      }
    } else {
      VariantDefinition { name, associated_data_types: None }
    }
  }

  pub(super) fn parse_class_member_definition(
    parser: &mut super::SourceParser,
  ) -> ClassMemberDefinition<()> {
    let mut decl = parse_class_member_declaration_common(parser, true);
    let (_, additional_comments) = parser.assert_and_consume_operator(TokenOp::Assign);
    let body = super::expression_parser::parse_expression_with_additional_preceding_comments(
      parser,
      additional_comments,
    );
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
    let mut associated_comments = Vec::new();
    let mut is_public = true;
    let mut is_method = true;
    let mut peeked = parser.peek();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::Private)) = peeked {
      if allow_private {
        is_public = false;
      } else {
        parser.report(peeked_loc, "Unexpected `private`".to_string());
      }
      associated_comments.append(&mut parser.consume());
      peeked = parser.peek();
    }
    let start_loc = &peeked.0;
    if let Token(_, TokenContent::Keyword(Keyword::Function)) = &peeked {
      is_method = false;
      associated_comments.append(&mut parser.consume());
    } else {
      associated_comments.append(&mut parser.assert_and_consume_keyword(Keyword::Method).1);
    }
    if !is_method {
      parser.available_tparams = HashSet::new();
    }
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    parser
      .available_tparams
      .extend(type_parameters.iter().flat_map(|it| &it.parameters).map(|it| it.name.name));
    let name = parser.parse_lower_id();
    let (fun_type_loc_start, parameters_start_comments) =
      parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    let parameters = if let TokenContent::Operator(TokenOp::RightParenthesis) = parser.peek().1 {
      Vec::new()
    } else {
      parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut super::type_parser::parse_annotated_id,
      )
    };
    let (parameters_end_loc, parameters_end_comments) =
      parser.assert_and_consume_operator(TokenOp::RightParenthesis);
    let return_type = super::type_parser::parse_annotation_with_colon(parser);
    let fun_type_loc = fun_type_loc_start.union(&return_type.location());
    ClassMemberDeclaration {
      loc: start_loc.union(&fun_type_loc),
      associated_comments: parser.comments_store.create_comment_reference(associated_comments),
      is_public,
      is_method,
      name,
      type_parameters,
      parameters: FunctionParameters {
        location: fun_type_loc_start.union(&parameters_end_loc),
        start_associated_comments: parser
          .comments_store
          .create_comment_reference(parameters_start_comments),
        ending_associated_comments: parser
          .comments_store
          .create_comment_reference(parameters_end_comments),
        parameters: std::rc::Rc::new(parameters),
      },
      return_type,
    }
  }
}

mod expression_parser {
  use crate::source_parser::type_parser;

  use super::{
    super::lexer::{Keyword, Token, TokenContent, TokenOp},
    MAX_STRUCT_SIZE,
  };
  use itertools::Itertools;
  use samlang_ast::{Location, source::*};
  use samlang_heap::PStr;
  use std::collections::HashMap;

  pub(super) fn parse_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    parse_match(parser)
  }

  pub(super) fn parse_expression_with_additional_preceding_comments(
    parser: &mut super::SourceParser,
    additional_preceding_comments: Vec<Comment>,
  ) -> expr::E<()> {
    let mut expr = parse_expression(parser);
    let common = expr.common_mut();
    common.associated_comments =
      super::utils::mod_associated_comments_with_additional_preceding_comments(
        parser,
        common.associated_comments,
        additional_preceding_comments,
      );
    expr
  }

  fn parse_match(parser: &mut super::SourceParser) -> expr::E<()> {
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::Match)) = parser.peek() {
      let mut associated_comments = parser.consume();
      let match_expression = parse_expression(parser);
      associated_comments.append(&mut parser.assert_and_consume_operator(TokenOp::LeftBrace).1);
      let mut matching_list = vec![parse_pattern_to_expression(parser)];
      while matches!(
        parser.peek().1,
        TokenContent::Operator(TokenOp::LeftBrace | TokenOp::LeftParenthesis | TokenOp::Underscore)
          | TokenContent::LowerId(_)
          | TokenContent::UpperId(_)
      ) {
        matching_list.push(parse_pattern_to_expression(parser));
      }
      let loc = {
        let (loc, mut comments) = parser.assert_and_consume_operator(TokenOp::RightBrace);
        associated_comments.append(&mut comments);
        peeked_loc.union(&loc)
      };
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
      parse_if_else_or_higher_precedence(parser)
    }
  }

  fn parse_pattern_to_expression(
    parser: &mut super::SourceParser,
  ) -> expr::VariantPatternToExpression<()> {
    let pattern = super::pattern_parser::parse_matching_pattern(parser, Vec::new());
    let (_, additional_comments) = parser.assert_and_consume_operator(TokenOp::Arrow);
    let expression =
      parse_expression_with_additional_preceding_comments(parser, additional_comments);
    let (loc, ending_associated_comments) =
      if matches!(parser.peek().1, TokenContent::Operator(TokenOp::RightBrace)) {
        (pattern.loc().union(&expression.loc()), NO_COMMENT_REFERENCE)
      } else {
        let (loc, comments) = parser.assert_and_consume_operator(TokenOp::Comma);
        (pattern.loc().union(&loc), parser.comments_store.create_comment_reference(comments))
      };
    expr::VariantPatternToExpression {
      loc,
      pattern,
      body: Box::new(expression),
      ending_associated_comments,
    }
  }

  fn parse_if_else_or_higher_precedence(parser: &mut super::SourceParser) -> expr::E<()> {
    if let Token(_, TokenContent::Keyword(Keyword::If)) = parser.peek() {
      return expr::E::IfElse(parse_if_else(parser, Vec::new()));
    }
    parse_disjunction(parser)
  }

  fn parse_if_else(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> expr::IfElse<()> {
    let (peeked_loc, mut preceding_comments) = parser.assert_and_consume_keyword(Keyword::If);
    associated_comments.append(&mut preceding_comments);
    let condition =
      if let Token(_peeked_let_loc, TokenContent::Keyword(Keyword::Let)) = parser.peek() {
        associated_comments.append(&mut parser.consume());
        let pattern = super::pattern_parser::parse_matching_pattern(parser, Vec::new());
        associated_comments.append(&mut parser.assert_and_consume_operator(TokenOp::Assign).1);
        let expr = parse_expression(parser);
        expr::IfElseCondition::Guard(pattern, expr)
      } else {
        expr::IfElseCondition::Expression(parse_expression(parser))
      };
    let e1 = parse_block(parser, Vec::new());
    let (_, e2_preceding_comments) = parser.assert_and_consume_keyword(Keyword::Else);
    let (e2_loc, e2) = if let Token(_, TokenContent::Keyword(Keyword::If)) = parser.peek() {
      let e = parse_if_else(parser, e2_preceding_comments);
      (e.common.loc, expr::IfElseOrBlock::IfElse(e))
    } else {
      let e = parse_block(parser, e2_preceding_comments);
      (e.common.loc, expr::IfElseOrBlock::Block(e))
    };
    let loc = peeked_loc.union(&e2_loc);
    expr::IfElse {
      common: expr::ExpressionCommon {
        loc,
        associated_comments: parser.comments_store.create_comment_reference(associated_comments),
        type_: (),
      },
      condition: Box::new(condition),
      e1: Box::new(e1),
      e2: Box::new(e2),
    }
  }

  fn parse_disjunction(parser: &mut super::SourceParser) -> expr::E<()> {
    let e = parse_conjunction(parser);
    parse_disjunction_with_start(parser, e)
  }

  fn parse_disjunction_with_start(
    parser: &mut super::SourceParser,
    mut e: expr::E<()>,
  ) -> expr::E<()> {
    while let TokenContent::Operator(TokenOp::Or) = parser.peek().1 {
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_conjunction(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let e = parse_comparison(parser);
    parse_conjunction_with_start(parser, e)
  }

  fn parse_conjunction_with_start(
    parser: &mut super::SourceParser,
    mut e: expr::E<()>,
  ) -> expr::E<()> {
    while let TokenContent::Operator(TokenOp::And) = parser.peek().1 {
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_comparison(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let e = parse_term(parser);
    parse_comparison_with_start(parser, e)
  }

  fn parse_comparison_with_start(
    parser: &mut super::SourceParser,
    mut e: expr::E<()>,
  ) -> expr::E<()> {
    loop {
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::LessThan) => expr::BinaryOperator::LT,
        TokenContent::Operator(TokenOp::LessThanOrEqual) => expr::BinaryOperator::LE,
        TokenContent::Operator(TokenOp::GreaterThan) => expr::BinaryOperator::GT,
        TokenContent::Operator(TokenOp::GreaterThanOrEqual) => expr::BinaryOperator::GE,
        TokenContent::Operator(TokenOp::Equal) => expr::BinaryOperator::EQ,
        TokenContent::Operator(TokenOp::NotEqual) => expr::BinaryOperator::NE,
        _ => break,
      };
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_term(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let e = parse_factor(parser);
    parse_term_with_start(parser, e)
  }

  fn parse_term_with_start(parser: &mut super::SourceParser, mut e: expr::E<()>) -> expr::E<()> {
    loop {
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::Plus) => expr::BinaryOperator::PLUS,
        TokenContent::Operator(TokenOp::Minus) => expr::BinaryOperator::MINUS,
        _ => break,
      };
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_factor(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let e = parse_concat(parser);
    parse_factor_with_start(parser, e)
  }

  fn parse_factor_with_start(parser: &mut super::SourceParser, mut e: expr::E<()>) -> expr::E<()> {
    loop {
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::Multiply) => expr::BinaryOperator::MUL,
        TokenContent::Operator(TokenOp::Divide) => expr::BinaryOperator::DIV,
        TokenContent::Operator(TokenOp::Mod) => expr::BinaryOperator::MOD,
        _ => break,
      };
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_concat(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let e = parse_unary_expression(parser);
    parse_concat_with_start(parser, e)
  }

  fn parse_concat_with_start(parser: &mut super::SourceParser, mut e: expr::E<()>) -> expr::E<()> {
    while let TokenContent::Operator(TokenOp::ColonColon) = parser.peek().1 {
      let concrete_comments = parser.consume();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let e2 = parse_unary_expression(parser);
      let loc = e.loc().union(&e2.loc());
      e = expr::E::Binary(expr::Binary {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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
    let Token(peeked_loc, content) = parser.peek();
    match content {
      TokenContent::Operator(TokenOp::Not) => {
        let associated_comments = parser.consume();
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
      TokenContent::Operator(TokenOp::Minus) => {
        let associated_comments = parser.consume();
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
    let base = parse_base_expression(parser);
    parse_function_call_or_field_access_with_start(parser, base)
  }

  fn parse_function_call_or_field_access_with_start(
    parser: &mut super::SourceParser,
    start: expr::E<()>,
  ) -> expr::E<()> {
    // Treat function arguments or field name as postfix.
    // Then use Kleene star trick to parse.
    let mut function_expression = start;
    loop {
      match parser.peek() {
        Token(dot_loc, TokenContent::Operator(TokenOp::Dot)) => {
          let mut field_preceding_comments = parser.consume();
          let (field_loc, field_name) = match parser.peek() {
            Token(l, TokenContent::LowerId(id) | TokenContent::UpperId(id)) => {
              field_preceding_comments.append(&mut parser.consume());
              (l, id)
            }
            Token(l, t) => {
              parser
                .report(l, format!("Expected identifier, but get {}", t.pretty_print(parser.heap)));
              (Location { end: l.start, ..dot_loc }, PStr::MISSING)
            }
          };
          let explicit_type_arguments = super::type_parser::parse_optional_type_arguments(parser);
          let loc = if let Some(node) = &explicit_type_arguments {
            function_expression.loc().union(&node.location)
          } else {
            function_expression.loc().union(&field_loc)
          };
          function_expression = expr::E::FieldAccess(expr::FieldAccess {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
              type_: (),
            },
            explicit_type_arguments,
            inferred_type_arguments: Vec::new(),
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
        Token(_, TokenContent::Operator(TokenOp::LeftParenthesis)) => {
          let function_arguments = parse_parenthesized_expression_list(parser, usize::MAX);
          let loc = function_expression.loc().union(&function_arguments.loc);
          function_expression = expr::E::Call(expr::Call {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: parser.comments_store.create_comment_reference(Vec::new()),
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

  fn parse_expression_from_base(
    parser: &mut super::SourceParser,
    base: expr::E<()>,
  ) -> expr::E<()> {
    let e = parse_function_call_or_field_access_with_start(parser, base);
    let e = parse_concat_with_start(parser, e);
    let e = parse_factor_with_start(parser, e);
    let e = parse_term_with_start(parser, e);
    let e = parse_comparison_with_start(parser, e);
    let e = parse_conjunction_with_start(parser, e);
    parse_disjunction_with_start(parser, e)
  }

  fn parse_base_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    if let Some(e) = parse_base_expression_single_token(parser) {
      return e;
    }

    // Lambda or tuple or nested expression
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LeftParenthesis)) = parser.peek() {
      let associated_comments = parser.consume();
      // () -> ...
      if let Token(right_parenthesis_loc, TokenContent::Operator(TokenOp::RightParenthesis)) =
        parser.peek()
      {
        let mut ending_comments = parser.consume();
        ending_comments.append(&mut parser.assert_and_consume_operator(TokenOp::Arrow).1);
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
          parameters: expr::LambdaParameters {
            loc: peeked_loc.union(&right_parenthesis_loc),
            parameters: Vec::new(),
            ending_associated_comments: parser
              .comments_store
              .create_comment_reference(ending_comments),
          },
          captured: HashMap::new(),
          body: Box::new(body),
        });
      }

      // (id ...
      if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
        let start_id = parser.parse_lower_id_with_comments(Vec::new());
        match parser.peek().1 {
          // (id: ... definitely a lambda
          TokenContent::Operator(TokenOp::Colon) => {
            let id = OptionallyAnnotatedId {
              name: start_id,
              type_: (),
              annotation: type_parser::parse_optional_annotation(parser),
            };
            let parameters = parser.parse_comma_separated_list_with_end_token_with_start(
              id,
              TokenOp::RightParenthesis,
              &mut super::type_parser::parse_optionally_annotated_id,
            );
            let (right_parenthesis_loc, mut ending_comments) =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            let (_, mut additional_ending_comments) =
              parser.assert_and_consume_operator(TokenOp::Arrow);
            ending_comments.append(&mut additional_ending_comments);
            let parameters = expr::LambdaParameters {
              loc: peeked_loc.union(&right_parenthesis_loc),
              parameters,
              ending_associated_comments: parser
                .comments_store
                .create_comment_reference(ending_comments),
            };
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
          TokenContent::Operator(TokenOp::Comma) => {
            // Advance as far as possible for a comma separated lower id.
            // This is common for both arrow function and tuple.
            let mut parameters_or_tuple_elements_cover = vec![start_id];
            while let Token(_, TokenContent::Operator(TokenOp::Comma)) = parser.peek() {
              let id_comments = parser.consume();
              if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
                let id = parser.parse_lower_id_with_comments(id_comments);
                match parser.peek().1 {
                  TokenContent::Operator(TokenOp::Comma) => {
                    parameters_or_tuple_elements_cover.push(id);
                  }
                  TokenContent::Operator(TokenOp::RightParenthesis) => {
                    parameters_or_tuple_elements_cover.push(id);
                    break;
                  }
                  TokenContent::Operator(TokenOp::Colon) => {
                    // (a, b, id: Type, ...) -> expr — annotated lambda
                    let annotation = type_parser::parse_optional_annotation(parser);
                    let annotated_id = OptionallyAnnotatedId { name: id, type_: (), annotation };
                    let rest_parameters = parser
                      .parse_comma_separated_list_with_end_token_with_start(
                        annotated_id,
                        TokenOp::RightParenthesis,
                        &mut super::type_parser::parse_optionally_annotated_id,
                      );
                    let parameters = parameters_or_tuple_elements_cover
                      .into_iter()
                      .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                      .chain(rest_parameters)
                      .collect_vec();
                    let (right_parenthesis_loc, mut ending_comments) =
                      parser.assert_and_consume_operator(TokenOp::RightParenthesis);
                    ending_comments
                      .append(&mut parser.assert_and_consume_operator(TokenOp::Arrow).1);
                    let parameters = expr::LambdaParameters {
                      loc: peeked_loc.union(&right_parenthesis_loc),
                      parameters,
                      ending_associated_comments: parser
                        .comments_store
                        .create_comment_reference(ending_comments),
                    };
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
                  _ => {
                    // id starts a complex expression in a tuple: (a, b, id + ...)
                    let id_expr = expr::E::LocalId(
                      expr::ExpressionCommon {
                        loc: id.loc,
                        associated_comments: NO_COMMENT_REFERENCE,
                        type_: (),
                      },
                      id,
                    );
                    let first_remaining = parse_expression_from_base(parser, id_expr);
                    let tuple_elements: Vec<expr::E<()>> = parameters_or_tuple_elements_cover
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
                      .chain(std::iter::once(first_remaining))
                      .collect();
                    return collect_remaining_and_build_tuple(
                      parser,
                      peeked_loc,
                      associated_comments,
                      tuple_elements,
                    );
                  }
                }
              } else {
                if matches!(
                  parser.peek(),
                  Token(_, TokenContent::Operator(TokenOp::RightParenthesis))
                ) {
                  break;
                }
                // Non-id expression in tuple: (a, b, 42, ...)
                let first_remaining = parse_expression(parser);
                let tuple_elements: Vec<expr::E<()>> = parameters_or_tuple_elements_cover
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
                  .chain(std::iter::once(first_remaining))
                  .collect();
                return collect_remaining_and_build_tuple(
                  parser,
                  peeked_loc,
                  associated_comments,
                  tuple_elements,
                );
              }
            }
            // Cover is complete, peek is ). Check for -> to disambiguate lambda vs tuple.
            let (right_parenthesis_loc, mut comments_before_rparen) =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            if let Token(_, TokenContent::Operator(TokenOp::Arrow)) = parser.peek() {
              comments_before_rparen.append(&mut parser.consume());
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
                parameters: expr::LambdaParameters {
                  loc: peeked_loc.union(&right_parenthesis_loc),
                  parameters: parameters_or_tuple_elements_cover
                    .into_iter()
                    .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                    .collect(),
                  ending_associated_comments: parser
                    .comments_store
                    .create_comment_reference(comments_before_rparen),
                },
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
                  associated_comments: NO_COMMENT_REFERENCE,
                  type_: (),
                },
                expr::ParenthesizedExpressionList {
                  loc,
                  start_associated_comments: parser
                    .comments_store
                    .create_comment_reference(associated_comments),
                  ending_associated_comments: parser
                    .comments_store
                    .create_comment_reference(comments_before_rparen),
                  expressions: tuple_elements,
                },
              );
            }
          }
          // (id) -> ... OR (id)
          TokenContent::Operator(TokenOp::RightParenthesis) => {
            let (right_parenthesis_loc, mut ending_comments) =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            if let Token(_, TokenContent::Operator(TokenOp::Arrow)) = parser.peek() {
              ending_comments.append(&mut parser.consume());
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
                parameters: expr::LambdaParameters {
                  loc: peeked_loc.union(&right_parenthesis_loc),
                  parameters: vec![OptionallyAnnotatedId {
                    name: start_id,
                    type_: (),
                    annotation: None,
                  }],
                  ending_associated_comments: parser
                    .comments_store
                    .create_comment_reference(ending_comments),
                },
                captured: HashMap::new(),
                body: Box::new(body),
              });
            } else {
              return expr::E::LocalId(
                expr::ExpressionCommon {
                  loc: start_id.loc,
                  associated_comments: NO_COMMENT_REFERENCE,
                  type_: (),
                },
                start_id,
              );
            }
          }
          // (id<op>... — parenthesized expression or tuple starting with id
          _ => {
            let id_expr = expr::E::LocalId(
              expr::ExpressionCommon {
                loc: start_id.loc,
                associated_comments: NO_COMMENT_REFERENCE,
                type_: (),
              },
              start_id,
            );
            let first_expr = parse_expression_from_base(parser, id_expr);
            if matches!(parser.peek(), Token(_, TokenContent::Operator(TokenOp::Comma))) {
              let expressions = vec![first_expr];
              return collect_remaining_and_build_tuple(
                parser,
                peeked_loc,
                associated_comments,
                expressions,
              );
            } else {
              let _ = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
              return first_expr;
            }
          }
        }
      };
      let mut expressions_list = parse_parenthesized_expression_list_with_start(
        parser,
        (peeked_loc, associated_comments),
        MAX_STRUCT_SIZE,
      );
      if expressions_list.expressions.len() == 1 {
        return expressions_list.expressions.pop().unwrap();
      }
      return expr::E::Tuple(
        expr::ExpressionCommon {
          loc: expressions_list.loc,
          associated_comments: NO_COMMENT_REFERENCE,
          type_: (),
        },
        expressions_list,
      );
    }

    // Statement Block: { ... }
    if let Token(_, TokenContent::Operator(TokenOp::LeftBrace)) = parser.peek() {
      return expr::E::Block(parse_block(parser, Vec::new()));
    }

    let peeked = parser.peek();
    // Error case
    parser.report(
      peeked.0,
      format!("Expected: expression, actual: {}", peeked.1.pretty_print(parser.heap)),
    );
    expr::E::Literal(
      expr::ExpressionCommon {
        loc: peeked.0,
        associated_comments: NO_COMMENT_REFERENCE,
        type_: (),
      },
      Literal::Int(0),
    )
  }

  fn parse_base_expression_single_token(parser: &mut super::SourceParser) -> Option<expr::E<()>> {
    match parser.peek() {
      Token(peeked_loc, TokenContent::Keyword(Keyword::True)) => {
        let associated_comments = parser.consume();
        Some(expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Bool(true),
        ))
      }
      Token(peeked_loc, TokenContent::Keyword(Keyword::False)) => {
        let associated_comments = parser.consume();
        Some(expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Bool(false),
        ))
      }
      Token(peeked_loc, TokenContent::IntLiteral(i)) => {
        let associated_comments = parser.consume();
        Some(expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::Int(i.as_str(parser.heap).parse::<i32>().unwrap_or(0)),
        ))
      }
      Token(peeked_loc, TokenContent::StringLiteral(s)) => {
        let associated_comments = parser.consume();
        let chars = s.as_str(parser.heap).chars().collect_vec();
        let str_lit =
          super::utils::unescape_quotes(&chars[1..(chars.len() - 1)].iter().collect::<String>());
        Some(expr::E::Literal(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Literal::String(parser.heap.alloc_string(str_lit)),
        ))
      }
      Token(peeked_loc, TokenContent::Keyword(Keyword::This)) => {
        let associated_comments = parser.consume();
        Some(expr::E::LocalId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Id { loc: peeked_loc, associated_comments: NO_COMMENT_REFERENCE, name: PStr::THIS },
        ))
      }
      Token(peeked_loc, TokenContent::LowerId(name)) => {
        let associated_comments = parser.consume();
        Some(expr::E::LocalId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          Id { loc: peeked_loc, associated_comments: NO_COMMENT_REFERENCE, name },
        ))
      }
      Token(peeked_loc, TokenContent::UpperId(name)) => {
        let associated_comments = parser.consume();
        Some(expr::E::ClassId(
          expr::ExpressionCommon {
            loc: peeked_loc,
            associated_comments: parser
              .comments_store
              .create_comment_reference(associated_comments),
            type_: (),
          },
          super::utils::resolve_class(parser, name),
          Id { loc: peeked_loc, associated_comments: NO_COMMENT_REFERENCE, name },
        ))
      }
      _ => None,
    }
  }

  fn parse_parenthesized_expression_list(
    parser: &mut super::SourceParser,
    max_size: usize,
  ) -> expr::ParenthesizedExpressionList<()> {
    let (start_loc, starting_comments) =
      parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    parse_parenthesized_expression_list_with_start(parser, (start_loc, starting_comments), max_size)
  }

  fn parse_parenthesized_expression_list_with_start(
    parser: &mut super::SourceParser,
    (start_loc, starting_comments): (Location, Vec<Comment>),
    max_size: usize,
  ) -> expr::ParenthesizedExpressionList<()> {
    let expressions =
      if matches!(parser.peek(), Token(_, TokenContent::Operator(TokenOp::RightParenthesis))) {
        Vec::new()
      } else {
        let mut expressions = parser.parse_comma_separated_list_with_end_token(
          TokenOp::RightParenthesis,
          &mut parse_expression_with_additional_preceding_comments,
        );
        if let Some(node) = expressions.get(max_size) {
          parser.error_set.report_invalid_syntax_error(
            node.loc(),
            format!("Maximum allowed tuple size is {max_size}"),
          );
        }
        expressions.truncate(max_size);
        expressions
      };
    let (end_loc, ending_comments) = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
    let loc = start_loc.union(&end_loc);
    expr::ParenthesizedExpressionList {
      loc,
      start_associated_comments: parser.comments_store.create_comment_reference(starting_comments),
      ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
      expressions,
    }
  }

  fn collect_remaining_and_build_tuple(
    parser: &mut super::SourceParser,
    start_loc: Location,
    start_comments: Vec<Comment>,
    mut expressions: Vec<expr::E<()>>,
  ) -> expr::E<()> {
    while let Token(_, TokenContent::Operator(TokenOp::Comma)) = parser.peek() {
      let comments = parser.consume();
      if matches!(parser.peek(), Token(_, TokenContent::Operator(TokenOp::RightParenthesis))) {
        break;
      }
      expressions.push(parse_expression_with_additional_preceding_comments(parser, comments));
    }
    if let Some(node) = expressions.get(MAX_STRUCT_SIZE) {
      parser.error_set.report_invalid_syntax_error(
        node.loc(),
        format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
      );
    }
    expressions.truncate(MAX_STRUCT_SIZE);
    let (end_loc, end_comments) = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
    let loc = start_loc.union(&end_loc);
    debug_assert!(expressions.len() > 1);
    expr::E::Tuple(
      expr::ExpressionCommon { loc, associated_comments: NO_COMMENT_REFERENCE, type_: () },
      expr::ParenthesizedExpressionList {
        loc,
        start_associated_comments: parser.comments_store.create_comment_reference(start_comments),
        ending_associated_comments: parser.comments_store.create_comment_reference(end_comments),
        expressions,
      },
    )
  }

  fn parse_block(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> expr::Block<()> {
    let start_loc = {
      let (loc, mut comments) = parser.assert_and_consume_operator(TokenOp::LeftBrace);
      associated_comments.append(&mut comments);
      loc
    };

    let mut statements = Vec::new();

    loop {
      match parser.peek() {
        Token(_, TokenContent::Keyword(Keyword::Let)) => {
          statements.push(parse_statement(parser));
        }
        Token(_, TokenContent::Operator(TokenOp::RightBrace)) => {
          // Empty block - no final expression
          let (end_loc, ending_comments) = parser.assert_and_consume_operator(TokenOp::RightBrace);
          let loc = start_loc.union(&end_loc);
          return expr::Block {
            common: expr::ExpressionCommon {
              loc,
              associated_comments: parser
                .comments_store
                .create_comment_reference(associated_comments),
              type_: (),
            },
            statements,
            expression: None,
            ending_associated_comments: parser
              .comments_store
              .create_comment_reference(ending_comments),
          };
        }
        Token(_, TokenContent::Operator(TokenOp::Semicolon)) => {
          // Empty statement, skip it
          let (_, ending_comments) = parser.assert_and_consume_operator(TokenOp::Semicolon);
          associated_comments.extend(ending_comments);
        }
        Token(loc, TokenContent::EndOfFile) => {
          // Unexpected end of file inside block
          parser.report(loc, "Expected: }, actual: EOF.".to_string());
          return expr::Block {
            common: expr::ExpressionCommon {
              loc: start_loc.union(&loc),
              associated_comments: parser
                .comments_store
                .create_comment_reference(associated_comments),
              type_: (),
            },
            statements,
            expression: None,
            ending_associated_comments: NO_COMMENT_REFERENCE,
          };
        }
        _ => {
          // Try to parse as an expression statement: parse expression, expect semicolon
          let expr = parse_expression(parser);
          let peeked_after_expr = parser.peek();
          if let Token(_, TokenContent::Operator(TokenOp::Semicolon)) = peeked_after_expr {
            // This is an expression statement
            let (_, ending_comments) = parser.assert_and_consume_operator(TokenOp::Semicolon);
            statements.push(expr::Statement::Expression(Box::new(expr)));
            associated_comments.extend(ending_comments);
          } else if let Token(end_loc, TokenContent::Operator(TokenOp::RightBrace)) =
            peeked_after_expr
          {
            // This is the final expression (no semicolon)
            let (_, ending_comments) = parser.assert_and_consume_operator(TokenOp::RightBrace);
            let loc = start_loc.union(&end_loc);
            return expr::Block {
              common: expr::ExpressionCommon {
                loc,
                associated_comments: parser
                  .comments_store
                  .create_comment_reference(associated_comments),
                type_: (),
              },
              statements,
              expression: Some(Box::new(expr)),
              ending_associated_comments: parser
                .comments_store
                .create_comment_reference(ending_comments),
            };
          } else if let Token(loc, TokenContent::EndOfFile) = peeked_after_expr {
            // Unexpected end of file - expression without closing brace
            parser.report(loc, "Expected: ; or }, actual: EOF.".to_string());
            return expr::Block {
              common: expr::ExpressionCommon {
                loc: start_loc.union(&loc),
                associated_comments: parser
                  .comments_store
                  .create_comment_reference(associated_comments),
                type_: (),
              },
              statements,
              expression: Some(Box::new(expr)),
              ending_associated_comments: NO_COMMENT_REFERENCE,
            };
          } else {
            // Error: expected semicolon or closing brace
            let Token(loc, content) = parser.peek();
            parser.report(
              loc,
              format!("Expected: ; or }}, actual: {}", content.pretty_print(parser.heap)),
            );
            associated_comments.extend(parser.consume());
            // Continue parsing to find more errors
          }
        }
      }
    }
  }

  pub(super) fn parse_statement(parser: &mut super::SourceParser) -> expr::Statement<()> {
    let (start_loc, mut concrete_comments) = parser.assert_and_consume_keyword(Keyword::Let);
    let pattern = super::pattern_parser::parse_matching_pattern(parser, Vec::new());
    let annotation = if let Token(_, TokenContent::Operator(TokenOp::Colon)) = parser.peek() {
      Some(super::type_parser::parse_annotation_with_colon(parser))
    } else {
      None
    };
    concrete_comments.append(&mut parser.assert_and_consume_operator(TokenOp::Assign).1);
    let assigned_expression = Box::new(parse_expression(parser));
    let (end_loc, mut additional_comments) = parser.assert_and_consume_operator(TokenOp::Semicolon);
    concrete_comments.append(&mut additional_comments);
    let loc = start_loc.union(&end_loc);
    let associated_comments = parser.comments_store.create_comment_reference(concrete_comments);
    expr::Statement::Declaration(Box::new(expr::DeclarationStatement {
      loc,
      associated_comments,
      pattern,
      annotation,
      assigned_expression,
    }))
  }
}

mod pattern_parser {
  use super::super::lexer::{Keyword, Token, TokenContent, TokenOp};
  use samlang_ast::source::*;

  pub(super) fn parse_matching_pattern(
    parser: &mut super::SourceParser,
    starting_comments: Vec<Comment>,
  ) -> pattern::MatchingPattern<()> {
    let first_pattern = parse_single_matching_pattern(parser, starting_comments);
    if let Token(_, TokenContent::Operator(TokenOp::Bar)) = parser.peek() {
      let mut patterns = vec![first_pattern];
      while let Token(_, TokenContent::Operator(TokenOp::Bar)) = parser.peek() {
        drop(parser.consume());
        let next_pattern = parse_single_matching_pattern(parser, Vec::new());
        patterns.push(next_pattern);
      }
      let location = patterns.first().unwrap().loc().union(patterns.last().unwrap().loc());
      pattern::MatchingPattern::Or { location, patterns }
    } else {
      first_pattern
    }
  }

  fn parse_single_matching_pattern(
    parser: &mut super::SourceParser,
    mut starting_comments: Vec<Comment>,
  ) -> pattern::MatchingPattern<()> {
    let peeked = parser.peek();
    if let Token(_, TokenContent::Operator(TokenOp::LeftParenthesis)) = peeked {
      let mut p = parse_tuple_pattern(parser);
      p.start_associated_comments =
        super::utils::mod_associated_comments_with_additional_preceding_comments(
          parser,
          p.start_associated_comments,
          starting_comments,
        );
      return pattern::MatchingPattern::Tuple(p);
    }
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LeftBrace)) = peeked {
      starting_comments.append(&mut parser.consume());
      let destructured_names = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightBrace,
        &mut |s: &mut super::SourceParser, id_comments| {
          let field_name = s.parse_lower_id_with_comments(id_comments);
          let (pattern, loc, shorthand) =
            if let Token(_, TokenContent::Keyword(Keyword::As)) = s.peek() {
              let comments_before_as = s.consume();
              let nested = parse_matching_pattern(s, comments_before_as);
              let loc = field_name.loc.union(nested.loc());
              (Box::new(nested), loc, false)
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
      let (end_location, ending_comments) = parser.assert_and_consume_operator(TokenOp::RightBrace);
      return pattern::MatchingPattern::Object {
        location: peeked_loc.union(&end_location),
        start_associated_comments: parser
          .comments_store
          .create_comment_reference(starting_comments),
        ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
        elements: destructured_names,
      };
    }
    if let Token(peeked_loc, TokenContent::UpperId(id)) = peeked {
      starting_comments.append(&mut parser.consume());
      let tag = Id {
        loc: peeked_loc,
        associated_comments: parser.comments_store.create_comment_reference(starting_comments),
        name: id,
      };
      let (data_variables, loc) =
        if let Token(_, TokenContent::Operator(TokenOp::LeftParenthesis)) = parser.peek() {
          let tuple_patterns = parse_tuple_pattern(parser);
          let loc = peeked_loc.union(&tuple_patterns.location);
          (Some(tuple_patterns), loc)
        } else {
          (None, peeked_loc)
        };
      return pattern::MatchingPattern::Variant(pattern::VariantPattern {
        loc,
        tag_order: 0,
        tag,
        data_variables,
        type_: (),
      });
    }
    if let Token(location, TokenContent::Operator(TokenOp::Underscore)) = peeked {
      starting_comments.append(&mut parser.consume());
      return pattern::MatchingPattern::Wildcard {
        location,
        associated_comments: parser.comments_store.create_comment_reference(starting_comments),
      };
    };
    pattern::MatchingPattern::Id(parser.parse_lower_id(), ())
  }

  fn parse_tuple_pattern(parser: &mut super::SourceParser) -> pattern::TuplePattern<()> {
    let (start_loc, starting_comments) =
      parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    let destructured_names = parser.parse_comma_separated_list_with_end_token(
      TokenOp::RightParenthesis,
      &mut |s: &mut super::SourceParser, comments| pattern::TuplePatternElement {
        pattern: Box::new(parse_matching_pattern(s, comments)),
        type_: (),
      },
    );
    let (end_location, ending_comments) =
      parser.assert_and_consume_operator(TokenOp::RightParenthesis);
    pattern::TuplePattern {
      location: start_loc.union(&end_location),
      start_associated_comments: parser.comments_store.create_comment_reference(starting_comments),
      ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
      elements: destructured_names,
    }
  }
}

mod type_parser {
  use super::super::lexer::{Keyword, Token, TokenContent, TokenOp};
  use samlang_ast::source::{annotation::TypeArguments, *};

  pub(super) fn parse_type_parameters(
    parser: &mut super::SourceParser,
  ) -> Option<annotation::TypeParameters> {
    if let Token(start_loc, TokenContent::Operator(TokenOp::LessThan)) = parser.peek() {
      let start_comments = parser.consume();
      let mut parameters = parser.parse_comma_separated_list_with_end_token(
        TokenOp::GreaterThan,
        &mut super::type_parser::parse_type_parameter,
      );
      let (additional_loc, end_comments) = parser.assert_and_consume_operator(TokenOp::GreaterThan);
      let location = start_loc.union(&additional_loc);
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
    associated_comments: Vec<Comment>,
  ) -> annotation::TypeParameter {
    let name = parser.parse_upper_id_with_comments(associated_comments);
    let (bound, loc) = if let Token(_, TokenContent::Operator(TokenOp::Colon)) = parser.peek() {
      let id_comments = parser.consume();
      let id = parser.parse_upper_id_with_comments(id_comments);
      let bound = super::type_parser::parse_identifier_annot(parser, id);
      let loc = name.loc.union(&bound.location);
      (Some(bound), loc)
    } else {
      (None, name.loc)
    };
    annotation::TypeParameter { loc, name, bound }
  }

  pub(super) fn parse_annotated_id(
    parser: &mut super::SourceParser,
    associated_comments: Vec<Comment>,
  ) -> AnnotatedId<()> {
    let name = parser.parse_lower_id_with_comments(associated_comments);
    let annotation = parse_annotation_with_colon(parser);
    AnnotatedId { name, type_: (), annotation }
  }

  pub(super) fn parse_optionally_annotated_id(
    parser: &mut super::SourceParser,
    associated_comments: Vec<Comment>,
  ) -> OptionallyAnnotatedId<()> {
    let name = parser.parse_lower_id_with_comments(associated_comments);
    let annotation = parse_optional_annotation(parser);
    OptionallyAnnotatedId { name, type_: (), annotation }
  }

  pub(super) fn parse_optional_annotation(
    parser: &mut super::SourceParser,
  ) -> Option<annotation::T> {
    if let Token(_, TokenContent::Operator(TokenOp::Colon)) = parser.peek() {
      Some(parse_annotation_with_colon(parser))
    } else {
      None
    }
  }

  pub(super) fn parse_annotation(parser: &mut super::SourceParser) -> annotation::T {
    parse_annotation_with_additional_comments(parser, Vec::new())
  }

  pub(super) fn parse_annotation_with_colon(parser: &mut super::SourceParser) -> annotation::T {
    let (_, annotation_comments) = parser.assert_and_consume_operator(TokenOp::Colon);
    parse_annotation_with_additional_comments(parser, annotation_comments)
  }

  pub(super) fn parse_annotation_with_additional_comments(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> annotation::T {
    let peeked = parser.peek();
    match peeked.1 {
      TokenContent::Keyword(Keyword::Unit) => {
        associated_comments.append(&mut parser.consume());
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Unit,
        )
      }
      TokenContent::Keyword(Keyword::Bool) => {
        associated_comments.append(&mut parser.consume());
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Bool,
        )
      }
      TokenContent::Keyword(Keyword::Int) => {
        associated_comments.append(&mut parser.consume());
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Int,
        )
      }
      TokenContent::UpperId(name) => {
        associated_comments.append(&mut parser.consume());
        let associated_comments = parser.comments_store.create_comment_reference(Vec::new());
        let id_annot =
          parse_identifier_annot(parser, Id { loc: peeked.0, associated_comments, name });
        if id_annot.type_arguments.is_none() && parser.available_tparams.contains(&id_annot.id.name)
        {
          annotation::T::Generic(id_annot.location, id_annot.id)
        } else {
          annotation::T::Id(id_annot)
        }
      }
      TokenContent::Operator(TokenOp::LeftParenthesis) => {
        associated_comments.append(&mut parser.consume());
        let parameters =
          if let Token(_, TokenContent::Operator(TokenOp::RightParenthesis)) = parser.peek() {
            let (location, mut comments) = {
              let (loc, comments) = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
              (peeked.0.union(&loc), comments)
            };
            comments.append(&mut parser.assert_and_consume_operator(TokenOp::Arrow).1);
            annotation::ParenthesizedAnnotationList {
              location,
              start_associated_comments: NO_COMMENT_REFERENCE,
              ending_associated_comments: parser.comments_store.create_comment_reference(comments),
              annotations: Vec::with_capacity(0),
            }
          } else {
            let parameters = parser.parse_comma_separated_list_with_end_token(
              TokenOp::RightParenthesis,
              &mut parse_annotation_with_additional_comments,
            );
            let (additional_loc, mut comments) =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            let location = peeked.0.union(&additional_loc);
            let (_, mut additional_comments) = parser.assert_and_consume_operator(TokenOp::Arrow);
            comments.append(&mut additional_comments);
            annotation::ParenthesizedAnnotationList {
              location,
              start_associated_comments: NO_COMMENT_REFERENCE,
              ending_associated_comments: parser.comments_store.create_comment_reference(comments),
              annotations: parameters,
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
      if let Some(bound) = &mut tparam.bound
        && let Some(targs) = &mut bound.type_arguments
      {
        for annot in &mut targs.arguments {
          fix_annot_with_generic_annot(parser, annot);
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
        for annot in &mut t.parameters.annotations {
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
    let type_arguments = parse_optional_type_arguments(parser);
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

  pub(super) fn parse_optional_type_arguments(
    parser: &mut super::SourceParser,
  ) -> Option<TypeArguments> {
    if let Token(start_loc, TokenContent::Operator(TokenOp::LessThan)) = parser.peek() {
      let (_, start_associated_comments) = parser.assert_and_consume_operator(TokenOp::LessThan);
      let start_associated_comments =
        parser.comments_store.create_comment_reference(start_associated_comments);
      let arguments = parser.parse_comma_separated_list_with_end_token(
        TokenOp::GreaterThan,
        &mut parse_annotation_with_additional_comments,
      );
      let (end_loc, ending_associated_comments) =
        parser.assert_and_consume_operator(TokenOp::GreaterThan);
      let ending_associated_comments =
        parser.comments_store.create_comment_reference(ending_associated_comments);
      let location = start_loc.union(&end_loc);
      Some(annotation::TypeArguments {
        location,
        start_associated_comments,
        ending_associated_comments,
        arguments,
      })
    } else {
      None
    }
  }
}

mod utils {
  use samlang_ast::source::{Comment, CommentReference, CommentsNode};

  pub(super) fn mod_associated_comments_with_additional_preceding_comments(
    parser: &mut super::SourceParser,
    associated_comments: CommentReference,
    mut additional_preceding_comments: Vec<Comment>,
  ) -> CommentReference {
    match parser.comments_store.get_mut(associated_comments) {
      CommentsNode::NoComment => {
        parser.comments_store.create_comment_reference(additional_preceding_comments);
        associated_comments
      }
      CommentsNode::Comments(existing_comments) => {
        additional_preceding_comments.append(existing_comments);
        *existing_comments = additional_preceding_comments;
        associated_comments
      }
    }
  }

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
  use super::super::lexer::TokenProducer;
  use super::SourceParser;
  use samlang_errors::ErrorSet;
  use samlang_heap::{Heap, ModuleReference};
  use std::collections::HashSet;

  #[test]
  fn base_tests_1() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let token_producer = TokenProducer::new("", ModuleReference::DUMMY);
    let mut parser = SourceParser::new(
      token_producer,
      &mut heap,
      &mut error_set,
      ModuleReference::DUMMY,
      HashSet::new(),
    );

    // Empty stream: peek returns EOF, consume on exhausted stream works
    parser.assert_and_consume_identifier();
    let _ = parser.consume();
    parser.peek();
    // Repeated consume/peek on exhausted stream
    let _ = parser.consume();
    let _ = parser.consume();
    parser.peek();
  }

  #[test]
  fn base_tests_2() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    // Use an invalid token sequence to produce an error token
    let token_producer = TokenProducer::new("#ouch", ModuleReference::DUMMY);
    let mut parser = SourceParser::new(
      token_producer,
      &mut heap,
      &mut error_set,
      ModuleReference::DUMMY,
      HashSet::new(),
    );

    // Consume the error token, then exercise exhausted stream
    parser.peek();
    let _ = parser.consume();
    parser.peek();
    let _ = parser.consume();
    let _ = parser.consume();
    parser.peek();
  }

  #[test]
  fn base_tests_3() {
    let mut heap = Heap::new();
    let mut error_set = ErrorSet::new();
    let token_producer = TokenProducer::new("let // comment\nlet", ModuleReference::DUMMY);
    let mut parser = SourceParser::new(
      token_producer,
      &mut heap,
      &mut error_set,
      ModuleReference::DUMMY,
      HashSet::new(),
    );

    // Consume all tokens: first keyword, then second keyword (comment buffered automatically)
    let _ = parser.consume();
    let comments = parser.consume();
    assert_eq!(comments.len(), 1);
    // Now exhausted
    let _ = parser.consume();
  }

  fn with_source_robustness_tests(heap: &mut Heap, source: &str) {
    let mut error_set = ErrorSet::new();
    let token_producer = TokenProducer::new(source, ModuleReference::DUMMY);
    let mut parser = SourceParser::new(
      token_producer,
      heap,
      &mut error_set,
      ModuleReference::DUMMY,
      HashSet::new(),
    );

    super::pattern_parser::parse_matching_pattern(&mut parser, Vec::new());
    super::expression_parser::parse_expression(&mut parser);
    super::expression_parser::parse_statement(&mut parser);
    super::type_parser::parse_annotation(&mut parser);
    super::toplevel_parser::parse_class_member_definition(&mut parser);
    super::toplevel_parser::parse_class_member_declaration(&mut parser);
    super::parse_module(parser);
  }

  #[test]
  fn empty_robustness_tests() {
    with_source_robustness_tests(&mut Heap::new(), "");
  }

  #[test]
  fn error_robustness_tests() {
    with_source_robustness_tests(&mut Heap::new(), "#ouch");
  }
}
