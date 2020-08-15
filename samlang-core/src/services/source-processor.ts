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
import { hashMapOf, HashMap } from '../util/collections';

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

const highIRStatementToString = (highIRStatement: HighIRStatement): string => {
  switch (highIRStatement.__type__) {
    case 'HighIRIfElseStatement': {
      const { booleanExpression, s1, s2 } = highIRStatement as HighIRIfElseStatement;
      return `if (${highIRExpressionToString(booleanExpression)}) {
        ${s1.map((s) => highIRStatementToString(s)).join(';\n')}  
      } else {
        ${s2.map((s) => highIRStatementToString(s)).join(';\n')}
      }`;
    }
    case 'HighIRFunctionCallStatement': {
      const {
        functionArguments,
        functionExpression,
        returnCollector,
      } = highIRStatement as HighIRFunctionCallStatement;
      return `let ${returnCollector} = ${highIRExpressionToString(
        functionExpression
      )}(${functionArguments.map((arg) => highIRExpressionToString(arg)).join(', ')})`;
    }
    case 'HighIRLetDefinitionStatement': {
      const { name, assignedExpression } = highIRStatement as HighIRLetDefinitionStatement;
      return `let ${name} = ${highIRExpressionToString(assignedExpression)}`;
    }
    case 'HighIRReturnStatement':
      return `return ${
        highIRStatement.expression && highIRExpressionToString(highIRStatement.expression)
      };`;
    case 'HighIRStructInitializationStatement': {
      const {
        structVariableName,
        expressionList,
      } = highIRStatement as HighIRStructInitializationStatement;
      return `${structVariableName} = [${expressionList
        .map((e) => highIRExpressionToString(e))
        .join(', ')}]`;
    }
  }
};

const highIRFunctionToString = (highIRFunction: HighIRFunction): string =>
  `const ${highIRFunction.name} = (${highIRFunction.parameters.join(', ')}) => {
    ${highIRFunction.body.map((statement) => highIRStatementToString(statement)).join(';\n')}
    ${highIRFunction.hasReturn && 'return;'}
  }`;

const highIRExpressionToString = (highIRExpression: HighIRExpression): string => {
  switch (highIRExpression.__type__) {
    case 'HighIRIntLiteralExpression':
      return `${highIRExpression.value}`;
    case 'HighIRStringLiteralExpression':
      return highIRExpression.value;
    case 'HighIRIndexAccessExpression': {
      const { expression, index } = highIRExpression as HighIRIndexAccessExpression;
      return `${highIRExpressionToString(expression)}[${index}]`;
    }
    case 'HighIRVariableExpression':
      return (highIRExpression as HighIRVariableExpression).name;
    case 'HighIRNameExpression':
      return (highIRExpression as HighIRNameExpression).name;
    case 'HighIRBinaryExpression': {
      const { e1, e2, operator } = highIRExpression as HighIRBinaryExpression;
      return `${highIRExpressionToString(e1)} ${operator} ${highIRExpressionToString(e2)}`;
    }
  }
};

export const highIRSourcesToJSString = (sources: Sources<HighIRModule>): Sources<string[]> => {
  const jsSources: HashMap<ModuleReference, string[]> = hashMapOf();
  sources.forEach((hirModule, reference) => {
    jsSources.set(
      reference,
      hirModule.functions.map((highIRFunction: HighIRFunction) => {
        return highIRFunctionToString(highIRFunction);
      })
    );
  });
  return jsSources;
};
