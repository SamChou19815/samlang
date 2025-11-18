use itertools::Itertools;
use logos::Logos;
use samlang_ast::{Location, Position};
use samlang_errors::ErrorSet;
use samlang_heap::{Heap, ModuleReference, PStr};

#[derive(Clone, Copy, Logos)]
enum LogosToken {
  // Keywords: Imports
  #[token("import")]
  KeywordImport,
  #[token("from")]
  KeywordFrom,
  // Keywords: Declarations
  #[token("class")]
  KeywordClass,
  #[token("interface")]
  KeywordInterface,
  #[token("val")]
  KeywordVal,
  #[token("function")]
  KeywordFunction,
  #[token("method")]
  KeywordMethod,
  #[token("as")]
  KeywordAs,
  // Keywords: Visibility modifiers
  #[token("private")]
  KeywordPrivate,
  #[token("protected")]
  KeywordProtected,
  #[token("internal")]
  KeywordInternal,
  #[token("public")]
  KeywordPublic,
  // Keywords: Control Flow
  #[token("if")]
  KeywordIf,
  #[token("then")]
  KeywordThen,
  #[token("else")]
  KeywordElse,
  #[token("match")]
  KeywordMatch,
  #[token("return")]
  KeywordReturn,
  // Keywords: Types
  #[token("int")]
  KeywordInt,
  #[token("string")]
  KeywordString,
  #[token("bool")]
  KeywordBool,
  #[token("unit")]
  // Keywords: Literals
  KeywordUnit,
  #[token("true")]
  KeywordTrue,
  #[token("false")]
  KeywordFalse,
  #[token("this")]
  KeywordThis,
  // Keywords: Forbidden Names
  #[token("self")]
  KeywordSelfReserved,
  #[token("const")]
  KeywordConst,
  #[token("let")]
  KeywordLet,
  #[token("var")]
  KeywordVar,
  #[token("type")]
  KeywordType,
  #[token("constructor")]
  KeywordConstructor,
  #[token("destructor")]
  KeywordDestructor,
  #[token("extends")]
  KeywordExtends,
  #[token("implements")]
  KeywordImplements,
  #[token("exports")]
  KeywordExports,
  #[token("assert")]
  KeywordAssert,
  // Operators and punctuations
  #[token("_")]
  OpUnderscore,
  #[token("(")]
  OpLeftParenthesis,
  #[token(")")]
  OpRightParenthesis,
  #[token("{")]
  OpLeftBrace,
  #[token("}")]
  OpRightBrace,
  #[token("[")]
  OpLeftBracket,
  #[token("]")]
  OpRightBracket,
  #[token("?")]
  OpQuestion,
  #[token(";")]
  OpSemicolon,
  #[token(":")]
  OpColon,
  #[token("::")]
  OpColonColon,
  #[token(",")]
  OpComma,
  #[token(".")]
  OpDot,
  #[token("|")]
  OpBar,
  #[token("->")]
  OpArrow,
  #[token("=")]
  OpAssign,
  #[token("!")]
  OpNot,
  #[token("*")]
  OpMultiply,
  #[token("/")]
  OpDivide,
  #[token("%")]
  OpMod,
  #[token("+")]
  OpPlus,
  #[token("-")]
  OpMinus,
  #[token("<")]
  OpLessThan,
  #[token("<=")]
  OpLessThanOrEqual,
  #[token(">")]
  OpGreaterThan,
  #[token(">=")]
  OpGreaterThanOrEqual,
  #[token("==")]
  OpEqual,
  #[token("!=")]
  OpNotEqual,
  #[token("&&")]
  OpAnd,
  #[token("||")]
  OpOr,
  #[token("...")]
  OpDotDotDot,
  // Identifiers
  #[regex("[A-Z][A-Za-z0-9]*")]
  UpperId,
  #[regex("[a-z][A-Za-z0-9]*")]
  LowerId,
  #[regex("0|([1-9][0-9]*)")]
  Int,
}

struct WrappedLogosLexer<'a, 'b, 'c> {
  lexer: logos::Lexer<'a, LogosToken>,
  heap: &'b mut Heap,
  error_set: &'c mut ErrorSet,
  module_reference: ModuleReference,
  position: Position,
}

