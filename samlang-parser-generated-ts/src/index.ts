import { ANTLRInputStream, CommonTokenStream } from 'antlr4ts';
import { PLVisitor } from './generated/PLVisitor';
import { PLLexer } from './generated/PLLexer';
import { PLParser } from './generated/PLParser';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import { ModuleContext, ImportModuleMembersContext } from './generated/PLParser';
import { TsModule, TsModuleMembersImport, ModuleReference } from './ast';
import { tokenRange, contextRange, throwParserError } from './parser-util';
import classBuilder from './class-builder';

class Visitor extends AbstractParseTreeVisitor<TsModule> implements PLVisitor<TsModule> {
  defaultResult = (): TsModule => throwParserError();

  private buildModuleMembersImport = (ctx: ImportModuleMembersContext): TsModuleMembersImport => ({
    range: contextRange(ctx),
    importedMembers: ctx.UpperId().map((node) => {
      const symbol = node.symbol;
      return { name: symbol.text ?? throwParserError(), range: tokenRange(symbol) };
    }),
    importedModule: {
      parts: ctx
        .moduleReference()
        .UpperId()
        .map((it) => it.text ?? throwParserError()),
    },
    importedModuleRange: contextRange(ctx.moduleReference()),
  });

  visitModule = (ctx: ModuleContext): TsModule => ({
    imports: ctx.importModuleMembers().map(this.buildModuleMembersImport),
    classDefinitions: ctx.clazz().map((it) => it.accept(classBuilder)),
  });
}

const visitor = new Visitor();

const buildModuleFromText = (text: string): TsModule =>
  new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))))
    .module()
    .accept(visitor);

export default buildModuleFromText;
