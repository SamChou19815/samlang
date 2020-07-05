import {
  typeCheckSources,
  typeCheckSourcesIncrementally,
  // eslint-disable-next-line camelcase
  typeCheckSingleModuleSource_EXPOSED_FOR_TESTING,
} from '..';
import ModuleReference from '../../ast/common/module-reference';
import { createGlobalErrorCollector } from '../../errors/error-collector';
import { parseSamlangModuleFromText } from '../../parser';
import { mapOf, hashMapOf } from '../../util/collections';

it('typeCheckSources integration smoke test (passing case)', () => {
  const sourceA = `class A { function a(): int = 42 }`;
  const sourceB = `import { A } from A
  class B(val value: int) {
    function of(): B = { value: A.a() }
    method intValue(): int = this.value
  }`;
  const sourceC = `import { B } from B
  class C(Int(int), B(B)) {
    function ofInt(value: int): C = Int(value)
    function ofB(b: B): C = B(b)
    method intValue(): int = match (this) { | Int v -> v  | B b -> b.intValue()  }
  }`;
  const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c2: C): bool = c1.intValue() == c2.intValue() }
  class Main { function main(): bool =  IdentifyChecker.equals(C.ofInt(A.a()), C.ofB(B.of())) }`;

  const moduleReferenceA = new ModuleReference(['A']);
  const moduleReferenceB = new ModuleReference(['B']);
  const moduleReferenceC = new ModuleReference(['C']);
  const moduleReferenceD = new ModuleReference(['D']);

  const errorCollector = createGlobalErrorCollector();

  const sources = hashMapOf(
    [
      moduleReferenceA,
      parseSamlangModuleFromText(sourceA, errorCollector.getModuleErrorCollector(moduleReferenceA)),
    ],
    [
      moduleReferenceB,
      parseSamlangModuleFromText(sourceB, errorCollector.getModuleErrorCollector(moduleReferenceB)),
    ],
    [
      moduleReferenceC,
      parseSamlangModuleFromText(sourceC, errorCollector.getModuleErrorCollector(moduleReferenceC)),
    ],
    [
      moduleReferenceD,
      parseSamlangModuleFromText(sourceD, errorCollector.getModuleErrorCollector(moduleReferenceD)),
    ]
  );

  const [, globalTypingContext] = typeCheckSources(sources, errorCollector);
  expect(errorCollector.getErrors().map((e) => e.toString())).toEqual([]);

  sources.delete(moduleReferenceC);
  typeCheckSourcesIncrementally(
    sources,
    globalTypingContext,
    [moduleReferenceC, moduleReferenceD],
    errorCollector
  );
  expect(
    errorCollector
      .getErrors()
      .map((e) => e.toString())
      .sort()
  ).toEqual([
    'D.sam:3:3-3:22: [UnresolvedName]: Name `C` is not resolved.',
    'D.sam:5:27-5:95: [NotWellDefinedIdentifier]: `C` is not well defined.',
    'D.sam:5:47-5:48: [NotWellDefinedIdentifier]: `C` is not well defined.',
    'D.sam:5:54-5:55: [NotWellDefinedIdentifier]: `C` is not well defined.',
    "D.sam:5:65-5:67: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    "D.sam:5:82-5:84: [UnsupportedClassTypeDefinition]: Expect the current class to have `object` type definition, but it doesn't.",
    'D.sam:6:64-6:71: [UnresolvedName]: Name `C.ofInt` is not resolved.',
    'D.sam:6:80-6:85: [UnresolvedName]: Name `C.ofB` is not resolved.',
  ]);
});

it('typeCheckSources smoke test (failing case)', () => {
  const sourceA = `class A { function a(): int = 42 function a(): int = 42 }`;
  const sourceB = `import { A } from A
  class B<A, A>(val value: int) {
    function of(): B<int, bool> = { value: A.a() }
    method intValue(): int = this.value
  }`;
  const sourceC = `import { B } from B
  class C(Int(int), Int(bool), B(B)) {
    function ofInt(value: int): C = Int(value)
    function <T, F, T>ofB(b: B): C = B(b)
    method intValue(): int = match (this) { | Int v -> v  | B b -> b.intValue()  }
  }`;
  const sourceD = `import { A } from A
  import { B } from B
  import { C } from C

  class IdentifyChecker { function equals(c1: C, c1: C): bool = c1.intValue() == c1.intValue() }
  class Main { function main(): bool = true }`;

  const moduleReferenceA = new ModuleReference(['A']);
  const moduleReferenceB = new ModuleReference(['B']);
  const moduleReferenceC = new ModuleReference(['C']);
  const moduleReferenceD = new ModuleReference(['D']);

  const errorCollector = createGlobalErrorCollector();

  const sources = mapOf(
    [
      moduleReferenceA,
      parseSamlangModuleFromText(sourceA, errorCollector.getModuleErrorCollector(moduleReferenceA)),
    ],
    [
      moduleReferenceB,
      parseSamlangModuleFromText(sourceB, errorCollector.getModuleErrorCollector(moduleReferenceB)),
    ],
    [
      moduleReferenceC,
      parseSamlangModuleFromText(sourceC, errorCollector.getModuleErrorCollector(moduleReferenceC)),
    ],
    [
      moduleReferenceD,
      parseSamlangModuleFromText(sourceD, errorCollector.getModuleErrorCollector(moduleReferenceD)),
    ]
  );

  typeCheckSources(sources, errorCollector);
  expect(
    errorCollector
      .getErrors()
      .map((e) => e.toString())
      .sort()
  ).toEqual([
    'A.sam:1:43-1:44: [Collision]: Name `a` collides with a previously defined name.',
    'B.sam:2:10-2:31: [Collision]: Name `A` collides with a previously defined name.',
    'C.sam:2:11-2:36: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:3:41-3:46: [UnexpectedType]: Expected: `bool`, actual: `int`.',
    'C.sam:4:30-4:31: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:4:5-4:42: [Collision]: Name `T` collides with a previously defined name.',
    'C.sam:4:5-4:42: [NotWellDefinedIdentifier]: `B` is not well defined.',
    'C.sam:5:56-5:57: [UnexpectedType]: Expected: `int`, actual: `bool`.',
    'C.sam:5:68-5:78: [UnresolvedName]: Name `intValue` is not resolved.',
    'D.sam:5:50-5:52: [Collision]: Name `c1` collides with a previously defined name.',
  ]);
});

it('typeCheckSingleModuleSource smoke test', () => {
  const errorCollector = createGlobalErrorCollector();
  const checkedModule = typeCheckSingleModuleSource_EXPOSED_FOR_TESTING(
    parseSamlangModuleFromText(
      'class Main {}',
      errorCollector.getModuleErrorCollector(new ModuleReference(['Test']))
    ),
    errorCollector
  );

  expect(errorCollector.getErrors()).toEqual([]);
  expect(checkedModule.imports).toEqual([]);
  expect(checkedModule.classes.length).toBe(1);
  expect(checkedModule.classes[0].name).toBe('Main');
  expect(checkedModule.classes[0].members).toEqual([]);
});
