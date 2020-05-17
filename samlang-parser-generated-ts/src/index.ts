import { ANTLRInputStream, CommonTokenStream, ANTLRErrorListener } from 'antlr4ts';
import { Recognizer } from 'antlr4ts/Recognizer';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { PLVisitor } from './generated/PLVisitor';
import { PLLexer } from './generated/PLLexer';
import { PLParser } from './generated/PLParser';
import { AbstractParseTreeVisitor } from 'antlr4ts/tree/AbstractParseTreeVisitor';
import { ModuleContext, ImportModuleMembersContext } from './generated/PLParser';
import { TsModule, TsModuleMembersImport, TsModuleReference, TsExpression } from './ast';
import { tokenRange, contextRange, throwParserError } from './parser-util';
import classBuilder from './class-builder';
import expressionBuilder from './expression-builder';

class Visitor extends AbstractParseTreeVisitor<TsModule> implements PLVisitor<TsModule> {
  defaultResult = (): TsModule => null!;

  private buildModuleMembersImport = (ctx: ImportModuleMembersContext): TsModuleMembersImport => ({
    range: contextRange(ctx),
    importedMembers: ctx.UpperId().map((node) => {
      const symbol = node.symbol;
      return {
        name: symbol.text ?? throwParserError('Missing imported name'),
        range: tokenRange(symbol),
      };
    }),
    importedModule: {
      parts: ctx
        .moduleReference()
        .UpperId()
        .map((it) => it.text ?? throwParserError('Missing some parts in imports.')),
    },
    importedModuleRange: contextRange(ctx.moduleReference()),
  });

  visitModule = (ctx: ModuleContext): TsModule => ({
    imports: ctx.importModuleMembers().map(this.buildModuleMembersImport),
    classDefinitions: ctx.clazz().map((it) => it.accept(classBuilder)),
  });
}

const visitor = new Visitor();

class ErrorListener implements ANTLRErrorListener<any> {
  public errors: string[] = [];

  syntaxError(
    recognizer: Recognizer<any, any>,
    offendingSymbol: any | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    e: RecognitionException | undefined
  ) {
    this.errors.push(`${line - 1}:${charPositionInLine}###${msg}`);
  }
}

export const buildTsModuleFromText = (text: string): TsModule => {
  const parser = new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))));
  const errorListener = new ErrorListener();
  parser.removeErrorListeners();
  parser.addErrorListener(errorListener);
  const parsed = parser.module().accept(visitor);
  if (errorListener.errors.length > 0) {
    throw new Error(errorListener.errors.join('$$$'));
  }
  return parsed;
};

export const buildTsExpressionFromText = (text: string): TsExpression => {
  const parser = new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))));
  const errorListener = new ErrorListener();
  parser.removeErrorListeners();
  parser.addErrorListener(errorListener);
  const parsed = parser.expression().accept(expressionBuilder);
  if (errorListener.errors.length > 0) {
    throw new Error(errorListener.errors.join('$$$'));
  }
  return parsed;
};
