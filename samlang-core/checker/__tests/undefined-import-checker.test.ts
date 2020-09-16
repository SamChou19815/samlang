import { ModuleReference, Range, Sources } from '../../ast/common-nodes';
import type { SamlangModule, ClassDefinition } from '../../ast/samlang-toplevel';
import { createGlobalErrorCollector } from '../../errors';
import { hashMapOf } from '../../util/collections';
import checkUndefinedImportsError from '../undefined-imports-checker';

const createMockClass = (name: string, isPublic: boolean): ClassDefinition => ({
  range: Range.DUMMY,
  name,
  nameRange: Range.DUMMY,
  isPublic,
  typeParameters: [],
  members: [],
  typeDefinition: { range: Range.DUMMY, type: 'object', names: [], mappings: {} },
});

const createMockModule = (
  name: string,
  imports: readonly (readonly [string, readonly string[]])[] = [],
  members: readonly (readonly [string, boolean])[] = []
): readonly [string, SamlangModule] => [
  name,
  {
    imports: imports.map(([importedModuleName, importedMembers]) => ({
      range: Range.DUMMY,
      importedMembers: importedMembers.map((it) => [it, Range.DUMMY]),
      importedModule: new ModuleReference([importedModuleName]),
      importedModuleRange: Range.DUMMY,
    })),
    classes: members.map(([className, isPublic]) => createMockClass(className, isPublic)),
  },
];

const createMockSources = (
  modules: readonly (readonly [string, SamlangModule])[]
): Sources<SamlangModule> =>
  hashMapOf(
    ...modules.map(([name, samlangModule]) => [new ModuleReference([name]), samlangModule] as const)
  );

const checkErrors = (
  modules: readonly (readonly [string, SamlangModule])[],
  errors: readonly string[]
): void => {
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
};

it('Empty sources have no errors.', () => checkErrors([], []));

it('No import sources have no errors.', () => {
  checkErrors(
    [
      createMockModule('A'),
      createMockModule('B', [], [['Foo', true]]),
      createMockModule('C', [], [['Bar', true]]),
    ],
    []
  );
});

it('Cyclic dependency causes no errors.', () => {
  checkErrors(
    [
      createMockModule('A', [['B', ['Bar']]], [['Foo', true]]),
      createMockModule('B', [['A', ['Foo']]], [['Bar', true]]),
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

it('Importing private classes causes errors.', () => {
  checkErrors(
    [createMockModule('A', [], [['Foo', false]]), createMockModule('B', [['A', ['Foo']]])],
    ['B.sam:0:0-0:0: [UnresolvedName]: Name `Foo` is not resolved.']
  );
});

it('Importing missing module causes errors.', () => {
  checkErrors(
    [createMockModule('A', [['B', []]])],
    ['A.sam:0:0-0:0: [UnresolvedName]: Name `B` is not resolved.']
  );
});
