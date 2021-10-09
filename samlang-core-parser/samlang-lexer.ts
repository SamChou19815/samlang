import type { ModuleErrorCollector } from 'samlang-core-errors';
import { Position, Range } from 'samlang-core/ast/common-nodes';
import { assert, checkNotNull } from 'samlang-core/utils';

const characterIsWhitespace = (character: string): boolean => /\s/.test(character);
const characterIsNumber = (character: string): boolean =>
  character.length === 1 && '0' <= character && character <= '9';
const characterIsLetter = (character: string): boolean =>
  character.length === 1 &&
  (('A' <= character && character <= 'Z') || ('a' <= character && character <= 'z'));

class EOF extends Error {}

const MAX_INT_PLUS_ONE = 2147483648;

class CharacterStream {
  public lineNumber = 0;
  public columnNumber = 0;

  private position = 0;

  constructor(private readonly source: string) {}

  private advanceCharacter(character: string): void {
    this.position += 1;
    if (character === '\n') {
      this.lineNumber += 1;
      this.columnNumber = 0;
    } else {
      this.columnNumber += 1;
    }
  }

  get currentPosition(): Position {
    return new Position(this.lineNumber, this.columnNumber);
  }

  consumeWhitespace(): void {
    while (this.position < this.source.length) {
      const character = checkNotNull(this.source[this.position]);
      if (!characterIsWhitespace(character)) return;
      this.advanceCharacter(character);
    }
    throw new EOF();
  }

  consumeAndGetRange(start: Position, length: number): Range {
    const startingPosition = this.position;
    for (let i = startingPosition; i < startingPosition + length; i += 1) {
      this.advanceCharacter(checkNotNull(this.source[i]));
    }
    return new Range(start, this.currentPosition);
  }

  peekUntilWhitespace(): string {
    let position = this.position;
    while (position < this.source.length) {
      if (characterIsWhitespace(checkNotNull(this.source[position]))) break;
      position += 1;
    }
    return this.source.substring(this.position, position);
  }

  peekNextConstantToken(constantToken: string): boolean {
    const peeked = this.source.substr(this.position, constantToken.length);
    return peeked === constantToken;
  }

  /** @returns comment string including // or null if it's not a line comment. */
  peekLineComment(): string | null {
    if (this.source.substr(this.position, 2) !== '//') return null;
    let commentLength = 0;
    while (true) {
      const character = this.source[this.position + 2 + commentLength];
      if (character == null || character === '\n') break;
      commentLength += 1;
    }
    return this.source.substr(this.position, 2 + commentLength);
  }

  /** @returns comment string including /* or null if it's not a block comment. */
  peekBlockComment(): string | null {
    if (this.source.substr(this.position, 2) !== '/*') return null;
    let commentLength = 0;
    while (true) {
      const twoChars = this.source.substr(this.position + 2 + commentLength, 2);
      if (twoChars.length !== 2) return null;
      if (twoChars === '*/') {
        break;
      }
      commentLength += 1;
    }
    commentLength += 2;
    return this.source.substr(this.position, 2 + commentLength);
  }

  peekInteger(): string | null {
    if (this.source[this.position] === '0') return '0';
    let position = this.position;
    while (true) {
      if (characterIsNumber(this.source[position] ?? '')) {
        position += 1;
      } else if (position === this.position) {
        return null;
      } else {
        return this.source.substring(this.position, position);
      }
    }
  }

  peekIdentifier(): string | null {
    if (!characterIsLetter(checkNotNull(this.source[this.position]))) return null;
    let position = this.position + 1;
    while (true) {
      const character = this.source[position] ?? '';
      if (characterIsNumber(character) || characterIsLetter(character)) {
        position += 1;
      } else {
        return this.source.substring(this.position, position);
      }
    }
  }

  peekString(): string | null {
    if (this.source[this.position] !== '"') return null;
    let position = this.position + 1;
    while (true) {
      const character = this.source[position];
      if (character == null) return null;
      if (character === '"') {
        let escapeCount = 0;
        for (let i = position - 1; i >= this.position + 1; i -= 1) {
          if (this.source[i] !== '\\') break;
          escapeCount += 1;
        }
        // We don't validate escaping here.
        if (escapeCount % 2 === 0) {
          // When there are even number of escapes, the quote is not escaped,
          // so it's the ending quote.
          return this.source.substring(this.position, position + 1);
        }
      }
      if (character === '\n') return null;
      position += 1;
    }
  }
}

