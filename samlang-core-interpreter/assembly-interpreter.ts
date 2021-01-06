import PanicException from './panic-exception';

import {
  RAX,
  RDX,
  RSI,
  RDI,
  RSP,
  RBP,
  ASM_MEM_REG,
  AssemblyConst,
  AssemblyMemory,
  AssemblyRegisterOrMemory,
  AssemblyArgument,
} from 'samlang-core-ast/asm-arguments';
import type { AssemblyInstruction, AssemblyCall } from 'samlang-core-ast/asm-instructions';
import type { AssemblyProgram } from 'samlang-core-ast/asm-program';
import {
  ENCODED_COMPILED_PROGRAM_MAIN,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_MALLOC,
  ENCODED_FUNCTION_NAME_THROW,
} from 'samlang-core-ast/common-names';
import { Long, assertNotNull, checkNotNull } from 'samlang-core-utils';

// istanbul ignore next
const checkMemoryLocation = (location: Long): void => {
  if (location.mod(8).notEquals(Long.ZERO)) {
    throw new Error(`Unaligned memory access: ${location} (word size=8)`);
  }
  if (location.lessThan(0) || location.greaterThan(0x78000000)) {
    throw new Error(`Segmentation fault: ${location}.`);
  }
};

class ReturnException extends Error {}

class AssemblyInterpreter {
  /** The list of all instructions. */
  private readonly instructions: readonly AssemblyInstruction[];

  /** The mapping between label and instruction number. Useful for jump. */
  private readonly labelInstructionNumberMapping: Readonly<Record<string, number>>;

  /** The mapping from names to actual memory address. */
  private readonly nameToMemoryAddress: Readonly<Record<string, Long>>;

  /** Current register values. It will only be lazily provisioned. */
  private readonly registers: Record<string, Long> = {
    [RSP.id]: Long.fromInt(0x78000000),
  };

  /** Current memory content. It will only be lazily provisioned. */
  private readonly memory: Map<string, Long> = new Map();

  /**
   * Current flags.
   * The flags are not exactly the same as the x86 ones.
   */
  private readonly flags: Map<string, boolean> = new Map();

  /** The current instruction pointer. */
  private instructionPointer: number;

  /** The current heap end pointer. */
  private currentHeapEndPointer = 0;

  /** The place to collect all the stuff printed. */
  private printCollector = '';

  constructor(program: AssemblyProgram) {
    this.instructions = program.instructions;
    const labelInstructionNumberMapping: Record<string, number> = {};
    const nameToMemoryAddress: Record<string, Long> = {};
    let globalVarsTotalSize = Long.fromInt(10000);
    program.globalVariables.forEach(({ name, content }) => {
      // Setup content variable size
      const contentStart = globalVarsTotalSize;
      nameToMemoryAddress[name] = contentStart;
      globalVarsTotalSize = globalVarsTotalSize.add(content.length * 8 + 8);
      // Setup content
      this.memory.set(contentStart.toString(), Long.fromInt(content.length));
      const characterStart = contentStart.add(8);
      Array.from(content).forEach((characterString, index) => {
        this.memory.set(
          characterStart.add(8 * index).toString(),
          Long.fromInt(characterString.charCodeAt(0))
        );
      });
    });
    this.calloc(globalVarsTotalSize);
    program.instructions.forEach((instruction, index) => {
      if (instruction.__type__ === 'AssemblyLabel') {
        labelInstructionNumberMapping[instruction.label] = index * 8;
      }
    });
    this.labelInstructionNumberMapping = labelInstructionNumberMapping;
    this.nameToMemoryAddress = nameToMemoryAddress;
    const instructionPointer = labelInstructionNumberMapping[ENCODED_COMPILED_PROGRAM_MAIN];
    assertNotNull(instructionPointer);
    this.instructionPointer = instructionPointer;
    // istanbul ignore next
    if (this.currentHeapEndPointer !== Number(globalVarsTotalSize)) throw new Error();
    this.stepUntilReturn();
  }

  get interpretationResult(): string {
    return this.printCollector;
  }

