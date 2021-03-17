import type { SamlangToken } from './samlang-lexer';

import { checkNotNull } from 'samlang-core-utils';

export default class TokenStream {
  private position = 0;

  constructor(private readonly tokens: readonly SamlangToken[]) {}

  peek(): SamlangToken {
    return checkNotNull(this.tokens[this.position]);
  }

  consume(): void {
    this.position += 1;
    // TODO
    if (this.position >= this.tokens.length) throw new Error();
  }
}
