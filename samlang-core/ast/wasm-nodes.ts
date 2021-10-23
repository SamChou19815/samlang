import { intArrayToDataString, assert } from '../utils';
import type { IROperator } from './common-operators';

export interface WebAssemblyBaseInstruction {
  readonly __type__: string;
}

export interface WebAssemblyConstInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyConstInstruction';
  readonly value: number;
}

export interface WebAssemblyDropInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyDropInstruction';
}

export interface WebAssemblyLocalGetInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLocalGetInstruction';
  readonly name: string;
}

export interface WebAssemblyLocalSetInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLocalSetInstruction';
  readonly name: string;
}

export interface WebAssemblyBinaryInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyBinaryInstruction';
  readonly operator: IROperator;
}

export interface WebAssemblyLoadInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLoadInstruction';
  readonly index: number;
}

export interface WebAssemblyStoreInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyStoreInstruction';
  readonly index: number;
}

export interface WebAssemblyFunctionDirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionDirectCallInstruction';
  readonly functionName: string;
}

export interface WebAssemblyFunctionIndirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionIndirectCallInstruction';
  readonly functionTypeString: string;
}

export interface WebAssemblyIfElseInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyIfElseInstruction';
  readonly s1: readonly WebAssemblyInstruction[];
  readonly s2: readonly WebAssemblyInstruction[];
}

export interface WebAssemblyUnconditionalJumpInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyUnconditionalJumpInstruction';
  readonly label: string;
}

export interface WebAssemblyLoopInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLoopInstruction';
  readonly continueLabel: string;
  readonly exitLabel: string;
  readonly instructions: readonly WebAssemblyInstruction[];
}

export type WebAssemblyInstruction =
  | WebAssemblyConstInstruction
  | WebAssemblyDropInstruction
  | WebAssemblyLocalGetInstruction
  | WebAssemblyLocalSetInstruction
  | WebAssemblyBinaryInstruction
  | WebAssemblyLoadInstruction
  | WebAssemblyStoreInstruction
  | WebAssemblyFunctionDirectCallInstruction
  | WebAssemblyFunctionIndirectCallInstruction
  | WebAssemblyIfElseInstruction
  | WebAssemblyUnconditionalJumpInstruction
  | WebAssemblyLoopInstruction;

export interface WebAssemblyFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly localVariables: readonly string[];
  readonly instructions: readonly WebAssemblyInstruction[];
}

export interface WebAssemblyModule {
  readonly functionTypeParameterCounts: readonly number[];
  readonly globalVariables: readonly string[];
  readonly exportedFunctions: readonly string[];
  readonly functions: readonly WebAssemblyFunction[];
}

export const WasmConst = (value: number): WebAssemblyConstInstruction => ({
  __type__: 'WebAssemblyConstInstruction',
  value,
});

export const WasmDrop: WebAssemblyDropInstruction = {
  __type__: 'WebAssemblyDropInstruction',
};

export const WasmLocalGet = (name: string): WebAssemblyLocalGetInstruction => ({
  __type__: 'WebAssemblyLocalGetInstruction',
  name,
});

export const WasmLocalSet = (name: string): WebAssemblyLocalSetInstruction => ({
  __type__: 'WebAssemblyLocalSetInstruction',
  name,
});

export const WasmBinary = (operator: IROperator): WebAssemblyBinaryInstruction => ({
  __type__: 'WebAssemblyBinaryInstruction',
  operator,
});

export const WasmLoad = (index: number): WebAssemblyLoadInstruction => ({
  __type__: 'WebAssemblyLoadInstruction',
  index,
});

export const WasmStore = (index: number): WebAssemblyStoreInstruction => ({
  __type__: 'WebAssemblyStoreInstruction',
  index,
});

export const WasmDirectCall = (functionName: string): WebAssemblyFunctionDirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionDirectCallInstruction',
  functionName,
});

export const WasmIndirectCall = (
  functionTypeString: string
): WebAssemblyFunctionIndirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionIndirectCallInstruction',
  functionTypeString,
});

export const WasmIfElse = (
  s1: readonly WebAssemblyInstruction[],
  s2: readonly WebAssemblyInstruction[]
): WebAssemblyIfElseInstruction => ({
  __type__: 'WebAssemblyIfElseInstruction',
  s1,
  s2,
});

export const WasmJump = (label: string): WebAssemblyUnconditionalJumpInstruction => ({
  __type__: 'WebAssemblyUnconditionalJumpInstruction',
  label,
});

export const WasmLoop = ({
  continueLabel,
  exitLabel,
  instructions,
}: Omit<WebAssemblyLoopInstruction, '__type__'>): WebAssemblyLoopInstruction => ({
  __type__: 'WebAssemblyLoopInstruction',
  continueLabel,
  exitLabel,
  instructions,
});

