import {
  ENCODED_FUNCTION_NAME_INT_TO_STRING,
  ENCODED_FUNCTION_NAME_PRINTLN,
  ENCODED_FUNCTION_NAME_STRING_TO_INT,
  ENCODED_FUNCTION_NAME_STRING_CONCAT,
  ENCODED_FUNCTION_NAME_THROW,
} from 'samlang-core-ast/common-names';
import type { MidIRSources } from 'samlang-core-ast/mir-nodes';
import type { SamlangModule } from 'samlang-core-ast/samlang-toplevel';

import { createPrettierDocumentsForExportingModuleFromMidIRSources } from './printer-js';
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

export function prettyPrintMidIRSourcesAsJSExportingModule(
  availableWidth: number,
  sources: MidIRSources
): string {
  const body = createPrettierDocumentsForExportingModuleFromMidIRSources(sources)
    .map((doc) => prettyPrintAccordingToPrettierAlgorithm(availableWidth, doc))
    .join('');
  return `const ${ENCODED_FUNCTION_NAME_STRING_CONCAT} = (a, b) => a + b;
const ${ENCODED_FUNCTION_NAME_PRINTLN} = (line) => console.log(line);
const ${ENCODED_FUNCTION_NAME_STRING_TO_INT} = (v) => parseInt(v, 10);
const ${ENCODED_FUNCTION_NAME_INT_TO_STRING} = (v) => String(v);
const ${ENCODED_FUNCTION_NAME_THROW} = (v) => { throw Error(v); };
${body}
module.exports = { ${sources.mainFunctionNames.join(', ')} };`;
}
