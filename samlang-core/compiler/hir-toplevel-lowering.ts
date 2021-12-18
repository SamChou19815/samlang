import { encodeFunctionNameGlobally, encodeMainFunctionName } from '../ast/common-names';
import type { ModuleReference, Sources, Type } from '../ast/common-nodes';
import {
  HighIRFunction,
  HighIRSources,
  HighIRTypeDefinition,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_VARIABLE,
} from '../ast/hir-nodes';
import type {
  SamlangExpression,
  SamlangModule,
  SourceAnnotatedVariable,
} from '../ast/samlang-nodes';
import lowerSamlangExpression from './hir-expression-lowering';
import performGenericsSpecializationOnHighIRSources from './hir-generics-specialization';
import HighIRStringManager from './hir-string-manager';
import optimizeHighIRFunctionByTailRecursionRewrite from './hir-tail-recursion-rewrite';
import {
  encodeSamlangType,
  HighIRTypeSynthesizer,
  SamlangTypeLoweringManager,
} from './hir-type-conversion';
import deduplicateHighIRTypes from './hir-type-deduplication';

function compileSamlangFunctionToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  memberName: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  memberTypeParameters: readonly string[],
  memberParameters: readonly SourceAnnotatedVariable[],
  memberReturnType: Type,
  memberBody: SamlangExpression,
  typeSynthesizer: HighIRTypeSynthesizer,
  stringManager: HighIRStringManager
) {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, memberName);
  const typeParametersSet = new Set(memberTypeParameters);
  const typeParameterArray = Array.from(typeParametersSet);
  const typeLoweringManager = new SamlangTypeLoweringManager(typeParametersSet, typeSynthesizer);
  const mainFunctionParameterWithTypes = memberParameters.map(
    ({ name, type }) => [name, typeLoweringManager.lowerSamlangType(type)] as const
  );
  const mainFunctionParameterNames = mainFunctionParameterWithTypes.map(([name]) => name);
  const bodyLoweringResult = lowerSamlangExpression(
    moduleReference,
    encodedName,
    mainFunctionParameterWithTypes,
    typeDefinitionMapping,
    typeLoweringManager,
    stringManager,
    memberBody
  );
  const compiledFunctionsToAdd = [...bodyLoweringResult.syntheticFunctions];
  const mainFunctionType = HIR_FUNCTION_TYPE(
    mainFunctionParameterWithTypes.map(([, type]) => type),
    typeLoweringManager.lowerSamlangType(memberReturnType)
  );
  compiledFunctionsToAdd.push({
    name: encodedName,
    parameters: mainFunctionParameterNames,
    typeParameters: typeParameterArray,
    type: mainFunctionType,
    body: bodyLoweringResult.statements,
    returnValue: bodyLoweringResult.expression,
  });
  const functionWithContext: HighIRFunction = {
    name: `${encodedName}_with_context`,
    typeParameters: typeParameterArray,
    parameters: ['_context', ...mainFunctionParameterNames],
    type: HIR_FUNCTION_TYPE(
      [HIR_INT_TYPE, ...mainFunctionType.argumentTypes],
      mainFunctionType.returnType
    ),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME(encodedName, mainFunctionType),
        functionArguments: mainFunctionParameterWithTypes.map(([name, type]) =>
          HIR_VARIABLE(name, type)
        ),
        returnType: mainFunctionType.returnType,
        returnCollector: '_ret',
      }),
    ],
    returnValue: HIR_VARIABLE('_ret', mainFunctionType.returnType),
  };
  return { compiledFunctionsToAdd, functionWithContext };
}

function compileSamlangMethodToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  memberName: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  classTypeParameters: readonly string[],
  memberTypeParameters: readonly string[],
  memberParameters: readonly SourceAnnotatedVariable[],
  memberReturnType: Type,
  memberBody: SamlangExpression,
  typeSynthesizer: HighIRTypeSynthesizer,
  stringManager: HighIRStringManager
) {
  const encodedName = encodeFunctionNameGlobally(moduleReference, className, memberName);
  const typeParametersSet = new Set([...classTypeParameters, ...memberTypeParameters]);
  const typeParameterArray = Array.from(typeParametersSet);
  const typeLoweringManager = new SamlangTypeLoweringManager(typeParametersSet, typeSynthesizer);
  const mainFunctionParameterWithTypes = [
    [
      '_this',
      HIR_IDENTIFIER_TYPE(
        encodeSamlangType(moduleReference, className),
        classTypeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
      ),
    ] as const,
    ...memberParameters.map(
      ({ name, type }) => [name, typeLoweringManager.lowerSamlangType(type)] as const
    ),
  ];
  const bodyLoweringResult = lowerSamlangExpression(
    moduleReference,
    encodedName,
    mainFunctionParameterWithTypes,
    typeDefinitionMapping,
    typeLoweringManager,
    stringManager,
    memberBody
  );
  return [
    ...bodyLoweringResult.syntheticFunctions,
    {
      name: encodedName,
      parameters: mainFunctionParameterWithTypes.map(([name]) => name),
      typeParameters: typeParameterArray,
      type: HIR_FUNCTION_TYPE(
        mainFunctionParameterWithTypes.map(([, type]) => type),
        typeLoweringManager.lowerSamlangType(memberReturnType)
      ),
      body: bodyLoweringResult.statements,
      returnValue: bodyLoweringResult.expression,
    },
  ];
}

/** @internal */
export function compileSamlangSourcesToHighIRSourcesWithGenericsPreserved(
  sources: Sources<SamlangModule>
): HighIRSources {
  const typeSynthesizer = new HighIRTypeSynthesizer();
  const compiledTypeDefinitions: HighIRTypeDefinition[] = [];
  const mainFunctionNames: string[] = [];
  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.map(({ name: className, typeParameters, typeDefinition, members }) => {
      compiledTypeDefinitions.push(
        new SamlangTypeLoweringManager(
          new Set(typeParameters),
          typeSynthesizer
        ).lowerSamlangTypeDefinition(moduleReference, className, typeDefinition)
      );
      if (
        className === 'Main' &&
        members.some(
          (member) =>
            member.name === 'main' &&
            member.parameters.length === 0 &&
            member.typeParameters.length === 0
        )
      ) {
        mainFunctionNames.push(encodeMainFunctionName(moduleReference));
      }
    });
  });
  const typeDefinitionMapping = Object.fromEntries(
    compiledTypeDefinitions.map((it) => [it.identifier, it])
  );

  const stringManager = new HighIRStringManager();
  const compiledFunctionsWithAddedDummyContext: HighIRFunction[] = [];
  const compiledFunctions: HighIRFunction[] = [];
  sources.forEach((samlangModule, moduleReference) => {
    samlangModule.classes.map(({ name: className, typeParameters, members }) => {
      members.forEach((member) => {
        if (member.isMethod) {
          compiledFunctions.push(
            ...compileSamlangMethodToHighIRFunctions(
              moduleReference,
              className,
              member.name,
              typeDefinitionMapping,
              typeParameters,
              member.typeParameters,
              member.parameters,
              member.type.returnType,
              member.body,
              typeSynthesizer,
              stringManager
            )
          );
        } else {
          const { compiledFunctionsToAdd, functionWithContext } =
            compileSamlangFunctionToHighIRFunctions(
              moduleReference,
              className,
              member.name,
              typeDefinitionMapping,
              member.typeParameters,
              member.parameters,
              member.type.returnType,
              member.body,
              typeSynthesizer,
              stringManager
            );
          compiledFunctionsWithAddedDummyContext.push(functionWithContext);
          compiledFunctions.push(...compiledFunctionsToAdd);
        }
      });
    });
  });

  return {
    globalVariables: stringManager.globalVariables,
    closureTypes: typeSynthesizer.synthesizedClosureTypes,
    typeDefinitions: [...compiledTypeDefinitions, ...typeSynthesizer.synthesizedTupleTypes],
    mainFunctionNames,
    functions: [...compiledFunctionsWithAddedDummyContext, ...compiledFunctions],
  };
}

const optimizeHighIRSourcesByTailRecursionRewrite = (sources: HighIRSources): HighIRSources => ({
  ...sources,
  functions: sources.functions.map((it) => optimizeHighIRFunctionByTailRecursionRewrite(it) ?? it),
});

export default function compileSamlangSourcesToHighIRSources(
  sources: Sources<SamlangModule>
): HighIRSources {
  return optimizeHighIRSourcesByTailRecursionRewrite(
    deduplicateHighIRTypes(
      performGenericsSpecializationOnHighIRSources(
        compileSamlangSourcesToHighIRSourcesWithGenericsPreserved(sources)
      )
    )
  );
}
