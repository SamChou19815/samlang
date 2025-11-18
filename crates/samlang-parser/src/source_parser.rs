use super::lexer::{Keyword, Token, TokenContent, TokenOp};
use samlang_ast::{Location, Position, source::*};
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
      Token(self.last_location(), TokenContent::EndOfFile)
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
    if TokenContent::Keyword(expected_kind) == content {
      self.consume();
      return location;
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

  fn parse_comma_separated_list_with_end_token<T, F: FnMut(&mut Self, Vec<Comment>) -> T>(
    &mut self,
    end_token: TokenOp,
    parser: &mut F,
  ) -> Vec<T> {
    let mut collector = vec![parser(self, Vec::new())];
    while let Token(_, TokenContent::Operator(op)) = self.peek() {
      if op != TokenOp::Comma {
        break;
      }
      let additional_comments = self.collect_preceding_comments();
      self.consume();
      if self.peek().1 == TokenContent::Operator(end_token) {
        return collector;
      }
      collector.push(parser(self, additional_comments));
    }
    collector
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

  fn parse_lower_id_with_comments(&mut self, mut associated_comments: Vec<Comment>) -> Id {
    associated_comments.append(&mut self.collect_preceding_comments());
    let (loc, name) = self.assert_and_peek_lower_id();
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

  fn collect_preceding_comments(&mut self) -> Vec<Comment> {
    self.unconsume_comments();
    let mut comments = Vec::new();
    loop {
      match self.simple_peek() {
        Token(_location, TokenContent::LineComment(text)) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::LINE, text });
        }
        Token(_location, TokenContent::BlockComment(text)) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::BLOCK, text })
        }
        Token(_location, TokenContent::DocComment(text)) => {
          self.consume();
          comments.push(Comment { kind: CommentKind::DOC, text })
        }
        _ => break,
      }
    }
    comments
  }
}

