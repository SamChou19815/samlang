import { lstatSync, readdirSync, readFileSync } from 'fs';
import { join, normalize, relative, resolve, sep } from 'path';

import type { ModuleReference } from '@dev-sam/samlang-core';

import loadSamlangProjectConfiguration, { SamlangProjectConfiguration } from './configuration';

export function getConfiguration(): SamlangProjectConfiguration {
  const configuration = loadSamlangProjectConfiguration();
  if (
    configuration === 'NO_CONFIGURATION' ||
    configuration === 'UNPARSABLE_CONFIGURATION_FILE' ||
    configuration === 'UNREADABLE_CONFIGURATION_FILE'
  ) {
    // eslint-disable-next-line no-console
    console.error(configuration);
    process.exit(2);
  }
  return configuration;
}

export function collectSources(
  { sourceDirectory }: SamlangProjectConfiguration,
  moduleReferenceCreator: (parts: readonly string[]) => ModuleReference
): readonly (readonly [ModuleReference, string])[] {
  const sourcePath = resolve(sourceDirectory);
  const sources: (readonly [ModuleReference, string])[] = [];

  function filePathToModuleReference(
    absoluteSourcePath: string,
    filePath: string
  ): ModuleReference {
    const relativeFile = normalize(relative(absoluteSourcePath, filePath));
    const relativeFileWithoutExtension = relativeFile.substring(0, relativeFile.length - 4);
    return moduleReferenceCreator(relativeFileWithoutExtension.split(sep));
  }

  function walk(startPath: string, visitor: (file: string) => void): void {
    function recursiveVisit(path: string): void {
      if (lstatSync(path).isFile()) {
        visitor(path);
        return;
      }

      if (lstatSync(path).isDirectory()) {
        readdirSync(path).some((relativeChildPath) =>
          recursiveVisit(join(path, relativeChildPath))
        );
      }
    }

    return recursiveVisit(startPath);
  }

  walk(sourcePath, (file) => {
    if (!file.endsWith('.sam')) return;
    sources.push([filePathToModuleReference(sourcePath, file), readFileSync(file).toString()]);
  });

  return sources;
}
