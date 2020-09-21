import { constantFoldExpression } from './constant-folding-optimization';

import analyzePropagatedConstants from 'samlang-core-analysis/constant-propagation-analysis';
import {
  MidIRStatement,
  MidIRExpression,
  MIR_CONST,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_JUMP,
  MIR_RETURN,
} from 'samlang-core-ast/mir-nodes';
import { isNotNull } from 'samlang-core-utils';

const optimizeExpressionWithConstantPropagationInformation = (
  expression: MidIRExpression,
  constantPropagationInformation: ReadonlyMap<string, bigint>
): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
      return expression;
    case 'MidIRTemporaryExpression': {
      const value = constantPropagationInformation.get(expression.temporaryID);
      if (value == null) {
        return expression;
      }
      return MIR_CONST(value);
    }
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(
        optimizeExpressionWithConstantPropagationInformation(
          expression.indexExpression,
          constantPropagationInformation
        )
      );
    case 'MidIRBinaryExpression':
      return MIR_OP(
        expression.operator,
        optimizeExpressionWithConstantPropagationInformation(
          expression.e1,
          constantPropagationInformation
        ),
        optimizeExpressionWithConstantPropagationInformation(
          expression.e2,
          constantPropagationInformation
        )
      );
  }
};

const optimizeExpression = (
  expression: MidIRExpression,
  constantPropagationInformation: ReadonlyMap<string, bigint>
): MidIRExpression =>
  constantFoldExpression(
    optimizeExpressionWithConstantPropagationInformation(expression, constantPropagationInformation)
  );

const optimizeStatement = (
  statement: MidIRStatement,
  constantPropagationInformation: ReadonlyMap<string, bigint>
): MidIRStatement | null => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return {
        ...statement,
        source: optimizeExpression(statement.source, constantPropagationInformation),
      };
    case 'MidIRMoveMemStatement':
      return {
        ...statement,
        memoryIndexExpression: optimizeExpression(
          statement.memoryIndexExpression,
          constantPropagationInformation
        ),
        source: optimizeExpression(statement.source, constantPropagationInformation),
      };
    case 'MidIRCallFunctionStatement':
      return {
        ...statement,
        functionExpression: optimizeExpression(
          statement.functionExpression,
          constantPropagationInformation
        ),
        functionArguments: statement.functionArguments.map((it) =>
          optimizeExpression(it, constantPropagationInformation)
        ),
      };
    case 'MidIRLabelStatement':
    case 'MidIRJumpStatement':
      return statement;
    case 'MidIRConditionalJumpFallThrough': {
      const optimizedCondition = optimizeExpression(
        statement.conditionExpression,
        constantPropagationInformation
      );
      if (optimizedCondition.__type__ === 'MidIRConstantExpression') {
        if (optimizedCondition.value === BigInt(0)) {
          // Directly fall through
          return null;
        }
        return MIR_JUMP(statement.label1);
      }
      return { ...statement, conditionExpression: optimizedCondition };
    }
    case 'MidIRReturnStatement': {
      const { returnedExpression } = statement;
      return returnedExpression == null
        ? MIR_RETURN()
        : MIR_RETURN(optimizeExpression(returnedExpression, constantPropagationInformation));
    }
  }
};

const optimizeIRWithConstantPropagation = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const constantPropagationInformationList = analyzePropagatedConstants(statements);
  return statements
    .map((statement, i) => optimizeStatement(statement, constantPropagationInformationList[i]))
    .filter(isNotNull);
};

export default optimizeIRWithConstantPropagation;
