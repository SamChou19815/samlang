import {
  RIP,
  RSP,
  RDI,
  RSI,
  RAX,
  RCX,
  RDX,
  R8,
  R9,
  ASM_CONST,
  ASM_REG,
  ASM_MEM_REG,
  ASM_MEM_REG_WITH_CONST,
  ASM_NAME,
  AssemblyArgument,
} from '../../ast/asm/asm-arguments';
import {
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_REG,
  ASM_MOVE_MEM,
  ASM_LEA,
  ASM_CMP_CONST_OR_REG,
  ASM_CALL,
  ASM_BIN_OP_REG_DEST,
  ASM_JUMP,
  ASM_PUSH,
  ASM_LABEL,
  ASM_COMMENT,
  AssemblyInstruction,
  AssemblyConditionalJumpType,
} from '../../ast/asm/asm-instructions';
import {
  MidIRExpression,
  MidIRImmutableMemoryExpression,
  MidIRStatement,
  MIR_IMMUTABLE_MEM,
  midIRExpressionToString,
  midIRStatementToString,
} from '../../ast/mir';
import { bigIntIsWithin32BitIntegerRange } from '../../util/int-util';
import type AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';
import {
  getMemoizedAssemblyExpressionTilingFunction,
  getMemoizedAssemblyStatementTilingFunction,
} from './asm-tiling-memoized-function';
import {
  AssemblyArgumentTilingResult,
  AssemblyMemoryTilingResult,
  AssemblyRegisterOrMemoryTilingResult,
  AssemblyConstOrRegisterTilingResult,
  AssemblyMidIRExpressionTilingResult,
  AssemblyTilingService,
  createAssemblyConstantTilingResult,
  createAssemblyMidIRExpressionTilingResult,
  createAssemblyMemoryTilingResult,
} from './asm-tiling-results';

class AssemblyDpTiling implements AssemblyTilingService {
  constructor(
    private readonly functionName: string,
    private readonly allocator: AssemblyFunctionAbstractRegisterAllocator,
    private readonly tileMemory: (
      expression: MidIRImmutableMemoryExpression,
      service: AssemblyTilingService
    ) => AssemblyMemoryTilingResult
  ) {}

