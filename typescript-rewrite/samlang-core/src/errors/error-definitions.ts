/* eslint-disable @typescript-eslint/no-empty-interface */

import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';

export interface CompileTimeError<T = string, C = number> {
  readonly errorType: T;
  readonly errorCode: C;
  readonly moduleReference: ModuleReference;
  readonly range: Range;
  readonly reason: string;
}

export interface SyntaxError extends CompileTimeError<'SyntaxError', 1> {}
