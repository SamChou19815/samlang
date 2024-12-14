use phf::phf_map;
use samlang_ast::Location;
use samlang_errors::ErrorSet;
use samlang_heap::{Heap, ModuleReference, PStr};

mod char_stream {
  use crate::ModuleReference;
  use itertools::Itertools;
  use samlang_ast::{Location, Position};

  pub(super) struct CharacterStream<'a> {
    pub(super) line_num: i32,
    pub(super) col_num: i32,
    pos: usize,
    module_reference: ModuleReference,
    source: &'a [u8],
  }

  impl<'a> CharacterStream<'a> {
    pub(super) fn new(module_reference: ModuleReference, source: &str) -> CharacterStream {
      CharacterStream {
        line_num: 0,
        col_num: 0,
        pos: 0,
        module_reference,
        source: source.as_bytes(),
      }
    }

    fn advance_char(&mut self, c: u8) {
      self.pos += 1;
      if c == b'\n' {
        self.line_num += 1;
        self.col_num = 0;
      } else {
        self.col_num += 1;
      }
    }

    /// Returns whether we actually consumed something
    pub(super) fn consume_whitespace(&mut self) -> bool {
      while self.pos < self.source.len() {
        let c = self.source[self.pos];
        if !c.is_ascii_whitespace() {
          return true;
        }
        self.advance_char(c)
      }
      false
    }

    pub(super) fn consume_and_get_loc(&mut self, length: usize) -> Location {
      let start_position = Position(self.line_num, self.col_num);
      let starting_pos = self.pos;
      for i in starting_pos..(starting_pos + length) {
        self.advance_char(self.source[i]);
      }
      Location {
        module_reference: self.module_reference,
        start: start_position,
        end: Position(self.line_num, self.col_num),
      }
    }

    pub(super) fn consume_until_whitespace(&mut self) -> (Location, String) {
      let mut position = self.pos;
      while position < self.source.len() {
        if self.source[position].is_ascii_whitespace() {
          break;
        }
        position += 1;
      }
      let string = String::from_utf8(self.source[self.pos..position].to_vec()).unwrap();
      (self.consume_and_get_loc(position - self.pos), string)
    }

    pub(super) fn consume_opt_next_constant_token(&mut self, token: &str) -> Option<Location> {
      let l = token.len();
      if self.pos + l > self.source.len() {
        return None;
      }
      if token.as_bytes().eq(&self.source[self.pos..(self.pos + l)]) {
        let loc = self.consume_and_get_loc(l);
        Some(loc)
      } else {
        None
      }
    }

    /// Returns comment string including // or null if it's not a line comment.
    pub(super) fn consume_line_comment_opt(&mut self) -> Option<(Location, String)> {
      if self.pos + 2 > self.source.len()
        || self.source[self.pos..(self.pos + 2)].ne("//".as_bytes())
      {
        return Option::None;
      }
      let mut comment_length = 2;
      loop {
        if self.pos + comment_length >= self.source.len() {
          break;
        }
        let c = self.source[self.pos + comment_length];
        if c == b'\n' {
          break;
        }
        comment_length += 1;
      }
      let string =
        String::from_utf8_lossy(&self.source[(self.pos + 2)..(self.pos + comment_length)])
          .trim()
          .to_string();
      let loc = self.consume_and_get_loc(comment_length);
      Option::Some((loc, string))
    }

    fn post_process_block_comment(block_comment: &str) -> String {
      block_comment
        .split('\n')
        .map(|line| {
          let l = line.trim_start();
          if l.starts_with('*') {
            l.chars().skip(1).collect::<String>().trim().to_string()
          } else {
            l.trim_end().to_string()
          }
        })
        .filter(|line| !line.is_empty())
        .join(" ")
    }

    /// Returns comment string including /* or null if it's not a block comment.
    pub(super) fn consume_opt_block_comment(&mut self) -> Option<(bool, Location, String)> {
      if self.pos + 2 > self.source.len()
        || self.source[self.pos..(self.pos + 2)].ne("/*".as_bytes())
      {
        return Option::None;
      }
      let mut comment_length = 2;
      loop {
        if self.pos + comment_length >= self.source.len() {
          return Option::None;
        }
        if self.source[self.pos + comment_length] == b'*'
          && self.source[self.pos + comment_length + 1] == b'/'
        {
          break;
        }
        comment_length += 1;
      }
      comment_length += 2;
      let loc = self.consume_and_get_loc(comment_length);
      let chars = &self.source[(self.pos - comment_length)..(self.pos)];
      if chars[2] == b'*' {
        Option::Some((
          true,
          loc,
          Self::post_process_block_comment(&String::from_utf8_lossy(&chars[3..(chars.len() - 2)])),
        ))
      } else {
        Option::Some((
          false,
          loc,
          Self::post_process_block_comment(&String::from_utf8_lossy(&chars[2..(chars.len() - 2)])),
        ))
      }
    }

    pub(super) fn consume_opt_int(&mut self) -> Option<(Location, String)> {
      if *self.source.get(self.pos).unwrap_or(&b'_') == b'0' {
        let loc = self.consume_and_get_loc(1);
        return Option::Some((loc, "0".to_string()));
      }
      let mut pos = self.pos;
      loop {
        let c = *self.source.get(pos).unwrap_or(&b'a');
        if c.is_ascii_digit() {
          pos += 1;
        } else if pos == self.pos {
          return Option::None;
        } else {
          let string = String::from_utf8(self.source[self.pos..pos].to_vec()).unwrap();
          let loc = self.consume_and_get_loc(pos - self.pos);
          return Option::Some((loc, string));
        }
      }
    }

    pub(super) fn consume_opt_id(&mut self) -> Option<(Location, String)> {
      if self.pos >= self.source.len() || !self.source[self.pos].is_ascii_alphabetic() {
        return Option::None;
      }
      let mut pos = self.pos + 1;
      loop {
        let c = *self.source.get(pos).unwrap_or(&b' ');
        if c.is_ascii_alphanumeric() {
          pos += 1;
        } else {
          let string = String::from_utf8(self.source[self.pos..pos].to_vec()).unwrap();
          let loc = self.consume_and_get_loc(pos - self.pos);
          return Option::Some((loc, string));
        }
      }
    }

    pub(super) fn consume_str_opt(&mut self) -> Option<(Location, String)> {
      if self.pos >= self.source.len() || (self.source[self.pos]) != b'"' {
        return Option::None;
      }
      let mut pos = self.pos + 1;
      loop {
        if pos >= self.source.len() {
          return Option::None;
        }
        let c = self.source[pos];
        if c == b'"' {
          let mut escape_count = 0;
          for i in ((self.pos + 1)..(pos)).rev() {
            if (self.source[i]) != b'\\' {
              break;
            }
            escape_count += 1;
          }
          // We don't validate escaping here.
          if escape_count % 2 == 0 {
            let string = String::from_utf8(self.source[self.pos..(pos + 1)].to_vec()).unwrap();
            // When there are even number of escapes, the quote is not escaped,
            // so it's the ending quote.
            let loc = self.consume_and_get_loc(pos + 1 - self.pos);
            return Option::Some((loc, string));
          }
        }
        if c == b'\n' {
          return Option::None;
        }
        pos += 1;
      }
    }
  }
}

