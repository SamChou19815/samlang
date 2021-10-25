import { intArrayToDataString, assert } from '../utils';
import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
  ENCODED_FUNCTION_NAME_FREE,
  ENCODED_FUNCTION_NAME_MALLOC,
} from './common-names';
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
  readonly value: WebAssemblyInlineInstruction;
}

export interface WebAssemblyLocalGetInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLocalGetInstruction';
  readonly name: string;
}

export interface WebAssemblyLocalSetInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLocalSetInstruction';
  readonly name: string;
  readonly assigned: WebAssemblyInlineInstruction;
}

export interface WebAssemblyBinaryInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyBinaryInstruction';
  readonly v1: WebAssemblyInlineInstruction;
  readonly operator: IROperator;
  readonly v2: WebAssemblyInlineInstruction;
}

export interface WebAssemblyLoadInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyLoadInstruction';
  readonly index: number;
  readonly pointer: WebAssemblyInlineInstruction;
}

export interface WebAssemblyStoreInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyStoreInstruction';
  readonly index: number;
  readonly pointer: WebAssemblyInlineInstruction;
  readonly assigned: WebAssemblyInlineInstruction;
}

export interface WebAssemblyFunctionDirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionDirectCallInstruction';
  readonly functionName: string;
  readonly functionArguments: readonly WebAssemblyInlineInstruction[];
}

export interface WebAssemblyFunctionIndirectCallInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyFunctionIndirectCallInstruction';
  readonly functionIndex: WebAssemblyInlineInstruction;
  readonly functionTypeString: string;
  readonly functionArguments: readonly WebAssemblyInlineInstruction[];
}

export interface WebAssemblyIfElseInstruction extends WebAssemblyBaseInstruction {
  readonly __type__: 'WebAssemblyIfElseInstruction';
  readonly condition: WebAssemblyInlineInstruction;
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

export type WebAssemblyInlineInstruction =
  | WebAssemblyConstInstruction
  | WebAssemblyDropInstruction
  | WebAssemblyLocalGetInstruction
  | WebAssemblyLocalSetInstruction
  | WebAssemblyBinaryInstruction
  | WebAssemblyLoadInstruction
  | WebAssemblyStoreInstruction
  | WebAssemblyFunctionDirectCallInstruction
  | WebAssemblyFunctionIndirectCallInstruction;

export type WebAssemblyInstruction =
  | WebAssemblyInlineInstruction
  | WebAssemblyIfElseInstruction
  | WebAssemblyUnconditionalJumpInstruction
  | WebAssemblyLoopInstruction;

export interface WebAssemblyFunction {
  readonly name: string;
  readonly parameters: readonly string[];
  readonly localVariables: readonly string[];
  readonly instructions: readonly WebAssemblyInstruction[];
}

export interface WebAssemblyGlobalData {
  readonly constantPointer: number;
  readonly ints: readonly number[];
}

export interface WebAssemblyModule {
  readonly functionTypeParameterCounts: readonly number[];
  readonly globalVariables: readonly WebAssemblyGlobalData[];
  readonly exportedFunctions: readonly string[];
  readonly functions: readonly WebAssemblyFunction[];
}

export const WasmConst = (value: number): WebAssemblyConstInstruction => ({
  __type__: 'WebAssemblyConstInstruction',
  value,
});

export const WasmDrop = (value: WebAssemblyInlineInstruction): WebAssemblyDropInstruction => ({
  __type__: 'WebAssemblyDropInstruction',
  value,
});

export const WasmLocalGet = (name: string): WebAssemblyLocalGetInstruction => ({
  __type__: 'WebAssemblyLocalGetInstruction',
  name,
});

export const WasmLocalSet = (
  name: string,
  assigned: WebAssemblyInlineInstruction
): WebAssemblyLocalSetInstruction => ({
  __type__: 'WebAssemblyLocalSetInstruction',
  name,
  assigned,
});

export const WasmBinary = (
  v1: WebAssemblyInlineInstruction,
  operator: IROperator,
  v2: WebAssemblyInlineInstruction
): WebAssemblyBinaryInstruction => ({
  __type__: 'WebAssemblyBinaryInstruction',
  v1,
  operator,
  v2,
});

export const WasmLoad = (
  pointer: WebAssemblyInlineInstruction,
  index: number
): WebAssemblyLoadInstruction => ({
  __type__: 'WebAssemblyLoadInstruction',
  index,
  pointer,
});

export const WasmStore = (
  pointer: WebAssemblyInlineInstruction,
  index: number,
  assigned: WebAssemblyInlineInstruction
): WebAssemblyStoreInstruction => ({
  __type__: 'WebAssemblyStoreInstruction',
  index,
  pointer,
  assigned,
});

export const WasmDirectCall = (
  functionName: string,
  functionArguments: readonly WebAssemblyInlineInstruction[]
): WebAssemblyFunctionDirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionDirectCallInstruction',
  functionName,
  functionArguments,
});

