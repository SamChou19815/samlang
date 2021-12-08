import type { ModuleReference } from '@dev-sam/samlang-core';
import * as fs from 'fs';
import * as path from 'path';
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
  const sourcePath = path.resolve(sourceDirectory);
  const sources: (readonly [ModuleReference, string])[] = [];

  function filePathToModuleReference(
    absoluteSourcePath: string,
    filePath: string
  ): ModuleReference {
    const relativeFile = path.normalize(path.relative(absoluteSourcePath, filePath));
    const relativeFileWithoutExtension = relativeFile.substring(0, relativeFile.length - 4);
    return moduleReferenceCreator(relativeFileWithoutExtension.split(path.sep));
  }

  function walk(startPath: string, visitor: (file: string) => void): void {
    function recursiveVisit(p: string): void {
      const stats = fs.lstatSync(p);
      if (stats.isFile()) {
        visitor(p);
        return;
      }

      if (stats.isDirectory()) {
        fs.readdirSync(p).forEach((relativeChildPath) =>
          recursiveVisit(path.join(p, relativeChildPath))
        );
      }
    }

    recursiveVisit(startPath);
  }

  walk(sourcePath, (file) => {
    if (!file.endsWith('.sam')) return;
    sources.push([filePathToModuleReference(sourcePath, file), fs.readFileSync(file).toString()]);
  });

  return sources;
}
