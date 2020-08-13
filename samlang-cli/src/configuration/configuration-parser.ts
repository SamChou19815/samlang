import { SamlangProjectConfiguration } from './configuration-type';

const parseSamlangProjectConfiguration = (
  configurationString: string
): SamlangProjectConfiguration | null => {
  try {
    const json: unknown = JSON.parse(configurationString);
    if (typeof json !== 'object' || json === null) {
      return null;
    }
    const { sourceDirectory = '.', outputDirectory = 'out' } = json as Record<string, unknown>;
    if (typeof sourceDirectory !== 'string' || typeof outputDirectory !== 'string') {
      return null;
    }
    return { sourceDirectory, outputDirectory };
  } catch {
    return null;
  }
};

export default parseSamlangProjectConfiguration;
