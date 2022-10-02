import {
  DummySourceReason,
  Location,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import {
  AstBuilder,
  prettyPrintType,
  SamlangIdentifierType,
  SamlangModule,
  SourceId,
  SourceIdentifierType,
  TypeDefinition,
  TypeParameterSignature,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import {
  buildGlobalTypingContext,
  getFullyInlinedMultipleInterfaceContext,
} from '../global-typing-context-builder';
import type { MemberTypeInformation, TypeDefinitionTypingContext } from '../typing-context';
import { memberTypeInformationToString } from '../typing-context';

describe('global-typing-context-builder', () => {
  it('can handle imports and definitions', () => {
    const module0Reference = ModuleReference(['Module0']);
    const module1Reference = ModuleReference(['Module1']);

    const testSources = ModuleReferenceCollections.mapOf<SamlangModule>(
      [
        module0Reference,
        {
          imports: [],
          classes: [
            {
              location: Location.DUMMY,
              associatedComments: [],
              name: SourceId('Class0'),
              typeParameters: [],
              typeDefinition: {
                location: Location.DUMMY,
                type: 'object',
                names: [],
                mappings: new Map(),
              },
              extendsOrImplementsNodes: [],
              members: [],
            },
          ],
          interfaces: [],
        },
      ],
      [
        module1Reference,
        {
          imports: [
            {
              location: Location.DUMMY,
              importedModule: module0Reference,
              importedModuleLocation: Location.DUMMY,
              importedMembers: [SourceId('Class0'), SourceId('BAD_CLASS_THAT_DOESNT_EXIST')],
            },
          ],
          classes: [
            {
              location: Location.DUMMY,
              associatedComments: [],
              name: SourceId('Class1'),
              typeParameters: [],
              typeDefinition: {
                location: Location.DUMMY,
                type: 'object',
                names: [],
                mappings: new Map(),
              },
              extendsOrImplementsNodes: [],
              members: [
                {
                  associatedComments: [],
                  location: Location.DUMMY,
                  isPublic: true,
                  isMethod: true,
                  name: SourceId('m1'),
                  typeParameters: [],
                  type: AstBuilder.FunType([], AstBuilder.IntType),
                  parameters: [],
                  body: AstBuilder.FALSE,
                },
                {
                  associatedComments: [],
                  location: Location.DUMMY,
                  isPublic: false,
                  isMethod: false,
                  name: SourceId('f1'),
                  typeParameters: [],
                  type: AstBuilder.FunType([], AstBuilder.IntType),
                  parameters: [],
                  body: AstBuilder.FALSE,
                },
              ],
            },
            {
              location: Location.DUMMY,
              associatedComments: [],
              name: SourceId('Class2'),
              typeParameters: [],
              typeDefinition: {
                location: Location.DUMMY,
                type: 'object',
                names: [],
                mappings: new Map(),
              },
              extendsOrImplementsNodes: [],
              members: [],
            },
          ],
          interfaces: [],
        },
      ],
    );

    const actualGlobalTypingContext = buildGlobalTypingContext(
      testSources,
      createGlobalErrorCollector().getErrorReporter(),
      {
        typeDefinitions: new Map(),
        interfaces: new Map(),
      },
    );
    expect(actualGlobalTypingContext.size).toBe(3);

    expect(actualGlobalTypingContext.get(module0Reference)).toStrictEqual({
      typeDefinitions: new Map([['Class0', { type: 'object', names: [], mappings: new Map() }]]),
      interfaces: new Map([
        [
          'Class0',
          {
            isConcrete: true,
            typeParameters: [],
            superTypes: [],
            functions: new Map([
              [
                'init',
                {
                  isPublic: true,
                  type: AstBuilder.FunType(
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
      typeDefinitions: new Map([
        ['Class1', { type: 'object', names: [], mappings: new Map() }],
        ['Class2', { type: 'object', names: [], mappings: new Map() }],
      ]),
      interfaces: new Map([
        [
          'Class1',
          {
            isConcrete: true,
            typeParameters: [],
            superTypes: [],
            functions: new Map([
              [
                'f1',
                {
                  isPublic: false,
                  type: AstBuilder.FunType([], AstBuilder.IntType),
                  typeParameters: [],
                },
              ],
              [
                'init',
                {
                  isPublic: true,
                  type: AstBuilder.FunType(
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
                  type: AstBuilder.FunType([], AstBuilder.IntType),
                  typeParameters: [],
                },
              ],
            ]),
          },
        ],
        [
          'Class2',
          {
            isConcrete: true,
            typeParameters: [],
            superTypes: [],
            functions: new Map([
              [
                'init',
                {
                  isPublic: true,
                  type: AstBuilder.FunType(
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

  it('getFullyInlinedMultipleInterfaceContext tests', () => {
    interface UnoptimizedInterfaceTypingContext {
      readonly functions: ReadonlyMap<string, MemberTypeInformation>;
      readonly methods: ReadonlyMap<string, MemberTypeInformation>;
      readonly typeParameters: readonly TypeParameterSignature[];
      readonly extendsOrImplements: readonly SamlangIdentifierType[];
    }

    interface UnoptimizedClassTypingContext extends UnoptimizedInterfaceTypingContext {
      readonly typeDefinition: TypeDefinition;
    }

    interface UnoptimizedModuleTypingContext {
      readonly typeDefinitions: ReadonlyMap<string, TypeDefinitionTypingContext>;
      readonly interfaces: ReadonlyMap<string, UnoptimizedInterfaceTypingContext>;
      readonly classes: ReadonlyMap<string, UnoptimizedClassTypingContext>;
    }

    const globalTypingContext =
      ModuleReferenceCollections.hashMapOf<UnoptimizedModuleTypingContext>([
        ModuleReference.DUMMY,
        {
          typeDefinitions: new Map(),
          interfaces: new Map([
            [
              'IUseNonExistent',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: [AstBuilder.IdType('not_exist')],
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
                extendsOrImplements: [],
                functions: new Map(),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: AstBuilder.IdType('A') }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                        AstBuilder.IdType('C'),
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
                extendsOrImplements: [
                  AstBuilder.IdType('IBase', [AstBuilder.IntType, AstBuilder.IdType('B')]),
                ],
                functions: new Map([
                  [
                    'f1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                        AstBuilder.IdType('C'),
                      ),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm1',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: AstBuilder.IdType('A') }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                        AstBuilder.IdType('C'),
                      ),
                    },
                  ],
                ]),
              },
            ],
            [
              'ILevel2',
              {
                typeParameters: [
                  { name: 'A', bound: null },
                  { name: 'B', bound: null },
                ],
                extendsOrImplements: [
                  AstBuilder.IdType('ILevel1', [AstBuilder.IdType('A'), AstBuilder.IntType]),
                ],
                functions: new Map(),
                methods: new Map([
                  [
                    'm2',
                    {
                      isPublic: true,
                      typeParameters: [{ name: 'C', bound: null }],
                      type: AstBuilder.FunType(
                        [AstBuilder.IdType('A'), AstBuilder.IdType('B')],
                        AstBuilder.IdType('C'),
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
                extendsOrImplements: [AstBuilder.IdType('ICyclic2')],
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'ICyclic2',
              {
                typeParameters: [],
                extendsOrImplements: [AstBuilder.IdType('ICyclic1')],
                functions: new Map(),
                methods: new Map(),
              },
            ],
            [
              'ConflictExtends1',
              {
                typeParameters: [],
                extendsOrImplements: [],
                functions: new Map([
                  [
                    'f',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
              },
            ],
            [
              'ConflictExtends2',
              {
                typeParameters: [],
                extendsOrImplements: [],
                functions: new Map([
                  [
                    'f',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.IntType),
                    },
                  ],
                ]),
                methods: new Map([
                  [
                    'm',
                    {
                      isPublic: true,
                      typeParameters: [],
                      type: AstBuilder.FunType([], AstBuilder.BoolType),
                    },
                  ],
                ]),
              },
            ],
          ]),
          classes: new Map(),
        },
      ]);

    function inlinedContextFromType(...idTypes: readonly SamlangIdentifierType[]) {
      const { functions, methods, superTypes } = getFullyInlinedMultipleInterfaceContext(
        idTypes,
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

    expect(inlinedContextFromType(AstBuilder.IdType('I_not_exist'))).toEqual({
      functions: [],
      methods: [],
      superTypes: [],
    });

    expect(inlinedContextFromType(AstBuilder.IdType('IUseNonExistent'))).toEqual({
      functions: [],
      methods: [],
      superTypes: ['not_exist', 'IUseNonExistent'],
    });
    expect(inlinedContextFromType(AstBuilder.IdType('I'))).toEqual({
      functions: [],
      methods: [],
      superTypes: [],
    });
    expect(inlinedContextFromType(AstBuilder.IdType('ILevel2'))).toEqual({
      functions: ['public f1<C>(A, B) -> C'],
      methods: ['public m1<C: A>(A, int) -> C', 'public m2<C>(A, B) -> C'],
      superTypes: ['IBase<int, int>', 'ILevel1<A, int>', 'ILevel2'],
    });

    const errorCollector = createGlobalErrorCollector();
    const errorReporter = errorCollector.getErrorReporter();
    getFullyInlinedMultipleInterfaceContext(
      [AstBuilder.IdType('ICyclic1')],
      globalTypingContext,
      errorReporter,
    );
    getFullyInlinedMultipleInterfaceContext(
      [AstBuilder.IdType('ICyclic2')],
      globalTypingContext,
      errorReporter,
    );
    getFullyInlinedMultipleInterfaceContext(
      [AstBuilder.IdType('ConflictExtends1'), AstBuilder.IdType('ConflictExtends2')],
      globalTypingContext,
      errorReporter,
    );
    expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([
      '__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic1` has a cyclic definition.',
      '__DUMMY__.sam:0:0-0:0: [CyclicTypeDefinition]: Type `ICyclic2` has a cyclic definition.',
      '__DUMMY__.sam:0:0-0:0: [UnexpectedType]: Expected: `() -> int`, actual: `() -> bool`.',
    ]);
  });
});
