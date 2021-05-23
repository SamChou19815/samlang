import { VariableDefinitionLookup } from '../variable-definition-service';

import { ModuleReference, Position, Range } from 'samlang-core-ast/common-nodes';
import { createGlobalErrorCollector } from 'samlang-core-errors';
import { parseSamlangModuleFromText } from 'samlang-core-parser';

const prepareLookup = (source: string): VariableDefinitionLookup => {
  const moduleReference = ModuleReference.ROOT;
  const errorCollector = createGlobalErrorCollector();
  const parsedModule = parseSamlangModuleFromText(
    source,
    moduleReference,
    errorCollector.getModuleErrorCollector(moduleReference)
  );
  expect(errorCollector.getErrors().map((it) => it.toString())).toEqual([]);
  return new VariableDefinitionLookup(parsedModule);
};

const query = (lookup: VariableDefinitionLookup, range: Range) => {
  const defAndUse = lookup.findAllDefinitionAndUses(range);
  if (defAndUse == null) return null;
  const { definitionRange, useRanges } = defAndUse;
  return { definition: definitionRange.toString(), uses: useRanges.map((it) => it.toString()) };
};

it('VariableDefinitionLookup basic test', () => {
  const source = `
class Main {
  function test(a: int, b: bool): unit = { }
}
`;
  expect(prepareLookup(source).findAllDefinitionAndUses(Range.DUMMY)).toBeNull();
});

it('VariableDefinitionLookup look up tests', () => {
  const source = `
class Main {
  function test(a: int, b: bool): unit = {
    val c = a;
    val [e, _] = [b, 2];
    val g = 3;
    val {f, g as h} = {f:3, g};
    val _ = Tagged(h);
    val _ = f + h;
    val lambda1 = (x, y) -> if (x + y * 3 > h) then panic(f) else println(h);
    match (lambda1(3, !h)) {
      | None _ -> 1.d
      | Some dd -> dd
    }
  }
}
`;
  const lookup = prepareLookup(source);

  expect(query(lookup, new Range(new Position(3, 12), new Position(3, 13)))).toEqual({
    definition: '3:17-3:18',
    uses: ['4:13-4:14'],
  });
  expect(query(lookup, new Range(new Position(3, 8), new Position(3, 9)))).toEqual({
    definition: '4:9-4:10',
    uses: [],
  });
  expect(query(lookup, new Range(new Position(4, 9), new Position(4, 10)))).toEqual({
    definition: '5:10-5:11',
    uses: [],
  });
  expect(query(lookup, new Range(new Position(8, 12), new Position(8, 13)))).toEqual({
    definition: '7:10-7:11',
    uses: ['9:13-9:14', '10:59-10:60'],
  });
  expect(query(lookup, new Range(new Position(8, 16), new Position(8, 17)))).toEqual({
    definition: '7:18-7:19',
    uses: ['8:20-8:21', '9:17-9:18', '10:45-10:46', '10:75-10:76', '11:24-11:25'],
  });
  expect(query(lookup, new Range(new Position(9, 22), new Position(9, 23)))).toEqual({
    definition: '10:23-10:24',
    uses: ['10:37-10:38'],
  });
  expect(query(lookup, new Range(new Position(12, 19), new Position(12, 21)))).toEqual({
    definition: '13:14-13:16',
    uses: ['13:20-13:22'],
  });
});
