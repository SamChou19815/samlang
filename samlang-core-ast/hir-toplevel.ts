import type { GlobalVariable } from './common-nodes';
import {
  debugPrintHighIRExpression,
  debugPrintHighIRStatement,
  HighIRExpression,
  HighIRStatement,
} from './hir-expressions';
import { HighIRType, HighIRFunctionType, prettyPrintHighIRType } from './hir-types';

import { zip } from 'samlang-core-utils';

export interface HighIRTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly HighIRType[];
}

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly type: HighIRFunctionType;
  readonly body: readonly HighIRStatement[];
  readonly returnValue: HighIRExpression;
}

export interface HighIRModule {
  readonly globalVariables: readonly GlobalVariable[];
  readonly typeDefinitions: readonly HighIRTypeDefinition[];
  readonly functions: readonly HighIRFunction[];
}

export const debugPrintHighIRFunction = ({
  name,
  parameters,
  type: { argumentTypes, returnType },
  body: bodyStatements,
  returnValue,
}: HighIRFunction): string => {
  const typedParameters = zip(parameters, argumentTypes)
    .map(([parameter, parameterType]) => `${parameter}: ${prettyPrintHighIRType(parameterType)}`)
    .join(', ');
  const header = `function ${name}(${typedParameters}): ${prettyPrintHighIRType(returnType)} {`;
  const body = [
    ...bodyStatements.map((it) => debugPrintHighIRStatement(it, 1)),
    `  return ${debugPrintHighIRExpression(returnValue)};`,
  ].join('\n');
  return `${header}\n${body}\n}\n`;
};

export const debugPrintHighIRModule = ({
  globalVariables,
  typeDefinitions,
  functions,
}: HighIRModule): string =>
  [
    ...globalVariables.map(({ name, content }) => `const ${name} = '${content}';\n`),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `type ${identifier} = (${mappings.map(prettyPrintHighIRType).join(', ')});\n`
    ),
    ...functions.map((it) => debugPrintHighIRFunction(it)),
  ].join('\n');
