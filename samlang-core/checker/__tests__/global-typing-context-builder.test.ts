import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import type { SamlangModule, SourceClassDefinition } from '../../ast/samlang-nodes';
import {
  SourceExpressionFalse,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { buildGlobalTypingContext } from '../global-typing-context-builder';

const module0Reference = ModuleReference(['Module0']);
const module1Reference = ModuleReference(['Module1']);

const typeDefinition = {
  location: Location.DUMMY,
  type: 'object',
  names: [],
  mappings: {},
} as const;

const class0: SourceClassDefinition = {
  location: Location.DUMMY,
  associatedComments: [],
  name: SourceId('Class0'),
  typeParameters: [],
  typeDefinition,
  members: [],
};
const class1: SourceClassDefinition = {
  location: Location.DUMMY,
  associatedComments: [],
  name: SourceId('Class1'),
  typeParameters: [],
  typeDefinition,
  members: [
    {
      associatedComments: [],
      location: Location.DUMMY,
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
      location: Location.DUMMY,
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
  location: Location.DUMMY,
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
      location: Location.DUMMY,
      importedModule: module0Reference,
      importedModuleLocation: Location.DUMMY,
      importedMembers: [SourceId('Class0'), SourceId('BAD_CLASS_THAT_DOESNT_EXIST')],
    },
  ],
  classes: [class1, class2],
  interfaces: [],
};

const testSources = ModuleReferenceCollections.mapOf(
  [module0Reference, module0],
  [module1Reference, module1],
);

describe('global-typing-context-builder', () => {
  it('can handle imports and definitions', () => {
    const actualGlobalTypingContext = buildGlobalTypingContext(testSources, {
      classes: new Map(),
      interfaces: new Map(),
    });
    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      interfaces: new Map(),
      classes: new Map([
        [
          'Class0',
          {
            typeParameters: [],
            typeDefinition,
            extendsOrImplements: null,
            superTypes: [],
            functions: new Map([
              [
                'init',
                {
                  isPublic: true,
                  type: SourceFunctionType(
                    DummySourceReason,
                    [],
                    SourceIdentifierType(DummySourceReason, module0Reference, 'Class0', []),
                  ),
                  typeParameters: [],
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
    });
    expect(actualGlobalTypingContext.get(module1Reference)).toStrictEqual({
      interfaces: new Map(),
      classes: new Map([
        [
          'Class1',
          {
            typeParameters: [],
            typeDefinition,
            extendsOrImplements: null,
            superTypes: [],
            functions: new Map([
              [
                'f1',
                {
                  isPublic: false,
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                  typeParameters: [],
                },
              ],
              [
                'init',
                {
                  isPublic: true,
                  type: SourceFunctionType(
                    DummySourceReason,
                    [],
                    SourceIdentifierType(DummySourceReason, module1Reference, 'Class1', []),
                  ),
                  typeParameters: [],
                },
              ],
            ]),
            methods: new Map([
              [
                'm1',
                {
                  isPublic: true,
                  type: SourceFunctionType(DummySourceReason, [], SourceIntType(DummySourceReason)),
                  typeParameters: [],
                },
              ],
            ]),
          },
        ],
        [
          'Class2',
          {
            typeParameters: [],
            typeDefinition,
            extendsOrImplements: null,
            superTypes: [],
            functions: new Map([
              [
                'init',
                {
                  isPublic: true,
                  type: SourceFunctionType(
                    DummySourceReason,
                    [],
                    SourceIdentifierType(DummySourceReason, module1Reference, 'Class2', []),
                  ),
                  typeParameters: [],
                },
              ],
            ]),
            methods: new Map(),
          },
        ],
      ]),
    });
  });
});
