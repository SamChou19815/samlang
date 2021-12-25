import { encodeFunctionNameGlobally, encodeMainFunctionName } from '../ast/common-names';
import type { ModuleReference, Sources } from '../ast/common-nodes';
import {
  HighIRFunction,
  HighIRSources,
  HighIRTypeDefinition,
  HIR_FUNCTION_CALL,
  HIR_FUNCTION_TYPE,
  HIR_IDENTIFIER_TYPE,
  HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS,
  HIR_INT,
  HIR_INT_TYPE,
  HIR_NAME,
  HIR_STRUCT_INITIALIZATION,
  HIR_VARIABLE,
} from '../ast/hir-nodes';
import type {
  SamlangExpression,
  SamlangModule,
  SamlangType,
  SourceAnnotatedVariable,
} from '../ast/samlang-nodes';
import { checkNotNull, zip } from '../utils';
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

function companionFunctionWithContext(originalFunction: HighIRFunction): HighIRFunction {
  return {
    name: `${originalFunction.name}_with_context`,
    typeParameters: originalFunction.typeParameters,
    parameters: ['_context', ...originalFunction.parameters],
    type: HIR_FUNCTION_TYPE(
      [HIR_INT_TYPE, ...originalFunction.type.argumentTypes],
      originalFunction.type.returnType
    ),
    body: [
      HIR_FUNCTION_CALL({
        functionExpression: HIR_NAME(originalFunction.name, originalFunction.type),
        functionArguments: zip(
          originalFunction.parameters,
          originalFunction.type.argumentTypes
        ).map(([name, type]) => HIR_VARIABLE(name, type)),
        returnType: originalFunction.type.returnType,
        returnCollector: '_ret',
      }),
    ],
    returnValue: HIR_VARIABLE('_ret', originalFunction.type.returnType),
  };
}

function lowerSamlangConstructorsToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>
) {
  const typeName = encodeSamlangType(moduleReference, className);
  const typeDefinition = checkNotNull(typeDefinitionMapping[typeName], `Missing ${typeName}`);
  const structVariableName = '_struct';
  const structType = HIR_IDENTIFIER_TYPE(
    typeName,
    typeDefinition.typeParameters.map(HIR_IDENTIFIER_TYPE_WITHOUT_TYPE_ARGS)
  );
  const originalConstructorFunctions: readonly HighIRFunction[] =
    typeDefinition.type === 'object'
      ? [
          {
            name: encodeFunctionNameGlobally(moduleReference, className, 'init'),
            parameters: typeDefinition.mappings.map((_, order) => `_f${order}`),
            typeParameters: typeDefinition.typeParameters,
            type: HIR_FUNCTION_TYPE(typeDefinition.mappings, structType),
            body: [
              HIR_STRUCT_INITIALIZATION({
                structVariableName,
                type: structType,
                expressionList: typeDefinition.mappings.map((type, order) =>
                  HIR_VARIABLE(`_f${order}`, type)
                ),
              }),
            ],
            returnValue: HIR_VARIABLE(structVariableName, structType),
          },
        ]
      : typeDefinition.mappings.map((dataType, tagOrder) => ({
          name: encodeFunctionNameGlobally(
            moduleReference,
            className,
            checkNotNull(typeDefinition.names[tagOrder])
          ),
          parameters: ['_data'],
          typeParameters: typeDefinition.typeParameters,
          type: HIR_FUNCTION_TYPE([dataType], structType),
          body: [
            HIR_STRUCT_INITIALIZATION({
              structVariableName,
              type: structType,
              expressionList: [HIR_INT(tagOrder), HIR_VARIABLE('_data', dataType)],
            }),
          ],
          returnValue: HIR_VARIABLE(structVariableName, structType),
        }));
  return originalConstructorFunctions.flatMap((originalFunction) => [
    originalFunction,
    companionFunctionWithContext(originalFunction),
  ]);
}

function compileSamlangFunctionToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  memberName: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  memberTypeParameters: readonly string[],
  memberParameters: readonly SourceAnnotatedVariable[],
  memberReturnType: SamlangType,
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
  const originalFunction: HighIRFunction = {
    name: encodedName,
    parameters: mainFunctionParameterNames,
    typeParameters: typeParameterArray,
    type: mainFunctionType,
    body: bodyLoweringResult.statements,
    returnValue: bodyLoweringResult.expression,
  };
  compiledFunctionsToAdd.push(originalFunction);
  return {
    compiledFunctionsToAdd,
    functionWithContext: companionFunctionWithContext(originalFunction),
  };
}

function compileSamlangMethodToHighIRFunctions(
  moduleReference: ModuleReference,
  className: string,
  memberName: string,
  typeDefinitionMapping: Readonly<Record<string, HighIRTypeDefinition>>,
  classTypeParameters: readonly string[],
  memberTypeParameters: readonly string[],
  memberParameters: readonly SourceAnnotatedVariable[],
  memberReturnType: SamlangType,
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
      compiledFunctions.push(
        ...lowerSamlangConstructorsToHighIRFunctions(
          moduleReference,
          className,
          typeDefinitionMapping
        )
      );
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
