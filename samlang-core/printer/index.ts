import { prettyPrintType } from '../ast/common-nodes';
import type { SamlangModule } from '../ast/samlang-nodes';
import {
  PRETTIER_CONCAT,
  PRETTIER_LINE,
  PRETTIER_NEST,
  PRETTIER_NIL,
  PRETTIER_TEXT,
  prettyPrintAccordingToPrettierAlgorithm,
} from './printer-prettier-core';
import {
  createBracesSurroundedDocument,
  createCommaSeparatedList,
  createParenthesisSurroundedDocument,
} from './printer-prettier-library';
import {
  createPrettierDocumentForAssociatedComments,
  createPrettierDocumentsFromSamlangClassMember,
} from './printer-source-level';

export default function prettyPrintSamlangModule(
  availableWidth: number,
  samlangModule: SamlangModule
): string {
  const imports = samlangModule.imports
    .map((oneImport) =>
      prettyPrintAccordingToPrettierAlgorithm(
        availableWidth,
        PRETTIER_CONCAT(
          PRETTIER_TEXT('import '),
          createBracesSurroundedDocument(
            createCommaSeparatedList(oneImport.importedMembers, ([name]) => PRETTIER_TEXT(name))
          ),
          PRETTIER_TEXT(` from ${oneImport.importedModule.parts.join('.')}`)
        )
      )
    )
    .join('');

  const classes = samlangModule.classes
    .map((classDefinition) => {
      const typeMappingItems = Object.entries(classDefinition.typeDefinition.mappings).map(
        ([name, type]) => {
          if (classDefinition.typeDefinition.type === 'object') {
            const modifier = type.isPublic ? '' : 'private ';
            return `${modifier}val ${name}: ${prettyPrintType(type.type)}`;
          }
          return `${name}(${prettyPrintType(type.type)})`;
        }
      );

      const documents = [
        createPrettierDocumentForAssociatedComments(classDefinition.associatedComments, true) ??
          PRETTIER_NIL,
        PRETTIER_TEXT(`class ${classDefinition.name}`),
        PRETTIER_TEXT(
          classDefinition.typeParameters.length === 0
            ? ''
            : `<${classDefinition.typeParameters.join(', ')}>`
        ),
        typeMappingItems.length === 0
          ? PRETTIER_NIL
          : createParenthesisSurroundedDocument(
              createCommaSeparatedList(typeMappingItems, PRETTIER_TEXT)
            ),
      ];

      if (classDefinition.members.length === 0) {
        return prettyPrintAccordingToPrettierAlgorithm(
          availableWidth,
          PRETTIER_CONCAT(...documents)
        ).trimEnd();
      }

      let classString = prettyPrintAccordingToPrettierAlgorithm(
        availableWidth,
        PRETTIER_CONCAT(...documents)
      ).trimEnd();
      classString += ' {';

      classDefinition.members.forEach((member) => {
        classString += prettyPrintAccordingToPrettierAlgorithm(
          availableWidth,
          PRETTIER_NEST(
            2,
            PRETTIER_CONCAT(PRETTIER_LINE, ...createPrettierDocumentsFromSamlangClassMember(member))
          )
        );
      });
      classString += '}';

      return classString;
    })
    .join('\n\n');
  const untrimmed = `${imports}\n${classes}`;
  return `${untrimmed.trim()}\n`;
}
