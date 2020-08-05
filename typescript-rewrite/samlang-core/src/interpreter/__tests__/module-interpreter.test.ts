import { Position } from '../..';
import Range from '../../ast/common/range';
import { intType } from '../../ast/common/types';
import { EXPRESSION_INT, EXPRESSION_PANIC } from '../../ast/lang/samlang-expressions';
import {
  SamlangModule,
  ClassDefinition,
  ClassMemberDefinition,
} from '../../ast/lang/samlang-toplevel';
import ModuleInterpreter from '../module-interpreter';

const moduleInterpreter = new ModuleInterpreter();

const moduleEmpty: SamlangModule = {
  imports: [],
  classes: [],
};

const exampleClassDef: ClassDefinition = {
  name: 'class',
  nameRange: new Range(new Position(5, 2), new Position(7, 6)),
  isPublic: true,
  typeParameters: ['param'],
  members: [],
  range: new Range(new Position(1, 10), new Position(3, 4)),
  typeDefinition: {
    range: new Range(new Position(1, 2), new Position(3, 4)),
    type: 'object',
    names: ['types'],
    mappings: {
      types: {
        type: intType,
        isPublic: true,
      },
    },
  },
};

const mainClassDef: ClassDefinition = {
  name: 'Main',
  nameRange: new Range(new Position(5, 2), new Position(7, 6)),
  isPublic: true,
  typeParameters: ['main'],
  members: [],
  range: new Range(new Position(1, 10), new Position(3, 4)),
  typeDefinition: {
    range: new Range(new Position(1, 2), new Position(3, 4)),
    type: 'object',
    names: ['types'],
    mappings: {
      types: {
        type: intType,
        isPublic: true,
      },
    },
  },
};

const memberMainFunctionNoArgs: ClassMemberDefinition = {
  range: new Range(new Position(1, 10), new Position(3, 4)),
  isPublic: true,
  isMethod: false,
  nameRange: new Range(new Position(12, 34), new Position(34, 45)),
  name: 'main',
  typeParameters: ['param'],
  type: {
    type: 'FunctionType',
    argumentTypes: [intType],
    returnType: intType,
  },
  parameters: [],
  body: EXPRESSION_INT(new Range(new Position(123, 45), new Position(145, 89)), BigInt(2)),
};

const memberMainMethodNoArgs: ClassMemberDefinition = {
  ...memberMainFunctionNoArgs,
  isMethod: true,
};

const memberMainMethodPanic: ClassMemberDefinition = {
  ...memberMainFunctionNoArgs,
  body: EXPRESSION_PANIC({
    range: new Range(new Position(12, 34), new Position(34, 45)),
    type: intType,
    expression: EXPRESSION_INT(new Range(new Position(123, 45), new Position(145, 89)), BigInt(2)),
  }),
};

const memberMainFunctionWithArgs: ClassMemberDefinition = {
  ...memberMainFunctionNoArgs,
  parameters: [
    {
      name: 'param',
      nameRange: new Range(new Position(231, 34), new Position(88, 78)),
      type: intType,
      typeRange: new Range(new Position(123, 98), new Position(124, 78)),
    },
  ],
};

const moduleNoMainClass: SamlangModule = {
  imports: [],
  classes: [exampleClassDef],
};

const moduleWithMainClassNoMainFunction: SamlangModule = {
  imports: [],
  classes: [mainClassDef],
};

const moduleWithMainClassAndMainFunctionNoArgs: SamlangModule = {
  imports: [],
  classes: [
    {
      ...mainClassDef,
      members: [memberMainFunctionNoArgs],
    },
  ],
};

const modulePanic: SamlangModule = {
  imports: [],
  classes: [
    {
      ...mainClassDef,
      members: [memberMainMethodPanic],
    },
  ],
};

const moduleWithMainClassAndMainMethodNoArgs: SamlangModule = {
  imports: [],
  classes: [
    {
      ...mainClassDef,
      members: [memberMainMethodNoArgs],
    },
  ],
};

const moduleWithMainClassAndMainFunctionWithArgs: SamlangModule = {
  imports: [],
  classes: [
    {
      ...mainClassDef,
      members: [memberMainFunctionWithArgs],
    },
  ],
};

it('module evaluates correctly', () => {
  expect(moduleInterpreter.eval(moduleEmpty)).toEqual({ type: 'unit' });
  expect(moduleInterpreter.eval(moduleNoMainClass)).toEqual({ type: 'unit' });
  expect(moduleInterpreter.eval(moduleWithMainClassNoMainFunction)).toEqual({ type: 'unit' });
  expect(moduleInterpreter.eval(moduleWithMainClassAndMainFunctionNoArgs)).toEqual(BigInt(2));
  expect(moduleInterpreter.eval(moduleWithMainClassAndMainMethodNoArgs)).toEqual({ type: 'unit' });
  expect(() => moduleInterpreter.eval(modulePanic)).toThrow('Interpreter Error.');
  expect(moduleInterpreter.eval(moduleWithMainClassAndMainFunctionWithArgs)).toEqual({
    type: 'unit',
  });
});

it('module runs correctly', () => {
  expect(moduleInterpreter.run(moduleEmpty)).toEqual('');
  expect(moduleInterpreter.run(moduleNoMainClass)).toEqual('');
  expect(moduleInterpreter.run(moduleWithMainClassNoMainFunction)).toEqual('');
  expect(moduleInterpreter.run(moduleWithMainClassAndMainFunctionNoArgs)).toEqual('');
  expect(moduleInterpreter.run(moduleWithMainClassAndMainMethodNoArgs)).toEqual('');
  expect(moduleInterpreter.run(moduleWithMainClassAndMainFunctionWithArgs)).toEqual('');
  expect(() => moduleInterpreter.run(modulePanic)).toThrow('Interpreter Error.');
});
