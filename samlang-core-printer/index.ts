import { highIRModuleToJSString } from './printer-js';
import { prettyPrintAccordingToPrettierAlgorithm } from './printer-prettier-core';
import createPrettierDocumentForSamlangModule from './printer-source-level';

import type { HighIRModule } from 'samlang-core-ast/hir-toplevel';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

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
  availableWidth: number,
  highIRModule: HighIRModule
) => string = highIRModuleToJSString;
