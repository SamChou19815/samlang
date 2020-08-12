import parseSamlangProjectConfiguration from '../configuration-parser';

it('Parser can parse good configurations', () => {
  expect(parseSamlangProjectConfiguration('{}')).toEqual({
    sourceDirectory: '.',
    outputDirectory: 'out',
  });

  expect(parseSamlangProjectConfiguration('{"sourceDirectory": "source"}')).toEqual({
    sourceDirectory: 'source',
    outputDirectory: 'out',
  });

  expect(parseSamlangProjectConfiguration('{"outputDirectory": "out-out"}')).toEqual({
    sourceDirectory: '.',
    outputDirectory: 'out-out',
  });

  expect(
    parseSamlangProjectConfiguration(`{
      "sourceDirectory": "source",
      "outputDirectory": "output"
    }
    `)
  ).toEqual({
    sourceDirectory: 'source',
    outputDirectory: 'output',
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
});