#[derive(Copy, Clone, PartialEq, Eq)]
pub(super) enum Keyword {
  // Imports
  Import,
  From,
  // Declarations
  Class,
  Interface,
  Val,
  Function,
  Method,
  As,
  // Visibility modifiers
  Private,
  Protected,
  Internal,
  Public,
  // Control Flow
  If,
  Then,
  Else,
  Match,
  Return,
  // Type Keywords
  Int,
  Bool,
  Unit,
  // Some Important Literals
  True,
  False,
  This,
  // Forbidden Names
  SelfReserved,
  Const,
  String,
  Let,
  Var,
  Type,
  Constructor,
  Destructor,
  Extends,
  Implements,
  Exports,
  Assert,
}

impl Keyword {
  pub(super) const fn as_str(&self) -> &'static str {
    match self {
      Keyword::Import => "import",
      Keyword::From => "from",
      Keyword::Class => "class",
      Keyword::Interface => "interface",
      Keyword::Val => "val",
      Keyword::Function => "function",
      Keyword::Method => "method",
      Keyword::As => "as",
      Keyword::Private => "private",
      Keyword::Protected => "protected",
      Keyword::Internal => "internal",
      Keyword::Public => "public",
      Keyword::If => "if",
      Keyword::Then => "then",
      Keyword::Else => "else",
      Keyword::Match => "match",
      Keyword::Return => "return",
      Keyword::Int => "int",
      Keyword::String => "string",
      Keyword::Bool => "bool",
      Keyword::Unit => "unit",
      Keyword::True => "true",
      Keyword::False => "false",
      Keyword::This => "this",
      Keyword::SelfReserved => "self",
      Keyword::Const => "const",
      Keyword::Let => "let",
      Keyword::Var => "var",
      Keyword::Type => "type",
      Keyword::Constructor => "constructor",
      Keyword::Destructor => "destructor",
      Keyword::Extends => "extends",
      Keyword::Implements => "implements",
      Keyword::Exports => "exports",
      Keyword::Assert => "assert",
    }
  }
}

