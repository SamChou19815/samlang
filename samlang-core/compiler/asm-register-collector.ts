import type { AssemblyRegister, AssemblyArgument } from '../ast/asm-arguments';
import type { AssemblyInstruction } from '../ast/asm-instructions';
import { PRE_COLORED_REGISTERS } from './asm-register-allocation-utils';

const collectAssemblyRegistersWithoutMachineRegisters = (
  collector: Set<string>,
  { id }: AssemblyRegister
): void => {
  if (!PRE_COLORED_REGISTERS.has(id)) collector.add(id);
};

const collectAssemblyRegisters = (
  collector: Set<string>,
  assemblyArgument: AssemblyArgument
): void => {
  switch (assemblyArgument.__type__) {
    case 'AssemblyConst':
      return;
    case 'AssemblyRegister':
      collectAssemblyRegistersWithoutMachineRegisters(collector, assemblyArgument);
      return;
    case 'AssemblyMemory':
      if (assemblyArgument.baseRegister != null) {
        collectAssemblyRegistersWithoutMachineRegisters(collector, assemblyArgument.baseRegister);
      }
      if (assemblyArgument.multipleOf != null) {
        collectAssemblyRegistersWithoutMachineRegisters(
          collector,
          assemblyArgument.multipleOf.baseRegister
        );
      }
  }
};

const collectAssemblyRegistersFromAssemblyInstructions = (
  instructions: readonly AssemblyInstruction[]
): ReadonlySet<string> => {
  const collector = new Set<string>();
  instructions.forEach((instruction) => {
    switch (instruction.__type__) {
      case 'AssemblyMoveFromLong':
        collectAssemblyRegisters(collector, instruction.destination);
        break;
      case 'AssemblyMoveToMemory':
      case 'AssemblyMoveToRegister':
      case 'AssemblyLoadEffectiveAddress':
        collectAssemblyRegisters(collector, instruction.destination);
        collectAssemblyRegisters(collector, instruction.source);
        break;
      case 'AssemblyCompareMemory':
      case 'AssemblyCompareConstOrRegister':
        collectAssemblyRegisters(collector, instruction.minuend);
        collectAssemblyRegisters(collector, instruction.subtrahend);
        break;
      case 'AssemblySetOnFlag':
        collectAssemblyRegisters(collector, instruction.register);
        break;
      case 'AssemblyCall':
        collectAssemblyRegisters(collector, instruction.address);
        break;
      case 'AssemblyArithmeticBinaryMemoryDestination':
      case 'AssemblyArithmeticBinaryRegisterDestination':
      case 'AssemblyIMulTwoArgs':
      case 'AssemblyIMulThreeArgs':
        collectAssemblyRegisters(collector, instruction.destination);
        collectAssemblyRegisters(collector, instruction.source);
        break;
      case 'AssemblyIDiv':
        collectAssemblyRegisters(collector, instruction.divisor);
        break;
      case 'AssemblyNeg':
      case 'AssemblyShiftLeft':
        collectAssemblyRegisters(collector, instruction.destination);
        break;
      case 'AssemblyPush':
        collectAssemblyRegisters(collector, instruction.pushArgument);
        break;
      case 'AssemblyJump':
      case 'AssemblyReturn':
      case 'AssemblyCqo':
      case 'AssemblyPopRBP':
      case 'AssemblyLabel':
      case 'AssemblyComment':
        break;
    }
  });
  return collector;
};

export default collectAssemblyRegistersFromAssemblyInstructions;
