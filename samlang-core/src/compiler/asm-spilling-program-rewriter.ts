import {
  AssemblyRegister,
  AssemblyMemory,
  AssemblyConstOrRegister,
  AssemblyRegisterOrMemory,
  AssemblyArgument,
  RBP,
  ASM_CONST,
  ASM_MEM_REG_WITH_CONST,
  ASM_MEM,
} from '../ast/asm-arguments';
import {
  AssemblyInstruction,
  ASM_MOVE_CONST_TO_REG,
  ASM_MOVE_REG,
  ASM_MOVE_MEM,
  ASM_LEA,
  ASM_CMP_MEM,
  ASM_CMP_CONST_OR_REG,
  ASM_CALL,
  ASM_BIN_OP_MEM_DEST,
  ASM_BIN_OP_REG_DEST,
  ASM_IMUL,
  ASM_IDIV,
  ASM_PUSH,
} from '../ast/asm-instructions';
import AssemblyFunctionAbstractRegisterAllocator from './asm-function-abstract-register-allocator';
import { PRE_COLORED_REGISTERS } from './asm-register-allocation-utils';

/** The program rewriter after spilling temporaries into stack. */
export default class AssemblySpillingProgramWriter {
  /** The generated mappings for spilled vars. */
  readonly spilledVariableMappings: ReadonlyMap<string, AssemblyMemory>;

  /** The collector of new temps. */
  private readonly newTemps: string[] = [];

  /** The collector for new instructions. */
  private readonly newInstructions: AssemblyInstruction[] = [];

  /**
   * @param allocator the function context to aid program rewriting.
   * @param oldInstructions old instructions to be rewritten.
   * @param spilledVars the spilled vars to put onto the stack.
   * @param numberOfSpilledVarsSoFar number of spilled vars so far, before spilling the new ones.
   */
  constructor(
    private readonly allocator: AssemblyFunctionAbstractRegisterAllocator,
    oldInstructions: readonly AssemblyInstruction[],
    spilledVariables: ReadonlySet<string>,
    numberOfSpilledVariablesSoFar: number
  ) {
    const spilledVariableMappings = new Map<string, AssemblyMemory>();
    let memoryID = 1 + numberOfSpilledVariablesSoFar;
    spilledVariables.forEach((abstractRegisterId) => {
      const memory = ASM_MEM_REG_WITH_CONST(RBP, ASM_CONST(-memoryID * 8));
      memoryID += 1;
      spilledVariableMappings.set(abstractRegisterId, memory);
    });
    this.spilledVariableMappings = spilledVariableMappings;
    oldInstructions.forEach(this.rewriteInstruction);
  }

  getNewTemps = (): readonly string[] => this.newTemps;

  getNewInstructions = (): readonly AssemblyInstruction[] => this.newInstructions;

  private getExpectedRegisterOrMemory = (register: AssemblyRegister): AssemblyRegisterOrMemory =>
    this.spilledVariableMappings.get(register.id) ?? register;

  private allocateNextRegister = (): AssemblyRegister => {
    const nextRegister = this.allocator.nextReg();
    this.newTemps.push(nextRegister.id);
    return nextRegister;
  };

  private transformRegisterToRegister = (register: AssemblyRegister): AssemblyRegister => {
    const expected = this.getExpectedRegisterOrMemory(register);
    if (expected.__type__ === 'AssemblyRegister') {
      return expected;
    }
    const nextRegister = this.allocateNextRegister();
    this.newInstructions.push(ASM_MOVE_REG(nextRegister, expected));
    return nextRegister;
  };

  private transformMemoryToMemory = ({
    baseRegister,
    multipleOf,
    displacementConstant,
  }: AssemblyMemory): AssemblyMemory => {
    const newBaseRegister =
      baseRegister == null ? undefined : this.transformRegisterToRegister(baseRegister);
    const newMultipleOf =
      multipleOf == null
        ? undefined
        : {
            baseRegister: this.transformRegisterToRegister(multipleOf.baseRegister),
            multipliedConstant: multipleOf.multipliedConstant,
          };
    return ASM_MEM(newBaseRegister, newMultipleOf, displacementConstant);
  };

  private transformRegisterOrMemory = (
    registerOrMemory: AssemblyRegisterOrMemory
  ): AssemblyRegisterOrMemory =>
    registerOrMemory.__type__ === 'AssemblyRegister'
      ? this.getExpectedRegisterOrMemory(registerOrMemory)
      : this.transformMemoryToMemory(registerOrMemory);

  private transformConstOrRegister = (
    constOrRegister: AssemblyConstOrRegister
  ): AssemblyConstOrRegister =>
    constOrRegister.__type__ === 'AssemblyConst'
      ? constOrRegister
      : this.transformRegisterToRegister(constOrRegister);

  private transformAssemblyArgument = (assemblyArgument: AssemblyArgument): AssemblyArgument => {
    switch (assemblyArgument.__type__) {
      case 'AssemblyConst':
        return assemblyArgument;
      case 'AssemblyRegister':
        return this.getExpectedRegisterOrMemory(assemblyArgument);
      case 'AssemblyMemory':
        return this.transformMemoryToMemory(assemblyArgument);
    }
  };

  private transformRegisterDestination = (
    destination: AssemblyRegister,
    instructionAdder: (register: AssemblyRegister) => void
  ): void => {
    const expected = this.getExpectedRegisterOrMemory(destination);
    if (expected.__type__ === 'AssemblyRegister') {
      instructionAdder(expected);
      return;
    }
    const nextRegister = this.allocateNextRegister();
    instructionAdder(nextRegister);
    this.newInstructions.push(ASM_MOVE_MEM(expected, nextRegister));
  };

