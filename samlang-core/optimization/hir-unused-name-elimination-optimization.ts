import type {
  HighIRExpression,
  HighIRFunction,
  HighIRSources,
  HighIRStatement,
  HighIRType,
} from '../ast/hir-nodes';
import { checkNotNull } from '../utils';

function collectForTypeSet(type: HighIRType, typeSet: Set<string>): void {
  if (type.__type__ === 'IdentifierType') typeSet.add(type.name);
}

function collectUsedNamesFromExpression(
  nameSet: Set<string>,
  typeSet: Set<string>,
  expression: HighIRExpression,
): void {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRVariableExpression':
      break;
    case 'HighIRStringNameExpression':
    case 'HighIRFunctionNameExpression':
      nameSet.add(expression.name);
      break;
  }
  collectForTypeSet(expression.type, typeSet);
}

function collectUsedNamesFromStatement(
  nameSet: Set<string>,
  typeSet: Set<string>,
  statement: HighIRStatement,
): void {
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
        collectUsedNamesFromExpression(nameSet, typeSet, it),
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
    case 'HighIRStructInitializationStatement':
      statement.expressionList.forEach((it) =>
        collectUsedNamesFromExpression(nameSet, typeSet, it),
      );
      collectForTypeSet(statement.type, typeSet);
      break;
    case 'HighIRClosureInitializationStatement':
      nameSet.add(statement.functionName);
      collectUsedNamesFromExpression(nameSet, typeSet, statement.context);
      collectForTypeSet(statement.functionType, typeSet);
      collectForTypeSet(statement.closureType, typeSet);
      break;
  }
}

function getOtherFunctionsUsedByGivenFunction(
  highIRFunction: HighIRFunction,
): readonly [ReadonlySet<string>, ReadonlySet<string>] {
  const nameSet = new Set<string>();
  const typeSet = new Set<string>();
  highIRFunction.body.forEach((it) => collectUsedNamesFromStatement(nameSet, typeSet, it));
  highIRFunction.type.argumentTypes.forEach((it) => collectForTypeSet(it, typeSet));
  collectForTypeSet(highIRFunction.type.returnType, typeSet);
  collectUsedNamesFromExpression(nameSet, typeSet, highIRFunction.returnValue);
  nameSet.delete(highIRFunction.name);
  return [nameSet, typeSet];
}

function analyzeUsedFunctionNamesAndTypeNames(
  functions: readonly HighIRFunction[],
  entryPoints: readonly string[],
): readonly [ReadonlySet<string>, ReadonlySet<string>] {
  const usedFunctionMap = new Map(
    functions.map((it) => [it.name, getOtherFunctionsUsedByGivenFunction(it)]),
  );

  const usedNames = new Set<string>();
  entryPoints.forEach((it) => usedNames.add(it));
  const stack = [...entryPoints];
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
    Array.from(usedNames).flatMap((it) => Array.from(usedFunctionMap.get(it)?.[1] ?? [])),
  );
  return [usedNames, usedTypes];
}

export default function optimizeHighIRSourcesByEliminatingUnusedOnes(
  sources: HighIRSources,
): HighIRSources {
  const [usedNames, usedTypes] = analyzeUsedFunctionNamesAndTypeNames(
    sources.functions,
    sources.mainFunctionNames,
  );
  const globalVariables = sources.globalVariables.filter((it) => usedNames.has(it.name));
  const typeDefinitions = sources.typeDefinitions.filter((it) => usedTypes.has(it.identifier));
  const closureTypes = sources.closureTypes.filter((it) => usedTypes.has(it.identifier));
  const functions = sources.functions.filter((it) => usedNames.has(it.name));
  return {
    globalVariables,
    typeDefinitions,
    closureTypes,
    mainFunctionNames: sources.mainFunctionNames,
    functions,
  };
}
