import type { IdentifierType } from 'samlang-core-ast/common-nodes';
import {
  SamlangExpression,
  SourceExpressionVariable,
  SourceExpressionLambda,
  SourceClassDefinition,
  SamlangModule,
} from 'samlang-core-ast/samlang-nodes';
import { assert, checkNotNull, zip } from 'samlang-core/utils';

import PanicException from './panic-exception';

export type Value =
  | UnitValue
  | number
  | string
  | boolean
  | TupleValue
  | ObjectValue
  | VariantValue
  | FunctionValue
  | BuiltinsFunctionValue;

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

export type BuiltinsFunctionValue = {
  readonly type: 'builtinFunction';
  readonly value: 'stringToInt' | 'intToString' | 'println' | 'panic';
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
            return expression.literal.value;
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
        if (expression.className === 'Builtins') {
          switch (expression.memberName) {
            case 'stringToInt':
            case 'intToString':
            case 'println':
            case 'panic':
              return { type: 'builtinFunction', value: expression.memberName };
          }
        }
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
              this.eval(
                SourceExpressionVariable({ range, type, name, associatedComments: [] }),
                context
              )
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
      case 'FunctionCallExpression': {
        const functionVal = this.eval(expression.functionExpression, context);
        const argValues = expression.functionArguments.map((arg) => this.eval(arg, context));
        if (typeof functionVal === 'object' && functionVal.type === 'builtinFunction') {
          const argumentValue = checkNotNull(argValues[0]);
          switch (functionVal.value) {
            case 'stringToInt': {
              const value = argumentValue as string;
              const parsedValue = parseInt(value, 10);
              if (!Number.isNaN(parsedValue)) return parsedValue;
              throw new PanicException(`Cannot convert \`${value}\` to int.`);
            }
            case 'intToString':
              return (argumentValue as number).toString();
            case 'println':
              this.printedCollector += `${argumentValue as string}\n`;
              return { type: 'unit' };
            case 'panic':
              throw new PanicException(argumentValue as string);
          }
        }
        assert(typeof functionVal === 'object' && functionVal.type === 'functionValue');
        const args = functionVal.arguments;
        const body = functionVal.body;
        const ctx = functionVal.context;
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
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 * v2;
          }
          case '/': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            if (v2 === 0) {
              throw new PanicException('Division by zero!');
            }
            const result = v1 / v2;
            return result >= 0 ? Math.floor(result) : Math.ceil(result);
          }
          case '%': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            if (v2 === 0) {
              throw new PanicException('Mod by zero!');
            }
            return v1 % v2;
          }
          case '+': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 + v2;
          }
          case '-': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 - v2;
          }
          case '<': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 < v2;
          }
          case '<=': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 <= v2;
          }
          case '>': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
            return v1 > v2;
          }
          case '>=': {
            const v1 = this.eval(expression.e1, context) as number;
            const v2 = this.eval(expression.e2, context) as number;
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
                contextForStatementBlock.localValues[alias?.[0] ?? fieldName] = v;
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
    classDefinition: SourceClassDefinition,
    context: InterpretationContext
  ): InterpretationContext => {
    const functions: Record<string, FunctionValue> = {};
    const methods: Record<string, FunctionValue> = {};
    classDefinition.members.forEach((member) => {
      const lambda = SourceExpressionLambda({
        range: member.range,
        type: member.type,
        associatedComments: [],
        parameters: member.parameters.map(({ name, nameRange, type }) => [name, nameRange, type]),
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
      f.context = newContext;
    });
    Object.values(methods).forEach((m) => {
      m.context = newContext;
    });
    return newContext;
  };
}

export default function interpretSamlangModule(
  samlangModule: SamlangModule,
  context: InterpretationContext = EMPTY
): string {
  return new ModuleInterpreter().run(samlangModule, context);
}
