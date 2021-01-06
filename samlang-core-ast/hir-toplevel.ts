import type { GlobalVariable } from './common-nodes';
import { debugPrintHighIRStatement, HighIRStatement } from './hir-expressions';
import {
  HighIRType,
  HighIRFunctionType,
  prettyPrintHighIRType,
  HIR_STRUCT_TYPE,
} from './hir-types';

import { checkNotNull } from 'samlang-core-utils';

export interface HighIRTypeDefinition {
  readonly identifier: string;
  readonly mappings: readonly HighIRType[];
}

export interface HighIRFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly hasReturn: boolean;
  readonly type: HighIRFunctionType;
  readonly body: readonly HighIRStatement[];
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
}: HighIRFunction): string => {
  const typedParameters = parameters
    .map(
      (parameter, index) =>
        `${parameter}: ${prettyPrintHighIRType(checkNotNull(argumentTypes[index]))}`
    )
    .join(', ');
  const header = `function ${name}(${typedParameters}): ${prettyPrintHighIRType(returnType)} {`;
  const body = bodyStatements.map((it) => debugPrintHighIRStatement(it, 1)).join('\n');
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
        `type ${identifier} = ${prettyPrintHighIRType(HIR_STRUCT_TYPE(mappings))};\n`
    ),
    ...functions.map((it) => debugPrintHighIRFunction(it)),
  ].join('\n');
