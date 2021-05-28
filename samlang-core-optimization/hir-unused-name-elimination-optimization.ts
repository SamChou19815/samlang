import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import type { HighIRType } from 'samlang-core-ast/hir-types';
import { checkNotNull } from 'samlang-core-utils';

const collectForTypeSet = (type: HighIRType, typeSet: Set<string>): void => {
  if (type.__type__ === 'IdentifierType') typeSet.add(type.name);
};

const collectUsedNamesFromExpression = (
  nameSet: Set<string>,
  typeSet: Set<string>,
  expression: HighIRExpression
): void => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRVariableExpression':
      break;
    case 'HighIRNameExpression':
      nameSet.add(expression.name);
      break;
  }
  collectForTypeSet(expression.type, typeSet);
};

const collectUsedNamesFromStatement = (
  nameSet: Set<string>,
  typeSet: Set<string>,
  statement: HighIRStatement
): void => {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.pointerExpression);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'HighIRBinaryStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.e1);
      collectUsedNamesFromExpression(nameSet, typeSet, statement.e2);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'HighIRFunctionCallStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.functionExpression);
      statement.functionArguments.forEach((it) =>
        collectUsedNamesFromExpression(nameSet, typeSet, it)
      );
      collectForTypeSet(statement.returnType, typeSet);
      break;
    case 'HighIRIfElseStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.booleanExpression);
      statement.s1.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      statement.s2.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      statement.finalAssignments.forEach((finalAssignment) => {
        collectUsedNamesFromExpression(nameSet, typeSet, finalAssignment.branch1Value);
        collectUsedNamesFromExpression(nameSet, typeSet, finalAssignment.branch2Value);
        collectForTypeSet(finalAssignment.type, typeSet);
      });
      break;
    case 'HighIRSingleIfStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.booleanExpression);
      statement.statements.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      break;
    case 'HighIRBreakStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.breakValue);
      break;
    case 'HighIRWhileStatement':
      statement.loopVariables.forEach((it) => {
        collectForTypeSet(it.type, typeSet);
        collectUsedNamesFromExpression(nameSet, typeSet, it.initialValue);
        collectUsedNamesFromExpression(nameSet, typeSet, it.loopValue);
      });
      statement.statements.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      if (statement.breakCollector != null) {
        collectForTypeSet(statement.breakCollector.type, typeSet);
      }
      break;
    case 'HighIRCastStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.assignedExpression);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'HighIRStructInitializationStatement':
      statement.expressionList.forEach((it) =>
        collectUsedNamesFromExpression(nameSet, typeSet, it)
      );
      collectForTypeSet(statement.type, typeSet);
      break;
  }
};

const getOtherFunctionsUsedByGivenFunction = (
  highIRFunction: HighIRFunction
): readonly [ReadonlySet<string>, ReadonlySet<string>] => {
  const nameSet = new Set<string>();
  const typeSet = new Set<string>();
  highIRFunction.body.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
  highIRFunction.type.argumentTypes.forEach((it) => collectForTypeSet(it, typeSet));
  collectForTypeSet(highIRFunction.type.returnType, typeSet);
  collectUsedNamesFromExpression(nameSet, typeSet, highIRFunction.returnValue);
  nameSet.delete(highIRFunction.name);
  return [nameSet, typeSet];
};

const analyzeUsedFunctionNamesAndTypeNames = (
  functions: readonly HighIRFunction[]
): readonly [ReadonlySet<string>, ReadonlySet<string>] => {
  const usedFunctionMap = new Map(
    functions.map((it) => [it.name, getOtherFunctionsUsedByGivenFunction(it)])
  );

  const usedNames = new Set<string>();
  usedNames.add(ENCODED_COMPILED_PROGRAM_MAIN);
  const stack = [ENCODED_COMPILED_PROGRAM_MAIN];
  while (stack.length > 0) {
    const functionName = checkNotNull(stack.pop());
    const usedByThisFunction = usedFunctionMap.get(functionName)?.[0];
    if (usedByThisFunction == null) {
      // It's possible since `functionName` could be a builtin function.
      continue;
    }
    usedByThisFunction.forEach((usedFunction) => {
      if (!usedNames.has(usedFunction)) {
        usedNames.add(usedFunction);
        stack.push(usedFunction);
      }
    });
  }

  const usedTypes = new Set(
    Array.from(usedNames).flatMap((it) => Array.from(usedFunctionMap.get(it)?.[1] ?? []))
  );
  return [usedNames, usedTypes];
};

const optimizeHighIRModuleByEliminatingUnusedOnes = (highIRModule: HighIRModule): HighIRModule => {
  const [usedNames, usedTypes] = analyzeUsedFunctionNamesAndTypeNames(highIRModule.functions);
  const globalVariables = highIRModule.globalVariables.filter((it) => usedNames.has(it.name));
  const typeDefinitions = highIRModule.typeDefinitions.filter((it) => usedTypes.has(it.identifier));
  const functions = highIRModule.functions.filter((it) => usedNames.has(it.name));
  return { globalVariables, typeDefinitions, functions };
};

export default optimizeHighIRModuleByEliminatingUnusedOnes;
