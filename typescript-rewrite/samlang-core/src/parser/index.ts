import { ANTLRInputStream, CommonTokenStream, ANTLRErrorListener } from 'antlr4ts';
import type { RecognitionException } from 'antlr4ts/RecognitionException';
import type { Recognizer } from 'antlr4ts/Recognizer';

import Position from '../ast/common/position';
import Range from '../ast/common/range';
import type { SamlangModule } from '../ast/lang/samlang-classes';
import type { SamlangExpression } from '../ast/lang/samlang-expressions';
import type { ModuleErrorCollector } from '../errors/error-collector';
import { PLLexer } from './generated/PLLexer';
import { PLParser } from './generated/PLParser';
import expressionBuilder from './parser-expression-builder';
import moduleBuilder from './parser-module-builder';

class ErrorListener implements ANTLRErrorListener<unknown> {
  constructor(public readonly moduleErrorCollector: ModuleErrorCollector) {}

  syntaxError(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognizer: Recognizer<unknown, any>,
    offendingSymbol: unknown | undefined,
    line: number,
    charPositionInLine: number,
    msg: string,
    // eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars
    e: RecognitionException | undefined
  ) {
    this.moduleErrorCollector.reportSyntaxError(
      new Range(
        new Position(line - 1, charPositionInLine),
        new Position(line - 1, charPositionInLine)
      ),
      msg
    );
  }
}

export const parseSamlangModuleFromText = (
  text: string,
  moduleErrorCollector: ModuleErrorCollector
): SamlangModule => {
  const parser = new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))));
  const errorListener = new ErrorListener(moduleErrorCollector);
  parser.removeErrorListeners();
  parser.addErrorListener(errorListener);
  return parser.module().accept(moduleBuilder);
};

export const parseSamlangExpressionFromText = (
  text: string,
  moduleErrorCollector: ModuleErrorCollector
): SamlangExpression | null => {
  const parser = new PLParser(new CommonTokenStream(new PLLexer(new ANTLRInputStream(text))));
  const errorListener = new ErrorListener(moduleErrorCollector);
  parser.removeErrorListeners();
  parser.addErrorListener(errorListener);
  return parser.expression().accept(expressionBuilder);
};
