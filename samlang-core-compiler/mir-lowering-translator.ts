import type MidIRResourceAllocator from './mir-resource-allocator';

import { ENCODED_FUNCTION_NAME_MALLOC } from 'samlang-core-ast/common-names';
import type { HighIRExpression, HighIRStatement } from 'samlang-core-ast/hir-expressions';
import {
  MidIRExpression,
  // eslint-disable-next-line camelcase
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MIR_CALL_FUNCTION,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_JUMP,
  MIR_LABEL,
  MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL,
  MIR_RETURN,
  MIR_CONST,
  MIR_NAME,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from 'samlang-core-ast/mir-nodes';
import { checkNotNull } from 'samlang-core-utils';

const mangleVariableForMIR = (variable: string): string => `_${variable}`;

const lowerHIRExpressionToMIRExpression = (expression: HighIRExpression): MidIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
      return MIR_CONST(expression.value);
    case 'HighIRNameExpression':
      return MIR_NAME(expression.name);
    case 'HighIRVariableExpression':
      return MIR_TEMP(mangleVariableForMIR(expression.name));
  }
};

class MidIRLoweringManager {
  constructor(
    private readonly allocator: MidIRResourceAllocator,
    private readonly functionName: string
  ) {}

  lowerHIRStatementToMIRNonCanonicalStatements = (
    statement: HighIRStatement
    // eslint-disable-next-line camelcase
  ): readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[] => {
    switch (statement.__type__) {
      case 'HighIRIndexAccessStatement': {
        return [
          MIR_MOVE_TEMP(
            mangleVariableForMIR(statement.name),
            MIR_IMMUTABLE_MEM(
              MIR_OP(
                '+',
                lowerHIRExpressionToMIRExpression(statement.pointerExpression),
                MIR_CONST(statement.index * 8)
              )
            )
          ),
        ];
      }
      case 'HighIRBinaryStatement':
        return [
          MIR_MOVE_TEMP(
            mangleVariableForMIR(statement.name),
            MIR_OP(
              statement.operator,
              lowerHIRExpressionToMIRExpression(statement.e1),
              lowerHIRExpressionToMIRExpression(statement.e2)
            )
          ),
        ];
      case 'HighIRFunctionCallStatement':
        return [
          MIR_CALL_FUNCTION(
            lowerHIRExpressionToMIRExpression(statement.functionExpression),
            statement.functionArguments.map(lowerHIRExpressionToMIRExpression),
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
            lowerHIRExpressionToMIRExpression(statement.booleanExpression),
            ifBranchLabel,
            elseBranchLabel
          ),
          MIR_LABEL(ifBranchLabel),
          ...statement.s1.map(this.lowerHIRStatementToMIRNonCanonicalStatements).flat(),
          ...(statement.finalAssignment != null
            ? [
                MIR_MOVE_TEMP(
                  mangleVariableForMIR(statement.finalAssignment.name),
                  lowerHIRExpressionToMIRExpression(statement.finalAssignment.branch1Value)
                ),
              ]
            : []),
          MIR_JUMP(endLabel),
          MIR_LABEL(elseBranchLabel),
          ...statement.s2.map(this.lowerHIRStatementToMIRNonCanonicalStatements).flat(),
          ...(statement.finalAssignment != null
            ? [
                MIR_MOVE_TEMP(
                  mangleVariableForMIR(statement.finalAssignment.name),
                  lowerHIRExpressionToMIRExpression(statement.finalAssignment.branch2Value)
                ),
              ]
            : []),
          MIR_LABEL(endLabel),
        ];
      }
      case 'HighIRSwitchStatement': {
        const { caseVariable, cases } = statement;
        const loweredStatements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];
        const endLabel = this.allocator.allocateLabelWithAnnotation(
          this.functionName,
          'SWITCH_END'
        );
        cases.forEach(({ caseNumber, statements }, i) => {
          const caseStartLabel = this.allocator.allocateLabelWithAnnotation(
            this.functionName,
            `CASE_${i}_START`
          );
          const caseEndLabel = this.allocator.allocateLabelWithAnnotation(
            this.functionName,
            `CASE_${i}_END`
          );
          loweredStatements.push(
            MIR_CJUMP_NON_FALLTHROUGH_NON_CANONICAL(
              MIR_OP('==', MIR_TEMP(mangleVariableForMIR(caseVariable)), MIR_CONST(caseNumber)),
              caseStartLabel,
              caseEndLabel
            ),
            MIR_LABEL(caseStartLabel)
          );
          statements
            .map(this.lowerHIRStatementToMIRNonCanonicalStatements)
            .forEach((it) => loweredStatements.push(...it));
          // istanbul ignore next
          if (statement.finalAssignment != null) {
            loweredStatements.push(
              MIR_MOVE_TEMP(
                mangleVariableForMIR(statement.finalAssignment.name),
                lowerHIRExpressionToMIRExpression(
                  checkNotNull(statement.finalAssignment.branchValues[i])
                )
              )
            );
          }
          loweredStatements.push(MIR_JUMP(endLabel), MIR_LABEL(caseEndLabel));
        });
        loweredStatements.push(MIR_LABEL(endLabel));
        return loweredStatements;
      }
      case 'HighIRLetDefinitionStatement':
        return [
          MIR_MOVE_TEMP(
            mangleVariableForMIR(statement.name),
            lowerHIRExpressionToMIRExpression(statement.assignedExpression)
          ),
        ];
      case 'HighIRStructInitializationStatement': {
        const structTemporaryName = mangleVariableForMIR(statement.structVariableName);
        // eslint-disable-next-line camelcase
        const statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];
        statements.push(
          MIR_CALL_FUNCTION(
            MIR_NAME(ENCODED_FUNCTION_NAME_MALLOC),
            [MIR_CONST(statement.expressionList.length * 8)],
            structTemporaryName
          )
        );
        statement.expressionList.forEach((subExpression, index) => {
          statements.push(
            MIR_MOVE_IMMUTABLE_MEM(
              MIR_OP(
                '+',
                MIR_TEMP(mangleVariableForMIR(statement.structVariableName)),
                MIR_CONST(index * 8)
              ),
              lowerHIRExpressionToMIRExpression(subExpression)
            )
          );
        });
        return statements;
      }
      case 'HighIRReturnStatement':
        return [MIR_RETURN(lowerHIRExpressionToMIRExpression(statement.expression))];
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
