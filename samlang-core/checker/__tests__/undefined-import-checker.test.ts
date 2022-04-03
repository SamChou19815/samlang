import {
  ModuleReference,
  ModuleReferenceCollections,
  Range,
  Sources,
} from '../../ast/common-nodes';
import { SamlangModule, SourceClassDefinition, SourceId } from '../../ast/samlang-nodes';
import { createGlobalErrorCollector } from '../../errors';
import checkUndefinedImportsError from '../undefined-imports-checker';

const createMockClass = (name: string): SourceClassDefinition => ({
  range: Range.DUMMY,
  associatedComments: [],
  name: SourceId(name),
  typeParameters: [],
  members: [],
  typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
});

const createMockModule = (
  name: string,
  imports: readonly (readonly [string, readonly string[]])[] = [],
  members: readonly string[] = []
): readonly [string, SamlangModule] => [
  name,
  {
    imports: imports.map(([importedModuleName, importedMembers]) => ({
      range: Range.DUMMY,
      importedMembers: importedMembers.map((it) => SourceId(it)),
      importedModule: new ModuleReference([importedModuleName]),
      importedModuleRange: Range.DUMMY,
    })),
    classes: members.map((className) => createMockClass(className)),
    interfaces: [],
  },
];

const createMockSources = (
  modules: readonly (readonly [string, SamlangModule])[]
): Sources<SamlangModule> =>
  ModuleReferenceCollections.hashMapOf(
    ...modules.map(([name, samlangModule]) => [new ModuleReference([name]), samlangModule] as const)
  );

function checkErrors(
  modules: readonly (readonly [string, SamlangModule])[],
  errors: readonly string[]
): void {
  const sources = createMockSources(modules);
  const globalErrorCollector = createGlobalErrorCollector();
  sources.forEach((samlangModule, moduleReference) => {
    checkUndefinedImportsError(
      sources,
      samlangModule,
      globalErrorCollector.getModuleErrorCollector(moduleReference)
    );
  });
  expect(errors).toEqual(globalErrorCollector.getErrors().map((it) => it.toString()));
}

describe('undefined-import-checker', () => {
  it('Empty sources have no errors.', () => checkErrors([], []));

  it('No import sources have no errors.', () => {
    checkErrors(
      [
        createMockModule('A'),
        createMockModule('B', [], ['Foo']),
        createMockModule('C', [], ['Bar']),
      ],
      []
    );
  });

  it('Cyclic dependency causes no errors.', () => {
    checkErrors(
      [
        createMockModule('A', [['B', ['Bar']]], ['Foo']),
        createMockModule('B', [['A', ['Foo']]], ['Bar']),
      ],
      []
    );
  });

  it('Missing classes cause errors.', () => {
    checkErrors(
      [
        createMockModule('A', [['B', ['Foo', 'Bar']]]),
        createMockModule('B', [['A', ['Foo', 'Bar']]]),
      ],
      [
        'A.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.',
        'A.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved.',
        'B.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.',
        'B.sam:0:0-0:0: [UnresolvedName]: Name `Bar` is not resolved.',
      ]
    );
  });

  it('Importing missing module causes errors.', () => {
    checkErrors(
      [createMockModule('A', [['B', []]])],
      ['A.sam:0:0-0:0: [UnresolvedName]: Name `B` is not resolved.']
    );
  });
});
