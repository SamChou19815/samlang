import { HighIRStatement, HIR_IF_ELSE, HIR_RETURN } from '../../ast/hir/hir-expressions';

/**
 * @param statements A full list of statements.
 * @param indexOfFinalReturnStatement The marker for the effective list of statements to consider.
 * It is used to avoid O(n) copying of the statement list
 * @param possibleVariablesToBeReturned a list of variables that could be returned by the return
 * statement.
 * @returns null if it's hopeless to coalesce return and move further up. Otherwise, returns a list of
 * statements after coalescing is done.
 */
const coalesceMoveAndReturnWithForHighIRStatementsWithKnownReturnedVariable = (
  statements: readonly HighIRStatement[],
  indexOfFinalReturnStatement: number,
  possibleVariablesToBeReturned: readonly string[]
): readonly HighIRStatement[] | null => {
  // istanbul ignore next
  if (indexOfFinalReturnStatement <= 0) return null;
  const statementBeforeReturn = statements[indexOfFinalReturnStatement - 1];
  switch (statementBeforeReturn.__type__) {
    case 'HighIRIfElseStatement': {
      const { booleanExpression, s1, s2 } = statementBeforeReturn;
      const trueBranchResult = coalesceMoveAndReturnWithForHighIRStatementsWithKnownReturnedVariable(
        s1,
        s1.length,
        possibleVariablesToBeReturned
      );
      const falseBranchResult = coalesceMoveAndReturnWithForHighIRStatementsWithKnownReturnedVariable(
        s2,
        s2.length,
        possibleVariablesToBeReturned
      );
      // istanbul ignore next
      if (trueBranchResult == null || falseBranchResult == null) return null;
      return [
        ...statements.slice(0, indexOfFinalReturnStatement - 1),
        HIR_IF_ELSE({
          booleanExpression,
          s1: trueBranchResult,
          s2: falseBranchResult,
        }),
      ];
    }
    case 'HighIRLetDefinitionStatement': {
      const { name, assignedExpression } = statementBeforeReturn;
      if (!possibleVariablesToBeReturned.includes(name)) return null;
      // We can coalesce! We hit the case: `let a = <some stuff>; return a;`
      // We can turn it into `return <some stuff>;`
      if (assignedExpression.__type__ === 'HighIRVariableExpression') {
        // This is the case when `let a = b; return a;`
        // Let's see whether we can perform coalesing further down the road.
        const deeperCoalescingResult = coalesceMoveAndReturnWithForHighIRStatementsWithKnownReturnedVariable(
          statements,
          indexOfFinalReturnStatement - 1,
          [...possibleVariablesToBeReturned, assignedExpression.name]
        );
        if (deeperCoalescingResult != null) return deeperCoalescingResult;
      }
      // This is the best we can go, perform coalescing here.
      return [
        ...statements.slice(0, indexOfFinalReturnStatement - 1),
        HIR_RETURN(assignedExpression),
      ];
    }
    default:
      // HighIRWhileTrueStatement: The return statement will be unreachable, so no point to check this.
      // Others: not a move, cannot coalesce.
      return null;
  }
};

/**
 * For tail recursive call transformations, we have a detection problem. A source level tailrec
 * function call like `return fff(a, b)` might be translated into the following in HIR:
 *
 * ```js
 * _t0 = fff(a, b);
 * _t1 = _t0
 * return _t1;
 * ```
 *
 * It can also be made much worse when the tailrec function call is in an if-else. For example,
 * the factorial function `fact(n, acc) -> if (n == 0) 1 else fact(n - 1, n * acc)` might become:
 *
 * ```js
 * if (n == 0) {
 *   _t1 = 1;
 * } else {
 *   _t0 = fact(n - 1, n * acc);
 *   _t1 = _t0;
 * }
 * return _t1
 * ```
 *
 * To make tailrec transformation easier, we need to transform the statements so that return call
 * and function call are colocated. This requires us to do the move-return coalescing transformation
 * here. After this transformation, the above two examples would become:
 *
 * ```js
 * // example 1
 * _t0 = fff(a, b);
 * return _t0;
 *
 * // example 2
 * if (n == 0) {
 *   return 1;
 * } else {
 *   _t0 = fact(n - 1, n * acc);
 *   return _t0;
 * }
 * ```
 *
 * Although we are still limited by the fact that `return` cannot return a function result directly,
 * at least we now have the guarantee that they are only 1-statement apart and must be in the same
 * block.
 */
const coalesceMoveAndReturnWithForHighIRStatements = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] => {
  if (statements.length === 0) return statements;
  const lastStatement = statements[statements.length - 1];
  if (lastStatement.__type__ !== 'HighIRReturnStatement') return statements;
  // If the last statement is return, then it must be the only return.
  // This is guaranteed by the implementation of HIR compiler.
  const returnedExpression = lastStatement.expression;
  if (returnedExpression.__type__ !== 'HighIRVariableExpression') return statements;
  return (
    coalesceMoveAndReturnWithForHighIRStatementsWithKnownReturnedVariable(
      statements,
      statements.length - 1,
      [returnedExpression.name]
    ) ?? statements
  );
};

export default coalesceMoveAndReturnWithForHighIRStatements;
