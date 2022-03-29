import type {
  SamlangModule,
  SourceIdentifier,
  SourceInterfaceDeclaration,
} from '../ast/samlang-nodes';
import type { ModuleErrorCollector } from '../errors';
import { LocalStackedContext } from '../utils';

class VariableCollisionCheckerStackedContext extends LocalStackedContext<void> {
  constructor(private readonly errorCollector: ModuleErrorCollector) {
    super();
  }

  add = ({ name, range }: Omit<SourceIdentifier, 'associatedComments'>) =>
    this.addLocalValueType(name, undefined, () =>
      this.errorCollector.reportCollisionError(range, name)
    );

  addAll = (ids: readonly SourceIdentifier[]) => ids.forEach(this.add);
}

export default function checkToplevelNameCollision(
  errorCollector: ModuleErrorCollector,
  samlangModule: SamlangModule
): void {
  const checker = new VariableCollisionCheckerStackedContext(errorCollector);
  samlangModule.imports.forEach((oneImport) => checker.addAll(oneImport.importedMembers));

  const interfaces: SourceInterfaceDeclaration[] = [
    ...samlangModule.interfaces,
    ...samlangModule.classes,
  ];
  interfaces.forEach((interfaceDeclaration) => {
    checker.add(interfaceDeclaration.name);

    checker.withNestedScope(() => {
      checker.addAll(interfaceDeclaration.typeParameters);
      if (interfaceDeclaration.typeDefinition != null) {
        checker.addAll(interfaceDeclaration.typeDefinition.names);
      }

      interfaceDeclaration.members.map((member) => {
        checker.add(member.name);
        checker.withNestedScope(() => {
          checker.addAll(member.typeParameters);
          member.parameters.forEach(({ name, nameRange: range }) => checker.add({ name, range }));
        });
      });
    });
  });
}
