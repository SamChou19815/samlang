import { ENCODED_COMPILED_PROGRAM_MAIN } from '../ast/common/name-encoder';
import { MidIRExpression, MidIRStatement, MidIRFunction, MidIRCompilationUnit } from '../ast/mir';
import { assertNotNull } from '../util/type-assertions';

const collectUsedNamesFromExpression = (set: Set<string>, expression: MidIRExpression): void => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRTemporaryExpression':
      return;
    case 'MidIRNameExpression':
      set.add(expression.name);
      break;
    case 'MidIRImmutableMemoryExpression':
      collectUsedNamesFromExpression(set, expression.indexExpression);
      break;
    case 'MidIRBinaryExpression':
      collectUsedNamesFromExpression(set, expression.e1);
      collectUsedNamesFromExpression(set, expression.e2);
      break;
  }
};

const collectUsedNamesFromStatement = (set: Set<string>, statement: MidIRStatement): void => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      collectUsedNamesFromExpression(set, statement.source);
      break;
    case 'MidIRMoveMemStatement':
      collectUsedNamesFromExpression(set, statement.source);
      collectUsedNamesFromExpression(set, statement.memoryIndexExpression);
      break;
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      break;
    case 'MidIRCallFunctionStatement':
      collectUsedNamesFromExpression(set, statement.functionExpression);
      statement.functionArguments.forEach((it) => collectUsedNamesFromExpression(set, it));
      break;
    case 'MidIRConditionalJumpFallThrough':
      collectUsedNamesFromExpression(set, statement.conditionExpression);
      break;
    case 'MidIRReturnStatement':
      if (statement.returnedExpression != null) {
        collectUsedNamesFromExpression(set, statement.returnedExpression);
      }
      break;
  }
};

const getOtherFunctionsUsedByGivenFunction = (
  midIRFunction: MidIRFunction
): ReadonlySet<string> => {
  const set = new Set<string>();
  midIRFunction.mainBodyStatements.forEach((it) => collectUsedNamesFromStatement(set, it));
  set.delete(midIRFunction.functionName);
  return set;
};

const analyzeUsedFunctionNames = ({ functions }: MidIRCompilationUnit): ReadonlySet<string> => {
  const usedFunctionMap = new Map(
    functions.map((it) => [it.functionName, getOtherFunctionsUsedByGivenFunction(it)])
  );

  const used = new Set<string>();
  used.add(ENCODED_COMPILED_PROGRAM_MAIN);
  const stack = [ENCODED_COMPILED_PROGRAM_MAIN];
  while (stack.length > 0) {
    const functionName = stack.pop();
    assertNotNull(functionName);
    const usedByThisFunction = usedFunctionMap.get(functionName);
    if (usedByThisFunction == null) {
      // It's possible since `functionName` could be a builtin function.
      // eslint-disable-next-line no-continue
      continue;
    }
    usedByThisFunction.forEach((usedFunction) => {
      if (!used.has(usedFunction)) {
        used.add(usedFunction);
        stack.push(usedFunction);
      }
    });
  }

  return used;
};

export default analyzeUsedFunctionNames;
