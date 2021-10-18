import { filterMap } from '@dev-sam/samlang-core/utils';

import type { SamlangProjectConfiguration } from './configuration-type';

export default function parseSamlangProjectConfiguration(
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
    const validatedEntryPoints = filterMap(entryPoints, (entryPoint) =>
      typeof entryPoint === 'string' ? entryPoint : null
    );
    if (validatedEntryPoints.length !== entryPoints.length) return null;
    return { sourceDirectory, outputDirectory, entryPoints: validatedEntryPoints };
  } catch {
    return null;
  }
}
