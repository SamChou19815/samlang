import {
  DummySourceReason,
  ModuleReference,
  ModuleReferenceCollections,
} from '../../ast/common-nodes';
import {
  prettyPrintType,
  SamlangIdentifierType,
  SourceFunctionType,
  SourceIdentifierType,
  SourceIntType,
} from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import { getFullyInlinedInterfaceContext } from '../interface-conformance-checking';
import { GlobalTypingContext, memberTypeInformationToString } from '../typing-context';

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

describe('interface-conformance-checking', () => {
  it('getFullyInlinedInterfaceContext tests', () => {
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
