import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';

import ClassDefinitionBuilder from './parser-class-builder';
import { tokenRange, contextRange } from './parser-util';

import { ModuleReference } from 'samlang-core-ast/common-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';
import type { ModuleErrorCollector } from 'samlang-core-errors';
import type { ModuleContext } from 'samlang-core-parser-generated/PLParser';
import type { PLVisitor } from 'samlang-core-parser-generated/PLVisitor';
import { isNotNull, checkNotNull } from 'samlang-core-utils';

export default class ModuleVisitor
  extends AbstractParseTreeVisitor<SamlangModule>
  implements PLVisitor<SamlangModule> {
  constructor(
    private readonly moduleReference: ModuleReference,
    private readonly errorCollector: ModuleErrorCollector
  ) {
    super();
  }

  // istanbul ignore next
  defaultResult = (): SamlangModule => ({ imports: [], classes: [] });

  visitModule = (ctx: ModuleContext): SamlangModule => {
    const classSourceMap = new Map<string, ModuleReference>();
    const imports = ctx.importModuleMembers().map((importContext) => {
      const importedModule = new ModuleReference(
        importContext
          .moduleReference()
          .UpperId()
          .map((it) => it.text)
          .filter(isNotNull)
      );
      return {
        range: contextRange(importContext),
        importedMembers: importContext
          .UpperId()
          .map((node) => {
            const symbol = node.symbol;
            const name = checkNotNull(symbol.text);
            classSourceMap.set(name, importedModule);
            return [name, tokenRange(symbol)] as const;
          })
          .filter(isNotNull),
        importedModule,
        importedModuleRange: contextRange(importContext.moduleReference()),
      };
    });
    const resolveClass = (className: string) =>
      classSourceMap.get(className) ?? this.moduleReference;
    const classes = ctx
      .clazz()
      .map((it) => it.accept(new ClassDefinitionBuilder(this.errorCollector, resolveClass)))
      .filter(isNotNull);
    return { imports, classes };
  };
}
