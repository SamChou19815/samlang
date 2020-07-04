/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import { Type, prettyPrintType } from '../ast/common/types';

export abstract class CompileTimeError<T = string, C = number> {
  constructor(
    public readonly errorType: T,
    public readonly errorCode: C,
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly reason: string
  ) {}

  toString(): string {
    const filename = this.moduleReference.toFilename();
    return `${filename}:${this.range}: [${this.errorType}]: ${this.reason}`;
  }
}

export class SyntaxError extends CompileTimeError<'SyntaxError', 1> {
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly reason: string
  ) {
    super('SyntaxError', 1, moduleReference, range, reason);
  }
}

export class UnexpectedTypeError extends CompileTimeError<'UnexpectedType', 2> {
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly expected: Type,
    public readonly actual: Type
  ) {
    super(
      'UnexpectedType',
      2,
      moduleReference,
      range,
      (() => {
        const expectedType = prettyPrintType(expected);
        const actualType = prettyPrintType(actual);
        return `Expected: \`${expectedType}\`, actual: \`${actualType}\`.`;
      })()
    );
  }
}

export class NotWellDefinedIdentifierError extends CompileTimeError<'NotWellDefinedIdentifier', 3> {
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly badIdentifier: string
  ) {
    super(
      'NotWellDefinedIdentifier',
      3,
      moduleReference,
      range,
      `\`${badIdentifier}\` is not well defined.`
    );
  }
}

export class UnresolvedNameError extends CompileTimeError<'UnresolvedName', 4> {
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly unresolvedName: string
  ) {
    super(
      'UnresolvedName',
      4,
      moduleReference,
      range,
      `Name \`${unresolvedName}\` is not resolved.`
    );
  }
}

export class UnsupportedClassTypeDefinitionError extends CompileTimeError<
  'UnsupportedClassTypeDefinition',
  5
> {
  constructor(
    public readonly moduleReference: ModuleReference,
    public readonly range: Range,
    public readonly typeDefinitionType: 'object' | 'variant'
  ) {
    super(
      'UnsupportedClassTypeDefinition',
      5,
      moduleReference,
      range,
      `Expect the current class to have \`${typeDefinitionType}\` type definition, but it doesn't.`
    );
  }
}