export type SamlangKeywordString =
  // Imports
  | 'import'
  | 'from'
  // Declarations
  | 'class'
  | 'val'
  | 'function'
  | 'method'
  | 'as'
  // Visibility modifiers
  | 'private'
  | 'protected'
  | 'internal'
  | 'public'
  // Control Flow
  | 'if'
  | 'then'
  | 'else'
  | 'match'
  | 'return'
  // Type Keywords
  | 'int'
  | 'string'
  | 'bool'
  | 'unit'
  // Some Important Literals
  | 'true'
  | 'false'
  | 'this'
  // Forbidden Names
  | 'self'
  | 'const'
  | 'let'
  | 'var'
  | 'type'
  | 'interface'
  | 'constructor'
  | 'destructor'
  | 'functor'
  | 'extends'
  | 'implements'
  | 'export'
  | 'assert';

const SAMLANG_KEYWORDS: SamlangKeywordString[] = [
  // Imports
  'import',
  'from',
  // Declarations
  'class',
  'val',
  'function',
  'method',
  'as',
  // Visibility modifiers
  'private',
  'protected',
  'internal',
  'public',
  // Control Flow
  'if',
  'then',
  'else',
  'match',
  'return',
  // Type Keywords
  'int',
  'string',
  'bool',
  'unit',
  // Some Important Literals
  'true',
  'false',
  'this',
  // Forbidden Names
  'self',
  'const',
  'let',
  'var',
  'type',
  'interface',
  'constructor',
  'destructor',
  'functor',
  'extends',
  'implements',
  'export',
  'assert',
];

export type SamlangOperatorString =
  | '_'
  // Parentheses
  | '('
  | ')'
  | '{'
  | '}'
  | '['
  | ']'
  // Separators
  | '?'
  | ';'
  | ':'
  | '::'
  | ','
  | '.'
  | '|'
  | '->'
  // Operators
  | '='
  | '!'
  | '*'
  | '/'
  | '%'
  | '+'
  | '-'
  | '=='
  | '<'
  | '<='
  | '>'
  | '>='
  | '!='
  | '&&'
  | '||'
  | '...';

const SAMLANG_OPERATORS: SamlangOperatorString[] = [
  '_',
  // Parentheses
  '(',
  ')',
  '{',
  '}',
  '[',
  ']',
  // Separators
  '?',
  ';',
  ':',
  '::',
  ',',
  '.',
  '|',
  '->',
  // Operators
  '=',
  '!',
  '*',
  '/',
  '%',
  '+',
  '-',
  '==',
  '<',
  '<=',
  '>',
  '>=',
  '!=',
  '&&',
  '||',
  '...',
];
// Sort by length reversed to enforce longest-rule-win rule.
SAMLANG_OPERATORS.sort((a, b) => b.length - a.length);

export type SamlangVariableTokenContent = {
  readonly __type__:
    | 'UpperId'
    | 'LowerId'
    | 'StringLiteral'
    | 'IntLiteral'
    | 'LineComment'
    | 'BlockComment'
    | 'Error';
  readonly content: string;
};
export type SamlangTokenContent =
  | SamlangKeywordString
  | SamlangOperatorString
  | 'EOF'
  | SamlangVariableTokenContent;

export type SamlangToken = {
  readonly range: Range;
  readonly content: SamlangTokenContent;
};

export function samlangTokenContentToString(content: SamlangTokenContent): string {
  if (typeof content === 'string') return content;
  if (content.__type__ === 'Error') return `ERROR: ${content.content}`;
  return content.content;
}

export function samlangTokenToString({ range, content }: SamlangToken): string {
  return `${range}: ${samlangTokenContentToString(content)}`;
}

