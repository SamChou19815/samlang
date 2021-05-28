import optimizeMidIRFunctionByConditionalConstantPropagation from './mir-conditional-constant-propagation-optimization';
import { LocalValueContextForOptimization } from './mir-optimization-common';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

import {
  MidIRStatement,
  MidIRExpression,
  MIR_ZERO,
  MIR_VARIABLE,
} from 'samlang-core-ast/mir-expressions';
import type { MidIRFunction } from 'samlang-core-ast/mir-toplevel';
import type { MidIRType } from 'samlang-core-ast/mir-types';
import { checkNotNull, isNotNull, zip, zip3 } from 'samlang-core-utils';

/** The threshold max tolerable cost of inlining.  */
const INLINE_THRESHOLD = 20;
/** The threshold max tolerable cost of performing inlining.  */
const PERFORM_INLINE_THRESHOLD = 1000;

const estimateStatementInlineCost = (statement: MidIRStatement): number => {
  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      return 2;
    case 'MidIRBinaryStatement':
    case 'MidIRCastStatement':
      return 1;
    case 'MidIRFunctionCallStatement':
      return 10;
    case 'MidIRIfElseStatement':
      return (
        1 +
        statement.s1.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        statement.s2.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        statement.finalAssignments.length * 2
      );
    case 'MidIRSingleIfStatement':
      return 1 + statement.statements.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);
    case 'MidIRBreakStatement':
      return 1;
    case 'MidIRWhileStatement':
      return (
        1 +
        statement.loopVariables.length * 2 +
        statement.statements.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0)
      );
    case 'MidIRStructInitializationStatement':
      return 1 + statement.expressionList.length;
  }
};

export const estimateFunctionInlineCost_EXPOSED_FOR_TESTING = (
  midIRFunction: MidIRFunction
): number => midIRFunction.body.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);

const getFunctionsToInline = (
  functions: readonly MidIRFunction[]
): {
  readonly functionsThatCanPerformInlining: ReadonlySet<string>;
  readonly functionsThatCanBeInlined: ReadonlySet<string>;
} => {
  const functionsThatCanBeInlined = new Set<string>();
  const functionsThatCanPerformInlining = new Set<string>();

  functions.forEach((midIRFunction) => {
    const cost = estimateFunctionInlineCost_EXPOSED_FOR_TESTING(midIRFunction);
    if (cost <= INLINE_THRESHOLD) {
      functionsThatCanBeInlined.add(midIRFunction.name);
    }
    if (cost <= PERFORM_INLINE_THRESHOLD) {
      functionsThatCanPerformInlining.add(midIRFunction.name);
    }
  });

  return { functionsThatCanPerformInlining, functionsThatCanBeInlined };
};

const inlineRewriteExpression = (
  expression: MidIRExpression,
  context: LocalValueContextForOptimization
): MidIRExpression => {
  if (expression.__type__ !== 'MidIRVariableExpression') return expression;
  const binded = context.getLocalValueType(expression.name);
  return binded ?? expression;
};

const inlineRewriteForStatement = (
  prefix: string,
  context: LocalValueContextForOptimization,
  returnCollector: Readonly<{ name: string; type: MidIRType }> | undefined,
  statement: MidIRStatement
): MidIRStatement => {
  const rewrite = (expression: MidIRExpression): MidIRExpression => {
    if (expression.__type__ !== 'MidIRVariableExpression') return expression;
    const binded = context.getLocalValueType(expression.name);
    return binded ?? expression;
  };

  const bindWithMangledName = (name: string, type: MidIRType): string => {
    const mangledName = `${prefix}${name}`;
    context.bind(name, MIR_VARIABLE(mangledName, type));
    return mangledName;
  };

  switch (statement.__type__) {
    case 'MidIRIndexAccessStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        pointerExpression: rewrite(statement.pointerExpression),
      };
    case 'MidIRBinaryStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        e1: rewrite(statement.e1),
        e2: rewrite(statement.e2),
      };
    case 'MidIRFunctionCallStatement': {
      const functionExpression = rewrite(statement.functionExpression);
      const functionArguments = statement.functionArguments.map(rewrite);
      if (statement.returnCollector == null) {
        return { ...statement, functionExpression, functionArguments };
      }
      return {
        ...statement,
        functionExpression,
        functionArguments,
        returnType: statement.returnType,
        returnCollector: bindWithMangledName(statement.returnCollector, statement.returnType),
      };
    }

    case 'MidIRIfElseStatement': {
      const booleanExpression = rewrite(statement.booleanExpression);
      const [s1, branch1Values] = context.withNestedScope(() => {
        const statements = statement.s1
          .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
          .filter(isNotNull);
        return [
          statements,
          statement.finalAssignments.map((final) => rewrite(final.branch1Value)),
        ] as const;
      });
      const [s2, branch2Values] = context.withNestedScope(() => {
        const statements = statement.s2
          .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
          .filter(isNotNull);
        return [
          statements,
          statement.finalAssignments.map((final) => rewrite(final.branch2Value)),
        ] as const;
      });
      return {
        ...statement,
        booleanExpression,
        s1,
        s2,
        finalAssignments: zip3(branch1Values, branch2Values, statement.finalAssignments).map(
          ([branch1Value, branch2Value, final]) => ({
            name: bindWithMangledName(final.name, final.type),
            type: final.type,
            branch1Value,
            branch2Value,
          })
        ),
      };
    }

    case 'MidIRSingleIfStatement': {
      const booleanExpression = rewrite(statement.booleanExpression);
      const statements = context.withNestedScope(() =>
        statement.statements
          .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
          .filter(isNotNull)
      );
      return { ...statement, booleanExpression, statements };
    }

    case 'MidIRBreakStatement':
      return { ...statement, breakValue: rewrite(statement.breakValue) };

    case 'MidIRWhileStatement': {
      const loopVariablesWithoutLoopValue = statement.loopVariables.map(
        ({ name, type, initialValue }) => ({
          name: bindWithMangledName(name, type),
          type,
          initialValue: rewrite(initialValue),
        })
      );
      const statements = statement.statements.map((it) =>
        inlineRewriteForStatement(prefix, context, returnCollector, it)
      );
      const loopVariablesLoopValues = statement.loopVariables.map((it) => rewrite(it.loopValue));
      const breakCollector =
        statement.breakCollector == null
          ? undefined
          : {
              name: bindWithMangledName(
                statement.breakCollector.name,
                statement.breakCollector.type
              ),
              type: statement.breakCollector.type,
            };
      const loopVariables = zip(loopVariablesWithoutLoopValue, loopVariablesLoopValues).map(
        ([rest, loopValue]) => ({ ...rest, loopValue })
      );
      return { ...statement, loopVariables, statements, breakCollector };
    }

    case 'MidIRCastStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        assignedExpression: rewrite(statement.assignedExpression),
      };
    case 'MidIRStructInitializationStatement':
      return {
        ...statement,
        structVariableName: bindWithMangledName(statement.structVariableName, statement.type),
        expressionList: statement.expressionList.map(rewrite),
      };
  }
};

