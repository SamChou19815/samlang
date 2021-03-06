import PanicException from './panic-exception';

import type { IdentifierType } from 'samlang-core-ast/common-nodes';
import {
  SamlangExpression,
  EXPRESSION_VARIABLE,
  EXPRESSION_LAMBDA,
} from 'samlang-core-ast/samlang-expressions';
import type { SamlangModule, ClassDefinition } from 'samlang-core-ast/samlang-toplevel';
import { zip } from 'samlang-core-utils';

export type Value =
  | UnitValue
  | bigint
  | string
  | boolean
  | TupleValue
  | ObjectValue
  | VariantValue
  | FunctionValue;

export type UnitValue = {
  readonly type: 'unit';
};

export type TupleValue = {
  readonly type: 'tuple';
  readonly tupleContent: Value[];
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
  readonly body: SamlangExpression;
  context: InterpretationContext;
};

/**
 * Context for interpretation. It stores the previously computed values and references.
 * @param classes the class definitions that can be used as reference.
 * @param localValues the local values computed inside a function.
 */
export type InterpretationContext = {
  readonly classes: Readonly<Record<string, ClassValue>>;
  readonly localValues: Readonly<Record<string, Value>>;
};

/**
 * The context for one class.
 *
 * @param functions all the defined static functions inside the class definition.
 * @param methods all the defined instance methods inside the class definition.
 */
export type ClassValue = {
  readonly functions: Readonly<Record<string, FunctionValue>>;
  readonly methods: Readonly<Record<string, FunctionValue>>;
};

/**
 * An empty interpretation context. Used for initial setup for interpreter.
 */
export const EMPTY: InterpretationContext = {
  classes: {},
  localValues: {},
};

export class ExpressionInterpreter {
  private printedCollector = '';

  printed = (): string => this.printedCollector;

  private blameTypeChecker = (message = ''): never => {
    throw Error(message);
  };

