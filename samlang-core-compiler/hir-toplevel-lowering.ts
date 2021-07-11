import { encodeMainFunctionName, encodeFunctionNameGlobally } from 'samlang-core-ast/common-names';
import { ModuleReference, Sources } from 'samlang-core-ast/common-nodes';
import {
  HighIRFunctionType,
  HighIRTypeDefinition,
  HighIRFunction,
  HighIRSources,
  HIR_INT_TYPE,
  HIR_FUNCTION_TYPE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_FUNCTION_CALL,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
} from 'samlang-core-ast/hir-nodes';
import type { ClassMemberDefinition, SamlangModule } from 'samlang-core-ast/samlang-toplevel';
// eslint-disable-next-line import/no-internal-modules
import type { ModuleTypingContext } from 'samlang-core-checker/typing-context';

import lowerSamlangExpression from './hir-expression-lowering';
import HighIRStringManager from './hir-string-manager';
import {
  encodeHighIRType,
  HighIRTypeSynthesizer,
  SamlangTypeLoweringManager,
} from './hir-type-conversion';

function compileSamlangFunctionToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  functionTypeMapping: Readonly<Record<string, HighIRFunctionType>>,
  classTypeParameters: readonly string[],
  typeSynthesizer: HighIRTypeSynthesizer,
  stringManager: HighIRStringManager,
  classMember: ClassMemberDefinition
): readonly [readonly HighIRFunction[], HighIRFunction | null] {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, classMember.name);
  const typeParametersSet = new Set(
    classMember.isMethod
      ? [...classTypeParameters, ...classMember.typeParameters]
      : classMember.typeParameters
  );
  const typeParameterArray = Array.from(typeParametersSet);
  const typeLoweringManager = new SamlangTypeLoweringManager(typeParametersSet, typeSynthesizer);
  const mainFunctionParamterWithTypes = classMember.parameters.map(
    ({ name, type }) => [name, typeLoweringManager.lowerSamlangType(type)] as const
  );
  if (classMember.isMethod) {
    mainFunctionParamterWithTypes.unshift([
      '_this',
      HIR_IDENTIFIER_TYPE(
        encodeHighIRType(moduleReference, className),
        classTypeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
      ),
    ]);
  }
  const mainFunctionParameterTypes = mainFunctionParamterWithTypes.map(([, type]) => type);
  const mainFunctionParameterNames = mainFunctionParamterWithTypes.map(([name]) => name);
  const bodyLoweringResult = lowerSamlangExpression(
    moduleReference,
    encodedName,
    mainFunctionParamterWithTypes,
    typeDefinitionMapping,
    functionTypeMapping,
    typeLoweringManager,
    stringManager,
    classMember.body
  );
  const compiledFunctions = [...bodyLoweringResult.syntheticFunctions];
  const mainFunctionReturnType = typeLoweringManager.lowerSamlangType(classMember.type.returnType);
  compiledFunctions.push({
    name: encodedName,
    parameters: mainFunctionParameterNames,
    typeParameters: typeParameterArray,
    type: HIR_FUNCTION_TYPE(mainFunctionParameterTypes, mainFunctionReturnType),
    body: bodyLoweringResult.statements,
    returnValue: bodyLoweringResult.expression,
  });
  if (!classMember.isMethod) {
    const functionWithContext: HighIRFunction = {
      name: `${encodedName}_with_context`,
      typeParameters: typeParameterArray,
      parameters: ['_context', ...mainFunctionParameterNames],
      type: HIR_FUNCTION_TYPE(
        [HIR_INT_TYPE, ...mainFunctionParameterTypes],
        mainFunctionReturnType
      ),
      body: [
        HIR_FUNCTION_CALL({
          functionExpression: HIR_NAME(
            encodedName,
            HIR_FUNCTION_TYPE(mainFunctionParameterTypes, mainFunctionReturnType)
          ),
          functionArguments: mainFunctionParamterWithTypes.map(([name, type]) =>
            HIR_VARIABLE(name, type)
          ),
          returnType: mainFunctionReturnType,
          returnCollector: '_ret',
        }),
      ],
      returnValue: HIR_VARIABLE('_ret', mainFunctionReturnType),
    };
    return [compiledFunctions, functionWithContext];
  }
  return [compiledFunctions, null];
}

