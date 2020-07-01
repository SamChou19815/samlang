import type ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import type { CompileTimeError, SyntaxError } from './error-definitions';

interface ReadonlyGlobalErrorCollector {
  getErrors(): readonly CompileTimeError[];

  getModuleErrorCollector(moduleReference: ModuleReference): ModuleErrorCollector;
}

interface WriteOnlyGlobalErrorCollector {
  reportError(error: CompileTimeError): void;
}

export class ModuleErrorCollector {
  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly collectorDelegate: WriteOnlyGlobalErrorCollector
  ) {}

  reportSyntaxError(range: Range, reason: string): void {
    const syntaxError: SyntaxError = {
      errorType: 'SyntaxError',
      errorCode: 1,
      moduleReference: this.moduleReference,
      range,
      reason,
    };
    this.collectorDelegate.reportError(syntaxError);
  }
}

class GlobalErrorCollector implements ReadonlyGlobalErrorCollector, WriteOnlyGlobalErrorCollector {
  private readonly errors: CompileTimeError[] = [];

  getErrors(): readonly CompileTimeError[] {
    return this.errors;
  }

  getModuleErrorCollector(moduleReference: ModuleReference): ModuleErrorCollector {
    return new ModuleErrorCollector(moduleReference, this);
  }

  reportError(error: CompileTimeError): void {
    this.errors.push(error);
  }
}

export const createGlobalErrorCollector = (): ReadonlyGlobalErrorCollector =>
  new GlobalErrorCollector();
