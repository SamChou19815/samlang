import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import { ModuleReference } from '../ast/common-nodes';
import type { ClassDefinition, ModuleMembersImport, SamlangModule } from '../ast/samlang-toplevel';
import type { ModuleErrorCollector } from '../errors';
import { isNotNull, assertNotNull } from '../util/type-assertions';
import type {
  ModuleContext,
  ImportModuleMembersContext,
  ClassAsModuleMemberContext,
  InterfaceAsModuleMemberContext,
} from './generated/PLParser';
import type { PLVisitor } from './generated/PLVisitor';
import { classInterfaceBuilder, ClassDefinitionBuilder } from './parser-class-builder';
import { tokenRange, contextRange } from './parser-util';

class ModuleMemberVisitor
  extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  // istanbul ignore next
  defaultResult = (): ClassDefinition | null => null;

  private readonly classBuilder: ClassDefinitionBuilder;

  constructor(errorCollector: ModuleErrorCollector) {
    super();
    this.classBuilder = new ClassDefinitionBuilder(errorCollector);
  }

  visitClassAsModuleMember = (ctx: ClassAsModuleMemberContext): ClassDefinition | null =>
    ctx.clazz().accept(this.classBuilder);

  visitInterfaceAsModuleMember = (ctx: InterfaceAsModuleMemberContext): ClassDefinition | null =>
    // TODO widen the type
    ctx.interfaze().accept(classInterfaceBuilder) as ClassDefinition;
}

export default class ModuleVisitor
  extends AbstractParseTreeVisitor<SamlangModule>
  implements PLVisitor<SamlangModule> {
  private readonly moduleMemberVisitor: ModuleMemberVisitor;

  constructor(errorCollector: ModuleErrorCollector) {
    super();
    this.moduleMemberVisitor = new ModuleMemberVisitor(errorCollector);
  }

  // istanbul ignore next
  defaultResult = (): SamlangModule => ({ imports: [], classes: [] });

  private buildModuleMembersImport = (ctx: ImportModuleMembersContext): ModuleMembersImport => ({
    range: contextRange(ctx),
    importedMembers: ctx
      .UpperId()
      .map((node) => {
        const symbol = node.symbol;
        const name = symbol.text;
        assertNotNull(name);
        return [name, tokenRange(symbol)] as const;
      })
      .filter(isNotNull),
    importedModule: new ModuleReference(
      ctx
        .moduleReference()
        .UpperId()
        .map((it) => it.text)
        .filter(isNotNull)
    ),
    importedModuleRange: contextRange(ctx.moduleReference()),
  });

  visitModule = (ctx: ModuleContext): SamlangModule => ({
    imports: ctx.importModuleMembers().map(this.buildModuleMembersImport),
    classes: ctx
      .moduleMember()
      .map((it) => it.accept(this.moduleMemberVisitor))
      .filter(isNotNull),
  });
}
