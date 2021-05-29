import HighIRStringManager from './hir-string-manager';
import lowerSamlangExpression from './mir-expression-lowering';
import MidIRTypeSynthesizer from './mir-type-synthesizer';
import lowerSamlangType from './mir-types-lowering';

import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  encodeFunctionNameGlobally,
  encodeMainFunctionName,
} from 'samlang-core-ast/common-names';
import { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import {
  MIR_FUNCTION_CALL,
  MIR_NAME,
  MIR_ZERO,
  MIR_INT_TYPE,
  MIR_ANY_TYPE,
  MIR_FUNCTION_TYPE,
  MIR_IDENTIFIER_TYPE,
  MidIRType,
  MidIRFunctionType,
  MIR_VARIABLE,
} from 'samlang-core-ast/mir-nodes';
import type { MidIRTypeDefinition, MidIRFunction, MidIRModule } from 'samlang-core-ast/mir-nodes';
import type {
  ClassMemberDefinition,
  SamlangModule,
  TypeDefinition,
} from 'samlang-core-ast/samlang-toplevel';
// eslint-disable-next-line import/no-internal-modules
import type { ModuleTypingContext } from 'samlang-core-checker/typing-context';
import {
  OptimizationConfiguration,
  optimizeMidIRModuleByUnusedNameEliminationAndTailRecursionRewrite,
  optimizeMidIRModuleAccordingToConfiguration,
} from 'samlang-core-optimization';
import { checkNotNull, HashMap, hashMapOf, zip } from 'samlang-core-utils';

const compileTypeDefinition = (
  moduleReference: ModuleReference,
  identifier: string,
  typeParameters: ReadonlySet<string>,
  typeDefinition: TypeDefinition,
  typeSynthesizer: MidIRTypeSynthesizer
): MidIRTypeDefinition | null => {
  if (typeDefinition.type === 'variant') {
    // LLVM can't understand variant, so the second type is always any.
    // We will rely on bitcast during LLVM translation.
    return {
      identifier: `${moduleReference.parts.join('_')}_${identifier}`,
      mappings: [MIR_INT_TYPE, MIR_ANY_TYPE],
    };
  }
  if (typeDefinition.names.length === 0) return null;
  return {
    identifier: `${moduleReference.parts.join('_')}_${identifier}`,
    mappings: typeDefinition.names.map((name) =>
      lowerSamlangType(
        checkNotNull(typeDefinition.mappings[name]).type,
        typeParameters,
        typeSynthesizer
      )
    ),
  };
};

const compileFunction = (
  moduleReference: ModuleReference,
  className: string,
  typeDefinitionMapping: Readonly<Record<string, readonly MidIRType[]>>,
  functionTypeMapping: Readonly<Record<string, MidIRFunctionType>>,
  classTypeParameters: readonly string[],
  typeSynthesizer: MidIRTypeSynthesizer,
  stringManager: HighIRStringManager,
  classMember: ClassMemberDefinition
) => {
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
    typeSynthesizer,
    stringManager,
    classMember.body
  );
  const parameters = classMember.parameters.map(({ name }) => name);
  const parametersWithThis = classMember.isMethod ? ['_this', ...parameters] : parameters;
  const statements = bodyLoweringResult.statements;
  const compiledFunctions: MidIRFunction[] = [];
  compiledFunctions.push(...bodyLoweringResult.syntheticFunctions);
  const mainFunctionParameterTypes = classMember.parameters.map(({ type }) =>
    lowerSamlangType(type, typeParametersSet, typeSynthesizer)
  );
  const mainFunctionReturnType = lowerSamlangType(
    classMember.type.returnType,
    typeParametersSet,
    typeSynthesizer
  );
  const mainFunction = {
    name: encodedName,
    parameters: parametersWithThis,
    type: MIR_FUNCTION_TYPE(
      classMember.isMethod
        ? [
            MIR_IDENTIFIER_TYPE(`${moduleReference.parts.join('_')}_${className}`),
            ...mainFunctionParameterTypes,
          ]
        : mainFunctionParameterTypes,
      mainFunctionReturnType
    ),
    body: statements,
    returnValue: bodyLoweringResult.expression,
  };
  compiledFunctions.push(mainFunction);
  if (!classMember.isMethod) {
    const functionWithContext: MidIRFunction = {
      name: `${encodedName}_with_context`,
      parameters: ['_context', ...parameters],
      type: MIR_FUNCTION_TYPE(
        [MIR_ANY_TYPE, ...mainFunctionParameterTypes],
        mainFunctionReturnType
      ),
      body: [
        MIR_FUNCTION_CALL({
          functionExpression: MIR_NAME(
            encodedName,
            MIR_FUNCTION_TYPE(mainFunctionParameterTypes, mainFunctionReturnType)
          ),
          functionArguments: zip(parameters, mainFunctionParameterTypes).map(([name, type]) =>
            MIR_VARIABLE(name, type)
          ),
          returnType: mainFunctionReturnType,
          returnCollector: '_ret',
        }),
      ],
      returnValue: MIR_VARIABLE('_ret', mainFunctionReturnType),
    };
    return [compiledFunctions, functionWithContext] as const;
  }
  return [compiledFunctions, null] as const;
};

