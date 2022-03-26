import { prettyPrintType, SamlangModule } from '../ast/samlang-nodes';
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
  createPrettierDocumentsFromSamlangInterfaceMember,
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
            createCommaSeparatedList(oneImport.importedMembers, ({ name }) => PRETTIER_TEXT(name))
          ),
          PRETTIER_TEXT(` from ${oneImport.importedModule.parts.join('.')}`)
        )
      )
    )
    .join('');

  const interfaces = samlangModule.interfaces.map((interfaceDeclaration) => {
    const documents = [
      createPrettierDocumentForAssociatedComments(interfaceDeclaration.associatedComments, true) ??
        PRETTIER_NIL,
      PRETTIER_TEXT(`interface ${interfaceDeclaration.name.name}`),
      PRETTIER_TEXT(
        interfaceDeclaration.typeParameters.length === 0
          ? ''
          : `<${interfaceDeclaration.typeParameters.map((it) => it.name).join(', ')}>`
      ),
    ];

    if (interfaceDeclaration.members.length === 0) {
      return prettyPrintAccordingToPrettierAlgorithm(
        availableWidth,
        PRETTIER_CONCAT(...documents)
      ).trimEnd();
    }

    let interfaceString = prettyPrintAccordingToPrettierAlgorithm(
      availableWidth,
      PRETTIER_CONCAT(...documents)
    ).trimEnd();
    interfaceString += ' {';

    interfaceDeclaration.members.forEach((member) => {
      interfaceString += prettyPrintAccordingToPrettierAlgorithm(
        availableWidth,
        PRETTIER_NEST(
          2,
          PRETTIER_CONCAT(
            PRETTIER_LINE,
            ...createPrettierDocumentsFromSamlangInterfaceMember(member)
          )
        )
      );
    });
    interfaceString += '}';

    return interfaceString;
  });

  const classes = samlangModule.classes.map((classDefinition) => {
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
      PRETTIER_TEXT(`class ${classDefinition.name.name}`),
      PRETTIER_TEXT(
        classDefinition.typeParameters.length === 0
          ? ''
          : `<${classDefinition.typeParameters.map((it) => it.name).join(', ')}>`
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
          PRETTIER_CONCAT(
            PRETTIER_LINE,
            ...createPrettierDocumentsFromSamlangInterfaceMember(member)
          )
        )
      );
    });
    classString += '}';

    return classString;
  });
  const untrimmed = `${imports}\n${[...interfaces, ...classes].join('\n\n')}`;
  return `${untrimmed.trim()}\n`;
}
