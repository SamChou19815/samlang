import { ENCODED_COMPILED_PROGRAM_MAIN } from 'samlang-core-ast/common-names';
import type {
  MidIRExpression,
  MidIRStatement,
  MidIRFunction,
  MidIRModule,
  MidIRType,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const collectForTypeSet = (type: MidIRType, typeSet: Set<string>): void => {
  if (type.__type__ === 'IdentifierType') typeSet.add(type.name);
};

const collectUsedNamesFromExpression = (
  nameSet: Set<string>,
  typeSet: Set<string>,
  expression: MidIRExpression
): void => {
  switch (expression.__type__) {
    case 'MidIRIntLiteralExpression':
    case 'MidIRVariableExpression':
      break;
    case 'MidIRNameExpression':
      nameSet.add(expression.name);
      break;
  }
  collectForTypeSet(expression.type, typeSet);
};

const collectUsedNamesFromStatement = (
  nameSet: Set<string>,
  typeSet: Set<string>,
  statement: MidIRStatement
): void => {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.pointerExpression);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'MidIRBinaryStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.e1);
      collectUsedNamesFromExpression(nameSet, typeSet, statement.e2);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'MidIRFunctionCallStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.functionExpression);
      statement.functionArguments.forEach((it) =>
        collectUsedNamesFromExpression(nameSet, typeSet, it)
      );
      collectForTypeSet(statement.returnType, typeSet);
      break;
    case 'MidIRIfElseStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.booleanExpression);
      statement.s1.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      statement.s2.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      statement.finalAssignments.forEach((finalAssignment) => {
        collectUsedNamesFromExpression(nameSet, typeSet, finalAssignment.branch1Value);
        collectUsedNamesFromExpression(nameSet, typeSet, finalAssignment.branch2Value);
        collectForTypeSet(finalAssignment.type, typeSet);
      });
      break;
    case 'MidIRSingleIfStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.booleanExpression);
      statement.statements.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
      break;
    case 'MidIRBreakStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.breakValue);
      break;
    case 'MidIRWhileStatement':
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
    case 'MidIRCastStatement':
      collectUsedNamesFromExpression(nameSet, typeSet, statement.assignedExpression);
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'MidIRStructInitializationStatement':
      statement.expressionList.forEach((it) =>
        collectUsedNamesFromExpression(nameSet, typeSet, it)
      );
      collectForTypeSet(statement.type, typeSet);
      break;
  }
};

const getOtherFunctionsUsedByGivenFunction = (
  midIRFunction: MidIRFunction
): readonly [ReadonlySet<string>, ReadonlySet<string>] => {
  const nameSet = new Set<string>();
  const typeSet = new Set<string>();
  midIRFunction.body.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
  midIRFunction.type.argumentTypes.forEach((it) => collectForTypeSet(it, typeSet));
  collectForTypeSet(midIRFunction.type.returnType, typeSet);
  collectUsedNamesFromExpression(nameSet, typeSet, midIRFunction.returnValue);
  nameSet.delete(midIRFunction.name);
  return [nameSet, typeSet];
};

const analyzeUsedFunctionNamesAndTypeNames = (
  functions: readonly MidIRFunction[]
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

const optimizeMidIRModuleByEliminatingUnusedOnes = (midIRModule: MidIRModule): MidIRModule => {
  const [usedNames, usedTypes] = analyzeUsedFunctionNamesAndTypeNames(midIRModule.functions);
  const globalVariables = midIRModule.globalVariables.filter((it) => usedNames.has(it.name));
  const typeDefinitions = midIRModule.typeDefinitions.filter((it) => usedTypes.has(it.identifier));
  const functions = midIRModule.functions.filter((it) => usedNames.has(it.name));
  return { globalVariables, typeDefinitions, functions };
};

export default optimizeMidIRModuleByEliminatingUnusedOnes;
