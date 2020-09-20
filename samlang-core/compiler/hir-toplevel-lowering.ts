import analyzeUsedFunctionNames from '../analysis/used-name-analysis';
import lowerSamlangExpression from './hir-expression-lowering';
import performTailRecursiveCallTransformationOnHighIRFunction from './hir-tail-recursion-transformation-hir';

import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeFunctionNameGlobally,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import { HIR_FUNCTION_CALL, HIR_NAME, HIR_RETURN } from 'samlang-core-ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from 'samlang-core-ast/hir-toplevel';
import type { ClassMemberDefinition, SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import { HashMap, hashMapOf } from 'samlang-core-utils';

const compileFunction = (
  moduleReference: ModuleReference,
  samlangModule: SamlangModule,
  className: string,
  classMember: ClassMemberDefinition
): readonly HighIRFunction[] => {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, classMember.name);
  const bodyLoweringResult = lowerSamlangExpression(
    moduleReference,
    samlangModule,
    encodedName,
    classMember.body
  );
  const parameters = classMember.parameters.map(({ name }) => name);
  const parametersWithThis = classMember.isMethod ? ['_this', ...parameters] : parameters;
  const statements = bodyLoweringResult.statements;
  const returnType = classMember.type.returnType;
  const hasReturn = returnType.type !== 'PrimitiveType' || returnType.name !== 'unit';
  const body = hasReturn ? [...statements, HIR_RETURN(bodyLoweringResult.expression)] : statements;
  return [
    ...bodyLoweringResult.syntheticFunctions,
    { name: encodedName, parameters: parametersWithThis, hasReturn, body },
  ];
};

const compileSamlangSourcesToHighIRSources = (
  sources: Sources<SamlangModule>
): Sources<HighIRModule> => {
  const compiledFunctions: HighIRFunction[] = [];
  sources.forEach((samlangModule, moduleReference) =>
    samlangModule.classes.map(({ name: className, members }) =>
      members.forEach((member) =>
        compileFunction(moduleReference, samlangModule, className, member).forEach((it) =>
          compiledFunctions.push(performTailRecursiveCallTransformationOnHighIRFunction(it))
        )
      )
    )
  );

  const irSources: HashMap<ModuleReference, HighIRModule> = hashMapOf();
  sources.forEach((_, moduleReference) => {
    const entryPointFunctionName = encodeMainFunctionName(moduleReference);
    if (!compiledFunctions.some(({ name }) => name === entryPointFunctionName)) {
      return;
    }
    const allFunctions = [
      ...compiledFunctions,
      {
        name: ENCODED_COMPILED_PROGRAM_MAIN,
        parameters: [],
        hasReturn: false,
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(entryPointFunctionName),
            functionArguments: [],
          }),
        ],
      },
    ];
    const usedNames = analyzeUsedFunctionNames({ functions: allFunctions });
    irSources.set(moduleReference, {
      functions: allFunctions.filter((it) => usedNames.has(it.name)),
    });
  });
  return irSources;
};

export default compileSamlangSourcesToHighIRSources;