impl<'a, 'b, 'c> WrappedLogosLexer<'a, 'b, 'c> {
  fn new(
    source: &'a str,
    module_reference: ModuleReference,
    heap: &'b mut Heap,
    error_set: &'c mut ErrorSet,
  ) -> Self {
    Self {
      lexer: LogosToken::lexer(source),
      module_reference,
      heap,
      error_set,
      position: Position(0, 0),
    }
  }

  fn next(&mut self) -> Option<Token> {
    self.skip_whitespace();

    if let Some((loc, s)) = self.lex_str_lit_opt() {
      if !string_has_valid_escape(&s) {
        self.error_set.report_invalid_syntax_error(loc, "Invalid escape in string.".to_string())
      }
      return Some(Token(loc, TokenContent::StringLiteral(self.heap.alloc_string(s))));
    }

    if let Some((loc, s)) = self.lex_line_comment_opt() {
      let comment_pstr = self.heap.alloc_string(s);
      return Some(Token(loc, TokenContent::LineComment(comment_pstr)));
    }

    if let Some((is_doc, loc, s)) = self.lex_block_comment_opt() {
      let comment_pstr = self.heap.alloc_string(s);
      return Some(Token(
        loc,
        if is_doc {
          TokenContent::DocComment(comment_pstr)
        } else {
          TokenContent::BlockComment(comment_pstr)
        },
      ));
    }

    let token = match self.lexer.next()? {
      Ok(token) => token,
      Err(()) => {
        let start = self.position;
        let mut content = self.lexer.slice().to_string();
        self.position.1 += content.len() as u32;
        let mut skip_count = 0;
        for c in self.lexer.remainder().as_bytes() {
          if c.is_ascii_whitespace() {
            break;
          }
          skip_count += 1;
        }
        content.push_str(&self.lexer.remainder()[..skip_count]);
        self.position.1 += skip_count as u32;
        self.lexer.bump(skip_count);
        let p_str = self.heap.alloc_string(content.to_string());
        let loc = Location { module_reference: self.module_reference, start, end: self.position };
        self.error_set.report_invalid_syntax_error(loc, "Invalid token.".to_string());
        return Some(Token(loc, TokenContent::Error(p_str)));
      }
    };

    match token {
      LogosToken::KeywordImport => Some(self.translate_keyword_token(Keyword::Import)),
      LogosToken::KeywordFrom => Some(self.translate_keyword_token(Keyword::From)),
      LogosToken::KeywordClass => Some(self.translate_keyword_token(Keyword::Class)),
      LogosToken::KeywordInterface => Some(self.translate_keyword_token(Keyword::Interface)),
      LogosToken::KeywordVal => Some(self.translate_keyword_token(Keyword::Val)),
      LogosToken::KeywordFunction => Some(self.translate_keyword_token(Keyword::Function)),
      LogosToken::KeywordMethod => Some(self.translate_keyword_token(Keyword::Method)),
      LogosToken::KeywordAs => Some(self.translate_keyword_token(Keyword::As)),
      LogosToken::KeywordPrivate => Some(self.translate_keyword_token(Keyword::Private)),
      LogosToken::KeywordProtected => Some(self.translate_keyword_token(Keyword::Protected)),
      LogosToken::KeywordInternal => Some(self.translate_keyword_token(Keyword::Internal)),
      LogosToken::KeywordPublic => Some(self.translate_keyword_token(Keyword::Public)),
      LogosToken::KeywordIf => Some(self.translate_keyword_token(Keyword::If)),
      LogosToken::KeywordThen => Some(self.translate_keyword_token(Keyword::Then)),
      LogosToken::KeywordElse => Some(self.translate_keyword_token(Keyword::Else)),
      LogosToken::KeywordMatch => Some(self.translate_keyword_token(Keyword::Match)),
      LogosToken::KeywordReturn => Some(self.translate_keyword_token(Keyword::Return)),
      LogosToken::KeywordInt => Some(self.translate_keyword_token(Keyword::Int)),
      LogosToken::KeywordString => Some(self.translate_keyword_token(Keyword::String)),
      LogosToken::KeywordBool => Some(self.translate_keyword_token(Keyword::Bool)),
      LogosToken::KeywordUnit => Some(self.translate_keyword_token(Keyword::Unit)),
      LogosToken::KeywordTrue => Some(self.translate_keyword_token(Keyword::True)),
      LogosToken::KeywordFalse => Some(self.translate_keyword_token(Keyword::False)),
      LogosToken::KeywordThis => Some(self.translate_keyword_token(Keyword::This)),
      LogosToken::KeywordSelfReserved => Some(self.translate_keyword_token(Keyword::SelfReserved)),
      LogosToken::KeywordConst => Some(self.translate_keyword_token(Keyword::Const)),
      LogosToken::KeywordLet => Some(self.translate_keyword_token(Keyword::Let)),
      LogosToken::KeywordVar => Some(self.translate_keyword_token(Keyword::Var)),
      LogosToken::KeywordType => Some(self.translate_keyword_token(Keyword::Type)),
      LogosToken::KeywordConstructor => Some(self.translate_keyword_token(Keyword::Constructor)),
      LogosToken::KeywordDestructor => Some(self.translate_keyword_token(Keyword::Destructor)),
      LogosToken::KeywordExtends => Some(self.translate_keyword_token(Keyword::Extends)),
      LogosToken::KeywordImplements => Some(self.translate_keyword_token(Keyword::Implements)),
      LogosToken::KeywordExports => Some(self.translate_keyword_token(Keyword::Exports)),
      LogosToken::KeywordAssert => Some(self.translate_keyword_token(Keyword::Assert)),
      LogosToken::OpUnderscore => Some(self.translate_op_token(TokenOp::Underscore)),
      LogosToken::OpLeftParenthesis => Some(self.translate_op_token(TokenOp::LeftParenthesis)),
      LogosToken::OpRightParenthesis => Some(self.translate_op_token(TokenOp::RightParenthesis)),
      LogosToken::OpLeftBrace => Some(self.translate_op_token(TokenOp::LeftBrace)),
      LogosToken::OpRightBrace => Some(self.translate_op_token(TokenOp::RightBrace)),
      LogosToken::OpLeftBracket => Some(self.translate_op_token(TokenOp::LeftBracket)),
      LogosToken::OpRightBracket => Some(self.translate_op_token(TokenOp::RightBracket)),
      LogosToken::OpQuestion => Some(self.translate_op_token(TokenOp::Question)),
      LogosToken::OpSemicolon => Some(self.translate_op_token(TokenOp::Semicolon)),
      LogosToken::OpColon => Some(self.translate_op_token(TokenOp::Colon)),
      LogosToken::OpColonColon => Some(self.translate_op_token(TokenOp::ColonColon)),
      LogosToken::OpComma => Some(self.translate_op_token(TokenOp::Comma)),
      LogosToken::OpDot => Some(self.translate_op_token(TokenOp::Dot)),
      LogosToken::OpBar => Some(self.translate_op_token(TokenOp::Bar)),
      LogosToken::OpArrow => Some(self.translate_op_token(TokenOp::Arrow)),
      LogosToken::OpAssign => Some(self.translate_op_token(TokenOp::Assign)),
      LogosToken::OpNot => Some(self.translate_op_token(TokenOp::Not)),
      LogosToken::OpMultiply => Some(self.translate_op_token(TokenOp::Multiply)),
      LogosToken::OpDivide => Some(self.translate_op_token(TokenOp::Divide)),
      LogosToken::OpMod => Some(self.translate_op_token(TokenOp::Mod)),
      LogosToken::OpPlus => Some(self.translate_op_token(TokenOp::Plus)),
      LogosToken::OpMinus => Some(self.translate_op_token(TokenOp::Minus)),
      LogosToken::OpLessThan => Some(self.translate_op_token(TokenOp::LessThan)),
      LogosToken::OpLessThanOrEqual => Some(self.translate_op_token(TokenOp::LessThanOrEqual)),
      LogosToken::OpGreaterThan => Some(self.translate_op_token(TokenOp::GreaterThan)),
      LogosToken::OpGreaterThanOrEqual => {
        Some(self.translate_op_token(TokenOp::GreaterThanOrEqual))
      }
      LogosToken::OpEqual => Some(self.translate_op_token(TokenOp::Equal)),
      LogosToken::OpNotEqual => Some(self.translate_op_token(TokenOp::NotEqual)),
      LogosToken::OpAnd => Some(self.translate_op_token(TokenOp::And)),
      LogosToken::OpOr => Some(self.translate_op_token(TokenOp::Or)),
      LogosToken::OpDotDotDot => Some(self.translate_op_token(TokenOp::DotDotDot)),
      LogosToken::UpperId => {
        let loc = self.loc_of_lexer_span();
        let p_str = self.heap.alloc_string(self.lexer.slice().to_string());
        Some(Token(loc, TokenContent::UpperId(p_str)))
      }
      LogosToken::LowerId => {
        let loc = self.loc_of_lexer_span();
        let p_str = self.heap.alloc_string(self.lexer.slice().to_string());
        Some(Token(loc, TokenContent::LowerId(p_str)))
      }
      LogosToken::Int => {
        let loc = self.loc_of_lexer_span();
        let p_str = self.heap.alloc_string(self.lexer.slice().to_string());
        Some(Token(loc, TokenContent::IntLiteral(p_str)))
      }
    }
  }

