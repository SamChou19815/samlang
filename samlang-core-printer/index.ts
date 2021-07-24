import type { MidIRSources } from 'samlang-core-ast/mir-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

import { createPrettierDocumentFromMidIRSources } from './printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

export const prettyPrintSamlangModule = (
  availableWidth: number,
  samlangModule: SamlangModule
): string =>
  `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;

export const prettyPrintMidIRSourcesAsJS = (
  availableWidth: number,
  sources: MidIRSources
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromMidIRSources(sources, /* forInterpreter */ false)
  ).trimEnd();
