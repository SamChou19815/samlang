import {
  MidIRStatement,
  MidIRExpression,
  midIRStatementToString,
  midIRExpressionToString,
} from '../../ast/mir';
import { Hashable, HashMap, hashMapOf } from '../../util/collections';

class Wrapper<E> implements Hashable {
  constructor(public readonly element: E, private readonly toStringFunction: (e: E) => string) {}

  uniqueHash(): string {
    return this.toStringFunction(this.element);
  }
}

/** The utility class used to memoize function application. */
class AssemblyTilingMemoizedFunction<T, R> {
  private readonly memoizedIO: HashMap<Wrapper<T>, R> = hashMapOf();

  constructor(
    private readonly toStringFunction: (e: T) => string,
    private readonly computeFreshResult: (e: T) => R
  ) {}

  invoke = (functionArgument: T): R => {
    const wrapped = new Wrapper(functionArgument, this.toStringFunction);
    const output = this.memoizedIO.get(wrapped);
    if (output != null) return output;
    const freshOutput = this.computeFreshResult(functionArgument);
    this.memoizedIO.set(wrapped, freshOutput);
    return freshOutput;
  };
}

export const getMemoizedAssemblyStatementTilingFunction = <R>(
  computeFreshResult: (statement: MidIRStatement) => R
): ((statement: MidIRStatement) => R) => {
  const memorizedFunction = new AssemblyTilingMemoizedFunction(
    midIRStatementToString,
    computeFreshResult
  );
  return memorizedFunction.invoke;
};

export const getMemoizedAssemblyExpressionTilingFunction = <R>(
  computeFreshResult: (expression: MidIRExpression) => R
): ((expression: MidIRExpression) => R) => {
  const memorizedFunction = new AssemblyTilingMemoizedFunction(
    midIRExpressionToString,
    computeFreshResult
  );
  return memorizedFunction.invoke;
};
