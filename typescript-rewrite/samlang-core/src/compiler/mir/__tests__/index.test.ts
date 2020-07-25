import { compileHighIrSourcesToMidIRCompilationUnit } from '..';
import ModuleReference from '../../../ast/common/module-reference';
import { HIR_RETURN, HIR_STRING } from '../../../ast/hir/hir-expressions';
import { midIRCompilationUnitToString } from '../../../ast/mir';
import { mapOf } from '../../../util/collections';

it('compileHighIrSourcesToMidIRCompilationUnit empty sources test', () => {
  expect(midIRCompilationUnitToString(compileHighIrSourcesToMidIRCompilationUnit(mapOf()))).toBe(
    '\n'
  );
});

it('compileHighIrSourcesToMidIRCompilationUnit dummy source test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrSourcesToMidIRCompilationUnit(mapOf([ModuleReference.ROOT, { functions: [] }]))
    )
  ).toBe('\n');
});

it('compileHighIrSourcesToMidIRCompilationUnit full integration test', () => {
  expect(
    midIRCompilationUnitToString(
      compileHighIrSourcesToMidIRCompilationUnit(
        mapOf([
          ModuleReference.ROOT,
          {
            functions: [
              {
                name: 'fooBar',
                parameters: ['foo', 'bar', 'baz'],
                hasReturn: true,
                body: [HIR_RETURN(HIR_STRING('hello world'))],
              },
            ],
          },
        ])
      )
    )
  ).toBe(`const GLOBAL_STRING_0 = "hello world";

function fooBar {
  let _foo = _ARG0;
  let _bar = _ARG1;
  let _baz = _ARG2;

  return (GLOBAL_STRING_0 + 8);
}
`);
});