const compileSamlangSourcesToMidIRSources = (
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext,
  optimizationConfiguration?: OptimizationConfiguration
): Sources<MidIRModule> => {
  const compiledTypeDefinitions: MidIRTypeDefinition[] = [];
  const compiledFunctionsWithAddedDummyContext: MidIRFunction[] = [];
  const compiledFunctions: MidIRFunction[] = [];
  const stringManager = new HighIRStringManager();
  const functionTypeMapping: Record<string, MidIRFunctionType> = {};
  const typeSynthesizer = new MidIRTypeSynthesizer();
  Object.entries(builtinModuleTypes).forEach(([builtinClass, builtinClassContext]) => {
    Object.entries(builtinClassContext.functions).forEach(
      ([builtinFunctionName, builtinFuncionType]) => {
        functionTypeMapping[
          encodeFunctionNameGlobally(ModuleReference.ROOT, builtinClass, builtinFunctionName)
        ] = MIR_FUNCTION_TYPE(
          builtinFuncionType.type.argumentTypes.map((it) =>
            lowerSamlangType(it, new Set(builtinFuncionType.typeParameters), typeSynthesizer)
          ),
          lowerSamlangType(
            builtinFuncionType.type.returnType,
            new Set(builtinFuncionType.typeParameters),
            typeSynthesizer
          )
        );
      }
    );
  });
  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.map(({ name: className, typeParameters, typeDefinition, members }) => {
      const compiledTypeDefinition = compileTypeDefinition(
        moduleReference,
        className,
        new Set(typeParameters),
        typeDefinition,
        typeSynthesizer
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
        ] = MIR_FUNCTION_TYPE(
          classMember.parameters.map(({ type }) =>
            lowerSamlangType(type, typeParametersSet, typeSynthesizer)
          ),
          lowerSamlangType(classMember.type.returnType, typeParametersSet, typeSynthesizer)
        );
      });
    });
  });
  const typeDefinitionMapping = Object.fromEntries(
    compiledTypeDefinitions.map((it) => [it.identifier, it.mappings])
  );

  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.map(({ name: className, typeParameters, members }) => {
      members.forEach((member) => {
        const [compiledFunctionsToAdd, withContext] = compileFunction(
          moduleReference,
          className,
          typeDefinitionMapping,
          functionTypeMapping,
          typeParameters,
          typeSynthesizer,
          stringManager,
          member
        );
        if (withContext != null) compiledFunctionsWithAddedDummyContext.push(withContext);
        compiledFunctionsToAdd.forEach((it) => compiledFunctions.push(it));
      });
    });
  });

  compiledTypeDefinitions.push(...typeSynthesizer.synthesized);

  const irSources: HashMap<ModuleReference, MidIRModule> = hashMapOf();
  sources.forEach((_, moduleReference) => {
    const entryPointFunctionName = encodeMainFunctionName(moduleReference);
    if (!compiledFunctions.some(({ name }) => name === entryPointFunctionName)) {
      return;
    }
    const allFunctions = [
      // Put these functions at first so they can always be referenced as global values.
      ...compiledFunctionsWithAddedDummyContext,
      ...compiledFunctions,
      {
        name: ENCODED_COMPILED_PROGRAM_MAIN,
        parameters: [],
        type: MIR_FUNCTION_TYPE([], MIR_INT_TYPE),
        body: [
          MIR_FUNCTION_CALL({
            functionExpression: MIR_NAME(
              entryPointFunctionName,
              MIR_FUNCTION_TYPE([], MIR_INT_TYPE)
            ),
            functionArguments: [],
            returnType: MIR_INT_TYPE,
          }),
        ],
        returnValue: MIR_ZERO,
      },
    ];
    irSources.set(
      moduleReference,
      optimizeMidIRModuleAccordingToConfiguration(
        optimizeMidIRModuleByUnusedNameEliminationAndTailRecursionRewrite({
          globalVariables: stringManager.globalVariables,
          typeDefinitions: compiledTypeDefinitions,
          functions: allFunctions,
        }),
        optimizationConfiguration
      )
    );
  });
  return irSources;
};

export default compileSamlangSourcesToMidIRSources;
