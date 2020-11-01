import { createPrettierDocumentFromHighIRModule } from './printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

export const prettyPrintSamlangModule = (
  availableWidth: number,
  samlangModule: SamlangModule
): string =>
  `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;

export const prettyPrintHighIRModuleAsJS = (
  availableWidth: number,
  highIRModule: HighIRModule
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromHighIRModule(highIRModule, /* forInterpreter */ false)
  ).trimEnd();
