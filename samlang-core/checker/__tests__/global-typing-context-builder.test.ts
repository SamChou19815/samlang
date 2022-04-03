import {
  DummySourceReason,
  ModuleReference,
  ModuleReferenceCollections,
  Range,
} from '../../ast/common-nodes';
import type { SamlangModule, SourceClassDefinition } from '../../ast/samlang-nodes';
import {
  SourceExpressionFalse,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
import {
  buildGlobalTypingContext,
  updateGlobalTypingContext,
} from '../global-typing-context-builder';

const module0Reference = ModuleReference(['Module0']);
const module1Reference = ModuleReference(['Module1']);

const typeDefinition = {
  range: Range.DUMMY,
  type: 'object',
  names: [],
  mappings: {},
} as const;

const class0: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: SourceId('Class0'),
  typeParameters: [],
  typeDefinition,
  members: [],
};
const class1: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: SourceId('Class1'),
  typeParameters: [],
  typeDefinition,
  members: [
    {
      associatedComments: [],
      range: Range.DUMMY,
      isPublic: true,
      isMethod: true,
      name: SourceId('m1'),
      typeParameters: [],
      type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
      parameters: [],
      body: SourceExpressionFalse(),
    },
    {
      associatedComments: [],
      range: Range.DUMMY,
      isPublic: false,
      isMethod: false,
      name: SourceId('f1'),
      typeParameters: [],
      type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
      parameters: [],
      body: SourceExpressionFalse(),
    },
  ],
};
const class2: SourceClassDefinition = {
  range: Range.DUMMY,
  associatedComments: [],
  name: SourceId('Class2'),
  typeParameters: [],
  typeDefinition,
  members: [],
};

const module0: SamlangModule = { imports: [], classes: [class0], interfaces: [] };
const module1: SamlangModule = {
  imports: [
    {
      range: Range.DUMMY,
      importedModule: module0Reference,
      importedModuleRange: Range.DUMMY,
      importedMembers: [SourceId('Class0'), SourceId('BAD_CLASS_THAT_DOESNT_EXIST')],
    },
  ],
  classes: [class1, class2],
  interfaces: [],
};

const testSources = ModuleReferenceCollections.mapOf(
  [module0Reference, module0],
  [module1Reference, module1]
);

describe('global-typing-context-builder', () => {
  it('can handle imports and definitions', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {
      classes: {},
      interfaces: {},
    });
    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      interfaces: {},
      classes: {
        Class0: {
          typeParameters: [],
          typeDefinition,
          functions: {
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module0Reference, 'Class0', [])
              ),
              typeParameters: [],
            },
          },
          methods: {},
        },
      },
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      interfaces: {},
      classes: {
        Class1: {
          typeParameters: [],
          typeDefinition,
          functions: {
            f1: {
              isPublic: false,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class1', [])
              ),
              typeParameters: [],
            },
          },
          methods: {
            m1: {
              isPublic: true,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
          },
        },
        Class2: {
          typeParameters: [],
          typeDefinition,
          functions: {
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class2', [])
              ),
              typeParameters: [],
            },
          },
          methods: {},
        },
      },
    });
  });

  it('can handle incremental add', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {
      classes: {},
      interfaces: {},
    });
    updateGlobalTypingContext(
      actualGlobalTypingContext,
      ModuleReferenceCollections.mapOf(
        [module0Reference, module0],
        [module1Reference, { ...module1, classes: [class1, class2] }]
      ),
      [module0Reference, module1Reference]
    );

    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      interfaces: {},
      classes: {
        Class0: {
          typeParameters: [],
          typeDefinition,
          functions: {
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module0Reference, 'Class0', [])
              ),
              typeParameters: [],
            },
          },
          methods: {},
        },
      },
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      interfaces: {},
      classes: {
        Class1: {
          typeParameters: [],
          typeDefinition,
          functions: {
            f1: {
              isPublic: false,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class1', [])
              ),
              typeParameters: [],
            },
          },
          methods: {
            m1: {
              isPublic: true,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
          },
        },
        Class2: {
          typeParameters: [],
          typeDefinition,
          functions: {
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class2', [])
              ),
              typeParameters: [],
            },
          },
          methods: {},
        },
      },
    });
  });

  it('can handle incremental update', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {
      classes: {},
      interfaces: {},
    });
    updateGlobalTypingContext(
      actualGlobalTypingContext,
      ModuleReferenceCollections.mapOf(
        [module0Reference, { imports: [], classes: [], interfaces: [] }],
        [module1Reference, module1]
      ),
      [module0Reference, module1Reference]
    );

    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      interfaces: {},
      classes: {},
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      interfaces: {},
      classes: {
        Class1: {
          typeParameters: [],
          typeDefinition,
          functions: {
            f1: {
              isPublic: false,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class1', [])
              ),
              typeParameters: [],
            },
          },
          methods: {
            m1: {
              isPublic: true,
              type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
              typeParameters: [],
            },
          },
        },
        Class2: {
          typeParameters: [],
          typeDefinition,
          functions: {
            init: {
              isPublic: true,
              type: SourceFunctionType(
                DummySourceReason,
                [],
                SourceIdentifierType(DummySourceReason, module1Reference, 'Class2', [])
              ),
              typeParameters: [],
            },
          },
          methods: {},
        },
      },
    });
  });

  it('can handle incremental removal', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {
      classes: {},
      interfaces: {},
    });
    updateGlobalTypingContext(
      actualGlobalTypingContext,
      ModuleReferenceCollections.mapOf([module1Reference, module1]),
      [module0Reference, module1Reference]
    );
    expect(actualGlobalTypingContext.size).toBe(2);
  });
});