  fn translate_keyword_token(&mut self, keyword: Keyword) -> Token {
    let loc = self.loc_of_lexer_span();
    Token(loc, TokenContent::Keyword(keyword))
  }

  fn translate_op_token(&mut self, op: TokenOp) -> Token {
    let loc = self.loc_of_lexer_span();
    Token(loc, TokenContent::Operator(op))
  }

  fn lex_str_lit_opt(&mut self) -> Option<(Location, String)> {
    let remainder = self.lexer.remainder();
    if !remainder.starts_with('"') {
      return None;
    }
    let remainder_bytes = remainder.as_bytes();
    let start = self.position;
    let mut pos = 1;
    loop {
      if pos >= remainder_bytes.len() {
        return Option::None;
      }
      let c = remainder_bytes[pos];
      if c == b'"' {
        let mut escape_count = 0;
        for i in (1..pos).rev() {
          if (remainder_bytes[i]) != b'\\' {
            break;
          }
          escape_count += 1;
        }
        // We don't validate escaping here.
        if escape_count % 2 == 0 {
          let string = String::from_utf8(remainder_bytes[..(pos + 1)].to_vec()).unwrap();
          self.lexer.bump(pos + 1);
          // When there are even number of escapes, the quote is not escaped,
          // so it's the ending quote.
          self.position.1 += pos as u32 + 1;
          let end = self.position;
          let loc = Location { module_reference: self.module_reference, start, end };
          return Some((loc, string));
        }
      }
      if c == b'\n' {
        return None;
      }
      pos += 1;
    }
  }