  tileStatement = getMemoizedAssemblyStatementTilingFunction(
    (statement: MidIRStatement): readonly AssemblyInstruction[] => {
      switch (statement.__type__) {
        case 'MidIRMoveTempStatement': {
          const resultRegister = ASM_REG(statement.temporaryID);
          const sourceTilingResult = this.tileAssemblyArgument(statement.source);
          return [
            ...sourceTilingResult.instructions,
            ASM_MOVE_REG(resultRegister, sourceTilingResult.assemblyArgument),
          ];
        }

        case 'MidIRMoveMemStatement': {
          const {
            instructions: memoryLocationInstructions,
            assemblyArgument: memoryLocation,
          } = this.tileMemory(MIR_IMMUTABLE_MEM(statement.memoryIndexExpression), this);
          const sourceTilingResult = this.tileConstantOrRegister(statement.source);
          return [
            ...memoryLocationInstructions,
            ...sourceTilingResult.instructions,
            ASM_MOVE_MEM(memoryLocation, sourceTilingResult.assemblyArgument),
          ];
        }

        case 'MidIRCallFunctionStatement': {
          const { functionExpression, functionArguments, returnCollectorTemporaryID } = statement;
          const instructions: AssemblyInstruction[] = [
            ASM_COMMENT(midIRStatementToString(statement)),
          ];
          // preparation: we till the function.
          let assemblyFunctionExpression: AssemblyArgument;
          if (functionExpression.__type__ === 'MidIRNameExpression') {
            assemblyFunctionExpression = ASM_NAME(functionExpression.name);
          } else {
            const functionExpressionTilingResult = this.tileAssemblyArgument(functionExpression);
            instructions.push(...functionExpressionTilingResult.instructions);
            assemblyFunctionExpression = functionExpressionTilingResult.assemblyArgument;
          }
          // preparation: we till all the arguments.
          const tiledFunctionArguments = functionArguments.map((functionArgument) => {
            const tilingResult = this.tileAssemblyArgument(functionArgument);
            instructions.push(...tilingResult.instructions);
            return tilingResult.assemblyArgument;
          });
          // preparation: we prepare slots to put the return values.
          const resultRegister =
            returnCollectorTemporaryID == null ? null : ASM_REG(returnCollectorTemporaryID);
          // compute the extra space we need.
          let totalScratchSpace = Math.max(tiledFunctionArguments.length - 6, 0);
          instructions.push(
            ASM_COMMENT(`We are about to call ${midIRExpressionToString(functionExpression)}`)
          );
          // setup scratch space for args and return values, also prepare space for 16b alignment.
          if (totalScratchSpace > 0) {
            const offset = totalScratchSpace % 2 === 0 ? 0 : 1;
            totalScratchSpace += offset;
            instructions.push(ASM_BIN_OP_REG_DEST('sub', RSP, ASM_CONST(8 * offset)));
          }
          for (let i = tiledFunctionArguments.length - 1; i >= 0; i -= 1) {
            const tiledFunctionArgument = tiledFunctionArguments[i];
            switch (i) {
              case 0:
                instructions.push(ASM_MOVE_REG(RDI, tiledFunctionArgument));
                break;
              case 1:
                instructions.push(ASM_MOVE_REG(RSI, tiledFunctionArgument));
                break;
              case 2:
                instructions.push(ASM_MOVE_REG(RDX, tiledFunctionArgument));
                break;
              case 3:
                instructions.push(ASM_MOVE_REG(RCX, tiledFunctionArgument));
                break;
              case 4:
                instructions.push(ASM_MOVE_REG(R8, tiledFunctionArgument));
                break;
              case 5:
                instructions.push(ASM_MOVE_REG(R9, tiledFunctionArgument));
                break;
              default:
                instructions.push(ASM_PUSH(tiledFunctionArgument));
                break;
            }
          }
          instructions.push(ASM_CALL(assemblyFunctionExpression));
          // get return values back
          if (resultRegister != null) {
            instructions.push(ASM_MOVE_REG(resultRegister, RAX));
          }
          if (totalScratchSpace > 0) {
            // move the stack up again
            instructions.push(ASM_BIN_OP_REG_DEST('add', RSP, ASM_CONST(8 * totalScratchSpace)));
          }
          instructions.push(
            ASM_COMMENT(`We finished calling ${midIRExpressionToString(functionExpression)}`)
          );
          return instructions;
        }

        case 'MidIRJumpStatement':
          return [ASM_JUMP('jmp', statement.label)];
        case 'MidIRLabelStatement':
          return [ASM_LABEL(statement.name)];

        case 'MidIRConditionalJumpFallThrough': {
          const { conditionExpression, label1 } = statement;
          const comment = ASM_COMMENT(midIRStatementToString(statement));
          if (conditionExpression.__type__ === 'MidIRBinaryExpression') {
            const { operator, e1, e2 } = conditionExpression;
            let jumpType: AssemblyConditionalJumpType | null;
            switch (operator) {
              case '<':
                jumpType = 'jl';
                break;
              case '<=':
                jumpType = 'jle';
                break;
              case '>':
                jumpType = 'jg';
                break;
              case '>=':
                jumpType = 'jge';
                break;
              case '==':
                jumpType = 'je';
                break;
              case '!=':
                jumpType = 'jne';
                break;
              default:
                jumpType = null;
                break;
            }
            if (jumpType != null) {
              const e1TilingResult = this.tileExpression(e1);
              const e2TilingResult = this.tileConstantOrRegister(e2);
              return [
                comment,
                ...e1TilingResult.instructions,
                ...e2TilingResult.instructions,
                ASM_CMP_CONST_OR_REG(
                  e1TilingResult.assemblyArgument,
                  e2TilingResult.assemblyArgument
                ),
                ASM_JUMP(jumpType, label1),
              ];
            }
          }
          const conditionTilingResult = this.tileRegisterOrMemory(conditionExpression);
          return [
            comment,
            ...conditionTilingResult.instructions,
            ASM_CMP_CONST_OR_REG(conditionTilingResult.assemblyArgument, ASM_CONST(0)),
            ASM_JUMP('jnz', label1),
          ];
        }

        case 'MidIRReturnStatement': {
          const instructions: AssemblyInstruction[] = [
            ASM_COMMENT(midIRStatementToString(statement)),
          ];
          const { returnedExpression } = statement;
          if (returnedExpression != null) {
            const tilingResult = this.tileExpression(returnedExpression);
            instructions.push(
              ...tilingResult.instructions,
              ASM_MOVE_REG(RAX, tilingResult.assemblyArgument)
            );
          }
          instructions.push(
            ASM_JUMP('jmp', `LABEL_FUNCTION_CALL_EPILOGUE_FOR_${this.functionName}`)
          );
          return instructions;
        }
      }
    }
  );

