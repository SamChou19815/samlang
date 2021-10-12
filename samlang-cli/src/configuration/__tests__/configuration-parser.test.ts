import parseSamlangProjectConfiguration from '../configuration-parser';

describe('configuration-parser', () => {
  it('Parser can parse good configurations', () => {
    expect(parseSamlangProjectConfiguration('{}')).toEqual({
      sourceDirectory: '.',
      outputDirectory: 'out',
      entryPoints: [],
    });

    expect(parseSamlangProjectConfiguration('{"sourceDirectory": "source"}')).toEqual({
      sourceDirectory: 'source',
      outputDirectory: 'out',
      entryPoints: [],
    });

    expect(parseSamlangProjectConfiguration('{"outputDirectory": "out-out"}')).toEqual({
      sourceDirectory: '.',
      outputDirectory: 'out-out',
      entryPoints: [],
    });

    expect(
      parseSamlangProjectConfiguration(`{
        "sourceDirectory": "source",
        "outputDirectory": "output",
        "entryPoints": ["a", "b"]
      }
      `)
    ).toEqual({
      sourceDirectory: 'source',
      outputDirectory: 'output',
      entryPoints: ['a', 'b'],
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
    expect(parseSamlangProjectConfiguration('{ "entryPoints": "3" }')).toBeNull();
    expect(parseSamlangProjectConfiguration('{ "entryPoints": [1, ""] }')).toBeNull();
  });
});