static KEYWORDS: phf::Map<&'static str, Keyword> = phf_map! {
  "import" => Keyword::Import,
  "from" => Keyword::From,
  "class" => Keyword::Class,
  "interface" => Keyword::Interface,
  "val" => Keyword::Val,
  "function" => Keyword::Function,
  "method" => Keyword::Method,
  "as" => Keyword::As,
  "private" => Keyword::Private,
  "protected" => Keyword::Protected,
  "internal" => Keyword::Internal,
  "public" => Keyword::Public,
  "if" => Keyword::If,
  "then" => Keyword::Then,
  "else" => Keyword::Else,
  "match" => Keyword::Match,
  "return" => Keyword::Return,
  "int" => Keyword::Int,
  "string" => Keyword::String,
  "bool" => Keyword::Bool,
  "unit" => Keyword::Unit,
  "true" => Keyword::True,
  "false" => Keyword::False,
  "this" => Keyword::This,
  "self" => Keyword::SelfReserved,
  "const" => Keyword::Const,
  "let" => Keyword::Let,
  "var" => Keyword::Var,
  "type" => Keyword::Type,
  "constructor" => Keyword::Constructor,
  "destructor" => Keyword::Destructor,
  "extends" => Keyword::Extends,
  "implements" => Keyword::Implements,
  "exports" => Keyword::Exports,
  "assert" => Keyword::Assert,
};

static TOKEN_OPS: [TokenOp; 31] = [
  TokenOp::Underscore,
  TokenOp::LeftParenthesis,
  TokenOp::RightParenthesis,
  TokenOp::LeftBrace,
  TokenOp::RightBrace,
  TokenOp::LeftBracket,
  TokenOp::RightBracket,
  TokenOp::Question,
  TokenOp::Semicolon,
  TokenOp::Colon,
  TokenOp::ColonColon,
  TokenOp::Comma,
  TokenOp::Dot,
  TokenOp::Bar,
  TokenOp::Arrow,
  TokenOp::Assign,
  TokenOp::Not,
  TokenOp::Multiply,
  TokenOp::Divide,
  TokenOp::Mod,
  TokenOp::Plus,
  TokenOp::Minus,
  TokenOp::LessThan,
  TokenOp::LessThanOrEqual,
  TokenOp::GreaterThan,
  TokenOp::GreaterThanOrEqual,
  TokenOp::Equal,
  TokenOp::NotEqual,
  TokenOp::And,
  TokenOp::Or,
  TokenOp::DotDotDot,
];

