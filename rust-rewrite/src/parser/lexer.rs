use crate::{
  ast::{Location, ModuleReference},
  common::{rc_string, Str},
  errors::ErrorSet,
};
use enum_iterator::{all, Sequence};

struct EOF();

mod char_stream {
  use super::EOF;
  use crate::ast::{Location, ModuleReference, Position};

  pub(super) struct CharacterStream {
    pub(super) line_num: i32,
    pub(super) col_num: i32,
    pos: usize,
    module_reference: ModuleReference,
    source: Vec<char>,
  }

  impl CharacterStream {
    pub(super) fn new(module_reference: ModuleReference, source: &str) -> CharacterStream {
      CharacterStream {
        line_num: 0,
        col_num: 0,
        pos: 0,
        module_reference,
        source: source.chars().collect(),
      }
    }

    fn advance_char(&mut self, c: char) {
      self.pos += 1;
      if c == '\n' {
        self.line_num += 1;
        self.col_num = 0;
      } else {
        self.col_num += 1;
      }
    }

    pub(super) fn current_pos(&self) -> Position {
      Position(self.line_num, self.col_num)
    }

    pub(super) fn consume_whitespace(&mut self) -> Result<(), EOF> {
      while self.pos < self.source.len() {
        let c = self.source[self.pos];
        if !c.is_ascii_whitespace() {
          return Result::Ok(());
        }
        self.advance_char(c)
      }
      Result::Err(EOF())
    }

    pub(super) fn consume_and_get_loc(&mut self, start: Position, length: usize) -> Location {
      let starting_pos = self.pos;
      for i in starting_pos..(starting_pos + length) {
        self.advance_char(self.source[i]);
      }
      Location { module_reference: self.module_reference.clone(), start, end: self.current_pos() }
    }

    pub(super) fn peek_until_whitespace(&self) -> String {
      let mut position = self.pos;
      while position < self.source.len() {
        if self.source[position].is_ascii_whitespace() {
          break;
        }
        position += 1;
      }
      self.source[self.pos..position].into_iter().collect()
    }

    pub(super) fn peek_next_constant_token(&self, token: &str) -> bool {
      let l = token.len();
      if self.pos + l > self.source.len() {
        return false;
      }
      self.source[self.pos..(self.pos + l)].into_iter().collect::<String>() == token
    }

    /// Returns comment string including // or null if it's not a line comment.
    pub(super) fn peek_line_comment(&self) -> Option<String> {
      if self.pos + 2 > self.source.len()
        || self.source[self.pos..(self.pos + 2)].into_iter().collect::<String>() != "//"
      {
        return Option::None;
      }
      let mut comment_length = 2;
      loop {
        if self.pos + comment_length >= self.source.len() {
          return Option::Some(
            self.source[self.pos..(self.pos + comment_length)].into_iter().collect(),
          );
        }
        let c = self.source[self.pos + comment_length];
        if c == '\n' {
          break;
        }
        comment_length += 1;
      }
      Option::Some(self.source[self.pos..(self.pos + comment_length)].into_iter().collect())
    }

    /// Returns comment string including /* or null if it's not a block comment.
    pub(super) fn peek_block_comment(&self) -> Option<String> {
      if self.pos + 2 > self.source.len()
        || self.source[self.pos..(self.pos + 2)].into_iter().collect::<String>() != "/*"
      {
        return Option::None;
      }
      let mut comment_length = 2;
      loop {
        if self.pos + comment_length >= self.source.len() {
          return Option::None;
        }
        if self.source[self.pos + comment_length] == '*'
          && self.source[self.pos + comment_length + 1] == '/'
        {
          break;
        }
        comment_length += 1;
      }
      comment_length += 2;
      Option::Some(self.source[self.pos..(self.pos + comment_length)].into_iter().collect())
    }

    pub(super) fn peek_int(&self) -> Option<String> {
      if *self.source.get(self.pos).unwrap_or(&'_') == '0' {
        return Option::Some("0".to_string());
      }
      let mut pos = self.pos;
      loop {
        let c = *self.source.get(pos).unwrap_or(&'a');
        if c.is_ascii_digit() {
          pos += 1;
        } else if pos == self.pos {
          return Option::None;
        } else {
          return Option::Some(self.source[self.pos..pos].into_iter().collect());
        }
      }
    }