  tileExpression = getMemoizedAssemblyExpressionTilingFunction(
    (expression: MidIRExpression): AssemblyMidIRExpressionTilingResult => {
      switch (expression.__type__) {
        case 'MidIRConstantExpression': {
          const register = this.allocator.nextReg();
          return createAssemblyMidIRExpressionTilingResult(
            [ASM_MOVE_CONST_TO_REG(register, expression.value)],
            register
          );
        }
        case 'MidIRNameExpression': {
          const register = this.allocator.nextReg();
          // In general, a name cannot stand on its own.
          // We need this lea trick to associate it with rip
          // For functions and mem[name], we will handle them specially in their tilers!
          return createAssemblyMidIRExpressionTilingResult(
            [ASM_LEA(register, ASM_MEM_REG_WITH_CONST(RIP, ASM_NAME(expression.name)))],
            register
          );
        }
        case 'MidIRTemporaryExpression':
          return createAssemblyMidIRExpressionTilingResult([], ASM_REG(expression.temporaryID));
        case 'MidIRImmutableMemoryExpression': {
          const memoryTilingResult = this.tileMemory(expression, this);
          const resultRegister = this.allocator.nextReg();
          return createAssemblyMidIRExpressionTilingResult(
            [
              ASM_COMMENT(midIRExpressionToString(expression)),
              ...memoryTilingResult.instructions,
              ASM_MOVE_REG(resultRegister, memoryTilingResult.assemblyArgument),
            ],
            resultRegister
          );
        }
        case 'MidIRBinaryExpression':
          throw new Error('TODO');
      }
    }
  );

  private tileConstantOrRegister(expression: MidIRExpression): AssemblyConstOrRegisterTilingResult {
    if (expression.__type__ === 'MidIRConstantExpression') {
      const value = expression.value;
      if (bigIntIsWithin32BitIntegerRange(value)) {
        return createAssemblyConstantTilingResult(ASM_CONST(Number(value)));
      }
    }
    return this.tileExpression(expression);
  }

  private tileRegisterOrMemory(expression: MidIRExpression): AssemblyRegisterOrMemoryTilingResult {
    if (expression.__type__ === 'MidIRImmutableMemoryExpression') {
      return this.tileMemory(expression, this);
    }
    return this.tileExpression(expression);
  }

  private tileAssemblyArgument(expression: MidIRExpression): AssemblyArgumentTilingResult {
    if (expression.__type__ === 'MidIRConstantExpression') {
      const value = expression.value;
      if (bigIntIsWithin32BitIntegerRange(value)) {
        return createAssemblyConstantTilingResult(ASM_CONST(Number(value)));
      }
    }
    if (expression.__type__ === 'MidIRImmutableMemoryExpression') {
      return this.tileMemory(expression, this);
    }
    return this.tileExpression(expression);
  }
}

const getAssemblyTilingForMidIRStatements = (
  functionName: string,
  statements: readonly MidIRStatement[],
  allocator: AssemblyFunctionAbstractRegisterAllocator
): readonly AssemblyInstruction[] => {
  const instructions: AssemblyInstruction[] = [];
  const tiler = new AssemblyDpTiling(functionName, allocator, (memoryExpression, service) => {
    // TODO: replace this with a better implementation once mem tiling helper is ready.
    const tilingResult = service.tileExpression(memoryExpression.indexExpression);
    return createAssemblyMemoryTilingResult(
      tilingResult.instructions,
      ASM_MEM_REG(tilingResult.assemblyArgument)
    );
  });
  statements.forEach((statement) => instructions.push(...tiler.tileStatement(statement)));
  instructions.push(ASM_LABEL(`LABEL_FUNCTION_CALL_EPILOGUE_FOR_${functionName}`));
  return instructions;
};

export default getAssemblyTilingForMidIRStatements;
