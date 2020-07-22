import { ENCODED_FUNCTION_NAME_MALLOC } from '../../ast/common/name-encoder';
import type { GlobalVariable } from '../../ast/common/structs';
import type { HighIRExpression, HighIRStatement } from '../../ast/hir/hir-expressions';
import {
  MidIRExpression,
  // eslint-disable-next-line camelcase
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_EIGHT,
  MIR_CONST,
  MIR_NAME,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_CALL_FUNCTION,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_RETURN,
} from '../../ast/mir';
import MidIRResourceAllocator from './mir-resource-allocator';

const mangleVariableForMIR = (variable: string): string => `_${variable}`;

class MidIRLoweringManager {
  readonly stringGlobalVariableCollectors: GlobalVariable[] = [];

  constructor(
    private readonly allocator: MidIRResourceAllocator,
    private readonly functionName: string
  ) {}

  lowerHIRExpressionToMIRExpression = (expression: HighIRExpression): MidIRExpression => {
    switch (expression.__type__) {
      case 'HighIRIntLiteralExpression':
        return MIR_CONST(expression.value);
      case 'HighIRStringLiteralExpression': {
        const contentVariable = this.allocator.allocateStringArrayGlobalVariable(expression.value);
        this.stringGlobalVariableCollectors.push(contentVariable);
        return MIR_OP('+', MIR_NAME(contentVariable.name), MIR_EIGHT);
      }
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
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: readonly HighIRStatement[]
): {
  // eslint-disable-next-line camelcase
  readonly loweredStatements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[];
  readonly stringGlobalVariables: GlobalVariable[];
} => {
  const manager = new MidIRLoweringManager(allocator, functionName);
  const loweredStatements = statements
    .map(manager.lowerHIRStatementToMIRNonCanonicalStatements)
    .flat();
  return { loweredStatements, stringGlobalVariables: manager.stringGlobalVariableCollectors };
};

export default midIRTranslateStatementsAndCollectGlobalStrings;