    pub(super) fn peek_id(&self) -> Option<String> {
      if self.pos >= self.source.len() || !self.source[self.pos].is_ascii_alphabetic() {
        return Option::None;
      }
      let mut pos = self.pos + 1;
      loop {
        let c = *self.source.get(pos).unwrap_or(&' ');
        if c.is_ascii_alphanumeric() {
          pos += 1;
        } else {
          return Option::Some(self.source[self.pos..pos].into_iter().collect());
        }
      }
    }

    pub(super) fn peek_str(&self) -> Option<String> {
      if self.pos >= self.source.len() || self.source[self.pos] != '"' {
        return Option::None;
      }
      let mut pos = self.pos + 1;
      loop {
        if pos >= self.source.len() {
          return Option::None;
        }
        let c = self.source[pos];
        if c == '"' {
          let mut escape_count = 0;
          for i in ((self.pos + 1)..(pos)).rev() {
            if self.source[i] != '\\' {
              break;
            }
            escape_count += 1;
          }
          // We don't validate escaping here.
          if escape_count % 2 == 0 {
            // When there are even number of escapes, the quote is not escaped,
            // so it's the ending quote.
            return Option::Some(self.source[self.pos..(pos + 1)].into_iter().collect());
          }
        }
        if c == '\n' {
          return Option::None;
        }
        pos += 1;
      }
    }
  }
}

#[derive(Copy, Clone, PartialEq, Eq, Sequence)]
pub(super) enum Keyword {
  // Imports
  IMPORT,
  FROM,
  // Declarations
  CLASS,
  INTERFACE,
  VAL,
  FUNCTION,
  METHOD,
  AS,
  // Visibility modifiers
  PRIVATE,
  PROTECTED,
  INTERNAL,
  PUBLIC,
  // Control Flow
  IF,
  THEN,
  ELSE,
  MATCH,
  RETURN,
  // Type Keywords
  INT,
  STRING,
  BOOL,
  UNIT,
  // Some Important Literals
  TRUE,
  FALSE,
  THIS,
  // Forbidden Names
  SELF,
  CONST,
  LET,
  VAR,
  TYPE,
  CONSTRUCTOR,
  DESTRUCTOR,
  FUNCTOR,
  EXTENDS,
  IMPLEMENTS,
  EXPORTS,
  ASSERT,
}

impl ToString for Keyword {
  fn to_string(&self) -> String {
    match self {
      Keyword::IMPORT => "import",
      Keyword::FROM => "from",
      Keyword::CLASS => "class",
      Keyword::INTERFACE => "interface",
      Keyword::VAL => "val",
      Keyword::FUNCTION => "function",
      Keyword::METHOD => "method",
      Keyword::AS => "as",
      Keyword::PRIVATE => "private",
      Keyword::PROTECTED => "protected",
      Keyword::INTERNAL => "internal",
      Keyword::PUBLIC => "public",
      Keyword::IF => "if",
      Keyword::THEN => "then",
      Keyword::ELSE => "else",
      Keyword::MATCH => "match",
      Keyword::RETURN => "return",
      Keyword::INT => "int",
      Keyword::STRING => "string",
      Keyword::BOOL => "bool",
      Keyword::UNIT => "unit",
      Keyword::TRUE => "true",
      Keyword::FALSE => "false",
      Keyword::THIS => "this",
      Keyword::SELF => "self",
      Keyword::CONST => "const",
      Keyword::LET => "let",
      Keyword::VAR => "var",
      Keyword::TYPE => "type",
      Keyword::CONSTRUCTOR => "constructor",
      Keyword::DESTRUCTOR => "destructor",
      Keyword::FUNCTOR => "functor",
      Keyword::EXTENDS => "extends",
      Keyword::IMPLEMENTS => "implements",
      Keyword::EXPORTS => "exports",
      Keyword::ASSERT => "assert",
    }
    .to_string()
  }
}

