import {
  MidIRStatement,
  MidIRExpression,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
} from 'samlang-core-ast/mir-nodes';

const algebraicallyOptimizeExpression = (expression: MidIRExpression): MidIRExpression => {
  switch (expression.__type__) {
    case 'MidIRConstantExpression':
    case 'MidIRNameExpression':
    case 'MidIRTemporaryExpression':
      return expression;
    case 'MidIRImmutableMemoryExpression':
      return MIR_IMMUTABLE_MEM(algebraicallyOptimizeExpression(expression.indexExpression));
    case 'MidIRBinaryExpression': {
      const e1 = algebraicallyOptimizeExpression(expression.e1);
      const e2 = algebraicallyOptimizeExpression(expression.e2);
      if (e1.__type__ === 'MidIRConstantExpression') {
        const v1 = e1.value;
        if (v1 === BigInt(0)) {
          switch (expression.operator) {
            case '+':
            case '^':
              return e2;
          }
        } else if (v1 === BigInt(1) && expression.operator === '*') {
          return e2;
        }
      }
      if (e2.__type__ === 'MidIRConstantExpression') {
        const v2 = e2.value;
        if (v2 === BigInt(0)) {
          switch (expression.operator) {
            case '+':
            case '^':
              return e1;
          }
        } else if (v2 === BigInt(1) && expression.operator === '*') {
          return e1;
        }
      }
      return MIR_OP(expression.operator, e1, e2);
    }
  }
};

const algebraicallyOptimizeStatement = (statement: MidIRStatement): MidIRStatement => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return MIR_MOVE_TEMP(
        MIR_TEMP(statement.temporaryID),
        algebraicallyOptimizeExpression(statement.source)
      );
    case 'MidIRMoveMemStatement':
      return MIR_MOVE_IMMUTABLE_MEM(
        MIR_IMMUTABLE_MEM(algebraicallyOptimizeExpression(statement.memoryIndexExpression)),
        algebraicallyOptimizeExpression(statement.source)
      );
    case 'MidIRCallFunctionStatement':
      return MIR_CALL_FUNCTION(
        algebraicallyOptimizeExpression(statement.functionExpression),
        statement.functionArguments.map(algebraicallyOptimizeExpression),
        statement.returnCollectorTemporaryID
      );
    case 'MidIRJumpStatement':
    case 'MidIRLabelStatement':
      return statement;
    case 'MidIRConditionalJumpFallThrough':
      return MIR_CJUMP_FALLTHROUGH(
        algebraicallyOptimizeExpression(statement.conditionExpression),
        statement.label1
      );
    case 'MidIRReturnStatement':
      return MIR_RETURN(
        statement.returnedExpression == null
          ? undefined
          : algebraicallyOptimizeExpression(statement.returnedExpression)
      );
  }
};

const optimizeIRWithAlgebraicSimplification = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => statements.map(algebraicallyOptimizeStatement);

export default optimizeIRWithAlgebraicSimplification;
