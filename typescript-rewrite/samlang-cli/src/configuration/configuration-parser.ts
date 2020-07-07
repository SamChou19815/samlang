import { SamlangProjectConfiguration } from './configuration-type';

const parseSamlangProjectConfiguration = (
  configurationString: string
): SamlangProjectConfiguration | null => {
  try {
    const json: unknown = JSON.parse(configurationString);
    if (typeof json !== 'object' || json === null) {
      return null;
    }
    const { sourceDirectory = '.', outputDirectory = 'out', excludes = [] } = json as Record<
      string,
      unknown
    >;
    if (
      typeof sourceDirectory !== 'string' ||
      typeof outputDirectory !== 'string' ||
      !Array.isArray(excludes)
    ) {
      return null;
    }
    const sanitizedExcludes: string[] = [];
    for (let i = 0; i < excludes.length; i += 1) {
      const oneExclude = excludes[i];
      if (typeof oneExclude !== 'string') {
        return null;
      }
      sanitizedExcludes.push(oneExclude);
    }
    return { sourceDirectory, outputDirectory, excludes: sanitizedExcludes };
  } catch {
    return null;
  }
};

export default parseSamlangProjectConfiguration;
