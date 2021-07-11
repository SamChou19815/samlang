import {
  HighIRType,
  HighIRIdentifierType,
  HighIRFunctionType,
  HighIRExpression,
  HighIRStatement,
  HighIRSources,
  HIR_NAME,
} from 'samlang-core-ast/hir-nodes';

// eslint-disable-next-line import/prefer-default-export
export class GenericsUsageCollector {
  private readonly _genericTypeDefinitionUsageMap = new Map<string, HighIRIdentifierType[]>();
  private readonly _genericFunctionUsageMap = new Map<string, HighIRFunctionType[]>();

  public get genericTypeDefinitionUsageMap(): ReadonlyMap<string, readonly HighIRIdentifierType[]> {
    return this._genericTypeDefinitionUsageMap;
  }

  public get genericFunctionUsageMap(): ReadonlyMap<string, readonly HighIRFunctionType[]> {
    return this._genericFunctionUsageMap;
  }

  visitSources(highIRSources: HighIRSources): void {
    highIRSources.functions.forEach((highIRFunction) => {
      this.typeVisitor(highIRFunction.type);
      highIRFunction.body.forEach(this.statementVisitor);
      this.expressionVisitor(highIRFunction.returnValue);
    });
  }

  private statementVisitor = (statement: HighIRStatement) => {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement':
        this.typeVisitor(statement.type);
        this.expressionVisitor(statement.pointerExpression);
        return;
      case 'HighIRBinaryStatement':
        this.typeVisitor(statement.type);
        this.expressionVisitor(statement.e1);
        this.expressionVisitor(statement.e2);
        return;
      case 'HighIRFunctionCallStatement':
        this.typeVisitor(statement.returnType);
        this.expressionVisitor(statement.functionExpression);
        statement.functionArguments.forEach(this.expressionVisitor);
        return;
      case 'HighIRIfElseStatement':
        this.expressionVisitor(statement.booleanExpression);
        statement.s1.forEach(this.statementVisitor);
        statement.s2.forEach(this.statementVisitor);
        statement.finalAssignments.forEach(({ type, branch1Value, branch2Value }) => {
          this.typeVisitor(type);
          this.expressionVisitor(branch1Value);
          this.expressionVisitor(branch2Value);
        });
        return;
      case 'HighIRStructInitializationStatement':
        this.typeVisitor(statement.type);
        statement.expressionList.forEach(this.expressionVisitor);
        return;
      case 'HighIRClosureInitializationStatement':
        this.typeVisitor(statement.closureType);
        this.expressionVisitor(HIR_NAME(statement.functionName, statement.functionType));
        this.expressionVisitor(statement.context);
        return;
    }
  };

  private expressionVisitor = (expression: HighIRExpression) => {
    this.typeVisitor(expression.type);
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
      case 'HighIRVariableExpression':
        return;
      case 'HighIRNameExpression':
        if (expression.type.__type__ === 'FunctionType') {
          GenericsUsageCollector.addUsage(
            expression.name,
            expression.type,
            this._genericFunctionUsageMap
          );
        }
        return;
    }
  };

  private typeVisitor = (type: HighIRType) => {
    switch (type.__type__) {
      case 'PrimitiveType':
        return;
      case 'IdentifierType':
        if (type.typeArguments.length > 0) {
          GenericsUsageCollector.addUsage(type.name, type, this._genericTypeDefinitionUsageMap);
        }
        return;
      case 'FunctionType':
      case 'ClosureType':
        type.argumentTypes.forEach(this.typeVisitor);
        this.typeVisitor(type.returnType);
        return;
    }
  };

  private static addUsage<T extends HighIRType>(name: string, type: T, map: Map<string, T[]>) {
    const existingArray = map.get(name);
    if (existingArray == null) {
      map.set(name, [type]);
    } else {
      existingArray.push(type);
    }
  }
}
