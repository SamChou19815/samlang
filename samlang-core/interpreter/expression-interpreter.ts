// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/32

import type { SamlangExpression, SamlangIdentifierType } from '../ast/samlang-nodes';
import { checkNotNull } from '../utils';

export default class ExpressionInterpreter {
  // eslint-disable-next-line class-methods-use-this
  private blameTypeChecker = (message = ''): never => {
    throw Error(message);
  };

  readonly eval = (
    expression: SamlangExpression,
    context: InterpretationContext = EMPTY,
  ): Value => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return expression.literal.value;
      case 'ThisExpression':
        return context.localValues.get('this') ?? this.blameTypeChecker('Missing `this`');
      case 'VariableExpression':
        return (
          context.localValues.get(expression.name) ??
          this.blameTypeChecker(`Missing variable ${expression.name}`)
        );
      case 'ClassMemberExpression':
        return (
          context.classes
            .get(expression.className.name)
            ?.functions?.get(expression.memberName.name) ?? this.blameTypeChecker()
        );
      case 'FieldAccessExpression': {
        const thisValue = this.eval(expression.expression, context) as ObjectValue;
        return thisValue.objectContent?.get(expression.fieldName.name) ?? this.blameTypeChecker();
      }
      case 'MethodAccessExpression': {
        const identifier = (expression.expression.type as SamlangIdentifierType).identifier;
        const thisValue = this.eval(expression.expression, context);
        const methodValue =
          context.classes.get(identifier)?.methods?.get(expression.methodName.name) ??
          this.blameTypeChecker();
        const localValues = new Map(context.localValues);
        localValues.set('this', thisValue);
        methodValue.context = { classes: context.classes, localValues };
        return methodValue;
      }
      case 'UnaryExpression': {
        const v = this.eval(expression.expression);
        switch (expression.operator) {
          case '-':
            return -v;
          case '!':
            return !v;
        }
      }
      case 'FunctionCallExpression': {
        const functionVal = this.eval(expression.functionExpression, context) as FunctionValue;
        const args = functionVal.arguments;
        const body = functionVal.body;
        const ctx = functionVal.context;
        const argValues = expression.functionArguments.map((arg) => this.eval(arg, context));
        const bodyLocalValues = new Map(ctx.localValues);
        args.forEach((arg, i) => {
          bodyLocalValues.set(arg, checkNotNull(argValues[i]));
        });
        const bodyContext = { classes: ctx.classes, localValues: new Map(bodyLocalValues) };
        if (typeof body === 'function') return body(bodyContext);
        return this.eval(body, bodyContext);
      }
      case 'BinaryExpression': {
        switch (expression.operator.symbol) {
          case '*': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 * v2;
          }
          case '/': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            if (v2 === 0) {
              throw new PanicException('Division by zero!');
            }
            return Math.floor(v1 / v2);
          }
          case '%': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            if (v2 === 0) {
              throw new PanicException('Mod by zero!');
            }
            return v1 % v2;
          }
          case '+': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 + v2;
          }
          case '-': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 - v2;
          }
          case '<': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 < v2;
          }
          case '<=': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 <= v2;
          }
          case '>': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 > v2;
          }
          case '>=': {
            const v1 = this.eval(expression.e1) as number;
            const v2 = this.eval(expression.e2) as number;
            return v1 >= v2;
          }
          case '==': {
            const v1 = this.eval(expression.e1);
            const v2 = this.eval(expression.e2);
            if (
              (v1 as FunctionValue).type === 'functionValue' ||
              (v2 as FunctionValue).type === 'functionValue'
            ) {
              throw new PanicException('Cannot compare functions!');
            }
            return v1 === v2;
          }
          case '!=': {
            const v1 = this.eval(expression.e1);
            const v2 = this.eval(expression.e2);
            if (
              (v1 as FunctionValue).type === 'functionValue' ||
              (v2 as FunctionValue).type === 'functionValue'
            ) {
              throw new PanicException('Cannot compare functions!');
            }
            return v1 !== v2;
          }
          case '&&': {
            const v1 = this.eval(expression.e1) as boolean;
            return v1 && this.eval(expression.e2, context);
          }
          case '||': {
            const v1 = this.eval(expression.e1) as boolean;
            return v1 || this.eval(expression.e2, context);
          }
          case '::': {
            const v1 = this.eval(expression.e1) as string;
            const v2 = this.eval(expression.e2) as string;
            return v1 + v2;
          }
        }
      }
      case 'IfElseExpression': {
        return this.eval(
          (this.eval(expression.boolExpression) as boolean) ? expression.e1 : expression.e2,
          context,
        );
      }
      case 'MatchExpression': {
        const matchedValue = this.eval(expression.matchedExpression, context) as VariantValue;
        const matchedPattern =
          expression.matchingList.find((el) => el.tag.name === matchedValue.tag) ??
          this.blameTypeChecker();
        let ctx = context;
        if (matchedPattern.dataVariable) {
          const localValues = new Map(ctx.localValues);
          localValues.set(matchedPattern.dataVariable[0].name, matchedValue.data);
          ctx = { classes: ctx.classes, localValues };
        }
        return this.eval(matchedPattern.expression, ctx);
      }
      case 'LambdaExpression':
        return {
          type: 'functionValue',
          arguments: expression.parameters.map((param) => param.name.name),
          body: expression.body,
          context,
        };
      case 'StatementBlockExpression': {
        const { block } = expression;
        const contextForStatementBlock = {
          classes: context.classes,
          localValues: new Map(context.localValues),
        };
        block.statements.forEach((statement) => {
          const assignedValue = this.eval(statement.assignedExpression, contextForStatementBlock);
          const p = statement.pattern;
          switch (p.type) {
            case 'ObjectPattern': {
              const { objectContent } = assignedValue as ObjectValue;
              p.destructedNames.forEach(({ fieldName, alias }) => {
                const v = checkNotNull(objectContent.get(fieldName.name));
                contextForStatementBlock.localValues.set(alias?.name ?? fieldName.name, v);
              });
              break;
            }
            case 'VariablePattern':
              contextForStatementBlock.localValues.set(p.name, assignedValue);
              break;
            case 'WildCardPattern':
              break;
          }
        });
        const finalExpression = block.expression;
        return finalExpression === undefined
          ? { type: 'unit' }
          : this.eval(finalExpression, contextForStatementBlock);
      }
    }
  };
}

