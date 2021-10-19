import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export type SamlangProjectConfiguration = {
  readonly sourceDirectory: string;
  readonly outputDirectory: string;
  readonly entryPoints: readonly string[];
};

export function parseSamlangProjectConfiguration(
  configurationString: string
): SamlangProjectConfiguration | null {
  try {
    const json: unknown = JSON.parse(configurationString);
    if (typeof json !== 'object' || json === null) return null;
    const {
      sourceDirectory = '.',
      outputDirectory = 'out',
      entryPoints = [],
    } = json as Record<string, unknown>;
    if (typeof sourceDirectory !== 'string' || typeof outputDirectory !== 'string') return null;
    if (!Array.isArray(entryPoints)) return null;
    const validatedEntryPoints: string[] = [];
    entryPoints.forEach((entryPoint) => {
      if (typeof entryPoint === 'string') validatedEntryPoints.push(entryPoint);
    });
    if (validatedEntryPoints.length !== entryPoints.length) return null;
    return { sourceDirectory, outputDirectory, entryPoints: validatedEntryPoints };
  } catch {
    return null;
  }
}

// Used for mock.
type ConfigurationLoader = {
  readonly startPath: string;
  readonly pathExistanceTester: (path: string) => boolean;
  readonly fileReader: (path: string) => string | null;
};

export const fileSystemLoader_EXPOSED_FOR_TESTING: ConfigurationLoader = {
  startPath: resolve('.'),
  pathExistanceTester: existsSync,
  fileReader: (path) => {
    try {
      return readFileSync(path).toString();
    } catch {
      return null;
    }
  },
};

type ConfigurationLoadingResult =
  | SamlangProjectConfiguration
  | 'UNREADABLE_CONFIGURATION_FILE'
  | 'UNPARSABLE_CONFIGURATION_FILE'
  | 'NO_CONFIGURATION';

export default function loadSamlangProjectConfiguration({
  startPath,
  pathExistanceTester,
  fileReader,
}: ConfigurationLoader = fileSystemLoader_EXPOSED_FOR_TESTING): ConfigurationLoadingResult {
  let configurationDirectory = startPath;
  while (configurationDirectory !== '/') {
    const configurationPath = join(configurationDirectory, 'sconfig.json');
    if (pathExistanceTester(configurationPath)) {
      const content = fileReader(configurationPath);
      if (content == null) {
        return 'UNREADABLE_CONFIGURATION_FILE';
      }
      const configuration = parseSamlangProjectConfiguration(content);
      return configuration === null
        ? 'UNPARSABLE_CONFIGURATION_FILE'
        : {
            sourceDirectory: resolve(configurationDirectory, configuration.sourceDirectory),
            outputDirectory: resolve(configurationDirectory, configuration.outputDirectory),
            entryPoints: configuration.entryPoints,
          };
    }
    configurationDirectory = dirname(configurationDirectory);
  }
  return 'NO_CONFIGURATION';
}
