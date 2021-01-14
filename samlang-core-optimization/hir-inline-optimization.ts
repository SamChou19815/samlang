import type { HighIRStatement } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';

/** The threshold max tolerable cost of inlining.  */
const INLINE_THRESHOLD = 25;
/** The threshold max tolerable cost of performing inlining.  */
const PERFORM_INLINE_THRESHOLD = 1000;

const estimateStatementInlineCost = (statement: HighIRStatement): number => {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      return 2;
    case 'HighIRBinaryStatement':
    case 'HighIRCastStatement':
    case 'HighIRReturnStatement':
      return 1;
    case 'HighIRFunctionCallStatement':
      return 10;
    case 'HighIRIfElseStatement':
      return (
        1 +
        statement.s1.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        statement.s2.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        (statement.finalAssignment == null ? 0 : 2)
      );
    case 'HighIRSwitchStatement':
      return (
        1 +
        (statement.finalAssignment == null ? 0 : statement.finalAssignment.branchValues.length) +
        statement.cases.reduce(
          (caseAccumulator, { statements }) =>
            caseAccumulator +
            statements.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0),
          0
        )
      );
    case 'HighIRStructInitializationStatement':
      return 1 + statement.expressionList.length;
  }
};

// eslint-disable-next-line import/prefer-default-export
export const estimateFunctionInlineCost_EXPOSED_FOR_TESTING = (
  highIRFunction: HighIRFunction
): number => highIRFunction.body.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);
