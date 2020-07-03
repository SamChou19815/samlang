/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import { Type, prettyPrintType } from '../ast/common/types';

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

export class UnexpectedTypeError extends CompileTimeError<'UnexpectedType', 2> {
  readonly errorType = 'UnexpectedType';

  readonly errorCode = 2;

  readonly reason: string;

  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly expected: Type,
    public readonly actual: Type
  ) {
    super();
    const expectedType = prettyPrintType(expected);
    const actualType = prettyPrintType(actual);
    this.reason = `Expected: \`${expectedType}\`, actual: \`${actualType}\`.`;
  }
}

export class NotWellDefinedIdentifierError extends CompileTimeError<'NotWellDefinedIdentifier', 3> {
  readonly errorType = 'NotWellDefinedIdentifier';

  readonly errorCode = 3;

  readonly reason: string;

  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly badIdentifier: string
  ) {
    super();
    this.reason = `\`${badIdentifier}\` is not well defined.`;
  }
}

export class UnresolvedNameError extends CompileTimeError<'UnresolvedName', 4> {
  readonly errorType = 'UnresolvedName';

  readonly errorCode = 4;

  readonly reason: string;

  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly unresolvedName: string
  ) {
    super();
    this.reason = `Name \`${unresolvedName}\` is not resolved.`;
  }
}
