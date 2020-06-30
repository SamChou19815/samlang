import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import ModuleReference from '../ast/common/module-reference';
import type Range from '../ast/common/range';
import { ModuleMembersImport } from '../ast/common/structs';
import type { ClassDefinition, SamlangModule } from '../ast/lang/samlang-classes';
import {
  ModuleContext,
  ImportModuleMembersContext,
  ClassAsModuleMemberContext,
} from './generated/PLParser';
import { PLVisitor } from './generated/PLVisitor';
import classBuilder from './parser-class-builder';
import { tokenRange, contextRange } from './parser-util';

class ModuleMemberVisitor extends AbstractParseTreeVisitor<ClassDefinition | null>
  implements PLVisitor<ClassDefinition | null> {
  defaultResult = (): ClassDefinition | null => null;

  visitClassAsModuleMember = (ctx: ClassAsModuleMemberContext): ClassDefinition | null =>
    ctx.clazz().accept(classBuilder);

  // TODO: parseInterface
}

const moduleMemberVisitor = new ModuleMemberVisitor();

class ModuleVisitor extends AbstractParseTreeVisitor<SamlangModule>
  implements PLVisitor<SamlangModule> {
  defaultResult = (): SamlangModule => ({ imports: [], classes: [] });

  private buildModuleMembersImport = (ctx: ImportModuleMembersContext): ModuleMembersImport => ({
    range: contextRange(ctx),
    importedMembers: ctx
      .UpperId()
      .map((node) => {
        const symbol = node.symbol;
        const name = symbol.text;
        if (name == null) {
          return null;
        }
        return [name, tokenRange(symbol)] as const;
      })
      .filter((it): it is readonly [string, Range] => Boolean(it)),
    importedModule: new ModuleReference(
      ctx
        .moduleReference()
        .UpperId()
        .map((it) => it.text)
        .filter((it): it is string => Boolean(it))
    ),
    importedModuleRange: contextRange(ctx.moduleReference()),
  });

  visitModule = (ctx: ModuleContext): SamlangModule => ({
    imports: ctx.importModuleMembers().map(this.buildModuleMembersImport),
    classes: ctx
      .moduleMember()
      .map((it) => it.accept(moduleMemberVisitor))
      .filter((it): it is ClassDefinition => Boolean(it)),
  });
}

const moduleBuilder = new ModuleVisitor();
export default moduleBuilder;
