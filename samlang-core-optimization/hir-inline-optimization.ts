import optimizeHighIRStatementsByConditionalConstantPropagation from './hir-conditional-constant-propagation-optimization';
import { LocalValueContextForOptimization } from './hir-optimization-common';
import type OptimizationResourceAllocator from './optimization-resource-allocator';

import {
  HighIRStatement,
  HighIRExpression,
  HighIRVariableExpression,
  HIR_ZERO,
  HIR_VARIABLE,
} from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction } from 'samlang-core-ast/hir-toplevel';
import type { HighIRType } from 'samlang-core-ast/hir-types';
import { checkNotNull, isNotNull } from 'samlang-core-utils';

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

export const estimateFunctionInlineCost_EXPOSED_FOR_TESTING = (
  highIRFunction: HighIRFunction
): number => highIRFunction.body.reduce((acc, s) => acc + estimateStatementInlineCost(s), 0);

const getFunctionsToInline = (
  functions: readonly HighIRFunction[]
): {
  readonly functionsThatCanPerformInlining: ReadonlySet<string>;
  readonly functionsThatCanBeInlined: ReadonlySet<string>;
} => {
  const functionsThatCanBeInlined = new Set<string>();
  const functionsThatCanPerformInlining = new Set<string>();

  functions.forEach((highIRFunction) => {
    const cost = estimateFunctionInlineCost_EXPOSED_FOR_TESTING(highIRFunction);
    if (cost <= INLINE_THRESHOLD) {
      functionsThatCanBeInlined.add(highIRFunction.name);
    }
    // istanbul ignore next
    if (cost <= PERFORM_INLINE_THRESHOLD) {
      functionsThatCanPerformInlining.add(highIRFunction.name);
    }
  });

  return { functionsThatCanPerformInlining, functionsThatCanBeInlined };
};

const inlineRewriteForStatement = (
  prefix: string,
  context: LocalValueContextForOptimization,
  returnCollector: Readonly<{ name: string; type: HighIRType }> | undefined,
  statement: HighIRStatement
): HighIRStatement | null => {
  const rewrite = (expression: HighIRExpression): HighIRExpression => {
    if (expression.__type__ !== 'HighIRVariableExpression') return expression;
    const binded = context.getLocalValueType(expression.name);
    return binded ?? expression;
  };

  const bindWithMangledName = (name: string, type: HighIRType): string => {
    const mangledName = `${prefix}${name}`;
    context.bind(name, HIR_VARIABLE(mangledName, type));
    return mangledName;
  };

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
      const functionExpression = rewrite(statement.functionExpression);
      const functionArguments = statement.functionArguments.map(rewrite);
      if (statement.returnCollector == null) {
        return { ...statement, functionExpression, functionArguments };
      }
      return {
        ...statement,
        functionExpression,
        functionArguments,
        returnCollector: {
          name: bindWithMangledName(statement.returnCollector.name, statement.returnCollector.type),
          type: statement.returnCollector.type,
        },
      };
    }

    case 'HighIRIfElseStatement': {
      const booleanExpression = rewrite(statement.booleanExpression);
      const final = statement.finalAssignment;
      if (final == null) {
        const s1 = context.withNestedScope(() =>
          statement.s1
            .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
            .filter(isNotNull)
        );
        const s2 = context.withNestedScope(() =>
          statement.s2
            .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
            .filter(isNotNull)
        );
        return {
          ...statement,
          booleanExpression,
          s1,
          s2,
        };
      }
      const [s1, branch1Value] = context.withNestedScope(() => {
        const statements = statement.s1
          .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
          .filter(isNotNull);
        return [statements, rewrite(final.branch1Value)] as const;
      });
      const [s2, branch2Value] = context.withNestedScope(() => {
        const statements = statement.s2
          .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
          .filter(isNotNull);
        return [statements, rewrite(final.branch2Value)] as const;
      });
      return {
        ...statement,
        booleanExpression,
        s1,
        s2,
        finalAssignment: {
          name: bindWithMangledName(final.name, final.type),
          type: final.type,
          branch1Value,
          branch2Value,
        },
      };
    }

    case 'HighIRSwitchStatement': {
      const caseVariable =
        // istanbul ignore next
        (context.getLocalValueType(statement.caseVariable) as HighIRVariableExpression | undefined)
          ?.name ?? statement.caseVariable;
      const final = statement.finalAssignment;
      if (final == null) {
        return {
          ...statement,
          caseVariable,
          cases: statement.cases.map((oneCase) => ({
            ...oneCase,
            statements: context.withNestedScope(() =>
              oneCase.statements
                .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
                .filter(isNotNull)
            ),
          })),
        };
      }
      const casesWithValues = statement.cases.map((oneCase, i) => ({
        ...oneCase,
        statements: context.withNestedScope(() => {
          const statements = oneCase.statements
            .map((it) => inlineRewriteForStatement(prefix, context, returnCollector, it))
            .filter(isNotNull);
          return [statements, rewrite(checkNotNull(final.branchValues[i]))] as const;
        }),
      }));
      return {
        ...statement,
        caseVariable,
        cases: casesWithValues.map(({ caseNumber, statements: [statements] }) => ({
          caseNumber,
          statements,
        })),
        finalAssignment: {
          name: bindWithMangledName(final.name, final.type),
          type: final.type,
          branchValues: casesWithValues.map((it) => it.statements[1]),
        },
      };
    }

    case 'HighIRCastStatement':
      return {
        ...statement,
        name: bindWithMangledName(statement.name, statement.type),
        assignedExpression: rewrite(statement.assignedExpression),
      };
    case 'HighIRStructInitializationStatement':
      return {
        ...statement,
        structVariableName: bindWithMangledName(statement.structVariableName, statement.type),
        expressionList: statement.expressionList.map(rewrite),
      };
    case 'HighIRReturnStatement':
      if (returnCollector == null) return null;
      // CCP optimization will optimize this away.
      return {
        __type__: 'HighIRBinaryStatement',
        operator: '+',
        name: returnCollector.name,
        type: returnCollector.type,
        e1: rewrite(statement.expression),
        e2: HIR_ZERO,
      };
  }
};

