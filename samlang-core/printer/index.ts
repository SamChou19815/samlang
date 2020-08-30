import type { HighIRModule } from '../ast/hir-toplevel';
import type { SamlangModule } from '../ast/samlang-toplevel';
import { highIRModuleToJSString } from './printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

// eslint-disable-next-line import/prefer-default-export
export const prettyPrintSamlangModule = (
  availableWidth: number,
  samlangModule: SamlangModule
): string =>
  `${prettyPrintAccordingToPrettierAlgorithm(
    availableWidth,
    createPrettierDocumentForSamlangModule(samlangModule)
  ).trimEnd()}\n`;

export const prettyPrintHighIRModuleAsJS: (
  highIRModule: HighIRModule
) => string = highIRModuleToJSString;
