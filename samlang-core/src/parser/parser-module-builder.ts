import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import ModuleReference from '../ast/common/module-reference';
import { ModuleMembersImport } from '../ast/common/structs';
import type { ClassDefinition, SamlangModule } from '../ast/samlang-toplevel';
import type { ModuleErrorCollector } from '../errors';
import { isNotNull, assertNotNull } from '../util/type-assertions';
import {
  ModuleContext,
  ImportModuleMembersContext,
  ClassAsModuleMemberContext,
} from './generated/PLParser';
import { PLVisitor } from './generated/PLVisitor';
import ClassBuilder from './parser-class-builder';
import { tokenRange, contextRange } from './parser-util';

class ModuleMemberVisitor
  extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  // istanbul ignore next
  defaultResult = (): ClassDefinition | null => null;

  private readonly classBuilder: ClassBuilder;

  constructor(errorCollector: ModuleErrorCollector) {
    super();
    this.classBuilder = new ClassBuilder(errorCollector);
  }

  visitClassAsModuleMember = (ctx: ClassAsModuleMemberContext): ClassDefinition | null =>
    ctx.clazz().accept(this.classBuilder);

  // TODO: parseInterface
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