export function WasmFunctionTypeString(parameterCount: number): string {
  assert(parameterCount >= 0);
  if (parameterCount === 0) return `none_=>_i32`;
  return `${'i32_'.repeat(parameterCount)}=>_i32`;
}

export function prettyPrintWebAssemblyModule(wasmModule: WebAssemblyModule): string {
  const collector: string[] = [];
  let level = 1;

  function getBinaryInstruction(o: IROperator): string {
    switch (o) {
      case '+':
        return 'add';
      case '-':
        return 'sub';
      case '*':
        return 'mul';
      case '/':
        return 'div_s';
      case '%':
        return 'rem_s';
      case '^':
        return 'xor';
      case '<':
        return 'lt_s';
      case '<=':
        return 'le_s';
      case '>':
        return 'gt_s';
      case '>=':
        return 'ge_s';
      case '==':
        return 'eq';
      case '!=':
        return 'ne';
    }
  }

  function printInstruction(s: WebAssemblyInstruction) {
    switch (s.__type__) {
      case 'WebAssemblyConstInstruction':
        collector.push('  '.repeat(level), `i32.const ${s.value}\n`);
        return;
      case 'WebAssemblyDropInstruction':
        collector.push('  '.repeat(level), 'drop\n');
        return;
      case 'WebAssemblyLocalGetInstruction':
        collector.push('  '.repeat(level), `local.get $${s.name}\n`);
        return;
      case 'WebAssemblyLocalSetInstruction':
        collector.push('  '.repeat(level), `local.set $${s.name}\n`);
        return;
      case 'WebAssemblyBinaryInstruction':
        collector.push('  '.repeat(level), `i32.${getBinaryInstruction(s.operator)}\n`);
        return;
      case 'WebAssemblyLoadInstruction':
        collector.push('  '.repeat(level), `local.load offset=${s.index * 4}\n`);
        return;
      case 'WebAssemblyStoreInstruction':
        collector.push('  '.repeat(level), `local.store offset=${s.index * 4}\n`);
        return;
      case 'WebAssemblyFunctionDirectCallInstruction':
        collector.push('  '.repeat(level), `call $${s.functionName}\n`);
        return;
      case 'WebAssemblyFunctionIndirectCallInstruction':
        collector.push('  '.repeat(level), `call_indirect $0 (type $${s.functionTypeString})\n`);
        return;
      case 'WebAssemblyIfElseInstruction':
        collector.push('  '.repeat(level), 'if\n');
        level += 1;
        s.s1.forEach(printInstruction);
        level -= 1;
        collector.push('  '.repeat(level), 'else\n');
        level += 1;
        s.s2.forEach(printInstruction);
        level -= 1;
        collector.push('  '.repeat(level), 'end\n');
        return;
      case 'WebAssemblyUnconditionalJumpInstruction':
        collector.push('  '.repeat(level), `br $${s.label}\n`);
        return;
      case 'WebAssemblyLoopInstruction':
        collector.push('  '.repeat(level), `loop $${s.continueLabel}\n`);
        collector.push('  '.repeat(level + 1), `block $${s.exitLabel}\n`);
        level += 2;
        s.instructions.forEach(printInstruction);
        level -= 2;
        collector.push('  '.repeat(level + 1), 'end\n');
        collector.push('  '.repeat(level), 'end\n');
        return;
    }
  }

  collector.push('(module\n');
  wasmModule.functionTypeParameterCounts.forEach((count) => {
    const typeString = WasmFunctionTypeString(count);
    if (count === 0) {
      collector.push(`(type $${typeString} (func (result i32)))\n`);
    } else {
      collector.push(`(type $${typeString} (func (param${' i32'.repeat(count)}) (result i32)))\n`);
    }
  });
  collector.push('(memory $0 1)\n');
  let dataStart = 1024;
  wasmModule.globalVariables.flatMap((content) => {
    const size = content.length + 2;
    const ints = Array.from(content).map((it) => it.charCodeAt(0));
    ints.unshift(0, size);
    collector.push(`(data (i32.const ${dataStart}) "${intArrayToDataString(ints)}")\n`);
    dataStart += size;
  });
  collector.push(`(table $0 ${wasmModule.functions.length} funcref)\n`);
  collector.push(
    `(elem $0 (i32.const 0) ${wasmModule.functions.map((it) => `$${it.name}`).join(' ')})\n`
  );
  wasmModule.exportedFunctions.forEach((it) => {
    collector.push(`(export "${it}" (func ${it}))\n`);
  });
  wasmModule.functions.forEach(({ name, parameters, localVariables, instructions }) => {
    collector.push(
      `(func $${name} ${parameters.map((it) => `(param $${it} i32)`).join(' ')} (result i32)\n`
    );
    localVariables.forEach((it) => collector.push(`  (local $${it} i32)\n`));
    instructions.forEach(printInstruction);
    collector.push(')\n');
  });
  collector.push(')\n');

  return collector.join('');
}
