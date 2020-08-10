import { RSP, RBP, ASM_CONST, RDI, RSI, RDX, RCX, R8, R9 } from '../../ast/asm/asm-arguments';
import {
  AssemblyInstruction,
  ASM_MOVE_REG,
  ASM_BIN_OP_REG_DEST,
  ASM_RET,
  ASM_PUSH,
  ASM_POP_RBP,
  ASM_COMMENT,
  ASM_LABEL,
} from '../../ast/asm/asm-instructions';
import type { AssemblyProgram } from '../../ast/asm/asm-program';
import {
  MidIRCompilationUnit,
  MidIRFunction,
  MidIRStatement,
  MidIRExpression,
  MIR_MOVE_TEMP,
  MIR_CONST,
  MIR_TEMP,
  MIR_IMMUTABLE_MEM,
  MIR_OP,
} from '../../ast/mir';
import { optimizeAssemblyWithSimpleOptimization } from '../../optimization/simple-optimizations';
import getAssemblyTilingForMidIRStatements from './asm-dp-tiling';
import AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';
import AssemblyRegisterAllocator from './asm-register-allocator';

/** Generate prologue and epilogue of functions according System-V calling conventions. */
const fixCallingConvention = (
  functionName: string,
  numberOfTemporariesOnStack: number,
  mainFunctionBody: readonly AssemblyInstruction[],
  removeComments: boolean
): readonly AssemblyInstruction[] => {
  const fixedInstructions: AssemblyInstruction[] = [];
  const isLeafFunction = !mainFunctionBody.some((it) => it.__type__ === 'AssemblyCall');
  if (!removeComments) {
    fixedInstructions.push(ASM_COMMENT(`${functionName} prologue starts`));
  }
  let stackPushDownCount = numberOfTemporariesOnStack;
  if (!isLeafFunction && stackPushDownCount % 2 === 1) {
    // not a leaf function, align alignment matters!
    stackPushDownCount += 1;
  }
  // not leaf function -> will override rbp, has still -> need rbp
  const needToUseRBP = !isLeafFunction || numberOfTemporariesOnStack > 0;
  if (needToUseRBP) {
    fixedInstructions.push(ASM_PUSH(RBP), ASM_MOVE_REG(RBP, RSP));
  }
  if (stackPushDownCount > 0) {
    // no need to move rsp pointer if no stack variables are used
    fixedInstructions.push(ASM_BIN_OP_REG_DEST('sub', RSP, ASM_CONST(8 * stackPushDownCount)));
  }
  if (!removeComments) {
    fixedInstructions.push(ASM_COMMENT(`${functionName} prologue ends`));
  }
  // body
  fixedInstructions.push(...mainFunctionBody);
  if (!removeComments) {
    fixedInstructions.push(ASM_COMMENT(`${functionName} epilogue starts`));
  }
  if (needToUseRBP) {
    fixedInstructions.push(ASM_MOVE_REG(RSP, RBP), ASM_POP_RBP);
  }
  fixedInstructions.push(ASM_RET);
  if (!removeComments) {
    fixedInstructions.push(ASM_COMMENT(`${functionName} epilogue ends`));
  }
  return fixedInstructions;
};

const getArgPlaceInsideFunction = (argId: number): MidIRExpression => {
  switch (argId) {
    case 0:
      return MIR_TEMP(RDI.id);
    case 1:
      return MIR_TEMP(RSI.id);
    case 2:
      return MIR_TEMP(RDX.id);
    case 3:
      return MIR_TEMP(RCX.id);
    case 4:
      return MIR_TEMP(R8.id);
    case 5:
      return MIR_TEMP(R9.id);
    default: {
      // -4 because -6 for reg arg place and +2 for the RIP and saved RBP.
      const offsetUnit = argId - 4;
      return MIR_IMMUTABLE_MEM(MIR_OP('+', MIR_TEMP(RBP.id), MIR_CONST(BigInt(8 * offsetUnit))));
    }
  }
};

const getStatementsToTile = ({
  argumentNames,
  mainBodyStatements,
}: MidIRFunction): readonly MidIRStatement[] => [
  ...argumentNames.map((name, index) =>
    MIR_MOVE_TEMP(MIR_TEMP(name), getArgPlaceInsideFunction(index))
  ),
  ...mainBodyStatements,
];

const generateInstructionsForFunction = (
  midIRFunction: MidIRFunction,
  instructions: AssemblyInstruction[],
  checkInvaraint: boolean,
  removeComments: boolean
): void => {
  const functionName = midIRFunction.functionName;
  const statementsToTile = getStatementsToTile(midIRFunction);
  instructions.push(ASM_LABEL(functionName));
  const functionAbstractRegisterAllocator = new AssemblyFunctionAbstractRegisterAllocator();
  let tiledInstructions = getAssemblyTilingForMidIRStatements(
    functionName,
    statementsToTile,
    functionAbstractRegisterAllocator
  );
  // simple optimizations
  tiledInstructions = optimizeAssemblyWithSimpleOptimization(tiledInstructions, removeComments);
  const allocator = new AssemblyRegisterAllocator(
    functionAbstractRegisterAllocator,
    midIRFunction.hasReturn,
    checkInvaraint,
    tiledInstructions
  );
  const registerAllocatedInstructions = allocator.realInstructions;
  const numberOfTemporariesOnStack = allocator.numberOfTemporariesOnStack;
  const fixedInstructions = fixCallingConvention(
    functionName,
    numberOfTemporariesOnStack,
    optimizeAssemblyWithSimpleOptimization(registerAllocatedInstructions, removeComments),
    removeComments
  );
  fixedInstructions.forEach((it) => instructions.push(it));
};

const generateAssemblyInstructionsFromMidIRCompilationUnit = (
  compilationUnit: MidIRCompilationUnit,
  // istanbul ignore next
  checkInvaraint = false,
  // istanbul ignore next
  removeComments = true
): AssemblyProgram => {
  const instructions: AssemblyInstruction[] = [];
  compilationUnit.functions.forEach((it) =>
    generateInstructionsForFunction(it, instructions, checkInvaraint, removeComments)
  );
  return {
    globalVariables: compilationUnit.globalVariables,
    instructions,
  };
};

export default generateAssemblyInstructionsFromMidIRCompilationUnit;
