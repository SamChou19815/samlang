import { constantFoldExpression } from './constant-folding-optimization';

import analyzePropagatedConstants from 'samlang-core-analysis/constant-propagation-analysis';
import {
  HighIRExpression,
  HIR_BINARY,
  HIR_INDEX_ACCESS,
  HIR_INT,
} from 'samlang-core-ast/hir-expressions';
import { MidIRStatement, MIR_JUMP, MIR_RETURN } from 'samlang-core-ast/mir-nodes';
import { Long, checkNotNull, isNotNull } from 'samlang-core-utils';

const optimizeExpressionWithConstantPropagationInformation = (
  expression: HighIRExpression,
  constantPropagationInformation: ReadonlyMap<string, Long>
): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
      return expression;
    case 'HighIRVariableExpression': {
      const value = constantPropagationInformation.get(expression.name);
      if (value == null) {
        return expression;
      }
      return HIR_INT(value);
    }
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: optimizeExpressionWithConstantPropagationInformation(
          expression.expression,
          constantPropagationInformation
        ),
        index: expression.index,
      });
    case 'HighIRBinaryExpression':
      return HIR_BINARY({
        operator: expression.operator,
        e1: optimizeExpressionWithConstantPropagationInformation(
          expression.e1,
          constantPropagationInformation
        ),
        e2: optimizeExpressionWithConstantPropagationInformation(
          expression.e2,
          constantPropagationInformation
        ),
      });
  }
};

const optimizeExpression = (
  expression: HighIRExpression,
  constantPropagationInformation: ReadonlyMap<string, Long>
): HighIRExpression =>
  constantFoldExpression(
    optimizeExpressionWithConstantPropagationInformation(expression, constantPropagationInformation)
  );

const optimizeStatement = (
  statement: MidIRStatement,
  constantPropagationInformation: ReadonlyMap<string, Long>
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
      if (optimizedCondition.__type__ === 'HighIRIntLiteralExpression') {
        if (optimizedCondition.value.equals(Long.ZERO)) {
          // Directly fall through
          return null;
        }
        return MIR_JUMP(statement.label1);
      }
      return { ...statement, conditionExpression: optimizedCondition };
    }
    case 'MidIRReturnStatement':
      return MIR_RETURN(
        optimizeExpression(statement.returnedExpression, constantPropagationInformation)
      );
  }
};

const optimizeIRWithConstantPropagation = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => {
  const constantPropagationInformationList = analyzePropagatedConstants(statements);
  return statements
    .map((statement, i) =>
      optimizeStatement(statement, checkNotNull(constantPropagationInformationList[i]))
    )
    .filter(isNotNull);
};

export default optimizeIRWithConstantPropagation;