#[derive(Copy, Clone, PartialEq, Eq, Sequence)]
pub(super) enum TokenOp {
  UNDERSCORE,
  // Parentheses
  LPAREN,
  RPAREN,
  LBRACE,
  RBRACE,
  LBRACKET,
  RBRACKET,
  // Separators
  QUESTION,
  SEMICOLON,
  COLON,
  COLONCOLON,
  COMMA,
  DOT,
  BAR,
  ARROW,
  // Operators
  ASSIGN,
  NOT,
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
  DOTDOTDOT,
}

impl ToString for TokenOp {
  fn to_string(&self) -> String {
    match self {
      TokenOp::UNDERSCORE => "_",
      TokenOp::LPAREN => "(",
      TokenOp::RPAREN => ")",
      TokenOp::LBRACE => "{",
      TokenOp::RBRACE => "}",
      TokenOp::LBRACKET => "[",
      TokenOp::RBRACKET => "]",
      TokenOp::QUESTION => "?",
      TokenOp::SEMICOLON => ";",
      TokenOp::COLON => ":",
      TokenOp::COLONCOLON => "::",
      TokenOp::COMMA => ",",
      TokenOp::DOT => ".",
      TokenOp::BAR => "|",
      TokenOp::ARROW => "->",
      TokenOp::ASSIGN => "=",
      TokenOp::NOT => "!",
      TokenOp::MUL => "*",
      TokenOp::DIV => "/",
      TokenOp::MOD => "%",
      TokenOp::PLUS => "+",
      TokenOp::MINUS => "-",
      TokenOp::LT => "<",
      TokenOp::LE => "<=",
      TokenOp::GT => ">",
      TokenOp::GE => ">=",
      TokenOp::EQ => "==",
      TokenOp::NE => "!=",
      TokenOp::AND => "&&",
      TokenOp::OR => "||",
      TokenOp::DOTDOTDOT => "...",
    }
    .to_string()
  }
}

#[derive(Clone)]
pub(super) enum TokenContent {
  Keyword(Keyword),
  Operator(TokenOp),
  EOF,
  UpperId(Str),
  LowerId(Str),
  StringLiteral(Str),
  IntLiteral(Str),
  LineComment(Str),
  BlockComment(Str),
  Error(Str),
}

impl ToString for TokenContent {
  fn to_string(&self) -> String {
    match self {
      TokenContent::Keyword(k) => k.to_string(),
      TokenContent::Operator(o) => o.to_string(),
      TokenContent::EOF => "EOF".to_string(),
      TokenContent::UpperId(id) => id.to_string(),
      TokenContent::LowerId(id) => id.to_string(),
      TokenContent::StringLiteral(s) => s.to_string(),
      TokenContent::IntLiteral(i) => i.to_string(),
      TokenContent::LineComment(c) => c.to_string(),
      TokenContent::BlockComment(c) => c.to_string(),
      TokenContent::Error(e) => format!("ERROR: {}", e),
    }
  }
}

#[derive(Clone)]
pub(super) struct Token(pub(super) Location, pub(super) TokenContent);

impl ToString for Token {
  fn to_string(&self) -> String {
    let Token(loc, content) = self;
    format!("{}: {}", loc.to_string(), content.to_string())
  }
}

fn string_has_valid_escape(s: &str) -> bool {
  let mut has_unprocessed_escape = false;
  for c in s.chars().into_iter() {
    if c == '\\' {
      has_unprocessed_escape = !has_unprocessed_escape;
      continue;
    }
    if has_unprocessed_escape {
      match c {
        't' | 'v' | '0' | 'b' | 'f' | 'n' | 'r' | '"' => {
          has_unprocessed_escape = false;
        }
        _ => return false,
      }
    }
  }
  return true;
}

