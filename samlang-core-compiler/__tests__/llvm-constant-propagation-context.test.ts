import LLVMConstantPropagationContext from '../llvm-constant-propagation-context';

import { LLVM_INT, LLVM_VARIABLE } from 'samlang-core-ast/llvm-nodes';

it('LLVMConstantPropagationContext works', () => {
  const context = new LLVMConstantPropagationContext();
  context.bind('foo', LLVM_INT(3));
  context.bind('bar', LLVM_INT(3));
  context.bind('baz', LLVM_VARIABLE('bar'));
  context.bind('dev', LLVM_VARIABLE('meggo'));
  context.bind('megan', LLVM_VARIABLE('dev'));

  expect(context.getLocalValueType('foo')).toEqual(LLVM_INT(3));
  expect(context.getLocalValueType('bar')).toEqual(LLVM_INT(3));
  expect(context.getLocalValueType('baz')).toEqual(LLVM_INT(3));
  expect(context.getLocalValueType('dev')).toEqual(LLVM_VARIABLE('meggo'));
  expect(context.getLocalValueType('megan')).toEqual(LLVM_VARIABLE('meggo'));
});
