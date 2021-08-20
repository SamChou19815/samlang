import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

const prettyPrintSamlangModule = (availableWidth: number, samlangModule: SamlangModule): string =>
  `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;

export default prettyPrintSamlangModule;
