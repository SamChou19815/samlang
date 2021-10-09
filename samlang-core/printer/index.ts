import type { SamlangModule } from '../ast/samlang-nodes';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

export default function prettyPrintSamlangModule(
  availableWidth: number,
  samlangModule: SamlangModule
): string {
  return `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;
}