  private rewriteInstruction = (node: AssemblyInstruction): void => {
    switch (node.__type__) {
      case 'AssemblyMoveFromLong':
        this.transformRegisterDestination(node.destination, (destination) =>
          this.newInstructions.push(ASM_MOVE_CONST_TO_REG(destination, node.value))
        );
        return;
      case 'AssemblyMoveToMemory':
        this.newInstructions.push(
          ASM_MOVE_MEM(
            this.transformMemoryToMemory(node.destination),
            this.transformConstOrRegister(node.source)
          )
        );
        return;
      case 'AssemblyMoveToRegister': {
        const transformedSource = this.transformAssemblyArgument(node.source);
        const expectedDestination = this.getExpectedRegisterOrMemory(node.destination);
        if (expectedDestination.__type__ === 'AssemblyRegister') {
          this.newInstructions.push(ASM_MOVE_REG(expectedDestination, transformedSource));
          return;
        }
        switch (transformedSource.__type__) {
          case 'AssemblyConst':
          case 'AssemblyRegister':
            this.newInstructions.push(ASM_MOVE_MEM(expectedDestination, transformedSource));
            return;
          case 'AssemblyMemory': {
            const nextRegister = this.allocateNextRegister();
            this.newInstructions.push(
              ASM_MOVE_REG(nextRegister, transformedSource),
              ASM_MOVE_MEM(expectedDestination, nextRegister)
            );
          }
        }
        return;
      }
      case 'AssemblyLoadEffectiveAddress':
        this.transformRegisterDestination(node.destination, (destination) =>
          this.newInstructions.push(ASM_LEA(destination, this.transformMemoryToMemory(node.source)))
        );
        return;
      case 'AssemblyCompareMemory':
        this.newInstructions.push(
          ASM_CMP_MEM(
            this.transformRegisterToRegister(node.minuend),
            this.transformMemoryToMemory(node.subtrahend)
          )
        );
        return;
      case 'AssemblyCompareConstOrRegister':
        this.newInstructions.push(
          ASM_CMP_CONST_OR_REG(
            this.transformRegisterOrMemory(node.minuend),
            this.transformConstOrRegister(node.subtrahend)
          )
        );
        return;
      case 'AssemblySetOnFlag':
        // istanbul ignore next
        if (PRE_COLORED_REGISTERS.has(node.register.id)) {
          this.newInstructions.push(node);
          return;
        }
        // istanbul ignore next
        throw new Error();
      case 'AssemblyCall':
        this.newInstructions.push(ASM_CALL(this.transformAssemblyArgument(node.address)));
        return;
      case 'AssemblyArithmeticBinaryMemoryDestination':
        this.newInstructions.push(
          ASM_BIN_OP_MEM_DEST(
            node.type,
            this.transformMemoryToMemory(node.destination),
            this.transformConstOrRegister(node.source)
          )
        );
        return;
      case 'AssemblyArithmeticBinaryRegisterDestination': {
        const transformedSource = this.transformAssemblyArgument(node.source);
        const expectedDestination = this.getExpectedRegisterOrMemory(node.destination);
        if (expectedDestination.__type__ === 'AssemblyRegister') {
          this.newInstructions.push(
            ASM_BIN_OP_REG_DEST(node.type, expectedDestination, transformedSource)
          );
          return;
        }
        switch (transformedSource.__type__) {
          case 'AssemblyConst':
          case 'AssemblyRegister':
            this.newInstructions.push(
              ASM_BIN_OP_MEM_DEST(node.type, expectedDestination, transformedSource)
            );
            return;
          case 'AssemblyMemory': {
            const nextRegister = this.allocateNextRegister();
            this.newInstructions.push(
              ASM_MOVE_REG(nextRegister, expectedDestination),
              ASM_BIN_OP_REG_DEST(node.type, nextRegister, transformedSource),
              ASM_MOVE_MEM(expectedDestination, nextRegister)
            );
          }
        }
        return;
      }
      case 'AssemblyIMulTwoArgs': {
        const transformedSource = this.transformRegisterOrMemory(node.source);
        const expectedDestination = this.getExpectedRegisterOrMemory(node.destination);
        if (expectedDestination.__type__ === 'AssemblyRegister') {
          this.newInstructions.push(ASM_IMUL(expectedDestination, transformedSource));
          return;
        }
        const nextRegister = this.allocateNextRegister();
        this.newInstructions.push(
          ASM_MOVE_REG(nextRegister, expectedDestination),
          ASM_IMUL(nextRegister, transformedSource),
          ASM_MOVE_MEM(expectedDestination, nextRegister)
        );
        return;
      }
      case 'AssemblyIMulThreeArgs':
        this.transformRegisterDestination(node.destination, (destination) =>
          this.newInstructions.push(
            ASM_IMUL(destination, this.transformRegisterOrMemory(node.source), node.immediate)
          )
        );
        return;
      case 'AssemblyIDiv':
        this.newInstructions.push(ASM_IDIV(this.transformRegisterOrMemory(node.divisor)));
        return;
      case 'AssemblyNeg':
      case 'AssemblyShiftLeft': {
        if (node.destination.__type__ === 'AssemblyRegister') {
          this.newInstructions.push({
            ...node,
            destination: this.getExpectedRegisterOrMemory(node.destination),
          });
          return;
        }
        this.newInstructions.push({
          ...node,
          destination: this.transformMemoryToMemory(node.destination),
        });
        return;
      }
      case 'AssemblyPush':
        this.newInstructions.push(ASM_PUSH(this.transformAssemblyArgument(node.pushArgument)));
        return;
      case 'AssemblyJump':
      case 'AssemblyReturn':
      case 'AssemblyCqo':
      case 'AssemblyPopRBP':
      case 'AssemblyLabel':
      case 'AssemblyComment':
        this.newInstructions.push(node);
    }
  };
}
