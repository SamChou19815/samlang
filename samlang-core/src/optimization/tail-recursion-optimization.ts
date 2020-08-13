/* eslint-disable no-continue */

import {
  MidIRFunction,
  MidIRStatement,
  MIR_LABEL,
  MidIRCallFunctionStatement,
  MIR_MOVE_TEMP,
  MIR_TEMP,
  MIR_JUMP,
} from '../ast/mir';
import { optimizeIrWithSimpleOptimization } from './simple-optimizations';

const collectValidSelfCallIndices = (midIRFunction: MidIRFunction): ReadonlySet<number> => {
  const sellCallIds = new Set<number>();
  const oldStatements = midIRFunction.mainBodyStatements;
  oldStatements.forEach((statement, index) => {
    if (index >= oldStatements.length - 1) return;
    if (statement.__type__ !== 'MidIRCallFunctionStatement') return;
    const { functionExpression, returnCollectorTemporaryID } = statement;
    if (
      functionExpression.__type__ !== 'MidIRNameExpression' ||
      functionExpression.name !== midIRFunction.functionName
    ) {
      return;
    }

    // Due to how lowering works in earlier stages, we never have the luxury of detecting tail
    // recursive call in a syntax-directed way, like RETURN(callMySelf(...)).
    // Instead, some gargage moves might have been injected in between a call and a final return.
    // The following loop conservatively detects this pattern.
    const acceptableCollectors =
      returnCollectorTemporaryID == null
        ? new Set<string>()
        : new Set([returnCollectorTemporaryID]);
    for (
      let nextStatementIndex = index + 1;
      nextStatementIndex < oldStatements.length;
      nextStatementIndex += 1
    ) {
      const nextStatement = oldStatements[nextStatementIndex];
      // The presence of the label has no runtime effect, so we can safely ignore it.
      if (nextStatement.__type__ === 'MidIRLabelStatement') continue;
      // The result of function is put into a temp.
      // This temp might be assigned to other temps.
      // As long the final returned temp is among this chain of assignments, it is fine.

      // Good Example:
      //   a = call(...)
      //   b = a;
      //   c = b;
      //   return c;

      // Bad Example:
      //   a = call(...);
      //   b = a;
      //   // NOTE: garbage is not among the `acceptableCollectors`. Everything gets invalidated.
      //   b = garbage;
      //   return b;

      if (nextStatement.__type__ === 'MidIRMoveTempStatement') {
        if (
          nextStatement.source.__type__ !== 'MidIRTemporaryExpression' ||
          !acceptableCollectors.has(nextStatement.source.temporaryID)
        ) {
          return;
        }
        acceptableCollectors.add(nextStatement.temporaryID);
      } else if (nextStatement.__type__ === 'MidIRReturnStatement') {
        const { returnedExpression } = nextStatement;
        if (
          returnedExpression != null &&
          (returnedExpression.__type__ !== 'MidIRTemporaryExpression' ||
            !acceptableCollectors.has(returnedExpression.temporaryID))
        ) {
          return;
        }
        sellCallIds.add(index);
        break;
      } else {
        return;
      }
    }
  });

  return sellCallIds;
};

const optimizeIRWithTailRecursiveCallTransformation = (
  midIRFunction: MidIRFunction
): MidIRFunction => {
  const sellCallIds = collectValidSelfCallIndices(midIRFunction);
  if (sellCallIds.size === 0) return midIRFunction;

  const startLabel = `LABEL_TAIL_REC_OPTIMIZATION_FOR_${midIRFunction.functionName}`;
  const newStatements: MidIRStatement[] = [MIR_LABEL(startLabel)];
  midIRFunction.mainBodyStatements.forEach((statement, index) => {
    if (!sellCallIds.has(index)) {
      newStatements.push(statement);
      return;
    }
    const callFunction = statement as MidIRCallFunctionStatement;
    const { functionArguments } = callFunction;
    const len = midIRFunction.argumentNames.length;
    // istanbul ignore next
    if (len !== functionArguments.length) throw new Error();
    functionArguments.forEach((functionArgument, i) => {
      newStatements.push(MIR_MOVE_TEMP(MIR_TEMP(`_OPT_TAIL_REC_ARG_TEMP_${i}`), functionArgument));
    });
    midIRFunction.argumentNames.forEach((temp, i) => {
      newStatements.push(MIR_MOVE_TEMP(MIR_TEMP(temp), MIR_TEMP(`_OPT_TAIL_REC_ARG_TEMP_${i}`)));
    });
    newStatements.push(MIR_JUMP(startLabel));
  });

  return { ...midIRFunction, mainBodyStatements: optimizeIrWithSimpleOptimization(newStatements) };
};

export default optimizeIRWithTailRecursiveCallTransformation;
