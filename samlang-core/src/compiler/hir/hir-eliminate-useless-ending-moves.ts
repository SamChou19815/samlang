import { HighIRStatement, HIR_IF_ELSE } from '../../ast/hir/hir-expressions';

const eliminateUselessEndingMoveForHighIRStatementsHelper = (
  statements: readonly HighIRStatement[],
  indexOfFinalStatement: number
): readonly HighIRStatement[] => {
  // istanbul ignore next
  if (indexOfFinalStatement <= 0) return [];
  const statementBeforeReturn = statements[indexOfFinalStatement - 1];
  switch (statementBeforeReturn.__type__) {
    case 'HighIRFunctionCallStatement':
      // We cannot safely ignore a function call.
      return statements.slice(0, indexOfFinalStatement);
    case 'HighIRIfElseStatement': {
      const s1 = eliminateUselessEndingMoveForHighIRStatementsHelper(
        statementBeforeReturn.s1,
        statementBeforeReturn.s1.length
      );
      const s2 = eliminateUselessEndingMoveForHighIRStatementsHelper(
        statementBeforeReturn.s2,
        statementBeforeReturn.s2.length
      );
      if (s1.length + s2.length === 0) {
        return eliminateUselessEndingMoveForHighIRStatementsHelper(
          statements,
          indexOfFinalStatement - 1
        );
      }
      return [
        ...statements.slice(0, indexOfFinalStatement - 1),
        HIR_IF_ELSE({
          booleanExpression: statementBeforeReturn.booleanExpression,
          s1,
          s2,
        }),
      ];
    }
    default:
      // HighIRWhileTrueStatement: The return statement will be unreachable, so no point to check this.
      // Others: a statement with no side effect, which can be safely eliminated.
      return eliminateUselessEndingMoveForHighIRStatementsHelper(
        statements,
        indexOfFinalStatement - 1
      );
  }
};

/**
 * Similar to `coalesceMoveAndReturnWithForHighIRStatements`. This is the version that handles the
 * case when there is no final return.
 */
const eliminateUselessEndingMoveForHighIRStatements = (
  statements: readonly HighIRStatement[]
): readonly HighIRStatement[] =>
  eliminateUselessEndingMoveForHighIRStatementsHelper(statements, statements.length);

export default eliminateUselessEndingMoveForHighIRStatements;