function buildHighIRCompilationContextFromSources(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext
) {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  const functionTypeMapping: Record<string, HighIRFunctionType> = {};
  const compiledTypeDefinitions: HighIRTypeDefinition[] = [];

  Object.entries(builtinModuleTypes).forEach(([builtinClass, builtinClassContext]) => {
    Object.entries(builtinClassContext.functions).forEach(
      ([builtinFunctionName, builtinFuncionType]) => {
        const manager = new SamlangTypeLoweringManager(
          new Set(builtinFuncionType.typeParameters),
          typeSynthesizer
        );
        functionTypeMapping[
          encodeFunctionNameGlobally(ModuleReference.ROOT, builtinClass, builtinFunctionName)
        ] = manager.lowerSamlangFunctionTypeForTopLevel(builtinFuncionType.type)[1];
      }
    );
  });
  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.map(({ name: className, typeParameters, typeDefinition, members }) => {
      compiledTypeDefinitions.push(
        new SamlangTypeLoweringManager(
          new Set(typeParameters),
          typeSynthesizer
        ).lowerSamlangTypeDefinition(moduleReference, className, typeDefinition)
      );
      members.forEach((classMember) => {
        const manager = new SamlangTypeLoweringManager(
          new Set(
            classMember.isMethod
              ? [...typeParameters, ...classMember.typeParameters]
              : classMember.typeParameters
          ),
          typeSynthesizer
        );
        functionTypeMapping[
          encodeFunctionNameGlobally(moduleReference, className, classMember.name)
        ] = HIR_FUNCTION_TYPE(
          classMember.parameters.map(({ type }) => manager.lowerSamlangType(type)),
          manager.lowerSamlangType(classMember.type.returnType)
        );
      });
    });
  });
  return { typeSynthesizer, compiledTypeDefinitions, functionTypeMapping };
}

function compileSamlangSourcesToHighIRSourcesWithGenericsPreserved(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext
): HighIRSources {
  const { typeSynthesizer, compiledTypeDefinitions, functionTypeMapping } =
    buildHighIRCompilationContextFromSources(sources, builtinModuleTypes);
  const typeDefinitionMapping = Object.fromEntries(
    compiledTypeDefinitions.map((it) => [it.identifier, it])
  );

  const stringManager = new HighIRStringManager();
  const compiledFunctionsWithAddedDummyContext: HighIRFunction[] = [];
  const compiledFunctions: HighIRFunction[] = [];
  const mainFunctionNames: string[] = [];
  sources.forEach((samlangModule, moduleReference) => {
    const entryPointFunctionName = encodeMainFunctionName(moduleReference);
    const mainFunctionType = functionTypeMapping[entryPointFunctionName];
    if (mainFunctionType) {
      mainFunctionNames.push(entryPointFunctionName);
    }
    samlangModule.classes.map(({ name: className, typeParameters, members }) => {
      members.forEach((member) => {
        const [compiledFunctionsToAdd, withContext] = compileSamlangFunctionToHighIRFunctions(
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

  return {
    globalVariables: stringManager.globalVariables,
    typeDefinitions: [...compiledTypeDefinitions, ...typeSynthesizer.synthesized],
    mainFunctionNames,
    functions: [...compiledFunctionsWithAddedDummyContext, ...compiledFunctions],
  };
}

export default function compileSamlangSourcesToHighIRSources(
  sources: Sources<SamlangModule>,
  builtinModuleTypes: ModuleTypingContext
): HighIRSources {
  return compileSamlangSourcesToHighIRSourcesWithGenericsPreserved(sources, builtinModuleTypes);
}