  fn lex_block_comment_opt(&mut self) -> Option<(bool, Location, String)> {
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

    let remainder = self.lexer.remainder();
    if !remainder.starts_with("/*") {
      return None;
    }
    let remainder_bytes = remainder.as_bytes();
    let start = self.position;
    let mut comment_length = 2;
    let saved_position = self.position;
    self.next_n_column(2);
    loop {
      if comment_length + 2 > remainder_bytes.len() {
        self.position = saved_position;
        return None;
      }
      let c = remainder_bytes[comment_length];
      if c == b'*' && remainder_bytes[comment_length + 1] == b'/' {
        comment_length += 2;
        self.next_n_column(2);
        break;
      }
      self.next_line_or_column(c);
      comment_length += 1;
    }
    let end = self.position;
    self.lexer.bump(comment_length);

    let loc = Location { module_reference: self.module_reference, start, end };
    let chars = &remainder_bytes[..comment_length];
    if chars[2] == b'*' {
      Some((
        true,
        loc,
        post_process_block_comment(&String::from_utf8_lossy(&chars[3..(chars.len() - 2)])),
      ))
    } else {
      Some((
        false,
        loc,
        post_process_block_comment(&String::from_utf8_lossy(&chars[2..(chars.len() - 2)])),
      ))
    }
  }

  fn lex_line_comment_opt(&mut self) -> Option<(Location, String)> {
    let remainder = self.lexer.remainder();
    if !remainder.starts_with("//") {
      return None;
    }
    let mut bump_counter = 2;
    let bytes_remainder = remainder.as_bytes();
    for c in &bytes_remainder[2..] {
      if *c == b'\n' {
        break;
      }
      bump_counter += 1;
    }
    let string = String::from_utf8_lossy(&bytes_remainder[2..bump_counter]).trim().to_string();
    let loc = self.loc_of_advance(bump_counter);
    self.lexer.bump(bump_counter);
    Some((loc, string))
  }

  // Assumption: no line break
  fn loc_of_lexer_span(&mut self) -> Location {
    let len = self.lexer.span().len();
    self.loc_of_advance(len)
  }

