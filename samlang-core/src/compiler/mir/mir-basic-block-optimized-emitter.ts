import { MidIRStatement, MIR_CJUMP_FALLTHROUGH, MIR_JUMP } from '../../ast/mir-nodes';
import type { ReadonlyMidIRBasicBlockWithoutPointers } from './mir-basic-block';
import invertMidIRConditionExpression from './mir-condition-inverter';

const emitCanonicalMidIRStatementsFromReorderedBasicBlocks = (
  reorderedBlocks: readonly ReadonlyMidIRBasicBlockWithoutPointers[]
): readonly MidIRStatement[] => {
  const canonicalStatements: MidIRStatement[] = [];

  reorderedBlocks.forEach((currentBlock, index) => {
    const lastStatement = currentBlock.lastStatement;
    switch (lastStatement.__type__) {
      case 'MidIRJumpStatement':
      case 'MidIRReturnStatement':
        // They must be canonical, since the only source of non-canonical statement comes
        // from the last statement. Here we know the last statement is canonical.
        canonicalStatements.push(...(currentBlock.allStatements as MidIRStatement[]));
        break;

      case 'MidIRConditionalJumpNoFallThrough': {
        // Safe to do for the same reason specified above.
        canonicalStatements.push(
          ...(currentBlock.allStatements.slice(
            0,
            currentBlock.allStatements.length - 1
          ) as MidIRStatement[])
        );
        const { conditionExpression, label1: trueLabel, label2: falseLabel } = lastStatement;
        const immediateTraceNext = reorderedBlocks[index + 1]?.label;
        if (immediateTraceNext === trueLabel) {
          canonicalStatements.push(
            MIR_CJUMP_FALLTHROUGH(invertMidIRConditionExpression(conditionExpression), falseLabel)
          );
        } else if (immediateTraceNext === falseLabel) {
          canonicalStatements.push(MIR_CJUMP_FALLTHROUGH(conditionExpression, trueLabel));
        } else {
          canonicalStatements.push(MIR_CJUMP_FALLTHROUGH(conditionExpression, trueLabel));
          canonicalStatements.push(MIR_JUMP(falseLabel));
        }
        break;
      }
    }
  });

  return canonicalStatements;
};

export default emitCanonicalMidIRStatementsFromReorderedBasicBlocks;
