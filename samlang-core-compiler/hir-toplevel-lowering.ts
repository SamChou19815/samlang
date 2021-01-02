import lowerSamlangExpression from './hir-expression-lowering';
import performTailRecursiveCallTransformationOnHighIRFunction from './hir-tail-recursion-transformation-hir';
import lowerSamlangType from './hir-types-lowering';

import analyzeUsedFunctionNames from 'samlang-core-analysis/used-name-analysis';
import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeFunctionNameGlobally,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import { ModuleReference, Sources, unitType, functionType } from 'samlang-core-ast/common-nodes';
import { HIR_FUNCTION_CALL, HIR_NAME, HIR_RETURN } from 'samlang-core-ast/hir-expressions';
import type {
  HighIRTypeDefinition,
  HighIRFunction,
  HighIRModule,
} from 'samlang-core-ast/hir-toplevel';
import { HIR_ANY_TYPE, HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import type {
  ClassMemberDefinition,
  SamlangModule,
  TypeDefinition,
} from 'samlang-core-ast/samlang-toplevel';
import { checkNotNull, HashMap, hashMapOf } from 'samlang-core-utils';

const compileTypeDefinition = (
  moduleReference: ModuleReference,
  identifier: string,
  typeParameters: ReadonlySet<string>,
  typeDefinition: TypeDefinition
): HighIRTypeDefinition | null => {
  if (typeDefinition.type === 'variant') {
    // LLVM can't understand variant, so the second type is always any.
    // We will rely on bitcast during LLVM translation.
    return {
      identifier: `${moduleReference.parts.join('_')}_${identifier}`,
      mappings: [HIR_INT_TYPE, HIR_ANY_TYPE],
    };
  }
  if (typeDefinition.names.length === 0) return null;
  return {
    identifier: `${moduleReference.parts.join('_')}_${identifier}`,
    mappings: typeDefinition.names.map((name) =>
      lowerSamlangType(checkNotNull(typeDefinition.mappings[name]).type, typeParameters)
    ),
  };
};

const compileFunction = (
  moduleReference: ModuleReference,
  className: string,
  classMember: ClassMemberDefinition
): readonly HighIRFunction[] => {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, classMember.name);
  const bodyLoweringResult = lowerSamlangExpression(moduleReference, encodedName, classMember.body);
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
  const compiledTypeDefinitions: HighIRTypeDefinition[] = [];
  const compiledFunctions: HighIRFunction[] = [];
  sources.forEach((samlangModule, moduleReference) =>
    samlangModule.classes.map(({ name: className, typeParameters, typeDefinition, members }) => {
      const compiledTypeDefinition = compileTypeDefinition(
        moduleReference,
        className,
        new Set(typeParameters),
        typeDefinition
      );
      if (compiledTypeDefinition != null) compiledTypeDefinitions.push(compiledTypeDefinition);
      members.forEach((member) =>
        compileFunction(moduleReference, className, member).forEach((it) =>
          compiledFunctions.push(performTailRecursiveCallTransformationOnHighIRFunction(it))
        )
      );
    })
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
            functionExpression: HIR_NAME(entryPointFunctionName, functionType([], unitType)),
            functionArguments: [],
          }),
        ],
      },
    ];
    const usedNames = analyzeUsedFunctionNames(allFunctions);
    irSources.set(moduleReference, {
      typeDefinitions: compiledTypeDefinitions,
      functions: allFunctions.filter((it) => usedNames.has(it.name)),
    });
  });
  return irSources;
};

export default compileSamlangSourcesToHighIRSources;