const performInlineRewriteOnFunction = (
  midIRFunction: MidIRFunction,
  functionsThatCanBeInlined: ReadonlySet<string>,
  allFunctions: Record<string, MidIRFunction>,
  allocator: OptimizationResourceAllocator
): MidIRFunction => {
  const rewrite = (statement: MidIRStatement): readonly MidIRStatement[] => {
    switch (statement.__type__) {
      case 'MidIRFunctionCallStatement': {
        const { functionExpression, functionArguments, returnType, returnCollector } = statement;
        if (functionExpression.__type__ !== 'MidIRNameExpression') return [statement];
        const functionName = functionExpression.name;
        if (!functionsThatCanBeInlined.has(functionName) || functionName === midIRFunction.name) {
          return [statement];
        }

        const {
          parameters: argumentNamesOfFunctionToBeInlined,
          body: mainBodyStatementsOfFunctionToBeInlined,
          returnValue: returnValueOfFunctionToBeInlined,
        } = checkNotNull(allFunctions[functionName]);
        const temporaryPrefix = allocator.allocateInliningTemporaryPrefix();
        const context = new LocalValueContextForOptimization();
        // Inline step 1: Bind args to args temp
        zip(argumentNamesOfFunctionToBeInlined, functionArguments).forEach(
          ([parameter, functionArgument]) => {
            context.bind(parameter, functionArgument);
          }
        );
        // Inline step 2: Add in body code and change return statements
        const rewrittenBody = mainBodyStatementsOfFunctionToBeInlined
          .map((it) =>
            inlineRewriteForStatement(
              temporaryPrefix,
              context,
              returnCollector != null ? { name: returnCollector, type: returnType } : undefined,
              it
            )
          )
          .filter(isNotNull);
        if (returnCollector == null) return rewrittenBody;
        return [
          ...rewrittenBody,
          {
            __type__: 'MidIRBinaryStatement',
            operator: '+',
            name: returnCollector,
            type: returnType,
            e1: inlineRewriteExpression(returnValueOfFunctionToBeInlined, context),
            e2: MIR_ZERO,
          },
        ];
      }
      case 'MidIRIfElseStatement':
        return [
          { ...statement, s1: statement.s1.flatMap(rewrite), s2: statement.s2.flatMap(rewrite) },
        ];
      case 'MidIRSingleIfStatement':
      case 'MidIRWhileStatement':
        return [{ ...statement, statements: statement.statements.flatMap(rewrite) }];
      default:
        return [statement];
    }
  };

  return optimizeMidIRFunctionByConditionalConstantPropagation({
    ...midIRFunction,
    body: [...midIRFunction.body.flatMap(rewrite)],
  });
};

const optimizeMidIRFunctionsByInlining = (
  midIRFunctions: readonly MidIRFunction[],
  allocator: OptimizationResourceAllocator
): readonly MidIRFunction[] => {
  let tempFunctions = midIRFunctions;
  for (let i = 0; i < 5; i += 1) {
    const { functionsThatCanBeInlined, functionsThatCanPerformInlining } =
      getFunctionsToInline(tempFunctions);
    if (functionsThatCanBeInlined.size === 0) return tempFunctions;
    const allFunctions = Object.fromEntries(tempFunctions.map((it) => [it.name, it]));
    tempFunctions = tempFunctions.map((oldFunction) => {
      if (!functionsThatCanPerformInlining.has(oldFunction.name)) return oldFunction;
      return performInlineRewriteOnFunction(
        oldFunction,
        functionsThatCanBeInlined,
        allFunctions,
        allocator
      );
    });
  }
  return tempFunctions;
};

export default optimizeMidIRFunctionsByInlining;