fn get_next_token(
  stream: &mut char_stream::CharacterStream,
  error_set: &mut ErrorSet,
  known_sorted_operators: &Vec<TokenOp>,
) -> Option<Token> {
  match stream.consume_whitespace() {
    Result::Err(EOF()) => Option::None,
    Result::Ok(()) => {
      let start = stream.current_pos();

      if let Option::Some(s) = &stream.peek_line_comment() {
        return Option::Some(Token(
          stream.consume_and_get_loc(start, s.len()),
          TokenContent::LineComment(rc_string(s.clone())),
        ));
      }

      if let Option::Some(s) = &stream.peek_block_comment() {
        return Option::Some(Token(
          stream.consume_and_get_loc(start, s.len()),
          TokenContent::BlockComment(rc_string(s.clone())),
        ));
      }

      if let Option::Some(s) = &stream.peek_int() {
        return Option::Some(Token(
          stream.consume_and_get_loc(start, s.len()),
          TokenContent::IntLiteral(rc_string(s.clone())),
        ));
      }

      if let Option::Some(s) = &stream.peek_str() {
        let loc = stream.consume_and_get_loc(start, s.len());
        if !string_has_valid_escape(&s) {
          error_set.report_syntax_error(&loc, "Invalid escape in string.")
        }
        return Option::Some(Token(loc, TokenContent::StringLiteral(rc_string(s.clone()))));
      }

      if let Option::Some(s) = &stream.peek_id() {
        let loc = stream.consume_and_get_loc(start, s.len());
        if let Option::Some(k) = all::<Keyword>().find(|k| k.to_string() == s.to_string()) {
          return Option::Some(Token(loc, TokenContent::Keyword(k)));
        }
        let content = if s.chars().next().unwrap().is_ascii_uppercase() {
          TokenContent::UpperId(rc_string(s.clone()))
        } else {
          TokenContent::LowerId(rc_string(s.clone()))
        };
        return Option::Some(Token(loc, content));
      }

      for op in known_sorted_operators {
        let op_string = op.to_string();
        if stream.peek_next_constant_token(&op_string) {
          return Option::Some(Token(
            stream.consume_and_get_loc(start, op_string.len()),
            TokenContent::Operator(*op),
          ));
        }
      }

      let error_token_content = &stream.peek_until_whitespace();
      let error_loc = stream.consume_and_get_loc(start, error_token_content.len());
      error_set.report_syntax_error(&error_loc, "Invalid token.");
      return Option::Some(Token(
        error_loc,
        TokenContent::Error(rc_string(error_token_content.clone())),
      ));
    }
  }
}

pub(super) fn lex_source_program(
  source: &str,
  module_reference: ModuleReference,
  error_set: &mut ErrorSet,
) -> Vec<Token> {
  let mut stream = char_stream::CharacterStream::new(module_reference, source);
  let mut tokens: Vec<Token> = vec![];
  let mut known_sorted_operators = all::<TokenOp>().collect::<Vec<_>>();
  known_sorted_operators.sort_by(|a, b| b.to_string().len().cmp(&a.to_string().len()));

  loop {
    match get_next_token(&mut stream, error_set, &known_sorted_operators) {
      Option::None => return tokens,
      Option::Some(Token(loc, TokenContent::IntLiteral(s))) => {
        match s.parse::<i64>() {
          Result::Err(_) => {
            error_set.report_syntax_error(&loc, "Not a 32-bit integer.");
          }
          Result::Ok(i64) => {
            let maxi32_plus1 = (i32::MAX as i64) + 1;
            if i64 > maxi32_plus1 || (i64 == maxi32_plus1 && tokens.is_empty()) {
              error_set.report_syntax_error(&loc, "Not a 32-bit integer.");
            } else if i64 == maxi32_plus1 {
              let prev_index = tokens.len() - 1;
              match tokens.get(prev_index) {
                Option::Some(Token(prev_loc, TokenContent::Operator(TokenOp::MINUS))) => {
                  // Merge - and MAX_INT_PLUS_ONE into MIN_INT
                  tokens[prev_index] = Token(
                    prev_loc.union(&loc),
                    TokenContent::IntLiteral(rc_string(format!("-{}", s))),
                  );
                  continue;
                }
                _ => {}
              }
            }
          }
        };
        tokens.push(Token(loc, TokenContent::IntLiteral(s)));
      }
      Option::Some(t) => {
        tokens.push(t);
      }
    }
  }
}
