import type ModuleReference from '../../ast/common/module-reference';
import type { Sources } from '../../ast/common/structs';
import { HIR_RETURN } from '../../ast/hir/hir-expressions';
import type { HighIRFunction, HighIRModule } from '../../ast/hir/hir-toplevel';
import type { ClassMemberDefinition, SamlangModule } from '../../ast/lang/samlang-toplevel';
import { HashMap, hashMapOf } from '../../util/collections';
import lowerSamlangExpression from './hir-expression-lowering';

const compileFunction = (classMember: ClassMemberDefinition): HighIRFunction => {
  const bodyLoweringResult = lowerSamlangExpression(classMember.body);
  const statements = bodyLoweringResult.statements;
  const returnType = classMember.type.returnType;
  const hasReturn = returnType.type !== 'PrimitiveType' || returnType.name !== 'unit';
  const body = hasReturn ? [...statements, HIR_RETURN(bodyLoweringResult.expression)] : statements;
  return {
    isPublic: classMember.isPublic,
    isMethod: classMember.isMethod,
    name: classMember.name,
    parameters: classMember.parameters.map(({ name }) => name),
    hasReturn,
    body,
  };
};

const compileSamlangModule = ({ imports, classes }: SamlangModule): HighIRModule => ({
  imports,
  classDefinitions: classes.map(({ name: className, members }) => ({
    className,
    members: members.map(compileFunction),
  })),
});

const compileSamlangSourcesToHighIRSources = (
  sources: Sources<SamlangModule>
): Sources<HighIRModule> => {
  const irSources: HashMap<ModuleReference, HighIRModule> = hashMapOf();
  sources.forEach((samlangModule, reference) =>
    irSources.set(reference, compileSamlangModule(samlangModule))
  );
  return irSources;
};

export default compileSamlangSourcesToHighIRSources;
