import compileSamlangSourcesToHighIRSources from '..';
import ModuleReference from '../../../ast/common/module-reference';
import Range from '../../../ast/common/range';
import { unitType, intType, identifierType, functionType } from '../../../ast/common/types';
import { HIR_VARIABLE, HIR_RETURN } from '../../../ast/hir/hir-expressions';
import type { HighIRModule } from '../../../ast/hir/hir-toplevel';
import { EXPRESSION_THIS } from '../../../ast/lang/samlang-expressions';
import type { SamlangModule } from '../../../ast/lang/samlang-toplevel';
import { mapOf } from '../../../util/collections';

const THIS = EXPRESSION_THIS({ range: Range.DUMMY, type: identifierType('Dummy') });
const IR_THIS = HIR_VARIABLE('this');

it('HIR compiler integration test', () => {
  const sourceModule: SamlangModule = {
    imports: [],
    classes: [
      {
        range: Range.DUMMY,
        name: 'Class1',
        nameRange: Range.DUMMY,
        isPublic: false,
        typeParameters: [],
        typeDefinition: {
          range: Range.DUMMY,
          type: 'object',
          names: [],
          mappings: {},
        },
        members: [
          {
            range: Range.DUMMY,
            isPublic: true,
            isMethod: false,
            nameRange: Range.DUMMY,
            name: 'foo',
            typeParameters: [],
            parameters: [
              { name: 'a', nameRange: Range.DUMMY, type: intType, typeRange: Range.DUMMY },
            ],
            type: functionType([intType], intType),
            body: THIS,
          },
          {
            range: Range.DUMMY,
            isPublic: true,
            isMethod: true,
            nameRange: Range.DUMMY,
            name: 'foo',
            typeParameters: [],
            parameters: [
              { name: 'a', nameRange: Range.DUMMY, type: intType, typeRange: Range.DUMMY },
            ],
            type: functionType([intType], unitType),
            body: THIS,
          },
        ],
      },
    ],
  };

  const expectedCompiledModule: HighIRModule = {
    imports: [],
    classDefinitions: [
      {
        className: 'Class1',
        members: [
          {
            isPublic: true,
            name: 'foo',
            hasReturn: true,
            parameters: ['a'],
            body: [HIR_RETURN(IR_THIS)],
          },
          {
            isPublic: true,
            name: 'foo',
            hasReturn: false,
            parameters: ['this', 'a'],
            body: [],
          },
        ],
      },
    ],
  };

  expect(
    compileSamlangSourcesToHighIRSources(mapOf([ModuleReference.ROOT, sourceModule])).get(
      ModuleReference.ROOT
    )
  ).toEqual(expectedCompiledModule);
});
