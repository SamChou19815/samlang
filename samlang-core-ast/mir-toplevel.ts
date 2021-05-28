import type { GlobalVariable } from './common-nodes';
import {
  debugPrintMidIRExpression,
  debugPrintMidIRStatement,
  MidIRExpression,
  MidIRStatement,
} from './mir-expressions';
import { MidIRType, MidIRFunctionType, prettyPrintMidIRType } from './mir-types';

import { zip } from 'samlang-core-utils';

export interface MidIRTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly MidIRType[];
}

export interface MidIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly type: MidIRFunctionType;
  readonly body: readonly MidIRStatement[];
  readonly returnValue: MidIRExpression;
}

export interface MidIRModule {
  readonly globalVariables: readonly GlobalVariable[];
  readonly typeDefinitions: readonly MidIRTypeDefinition[];
  readonly functions: readonly MidIRFunction[];
}

export const debugPrintMidIRFunction = ({
  name,
  parameters,
  type: { argumentTypes, returnType },
  body: bodyStatements,
  returnValue,
}: MidIRFunction): string => {
  const typedParameters = zip(parameters, argumentTypes)
    .map(([parameter, parameterType]) => `${parameter}: ${prettyPrintMidIRType(parameterType)}`)
    .join(', ');
  const header = `function ${name}(${typedParameters}): ${prettyPrintMidIRType(returnType)} {`;
  const body = [
    ...bodyStatements.map((it) => debugPrintMidIRStatement(it, 1)),
    `  return ${debugPrintMidIRExpression(returnValue)};`,
  ].join('\n');
  return `${header}\n${body}\n}\n`;
};

export const debugPrintMidIRModule = ({
  globalVariables,
  typeDefinitions,
  functions,
}: MidIRModule): string =>
  [
    ...globalVariables.map(({ name, content }) => `const ${name} = '${content}';\n`),
    ...typeDefinitions.map(
      ({ identifier, mappings }) =>
        `type ${identifier} = (${mappings.map(prettyPrintMidIRType).join(', ')});\n`
    ),
    ...functions.map((it) => debugPrintMidIRFunction(it)),
  ].join('\n');
