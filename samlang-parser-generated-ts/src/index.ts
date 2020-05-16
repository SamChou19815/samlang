import { ANTLRInputStream, CommonTokenStream } from 'antlr4ts';
import { PLVisitor } from './generated/PLVisitor';
import { PLLexer } from './generated/PLLexer';
import { PLParser } from './generated/PLParser';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import { ModuleContext, ImportModuleMembersContext } from './generated/PLParser';
import { Module, ModuleMembersImport, ModuleReference } from './ast';
import { tokenRange, contextRange, throwParserError } from './parser-util';
import classBuilder from './class-builder';

class Visitor extends AbstractParseTreeVisitor<Module> implements PLVisitor<Module> {
  defaultResult = (): Module => throwParserError();

  private buildModuleMembersImport = (ctx: ImportModuleMembersContext): ModuleMembersImport => ({
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

  visitModule = (ctx: ModuleContext): Module => ({
    imports: ctx.importModuleMembers().map(this.buildModuleMembersImport),
    classDefinitions: ctx.clazz().map((it) => it.accept(classBuilder)),
  });
}

const visitor = new Visitor();

const buildModuleFromText = (text: string): Module =>
  new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))))
    .module()
    .accept(visitor);

export default buildModuleFromText;
