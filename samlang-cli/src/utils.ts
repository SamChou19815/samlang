import { lstat, readdir, readFile } from 'fs/promises';
import { join, normalize, relative, resolve, sep } from 'path';

import type { ModuleReference } from '@dev-sam/samlang-core';

import loadSamlangProjectConfiguration, { SamlangProjectConfiguration } from './configuration';

export async function getConfiguration(): Promise<SamlangProjectConfiguration> {
  const configuration = await loadSamlangProjectConfiguration();
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

export async function collectSources(
  { sourceDirectory }: SamlangProjectConfiguration,
  moduleReferenceCreator: (parts: readonly string[]) => ModuleReference
): Promise<readonly (readonly [ModuleReference, string])[]> {
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

  function walk(startPath: string, visitor: (file: string) => Promise<void>): Promise<void> {
    async function recursiveVisit(path: string): Promise<void> {
      if ((await lstat(path)).isFile()) {
        await visitor(path);
        return;
      }

      if ((await lstat(path)).isDirectory()) {
        await Promise.all(
          (
            await readdir(path)
          ).map(async (relativeChildPath) => await recursiveVisit(join(path, relativeChildPath)))
        );
      }
    }

    return recursiveVisit(startPath);
  }

  await walk(sourcePath, async (file) => {
    if (!file.endsWith('.sam')) return;
    sources.push([filePathToModuleReference(sourcePath, file), (await readFile(file)).toString()]);
  });

  return sources;
}