/**
 * Context for interpretation. It stores the previously computed values and references.
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
export type InterpretationContext = {
  readonly classes: ReadonlyMap<string, ClassValue>;
  readonly localValues: ReadonlyMap<string, Value>;
};

/**
 * The context for one class.
 *
 * @param functions all the defined static functions inside the class definition.
 * @param methods all the defined instance methods inside the class definition.
 */
export type ClassValue = {
  readonly functions: ReadonlyMap<string, FunctionValue>;
  readonly methods: ReadonlyMap<string, FunctionValue>;
};

/**
 * An empty interpretation context. Used for initial setup for interpreter.
 */
export const EMPTY: InterpretationContext = {
  classes: new Map(),
  localValues: new Map(),
};

export const createDefaultInterpretationContext = (
  collectPrinted: (s: string) => void,
): InterpretationContext => ({
  classes: new Map([
    [
      'Builtins',
      {
        functions: new Map([
          [
            'stringToInt',
            {
              type: 'functionValue',
              arguments: ['v'],
              body: (localContext) => {
                const value = localContext.localValues.get('v') as string;
                const parsedValue = parseInt(value, 10);
                if (!Number.isNaN(parsedValue)) {
                  return parsedValue;
                }
                throw new PanicException(`Cannot convert \`${value}\` to int.`);
              },
              context: EMPTY,
            },
          ],
          [
            'intToString',
            {
              type: 'functionValue',
              arguments: ['v'],
              body: (localContext) => {
                const argumentValue = localContext.localValues.get('v') as number;
                return argumentValue.toString();
              },
              context: EMPTY,
            },
          ],
          [
            'println',
            {
              type: 'functionValue',
              arguments: ['v'],
              body: (localContext) => {
                const value = localContext.localValues.get('v') as string;
                collectPrinted(value);
                return { type: 'unit' };
              },
              context: EMPTY,
            },
          ],
          [
            'panic',
            {
              type: 'functionValue',
              arguments: ['v'],
              body: (localContext) => {
                const value = localContext.localValues.get('v') as string;
                throw new PanicException(value);
              },
              context: EMPTY,
            },
          ],
        ]),
        methods: new Map(),
      },
    ],
  ]),
  localValues: new Map(),
});

/**
 * The universal exception thrown by SAMLANG programs.
 * The name `panic` is inspired by Go.
 * The reason for panic is always required.
 *
 * @param reason the reason of this exception.
 */
export class PanicException extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

export type Value =
  | UnitValue
  | number
  | string
  | boolean
  | ObjectValue
  | VariantValue
  | FunctionValue;

export type UnitValue = {
  readonly type: 'unit';
};

export type ObjectValue = {
  readonly type: 'object';
  readonly objectContent: Map<string, Value>;
};

export type VariantValue = {
  readonly type: 'variant';
  readonly tag: string;
  data: Value;
};

export type FunctionValue = {
  readonly type: 'functionValue';
  readonly arguments: string[];
  readonly body: SamlangExpression | ((context: InterpretationContext) => Value);
  context: InterpretationContext;
};