export const WasmIndirectCall = (
  functionIndex: WebAssemblyInlineInstruction,
  functionTypeString: string,
  functionArguments: readonly WebAssemblyInlineInstruction[]
): WebAssemblyFunctionIndirectCallInstruction => ({
  __type__: 'WebAssemblyFunctionIndirectCallInstruction',
  functionIndex,
  functionTypeString,
  functionArguments,
});

export const WasmIfElse = (
  condition: WebAssemblyInlineInstruction,
  s1: readonly WebAssemblyInstruction[],
  s2: readonly WebAssemblyInstruction[]
): WebAssemblyIfElseInstruction => ({
  __type__: 'WebAssemblyIfElseInstruction',
  condition,
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

  function i2s(s: WebAssemblyInlineInstruction): string {
    switch (s.__type__) {
      case 'WebAssemblyConstInstruction':
        return `(i32.const ${s.value})`;
      case 'WebAssemblyDropInstruction':
        return `(drop ${i2s(s.value)})`;
      case 'WebAssemblyLocalGetInstruction':
        return `(local.get $${s.name})`;
      case 'WebAssemblyLocalSetInstruction':
        return `(local.set $${s.name} ${i2s(s.assigned)})`;
      case 'WebAssemblyBinaryInstruction':
        return `(i32.${getBinaryInstruction(s.operator)} ${i2s(s.v1)} ${i2s(s.v2)})`;
      case 'WebAssemblyLoadInstruction':
        if (s.index === 0) {
          return `(i32.load ${i2s(s.pointer)})`;
        }
        return `(i32.load offset=${s.index * 4} ${i2s(s.pointer)})`;
      case 'WebAssemblyStoreInstruction':
        if (s.index === 0) {
          return `(i32.store ${i2s(s.pointer)} ${i2s(s.assigned)})`;
        }
        return `(i32.store offset=${s.index * 4} ${i2s(s.pointer)} ${i2s(s.assigned)})`;
      case 'WebAssemblyFunctionDirectCallInstruction':
        return `(call $${s.functionName} ${s.functionArguments.map(i2s).join(' ')})`;
      case 'WebAssemblyFunctionIndirectCallInstruction': {
        const argumentString = s.functionArguments.map(i2s).join(' ');
        const indexString = i2s(s.functionIndex);
        return `(call_indirect $0 (type $${s.functionTypeString}) ${argumentString} ${indexString})`;
      }
    }
  }

  function printInstruction(s: WebAssemblyInstruction) {
    switch (s.__type__) {
      case 'WebAssemblyConstInstruction':
      case 'WebAssemblyDropInstruction':
      case 'WebAssemblyLocalGetInstruction':
      case 'WebAssemblyLocalSetInstruction':
      case 'WebAssemblyBinaryInstruction':
      case 'WebAssemblyLoadInstruction':
      case 'WebAssemblyStoreInstruction':
      case 'WebAssemblyFunctionDirectCallInstruction':
      case 'WebAssemblyFunctionIndirectCallInstruction':
        collector.push('  '.repeat(level), `${i2s(s)}\n`);
        return;
      case 'WebAssemblyIfElseInstruction':
        collector.push('  '.repeat(level), `(if ${i2s(s.condition)} (then\n`);
        level += 1;
        s.s1.forEach(printInstruction);
        level -= 1;
        if (s.s2.length > 0) {
          collector.push('  '.repeat(level), ') (else\n');
          level += 1;
          s.s2.forEach(printInstruction);
          level -= 1;
        }
        collector.push('  '.repeat(level), '))\n');
        return;
      case 'WebAssemblyUnconditionalJumpInstruction':
        collector.push('  '.repeat(level), `(br $${s.label})\n`);
        return;
      case 'WebAssemblyLoopInstruction':
        collector.push('  '.repeat(level), `(loop $${s.continueLabel}\n`);
        collector.push('  '.repeat(level + 1), `(block $${s.exitLabel}\n`);
        level += 2;
        s.instructions.forEach(printInstruction);
        level -= 2;
        collector.push('  '.repeat(level + 1), ')\n');
        collector.push('  '.repeat(level), ')\n');
        return;
    }
  }

  wasmModule.functionTypeParameterCounts.forEach((count) => {
    const typeString = WasmFunctionTypeString(count);
    if (count === 0) {
      collector.push(`(type $${typeString} (func (result i32)))\n`);
    } else {
      collector.push(`(type $${typeString} (func (param${' i32'.repeat(count)}) (result i32)))\n`);
    }
  });
  collector.push(
    `(import "builtins" "${ENCODED_FUNCTION_NAME_PRINTLN}" (func $${ENCODED_FUNCTION_NAME_PRINTLN} (param i32) (result i32)))\n`,
    `(import "builtins" "${ENCODED_FUNCTION_NAME_THROW}" (func $${ENCODED_FUNCTION_NAME_THROW} (param i32) (result i32)))\n`
  );
  wasmModule.globalVariables.flatMap(({ constantPointer, ints }) => {
    collector.push(`(data (i32.const ${constantPointer}) "${intArrayToDataString(ints)}")\n`);
  });
  collector.push(`(table $0 ${wasmModule.functions.length} funcref)\n`);
  collector.push(
    `(elem $0 (i32.const 0) ${wasmModule.functions.map((it) => `$${it.name}`).join(' ')})\n`
  );
  wasmModule.functions.forEach(({ name, parameters, localVariables, instructions }) => {
    collector.push(
      `(func $${name} ${parameters.map((it) => `(param $${it} i32)`).join(' ')} (result i32)\n`
    );
    localVariables.forEach((it) => collector.push(`  (local $${it} i32)\n`));
    instructions.forEach(printInstruction);
    collector.push(')\n');
  });
  wasmModule.exportedFunctions.forEach((it) => {
    collector.push(`(export "${it}" (func $${it}))\n`);
  });

  return collector.join('');
}

// eslint-disable-next-line @typescript-eslint/no-inferrable-types
export const wasmJSAdapter: string = `// @ts-check

const memory = new WebAssembly.Memory({ initial: 2, maximum: 65536 });
const codeModule = new WebAssembly.Module(
  require('fs').readFileSync(require('path').join(__dirname, '__all__.wasm'))
);

function pointerToString(p) {
  const mem = new Uint32Array(memory.buffer);
  const start = p / 4;
  const length = mem[start + 1];
  const characterCodes = Array.from(mem.subarray(start + 2, start + 2 + length).values());
  return String.fromCharCode(...characterCodes);
}

module.exports = new WebAssembly.Instance(codeModule, {
  env: { memory },
  builtins: {
    __Builtins_println(p) {
      // eslint-disable-next-line no-console
      console.log(pointerToString(p));
      return 0;
    },
    __Builtins_panic(p) {
      throw new Error(pointerToString(p));
    },
  },
}).exports;
`;