const performInlineRewriteOnFunction = (
  highIRFunction: HighIRFunction,
  functionsThatCanBeInlined: ReadonlySet<string>,
  allFunctions: Record<string, HighIRFunction>,
  allocator: OptimizationResourceAllocator
): HighIRFunction => {
  const rewrite = (statement: HighIRStatement): readonly HighIRStatement[] => {
    switch (statement.__type__) {
      case 'HighIRFunctionCallStatement': {
        const { functionExpression, functionArguments, returnCollector } = statement;
        if (functionExpression.__type__ !== 'HighIRNameExpression') return [statement];
        const functionName = functionExpression.name;
        if (!functionsThatCanBeInlined.has(functionName)) return [statement];

        const {
          parameters: argumentNamesOfFunctionToBeInlined,
          body: mainBodyStatementsOfFunctionToBeInlined,
        } = checkNotNull(allFunctions[functionName]);
        const temporaryPrefix = allocator.allocateInliningTemporaryPrefix();
        const context = new LocalValueContextForOptimization();
        // Inline step 1: Bind args to args temp
        argumentNamesOfFunctionToBeInlined.forEach((parameter, index) => {
          context.bind(parameter, checkNotNull(functionArguments[index]));
        });
        // Inline step 2: Add in body code and change return statements
        return mainBodyStatementsOfFunctionToBeInlined
          .map((it) => inlineRewriteForStatement(temporaryPrefix, context, returnCollector, it))
          .filter(isNotNull);
      }
      case 'HighIRIfElseStatement':
        return [
          { ...statement, s1: statement.s1.flatMap(rewrite), s2: statement.s2.flatMap(rewrite) },
        ];
      case 'HighIRSwitchStatement':
        return [
          {
            ...statement,
            cases: statement.cases.map((oneCase) => ({
              ...oneCase,
              statements: oneCase.statements.flatMap(rewrite),
            })),
          },
        ];
      default:
        return [statement];
    }
  };

  return {
    ...highIRFunction,
    body: optimizeHighIRStatementsByConditionalConstantPropagation(
      highIRFunction.body.flatMap(rewrite)
    ),
  };
};

const optimizeFunctionsByInlining = (
  highIRFunctions: readonly HighIRFunction[],
  allocator: OptimizationResourceAllocator
): readonly HighIRFunction[] => {
  let tempFunctions = highIRFunctions;
  for (let i = 0; i < 5; i += 1) {
    const { functionsThatCanBeInlined, functionsThatCanPerformInlining } = getFunctionsToInline(
      tempFunctions
    );
    // istanbul ignore next
    if (functionsThatCanBeInlined.size === 0) return tempFunctions;
    const allFunctions = Object.fromEntries(tempFunctions.map((it) => [it.name, it]));
    tempFunctions = tempFunctions.map((oldFunction) => {
      // istanbul ignore next
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

export default optimizeFunctionsByInlining;
