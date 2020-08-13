import { assertNotNull } from '../../util/type-assertions';
import type Range from '../common/range';
import type {
  AnnotatedParameter,
  ModuleMembersImport,
  TypeDefinition,
  Node,
} from '../common/structs';
import { FunctionType, prettyPrintType } from '../common/types';
import { SamlangExpression, prettyPrintSamlangExpression } from './samlang-expressions';

export interface ClassMemberDeclaration extends Node {
  readonly isPublic: boolean;
  readonly isMethod: boolean;
  readonly nameRange: Range;
  readonly name: string;
  readonly typeParameters: readonly string[];
  readonly type: FunctionType;
  readonly parameters: readonly AnnotatedParameter[];
}

export interface ClassMemberDefinition extends ClassMemberDeclaration {
  readonly body: SamlangExpression;
}

export interface ClassInterface<M extends ClassMemberDeclaration = ClassMemberDeclaration>
  extends Node {
  readonly nameRange: Range;
  readonly name: string;
  readonly isPublic: boolean;
  readonly typeParameters: readonly string[];
  readonly members: readonly M[];
  readonly typeDefinition?: TypeDefinition;
}

export interface ClassDefinition extends ClassInterface<ClassMemberDefinition> {
  readonly typeDefinition: TypeDefinition;
}

export interface SamlangModule {
  readonly imports: readonly ModuleMembersImport[];
  readonly classes: readonly ClassDefinition[];
}

const prettyPrintClassMember = (member: ClassMemberDefinition): string => {
  const memberVisibility = member.isPublic ? '' : 'private ';
  const memberType = member.isMethod ? 'method' : 'function';
  const typeParameterString =
    member.typeParameters.length === 0 ? '' : `<${member.typeParameters.join(', ')}>`;
  const parameters = member.parameters
    .map((annotated) => `${annotated.name}: ${prettyPrintType(annotated.type)}`)
    .join(', ');
  const returnTypeString = prettyPrintType(member.type.returnType);
  return `  ${memberVisibility}${memberType}${typeParameterString} ${
    member.name
  }(${parameters}): ${returnTypeString} =
    ${prettyPrintSamlangExpression(member.body)}
`;
};

const prettyPrintClass = (classDefinition: ClassDefinition): string => {
  // istanbul ignore next
  const privateHeader = classDefinition.isPublic ? '' : 'private ';
  const typeMappings = Object.entries(classDefinition.typeDefinition.mappings);
  if (typeMappings.length === 0) {
    return `${privateHeader}class ${classDefinition.name} {
${classDefinition.members.map(prettyPrintClassMember).join('')}}
`;
  }

  const typeParameterString =
    classDefinition.typeParameters.length === 0
      ? ''
      : `<${classDefinition.typeParameters.join(', ')}>`;
  const typeMappingsString = typeMappings
    .map(([name, type]) => {
      assertNotNull(type);
      if (classDefinition.typeDefinition.type === 'object') {
        // istanbul ignore next
        const modifier = type.isPublic ? '' : 'private ';
        return `${modifier}val ${name}: ${prettyPrintType(type.type)}`;
      }
      return `${name}(${prettyPrintType(type.type)})`;
    })
    .join(', ');
  return `${privateHeader}class ${
    classDefinition.name
  }${typeParameterString}(${typeMappingsString}) {
${classDefinition.members.map(prettyPrintClassMember).join('')}}
`;
};

// istanbul ignore next
const prettyPrintImport = (oneImport: ModuleMembersImport): string => {
  const members = oneImport.importedMembers.map((it) => it[0]).join(', ');
  const importedModule = oneImport.importedModule.parts.join('.');
  return `import { ${members} } from ${importedModule}\n`;
};

export const prettyPrintSamlangModule = (samlangModule: SamlangModule): string => {
  const importsString = samlangModule.imports.map(prettyPrintImport).join('');
  const classesString = samlangModule.classes.map(prettyPrintClass).join('');
  return importsString + classesString;
};
