import { HighIRExpression, HIR_BINARY, HIR_INDEX_ACCESS } from 'samlang-core-ast/hir-expressions';
import {
  MidIRStatement,
  MIR_MOVE_TEMP,
  MIR_MOVE_IMMUTABLE_MEM,
  MIR_CALL_FUNCTION,
  MIR_RETURN,
  MIR_CJUMP_FALLTHROUGH,
} from 'samlang-core-ast/mir-nodes';
import { Long } from 'samlang-core-utils';

const algebraicallyOptimizeExpression = (expression: HighIRExpression): HighIRExpression => {
  switch (expression.__type__) {
    case 'HighIRIntLiteralExpression':
    case 'HighIRNameExpression':
    case 'HighIRVariableExpression':
      return expression;
    case 'HighIRIndexAccessExpression':
      return HIR_INDEX_ACCESS({
        type: expression.type,
        expression: algebraicallyOptimizeExpression(expression.expression),
        index: expression.index,
      });
    case 'HighIRBinaryExpression': {
      const e1 = algebraicallyOptimizeExpression(expression.e1);
      const e2 = algebraicallyOptimizeExpression(expression.e2);
      if (e1.__type__ === 'HighIRIntLiteralExpression') {
        const v1 = e1.value;
        if (v1.equals(Long.ZERO)) {
          switch (expression.operator) {
            case '+':
            case '^':
              return e2;
          }
        } else if (v1.equals(Long.ONE) && expression.operator === '*') {
          return e2;
        }
      }
      if (e2.__type__ === 'HighIRIntLiteralExpression') {
        const v2 = e2.value;
        if (v2.equals(Long.ZERO)) {
          switch (expression.operator) {
            case '+':
            case '^':
              return e1;
          }
        } else if (v2.equals(Long.ONE) && expression.operator === '*') {
          return e1;
        }
      }
      return HIR_BINARY({ operator: expression.operator, e1, e2 });
    }
  }
};

const algebraicallyOptimizeStatement = (statement: MidIRStatement): MidIRStatement => {
  switch (statement.__type__) {
    case 'MidIRMoveTempStatement':
      return MIR_MOVE_TEMP(
        statement.temporaryID,
        algebraicallyOptimizeExpression(statement.source)
      );
    case 'MidIRMoveMemStatement':
      return MIR_MOVE_IMMUTABLE_MEM(
        algebraicallyOptimizeExpression(statement.memoryIndexExpression),
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
      return MIR_RETURN(algebraicallyOptimizeExpression(statement.returnedExpression));
  }
};

const optimizeIRWithAlgebraicSimplification = (
  statements: readonly MidIRStatement[]
): readonly MidIRStatement[] => statements.map(algebraicallyOptimizeStatement);

export default optimizeIRWithAlgebraicSimplification;
