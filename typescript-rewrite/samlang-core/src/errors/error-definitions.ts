/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';

export abstract class CompileTimeError<T = string, C = number> {
  abstract readonly errorType: T;

  abstract readonly errorCode: C;

  abstract readonly moduleReference: ModuleReference;

  abstract readonly range: Range;

  abstract readonly reason: string;

  toString(): string {
    const filename = this.moduleReference.toFilename();
    return `${filename}:${this.range}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError<'SyntaxError', 1> {
  readonly errorType = 'SyntaxError';

  readonly errorCode = 1;

  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly reason: string
  ) {
    super();
  }
}
