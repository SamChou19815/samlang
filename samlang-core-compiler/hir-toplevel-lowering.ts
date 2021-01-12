import lowerSamlangExpression from './hir-expression-lowering';
import HighIRStringManager from './hir-string-manager';
import lowerSamlangType from './hir-types-lowering';

import analyzeUsedFunctionNames from 'samlang-core-analysis/used-name-analysis';
import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeFunctionNameGlobally,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import type { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import {
  HIR_FUNCTION_CALL,
  HIR_NAME,
  HIR_RETURN,
  HIR_ZERO,
} from 'samlang-core-ast/hir-expressions';
import type {
  HighIRTypeDefinition,
  HighIRFunction,
  HighIRModule,
} from 'samlang-core-ast/hir-toplevel';
import {
  HIR_INT_TYPE,
  HIR_ANY_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HighIRType,
  HighIRFunctionType,
} from 'samlang-core-ast/hir-types';
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
  typeDefinitionMapping: Readonly<Record<string, readonly HighIRType[]>>,
  functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
  classTypeParameters: readonly string[],
  stringManager: HighIRStringManager,
  classMember: ClassMemberDefinition
): readonly HighIRFunction[] => {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, classMember.name);
  const typeParametersSet = new Set(
    classMember.isMethod
      ? [...classTypeParameters, ...classMember.typeParameters]
      : classMember.typeParameters
  );
  const bodyLoweringResult = lowerSamlangExpression(
    moduleReference,
    encodedName,
    typeDefinitionMapping,
    functionTypeMapping,
    typeParametersSet,
    stringManager,
    classMember.body
  );
  const parameters = classMember.parameters.map(({ name }) => name);
  const parametersWithThis = classMember.isMethod ? ['_this', ...parameters] : parameters;
  const statements = bodyLoweringResult.statements;
  return [
    ...bodyLoweringResult.syntheticFunctions,
    {
      name: encodedName,
      parameters: parametersWithThis,
      type: HIR_FUNCTION_TYPE(
        classMember.isMethod
          ? [
              HIR_IDENTIFIER_TYPE(`${moduleReference.parts.join('_')}_${className}`),
              ...classMember.parameters.map(({ type }) =>
                lowerSamlangType(type, typeParametersSet)
              ),
            ]
          : classMember.parameters.map(({ type }) => lowerSamlangType(type, typeParametersSet)),
        lowerSamlangType(classMember.type.returnType, typeParametersSet)
      ),
      body: [...statements, HIR_RETURN(bodyLoweringResult.expression)],
    },
  ];
};

const compileSamlangSourcesToHighIRSources = (
  sources: Sources<SamlangModule>
): Sources<HighIRModule> => {
  const compiledTypeDefinitions: HighIRTypeDefinition[] = [];
  const compiledFunctions: HighIRFunction[] = [];
  const stringManager = new HighIRStringManager();
  const functionTypeMapping: Record<string, HighIRFunctionType> = {};
  sources.forEach((samlangModule, moduleReference) =>
    samlangModule.classes.map(({ name: className, typeParameters, typeDefinition, members }) => {
      const compiledTypeDefinition = compileTypeDefinition(
        moduleReference,
        className,
        new Set(typeParameters),
        typeDefinition
      );
      if (compiledTypeDefinition != null) compiledTypeDefinitions.push(compiledTypeDefinition);
      members.forEach((classMember) => {
        const typeParametersSet = new Set(
          classMember.isMethod
            ? [...typeParameters, ...classMember.typeParameters]
            : classMember.typeParameters
        );
        functionTypeMapping[
          encodeFunctionNameGlobally(moduleReference, className, classMember.name)
        ] = HIR_FUNCTION_TYPE(
          classMember.parameters.map(({ type }) => lowerSamlangType(type, typeParametersSet)),
          lowerSamlangType(classMember.type.returnType, typeParametersSet)
        );
      });
    })
  );
  const typeDefinitionMapping = Object.fromEntries(
    compiledTypeDefinitions.map((it) => [it.identifier, it.mappings])
  );
  sources.forEach((samlangModule, moduleReference) =>
    samlangModule.classes.map(({ name: className, typeParameters, members }) => {
      members.forEach((member) =>
        compileFunction(
          moduleReference,
          className,
          typeDefinitionMapping,
          functionTypeMapping,
          typeParameters,
          stringManager,
          member
        ).forEach((it) => compiledFunctions.push(it))
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
        type: HIR_FUNCTION_TYPE([], HIR_INT_TYPE),
        body: [
          HIR_FUNCTION_CALL({
            functionExpression: HIR_NAME(
              entryPointFunctionName,
              HIR_FUNCTION_TYPE([], HIR_INT_TYPE)
            ),
            functionArguments: [],
          }),
          HIR_RETURN(HIR_ZERO),
        ],
      },
    ];
    const usedNames = analyzeUsedFunctionNames(allFunctions);
    irSources.set(moduleReference, {
      globalVariables: stringManager.globalVariables.filter((it) => usedNames.has(it.name)),
      typeDefinitions: compiledTypeDefinitions,
      functions: allFunctions.filter((it) => usedNames.has(it.name)),
    });
  });
  return irSources;
};

export default compileSamlangSourcesToHighIRSources;