  private stepUntilReturn(): void {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      // istanbul ignore next
      if (this.instructionPointer % 8 !== 0) throw new Error(`Bad RIP: ${this.instructionPointer}`);
      const index = this.instructionPointer / 8;
      const instruction = this.instructions[index];
      // istanbul ignore next
      if (instruction == null) throw new Error(`index=${index}, len=${this.instructions.length}`);
      try {
        this.interpret(instruction);
      } catch (e) {
        // istanbul ignore next
        if (e instanceof ReturnException) return;
        // istanbul ignore next
        throw e;
      }
      this.instructionPointer += 8;
    }
  }

  private getRegister = (id: string): Long => {
    const value = this.registers[id];
    // istanbul ignore next
    if (value != null) return value;
    // istanbul ignore next
    this.registers[id] = Long.ZERO;
    // istanbul ignore next
    return Long.ZERO;
  };

  private setRegister = (id: string, value: Long): void => {
    this.registers[id] = value;
  };

  private getMemory = (location: Long): Long => {
    checkMemoryLocation(location);
    const value = this.memory.get(location.toString());
    // istanbul ignore next
    if (value != null) return value;
    // istanbul ignore next
    this.memory.set(location.toString(), Long.ZERO);
    // istanbul ignore next
    return Long.ZERO;
  };

  private setMemory = (location: Long, value: Long): void => {
    checkMemoryLocation(location);
    this.memory.set(location.toString(), value);
  };

  private getConstValue = (constant: AssemblyConst): Long => {
    const valueOrName = constant.value;
    if (typeof valueOrName === 'number') return Long.fromInt(valueOrName);
    const nameValue = this.nameToMemoryAddress[valueOrName];
    if (nameValue != null) return nameValue;
    const instructionNumber = this.labelInstructionNumberMapping[valueOrName];
    assertNotNull(instructionNumber);
    return Long.fromInt(instructionNumber);
  };

  private getMemoryLocation = ({
    baseRegister,
    multipleOf,
    displacementConstant,
  }: AssemblyMemory): Long => {
    let memoryLocation = Long.ZERO;
    if (baseRegister != null) {
      memoryLocation = memoryLocation.add(this.getRegister(baseRegister.id));
    }
    if (multipleOf != null) {
      memoryLocation = memoryLocation.add(
        this.getRegister(multipleOf.baseRegister.id).multiply(multipleOf.multipliedConstant)
      );
    }
    if (displacementConstant != null) {
      memoryLocation = memoryLocation.add(this.getConstValue(displacementConstant));
    }
    return memoryLocation;
  };

  private getValue = (assemblyArgument: AssemblyArgument): Long => {
    switch (assemblyArgument.__type__) {
      case 'AssemblyConst':
        return this.getConstValue(assemblyArgument);
      case 'AssemblyRegister':
        return this.getRegister(assemblyArgument.id);
      case 'AssemblyMemory':
        return this.getMemory(this.getMemoryLocation(assemblyArgument));
    }
  };

  private setValue = (target: AssemblyRegisterOrMemory, value: Long): void => {
    switch (target.__type__) {
      case 'AssemblyRegister':
        this.setRegister(target.id, value);
        break;
      case 'AssemblyMemory':
        this.setMemory(this.getMemoryLocation(target), value);
        break;
    }
  };

  private calloc = (size: Long): Long => {
    // istanbul ignore next
    if (size.lessThan(Long.ZERO)) throw new Error('Invalid size');
    // istanbul ignore next
    if (size.mod(8).notEquals(Long.ZERO)) {
      // istanbul ignore next
      throw new Error(`Can only allocate in chunks of 8 bytes!: bad size: ${size}`);
    }
    const pointerToBeReturned = Long.fromInt(this.currentHeapEndPointer);
    this.currentHeapEndPointer += Number(size);
    return pointerToBeReturned;
  };

  private interpret = (node: AssemblyInstruction): void => {
    switch (node.__type__) {
      // istanbul ignore next
      case 'AssemblyMoveFromLong':
        // istanbul ignore next
        this.setValue(node.destination, node.value);
        return;
      case 'AssemblyMoveToMemory':
      case 'AssemblyMoveToRegister':
        this.setValue(node.destination, this.getValue(node.source));
        return;
      case 'AssemblyLoadEffectiveAddress':
        this.setValue(node.destination, this.getMemoryLocation(node.source));
        return;
      // istanbul ignore next
      case 'AssemblyCompareMemory':
      case 'AssemblyCompareConstOrRegister': {
        const m = this.getValue(node.minuend);
        const s = this.getValue(node.subtrahend);
        this.flags.set('eq', m.equals(s));
        this.flags.set('le', m.lessThanOrEqual(s));
        this.flags.set('lt', m.lessThan(s));
        this.flags.set('z', m.subtract(s).equals(Long.ZERO));
        return;
      }
      case 'AssemblySetOnFlag': {
        let doesSetFlag: boolean | undefined;
        // istanbul ignore next
        switch (node.type) {
          case 'je':
            doesSetFlag = this.flags.get('eq');
            break;
          case 'jne':
            doesSetFlag = !this.flags.get('eq');
            break;
          case 'jl':
            doesSetFlag = this.flags.get('lt');
            break;
          case 'jle':
            doesSetFlag = this.flags.get('le');
            break;
          case 'jg':
            doesSetFlag = !this.flags.get('le');
            break;
          case 'jge':
            doesSetFlag = !this.flags.get('lt');
            break;
          case 'jz':
            doesSetFlag = this.flags.get('z');
            break;
          case 'jnz':
            doesSetFlag = !this.flags.get('z');
            break;
        }
        assertNotNull(doesSetFlag);
        // istanbul ignore next
        this.setValue(node.register, doesSetFlag ? Long.ONE : Long.ZERO);
        return;
      }
      case 'AssemblyJump': {
        let doesJump: boolean | undefined;
        // istanbul ignore next
        switch (node.type) {
          case 'jmp':
            doesJump = true;
            break;
          case 'je':
            doesJump = this.flags.get('eq');
            break;
          case 'jne':
            doesJump = !this.flags.get('eq');
            break;
          case 'jl':
            doesJump = this.flags.get('lt');
            break;
          case 'jle':
            doesJump = this.flags.get('le');
            break;
          case 'jg':
            doesJump = !this.flags.get('le');
            break;
          case 'jge':
            doesJump = !this.flags.get('lt');
            break;
          case 'jz':
            doesJump = this.flags.get('z');
            break;
          case 'jnz':
            doesJump = !this.flags.get('z');
            break;
        }
        assertNotNull(doesJump);
        if (doesJump) {
          const newPointer = this.labelInstructionNumberMapping[node.label];
          assertNotNull(newPointer);
          this.instructionPointer = newPointer;
        }
        return;
      }
      case 'AssemblyCall':
        this.interpretCall(node);
        return;
      case 'AssemblyReturn':
        throw new ReturnException();
      // istanbul ignore next
      case 'AssemblyArithmeticBinaryMemoryDestination':
      case 'AssemblyArithmeticBinaryRegisterDestination': {
        const sourceValue = this.getValue(node.source);
        const destinationValue = this.getValue(node.destination);
        let newValue: Long;
        switch (node.type) {
          case 'add':
            newValue = destinationValue.add(sourceValue);
            break;
          case 'sub':
            newValue = destinationValue.subtract(sourceValue);
            break;
          case 'xor':
            newValue = destinationValue.xor(sourceValue);
            break;
        }
        this.setValue(node.destination, newValue);
        return;
      }
      case 'AssemblyIMulTwoArgs':
        this.setValue(
          node.destination,
          this.getValue(node.destination).multiply(this.getValue(node.source))
        );
        return;
      // istanbul ignore next
      case 'AssemblyIMulThreeArgs':
        this.setValue(
          node.destination,
          this.getValue(node.source).multiply(this.getValue(node.immediate))
        );
        return;
      // istanbul ignore next
      case 'AssemblyCqo':
        if (this.getValue(RAX).greaterThanOrEqual(Long.ZERO)) {
          this.setValue(RDX, Long.ZERO);
        } else {
          this.setValue(RDX, Long.NEG_ONE);
        }
        return;
      case 'AssemblyIDiv': {
        const raxValue = this.getValue(RAX);
        const argumentValue = this.getValue(node.divisor);
        // istanbul ignore next
        if (argumentValue.equals(Long.ZERO)) throw new PanicException('Division by zero!');
        this.setValue(RAX, raxValue.divide(argumentValue));
        this.setValue(RDX, raxValue.mod(argumentValue));
        return;
      }
      // istanbul ignore next
      case 'AssemblyNeg':
        this.setValue(node.destination, this.getValue(node.destination).negate());
        return;
      // istanbul ignore next
      case 'AssemblyShiftLeft':
        // eslint-disable-next-line no-bitwise
        this.setValue(node.destination, this.getValue(node.destination).shiftLeft(node.count));
        return;
      case 'AssemblyPush': {
        const value = this.getValue(node.pushArgument);
        this.setValue(RSP, this.getValue(RSP).subtract(8));
        this.setValue(ASM_MEM_REG(RSP), value);
        return;
      }
      case 'AssemblyPopRBP':
        this.setValue(RBP, this.getValue(ASM_MEM_REG(RSP)));
        this.setValue(RSP, this.getValue(RSP).add(8));
        break;
      case 'AssemblyLabel':
      case 'AssemblyComment':
    }
  };

  private readArray = (arrayPointer: Long): string => {
    const len = Number(this.getMemory(arrayPointer));
    const array: number[] = [];
    for (let i = 1; i <= len; i += 1) {
      array.push(Number(this.getMemory(arrayPointer.add(i * 8))));
    }
    return String.fromCharCode(...array);
  };

  private interpretCall = (node: AssemblyCall): void => {
    const savedInstructionPointer = this.instructionPointer;
    const functionExpression = node.address;
    if (
      functionExpression.__type__ === 'AssemblyConst' &&
      typeof functionExpression.value === 'string'
    ) {
      const functionName = functionExpression.value;
      switch (functionName) {
        case ENCODED_FUNCTION_NAME_PRINTLN: {
          const argument = this.getValue(RDI);
          this.printCollector += `${this.readArray(argument)}\n`;
          return;
        }
        case ENCODED_FUNCTION_NAME_INT_TO_STRING: {
          const argument = this.getValue(RDI);
          const resultArray = Array.from(String(argument)).map((it) =>
            Long.fromInt(it.charCodeAt(0))
          );
          const memoryStartPointer = this.calloc(Long.fromInt(resultArray.length * 8 + 8));
          const unparsedStringStartingPointer = memoryStartPointer.add(8);
          this.setMemory(memoryStartPointer, Long.fromInt(resultArray.length));
          for (let i = 0; i < resultArray.length; i += 1) {
            this.setMemory(unparsedStringStartingPointer.add(i * 8), checkNotNull(resultArray[i]));
          }
          this.setValue(RAX, memoryStartPointer);
          return;
        }
        case ENCODED_FUNCTION_NAME_STRING_TO_INT: {
          const stringToParse = this.readArray(this.getValue(RDI));
          try {
            BigInt(stringToParse);
            this.setValue(RAX, Long.fromString(stringToParse));
            return;
            // istanbul ignore next
          } catch {
            // istanbul ignore next
            throw new PanicException(`Bad string: ${stringToParse}`);
          }
        }
        case ENCODED_FUNCTION_NAME_STRING_CONCAT: {
          const concatString = Array.from(
            this.readArray(this.getValue(RDI)) + this.readArray(this.getValue(RSI))
          ).map((it) => Long.fromInt(it.charCodeAt(0)));
          const memoryStartPointer = this.calloc(Long.fromInt(concatString.length * 8 + 8));
          this.setMemory(memoryStartPointer, Long.fromInt(concatString.length));
          const stringStartPointer = memoryStartPointer.add(8);
          for (let i = 0; i < concatString.length; i += 1) {
            this.setMemory(stringStartPointer.add(i * 8), checkNotNull(concatString[i]));
          }
          this.setValue(RAX, memoryStartPointer);
          return;
        }
        case ENCODED_FUNCTION_NAME_MALLOC:
          this.setValue(RAX, this.calloc(this.getValue(RDI)));
          return;
        // istanbul ignore next
        case ENCODED_FUNCTION_NAME_THROW:
          throw new PanicException(this.readArray(this.getValue(RDI)));
        default: {
          const newInstructionPointer = this.labelInstructionNumberMapping[functionName];
          assertNotNull(newInstructionPointer);
          this.instructionPointer = newInstructionPointer;
          this.stepUntilReturn();
          this.instructionPointer = savedInstructionPointer;
          return;
        }
      }
    }
    this.instructionPointer = Number(this.getValue(functionExpression));
    this.stepUntilReturn();
    this.instructionPointer = savedInstructionPointer;
  };
}

const interpretAssemblyProgram = (program: AssemblyProgram): string =>
  new AssemblyInterpreter(program).interpretationResult;

export default interpretAssemblyProgram;
