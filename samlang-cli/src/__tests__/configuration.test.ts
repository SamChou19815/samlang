import { resolve } from 'path';
import loadSamlangProjectConfiguration, {
  fileSystemLoader_EXPOSED_FOR_TESTING,
  parseSamlangProjectConfiguration,
} from '../configuration';

describe('samlang-cli/configuration', () => {
  describe('parser', () => {
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
        `),
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

  describe('loader', () => {
    it('When there is no configuration, say so.', () => {
      expect(
        loadSamlangProjectConfiguration({
          startPath: '/Users/sam',
          pathExistanceTester() {
            return false;
          },
          fileReader() {
            return null;
          },
        }),
      ).toBe('NO_CONFIGURATION');
    });

    it('When the configuration file is unreadable, say so.', () => {
      expect(
        loadSamlangProjectConfiguration({
          startPath: '/Users/sam',
          pathExistanceTester() {
            return true;
          },
          fileReader() {
            return null;
          },
        }),
      ).toBe('UNREADABLE_CONFIGURATION_FILE');
    });

    it('When the configuration file is unparsable, say so.', () => {
      expect(
        loadSamlangProjectConfiguration({
          startPath: '/Users/sam',
          pathExistanceTester() {
            return true;
          },
          fileReader() {
            return 'bad file haha';
          },
        }),
      ).toBe('UNPARSABLE_CONFIGURATION_FILE');
    });

    it('When the configuration file is good, say so', () => {
      expect(
        loadSamlangProjectConfiguration({
          startPath: '/Users/sam',
          pathExistanceTester() {
            return true;
          },
          fileReader() {
            return '{}';
          },
        }),
      ).toBeTruthy();
    });

    it('Real filesystem bad configuration file integration test.', () => {
      expect(
        loadSamlangProjectConfiguration({
          ...fileSystemLoader_EXPOSED_FOR_TESTING,
          startPath: resolve('./samlang-cli/fixtures/bad-configuration-file'),
        }),
      ).toBe('UNREADABLE_CONFIGURATION_FILE');
    });

    it('Real filesystem bad start path integration test.', () => {
      expect(
        loadSamlangProjectConfiguration({
          ...fileSystemLoader_EXPOSED_FOR_TESTING,
          startPath: '/',
        }),
      ).toBe('NO_CONFIGURATION');
    });

    it('Real filesystem integration test.', () => {
      expect(loadSamlangProjectConfiguration()).toEqual({
        sourceDirectory: resolve(process.env.PWD || ''),
        outputDirectory: resolve(process.env.PWD || '', 'out'),
        entryPoints: ['tests.AllTests'],
      });
    });
  });
});
