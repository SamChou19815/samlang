import type AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';
import getAssemblyMemoryTilingForMidIRExpression from './asm-memory-tiling';
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
} from 'samlang-core-ast/asm-arguments';
import {
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_REG,
  ASM_MOVE_MEM,
  ASM_LEA,
  ASM_CMP_CONST_OR_REG,
  ASM_CALL,
  ASM_BIN_OP_REG_DEST,
  ASM_IMUL,
  ASM_IDIV,
  ASM_SHL,
  ASM_CQO,
  ASM_JUMP,
  ASM_SET,
  ASM_PUSH,
  ASM_LABEL,
  ASM_COMMENT,
  AssemblyInstruction,
  AssemblyConditionalJumpType,
} from 'samlang-core-ast/asm-instructions';
import {
  MIR_IMMUTABLE_MEM,
  MidIRExpression,
  MidIRImmutableMemoryExpression,
  MidIRBinaryExpression,
  MidIRStatement,
  midIRExpressionToString,
  midIRStatementToString,
} from 'samlang-core-ast/mir-nodes';
import {
  bigIntIsWithin32BitIntegerRange,
  isPowerOfTwo,
  logTwo,
  assertNotNull,
  checkNotNull,
} from 'samlang-core-utils';

type MidIRBinaryExpressionTiler = (
  expression: MidIRBinaryExpression,
  service: AssemblyTilingService,
  memoryTilerForExpression: (
    expressionToTile: MidIRBinaryExpression,
    serviceForTiling: AssemblyTilingService
  ) => AssemblyMemoryTilingResult | null
) => AssemblyMidIRExpressionTilingResult | null;