#[derive(Copy, Clone, PartialEq, Eq)]
pub(super) enum TokenOp {
  Underscore,
  // Parentheses
  LeftParenthesis,
  RightParenthesis,
  LeftBrace,
  RightBrace,
  LeftBracket,
  RightBracket,
  // Separators
  Question,
  Semicolon,
  Colon,
  ColonColon,
  Comma,
  Dot,
  Bar,
  Arrow,
  // Operators
  Assign,
  Not,
  Multiply,
  Divide,
  Mod,
  Plus,
  Minus,
  LessThan,
  LessThanOrEqual,
  GreaterThan,
  GreaterThanOrEqual,
  Equal,
  NotEqual,
  And,
  Or,
  DotDotDot,
}

impl TokenOp {
  pub(super) fn as_str(&self) -> &'static str {
    match self {
      TokenOp::Underscore => "_",
      TokenOp::LeftParenthesis => "(",
      TokenOp::RightParenthesis => ")",
      TokenOp::LeftBrace => "{",
      TokenOp::RightBrace => "}",
      TokenOp::LeftBracket => "[",
      TokenOp::RightBracket => "]",
      TokenOp::Question => "?",
      TokenOp::Semicolon => ";",
      TokenOp::Colon => ":",
      TokenOp::ColonColon => "::",
      TokenOp::Comma => ",",
      TokenOp::Dot => ".",
      TokenOp::Bar => "|",
      TokenOp::Arrow => "->",
      TokenOp::Assign => "=",
      TokenOp::Not => "!",
      TokenOp::Multiply => "*",
      TokenOp::Divide => "/",
      TokenOp::Mod => "%",
      TokenOp::Plus => "+",
      TokenOp::Minus => "-",
      TokenOp::LessThan => "<",
      TokenOp::LessThanOrEqual => "<=",
      TokenOp::GreaterThan => ">",
      TokenOp::GreaterThanOrEqual => ">=",
      TokenOp::Equal => "==",
      TokenOp::NotEqual => "!=",
      TokenOp::And => "&&",
      TokenOp::Or => "||",
      TokenOp::DotDotDot => "...",
    }
  }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum TokenContent {
  Keyword(Keyword),
  Operator(TokenOp),
  EndOfFile,
  UpperId(PStr),
  LowerId(PStr),
  StringLiteral(PStr),
  IntLiteral(PStr),
  LineComment(PStr),
  BlockComment(PStr),
  DocComment(PStr),
  Error(PStr),
}

impl TokenContent {
  pub(super) fn pretty_print(&self, heap: &Heap) -> String {
    match self {
      TokenContent::Keyword(k) => k.as_str().to_string(),
      TokenContent::Operator(o) => o.as_str().to_string(),
      TokenContent::EndOfFile => "EOF".to_string(),
      TokenContent::UpperId(s)
      | TokenContent::LowerId(s)
      | TokenContent::StringLiteral(s)
      | TokenContent::IntLiteral(s)
      | TokenContent::LineComment(s)
      | TokenContent::BlockComment(s)
      | TokenContent::DocComment(s) => s.as_str(heap).to_string(),
      TokenContent::Error(e) => format!("ERROR: {}", e.as_str(heap)),
    }
  }
}

#[derive(Clone, Copy)]
pub(super) struct Token(pub(super) Location, pub(super) TokenContent);

impl Token {
  #[cfg(test)]
  pub(super) fn pretty_print(&self, heap: &Heap) -> String {
    let Token(loc, content) = self;
    format!("{}: {}", loc.pretty_print(heap), content.pretty_print(heap))
  }
}

