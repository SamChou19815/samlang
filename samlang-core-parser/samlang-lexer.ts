import { checkNotNull } from 'samlang-core-utils';

/** @internal */
export class TokenStream {
  public lineNumber = 0;
  public columnNumber = 0;

  private position = 0;

  constructor(private readonly source: string) {}

  private advanceCharacter(character: string): void {
    this.position += 1;
    if (character === '\n') {
      this.lineNumber += 1;
    } else {
      this.columnNumber += 1;
    }
  }

  private consumeWhitespace(): void {
    while (this.position < this.source.length) {
      const character = checkNotNull(this.source[this.position]);
      if (!/\s/.test(character)) return;
      this.advanceCharacter(character);
    }
  }

  consume(length: number): void {
    for (let i = this.position; i < this.position + length; i += 1) {
      this.advanceCharacter(checkNotNull(this.source[i]));
    }
  }

  peekNextConstantToken(constantToken: string): boolean {
    this.consumeWhitespace();
    const peeked = this.source.substr(this.position, this.position + constantToken.length);
    return peeked === constantToken;
  }

  /** @returns comment string including // or null if it's not a line comment. */
  peekLineComment(): string | null {
    this.consumeWhitespace();
    if (this.source.substr(this.position, this.position + 2) !== '//') return null;
    let commentLength = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const character = checkNotNull(this.source[this.position + 2 + commentLength]);
      if (character === '\n') break;
      commentLength += 1;
    }
    return this.source.substr(this.position, this.position + 2 + commentLength);
  }

  /** @returns comment string including /* or null if it's not a block comment. */
  peekBlockComment(): string | null {
    this.consumeWhitespace();
    if (this.source.substr(this.position, this.position + 2) !== '/*') return null;
    let commentLength = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (
        this.source.substr(
          this.position + 2 + commentLength,
          this.position + 2 + commentLength + 2
        ) === '*/'
      ) {
        break;
      }
      commentLength += 1;
    }
    commentLength += 1;
    return this.source.substr(this.position, this.position + 2 + commentLength);
  }
}

export default class SamlangLexer {}
