/* eslint-disable camelcase */

import {
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MidIRJumpStatement,
  MidIRConditionalJumpNoFallThrough,
  MidIRReturnStatement,
  MIR_LABEL,
} from '../../ast/mir';
import MidIRResourceAllocator from './mir-resource-allocator';

export default class MidIRBasicBlock {
  readonly lastStatement:
    | MidIRJumpStatement
    | MidIRConditionalJumpNoFallThrough
    | MidIRReturnStatement;

  constructor(
    readonly label: string,
    readonly allStatements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
  ) {
    const lastStatement = allStatements[allStatements.length - 1];
    switch (lastStatement.__type__) {
      case 'MidIRJumpStatement':
      case 'MidIRConditionalJumpNoFallThrough':
      case 'MidIRReturnStatement':
        this.lastStatement = lastStatement;
        break;
      default:
        throw new Error();
    }
  }

  public static fromStatements = (
    allocator: MidIRResourceAllocator,
    functionName: string,
    statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
  ): readonly MidIRBasicBlock[] => createBasicBlocks(allocator, functionName, statements);
}

const createBasicBlock = (
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): MidIRBasicBlock => {
  // istanbul ignore next
  if (statements.length === 0) throw new Error();

  const firstStatement = statements[0];
  if (firstStatement.__type__ === 'MidIRLabelStatement') {
    return new MidIRBasicBlock(firstStatement.name, statements);
  }
  const syntheticLabel = allocator.allocateLabelWithAnnotation(
    functionName,
    'BASIC_BLOCK_1ST_STMT'
  );
  return new MidIRBasicBlock(syntheticLabel, [MIR_LABEL(syntheticLabel), ...statements]);
};

const createBasicBlocks = (
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): readonly MidIRBasicBlock[] => {
  const basicBlocks: MidIRBasicBlock[] = [];
  let tempBlockList: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];

  statements.forEach((statement) => {
    switch (statement.__type__) {
      case 'MidIRJumpStatement':
      case 'MidIRConditionalJumpNoFallThrough':
      case 'MidIRReturnStatement': {
        tempBlockList.push(statement);
        basicBlocks.push(createBasicBlock(allocator, functionName, tempBlockList));
        tempBlockList = [];
        break;
      }
      case 'MidIRLabelStatement': {
        // If the block list is not empty,
        // then it means that the last statement is not JUMP/CJUMP/RETURN,
        // in this case, BasicBlock construction will fail anyways.
        // istanbul ignore next
        if (tempBlockList.length > 0) throw new Error();
        tempBlockList = [statement];
        break;
      }
      default:
        tempBlockList.push(statement);
    }
  });

  // If the block list is not empty,
  // then it means that the last statement is not JUMP/CJUMP/RETURN,
  // in this case, BasicBlock construction will fail anyways.
  if (tempBlockList.length > 0) throw new Error();

  return basicBlocks;
};