function stringHasValidEscape(string: string): boolean {
  let hasUnprocessedEscape = false;
  for (let i = 0; i < string.length; i += 1) {
    const character = string[i];
    if (character === '\\') {
      hasUnprocessedEscape = !hasUnprocessedEscape;
      continue;
    }
    if (hasUnprocessedEscape) {
      switch (character) {
        case 't':
        case 'v':
        case '0':
        case 'b':
        case 'f':
        case 'n':
        case 'r':
        case '"':
          hasUnprocessedEscape = false;
          break;
        default:
          // Escaping things that should not be escaped
          return false;
      }
    }
  }
  return true;
}

function getNextToken(
  stream: CharacterStream,
  errorCollector: ModuleErrorCollector
): SamlangToken | null {
  try {
    stream.consumeWhitespace();
    const start = stream.currentPosition;

    const lineComment = stream.peekLineComment();
    if (lineComment != null) {
      return {
        range: stream.consumeAndGetRange(start, lineComment.length),
        content: { __type__: 'LineComment', content: lineComment },
      };
    }
    const blockComment = stream.peekBlockComment();
    if (blockComment != null) {
      return {
        range: stream.consumeAndGetRange(start, blockComment.length),
        content: { __type__: 'BlockComment', content: blockComment },
      };
    }
    const integer = stream.peekInteger();
    if (integer != null) {
      return {
        range: stream.consumeAndGetRange(start, integer.length),
        content: { __type__: 'IntLiteral', content: integer },
      };
    }
    const string = stream.peekString();
    if (string != null) {
      const range = stream.consumeAndGetRange(start, string.length);
      if (!stringHasValidEscape(string)) {
        errorCollector.reportSyntaxError(range, 'Invalid escape in string.');
      }
      return {
        range,
        content: { __type__: 'StringLiteral', content: string },
      };
    }

    const identifier = stream.peekIdentifier();
    if (identifier != null) {
      const range = stream.consumeAndGetRange(start, identifier.length);
      if ((SAMLANG_KEYWORDS as string[]).includes(identifier)) {
        return { range, content: identifier as SamlangKeywordString };
      }
      const firstLetter = checkNotNull(identifier[0]);
      return {
        range,
        content: {
          __type__: 'A' <= firstLetter && firstLetter <= 'Z' ? 'UpperId' : 'LowerId',
          content: identifier,
        },
      };
    }

    for (const operator of SAMLANG_OPERATORS) {
      if (stream.peekNextConstantToken(operator)) {
        return { range: stream.consumeAndGetRange(start, operator.length), content: operator };
      }
    }

    const errorTokenContent = stream.peekUntilWhitespace();
    const errorRange = stream.consumeAndGetRange(start, errorTokenContent.length);
    errorCollector.reportSyntaxError(errorRange, 'Invalid token.');
    return {
      range: errorRange,
      content: { __type__: 'Error', content: errorTokenContent },
    };
  } catch (e) {
    assert(e instanceof EOF);
    return null;
  }
}

export default function lexSamlangProgram(
  source: string,
  errorCollector: ModuleErrorCollector
): readonly SamlangToken[] {
  const stream = new CharacterStream(source);

  const tokens: SamlangToken[] = [];
  while (true) {
    let token = getNextToken(stream, errorCollector);
    if (token == null) return tokens;

    // Validate the range of int token.
    // We have to do it here since we need access of the previous token.
    if (typeof token.content !== 'string' && token.content.__type__ === 'IntLiteral') {
      const intLiteralString = token.content.content;
      const parsedInt = parseInt(intLiteralString, 10);
      if (parsedInt > MAX_INT_PLUS_ONE) {
        errorCollector.reportSyntaxError(token.range, 'Not a 32-bit integer.');
        token = {
          range: token.range,
          content: { __type__: 'IntLiteral', content: intLiteralString },
        };
      } else if (parsedInt === MAX_INT_PLUS_ONE) {
        const previousToken = tokens[tokens.length - 1]?.content;
        if (previousToken == null || previousToken !== '-') {
          errorCollector.reportSyntaxError(token.range, 'Not a 32-bit integer.');
          token = {
            range: token.range,
            content: { __type__: 'IntLiteral', content: intLiteralString },
          };
        } else {
          tokens.pop();
          // Merge - and MAX_INT_PLUS_ONE into MIN_INT
          token = {
            range: token.range,
            content: { __type__: 'IntLiteral', content: `-${intLiteralString}` },
          };
        }
      }
    }

    tokens.push(token);
  }
}
