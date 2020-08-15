import type { AssemblyProgram } from '../ast/asm/asm-program';
import type ModuleReference from '../ast/common/module-reference';
import type { Sources } from '../ast/common/structs';
import {
  HighIRStatement,
  HighIRExpression,
  HighIRIndexAccessExpression,
  HighIRVariableExpression,
  HighIRNameExpression,
  HighIRBinaryExpression,
  HighIRIfElseStatement,
  HighIRFunctionCallStatement,
  HighIRLetDefinitionStatement,
  HighIRStructInitializationStatement,
} from '../ast/hir/hir-expressions';
import { HighIRModule, HighIRFunction } from '../ast/hir/hir-toplevel';
import type { SamlangModule } from '../ast/lang/samlang-toplevel';
import { typeCheckSources, GlobalTypingContext } from '../checker';
import {
  compileSamlangSourcesToHighIRSources,
  compileHighIrSourcesToMidIRCompilationUnits,
  generateAssemblyInstructionsFromMidIRCompilationUnit,
} from '../compiler';
import { CompileTimeError, createGlobalErrorCollector } from '../errors';
import optimizeIRCompilationUnit from '../optimization';
import { parseSamlangModuleFromText } from '../parser';
import { hashMapOf } from '../util/collections';

type CheckSourcesResult = {
  readonly checkedSources: Sources<SamlangModule>;
  readonly globalTypingContext: GlobalTypingContext;
  readonly compileTimeErrors: readonly CompileTimeError[];
};

export const checkSources = (
  sourceHandles: readonly (readonly [ModuleReference, string])[]
): CheckSourcesResult => {
  const errorCollector = createGlobalErrorCollector();
  const moduleMappings = hashMapOf(
    ...sourceHandles.map(
      ([moduleReference, text]) =>
        [
          moduleReference,
          parseSamlangModuleFromText(text, errorCollector.getModuleErrorCollector(moduleReference)),
        ] as const
    )
  );
  const [checkedSources, globalTypingContext] = typeCheckSources(moduleMappings, errorCollector);
  return { checkedSources, globalTypingContext, compileTimeErrors: errorCollector.getErrors() };
};

export const lowerSourcesToAssemblyPrograms = (
  sources: Sources<SamlangModule>
): Sources<AssemblyProgram> =>
  hashMapOf(
    ...compileHighIrSourcesToMidIRCompilationUnits(compileSamlangSourcesToHighIRSources(sources))
      .entries()
      .map(
        ([moduleReference, unoptimizedCompilationUnit]) =>
          [
            moduleReference,
            generateAssemblyInstructionsFromMidIRCompilationUnit(
              optimizeIRCompilationUnit(unoptimizedCompilationUnit)
            ),
          ] as const
      )
  );

export const highIRStatementToString = (highIRStatement: HighIRStatement): string => {
  switch (highIRStatement.__type__) {
    case 'HighIRIfElseStatement': {
      const { booleanExpression, s1, s2 } = highIRStatement;
      const booleanExpressionStr = highIRExpressionToString(booleanExpression);
      const s1Str = s1.map((s) => highIRStatementToString(s)).join(';');
      const s2Str = s2.map((s) => highIRStatementToString(s)).join(';');
      return `if (${booleanExpressionStr}) {${s1Str}} else {${s2Str}}`;
    }
    case 'HighIRFunctionCallStatement': {
      const { functionArguments, functionExpression, returnCollector } = highIRStatement;
      return `let ${returnCollector} = ${highIRExpressionToString(
        functionExpression
      )}(${functionArguments.map((arg) => highIRExpressionToString(arg)).join(', ')});`;
    }
    case 'HighIRLetDefinitionStatement': {
      const { name, assignedExpression } = highIRStatement;
      return `let ${name} = ${highIRExpressionToString(assignedExpression)};`;
    }
    case 'HighIRReturnStatement':
      return `return${
        highIRStatement.expression
          ? ` ${highIRExpressionToString(highIRStatement.expression)};`
          : ';'
      }`;
    case 'HighIRStructInitializationStatement': {
      const { structVariableName, expressionList } = highIRStatement;
      return `${structVariableName} = [${expressionList
        .map((e) => highIRExpressionToString(e))
        .join(', ')}];`;
    }
  }
};

export const highIRFunctionToString = (highIRFunction: HighIRFunction): string => {
  const { name, parameters, body, hasReturn } = highIRFunction;
  const bodyStr = body.map((statement) => highIRStatementToString(statement)).join(';');
  const hasReturnStr = hasReturn ? 'return;' : '';
  return `const ${name} = (${parameters.join(', ')}) => {${bodyStr} ${hasReturnStr}};`;
};

export const highIRExpressionToString = (highIRExpression: HighIRExpression): string => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return `${highIRExpression.value}`;
    case 'HighIRStringLiteralExpression':
      return `'${highIRExpression.value}'`;
    case 'HighIRIndexAccessExpression': {
      const { expression, index } = highIRExpression;
      return `${highIRExpressionToString(expression)}[${index}]`;
    }
    case 'HighIRVariableExpression':
      return (highIRExpression as HighIRVariableExpression).name;
    case 'HighIRNameExpression':
      return (highIRExpression as HighIRNameExpression).name;
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression;
      return `${highIRExpressionToString(e1)} ${operator} ${highIRExpressionToString(e2)}`;
    }
  }
};

export const highIRSourcesToJSString = (sources: Sources<HighIRModule>): string => {
  let finalStr = '';
  sources.forEach((module) => {
    finalStr += `{${module.functions.map((f) => highIRFunctionToString(f)).join(';')}}`;
  });
  return finalStr;
};
