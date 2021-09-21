import {
  HighIRFunction,
  HighIRType,
  HighIRStatement,
  HighIRNameExpression,
  HighIRExpression,
  HIR_ZERO,
  HIR_VARIABLE,
} from 'samlang-core-ast/hir-nodes';
import { checkNotNull, filterMap, zip, zip3 } from 'samlang-core-utils';

import optimizeHighIRFunctionByConditionalConstantPropagation from './hir-conditional-constant-propagation-optimization';
import { LocalValueContextForOptimization } from './hir-optimization-common';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

/** The threshold max tolerable cost of inlining.  */
const INLINE_THRESHOLD = 20;
/** The threshold max tolerable cost of performing inlining.  */
const PERFORM_INLINE_THRESHOLD = 1000;

function estimateStatementInlineCost(statement: HighIRStatement): number {
  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      return 2;
    case 'HighIRBinaryStatement':
      return 1;
    case 'HighIRFunctionCallStatement':
      return 10;
    case 'HighIRIfElseStatement':
      return (
        1 +
        statement.s1.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        statement.s2.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0) +
        statement.finalAssignments.length * 2
      );
    case 'HighIRSingleIfStatement':
      return 1 + statement.statements.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);
    case 'HighIRBreakStatement':
      return 1;
    case 'HighIRWhileStatement':
      return (
        1 +
        statement.loopVariables.length * 2 +
        statement.statements.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0)
      );
    case 'HighIRStructInitializationStatement':
      return 1 + statement.expressionList.length;
    case 'HighIRClosureInitializationStatement':
      return 3;
  }
}

export function estimateFunctionInlineCost_EXPOSED_FOR_TESTING(
  highIRFunction: HighIRFunction
): number {
  return highIRFunction.body.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);
}

function getFunctionsToInline(functions: readonly HighIRFunction[]): {
  readonly functionsThatCanPerformInlining: ReadonlySet<string>;
  readonly functionsThatCanBeInlined: ReadonlySet<string>;
} {
  const functionsThatCanBeInlined = new Set<string>();
  const functionsThatCanPerformInlining = new Set<string>();

  functions.forEach((highIRFunction) => {
    const cost = estimateFunctionInlineCost_EXPOSED_FOR_TESTING(highIRFunction);
    if (cost <= INLINE_THRESHOLD) functionsThatCanBeInlined.add(highIRFunction.name);
    if (cost <= PERFORM_INLINE_THRESHOLD) functionsThatCanPerformInlining.add(highIRFunction.name);
  });

  return { functionsThatCanPerformInlining, functionsThatCanBeInlined };
}

function inlineRewriteExpression(
  expression: HighIRExpression,
  context: LocalValueContextForOptimization
): HighIRExpression {
  if (expression.__type__ !== 'HighIRVariableExpression') return expression;
  const binded = context.getLocalValueType(expression.name);
  return binded ?? expression;
}

