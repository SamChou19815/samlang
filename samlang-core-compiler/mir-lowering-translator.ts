import createHighIRFlexibleOrderOperatorNode from './hir-flexible-op';
import type MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import {
  HighIRExpression,
  HighIRStatement,
  HIR_INT,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';
import {
  // eslint-disable-next-line camelcase
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_CALL_FUNCTION,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';

const mangleVariableForMIR = (variable: string): string => `_${variable}`;

class MidIRLoweringManager {
  constructor(
    private readonly allocator: MidIRResourceAllocator,
    private readonly functionName: string
  ) {}

  lowerHIRExpressionToMIRExpression = (expression: HighIRExpression): HighIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
      case 'HighIRNameExpression':
        return expression;
      case 'HighIRVariableExpression':
        return HIR_VARIABLE(mangleVariableForMIR(expression.name), expression.type);
      case 'HighIRIndexAccessExpression':
        return HIR_INDEX_ACCESS({
          type: expression.type,
          expression: this.lowerHIRExpressionToMIRExpression(expression.expression),
          index: expression.index,
        });
      case 'HighIRBinaryExpression':
        return HIR_BINARY({
          operator: expression.operator,
          e1: this.lowerHIRExpressionToMIRExpression(expression.e1),
          e2: this.lowerHIRExpressionToMIRExpression(expression.e2),
        });
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
            statement.returnCollector != null
              ? mangleVariableForMIR(statement.returnCollector.name)
              : undefined
          ),
        ];
      case 'HighIRIfElseStatement': {
        const ifBranchLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'TRUE_BRANCH'
        );
        const elseBranchLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'FALSE_BRANCH'
        );
        const endLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'IF_ELSE_END'
        );
        return [
          MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(
            this.lowerHIRExpressionToMIRExpression(statement.booleanExpression),
            ifBranchLabel,
            elseBranchLabel
          ),
          MIR_LABEL(ifBranchLabel),
          ...statement.s1.map(this.lowerHIRStatementToMIRNonCanonicalStatements).flat(),
          MIR_JUMP(endLabel),
          MIR_LABEL(elseBranchLabel),
          ...statement.s2.map(this.lowerHIRStatementToMIRNonCanonicalStatements).flat(),
          MIR_LABEL(endLabel),
        ];
      }
      case 'HighIRLetDefinitionStatement':
        return [
          MIR_MOVE_TEMP(
            mangleVariableForMIR(statement.name),
            this.lowerHIRExpressionToMIRExpression(statement.assignedExpression)
          ),
        ];
      case 'HighIRStructInitializationStatement': {
        const structTemporaryName = mangleVariableForMIR(statement.structVariableName);
        const structTemporary = HIR_VARIABLE(structTemporaryName, statement.type);
        // eslint-disable-next-line camelcase
        const statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];
        statements.push(
          MIR_CALL_FUNCTION(
            HIR_NAME(ENCODED_FUNCTION_NAME_MALLOC, HIR_INT_TYPE),
            [HIR_INT(statement.expressionList.length * 8)],
            structTemporaryName
          )
        );
        statement.expressionList.forEach((subExpression, index) => {
          statements.push(
            MIR_MOVE_IMMUTABLE_MEM(
              createHighIRFlexibleOrderOperatorNode('+', structTemporary, HIR_INT(index * 8)),
              this.lowerHIRExpressionToMIRExpression(subExpression)
            )
          );
        });
        return statements;
      }
      case 'HighIRReturnStatement':
        return [MIR_RETURN(this.lowerHIRExpressionToMIRExpression(statement.expression))];
    }
  };
}

const midIRTranslateStatementsAndCollectGlobalStrings = (
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: readonly HighIRStatement[]
): // eslint-disable-next-line camelcase
readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[] => {
  const manager = new MidIRLoweringManager(allocator, functionName);
  return statements.map(manager.lowerHIRStatementToMIRNonCanonicalStatements).flat();
};

export default midIRTranslateStatementsAndCollectGlobalStrings;
