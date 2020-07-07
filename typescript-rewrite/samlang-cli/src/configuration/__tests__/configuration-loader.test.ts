import { resolve } from 'path';

import loadSamlangProjectConfiguration, {
  // eslint-disable-next-line camelcase
  fileSystemLoader_EXPOSED_FOR_TESTING,
} from '../configuration-loader';

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
    })
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
    })
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
    })
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
    })
  ).toEqual({ sourceDirectory: '.', outputDirectory: 'out', excludes: [] });
});

it('Real filesystem bad configuration file integration test.', () => {
  expect(
    loadSamlangProjectConfiguration({
      // eslint-disable-next-line camelcase
      ...fileSystemLoader_EXPOSED_FOR_TESTING,
      startPath: resolve('./samlang-cli/fixtures/bad-configuration-file'),
    })
  ).toBe('UNREADABLE_CONFIGURATION_FILE');
});

it('Real filesystem integration test.', () => {
  expect(loadSamlangProjectConfiguration()).toEqual({
    sourceDirectory: '.',
    outputDirectory: 'out',
    excludes: ['**/bad/*.sam', 'build/**', 'out/**'],
  });
});
