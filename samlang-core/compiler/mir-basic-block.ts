/* eslint-disable camelcase */

import type MidIRResourceAllocator from './mir-resource-allocator';

import {
  MidIRStatement_DANGEROUSLY_NON_CANONICAL,
  MidIRJumpStatement,
  MidIRConditionalJumpNoFallThrough,
  MidIRReturnStatement,
  MIR_LABEL,
  MIR_JUMP,
} from 'samlang-core-ast/mir-nodes';

export interface ReadonlyMidIRBasicBlockWithoutPointers {
  readonly label: string;

  readonly allStatements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[];

  readonly lastStatement:
    | MidIRJumpStatement
    | MidIRConditionalJumpNoFallThrough
    | MidIRReturnStatement;
}

export interface ReadonlyMidIRBasicBlock extends ReadonlyMidIRBasicBlockWithoutPointers {
  readonly targets: readonly ReadonlyMidIRBasicBlock[];
}

export class MidIRBasicBlock implements ReadonlyMidIRBasicBlock {
  readonly lastStatement:
    | MidIRJumpStatement
    | MidIRConditionalJumpNoFallThrough
    | MidIRReturnStatement;

  readonly targets: MidIRBasicBlock[] = [];

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
}

type TempBasicBlock = {
  readonly label: string;
  readonly statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[];
};

const createTempBasicBlock = (
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): TempBasicBlock => {
  // istanbul ignore next
  if (statements.length === 0) throw new Error();

  const firstStatement = statements[0];
  if (firstStatement.__type__ === 'MidIRLabelStatement') {
    return { label: firstStatement.name, statements };
  }
  const syntheticLabel = allocator.allocateLabelWithAnnotation(
    functionName,
    'BASIC_BLOCK_1ST_STMT'
  );
  return { label: syntheticLabel, statements: [MIR_LABEL(syntheticLabel), ...statements] };
};

export const createMidIRBasicBlocks = (
  allocator: MidIRResourceAllocator,
  functionName: string,
  statements: readonly MidIRStatement_DANGEROUSLY_NON_CANONICAL[]
): readonly ReadonlyMidIRBasicBlock[] => {
  const tempBasicBlocks: TempBasicBlock[] = [];
  let tempBlockList: MidIRStatement_DANGEROUSLY_NON_CANONICAL[] = [];

  statements.forEach((statement) => {
    switch (statement.__type__) {
      case 'MidIRJumpStatement':
      case 'MidIRConditionalJumpNoFallThrough':
      case 'MidIRReturnStatement': {
        tempBlockList.push(statement);
        tempBasicBlocks.push(createTempBasicBlock(allocator, functionName, tempBlockList));
        tempBlockList = [];
        break;
      }
      case 'MidIRLabelStatement': {
        if (tempBlockList.length > 0) {
          tempBasicBlocks.push(createTempBasicBlock(allocator, functionName, tempBlockList));
        }
        tempBlockList = [statement];
        break;
      }
      default:
        tempBlockList.push(statement);
    }
  });

  // If the block list is not empty,
  // then it means that the last statement is not JUMP/CJUMP/RETURN.
  // It's not going to happen, because the caller should synthetic a final return for us.
  if (tempBlockList.length > 0) throw new Error();

  // Add synthetic jump
  const basicBlocks = tempBasicBlocks.map((tempBlock, index) => {
    switch (tempBlock.statements[tempBlock.statements.length - 1].__type__) {
      case 'MidIRJumpStatement':
      case 'MidIRConditionalJumpNoFallThrough':
      case 'MidIRReturnStatement':
        break;
      default:
        tempBlock.statements.push(MIR_JUMP(tempBasicBlocks[index + 1].label));
    }
    return new MidIRBasicBlock(tempBlock.label, tempBlock.statements);
  });

  const labelBlockMap = Object.fromEntries(basicBlocks.map((it) => [it.label, it]));
  basicBlocks.forEach((block) => {
    const lastStatement = block.lastStatement;
    switch (lastStatement.__type__) {
      case 'MidIRJumpStatement':
        block.targets.push(labelBlockMap[lastStatement.label]);
        break;
      case 'MidIRConditionalJumpNoFallThrough':
        block.targets.push(
          labelBlockMap[lastStatement.label2],
          labelBlockMap[lastStatement.label1]
        );
        break;
      case 'MidIRReturnStatement':
        break;
    }
  });

  return basicBlocks;
};

export default createMidIRBasicBlocks;
