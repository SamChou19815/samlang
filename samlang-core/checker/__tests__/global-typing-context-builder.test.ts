import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import type { SamlangModule, SourceClassDefinition } from '../../ast/samlang-nodes';
import {
  prettyPrintType,
  SamlangIdentifierType,
  SourceExpressionFalse,
  SourceFunctionType,
  SourceId,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import {
  buildGlobalTypingContext,
  getFullyInlinedInterfaceContext,
} from '../global-typing-context-builder';
import { GlobalTypingContext, memberTypeInformationToString } from '../typing-context';

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
    const actualGlobalTypingContext = buildGlobalTypingContext(
      testSources,
      createGlobalErrorCollector().getErrorReporter(),
      {
        classes: new Map(),
        interfaces: new Map(),
      },
    );
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

  it('getFullyInlinedInterfaceContext tests', () => {
    const globalTypingContext: GlobalTypingContext = ModuleReferenceCollections.hashMapOf([
      ModuleReference.DUMMY,
      {
        interfaces: new Map([
          [
            'IUseNonExistent',
            {
              typeParameters: [
                { name: 'A', bound: null },
                { name: 'B', bound: null },
              ],
              extendsOrImplements: SourceIdentifierType(
                DummySourceReason,
                ModuleReference.DUMMY,
                'not_exist',
              ),
              superTypes: [],
              functions: new Map(),
              methods: new Map(),
            },
          ],
          [
            'IBase',
            {
              typeParameters: [
                { name: 'A', bound: null },
                { name: 'B', bound: null },
              ],
              extendsOrImplements: null,
              superTypes: [],
              functions: new Map(),
              methods: new Map([
                [
                  'm1',
                  {
                    isPublic: true,
                    typeParameters: [{ name: 'C', bound: null }],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                      ],
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                    ),
                  },
                ],
              ]),
            },
          ],
          [
            'ILevel1',
            {
              typeParameters: [
                { name: 'A', bound: null },
                { name: 'B', bound: null },
              ],
              extendsOrImplements: SourceIdentifierType(
                DummySourceReason,
                ModuleReference.DUMMY,
                'IBase',
                [
                  SourceIntType(DummySourceReason),
                  SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                ],
              ),
              superTypes: [],
              functions: new Map([
                [
                  'f1',
                  {
                    isPublic: true,
                    typeParameters: [{ name: 'C', bound: null }],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                      ],
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                    ),
                  },
                ],
              ]),
              methods: new Map(),
            },
          ],
          [
            'ILevel2',
            {
              typeParameters: [
                { name: 'A', bound: null },
                { name: 'B', bound: null },
              ],
              extendsOrImplements: SourceIdentifierType(
                DummySourceReason,
                ModuleReference.DUMMY,
                'ILevel1',
                [
                  SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                  SourceIntType(DummySourceReason),
                ],
              ),
              superTypes: [],
              functions: new Map(),
              methods: new Map([
                [
                  'm2',
                  {
                    isPublic: true,
                    typeParameters: [{ name: 'C', bound: null }],
                    type: SourceFunctionType(
                      DummySourceReason,
                      [
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'A'),
                        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'B'),
                      ],
                      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'C'),
                    ),
                  },
                ],
              ]),
            },
          ],
          [
            'ICyclic1',
            {
              typeParameters: [],
              extendsOrImplements: SourceIdentifierType(
                DummySourceReason,
                ModuleReference.DUMMY,
                'ICyclic2',
              ),
              superTypes: [],
              functions: new Map(),
              methods: new Map(),
            },
          ],
          [
            'ICyclic2',
            {
              typeParameters: [],
              extendsOrImplements: SourceIdentifierType(
                DummySourceReason,
                ModuleReference.DUMMY,
                'ICyclic1',
              ),
              superTypes: [],
              functions: new Map(),
              methods: new Map(),
            },
          ],
        ]),
        classes: new Map(),
      },
    ]);

    function inlinedContextFromType(idType: SamlangIdentifierType) {
      const { functions, methods, superTypes } = getFullyInlinedInterfaceContext(
        idType,
        globalTypingContext,
        createGlobalErrorCollector().getErrorReporter(),
      );
      const functionStrings: string[] = [];
      const methodStrings: string[] = [];
      for (const [name, info] of functions) {
        functionStrings.push(memberTypeInformationToString(name, info));
      }
      for (const [name, info] of methods) {
        methodStrings.push(memberTypeInformationToString(name, info));
      }
      return {
        functions: functionStrings,
        methods: methodStrings,
        superTypes: superTypes.map((it) => prettyPrintType(it)),
      };
    }

    expect(
      inlinedContextFromType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'I_not_exist'),
      ),
    ).toEqual({
      functions: [],
      methods: [],
      superTypes: [],
    });

    expect(
      inlinedContextFromType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'IUseNonExistent'),
      ),
    ).toEqual({
      functions: [],
      methods: [],
      superTypes: ['not_exist'],
    });
    expect(
      inlinedContextFromType(SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'I')),
    ).toEqual({
      functions: [],
      methods: [],
      superTypes: [],
    });
    expect(
      inlinedContextFromType(
        SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ILevel2'),
      ),
    ).toEqual({
      functions: ['public f1<C>(A, B) -> C'],
      methods: ['public m1<C>(int, int) -> C', 'public m2<C>(A, B) -> C'],
      superTypes: ['IBase<int, int>', 'ILevel1<A, int>'],
    });

    const errorCollector = createGlobalErrorCollector();
    const errorReporter = errorCollector.getErrorReporter();
    getFullyInlinedInterfaceContext(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic1'),
      globalTypingContext,
      errorReporter,
    );
    getFullyInlinedInterfaceContext(
      SourceIdentifierType(DummySourceReason, ModuleReference.DUMMY, 'ICyclic2'),
      globalTypingContext,
      errorReporter,
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([
      '__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic1` has a cyclic definition.',
      '__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic2` has a cyclic definition.',
    ]);
  });
});
