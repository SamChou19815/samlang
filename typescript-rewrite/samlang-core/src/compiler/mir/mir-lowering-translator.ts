import { ENCODED_FUNCTION_NAME_MALLOC } from '../../ast/common/name-encoder';
import type { GlobalVariable } from '../../ast/common/structs';
import type { HighIRExpression, HighIRStatement } from '../../ast/hir/hir-expressions';
import {
  MidIRExpression,
  // eslint-disable-next-line camelcase
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_CONST,
  MIR_NAME,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_CALL_FUNCTION,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_RETURN,
} from '../../ast/mir';

const mangleVariableForMIR = (variable: string): string => `_${variable}`;

class MidIRLoweringManager {
  readonly stringGlobalVariableCollectors: GlobalVariable[] = [];

  lowerHIRExpressionToMIRExpression = (expression: HighIRExpression): MidIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return MIR_CONST(expression.value);
      case 'HighIRStringLiteralExpression':
        throw new Error();
      case 'HighIRNameExpression':
        return MIR_NAME(expression.name);
      case 'HighIRVariableExpression':
        return MIR_TEMP(mangleVariableForMIR(expression.name));
      case 'HighIRIndexAccessExpression':
        return MIR_IMMUTABLE_MEM(
          MIR_OP(
            '+',
            this.lowerHIRExpressionToMIRExpression(expression.expression),
            MIR_CONST(BigInt(expression.index * 8))
          )
        );
      case 'HighIRBinaryExpression':
        return MIR_OP(
          expression.operator,
          this.lowerHIRExpressionToMIRExpression(expression.e1),
          this.lowerHIRExpressionToMIRExpression(expression.e2)
        );
    }
  };

  lowerHIRStatementToMIRNonCanonicalStatements = (
    statement: HighIRStatement
    // eslint-disable-next-line camelcase
  ): readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[] => {
    switch (statement.__type__) {
      case 'HighIRFunctionCallStatement':
        return [
          MIR_CALL_FUNCTION(
            this.lowerHIRExpressionToMIRExpression(statement.functionExpression),
            statement.functionArguments.map(this.lowerHIRExpressionToMIRExpression),
            mangleVariableForMIR(statement.returnCollector)
          ),
        ];
      case 'HighIRIfElseStatement':
        throw new Error();
      case 'HighIRLetDefinitionStatement':
        return [
          MIR_MOVE_TEMP(
            MIR_TEMP(mangleVariableForMIR(statement.name)),
            this.lowerHIRExpressionToMIRExpression(statement.assignedExpression)
          ),
        ];
      case 'HighIRStructInitializationStatement': {
        const structTemporaryName = mangleVariableForMIR(statement.structVariableName);
        const structTemporary = MIR_TEMP(structTemporaryName);
        // eslint-disable-next-line camelcase
        const statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];
        statements.push(
          MIR_CALL_FUNCTION(
            ENCODED_FUNCTION_NAME_MALLOC,
            [MIR_CONST(BigInt(statement.expressionList.length * 8))],
            structTemporaryName
          )
        );
        statement.expressionList.forEach((subExpression, index) => {
          statements.push(
            MIR_MOVE_IMMUTABLE_MEM(
              MIR_IMMUTABLE_MEM(MIR_OP('+', structTemporary, MIR_CONST(BigInt(index * 8)))),
              this.lowerHIRExpressionToMIRExpression(subExpression)
            )
          );
        });
        return statements;
      }
      case 'HighIRReturnStatement':
        return [
          MIR_RETURN(
            statement.expression == null
              ? undefined
              : this.lowerHIRExpressionToMIRExpression(statement.expression)
          ),
        ];
    }
  };
}

const midIRTranslateStatementsAndCollectGlobalStrings = (
  statements: readonly HighIRStatement[]
): {
  // eslint-disable-next-line camelcase
  readonly loweredStatements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[];
  readonly stringGlobalVariables: GlobalVariable[];
} => {
  const manager = new MidIRLoweringManager();
  const loweredStatements = statements
    .map(manager.lowerHIRStatementToMIRNonCanonicalStatements)
    .flat();
  return { loweredStatements, stringGlobalVariables: manager.stringGlobalVariableCollectors };
};

export default midIRTranslateStatementsAndCollectGlobalStrings;
