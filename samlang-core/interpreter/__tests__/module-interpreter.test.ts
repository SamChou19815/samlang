// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/35

import { ModuleReference, Position, Range } from '../../ast/common-nodes';
import {
  SamlangModule,
  SourceClassDefinition,
  SourceClassMemberDefinition,
  SourceExpressionClassMember,
  SourceExpressionFunctionCall,
  SourceExpressionInt,
  SourceExpressionString,
  SourceId,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { EMPTY, InterpretationContext, Value } from '../expression-interpreter';
import ModuleInterpreter from '../module-interpreter';

describe('module-interpreter', () => {
  const moduleInterpreter = new ModuleInterpreter();

  const moduleEmpty: SamlangModule = {
    imports: [],
    classes: [],
  };

  const exampleClassDef: SourceClassDefinition = {
    associatedComments: [],
    name: 'class',
    nameRange: new Range(Position(5, 2), Position(7, 6)),
    typeParameters: ['param'],
    members: [],
    range: new Range(Position(1, 10), Position(3, 4)),
    typeDefinition: {
      range: new Range(Position(1, 2), Position(3, 4)),
      type: 'object',
      names: ['types'],
      mappings: {
        types: {
          type: SourceIntType,
          isPublic: true,
        },
      },
    },
  };

  const mainClassDef: SourceClassDefinition = {
    associatedComments: [],
    name: 'Main',
    nameRange: new Range(Position(5, 2), Position(7, 6)),
    typeParameters: ['main'],
    members: [],
    range: new Range(Position(1, 10), Position(3, 4)),
    typeDefinition: {
      range: new Range(Position(1, 2), Position(3, 4)),
      type: 'object',
      names: ['types'],
      mappings: {
        types: {
          type: SourceIntType,
          isPublic: true,
        },
      },
    },
  };
  const mainVariantDef: SourceClassDefinition = {
    associatedComments: [],
    name: 'Main',
    nameRange: new Range(Position(5, 2), Position(7, 6)),
    typeParameters: ['main'],
    members: [],
    range: new Range(Position(1, 10), Position(3, 4)),
    typeDefinition: {
      range: new Range(Position(1, 2), Position(3, 4)),
      type: 'variant',
      names: ['types'],
      mappings: {
        types: {
          type: SourceIntType,
          isPublic: true,
        },
      },
    },
  };

  const memberMainFunctionNoArgs: SourceClassMemberDefinition = {
    associatedComments: [],
    range: new Range(Position(1, 10), Position(3, 4)),
    isPublic: true,
    isMethod: false,
    nameRange: new Range(Position(12, 34), Position(34, 45)),
    name: 'main',
    typeParameters: ['param'],
    type: {
      type: 'FunctionType',
      argumentTypes: [SourceIntType],
      returnType: SourceIntType,
    },
    parameters: [],
    body: SourceExpressionInt(2, new Range(Position(123, 45), Position(145, 89))),
  };

  const memberMainFunctionNoArgsPrint: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    body: SourceExpressionFunctionCall({
      range: new Range(Position(12, 34), Position(34, 45)),
      type: SourceIntType,
      functionExpression: SourceExpressionClassMember({
        type: SourceIntType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('println'),
      }),
      functionArguments: [
        SourceExpressionString('Hello world', new Range(Position(183, 23), Position(203, 21))),
      ],
    }),
  };

  const memberMainMethodNoArgs: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    isMethod: true,
  };

  const memberMainMethodPanic: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    body: SourceExpressionFunctionCall({
      range: new Range(Position(12, 34), Position(34, 45)),
      type: SourceIntType,
      functionExpression: SourceExpressionClassMember({
        type: SourceIntType,
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('panic'),
      }),
      functionArguments: [SourceExpressionInt(2, new Range(Position(123, 45), Position(145, 89)))],
    }),
  };

  const memberMainFunctionWithArgs: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    parameters: [
      {
        name: 'param',
        nameRange: new Range(Position(231, 34), Position(88, 78)),
        type: SourceIntType,
        typeRange: new Range(Position(123, 98), Position(124, 78)),
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

  const modulePrint: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainFunctionNoArgsPrint],
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
    expect(moduleInterpreter.eval(moduleWithMainClassAndMainFunctionNoArgs)).toEqual(2);
    expect(moduleInterpreter.eval(moduleWithMainClassAndMainMethodNoArgs)).toEqual({
      type: 'unit',
    });
    expect(() => moduleInterpreter.eval(modulePanic)).toThrow('Interpreter Error.');
    expect(moduleInterpreter.eval(moduleWithMainClassAndMainFunctionWithArgs)).toEqual({
      type: 'unit',
    });
  });

  it('synthetic functions setup correctly', () => {
    (
      moduleInterpreter.evalContext(mainClassDef, EMPTY).classes.Main?.functions.init?.body as (
        c: InterpretationContext
      ) => Value
    )({ ...EMPTY, localValues: { types: 1 } });
    (
      moduleInterpreter.evalContext(mainVariantDef, EMPTY).classes.Main?.functions.types?.body as (
        c: InterpretationContext
      ) => Value
    )({ ...EMPTY, localValues: { data: 1 } });
  });

  it('module runs correctly', () => {
    expect(moduleInterpreter.run(moduleEmpty)).toEqual('');
    expect(moduleInterpreter.run(moduleNoMainClass)).toEqual('');
    expect(moduleInterpreter.run(moduleWithMainClassNoMainFunction)).toEqual('');
    expect(moduleInterpreter.run(moduleWithMainClassAndMainFunctionNoArgs)).toEqual('');
    expect(moduleInterpreter.run(moduleWithMainClassAndMainMethodNoArgs)).toEqual('');
    expect(moduleInterpreter.run(moduleWithMainClassAndMainFunctionWithArgs)).toEqual('');
    expect(() => moduleInterpreter.run(modulePanic)).toThrow('Interpreter Error.');
    expect(moduleInterpreter.run(modulePrint)).toEqual('Hello world\n');
  });
});