const genericArithmeticBinaryExpressionTiler: MidIRBinaryExpressionTiler = (
  expression,
  service
) => {
  switch (expression.operator) {
    case '+':
    case '-':
    case '^':
    case '*':
    case '/':
    case '%':
      break;
    default:
      return null;
  }
  const resultRegister = service.allocator.nextReg();
  const e1Result = service.tileAssemblyArgument(expression.e1);
  const e2Result = service.tileRegisterOrMemory(expression.e2);
  const instructions: AssemblyInstruction[] = [
    ASM_COMMENT(`genericMidIRBinaryExpressionTiler: ${midIRExpressionToString(expression)}`),
    ...e1Result.instructions,
    ...e2Result.instructions,
  ];
  switch (expression.operator) {
    case '+': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e1Result.assemblyArgument),
        ASM_BIN_OP_REG_DEST('add', resultRegister, e2Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '-': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e1Result.assemblyArgument),
        ASM_BIN_OP_REG_DEST('sub', resultRegister, e2Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '^': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e1Result.assemblyArgument),
        ASM_BIN_OP_REG_DEST('xor', resultRegister, e2Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '*': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e1Result.assemblyArgument),
        ASM_IMUL(resultRegister, e2Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '/': {
      instructions.push(
        ASM_MOVE_REG(RAX, e1Result.assemblyArgument),
        ASM_CQO,
        ASM_IDIV(e2Result.assemblyArgument),
        ASM_MOVE_REG(resultRegister, RAX)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '%': {
      instructions.push(
        ASM_MOVE_REG(RAX, e1Result.assemblyArgument),
        ASM_CQO,
        ASM_IDIV(e2Result.assemblyArgument),
        ASM_MOVE_REG(resultRegister, RDX)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
  }
};

const genericCommutativeArithmeticBinaryExpressionReversedTiler: MidIRBinaryExpressionTiler = (
  expression,
  service
) => {
  switch (expression.operator) {
    case '+':
    case '*':
    case '^':
      break;
    default:
      return null;
  }
  const resultRegister = service.allocator.nextReg();
  const e2Result = service.tileExpression(expression.e2);
  const e1Result = service.tileRegisterOrMemory(expression.e1);
  const instructions: AssemblyInstruction[] = [
    ASM_COMMENT(
      `genericMidIRCommutativeArithmeticBinaryExpressionReversedTiler: ${midIRExpressionToString(
        expression
      )}`
    ),
    ...e2Result.instructions,
    ...e1Result.instructions,
  ];
  switch (expression.operator) {
    case '+': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e2Result.assemblyArgument),
        ASM_BIN_OP_REG_DEST('add', resultRegister, e1Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '^': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e2Result.assemblyArgument),
        ASM_BIN_OP_REG_DEST('xor', resultRegister, e1Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
    case '*': {
      instructions.push(
        ASM_MOVE_REG(resultRegister, e2Result.assemblyArgument),
        ASM_IMUL(resultRegister, e1Result.assemblyArgument)
      );
      return createAssemblyMidIRExpressionTilingResult(instructions, resultRegister);
    }
  }
};

const genericComparisonBinaryExpressionTiler: MidIRBinaryExpressionTiler = (
  expression,
  service
) => {
  let jumpType: AssemblyConditionalJumpType;
  switch (expression.operator) {
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
      return null;
  }
  const resultRegister = service.allocator.nextReg();
  const e1Result = service.tileExpression(expression.e1);
  const e2Result = service.tileExpression(expression.e2);
  return createAssemblyMidIRExpressionTilingResult(
    [
      ASM_COMMENT(
        `genericMidIRComparisonBinaryExpressionTiler: ${midIRExpressionToString(expression)}`
      ),
      ...e1Result.instructions,
      ...e2Result.instructions,
      ASM_CMP_CONST_OR_REG(e1Result.assemblyArgument, e2Result.assemblyArgument),
      ASM_SET(jumpType, RAX),
      ASM_MOVE_REG(resultRegister, RAX),
    ],
    resultRegister
  );
};

const leaBinaryExpressionTiler: MidIRBinaryExpressionTiler = (expression, service, memoryTiler) => {
  const resultRegister = service.allocator.nextReg();
  // try to use LEA if we can
  const memoryTilingResult = memoryTiler(expression, service);
  if (memoryTilingResult == null) return null;
  return createAssemblyMidIRExpressionTilingResult(
    [
      ASM_COMMENT(`leaMidIRComparisonBinaryExpressionTiler ${midIRExpressionToString(expression)}`),
      ...memoryTilingResult.instructions,
      ASM_LEA(resultRegister, memoryTilingResult.assemblyArgument),
    ],
    resultRegister
  );
};

const imul3ArgumentBinaryExpressionTiler: MidIRBinaryExpressionTiler = (expression, service) => {
  const { operator, e1, e2 } = expression;
  if (
    operator !== '*' ||
    e2.__type__ !== 'MidIRConstantExpression' ||
    !bigIntIsWithin32BitIntegerRange(e2.value)
  ) {
    return null;
  }
  const tilingResult = service.tileRegisterOrMemory(e1);
  const resultRegister = service.allocator.nextReg();
  return createAssemblyMidIRExpressionTilingResult(
    [
      ASM_COMMENT(`imul3ArgumentBinaryExpressionTiler: ${midIRExpressionToString(expression)}`),
      ...tilingResult.instructions,
      ASM_IMUL(resultRegister, tilingResult.assemblyArgument, ASM_CONST(Number(e2.value))),
    ],
    resultRegister
  );
};

const multiplyPowerOfTwoBinaryExpressionTiler: MidIRBinaryExpressionTiler = (
  expression,
  service
) => {
  const { operator, e1, e2 } = expression;
  if (operator !== '*' || e2.__type__ !== 'MidIRConstantExpression' || !isPowerOfTwo(e2.value)) {
    return null;
  }
  const resultRegister = service.allocator.nextReg();
  const e1Result = service.tileAssemblyArgument(e1);
  return createAssemblyMidIRExpressionTilingResult(
    [
      ASM_COMMENT(`multiplyPowerOfTwoBinaryExpressionTiler ${midIRExpressionToString(expression)}`),
      ASM_MOVE_REG(resultRegister, e1Result.assemblyArgument),
      ASM_SHL(resultRegister, logTwo(e2.value)),
    ],
    resultRegister
  );
};

const midIRBinaryExpressionTilers: readonly MidIRBinaryExpressionTiler[] = [
  genericArithmeticBinaryExpressionTiler,
  genericCommutativeArithmeticBinaryExpressionReversedTiler,
  genericComparisonBinaryExpressionTiler,
  leaBinaryExpressionTiler,
  imul3ArgumentBinaryExpressionTiler,
  multiplyPowerOfTwoBinaryExpressionTiler,
];

class AssemblyDpTiling implements AssemblyTilingService {
  constructor(
    private readonly functionName: string,
    readonly allocator: AssemblyFunctionAbstractRegisterAllocator,
    private readonly tileMemoryForExpression: (
      expression: MidIRExpression,
      service: AssemblyTilingService
    ) => AssemblyMemoryTilingResult | null
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
          } = this.tileMemory(MIR_IMMUTABLE_MEM(statement.memoryIndexExpression));
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
            if (offset > 0) {
              instructions.push(ASM_BIN_OP_REG_DEST('sub', RSP, ASM_CONST(8 * offset)));
            }
          }
          for (let i = tiledFunctionArguments.length - 1; i >= 0; i -= 1) {
            const tiledFunctionArgument = checkNotNull(tiledFunctionArguments[i]);
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
          const tilingResult = this.tileAssemblyArgument(returnedExpression);
          instructions.push(
            ...tilingResult.instructions,
            ASM_MOVE_REG(RAX, tilingResult.assemblyArgument)
          );
          instructions.push(ASM_JUMP('jmp', `l_FUNCTION_CALL_EPILOGUE_FOR_${this.functionName}`));
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
          return createAssemblyMidIRExpressionTilingResult([], ASM_REG(expression.name));
        case 'MidIRImmutableMemoryExpression': {
          const memoryTilingResult = this.tileMemory(expression);
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
        case 'MidIRBinaryExpression': {
          let bestCost = Number.MAX_SAFE_INTEGER;
          let bestTilingResult: AssemblyMidIRExpressionTilingResult | null = null;
          const results = midIRBinaryExpressionTilers.map((tiler) =>
            tiler(expression, this, this.tileMemoryForExpression)
          );
          for (let i = 0; i < results.length; i += 1) {
            const tilingResult = results[i];
            if (tilingResult != null) {
              const cost = tilingResult.cost;
              if (cost < bestCost) {
                bestCost = cost;
                bestTilingResult = tilingResult;
              }
            }
          }
          assertNotNull(bestTilingResult);
          return bestTilingResult;
        }
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

  tileRegisterOrMemory(expression: MidIRExpression): AssemblyRegisterOrMemoryTilingResult {
    if (expression.__type__ === 'MidIRImmutableMemoryExpression') {
      return this.tileMemory(expression);
    }
    return this.tileExpression(expression);
  }

  tileAssemblyArgument(expression: MidIRExpression): AssemblyArgumentTilingResult {
    if (expression.__type__ === 'MidIRConstantExpression') {
      const value = expression.value;
      if (bigIntIsWithin32BitIntegerRange(value)) {
        return createAssemblyConstantTilingResult(ASM_CONST(Number(value)));
      }
    }
    if (expression.__type__ === 'MidIRImmutableMemoryExpression') {
      return this.tileMemory(expression);
    }
    return this.tileExpression(expression);
  }

  private tileMemory = (expression: MidIRImmutableMemoryExpression): AssemblyMemoryTilingResult => {
    const innerExpression = expression.indexExpression;
    if (innerExpression.__type__ === 'MidIRNameExpression') {
      return createAssemblyMemoryTilingResult(
        [],
        ASM_MEM_REG_WITH_CONST(RIP, ASM_NAME(innerExpression.name))
      );
    }
    const memoryTilingResult = this.tileMemoryForExpression(innerExpression, this);
    if (memoryTilingResult != null) return memoryTilingResult;
    const tilingResult = this.tileExpression(innerExpression);
    return createAssemblyMemoryTilingResult(
      tilingResult.instructions,
      ASM_MEM_REG(tilingResult.assemblyArgument)
    );
  };
}

const getAssemblyTilingForMidIRStatements = (
  functionName: string,
  statements: readonly MidIRStatement[],
  allocator: AssemblyFunctionAbstractRegisterAllocator
): readonly AssemblyInstruction[] => {
  const instructions: AssemblyInstruction[] = [];
  const tiler = new AssemblyDpTiling(
    functionName,
    allocator,
    getAssemblyMemoryTilingForMidIRExpression
  );
  statements.forEach((statement) => instructions.push(...tiler.tileStatement(statement)));
  instructions.push(ASM_LABEL(`l_FUNCTION_CALL_EPILOGUE_FOR_${functionName}`));
  return instructions;
};

export default getAssemblyTilingForMidIRStatements;