function inlineRewriteForStatement(
  prefix: string,
  context: LocalValueContextForOptimization,
  returnCollector: Readonly<{ name: string; type: HighIRType }> | undefined,
  statement: HighIRStatement
): HighIRStatement {
  function rewrite(expression: HighIRExpression): HighIRExpression {
    if (expression.__type__ !== 'HighIRVariableExpression') return expression;
    const binded = context.getLocalValueType(expression.name);
    return binded ?? expression;
  }

  function bindWithMangledName(name: string, type: HighIRType): string {
    const mangledName = `${prefix}${name}`;
    context.bind(name, HIR_VARIABLE(mangledName, type));
    return mangledName;
  }

  switch (statement.__type__) {
    case 'HighIRIndexAccessStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        pointerExpression: rewrite(statement.pointerExpression),
      };
    case 'HighIRBinaryStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        e1: rewrite(statement.e1),
        e2: rewrite(statement.e2),
      };
    case 'HighIRFunctionCallStatement': {
      const functionExpression = rewrite(statement.functionExpression) as HighIRNameExpression;
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

    case 'HighIRIfElseStatement': {
      const booleanExpression = rewrite(statement.booleanExpression);
      const [s1, branch1Values] = context.withNestedScope(() => {
        const statements = filterMap(statement.s1, (it) =>
          inlineRewriteForStatement(prefix, context, returnCollector, it)
        );
        return [
          statements,
          statement.finalAssignments.map((final) => rewrite(final.branch1Value)),
        ] as const;
      });
      const [s2, branch2Values] = context.withNestedScope(() => {
        const statements = filterMap(statement.s2, (it) =>
          inlineRewriteForStatement(prefix, context, returnCollector, it)
        );
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

    case 'HighIRSingleIfStatement': {
      const booleanExpression = rewrite(statement.booleanExpression);
      const statements = context.withNestedScope(() =>
        filterMap(statement.statements, (it) =>
          inlineRewriteForStatement(prefix, context, returnCollector, it)
        )
      );
      return { ...statement, booleanExpression, statements };
    }

    case 'HighIRBreakStatement':
      return { ...statement, breakValue: rewrite(statement.breakValue) };

    case 'HighIRWhileStatement': {
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

    case 'HighIRStructInitializationStatement':
      return {
        ...statement,
        structVariableName: bindWithMangledName(statement.structVariableName, statement.type),
        expressionList: statement.expressionList.map(rewrite),
      };

    case 'HighIRClosureInitializationStatement':
      return {
        ...statement,
        closureVariableName: bindWithMangledName(
          statement.closureVariableName,
          statement.closureType
        ),
        context: rewrite(statement.context),
      };
  }
}

function performInlineRewriteOnFunction(
  highIRFunction: HighIRFunction,
  functionsThatCanBeInlined: ReadonlySet<string>,
  allFunctions: Record<string, HighIRFunction>,
  allocator: OptimizationResourceAllocator
): HighIRFunction {
  function rewrite(statement: HighIRStatement): readonly HighIRStatement[] {
    switch (statement.__type__) {
      case 'HighIRFunctionCallStatement': {
        const { functionExpression, functionArguments, returnType, returnCollector } = statement;
        if (functionExpression.__type__ !== 'HighIRNameExpression') return [statement];
        const functionName = functionExpression.name;
        if (!functionsThatCanBeInlined.has(functionName) || functionName === highIRFunction.name) {
          return [statement];
        }

        const {
          parameters: argumentNamesOfFunctionToBeInlined,
          body: mainBodyStatementsOfFunctionToBeInlined,
          returnValue: returnValueOfFunctionToBeInlined,
        } = checkNotNull(allFunctions[functionName], `Missing ${functionName}`);
        const temporaryPrefix = allocator.allocateInliningTemporaryPrefix();
        const context = new LocalValueContextForOptimization();
        // Inline step 1: Bind args to args temp
        zip(argumentNamesOfFunctionToBeInlined, functionArguments).forEach(
          ([parameter, functionArgument]) => {
            context.bind(parameter, functionArgument);
          }
        );
        // Inline step 2: Add in body code and change return statements
        const rewrittenBody = filterMap(mainBodyStatementsOfFunctionToBeInlined, (it) =>
          inlineRewriteForStatement(
            temporaryPrefix,
            context,
            returnCollector != null ? { name: returnCollector, type: returnType } : undefined,
            it
          )
        );
        if (returnCollector == null) return rewrittenBody;
        // Using this to move the value around, will be optimized away eventually.
        return [
          ...rewrittenBody,
          {
            __type__: 'HighIRBinaryStatement',
            operator: '+',
            name: returnCollector,
            type: returnType,
            e1: inlineRewriteExpression(returnValueOfFunctionToBeInlined, context),
            e2: HIR_ZERO,
          },
        ];
      }
      case 'HighIRIfElseStatement':
        return [
          { ...statement, s1: statement.s1.flatMap(rewrite), s2: statement.s2.flatMap(rewrite) },
        ];
      case 'HighIRSingleIfStatement':
      case 'HighIRWhileStatement':
        return [{ ...statement, statements: statement.statements.flatMap(rewrite) }];
      default:
        return [statement];
    }
  }

  return optimizeHighIRFunctionByConditionalConstantPropagation({
    ...highIRFunction,
    body: [...highIRFunction.body.flatMap(rewrite)],
  });
}

export default function optimizeHighIRFunctionsByInlining(
  highIRFunction: readonly HighIRFunction[],
  allocator: OptimizationResourceAllocator
): readonly HighIRFunction[] {
  let tempFunctions = highIRFunction;
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
}