  readonly eval = (expression: SamlangExpression, context: InterpretationContext): Value => {
    switch (expression.__type__) {
      case 'LiteralExpression': {
        switch (expression.literal.type) {
          case 'IntLiteral':
            return BigInt(expression.literal.value.toString());
          case 'StringLiteral':
          case 'BoolLiteral':
            return expression.literal.value;
        }
      }
      case 'ThisExpression':
        return context.localValues.this ?? this.blameTypeChecker('Missing `this`');
      case 'VariableExpression':
        return (
          context.localValues[expression.name] ??
          this.blameTypeChecker(`Missing variable ${expression.name}`)
        );
      case 'ClassMemberExpression':
        return (
          context.classes[expression.className]?.functions?.[expression.memberName] ||
          this.blameTypeChecker(
            `Missing ${expression.className}.${expression.memberName} ${JSON.stringify(context)}`
          )
        );
      case 'TupleConstructorExpression':
        return {
          type: 'tuple',
          tupleContent: expression.expressions.map((e) => this.eval(e, context)),
        };
      case 'ObjectConstructorExpression': {
        const objectContent = new Map<string, Value>();
        expression.fieldDeclarations.forEach((declaration) => {
          if (declaration.expression) {
            objectContent.set(declaration.name, this.eval(declaration.expression, context));
          } else {
            const { range, type, name } = declaration;
            objectContent.set(
              declaration.name,
              this.eval(EXPRESSION_VARIABLE({ range, type, name }), context)
            );
          }
        });
        return { type: 'object', objectContent };
      }
      case 'VariantConstructorExpression':
        return { type: 'variant', tag: expression.tag, data: this.eval(expression.data, context) };
      case 'FieldAccessExpression': {
        const thisValue = this.eval(expression.expression, context) as ObjectValue;
        return thisValue.objectContent?.get(expression.fieldName) ?? this.blameTypeChecker();
      }
      case 'MethodAccessExpression': {
        const identifier = (expression.expression.type as IdentifierType).identifier;
        const thisValue = this.eval(expression.expression, context);
        const methodValue =
          context.classes[identifier]?.methods?.[expression.methodName] ?? this.blameTypeChecker();
        methodValue.context = {
          classes: context.classes,
          localValues: { ...context.localValues, this: thisValue },
        };
        return methodValue;
      }
      case 'UnaryExpression': {
        const v = this.eval(expression.expression, context);
        switch (expression.operator) {
          case '-':
            return -v;
          case '!':
            return !v;
        }
      }
      case 'PanicExpression':
        throw new PanicException(this.eval(expression.expression, context) as string);
      case 'BuiltInFunctionCallExpression': {
        const argumentValue = this.eval(expression.argumentExpression, context);
        switch (expression.functionName) {
          case 'stringToInt': {
            const value = argumentValue as string;
            const parsedValue = parseInt(value, 10);
            if (!Number.isNaN(parsedValue)) {
              return BigInt(parsedValue);
            }
            throw new PanicException(`Cannot convert \`${value}\` to int.`);
          }
          case 'intToString':
            return (argumentValue as bigint).toString();
          case 'println':
            this.printedCollector += `${argumentValue as string}\n`;
            return { type: 'unit' };
        }
      }
      case 'FunctionCallExpression': {
        const functionVal = this.eval(expression.functionExpression, context) as FunctionValue;
        const args = functionVal.arguments;
        const body = functionVal.body;
        const ctx = functionVal.context;
        const argValues = expression.functionArguments.map((arg) => this.eval(arg, context));
        const bodyLocalValues = { ...ctx.localValues };
        zip(args, argValues).forEach(([arg, value]) => {
          bodyLocalValues[arg] = value;
        });
        const bodyContext = { classes: ctx.classes, localValues: { ...bodyLocalValues } };
        return this.eval(body, bodyContext);
      }
      case 'BinaryExpression': {
        switch (expression.operator.symbol) {
          case '*': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return BigInt(v1 * v2);
          }
          case '/': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            if (v2 === BigInt(0)) {
              throw new PanicException('Division by zero!');
            }
            return BigInt(v1 / v2);
          }
          case '%': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            if (v2 === BigInt(0)) {
              throw new PanicException('Mod by zero!');
            }
            return BigInt(v1 % v2);
          }
          case '+': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return BigInt(v1 + v2);
          }
          case '-': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return BigInt(v1 - v2);
          }
          case '<': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return v1 < v2;
          }
          case '<=': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return v1 <= v2;
          }
          case '>': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return v1 > v2;
          }
          case '>=': {
            const v1 = this.eval(expression.e1, context) as bigint;
            const v2 = this.eval(expression.e2, context) as bigint;
            return v1 >= v2;
          }
          case '==': {
            const v1 = this.eval(expression.e1, context);
            const v2 = this.eval(expression.e2, context);
            if (
              (v1 as FunctionValue).type === 'functionValue' ||
              (v2 as FunctionValue).type === 'functionValue'
            ) {
              throw new PanicException('Cannot compare functions!');
            }
            return v1 === v2;
          }
          case '!=': {
            const v1 = this.eval(expression.e1, context);
            const v2 = this.eval(expression.e2, context);
            if (
              (v1 as FunctionValue).type === 'functionValue' ||
              (v2 as FunctionValue).type === 'functionValue'
            ) {
              throw new PanicException('Cannot compare functions!');
            }
            return v1 !== v2;
          }
          case '&&': {
            const v1 = this.eval(expression.e1, context) as boolean;
            return v1 && this.eval(expression.e2, context);
          }
          case '||': {
            const v1 = this.eval(expression.e1, context) as boolean;
            return v1 || this.eval(expression.e2, context);
          }
          case '::': {
            const v1 = this.eval(expression.e1, context) as string;
            const v2 = this.eval(expression.e2, context) as string;
            return v1 + v2;
          }
        }
      }
      case 'IfElseExpression': {
        return this.eval(
          (this.eval(expression.boolExpression, context) as boolean)
            ? expression.e1
            : expression.e2,
          context
        );
      }
      case 'MatchExpression': {
        const matchedValue = this.eval(expression.matchedExpression, context) as VariantValue;
        const matchedPattern =
          expression.matchingList.find((el) => el.tag === matchedValue.tag) ??
          this.blameTypeChecker();
        let ctx = context;
        if (matchedPattern.dataVariable) {
          ctx = {
            classes: ctx.classes,
            localValues: {
              ...ctx.localValues,
              [matchedPattern.dataVariable?.[0]]: matchedValue.data,
            },
          };
        }
        return this.eval(matchedPattern.expression, ctx);
      }
      case 'LambdaExpression':
        return {
          type: 'functionValue',
          arguments: expression.parameters.map((param) => param[0]),
          body: expression.body,
          context,
        };
      case 'StatementBlockExpression': {
        const { block } = expression;
        const contextForStatementBlock = { ...context, localValues: { ...context.localValues } };
        block.statements.forEach((statement) => {
          const assignedValue = this.eval(statement.assignedExpression, contextForStatementBlock);
          const p = statement.pattern;
          switch (p.type) {
            case 'TuplePattern': {
              const { tupleContent } = assignedValue as TupleValue;
              zip(p.destructedNames, tupleContent).forEach(([{ name }, value]) => {
                if (name != null) {
                  contextForStatementBlock.localValues[name] = value;
                }
              });
              break;
            }
            case 'ObjectPattern': {
              const { objectContent } = assignedValue as ObjectValue;
              p.destructedNames.forEach(({ fieldName, alias }) => {
                const v = objectContent.get(fieldName) ?? this.blameTypeChecker();
                contextForStatementBlock.localValues[alias ?? fieldName] = v;
              });
              break;
            }
            case 'VariablePattern':
              contextForStatementBlock.localValues[p.name] = assignedValue;
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

/** The interpreter used to evaluate an already type checked source with single module. */
class ModuleInterpreter {
  private expressionInterpreter: ExpressionInterpreter = new ExpressionInterpreter();

  printed = (): string => this.expressionInterpreter.printed();

  /**
   * Run the [module] under some interpretation [context].
   * to get all printed strings or a [PanicException].
   */
  run = (module: SamlangModule, context: InterpretationContext): string => {
    this.eval(module, context);
    return this.printed();
  };

  /**
   * Evaluate the [module] under some interpretation [context] (default to empty)
   * to either a value or a [PanicException].
   */
  private eval = (module: SamlangModule, context: InterpretationContext): Value => {
    try {
      return this.unsafeEval(module, context);
    } catch (e) {
      throw new PanicException('Interpreter Error.');
    }
  };

  /**
   * Evaluate the module directly, without considering stack overflow and other errors beyond our control.
   */
  private unsafeEval = (module: SamlangModule, context: InterpretationContext): Value => {
    const fullCtx = module.classes.reduce(
      (newContext, classDefinition) => this.evalContext(classDefinition, newContext),
      context
    );
    if (!fullCtx.classes.Main) {
      return { type: 'unit' };
    }
    const mainModule = fullCtx.classes.Main;
    if (!mainModule.functions.main) {
      return { type: 'unit' };
    }
    const mainFunction = mainModule.functions.main;
    if (mainFunction.arguments.length > 0) {
      return { type: 'unit' };
    }
    return this.expressionInterpreter.eval(mainFunction.body, mainFunction.context);
  };

  private evalContext = (
    classDefinition: ClassDefinition,
    context: InterpretationContext
  ): InterpretationContext => {
    const functions: Record<string, FunctionValue> = {};
    const methods: Record<string, FunctionValue> = {};
    classDefinition.members.forEach((member) => {
      const lambda = EXPRESSION_LAMBDA({
        range: member.range,
        type: member.type,
        parameters: member.parameters.map(({ name, type }) => [name, type]),
        captured: {},
        body: member.body,
      });
      const value = this.expressionInterpreter.eval(lambda, context) as FunctionValue;
      if (member.isMethod) {
        methods[member.name] = value;
      } else {
        functions[member.name] = value;
      }
    });
    const newModule: ClassValue = {
      functions,
      methods,
    };
    const newContext = {
      ...context,
      classes: {
        ...context.classes,
        [classDefinition.name]: newModule,
      },
    };
    // patch the functions and methods with correct context.
    Object.values(functions).forEach((f) => {
      // eslint-disable-next-line no-param-reassign
      f.context = newContext;
    });
    Object.values(methods).forEach((m) => {
      // eslint-disable-next-line no-param-reassign
      m.context = newContext;
    });
    return newContext;
  };
}

const interpretSamlangModule = (
  samlangModule: SamlangModule,
  context: InterpretationContext = EMPTY
): string => new ModuleInterpreter().run(samlangModule, context);

export default interpretSamlangModule;
