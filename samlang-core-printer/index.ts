import { createPrettierDocumentFromMidIRModule } from './printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

import type { MidIRModule } from 'samlang-core-ast/mir-toplevel';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

export const prettyPrintSamlangModule = (
  availableWidth: number,
  samlangModule: SamlangModule
): string =>
  `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;

export const prettyPrintMidIRModuleAsJS = (
  availableWidth: number,
  midIRModule: MidIRModule
): string =>
  prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentFromMidIRModule(midIRModule, /* forInterpreter */ false)
  ).trimEnd();
