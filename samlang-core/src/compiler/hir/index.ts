import { encodeFunctionNameGlobally } from '../../ast/common-names';
import type ModuleReference from '../../ast/common/module-reference';
import type { Sources } from '../../ast/common/structs';
import { HIR_RETURN } from '../../ast/hir-expressions';
import type { HighIRFunction, HighIRModule } from '../../ast/hir-toplevel';
import type { ClassMemberDefinition, SamlangModule } from '../../ast/samlang-toplevel';
import { HashMap, hashMapOf } from '../../util/collections';
import lowerSamlangExpression from './hir-expression-lowering';
import performTailRecursiveCallTransformationOnHighIRFunction from './hir-tail-recursion-transformation-hir';

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

const compileSamlangModule = (
  moduleReference: ModuleReference,
  samlangModule: SamlangModule
): HighIRModule => ({
  functions: samlangModule.classes
    .map(({ name: className, members }) =>
      members
        .map((it) =>
          compileFunction(moduleReference, samlangModule, className, it).map(
            performTailRecursiveCallTransformationOnHighIRFunction
          )
        )
        .flat()
    )
    .flat(),
});

const compileSamlangSourcesToHighIRSources = (
  sources: Sources<SamlangModule>
): Sources<HighIRModule> => {
  const irSources: HashMap<ModuleReference, HighIRModule> = hashMapOf();
  sources.forEach((samlangModule, reference) =>
    irSources.set(reference, compileSamlangModule(reference, samlangModule))
  );
  return irSources;
};

export default compileSamlangSourcesToHighIRSources;