fn string_has_valid_escape(s: &str) -> bool {
  let mut has_unprocessed_escape = false;
  for c in s.chars() {
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
  true
}

fn get_next_token(
  stream: &mut char_stream::CharacterStream,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
  known_sorted_operators: &Vec<TokenOp>,
) -> Option<Token> {
  if !stream.consume_whitespace() {
    return None;
  }
  if let Option::Some((loc, s)) = stream.consume_line_comment_opt() {
    let comment_pstr = heap.alloc_string(s);
    return Option::Some(Token(loc, TokenContent::LineComment(comment_pstr)));
  }

  if let Option::Some((is_doc, loc, s)) = stream.consume_opt_block_comment() {
    let comment_pstr = heap.alloc_string(s);
    return Option::Some(Token(
      loc,
      if is_doc {
        TokenContent::DocComment(comment_pstr)
      } else {
        TokenContent::BlockComment(comment_pstr)
      },
    ));
  }

  if let Option::Some((loc, s)) = stream.consume_opt_int() {
    return Option::Some(Token(loc, TokenContent::IntLiteral(heap.alloc_string(s))));
  }

  if let Option::Some((loc, s)) = stream.consume_str_opt() {
    if !string_has_valid_escape(&s) {
      error_set.report_invalid_syntax_error(loc, "Invalid escape in string.".to_string())
    }
    return Option::Some(Token(loc, TokenContent::StringLiteral(heap.alloc_string(s))));
  }

  if let Option::Some((loc, s)) = stream.consume_opt_id() {
    if let Option::Some(k) = KEYWORDS.get(s.as_str()) {
      return Option::Some(Token(loc, TokenContent::Keyword(*k)));
    }
    let content = if s.chars().next().unwrap().is_ascii_uppercase() {
      TokenContent::UpperId(heap.alloc_string(s))
    } else {
      TokenContent::LowerId(heap.alloc_string(s))
    };
    return Option::Some(Token(loc, content));
  }

  for op in known_sorted_operators {
    let op_string = op.as_str();
    if let Some(loc) = stream.consume_opt_next_constant_token(op_string) {
      return Option::Some(Token(loc, TokenContent::Operator(*op)));
    }
  }

  let (error_loc, error_token_content) = stream.consume_until_whitespace();
  error_set.report_invalid_syntax_error(error_loc, "Invalid token.".to_string());
  Option::Some(Token(error_loc, TokenContent::Error(heap.alloc_string(error_token_content))))
}

pub(super) fn lex_source_program(
  source: &str,
  module_reference: ModuleReference,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
) -> Vec<Token> {
  let mut stream = char_stream::CharacterStream::new(module_reference, source);
  let mut tokens = vec![];
  let mut known_sorted_operators = TOKEN_OPS.to_vec();
  known_sorted_operators.sort_by_key(|op| -(op.as_str().len() as i64));

  loop {
    match get_next_token(&mut stream, heap, error_set, &known_sorted_operators) {
      Option::None => return tokens,
      Option::Some(Token(loc, TokenContent::IntLiteral(p_str))) => {
        let s = p_str.as_str(heap);
        match s.parse::<i64>() {
          Result::Err(_) => {
            error_set.report_invalid_syntax_error(loc, "Not a 32-bit integer.".to_string());
          }
          Result::Ok(i64) => {
            let maxi32_plus1 = (i32::MAX as i64) + 1;
            if i64 > maxi32_plus1 || (i64 == maxi32_plus1 && tokens.is_empty()) {
              error_set.report_invalid_syntax_error(loc, "Not a 32-bit integer.".to_string());
            } else if i64 == maxi32_plus1 {
              let prev_index = tokens.len() - 1;
              if let Option::Some(Token(prev_loc, TokenContent::Operator(TokenOp::Minus))) =
                tokens.get(prev_index)
              {
                // Merge - and MAX_INT_PLUS_ONE into MIN_INT
                tokens[prev_index] = Token(
                  prev_loc.union(&loc),
                  TokenContent::IntLiteral(heap.alloc_string(format!("-{s}"))),
                );
                continue;
              }
            }
          }
        };
        tokens.push(Token(loc, TokenContent::IntLiteral(p_str)));
      }
      Option::Some(t) => {
        tokens.push(t);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use itertools::Itertools;

  #[test]
  fn boilterplate() {
    pretty_assertions::assert_eq!(
      false,
      super::KEYWORDS.values().map(|it| it.as_str()).join("\n").is_empty()
    );
  }
}
