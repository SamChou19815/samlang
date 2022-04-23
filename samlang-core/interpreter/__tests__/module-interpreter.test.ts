// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/35

import { DummySourceReason, Location, ModuleReference, Position } from '../../ast/common-nodes';
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
    interfaces: [],
  };

  const exampleClassDef: SourceClassDefinition = {
    associatedComments: [],
    name: SourceId('class', {
      location: new Location(ModuleReference.DUMMY, Position(5, 2), Position(7, 6)),
    }),
    typeParameters: [SourceId('param')],
    members: [],
    location: new Location(ModuleReference.DUMMY, Position(1, 10), Position(3, 4)),
    typeDefinition: {
      location: new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
      type: 'object',
      names: [SourceId('types')],
      mappings: {
        types: {
          type: SourceIntType(DummySourceReason),
          isPublic: true,
        },
      },
    },
  };

  const mainClassDef: SourceClassDefinition = {
    associatedComments: [],
    name: SourceId('Main', {
      location: new Location(ModuleReference.DUMMY, Position(5, 2), Position(7, 6)),
    }),
    typeParameters: [SourceId('main')],
    members: [],
    location: new Location(ModuleReference.DUMMY, Position(1, 10), Position(3, 4)),
    typeDefinition: {
      location: new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
      type: 'object',
      names: [SourceId('types')],
      mappings: {
        types: {
          type: SourceIntType(DummySourceReason),
          isPublic: true,
        },
      },
    },
  };
  const mainVariantDef: SourceClassDefinition = {
    associatedComments: [],
    name: SourceId('Main', {
      location: new Location(ModuleReference.DUMMY, Position(5, 2), Position(7, 6)),
    }),
    typeParameters: [SourceId('main')],
    members: [],
    location: new Location(ModuleReference.DUMMY, Position(1, 10), Position(3, 4)),
    typeDefinition: {
      location: new Location(ModuleReference.DUMMY, Position(1, 2), Position(3, 4)),
      type: 'variant',
      names: [SourceId('types')],
      mappings: {
        types: {
          type: SourceIntType(DummySourceReason),
          isPublic: true,
        },
      },
    },
  };

  const memberMainFunctionNoArgs: SourceClassMemberDefinition = {
    associatedComments: [],
    location: new Location(ModuleReference.DUMMY, Position(1, 10), Position(3, 4)),
    isPublic: true,
    isMethod: false,
    name: SourceId('main', {
      location: new Location(ModuleReference.DUMMY, Position(12, 34), Position(34, 45)),
    }),
    typeParameters: [SourceId('param')],
    type: {
      __type__: 'FunctionType',
      reason: DummySourceReason,
      argumentTypes: [SourceIntType(DummySourceReason)],
      returnType: SourceIntType(DummySourceReason),
    },
    parameters: [],
    body: SourceExpressionInt(
      2,
      new Location(ModuleReference.DUMMY, Position(123, 45), Position(145, 89))
    ),
  };

  const memberMainFunctionNoArgsPrint: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    body: SourceExpressionFunctionCall({
      location: new Location(ModuleReference.DUMMY, Position(12, 34), Position(34, 45)),
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: SourceIntType(DummySourceReason),
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('println'),
      }),
      functionArguments: [
        SourceExpressionString(
          'Hello world',
          new Location(ModuleReference.DUMMY, Position(183, 23), Position(203, 21))
        ),
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
      location: new Location(ModuleReference.DUMMY, Position(12, 34), Position(34, 45)),
      type: SourceIntType(DummySourceReason),
      functionExpression: SourceExpressionClassMember({
        type: SourceIntType(DummySourceReason),
        typeArguments: [],
        moduleReference: ModuleReference.ROOT,
        className: SourceId('Builtins'),
        memberName: SourceId('panic'),
      }),
      functionArguments: [
        SourceExpressionInt(
          2,
          new Location(ModuleReference.DUMMY, Position(123, 45), Position(145, 89))
        ),
      ],
    }),
  };

  const memberMainFunctionWithArgs: SourceClassMemberDefinition = {
    ...memberMainFunctionNoArgs,
    parameters: [
      {
        name: 'param',
        nameLocation: new Location(ModuleReference.DUMMY, Position(231, 34), Position(88, 78)),
        type: SourceIntType(DummySourceReason),
        typeLocation: new Location(ModuleReference.DUMMY, Position(123, 98), Position(124, 78)),
      },
    ],
  };

  const moduleNoMainClass: SamlangModule = {
    imports: [],
    classes: [exampleClassDef],
    interfaces: [],
  };

  const moduleWithMainClassNoMainFunction: SamlangModule = {
    imports: [],
    classes: [mainClassDef],
    interfaces: [],
  };

  const moduleWithMainClassAndMainFunctionNoArgs: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainFunctionNoArgs],
      },
    ],
    interfaces: [],
  };

  const modulePanic: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainMethodPanic],
      },
    ],
    interfaces: [],
  };

  const modulePrint: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainFunctionNoArgsPrint],
      },
    ],
    interfaces: [],
  };

  const moduleWithMainClassAndMainMethodNoArgs: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainMethodNoArgs],
      },
    ],
    interfaces: [],
  };

  const moduleWithMainClassAndMainFunctionWithArgs: SamlangModule = {
    imports: [],
    classes: [
      {
        ...mainClassDef,
        members: [memberMainFunctionWithArgs],
      },
    ],
    interfaces: [],
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
      moduleInterpreter.evalContext(mainClassDef, EMPTY).classes.get('Main')?.functions.get('init')
        ?.body as (c: InterpretationContext) => Value
    )({ ...EMPTY, localValues: new Map([['types', 1]]) });
    (
      moduleInterpreter
        .evalContext(mainVariantDef, EMPTY)
        .classes.get('Main')
        ?.functions.get('types')?.body as (c: InterpretationContext) => Value
    )({ ...EMPTY, localValues: new Map([['data', 1]]) });
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
