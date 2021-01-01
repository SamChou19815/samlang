import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import { assertNotNull } from 'samlang-core-utils';

const collectUsedNamesFromExpression = (set: Set<string>, expression: HighIRExpression): void => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRStringLiteralExpression':
    case 'HighIRVariableExpression':
      break;
    case 'HighIRNameExpression':
      set.add(expression.name);
      break;
    case 'HighIRIndexAccessExpression':
      collectUsedNamesFromExpression(set, expression.expression);
      break;
    case 'HighIRBinaryExpression':
      collectUsedNamesFromExpression(set, expression.e1);
      collectUsedNamesFromExpression(set, expression.e2);
      break;
  }
};

const collectUsedNamesFromStatement = (set: Set<string>, statement: HighIRStatement): void => {
  switch (statement.__type__) {
    case 'HighIRFunctionCallStatement':
      collectUsedNamesFromExpression(set, statement.functionExpression);
      statement.functionArguments.forEach((it) => collectUsedNamesFromExpression(set, it));
      break;
    case 'HighIRWhileTrueStatement':
      statement.statements.forEach((it) => collectUsedNamesFromStatement(set, it));
      break;
    case 'HighIRIfElseStatement':
      collectUsedNamesFromExpression(set, statement.booleanExpression);
      statement.s1.forEach((it) => collectUsedNamesFromStatement(set, it));
      statement.s2.forEach((it) => collectUsedNamesFromStatement(set, it));
      break;
    case 'HighIRLetDefinitionStatement':
      collectUsedNamesFromExpression(set, statement.assignedExpression);
      break;
    case 'HighIRStructInitializationStatement':
      statement.expressionList.forEach((it) => collectUsedNamesFromExpression(set, it));
      break;
    case 'HighIRReturnStatement':
      collectUsedNamesFromExpression(set, statement.expression);
      break;
  }
};

const getOtherFunctionsUsedByGivenFunction = (
  highIRFunction: HighIRFunction
): ReadonlySet<string> => {
  const set = new Set<string>();
  highIRFunction.body.forEach((it) => collectUsedNamesFromStatement(set, it));
  set.delete(highIRFunction.name);
  return set;
};

const analyzeUsedFunctionNames = (functions: readonly HighIRFunction[]): ReadonlySet<string> => {
  const usedFunctionMap = new Map(
    functions.map((it) => [it.name, getOtherFunctionsUsedByGivenFunction(it)])
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
