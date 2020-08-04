import { MidIRExpression, midIRExpressionToString } from '../../ast/mir';
import { Hashable, HashMap, hashMapOf } from '../../util/collections';

class MidIRExpressionWrapper implements Hashable {
  constructor(public readonly expression: MidIRExpression) {}

  uniqueHash(): string {
    return midIRExpressionToString(this.expression);
  }
}

/** The utility class used to memoize function application. */
class AssemblyTilingMemoizedFunction<R> {
  private readonly memoizedIO: HashMap<MidIRExpressionWrapper, R> = hashMapOf();

  constructor(private readonly computeFreshResult: (expression: MidIRExpression) => R) {}

  invoke = (expression: MidIRExpression): R => {
    const wrapped = new MidIRExpressionWrapper(expression);
    const output = this.memoizedIO.get(wrapped);
    if (output != null) return output;
    const freshOutput = this.computeFreshResult(expression);
    this.memoizedIO.set(wrapped, freshOutput);
    return freshOutput;
  };
}

const getMemoizedAssemblyTilingFunction = <R>(
  computeFreshResult: (expression: MidIRExpression) => R
): ((expression: MidIRExpression) => R) => {
  const memorizedFunction = new AssemblyTilingMemoizedFunction(computeFreshResult);
  return memorizedFunction.invoke;
};

export default getMemoizedAssemblyTilingFunction;
