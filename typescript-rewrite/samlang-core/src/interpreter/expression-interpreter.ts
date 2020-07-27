import { SamlangExpression, SamlangValStatement, ObjectConstructorExpressionFieldConstructor, EXPRESSION_PANIC, EXPRESSION_BUILTIN_FUNCTION_CALL, VariantPatternToExpression } from '../ast/lang/samlang-expressions';
import { IdentifierType, unitType, TupleType } from '../ast/common/types';
import { ObjectPatternDestucturedName } from '../ast/lang/samlang-pattern';

export default class ExpressionInterpreter {
  private printedCollector: string = "";

  private blameTypeChecker = (message: string = ""): never => {
    throw Error(message);
  };

  readonly eval = (expression: SamlangExpression) => {
    switch (expression.__type__) {
      case 'LiteralExpression':
        return expression.literal.value;
      case 'ThisExpression':
        return 'this';
      case 'VariableExpression':
        return expression.name;
      case 'ClassMemberExpression':
        return expression.className;
      case 'TupleConstructorExpression':
        return expression.expressions.map((e) => this.eval(e));
      case 'ObjectConstructorExpression':
        return expression.fieldDeclarations.forEach((declaration: ObjectConstructorExpressionFieldConstructor) => {
          if (declaration.expression) {
            this.eval(declaration.expression)
          }
        });
      case 'VariantConstructorExpression':
        return this.eval(expression.data);
      case 'FieldAccessExpression':
        const thisValue = this.eval(expression.expression);
        return thisValue[expression.fieldName];
      case 'MethodAccessExpression':
        const { identifier } = expression.expression.type as IdentifierType;
        return this.eval(expression.expression)[identifier];
      case 'UnaryExpression':
        const v = this.eval(expression.expression);
        switch (expression.operator) {
          case '!':
            return !v;
          case '-':
            return -v;
        };
      case 'PanicExpression':
        throw EXPRESSION_PANIC(expression);
      case 'BuiltInFunctionCallExpression':
        const argumentValue = this.eval(expression.argumentExpression);
        switch (expression.functionName) {
          case 'stringToInt':
            return +argumentValue;
          case 'intToString':
            return argumentValue.toString();
          case 'println':
            this.printedCollector.concat(argumentValue);
            return unitType;
        }
      case 'FunctionCallExpression':
        const { args, body } = this.eval(expression.functionExpression);
        const argValues = expression.functionArguments.map((arg) => this.eval(arg));
        return this.eval(expression.functionExpression);
      case 'BinaryExpression':
        switch (expression.operator.symbol) {
          case '*': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 * v2;
          }
          case '/': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            if (v2 === 0) {
              throw EXPRESSION_PANIC({
                range: expression.range,
                type: expression.type,
                expression: expression.e2
              });
            }
            return v1 / v2;
          }
          case '%': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            if (v2 === 0) {
              throw EXPRESSION_PANIC({
                range: expression.range,
                type: expression.type,
                expression: expression.e2
              });
            }
            return v1 % v2;
          }
          case '+': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 + v2;
          }
          case '-': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 - v2;
          }
          case '<': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 < v2;
          }
          case '<=': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 <= v2;
          }
          case '>': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 > v2;
          }
          case '>=': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 >= v2;
          }
          case '==': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 === v2;
          }
          case '!=': {
            const v1: number = this.eval(expression.e1);
            const v2: number = this.eval(expression.e2);
            return v1 !== v2;
          }
          case '&&': {
            const v1: boolean = this.eval(expression.e1);
            const v2: boolean = this.eval(expression.e2);
            return v1 && v2;
          }
          case '||': {
            const v1: boolean = this.eval(expression.e1);
            const v2: boolean = this.eval(expression.e2);
            return v1 || v2;
          }
          case '::': {
            const v1: string = this.eval(expression.e1);
            const v2: string = this.eval(expression.e2);
            return v1 + v2;
          }
        }
      case 'IfElseExpression':
        return this.eval(expression.boolExpression) ? expression.e1 : expression.e2;
      case 'MatchExpression':
        const matchedValue: VariantPatternToExpression = this.eval(expression.matchedExpression);
        const matchedPattern = expression.matchingList.find((el) => el.tag === matchedValue.tag);
        return matchedPattern;
      case 'LambdaExpression':
        const arguments = expression.parameters.map(param => param[0]);
        return this.eval(expression.body);
      case 'StatementBlockExpression':
        const { block } = expression;
        block.statements.forEach((statement: SamlangValStatement) => {
          const assignedValue = this.eval(statement.assignedExpression);
          const p = statement.pattern;
          switch (p.type) {
            case 'TuplePattern': {
              const tupleValues = <TupleType>assignedValue.mappings;
              const additionalMappings = p.destructedNames.map((nameWithRange, i) => {
                if (nameWithRange[0] !== null) {
                  return [nameWithRange[0], tupleValues[i]];
                } else {
                  return null;
                }
              })
              const additionalMappingsNotNull = additionalMappings.filter((m) => m !== null);
              return additionalMappingsNotNull;
            }
            case 'ObjectPattern': {
              const { objectValueMappings } = assignedValue;
              const additionalMappings = p.destructedNames.map(({ fieldName, alias }: ObjectPatternDestucturedName, i) => {
                const v = objectValueMappings[fieldName] || this.blameTypeChecker();
                return [alias || fieldName, v];
              })
              return additionalMappings;
            }
            case 'VariablePattern':
              return [p.name, assignedValue];
            case 'WildCardPattern':
              return unitType;
          }
        });
        const finalExpression = block.expression;
        return finalExpression === undefined ? unitType : this.eval(finalExpression);
    }
  }
}