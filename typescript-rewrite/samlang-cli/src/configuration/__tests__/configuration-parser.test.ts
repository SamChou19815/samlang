import parseSamlangProjectConfiguration from '../configuration-parser';

it('Parser can parse good configurations', () => {
  expect(parseSamlangProjectConfiguration('{}')).toEqual({
    sourceDirectory: '.',
    outputDirectory: 'out',
    excludes: [],
  });

  expect(parseSamlangProjectConfiguration('{"sourceDirectory": "source"}')).toEqual({
    sourceDirectory: 'source',
    outputDirectory: 'out',
    excludes: [],
  });

  expect(parseSamlangProjectConfiguration('{"outputDirectory": "out-out"}')).toEqual({
    sourceDirectory: '.',
    outputDirectory: 'out-out',
    excludes: [],
  });

  expect(
    parseSamlangProjectConfiguration(`{
      "sourceDirectory": "source",
      "outputDirectory": "output",
      "excludes": ["foo", "bar"]
    }
    `)
  ).toEqual({
    sourceDirectory: 'source',
    outputDirectory: 'output',
    excludes: ['foo', 'bar'],
  });
});

it('Parser can reject bad configurations', () => {
  expect(parseSamlangProjectConfiguration('')).toBeNull();
  expect(parseSamlangProjectConfiguration('null')).toBeNull();
  expect(parseSamlangProjectConfiguration('undefined')).toBeNull();
  expect(parseSamlangProjectConfiguration('1')).toBeNull();
  expect(parseSamlangProjectConfiguration('"undefined"')).toBeNull();
  expect(parseSamlangProjectConfiguration('{')).toBeNull();
  expect(parseSamlangProjectConfiguration('}')).toBeNull();
  expect(parseSamlangProjectConfiguration('{ "sourceDirectory": 3 }')).toBeNull();
  expect(parseSamlangProjectConfiguration('{ "outputDirectory": 3 }')).toBeNull();
  expect(parseSamlangProjectConfiguration('{ "excludes": 3 }')).toBeNull();
  expect(parseSamlangProjectConfiguration('{ "excludes": [3] }')).toBeNull();
  expect(parseSamlangProjectConfiguration('{ "excludes": [3, "4"] }')).toBeNull();
});