  // Assumption: no line break
  fn loc_of_advance(&mut self, len: usize) -> Location {
    let start = self.position;
    self.next_n_column(len);
    let end = self.position;
    Location { module_reference: self.module_reference, start, end }
  }

  fn next_n_column(&mut self, n: usize) {
    self.position.1 += n as u32;
  }

  fn next_line_or_column(&mut self, c: u8) {
    if c == b'\n' {
      self.position.0 += 1;
      self.position.1 = 0;
    } else {
      self.position.1 += 1;
    }
  }

  fn skip_whitespace(&mut self) {
    let remainder = self.lexer.remainder();
    let mut bump_counter = 0;
    for c in remainder.as_bytes() {
      if c.is_ascii_whitespace() {
        self.next_line_or_column(*c);
        bump_counter += 1;
      } else {
        break;
      }
    }
    self.lexer.bump(bump_counter);
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

pub(super) fn lex_source_program(
  source: &str,
  module_reference: ModuleReference,
  heap: &mut Heap,
  error_set: &mut ErrorSet,
) -> Vec<Token> {
  let mut lexer = WrappedLogosLexer::new(source, module_reference, heap, error_set);
  let mut tokens = Vec::new();

  loop {
    let Some(token) = lexer.next() else {
      return tokens;
    };
    match token {
      Token(loc, TokenContent::IntLiteral(p_str)) => {
        let s = p_str.as_str(lexer.heap);
        match s.parse::<i64>() {
          Result::Err(_) => {
            lexer.error_set.report_invalid_syntax_error(loc, "Not a 32-bit integer.".to_string());
          }
          Result::Ok(i64) => {
            let maxi32_plus1 = (i32::MAX as i64) + 1;
            if i64 > maxi32_plus1 || (i64 == maxi32_plus1 && tokens.is_empty()) {
              lexer.error_set.report_invalid_syntax_error(loc, "Not a 32-bit integer.".to_string());
            } else if i64 == maxi32_plus1 {
              let prev_index = tokens.len() - 1;
              if let Option::Some(Token(prev_loc, TokenContent::Operator(TokenOp::Minus))) =
                tokens.get(prev_index)
              {
                // Merge - and MAX_INT_PLUS_ONE into MIN_INT
                tokens[prev_index] = Token(
                  prev_loc.union(&loc),
                  TokenContent::IntLiteral(lexer.heap.alloc_string(format!("-{s}"))),
                );
                continue;
              }
            }
          }
        };
        tokens.push(Token(loc, TokenContent::IntLiteral(p_str)));
      }
      t => {
        tokens.push(t);
      }
    }
  }
}

#[cfg(test)]
mod tests {
  use crate::lexer::{Keyword, TokenOp};

  static KEYWORDS: [Keyword; 35] = [
    Keyword::Import,
    Keyword::From,
    Keyword::Class,
    Keyword::Interface,
    Keyword::Val,
    Keyword::Function,
    Keyword::Method,
    Keyword::As,
    Keyword::Private,
    Keyword::Protected,
    Keyword::Internal,
    Keyword::Public,
    Keyword::If,
    Keyword::Then,
    Keyword::Else,
    Keyword::Match,
    Keyword::Return,
    Keyword::Int,
    Keyword::String,
    Keyword::Bool,
    Keyword::Unit,
    Keyword::True,
    Keyword::False,
    Keyword::This,
    Keyword::SelfReserved,
    Keyword::Const,
    Keyword::Let,
    Keyword::Var,
    Keyword::Type,
    Keyword::Constructor,
    Keyword::Destructor,
    Keyword::Extends,
    Keyword::Implements,
    Keyword::Exports,
    Keyword::Assert,
  ];

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

  #[test]
  fn boilterplate() {
    let mut heap = samlang_heap::Heap::new();
    let mut errors = samlang_errors::ErrorSet::new();
    let mut lexer = super::WrappedLogosLexer::new(
      "",
      samlang_heap::ModuleReference::DUMMY,
      &mut heap,
      &mut errors,
    );

    for keyword in KEYWORDS {
      pretty_assertions::assert_eq!(false, keyword.as_str().is_empty());
      lexer.translate_keyword_token(keyword);
    }

    for op in TOKEN_OPS {
      pretty_assertions::assert_eq!(false, op.as_str().is_empty());
      lexer.translate_op_token(op);
    }
  }
}
