import { IdentifierType } from '../ast/common/types';
import { SamlangExpression } from '../ast/lang/samlang-expressions';
import { InterpretationContext, EMPTY } from './interpretation-context';
import PanicException from './panic-exception';
import {
  Value,
  ObjectValue,
  IntValue,
  BoolValue,
  StringValue,
  FunctionValue,
  VariantValue,
  TupleValue,
  isSameValue,
} from './value';

export default class ExpressionInterpreter {
  private printedCollector = '';

  private blameTypeChecker = (message = ''): never => {
    throw Error(message);
  };

  readonly eval = (
    expression: SamlangExpression,
    context: InterpretationContext = EMPTY
  ): Value => {
    switch (expression.__type__) {
      case 'LiteralExpression': {
        switch (expression.literal.type) {
          case 'IntLiteral':
            return { type: 'int', value: Number(expression.literal.value) };
          case 'StringLiteral':
            return { type: 'string', value: expression.literal.value };
          case 'BoolLiteral':
            return { type: 'bool', value: expression.literal.value };
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'ThisExpression':
        return context.localValues.get('this') ?? this.blameTypeChecker('Missing `this`');
      case 'VariableExpression':
        return (
          context.localValues.get(expression.name) ??
          this.blameTypeChecker(`Missing variable ${expression.name}`)
        );
      case 'ClassMemberExpression':
        return (
          context.classes.get(expression.className)?.functions?.get(expression.memberName) ??
          this.blameTypeChecker()
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
          context.classes.get(identifier)?.methods?.get(expression.methodName) ??
          this.blameTypeChecker();
        const newCtx = { ...context };
        newCtx.localValues = context.localValues.set('this', thisValue);
        methodValue.context = newCtx;
        return methodValue;
      }
      case 'UnaryExpression': {
        let v = this.eval(expression.expression);
        switch (expression.operator) {
          case '-':
            v = v as IntValue;
            return { type: 'int', value: -v.value };
          case '!':
            v = v as BoolValue;
            return { type: 'bool', value: !v.value };
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'PanicExpression':
        throw new PanicException((this.eval(expression.expression, context) as StringValue).value);
      case 'BuiltInFunctionCallExpression': {
        const argumentValue = this.eval(expression.argumentExpression, context);
        switch (expression.functionName) {
          case 'stringToInt': {
            const value = (argumentValue as StringValue).value;
            const parsedValue = parseInt(value, 10);
            if (!Number.isNaN(parsedValue)) {
              return { type: 'int', value: parsedValue };
            }
            throw new PanicException(`Cannot convert \`${value}\` to int.`);
          }
          case 'intToString':
            return { type: 'string', value: (argumentValue as IntValue).value.toString() };
          case 'println':
            this.printedCollector.concat(`${(argumentValue as StringValue).value}\n`);
            return { type: 'unit' };
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'FunctionCallExpression': {
        const functionVal = this.eval(expression.functionExpression) as FunctionValue;
        const args = functionVal.arguments;
        const body = functionVal.body;
        const ctx = functionVal.context;
        const argValues = expression.functionArguments.map((arg) => this.eval(arg, context));
        const bodyContext = { ...ctx };
        args.forEach((arg, i) => {
          ctx.localValues.set(arg, argValues[i]);
        });
        return this.eval(body, bodyContext);
      }
      case 'BinaryExpression': {
        switch (expression.operator.symbol) {
          case '*': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'int', value: v1.value * v2.value };
          }
          case '/': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            if (v2.value === 0) {
              throw new PanicException('Division by zero!');
            }
            return { type: 'int', value: v1.value / v2.value };
          }
          case '%': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            if (v2.value === 0) {
              throw new PanicException('Mod by zero!');
            }
            return { type: 'int', value: v1.value % v2.value };
          }
          case '+': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'int', value: v1.value + v2.value };
          }
          case '-': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'int', value: v1.value - v2.value };
          }
          case '<': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'bool', value: v1.value < v2.value };
          }
          case '<=': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'bool', value: v1.value <= v2.value };
          }
          case '>': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'bool', value: v1.value > v2.value };
          }
          case '>=': {
            const v1 = this.eval(expression.e1) as IntValue;
            const v2 = this.eval(expression.e2) as IntValue;
            return { type: 'bool', value: v1.value >= v2.value };
          }
          case '==': {
            const v1 = this.eval(expression.e1);
            const v2 = this.eval(expression.e2);
            if (v1.type === 'functionValue' || v2.type === 'functionValue') {
              throw new PanicException('Cannot compare functions!');
            }
            return { type: 'bool', value: isSameValue(v1, v2) };
          }
          case '!=': {
            const v1 = this.eval(expression.e1);
            const v2 = this.eval(expression.e2);
            if (v1.type === 'functionValue' || v2.type === 'functionValue') {
              throw new PanicException('Cannot compare functions!');
            }
            return { type: 'bool', value: !isSameValue(v1, v2) };
          }
          case '&&': {
            const v1 = this.eval(expression.e1) as BoolValue;
            return !v1.value ? { type: 'bool', value: false } : this.eval(expression.e2, context);
          }
          case '||': {
            const v1 = this.eval(expression.e1) as BoolValue;
            return v1.value ? { type: 'bool', value: true } : this.eval(expression.e2, context);
          }
          case '::': {
            const v1 = this.eval(expression.e1) as StringValue;
            const v2 = this.eval(expression.e2) as StringValue;
            return { type: 'string', value: v1.value + v2.value };
          }
        }
      }
      // eslint-disable-next-line no-fallthrough
      case 'IfElseExpression': {
        return this.eval(
          (this.eval(expression.boolExpression) as BoolValue).value ? expression.e1 : expression.e2,
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
          ctx = { ...context };
          ctx.localValues.set(matchedPattern.dataVariable, matchedValue.data);
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
        const currentContext = { ...context };
        block.statements.forEach((statement) => {
          const assignedValue = this.eval(statement.assignedExpression, currentContext);
          const p = statement.pattern;
          switch (p.type) {
            case 'TuplePattern': {
              const { tupleContent } = assignedValue as TupleValue;
              p.destructedNames.forEach((nameWithRange, i) => {
                if (nameWithRange[0] !== null) {
                  currentContext.localValues.set(nameWithRange[0], tupleContent[i]);
                }
              });
              break;
            }
            case 'ObjectPattern': {
              const { objectContent } = assignedValue as ObjectValue;
              p.destructedNames.forEach(({ fieldName, alias }) => {
                const v = objectContent.get(fieldName) ?? this.blameTypeChecker();
                currentContext.localValues.set(alias ?? fieldName, v);
              });
              break;
            }
            case 'VariablePattern':
              currentContext.localValues.set(p.name, assignedValue);
              break;
            case 'WildCardPattern':
              break;
          }
        });
        const finalExpression = block.expression;
        return finalExpression === undefined ? { type: 'unit' } : this.eval(finalExpression);
      }
    }
  };
}