pub fn parse_module(mut parser: SourceParser) -> Module<()> {
  let mut imports = Vec::new();
  while let Token(import_start, TokenContent::Keyword(Keyword::Import)) = parser.peek() {
    let mut associated_comments = parser.collect_preceding_comments();
    parser.consume();
    associated_comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_operator(TokenOp::LeftBrace);
    let imported_members = parser.parse_comma_separated_list_with_end_token(
      TokenOp::RightBrace,
      &mut SourceParser::parse_upper_id_with_comments,
    );
    associated_comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_operator(TokenOp::RightBrace);
    associated_comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_keyword(Keyword::From);
    let import_loc_start = parser.peek().0;
    let imported_module_parts = {
      associated_comments.append(&mut parser.collect_preceding_comments());
      let mut collector = vec![parser.assert_and_consume_identifier().1];
      while let Token(_, TokenContent::Operator(TokenOp::Dot)) = parser.peek() {
        associated_comments.append(&mut parser.collect_preceding_comments());
        parser.consume();
        associated_comments.append(&mut parser.collect_preceding_comments());
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
      if let Token(semicolon_loc, TokenContent::Operator(TokenOp::Semicolon)) = parser.peek() {
        associated_comments.append(&mut parser.collect_preceding_comments());
        parser.consume();
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
  let trailing_comments = {
    let comments = parser.collect_preceding_comments();
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
    MAX_STRUCT_SIZE, MAX_VARIANT_SIZE,
  };
  use samlang_ast::{Location, source::*};
  use std::collections::HashSet;

  pub(super) fn parse_toplevel(parser: &mut super::SourceParser) -> Toplevel<()> {
    /*
    let (mut loc, private, associated_comments) =
      parse_private_interface_or_class_keyword(parser, Keyword::Class);
     */
    parser.unconsume_comments();
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
    (mut loc, private, associated_comments): (Location, bool, Vec<Comment>),
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
    let members_start_loc = parser.assert_and_consume_operator(TokenOp::LeftBrace);
    while let TokenContent::Keyword(Keyword::Function | Keyword::Method | Keyword::Private) =
      parser.peek().1
    {
      let saved_upper_type_parameters = parser.available_tparams.clone();
      members.push(parse_class_member_definition(parser));
      parser.available_tparams = saved_upper_type_parameters;
    }
    let ending_associated_comments = {
      let comments = parser.collect_preceding_comments();
      parser.comments_store.create_comment_reference(comments)
    };
    let end_loc = parser.assert_and_consume_operator(TokenOp::RightBrace);
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
    (mut loc, private, associated_comments): (Location, bool, Vec<Comment>),
  ) -> InterfaceDeclaration {
    let name = parser.parse_upper_id();
    parser.available_tparams = HashSet::new();
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    let extends_or_implements_nodes = parse_extends_or_implements_nodes(parser);
    let mut members = Vec::new();
    let members_start_loc = parser.assert_and_consume_operator(TokenOp::LeftBrace);
    while let TokenContent::Keyword(Keyword::Function | Keyword::Method | Keyword::Private) =
      parser.peek().1
    {
      let saved_upper_type_parameters = parser.available_tparams.clone();
      members.push(parse_class_member_declaration(parser));
      parser.available_tparams = saved_upper_type_parameters;
    }
    let ending_associated_comments = {
      let comments = parser.collect_preceding_comments();
      parser.comments_store.create_comment_reference(comments)
    };
    let end_loc = parser.assert_and_consume_operator(TokenOp::RightBrace);
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
      associated_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
      associated_comments.append(&mut parser.collect_preceding_comments());
      let is_interface = if matches!(parser.peek().1, TokenContent::Keyword(Keyword::Interface)) {
        parser.assert_and_consume_keyword(Keyword::Interface);
        true
      } else {
        parser.assert_and_consume_keyword(Keyword::Class);
        false
      };
      (loc, true, is_interface, associated_comments)
    } else {
      associated_comments.append(&mut parser.collect_preceding_comments());
      let (loc, is_interface) =
        if matches!(parser.peek().1, TokenContent::Keyword(Keyword::Interface)) {
          let loc = parser.assert_and_consume_keyword(Keyword::Interface);
          (loc, true)
        } else {
          let loc = parser.assert_and_consume_keyword(Keyword::Class);
          (loc, false)
        };
      (loc, false, is_interface, associated_comments)
    }
  }

  fn parse_extends_or_implements_nodes(
    parser: &mut super::SourceParser,
  ) -> Option<ExtendsOrImplementsNodes> {
    if let TokenContent::Operator(TokenOp::Colon) = parser.peek().1 {
      let comments = parser.collect_preceding_comments();
      let mut location = parser.assert_and_consume_operator(TokenOp::Colon);
      let id = parser.parse_upper_id();
      let mut nodes = vec![super::type_parser::parse_identifier_annot(parser, id)];
      while let Token(_, TokenContent::Operator(TokenOp::Comma)) = parser.peek() {
        let comments = parser.collect_preceding_comments();
        parser.consume();
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
    let start_comments = parser.collect_preceding_comments();
    let loc_start = parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    let end_comments = parser.collect_preceding_comments();
    if let Token(_, TokenContent::UpperId(_)) = parser.peek() {
      let mut variants = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut parse_variant_definition,
      );
      variants.truncate(MAX_VARIANT_SIZE);
      let loc_end = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
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
      let loc_end = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
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
      comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
    }
    comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_keyword(Keyword::Val);
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
      let start_comments = parser.collect_preceding_comments();
      parser.consume();
      let annotations = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut super::type_parser::parse_annotation_with_additional_comments,
      );

      if let Some(node) = annotations.get(MAX_VARIANT_SIZE) {
        parser.error_set.report_invalid_syntax_error(
          node.location(),
          format!("Maximum allowed field size is {MAX_VARIANT_SIZE}"),
        );
      }
      let end_comments = parser.collect_preceding_comments();
      let right_paren_loc = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
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
    let additional_comments = parser.collect_preceding_comments();
    parser.assert_and_consume_operator(TokenOp::Assign);
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
      associated_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
      peeked = parser.peek();
    }
    let start_loc = &peeked.0;
    if let Token(_, TokenContent::Keyword(Keyword::Function)) = &peeked {
      is_method = false;
      associated_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
    } else {
      associated_comments.append(&mut parser.collect_preceding_comments());
      parser.assert_and_consume_keyword(Keyword::Method);
    }
    if !is_method {
      parser.available_tparams = HashSet::new();
    }
    let type_parameters = super::type_parser::parse_type_parameters(parser);
    parser
      .available_tparams
      .extend(type_parameters.iter().flat_map(|it| &it.parameters).map(|it| it.name.name));
    let name = parser.parse_lower_id();
    let parameters_start_comments = parser.collect_preceding_comments();
    let fun_type_loc_start = parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    let parameters = if let TokenContent::Operator(TokenOp::RightParenthesis) = parser.peek().1 {
      Vec::new()
    } else {
      parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightParenthesis,
        &mut super::type_parser::parse_annotated_id,
      )
    };
    let parameters_end_comments = parser.collect_preceding_comments();
    let parameters_end_loc = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
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
    let mut associated_comments = parser.collect_preceding_comments();
    if let Token(peeked_loc, TokenContent::Keyword(Keyword::Match)) = parser.peek() {
      parser.consume();
      let match_expression = parse_expression(parser);
      associated_comments.append(&mut parser.collect_preceding_comments());
      parser.assert_and_consume_operator(TokenOp::LeftBrace);
      let mut matching_list = vec![parse_pattern_to_expression(parser)];
      while matches!(
        parser.peek().1,
        TokenContent::Operator(TokenOp::LeftBrace | TokenOp::LeftParenthesis | TokenOp::Underscore)
          | TokenContent::LowerId(_)
          | TokenContent::UpperId(_)
      ) {
        matching_list.push(parse_pattern_to_expression(parser));
      }
      associated_comments.append(&mut parser.collect_preceding_comments());
      let loc = peeked_loc.union(&parser.assert_and_consume_operator(TokenOp::RightBrace));
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
    let additional_comments = parser.collect_preceding_comments();
    parser.assert_and_consume_operator(TokenOp::Arrow);
    let expression =
      parse_expression_with_additional_preceding_comments(parser, additional_comments);
    let (loc, ending_associated_comments) =
      if matches!(parser.peek().1, TokenContent::Operator(TokenOp::RightBrace)) {
        (pattern.loc().union(&expression.loc()), NO_COMMENT_REFERENCE)
      } else {
        let comments = parser.collect_preceding_comments();
        (
          pattern.loc().union(&parser.assert_and_consume_operator(TokenOp::Comma)),
          parser.comments_store.create_comment_reference(comments),
        )
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
    associated_comments.append(&mut parser.collect_preceding_comments());
    let peeked_loc = parser.assert_and_consume_keyword(Keyword::If);
    let condition =
      if let Token(_peeked_let_loc, TokenContent::Keyword(Keyword::Let)) = parser.peek() {
        associated_comments.append(&mut parser.collect_preceding_comments());
        parser.consume();
        let pattern = super::pattern_parser::parse_matching_pattern(parser, Vec::new());
        associated_comments.append(&mut parser.collect_preceding_comments());
        parser.assert_and_consume_operator(TokenOp::Assign);
        let expr = parse_expression(parser);
        expr::IfElseCondition::Guard(pattern, expr)
      } else {
        expr::IfElseCondition::Expression(parse_expression(parser))
      };
    let e1 = parse_block(parser, Vec::new());
    let e2_preceding_comments = parser.collect_preceding_comments();
    parser.assert_and_consume_keyword(Keyword::Else);
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
    let mut e = parse_conjunction(parser);
    while let TokenContent::Operator(TokenOp::Or) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
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
    let mut e = parse_comparison(parser);
    while let TokenContent::Operator(TokenOp::And) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
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
    let mut e = parse_term(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::LessThan) => expr::BinaryOperator::LT,
        TokenContent::Operator(TokenOp::LessThanOrEqual) => expr::BinaryOperator::LE,
        TokenContent::Operator(TokenOp::GreaterThan) => expr::BinaryOperator::GT,
        TokenContent::Operator(TokenOp::GreaterThanOrEqual) => expr::BinaryOperator::GE,
        TokenContent::Operator(TokenOp::Equal) => expr::BinaryOperator::EQ,
        TokenContent::Operator(TokenOp::NotEqual) => expr::BinaryOperator::NE,
        _ => break,
      };
      parser.consume();
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
    let mut e = parse_factor(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::Plus) => expr::BinaryOperator::PLUS,
        TokenContent::Operator(TokenOp::Minus) => expr::BinaryOperator::MINUS,
        _ => break,
      };
      parser.consume();
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
    let mut e = parse_concat(parser);
    loop {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      let operator = match parser.peek().1 {
        TokenContent::Operator(TokenOp::Multiply) => expr::BinaryOperator::MUL,
        TokenContent::Operator(TokenOp::Divide) => expr::BinaryOperator::DIV,
        TokenContent::Operator(TokenOp::Mod) => expr::BinaryOperator::MOD,
        _ => break,
      };
      parser.consume();
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
    let mut e = parse_unary_expression(parser);
    while let TokenContent::Operator(TokenOp::ColonColon) = parser.peek().1 {
      let concrete_comments = parser.collect_preceding_comments();
      let operator_preceding_comments =
        parser.comments_store.create_comment_reference(concrete_comments);
      parser.consume();
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
    let associated_comments = parser.collect_preceding_comments();
    let Token(peeked_loc, content) = parser.peek();
    match content {
      TokenContent::Operator(TokenOp::Not) => {
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
      TokenContent::Operator(TokenOp::Minus) => {
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
        Token(dot_loc, TokenContent::Operator(TokenOp::Dot)) => {
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

  fn parse_base_expression(parser: &mut super::SourceParser) -> expr::E<()> {
    if let Some(e) = parse_base_expression_single_token(parser) {
      return e;
    }

    // Lambda or tuple or nested expression
    if let Token(peeked_loc, TokenContent::Operator(TokenOp::LeftParenthesis)) = parser.peek() {
      let associated_comments = parser.collect_preceding_comments();
      parser.consume();
      // () -> ...
      if let Token(right_parenthesis_loc, TokenContent::Operator(TokenOp::RightParenthesis)) =
        parser.peek()
      {
        let mut ending_comments = parser.collect_preceding_comments();
        parser.consume();
        ending_comments.append(&mut parser.collect_preceding_comments());
        parser.assert_and_consume_operator(TokenOp::Arrow);
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
      if let Token(loc_id_for_lambda, TokenContent::LowerId(id_for_lambda)) = parser.peek() {
        parser.consume();
        let next = parser.peek();
        match next.1 {
          // (id: ... definitely a lambda
          TokenContent::Operator(TokenOp::Colon) => {
            parser.unconsume();
            let parameters = parser.parse_comma_separated_list_with_end_token(
              TokenOp::RightParenthesis,
              &mut super::type_parser::parse_optionally_annotated_id,
            );
            let mut ending_comments = parser.collect_preceding_comments();
            let right_parenthesis_loc =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            ending_comments.append(&mut parser.collect_preceding_comments());
            let parameters = expr::LambdaParameters {
              loc: peeked_loc.union(&right_parenthesis_loc),
              parameters,
              ending_associated_comments: parser
                .comments_store
                .create_comment_reference(ending_comments),
            };
            parser.assert_and_consume_operator(TokenOp::Arrow);
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
            parser.unconsume();
            // Advance as far as possible for a comma separated lower id.
            // This is common for both arrow function and tuple.
            let mut parameters_or_tuple_elements_cover = vec![parser.parse_lower_id()];
            while let Token(_, TokenContent::Operator(TokenOp::Comma)) = parser.peek() {
              parser.consume();
              if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
                parser.consume();
                match parser.peek() {
                  Token(_, TokenContent::Operator(TokenOp::Comma))
                  | Token(_, TokenContent::Operator(TokenOp::RightParenthesis)) => {
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
            if let Token(right_parenthesis_loc, TokenContent::Operator(TokenOp::RightParenthesis)) =
              parser.peek()
            {
              let mut comments_before_rparen = parser.collect_preceding_comments();
              parser.consume();
              if let Token(_, TokenContent::Operator(TokenOp::Arrow)) = parser.peek() {
                comments_before_rparen.append(&mut parser.collect_preceding_comments());
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
            if let Token(_, TokenContent::LowerId(_)) = parser.peek() {
              parser.consume();
              if let Token(_, TokenContent::Operator(TokenOp::Colon)) = parser.peek() {
                parser.unconsume();
                let rest_parameters = parser.parse_comma_separated_list_with_end_token(
                  TokenOp::RightParenthesis,
                  &mut super::type_parser::parse_optionally_annotated_id,
                );
                let parameters = parameters_or_tuple_elements_cover
                  .into_iter()
                  .map(|name| OptionallyAnnotatedId { name, type_: (), annotation: None })
                  .chain(rest_parameters)
                  .collect_vec();
                let mut ending_comments = parser.collect_preceding_comments();
                let right_parenthesis_loc =
                  parser.assert_and_consume_operator(TokenOp::RightParenthesis);
                ending_comments.append(&mut parser.collect_preceding_comments());
                parser.assert_and_consume_operator(TokenOp::Arrow);
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
              parser.unconsume();
            }
            let rest_tuple_elements = parser.parse_comma_separated_list_with_end_token(
              TokenOp::RightParenthesis,
              &mut parse_expression_with_additional_preceding_comments,
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
              parser.error_set.report_invalid_syntax_error(
                node.loc(),
                format!("Maximum allowed tuple size is {MAX_STRUCT_SIZE}"),
              );
            }
            tuple_elements.truncate(MAX_STRUCT_SIZE);
            let end_comments = parser.collect_preceding_comments();
            let end_loc = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            let loc = peeked_loc.union(&end_loc);
            let common =
              expr::ExpressionCommon { loc, associated_comments: NO_COMMENT_REFERENCE, type_: () };
            debug_assert!(tuple_elements.len() > 1);
            return expr::E::Tuple(
              common,
              expr::ParenthesizedExpressionList {
                loc,
                start_associated_comments: parser
                  .comments_store
                  .create_comment_reference(associated_comments),
                ending_associated_comments: parser
                  .comments_store
                  .create_comment_reference(end_comments),
                expressions: tuple_elements,
              },
            );
          }
          // (id) -> ... OR (id)
          TokenContent::Operator(TokenOp::RightParenthesis) => {
            let mut ending_comments = parser.collect_preceding_comments();
            let right_parenthesis_loc =
              parser.assert_and_consume_operator(TokenOp::RightParenthesis);
            if let Token(_, TokenContent::Operator(TokenOp::Arrow)) = parser.peek() {
              ending_comments.append(&mut parser.collect_preceding_comments());
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
                parameters: expr::LambdaParameters {
                  loc: peeked_loc.union(&right_parenthesis_loc),
                  parameters: vec![OptionallyAnnotatedId {
                    name: Id {
                      loc: loc_id_for_lambda,
                      associated_comments: parser
                        .comments_store
                        .create_comment_reference(Vec::new()),
                      name: id_for_lambda,
                    },
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
              // (id)
              parser.unconsume();
            }
          }
          _ => {}
        }
        parser.unconsume();
      }
      parser.unconsume();
      let mut expressions_list = parse_parenthesized_expression_list(parser, MAX_STRUCT_SIZE);
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

    let associated_comments = parser.collect_preceding_comments();
    let peeked = parser.peek();
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

  fn parse_base_expression_single_token(parser: &mut super::SourceParser) -> Option<expr::E<()>> {
    match parser.peek() {
      Token(peeked_loc, TokenContent::Keyword(Keyword::True)) => {
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
        let associated_comments = parser.collect_preceding_comments();
        parser.consume();
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
    let starting_comments = parser.collect_preceding_comments();
    let start_loc = parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
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
    let ending_comments = parser.collect_preceding_comments();
    let end_loc = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
    let loc = start_loc.union(&end_loc);
    expr::ParenthesizedExpressionList {
      loc,
      start_associated_comments: parser.comments_store.create_comment_reference(starting_comments),
      ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
      expressions,
    }
  }

  fn parse_block(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> expr::Block<()> {
    associated_comments.append(&mut parser.collect_preceding_comments());
    let start_loc = parser.assert_and_consume_operator(TokenOp::LeftBrace);

    let mut statements = Vec::new();
    while let Token(_, TokenContent::Keyword(Keyword::Let)) = parser.peek() {
      statements.push(parse_statement(parser));
    }

    if let Token(end_loc, TokenContent::Operator(TokenOp::RightBrace)) = parser.peek() {
      let ending_comments = parser.collect_preceding_comments();
      // No final expression
      parser.consume();
      let loc = start_loc.union(&end_loc);
      expr::Block {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        statements,
        expression: None,
        ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
      }
    } else {
      // Has final expression
      let expression = parse_expression(parser);
      let ending_comments = parser.collect_preceding_comments();
      let loc = start_loc.union(&parser.assert_and_consume_operator(TokenOp::RightBrace));
      expr::Block {
        common: expr::ExpressionCommon {
          loc,
          associated_comments: parser.comments_store.create_comment_reference(associated_comments),
          type_: (),
        },
        statements,
        expression: Some(Box::new(expression)),
        ending_associated_comments: parser.comments_store.create_comment_reference(ending_comments),
      }
    }
  }

  pub(super) fn parse_statement(
    parser: &mut super::SourceParser,
  ) -> expr::DeclarationStatement<()> {
    let mut concrete_comments = parser.collect_preceding_comments();
    let start_loc = parser.assert_and_consume_keyword(Keyword::Let);
    let pattern = super::pattern_parser::parse_matching_pattern(parser, Vec::new());
    let annotation = if let Token(_, TokenContent::Operator(TokenOp::Colon)) = parser.peek() {
      Some(super::type_parser::parse_annotation_with_colon(parser))
    } else {
      None
    };
    concrete_comments.append(&mut parser.collect_preceding_comments());
    parser.assert_and_consume_operator(TokenOp::Assign);
    let assigned_expression = Box::new(parse_expression(parser));
    concrete_comments.append(&mut parser.collect_preceding_comments());
    let loc = start_loc.union(&parser.assert_and_consume_operator(TokenOp::Semicolon));
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

  pub(super) fn parse_matching_pattern(
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
      starting_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
      let destructured_names = parser.parse_comma_separated_list_with_end_token(
        TokenOp::RightBrace,
        &mut |s: &mut super::SourceParser, id_comments| {
          let field_name = s.parse_lower_id_with_comments(id_comments);
          let (pattern, loc, shorthand) =
            if let Token(_, TokenContent::Keyword(Keyword::As)) = s.peek() {
              let comments_before_as = s.collect_preceding_comments();
              s.consume();
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
      let ending_comments = parser.collect_preceding_comments();
      let end_location = parser.assert_and_consume_operator(TokenOp::RightBrace);
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
      starting_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
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
      starting_comments.append(&mut parser.collect_preceding_comments());
      parser.consume();
      return pattern::MatchingPattern::Wildcard {
        location,
        associated_comments: parser.comments_store.create_comment_reference(starting_comments),
      };
    };
    pattern::MatchingPattern::Id(parser.parse_lower_id(), ())
  }

  fn parse_tuple_pattern(parser: &mut super::SourceParser) -> pattern::TuplePattern<()> {
    let starting_comments = parser.collect_preceding_comments();
    let start_loc = parser.assert_and_consume_operator(TokenOp::LeftParenthesis);
    let destructured_names = parser.parse_comma_separated_list_with_end_token(
      TokenOp::RightParenthesis,
      &mut |s: &mut super::SourceParser, comments| pattern::TuplePatternElement {
        pattern: Box::new(parse_matching_pattern(s, comments)),
        type_: (),
      },
    );
    let ending_comments = parser.collect_preceding_comments();
    let end_location = parser.assert_and_consume_operator(TokenOp::RightParenthesis);
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
      let start_comments = parser.collect_preceding_comments();
      parser.consume();
      let mut parameters = parser.parse_comma_separated_list_with_end_token(
        TokenOp::GreaterThan,
        &mut super::type_parser::parse_type_parameter,
      );
      let end_comments = parser.collect_preceding_comments();
      let location = start_loc.union(&parser.assert_and_consume_operator(TokenOp::GreaterThan));
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
      let id_comments = parser.collect_preceding_comments();
      parser.consume();
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

  fn parse_optional_annotation(parser: &mut super::SourceParser) -> Option<annotation::T> {
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
    let annotation_comments = parser.collect_preceding_comments();
    parser.assert_and_consume_operator(TokenOp::Colon);
    parse_annotation_with_additional_comments(parser, annotation_comments)
  }

  pub(super) fn parse_annotation_with_additional_comments(
    parser: &mut super::SourceParser,
    mut associated_comments: Vec<Comment>,
  ) -> annotation::T {
    associated_comments.append(&mut parser.collect_preceding_comments());
    let peeked = parser.peek();
    match peeked.1 {
      TokenContent::Keyword(Keyword::Unit) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Unit,
        )
      }
      TokenContent::Keyword(Keyword::Bool) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Bool,
        )
      }
      TokenContent::Keyword(Keyword::Int) => {
        parser.consume();
        annotation::T::Primitive(
          peeked.0,
          parser.comments_store.create_comment_reference(associated_comments),
          annotation::PrimitiveTypeKind::Int,
        )
      }
      TokenContent::UpperId(name) => {
        parser.consume();
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
        parser.consume();
        let parameters =
          if let Token(_, TokenContent::Operator(TokenOp::RightParenthesis)) = parser.peek() {
            let mut comments = parser.collect_preceding_comments();
            let location =
              peeked.0.union(&parser.assert_and_consume_operator(TokenOp::RightParenthesis));
            comments.append(&mut parser.collect_preceding_comments());
            parser.assert_and_consume_operator(TokenOp::Arrow);
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
            let mut comments = parser.collect_preceding_comments();
            let location =
              peeked.0.union(&parser.assert_and_consume_operator(TokenOp::RightParenthesis));
            comments.append(&mut parser.collect_preceding_comments());
            parser.assert_and_consume_operator(TokenOp::Arrow);
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
      let start_associated_comments = {
        let comments = parser.collect_preceding_comments();
        parser.comments_store.create_comment_reference(comments)
      };
      parser.assert_and_consume_operator(TokenOp::LessThan);
      let arguments = parser.parse_comma_separated_list_with_end_token(
        TokenOp::GreaterThan,
        &mut parse_annotation_with_additional_comments,
      );
      let ending_associated_comments = {
        let comments = parser.collect_preceding_comments();
        parser.comments_store.create_comment_reference(comments)
      };
      let location = start_loc.union(&parser.assert_and_consume_operator(TokenOp::GreaterThan));
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
    let mut parser = SourceParser::new(
      Vec::new(),
      &mut heap,
      &mut error_set,
      ModuleReference::DUMMY,
      HashSet::new(),
    );

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
    with_tokens_robustness_tests(&mut Heap::new(), Vec::new());
  }

  #[test]
  fn error_robustness_tests() {
    let heap = &mut Heap::new();
    let tokens =
      vec![Token(Location::dummy(), TokenContent::Error(heap.alloc_str_for_test("ouch")))];
    with_tokens_robustness_tests(heap, tokens);
  }
}
