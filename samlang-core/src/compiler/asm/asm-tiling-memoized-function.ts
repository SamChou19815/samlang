import type { MidIRStatement, MidIRExpression } from '../../ast/mir';

/** The utility class used to memoize function application. */
class AssemblyTilingMemoizedFunction<T, R> {
  private readonly memoizedIO: Map<T, R> = new Map();

  constructor(private readonly computeFreshResult: (e: T) => R) {}

  invoke = (functionArgument: T): R => {
    const output = this.memoizedIO.get(functionArgument);
    if (output != null) return output;
    const freshOutput = this.computeFreshResult(functionArgument);
    this.memoizedIO.set(functionArgument, freshOutput);
    return freshOutput;
  };
}

export const getMemoizedAssemblyStatementTilingFunction = <R>(
  computeFreshResult: (statement: MidIRStatement) => R
): ((statement: MidIRStatement) => R) => {
  const memorizedFunction = new AssemblyTilingMemoizedFunction(computeFreshResult);
  return memorizedFunction.invoke;
};

export const getMemoizedAssemblyExpressionTilingFunction = <R>(
  computeFreshResult: (expression: MidIRExpression) => R
): ((expression: MidIRExpression) => R) => {
  const memorizedFunction = new AssemblyTilingMemoizedFunction(computeFreshResult);
  return memorizedFunction.invoke;
};
