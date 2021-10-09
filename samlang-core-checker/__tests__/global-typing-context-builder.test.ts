import { functionType, intType, Range, ModuleReference } from 'samlang-core-ast/common-nodes';
import { SourceExpressionFalse } from 'samlang-core-ast/samlang-nodes';
import type { SourceClassDefinition, SamlangModule } from 'samlang-core-ast/samlang-nodes';
import { mapOf } from 'samlang-core/utils';

import {
  buildGlobalTypingContext,
  updateGlobalTypingContext,
} from '../global-typing-context-builder';

const module0Reference = new ModuleReference(['Module0']);
const module1Reference = new ModuleReference(['Module1']);

const typeDefinition = {
  range: Range.DUMMY,
  type: 'object',
  names: [],
  mappings: {},
} as const;

const class0: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: 'Class0',
  nameRange: Range.DUMMY,
  typeParameters: [],
  typeDefinition,
  members: [],
};
const class1: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: 'Class1',
  nameRange: Range.DUMMY,
  typeParameters: [],
  typeDefinition,
  members: [
    {
      associatedComments: [],
      range: Range.DUMMY,
      isPublic: true,
      isMethod: true,
      nameRange: Range.DUMMY,
      name: 'm1',
      typeParameters: [],
      type: functionType([], intType),
      parameters: [],
      body: SourceExpressionFalse(),
    },
    {
      associatedComments: [],
      range: Range.DUMMY,
      isPublic: false,
      isMethod: false,
      nameRange: Range.DUMMY,
      name: 'f1',
      typeParameters: [],
      type: functionType([], intType),
      parameters: [],
      body: SourceExpressionFalse(),
    },
  ],
};
const class2: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: 'Class2',
  nameRange: Range.DUMMY,
  typeParameters: [],
  typeDefinition,
  members: [],
};

const module0: SamlangModule = { imports: [], classes: [class0] };
const module1: SamlangModule = {
  imports: [
    {
      range: Range.DUMMY,
      importedModule: module0Reference,
      importedModuleRange: Range.DUMMY,
      importedMembers: [
        ['Class0', Range.DUMMY],
        ['BAD_CLASS_THAT_DOESNT_EXIST', Range.DUMMY],
      ],
    },
  ],
  classes: [class1, class2],
};

const testSources = mapOf([module0Reference, module0], [module1Reference, module1]);

describe('global-typing-context-builder', () => {
  it('can handle imports and definitions', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {});
    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      Class0: { typeParameters: [], typeDefinition, functions: {}, methods: {} },
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      Class1: {
        typeParameters: [],
        typeDefinition,
        functions: {
          f1: { isPublic: false, type: functionType([], intType), typeParameters: [] },
        },
        methods: {
          m1: { isPublic: true, type: functionType([], intType), typeParameters: [] },
        },
      },
      Class2: {
        typeParameters: [],
        typeDefinition,
        functions: {},
        methods: {},
      },
    });
  });

  it('can handle incremental add', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {});
    updateGlobalTypingContext(
      actualGlobalTypingContext,
      mapOf(
        [module0Reference, module0],
        [module1Reference, { ...module1, classes: [class1, class2] }]
      ),
      [module0Reference, module1Reference]
    );

    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      Class0: { typeParameters: [], typeDefinition, functions: {}, methods: {} },
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      Class1: {
        typeParameters: [],
        typeDefinition,
        functions: {
          f1: { isPublic: false, type: functionType([], intType), typeParameters: [] },
        },
        methods: {
          m1: { isPublic: true, type: functionType([], intType), typeParameters: [] },
        },
      },
      Class2: { typeParameters: [], typeDefinition, functions: {}, methods: {} },
    });
  });

  it('can handle incremental update', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {});
    updateGlobalTypingContext(
      actualGlobalTypingContext,
      mapOf([module0Reference, { imports: [], classes: [] }], [module1Reference, module1]),
      [module0Reference, module1Reference]
    );

    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({});
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      Class1: {
        typeParameters: [],
        typeDefinition,
        functions: {
          f1: { isPublic: false, type: functionType([], intType), typeParameters: [] },
        },
        methods: {
          m1: { isPublic: true, type: functionType([], intType), typeParameters: [] },
        },
      },
      Class2: {
        typeParameters: [],
        typeDefinition,
        functions: {},
        methods: {},
      },
    });
  });

  it('can handle incremental removal', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {});
    updateGlobalTypingContext(actualGlobalTypingContext, mapOf([module1Reference, module1]), [
      module0Reference,
      module1Reference,
    ]);
    expect(actualGlobalTypingContext.size).toBe(2);
  });
});
